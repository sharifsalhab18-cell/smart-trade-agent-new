// ======================================================
// TRADE AGENT SMART
// TELEGRAM WEBHOOK
// ======================================================

const { getStore } = require("@netlify/blobs");

// ------------------------------------------------------
// Netlify Blobs
// ------------------------------------------------------

const sessionsStore = getStore(
  "trade-agent-sessions",
  {
    consistency: "strong",
  }
);

// ------------------------------------------------------
// Telegram
// ------------------------------------------------------

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
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      chat_id: chatId,
      text: String(text || ""),
      disable_web_page_preview: true,
    }),
  });

  const result = await response.text();

  console.log(
    "TELEGRAM RESPONSE:",
    result
  );

  return result;
}

// ------------------------------------------------------
// Session
// ------------------------------------------------------

function emptySession() {
  return {
    step: "idle",
    purchaseRequests: [],
    selectedRequest: null,
    selectedNumber: null,
    updatedAt: Date.now(),
  };
}

async function getSession(chatId) {
  const key = `chat-${chatId}`;

  const session =
    await sessionsStore.get(
      key,
      {
        type: "json",
        consistency: "strong",
      }
    );

  if (!session) {
    return emptySession();
  }

  return session;
}

async function saveSession(
  chatId,
  session
) {
  session.updatedAt = Date.now();

  await sessionsStore.setJSON(
    `chat-${chatId}`,
    session
  );
}

async function resetSession(chatId) {
  const session =
    emptySession();

  await saveSession(
    chatId,
    session
  );

  return session;
}

// ------------------------------------------------------
// Start background search
// ------------------------------------------------------

async function startBackgroundSearch(
  chatId,
  mode,
  request
) {
  const siteUrl =
    process.env.URL ||
    process.env.DEPLOY_PRIME_URL;

  if (!siteUrl) {
    throw new Error(
      "Netlify site URL is not available."
    );
  }

  const url =
    `${siteUrl}/.netlify/functions/olx-search-background`;

  console.log(
    "BACKGROUND REQUEST:",
    JSON.stringify({
      chatId,
      mode,
      request,
    })
  );

  const response = await fetch(
    url,
    {
      method: "POST",
      headers: {
        "Content-Type":
          "application/json",
      },
      body: JSON.stringify({
        chatId,
        mode,
        request:
          request || null,
      }),
    }
  );

  const text =
    await response.text();

  console.log(
    "BACKGROUND RESPONSE:",
    response.status,
    text
  );

  if (!response.ok) {
    throw new Error(
      `Background search failed: ${response.status}`
    );
  }

  return true;
}

// ------------------------------------------------------
// Format selected purchase request
// ------------------------------------------------------

function formatPurchaseRequest(
  item,
  number
) {
  const title =
    item.title ||
    item.name ||
    item.product ||
    "غير محدد";

  const product =
    item.normalizedProduct ||
    "";

  const description =
    item.description ||
    item.text ||
    item.details ||
    "";

  const price =
    item.price ||
    item.priceText ||
    "";

  const location =
    item.location ||
    item.city ||
    item.region ||
    "";

  const requester =
    item.requester ||
    item.seller ||
    item.author ||
    item.user ||
    "";

  const date =
    item.date ||
    item.postedAt ||
    item.createdAt ||
    "";

  const url =
    item.url ||
    item.link ||
    item.webUrl ||
    "";

  let text =
    `${number}️⃣ ${title}\n`;

  if (product) {
    text +=
      `📦 الصنف: ${product}\n`;
  }

  if (location) {
    text +=
      `📍 الموقع: ${location}\n`;
  }

  if (price) {
    text +=
      `💰 السعر المذكور: ${price}\n`;
  }

  if (requester) {
    text +=
      `👤 صاحب الطلب: ${requester}\n`;
  }

  if (date) {
    text +=
      `📅 التاريخ: ${date}\n`;
  }

  if (description) {
    text +=
      `📝 الطلب:\n${description}\n`;
  }

  if (url) {
    text +=
      `🔗 ${url}\n`;
  }

  return text;
}

