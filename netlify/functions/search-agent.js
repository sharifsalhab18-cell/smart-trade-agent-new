const sessions = {};

const APIFY_ACTOR =
  "maroon_trio~olx-ua-scraper-parser";

const APIFY_URL =
  `https://api.apify.com/v2/acts/${APIFY_ACTOR}/run-sync-get-dataset-items`;

exports.handler = async (event) => {
  try {
    const body = JSON.parse(event.body || "{}");

    const token = process.env.TELEGRAM_BOT_TOKEN;
    const apifyToken = process.env.APIFY_API_TOKEN;

    if (!apifyToken) {
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: "APIFY_API_TOKEN is not configured"
        })
      };
    }

    /*
     * =========================================================
     * 1. WEB / INDEX.HTML REQUEST
     * =========================================================
     */

    if (body.product) {
      const product = String(body.product).trim();
      const maxPrice = Number(body.maxPrice);
      const minProfit = Number(body.minProfit);
      const region = String(body.region || "Україна").trim();

      if (!product || maxPrice <= 0 || minProfit <= 0) {
        return {
          statusCode: 400,
          body: JSON.stringify({
            error:
              "Product, maxPrice and minProfit are required."
          })
        };
      }

      const results = await searchOLX({
        product,
        maxPrice,
        minProfit
      });

      return {
        statusCode: 200,
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          ok: true,
          product,
          maxPrice,
          minProfit,
          region,
          count: results.length,
          results
        })
      };
    }

    /*
     * =========================================================
     * 2. TELEGRAM REQUEST
     * =========================================================
     */

    const message = body.message;

    if (!message || !message.chat) {
      return {
        statusCode: 200,
        body: "OK"
      };
    }

    if (!token) {
      return {
        statusCode: 500,
        body: "TELEGRAM_BOT_TOKEN is not configured"
      };
    }

    const chatId = message.chat.id;
    const text = (message.text || "").trim();

    if (!sessions[chatId]) {
      sessions[chatId] = {
        step: "idle",
        product: "",
        maxPrice: 0,
        minProfit: 0
      };
    }

    const session = sessions[chatId];

    /*
     * =========================================================
     * /start
     * =========================================================
     */

    if (text === "/start") {
      session.step = "idle";
      session.product = "";
      session.maxPrice = 0;
      session.minProfit = 0;

      await sendTelegram(
        token,
        chatId,
        "Welcome to Smart Trade Agent 🤖\n\n" +
        "Agent connected successfully.\n\n" +
        "Use /search to start a real product search."
      );

      return {
        statusCode: 200,
        body: "OK"
      };
    }

    /*
     * =========================================================
     * /search
     * =========================================================
     */

    if (text === "/search") {
      session.step = "product";
      session.product = "";
      session.maxPrice = 0;
      session.minProfit = 0;

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

    /*
     * =========================================================
     * PRODUCT
     * =========================================================
     */

    if (session.step === "product") {
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

    /*
     * =========================================================
     * MAX PRICE
     * =========================================================
     */

    if (session.step === "maxPrice") {
      const price = Number(
        text.replace(/[^\d.]/g, "")
      );

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

    /*
     * =========================================================
     * MIN PROFIT -> REAL SEARCH
     * =========================================================
     */

    if (session.step === "minProfit") {
      const profit = Number(
        text.replace(/[^\d.]/g, "")
      );

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
        "⏳ الوكيل بدأ البحث الحقيقي في OLX.ua...\n\n" +
        "📦 " +
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
        const results = await searchOLX({
          product: session.product,
          maxPrice: session.maxPrice,
          minProfit: session.minProfit
        });

        session.step = "ready";

        const reply = formatTelegramResults(
          session,
          results
        );

        await sendTelegram(
          token,
          chatId,
          reply
        );
      } catch (searchError) {
        console.error(
          "OLX SEARCH ERROR:",
          searchError
        );

        session.step = "ready";

        await sendTelegram(
          token,
          chatId,
          "❌ حدث خطأ أثناء البحث في OLX.ua.\n\n" +
          "تم تسجيل الخطأ، ويمكننا إصلاحه في الخطوة التالية."
        );
      }

      return {
        statusCode: 200,
        body: "OK"
      };
    }

    /*
     * =========================================================
     * DEFAULT
     * =========================================================
     */

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


/*
 * =============================================================
 * REAL OLX SEARCH THROUGH APIFY
 * =============================================================
 */

async function searchOLX({
  product,
  maxPrice,
  minProfit
}) {
  const searchUrl =
    buildOLXSearchUrl(product);

  console.log(
    "OLX SEARCH URL:",
    searchUrl
  );

  const response = await fetch(
    `${APIFY_URL}?waitForFinish=120`,
    {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
        "Authorization":
          `Bearer ${process.env.APIFY_API_TOKEN}`
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
      `Apify error ${response.status}: ${errorText}`
    );
  }

  const data =
    await response.json();

  if (!Array.isArray(data)) {
    console.log(
      "Unexpected Apify response:",
      data
    );

    return [];
  }

  /*
   * Filter the returned OLX listings
   * according to the user's maximum purchase price.
   */

  const filtered =
    data
      .map(normalizeListing)
      .filter(item => item.price > 0)
      .filter(item =>
        item.price <= maxPrice
      );

  /*
   * Calculate the theoretical profit.
   *
   * We don't invent a selling price.
   * For now, the opportunity is based on
   * the difference between the user's
   * maximum purchase budget and the
   * required minimum profit.
   */

  return filtered
    .map(item => ({
      ...item,
      requiredSellingPrice:
        item.price + minProfit,
      potentialProfit:
        minProfit
    }))
    .slice(0, 10);
}


/*
 * =============================================================
 * BUILD OLX SEARCH URL
 * =============================================================
 */

function buildOLXSearchUrl(product) {
  const query =
    encodeURIComponent(
      product.trim()
    );

  return (
    "https://www.olx.ua/uk/list/q-" +
    query +
    "/"
  );
}


/*
 * =============================================================
 * NORMALIZE OLX RESULT
 * =============================================================
 */

function normalizeListing(item) {
  const title =
    item.title ||
    item.name ||
    item.heading ||
    "Без назви";

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

  const description =
    item.description ||
    "";

  return {
    title,
    price,
    location,
    url,
    description
  };
}


/*
 * =============================================================
 * PRICE PARSER
 * =============================================================
 */

function extractPrice(value) {
  if (
    typeof value === "number"
  ) {
    return value;
  }

  if (!value) {
    return 0;
  }

  /*
   * Some OLX scrapers return strings
   * such as:
   *
   * "15 000 грн"
   * "15000"
   */

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


/*
 * =============================================================
 * TELEGRAM SENDER
 * =============================================================
 */

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
    const error =
      await response.text();

    console.error(
      "Telegram error:",
      error
    );
  }
}


/*
 * =============================================================
 * TELEGRAM RESULTS
 * =============================================================
 */

function formatTelegramResults(
  session,
  results
) {
  if (!results.length) {
    return (
      "🔎 نتيجة البحث\n\n" +
      "لم يجد الوكيل حاليًا إعلانات ضمن أقصى سعر شراء المحدد.\n\n" +
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
    "🔎 فرص OLX.ua\n\n" +
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
        `📈 الربح المطلوب: ${item.potentialProfit} грн\n` +
        `💵 سعر البيع المطلوب: ${item.requiredSellingPrice} грн\n`;

      if (item.url) {
        message +=
          `🔗 ${item.url}\n`;
      }

      message += "\n";
    });

  return message;
}