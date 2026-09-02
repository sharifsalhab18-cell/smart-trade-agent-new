const sessions = {};

exports.handler = async (event) => {
  try {
    const body = JSON.parse(event.body || "{}");
    const message = body.message;

    if (!message || !message.chat) {
      return ok();
    }

    const chatId = message.chat.id;
    const text = (message.text || "").trim();
    const token = process.env.TELEGRAM_BOT_TOKEN;

    if (!token) {
      console.error("TELEGRAM_BOT_TOKEN missing");
      return ok();
    }

    if (text === "/start") {
      await sendTelegram(
        token,
        chatId,
        "Welcome to Trade Agent Smart 🤖\n\n" +
        "Agent connected successfully.\n\n" +
        "استخدم /search للبدء."
      );
      return ok();
    }

    if (text === "/search") {
      sessions[chatId] = {
        step: "product"
      };

      await sendTelegram(
        token,
        chatId,
        "🔎 أرسل اسم المنتج الذي تريد البحث عنه.\n\nمثال:\niPhone 14"
      );
      return ok();
    }

    // =========================
    // PRODUCT SEARCH
    // =========================

    if (sessions[chatId]?.step === "product") {
      const product = text;

      sessions[chatId].product = product;
      sessions[chatId].step = "searching";

      await sendTelegram(
        token,
        chatId,
        `⏳ جارٍ البحث عن "${product}" في OLX.ua...`
      );

      const results = await searchApify(product);

      if (!results.length) {
        await sendTelegram(
          token,
          chatId,
          `❌ لم نجد إعلانات للمنتج: ${product}`
        );

        delete sessions[chatId];
        return ok();
      }

      let messageText = `🔎 نتائج البحث عن: ${product}\n\n`;

      results.slice(0, 10).forEach((item, index) => {
        messageText +=
          `${index + 1}. ${item.title || "بدون عنوان"}\n` +
          `💰 ${item.price || "السعر غير معروف"}\n` +
          `${item.url || ""}\n\n`;
      });

      await sendTelegram(token, chatId, messageText);

      delete sessions[chatId];
      return ok();
    }

    await sendTelegram(
      token,
      chatId,
      "استخدم /start أو /search."
    );

    return ok();

  } catch (error) {
    console.error("FUNCTION ERROR:", error);
    return ok();
  }
};


// =========================
// APIFY SEARCH
// =========================

async function searchApify(product) {
  const apiToken = process.env.APIFY_API_TOKEN;

  if (!apiToken) {
    console.error("APIFY_API_TOKEN missing");
    return [];
  }

  const actorId = "maroon_trio/olx-ua-scraper-parser";

  const input = {
    search: product,
    maxItems: 10,
    proxyConfiguration: {
      useApifyProxy: true
    }
  };

  const url =
    `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items` +
    `?token=${apiToken}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(input)
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("APIFY ERROR:", errorText);
    return [];
  }

  const data = await response.json();

  console.log("APIFY RESULTS:", JSON.stringify(data));

  return Array.isArray(data) ? data : [];
}


// =========================
// TELEGRAM
// =========================

async function sendTelegram(token, chatId, text) {
  const url =
    `https://api.telegram.org/bot${token}/sendMessage`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      chat_id: chatId,
      text: text
    })
  });

  const result = await response.text();

  console.log("TELEGRAM RESPONSE:", result);
}


// =========================
// OK
// =========================

function ok() {
  return {
    statusCode: 200,
    body: "OK"
  };
}