// ------------------------------------------------------
// Main Telegram handler
// ------------------------------------------------------

exports.handler = async function (
  event
) {
  const token =
    process.env.TELEGRAM_BOT_TOKEN;

  if (!token) {
    console.error(
      "TELEGRAM_BOT_TOKEN missing."
    );

    return {
      statusCode: 500,
      body:
        "TELEGRAM_BOT_TOKEN missing",
    };
  }

  try {
    if (
      event.httpMethod &&
      event.httpMethod !== "POST"
    ) {
      return {
        statusCode: 200,
        body: "OK",
      };
    }

    const update =
      JSON.parse(
        event.body || "{}"
      );

    if (!update.message) {
      return {
        statusCode: 200,
        body: "OK",
      };
    }

    const chatId =
      update.message.chat.id;

    const text =
      String(
        update.message.text || ""
      ).trim();

    console.log(
      "TELEGRAM MESSAGE:",
      chatId,
      text
    );

    let session =
      await getSession(chatId);

    // --------------------------------------------------
    // /start
    // --------------------------------------------------

    if (
      text === "/start" ||
      text === "ابدأ"
    ) {
      session =
        await resetSession(
          chatId
        );

      await sendTelegram(
        token,
        chatId,
        "🤖 Trade Agent Smart\n\n" +
        "وكيل تجهيز الصفقات\n\n" +
        "🔎 البحث عن طلبات شراء من OLX\n" +
        "🔢 اختيار الطلب المطلوب\n" +
        "🛒 البحث عن بائع للصنف المختار\n\n" +
        "لبدء البحث أرسل:\n" +
        "/search"
      );

      return {
        statusCode: 200,
        body: "OK",
      };
    }

    // --------------------------------------------------
    // /cancel
    // --------------------------------------------------

    if (
      text === "/cancel" ||
      text === "إلغاء" ||
      text === "الغاء"
    ) {
      await resetSession(
        chatId
      );

      await sendTelegram(
        token,
        chatId,
        "🛑 تم إلغاء العملية الحالية.\n\n" +
        "يمكنك البدء من جديد بإرسال:\n" +
        "/search"
      );

      return {
        statusCode: 200,
        body: "OK",
      };
    }

    // --------------------------------------------------
    // SEARCH PURCHASE REQUESTS
    // --------------------------------------------------

    if (
      text === "/search" ||
      text === "بحث" ||
      text === "طلبات الشراء" ||
      text === "بحث عن طلبات الشراء"
    ) {
      session =
        await resetSession(
          chatId
        );

      session.step =
        "searchingPurchaseRequests";

      await saveSession(
        chatId,
        session
      );

      await sendTelegram(
        token,
        chatId,
        "🔎 بدأ البحث عن طلبات الشراء في OLX.\n\n" +
        "سيبحث الوكيل عن الأشخاص الذين يريدون شراء:\n\n" +
        "📱 iPhone 12 وما فوق\n" +
        "📱 Samsung Galaxy S21 وما فوق\n" +
        "🎮 PlayStation 5\n" +
        "💻 MacBook\n" +
        "💻 Gaming Laptop\n\n" +
        "⚠️ البحث هنا عن طلبات الشراء، وليس عن إعلانات البيع.\n\n" +
        "⏳ بدأ البحث في الخلفية..."
      );

      try {
        await startBackgroundSearch(
          chatId,
          "purchaseRequests",
          null
        );
      } catch (error) {
        console.error(
          "PURCHASE BACKGROUND ERROR:",
          error
        );

        session.step =
          "idle";

        await saveSession(
          chatId,
          session
        );

        await sendTelegram(
          token,
          chatId,
          "❌ تعذر بدء البحث.\n\n" +
          error.message
        );
      }

      return {
        statusCode: 200,
        body: "OK",
      };
    }

    // --------------------------------------------------
    // USER SELECTS A PURCHASE REQUEST
    // --------------------------------------------------

    if (
      session.step ===
      "waitingForSelection"
    ) {
      const number =
        Number(text);

      if (
        !Number.isInteger(number) ||
        number < 1 ||
        number >
          session.purchaseRequests.length
      ) {
        await sendTelegram(
          token,
          chatId,
          "⚠️ أرسل رقمًا صحيحًا من قائمة طلبات الشراء."
        );

        return {
          statusCode: 200,
          body: "OK",
        };
      }

      const selected =
        session.purchaseRequests[
          number - 1
        ];

      session.selectedNumber =
        number;

      session.selectedRequest =
        selected;

      session.step =
        "waitingForSellerCommand";

      await saveSession(
        chatId,
        session
      );

      await sendTelegram(
        token,
        chatId,
        "✅ تم اختيار طلب الشراء رقم " +
          number +
          "\n\n" +
          formatPurchaseRequest(
            selected,
            number
          ) +
          "\n━━━━━━━━━━━━━━\n\n" +
          "📌 الطلب محفوظ.\n\n" +
          "إذا أردت البحث عن بائع لهذا الطلب أرسل:\n\n" +
          "🔎 ابحث عن بائع"
      );

      return {
        statusCode: 200,
        body: "OK",
      };
    }

    // --------------------------------------------------
    // SEARCH SELLER
    // --------------------------------------------------

    if (
      session.step ===
      "waitingForSellerCommand"
    ) {
      const sellerCommand =
        text === "ابحث عن بائع" ||
        text === "بحث عن بائع" ||
        text === "بائع" ||
        text === "/seller";

      if (sellerCommand) {
        if (
          !session.selectedRequest
        ) {
          await sendTelegram(
            token,
            chatId,
            "⚠️ لا يوجد طلب شراء محدد.\n\n" +
            "ابدأ البحث من جديد بإرسال:\n" +
            "/search"
          );

          return {
            statusCode: 200,
            body: "OK",
          };
        }

        session.step =
          "searchingSeller";

        await saveSession(
          chatId,
          session
        );

        const selected =
          session.selectedRequest;

        const product =
          selected.requestSearchProduct ||
          selected.exactProduct ||
          selected.title ||
          selected.normalizedProduct ||
          "الصنف المطلوب";

        await sendTelegram(
          token,
          chatId,
          "🔎 بدأ البحث عن بائع.\n\n" +
          "📦 الصنف المطلوب:\n" +
          product +
          "\n\n" +
          "📍 المصدر: OLX\n\n" +
          "⏳ انتظر النتائج..."
        );

        try {
          await startBackgroundSearch(
            chatId,
            "seller",
            selected
          );
        } catch (error) {
          console.error(
            "SELLER BACKGROUND ERROR:",
            error
          );

          session.step =
            "waitingForSellerCommand";

          await saveSession(
            chatId,
            session
          );

          await sendTelegram(
            token,
            chatId,
            "❌ تعذر بدء بحث البائع.\n\n" +
            error.message
          );
        }

        return {
          statusCode: 200,
          body: "OK",
        };
      }
    }

    // --------------------------------------------------
    // DEFAULT
    // --------------------------------------------------

    await sendTelegram(
      token,
      chatId,
      "ℹ️ الأمر غير معروف.\n\n" +
      "لبدء البحث عن طلبات الشراء أرسل:\n" +
      "/search\n\n" +
      "ولإلغاء العملية الحالية أرسل:\n" +
      "/cancel"
    );

    return {
      statusCode: 200,
      body: "OK",
    };

  } catch (error) {
    console.error(
      "TELEGRAM WEBHOOK ERROR:",
      error
    );

    // Telegram يجب أن يحصل على 200
    // حتى لا يعيد إرسال نفس التحديث.
    return {
      statusCode: 200,
      body: "OK",
    };
  }
};