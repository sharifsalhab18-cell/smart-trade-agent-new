const sessions = {};

const APIFY_ACTOR = 
heady_impediment~olx-ua-scraper
const APIFY_URL =
  `https://api.apify.com/v2/acts/${APIFY_ACTOR}/run-sync-get-dataset-items`;

exports.handler = async (event) => {
  try {
    const body = JSON.parse(event.body || "{}");
    const message = body.message;

    if (!message || !message.chat) {
      return { statusCode: 200, body: "OK" };
    }

    const chatId = message.chat.id;
    const text = (message.text || "").trim();

    const token = process.env.TELEGRAM_BOT_TOKEN;
    const apifyToken = process.env.APIFY_API_TOKEN;

    if (!token || !apifyToken) {
      return {
        statusCode: 500,
        body: "Required environment variable is missing"
      };
    }

    if (!sessions[chatId]) {
      resetSession(chatId);
    }

    const session = sessions[chatId];

    // ==============================
    // START
    // ==============================

    if (text === "/start") {
      resetSession(chatId);

      await sendTelegram(
        token,
        chatId,
        "Welcome to Smart Trade Agent 🤖\n\n" +
        "Agent connected successfully. Bot ready.\n\n" +
        "استخدم /search لبدء البحث."
      );

      return {
        statusCode: 200,
        body: "OK"
      };
    }

    // ==============================
    // NEW SEARCH
    // ==============================

    if (text === "/search") {
      resetSession(chatId);

      await sendTelegram(
        token,
        chatId,
        "🔎 Smart Trade Agent\n\n" +
        "أرسل اسم المنتج الذي تريد البحث عنه.\n\n" +
        "مثال:\n" +
        "iPhone 14"
      );

      return {
        statusCode: 200,
        body: "OK"
      };
    }

    // ==============================
    // PRODUCT
    // ==============================

    if (
      session.step === "idle" ||
      session.step === "ready"
    ) {
      session.product = text;
      session.step = "maxPrice";

      await sendTelegram(
        token,
        chatId,
        "📦 المنتج: " +
        session.product +
        "\n\n" +
        "الآن أرسل أقصى سعر شراء تريده بالـ hryvnia (грн).\n\n" +
        "مثال: 15000"
      );

      return {
        statusCode: 200,
        body: "OK"
      };
    }

    // ==============================
    // MAX PRICE
    // ==============================

    if (session.step === "maxPrice") {
      const price = parseNumber(text);

      if (!price || price <= 0) {
        await sendTelegram(
          token,
          chatId,
          "❌ أرسل سعرًا صحيحًا، مثال: 15000"
        );

        return {
          statusCode: 200,
          body: "OK"
        };
      }

      session.maxPrice = price;
      session.step = "minProfit";

      await sendTelegram(
        token,
        chatId,
        "💰 أقصى سعر شراء: " +
        price +
        " грн\n\n" +
        "الآن أرسل أدنى ربح تريده بالـ hryvnia (грн).\n\n" +
        "مثال: 3000"
      );

      return {
        statusCode: 200,
        body: "OK"
      };
    }

    // ==============================
    // MIN PROFIT + SEARCH
    // ==============================

    if (session.step === "minProfit") {
      const profit = parseNumber(text);

      if (!profit || profit <= 0) {
        await sendTelegram(
          token,
          chatId,
          "❌ أرسل ربحًا صحيحًا، مثال: 3000"
        );

        return {
          statusCode: 200,
          body: "OK"
        };
      }

      session.minProfit = profit;
      session.step = "searching";

      await sendTelegram(
        token,
        chatId,
        "⏳ بدأ البحث الحقيقي في OLX.ua...\n\n" +
        "📦 المنتج: " +
        session.product +
        "\n" +
        "💰 أقصى شراء: " +
        session.maxPrice +
        " грн\n" +
        "📈 أدنى ربح: " +
        session.minProfit +
        " грн"
      );

      try {
        const results = await searchOLX(
          session.product,
          session.maxPrice,
          session.minProfit,
          apifyToken
        );

        session.step = "ready";

        await sendTelegram(
          token,
          chatId,
          formatResults(
            session,
            results
          )
        );

      } catch (error) {
        console.error(
          "OLX SEARCH ERROR:",
          error
        );

        session.step = "ready";

        await sendTelegram(
          token,
          chatId,
          "❌ حدث خطأ أثناء البحث.\n\n" +
          error.message +
          "\n\n" +
          "استخدم /search لبدء بحث جديد."
        );
      }

      return {
        statusCode: 200,
        body: "OK"
      };
    }

    // ==============================
    // FALLBACK
    // ==============================

    await sendTelegram(
      token,
      chatId,
      "استخدم /search لبدء بحث جديد."
    );

    return {
      statusCode: 200,
      body: "OK"
    };

  } catch (error) {
    console.error(error);

    return {
      statusCode: 500,
      body: "Internal Server Error"
    };
  }
};


// ========================================
// RESET SESSION
// ========================================

