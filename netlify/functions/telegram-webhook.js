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

    // =========================
    // START
    // =========================

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

    // =========================
    // SEARCH
    // =========================

    if (text === "/search") {
      sessions[chatId] = {
        step: "product"
      };

      await sendTelegram(
        token,
        chatId,
        "🔎 أرسل اسم المنتج الذي تريد البحث عنه.\n\n" +
        "مثال:\n" +
        "iPhone 14"
      );

      return ok();
    }

    // =========================
    // PRODUCT
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

      let resultMessage =
        `🔎 نتائج البحث عن: ${product}\n\n`;

      results.slice(0, 10).forEach((item, index) => {
        const title =
          item.title ||
          item.name ||
          "بدون عنوان";

        const price =
          item.price ||
          item.priceText ||
          item.cost ||
          "السعر غير معروف";

        const url =
          item.url ||
          item.link ||
          item.itemUrl ||
          "";

        resultMessage +=
          `${index + 1}. ${title}\n` +
          `💰 ${price}\n` +
          `${url}\n\n`;
      });

      await sendTelegram(
        token,
        chatId,
        resultMessage
      );

      delete sessions[chatId];

      return ok();
    }

    // =========================
    // DEFAULT
    // =========================

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

  const actorId =
    "lowlanddata~olx-ua-scraper";

  const apiUrl =
    `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items` +
    `?token=${encodeURIComponent(apiToken)}`;

  const input = {
    searchQuery: product,
    maxItems: 10,
    proxyConfiguration: {
      useApifyProxy: true
    }
  };

  console.log(
    "APIFY INPUT:",
    JSON.stringify(input)
  );

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(input)
  });

  const responseText = await response.text();

  console.log(
    "APIFY STATUS:",
    response.status
  );

  console.log(
    "APIFY RESPONSE:",
    responseText
  );

  if (!response.ok) {
    console.error(
      "APIFY ERROR:",
      responseText
    );

    return [];
  }

  try {
    const data = JSON.parse(responseText);

    return Array.isArray(data)
      ? data
      : [];

  } catch (error) {
    console.error(
      "APIFY JSON ERROR:",
      error
    );

    return [];
  }
}


// =========================
// TELEGRAM
// =========================

async function sendTelegram(
  token,
  chatId,
  text
) {
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

  console.log(
    "TELEGRAM RESPONSE:",
    result
  );
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