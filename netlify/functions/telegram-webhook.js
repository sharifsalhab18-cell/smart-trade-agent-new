const sessions = {};

const APIFY_ACTOR = "maroon_trio~olx-ua-scraper-parser";

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

    if (!token) {
      return {
        statusCode: 500,
        body: "TELEGRAM_BOT_TOKEN is not configured"
      };
    }

    if (!apifyToken) {
      return {
        statusCode: 500,
        body: "APIFY_API_TOKEN is not configured"
      };
    }

    if (!sessions[chatId]) {
      sessions[chatId] = {
        step: "idle",
        product: "",
        maxPrice: 0,
        minProfit: 0
      };
    }

    const session = sessions[chatId];

    let reply = "";

    if (text === "/start") {
      session.step = "idle";
      session.product = "";
      session.maxPrice = 0;
      session.minProfit = 0;

      reply =
        "Welcome to Smart Trade Agent 🤖\n\n" +
        "Agent connected successfully. Bot ready.\n\n" +
        "استخدم /search لبدء البحث عن فرصة تجارية.";
    }

    else if (text === "/search") {
      session.step = "product";
      session.product = "";
      session.maxPrice = 0;
      session.minProfit = 0;

      reply =
        "🔎 Smart Trade Agent\n\n" +
        "أرسل اسم المنتج الذي تريد البحث عنه.\n\n" +
        "مثال:\n" +
        "iPhone 14";
    }

    else if (session.step === "product") {
      session.product = text;
      session.step = "maxPrice";

      reply =
        "📦 المنتج: " + session.product + "\n\n" +
        "الآن أرسل أقصى سعر شراء تريده بالـ hryvnia (грн).\n\n" +
        "مثال: 15000";
    }

    else if (session.step === "maxPrice") {
      const price = Number(
        text.replace(/[^\d.]/g, "")
      );

      if (!price || price <= 0) {
        reply =
          "❌ أرسل سعرًا صحيحًا، مثال: 15000";
      } else {
        session.maxPrice = price;
        session.step = "minProfit";

        reply =
          "💰 أقصى سعر شراء: " +
          price +
          " грн\n\n" +
          "الآن أرسل أدنى ربح تريده بالـ hryvnia (грн).\n\n" +
          "مثال: 3000";
      }
    }

    else if (session.step === "minProfit") {
      const profit = Number(
        text.replace(/[^\d.]/g, "")
      );

      if (!profit || profit <= 0) {
        reply =
          "❌ أرسل ربحًا صحيحًا، مثال: 3000";
      } else {
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

          reply = formatResults(
            session,
            results
          );

        } catch (error) {
          console.error(
            "OLX SEARCH ERROR:",
            error
          );

          session.step = "ready";

          reply =
            "❌ حدث خطأ أثناء البحث في OLX.ua.\n\n" +
            "الخطأ:\n" +
            error.message;
        }
      }
    }

    else {
      reply =
        "استخدم /search لبدء بحث جديد.";
    }

    if (reply) {
      await sendTelegram(
        token,
        chatId,
        reply
      );
    }

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


/* =========================
   OLX SEARCH
========================= */

async function searchOLX(
  product,
  maxPrice,
  minProfit,
  apifyToken
) {
  const searchUrl =
    "https://www.olx.ua/uk/list/q-" +
    encodeURIComponent(product.trim()) +
    "/";

  console.log(
    "OLX SEARCH URL:",
    searchUrl
  );

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
        url: searchUrl
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
    .filter(item =>
      item.price <= maxPrice
    )
    .map(item => ({
      ...item,
      requiredSellingPrice:
        item.price + minProfit,
      potentialProfit:
        minProfit
    }))
    .slice(0, 10);
}


/* =========================
   NORMALIZE RESULT
========================= */

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


/* =========================
   PRICE
========================= */

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
      .replace(/\s/g, "")
      .replace(",", ".");

  const number =
    Number(cleaned);

  return Number.isFinite(number)
    ? number
    : 0;
}


/* =========================
   TELEGRAM
========================= */

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


/* =========================
   FORMAT RESULTS
========================= */

function formatResults(
  session,
  results
) {
  if (!results.length) {
    return (
      "🔎 نتيجة البحث\n\n" +
      "لم يجد الوكيل إعلانات ضمن أقصى سعر شراء المحدد.\n\n" +
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
  }

  let message =
    "🔎 نتائج البحث الحقيقي في OLX.ua\n\n" +
    "📦 " +
    session.product +
    "\n\n";

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
        `📈 الربح المطلوب: ${item.potentialProfit} грн\n` +
        `💵 سعر البيع المستهدف: ${item.requiredSellingPrice} грн\n`;

      if (item.url) {
        message +=
          `🔗 ${item.url}\n`;
      }

      message += "\n";
    });

  return message;
}