function resetSession(chatId) {
  sessions[chatId] = {
    step: "idle",
    product: "",
    maxPrice: 0,
    minProfit: 0
  };
}


// ========================================
// APIFY SEARCH
// ========================================

async function searchOLX(
  product,
  maxPrice,
  minProfit,
  apifyToken
) {
  const response = await fetch(
    APIFY_URL,
    {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
        "Authorization":
          `Bearer ${apifyToken}`
      },

      body: JSON.stringify({
        searchQuery: product,
        maxItems: 25,
        sortBy: "date",
        proxyConfiguration: {
          useApifyProxy: true
        }
      })
    }
  );

  if (!response.ok) {
    const errorText =
      await response.text();

    throw new Error(
      `Apify HTTP ${response.status}: ${errorText}`
    );
  }

  const data =
    await response.json();

  if (!Array.isArray(data)) {
    throw new Error(
      "Apify returned an unexpected response."
    );
  }

  return data
    .map(normalizeListing)
    .filter(item => item.price > 0)
    .map(item => ({
      ...item,
      potentialProfit: minProfit,
      requiredSellingPrice:
        item.price + minProfit
    }))
    .slice(0, 10);
}


// ========================================
// PRODUCT RELEVANCE
// ========================================

function isRelevantProduct(
  title,
  product
) {
  const t =
    String(title || "").toLowerCase();

  const p =
    String(product || "").toLowerCase();

  const words =
    p.split(/\s+/).filter(Boolean);

  if (!words.length) {
    return true;
  }

  return words.every(word =>
    t.includes(word)
  );
}


// ========================================
// NORMALIZE
// ========================================

function normalizeListing(item) {
  const title =
    item.title ||
    item.name ||
    item.heading ||
    "بدون عنوان";

  const price =
    extractPrice(
      item.price ||
      item.priceValue ||
      item.cost
    );

  const location =
    item.location ||
    item.city ||
    item.region ||
    "";

  const url =
    item.url ||
    item.link ||
    item.adUrl ||
    item.href ||
    "";

  return {
    title,
    price,
    location,
    url
  };
}


// ========================================
// PRICE
// ========================================

function extractPrice(value) {
  if (typeof value === "number") {
    return value;
  }

  if (!value) {
    return 0;
  }

  const cleaned =
    String(value)
      .replace(/[^\d.,]/g, "")
      .replace(/\s/g, "");

  if (!cleaned) {
    return 0;
  }

  // Ukrainian-style decimal/comma handling
  const parts =
    cleaned.split(",");

  let number;

  if (parts.length > 1) {
    const last =
      parts[parts.length - 1];

    if (last.length === 2) {
      number =
        Number(
          parts
            .slice(0, -1)
            .join("") +
          "." +
          last
        );
    } else {
      number =
        Number(
          parts.join("")
        );
    }
  } else {
    number =
      Number(
        cleaned.replace(/\./g, "")
      );
  }

  return Number.isFinite(number)
    ? number
    : 0;
}


function parseNumber(text) {
  const value =
    String(text)
      .replace(/[^\d.,]/g, "")
      .replace(",", ".");

  return Number(value);
}


// ========================================
// TELEGRAM
// ========================================

async function sendTelegram(
  token,
  chatId,
  text
) {
  const response =
    await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json"
        },

        body: JSON.stringify({
          chat_id: chatId,
          text
        })
      }
    );

  if (!response.ok) {
    console.error(
      "Telegram error:",
      await response.text()
    );
  }
}


// ========================================
// RESULTS
// ========================================

function formatResults(
  session,
  results
) {
  if (!results.length) {
    return (
      "🔎 نتيجة البحث\n\n" +
      "لم يجد الوكيل إعلانات مطابقة ضمن أقصى سعر شراء المحدد.\n\n" +
      "📦 المنتج: " +
      session.product +
      "\n" +
      "💰 أقصى شراء: " +
      session.maxPrice +
      " грн\n" +
      "📈 أدنى ربح: " +
      session.minProfit +
      " грн\n\n" +
      "استخدم /search لبحث جديد."
    );
  }

  let message =
    "🔎 نتائج البحث الحقيقي في OLX.ua\n\n" +
    "📦 " +
    session.product +
    "\n" +
    "💰 أقصى شراء: " +
    session.maxPrice +
    " грн\n" +
    "📈 أدنى ربح: " +
    session.minProfit +
    " грн\n\n";

  results.forEach(
    (item, index) => {
      message +=
        `${index + 1}. ${item.title}\n` +
        `💰 السعر: ${item.price} грн\n`;

      if (item.location) {
        message +=
          `📍 ${item.location}\n`;
      }

      message +=
        `📈 الربح المستهدف: ${item.potentialProfit} грн\n` +
        `💵 سعر البيع المستهدف: ${item.requiredSellingPrice} грн\n`;

      if (item.url) {
        message +=
          `🔗 ${item.url}\n`;
      }

      message += "\n";
    });

  message +=
    "🔎 أرسل /search لبدء بحث جديد.";

  return message;
}