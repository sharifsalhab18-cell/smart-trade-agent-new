const sessions = {};

const APIFY_URL =
  "https://api.apify.com/v2/acts/lowlanddata~olx-ua-scraper/run-sync-get-dataset-items";

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
      resetSession(chatId);
    }

    const session = sessions[chatId];

    // =========================
    // START
    // =========================

    if (text === "/start") {
      resetSession(chatId);

      await sendTelegram(
        token,
        chatId,
        "Welcome to Smart Trade Agent 🤖\n\n" +
        "Agent connected successfully. Bot ready.\n\n" +
        "استخدم /search لبدء البحث."
      );

      return ok();
    }

    // =========================
    // SEARCH
    // =========================

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

      return ok();
    }

    // =========================
    // PRODUCT
    // =========================

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
        "الآن أرسل أقصى سعر شراء بالـ hryvnia (грн).\n\n" +
        "مثال: 15000"
      );

      return ok();
    }

    // =========================
    // MAX PRICE
    // =========================

    if (session.step === "maxPrice") {
      const price = parseInteger(text);

      if (!price || price <= 0) {
        await sendTelegram(
          token,
          chatId,
          "❌ أرسل سعرًا صحيحًا، مثال: 15000"
        );

        return ok();
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

      return ok();
    }

    // =========================
    // MIN PROFIT
    // =========================

    if (session.step === "minProfit") {
      const profit = parseInteger(text);

      if (!profit || profit <= 0) {
        await sendTelegram(
          token,
          chatId,
          "❌ أرسل ربحًا صحيحًا، مثال: 3000"
        );

        return ok();
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
          formatResults(session, results)
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
          "❌ حدث خطأ أثناء البحث في OLX.ua.\n\n" +
          error.message +
          "\n\n" +
          "استخدم /search لبحث جديد."
        );
      }

      return ok();
    }

    return ok();

  } catch (error) {
    console.error("FUNCTION ERROR:", error);

    return {
      statusCode: 500,
      body: "Internal Server Error"
    };
  }
};


// ======================================
// APIFY
// ======================================

async function searchOLX(
  product,
  maxPrice,
  minProfit,
  apifyToken
) {
  /*
   * Lowland Data expects priceMax in UAH.
   * Output priceKop is in kopiykas.
   */

  const input = {
    searchQuery: product,
    priceMax: maxPrice,
    sortBy: "date",
    maxItems: 25,
    proxyConfiguration: {
      useApifyProxy: true
    }
  };

  console.log(
    "APIFY INPUT:",
    JSON.stringify(input)
  );

  const response = await fetch(
    APIFY_URL +
    "?token=" +
    encodeURIComponent(apifyToken),
    {
      method: "POST",

      headers: {
        "Content-Type": "application/json"
      },

      body: JSON.stringify(input)
    }
  );

  const responseText =
    await response.text();

  if (!response.ok) {
    throw new Error(
      `Apify HTTP ${response.status}: ${responseText}`
    );
  }

  let data;

  try {
    data = JSON.parse(responseText);
  } catch {
    throw new Error(
      "Apify returned invalid JSON."
    );
  }

  if (!Array.isArray(data)) {
    throw new Error(
      "Apify returned an unexpected dataset format."
    );
  }

  console.log(
    "APIFY ITEMS:",
    data.length
  );

  return data
    .map(normalizeListing)
    .filter(item => item.price > 0)
    .filter(item =>
      item.price <= maxPrice
    )
    .filter(item =>
      isRelevantProduct(
        item.title,
        product
      )
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


// ======================================
// NORMALIZE LOWLAND RESULT
// ======================================

function normalizeListing(item) {
  const title =
    item.title ||
    "بدون عنوان";

  /*
   * Lowland Data returns:
   * priceKop = price in 1/100 UAH
   *
   * Example:
   * 500000 = 5000 UAH
   */

  let price = 0;

  if (
    typeof item.priceKop === "number"
  ) {
    price = item.priceKop / 100;
  } else if (
    typeof item.price === "number"
  ) {
    price = item.price;
  } else if (
    item.price
  ) {
    price = parseInteger(
      item.price
    );
  }

  return {
    title,
    price,
    city:
      item.city ||
      "",
    region:
      item.region ||
      "",
    url:
      item.url ||
      ""
  };
}


// ======================================
// PRODUCT MATCH
// ======================================
function isRelevantProduct(title, product) {
  const t =
    String(title || "")
      .toLowerCase();

  const p =
    String(product || "")
      .toLowerCase()
      .trim();

  /*
   * For iPhone searches, require
   * both "iphone" and the model number.
   */

  const words =
    p.split(/\s+/)
      .filter(Boolean);

  if (!words.length) {
    return true;
  }

  return words.every(word =>
    t.includes(word)
  );
}

// ======================================
// NUMBER
// ======================================

function parseInteger(text) {
  const cleaned =
    String(text)
      .replace(/[^\d]/g, "");

  if (!cleaned) {
    return 0;
  }

  const value =
    Number(cleaned);

  return Number.isFinite(value)
    ? value
    : 0;
}


// ======================================
// TELEGRAM
// ======================================

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
      "TELEGRAM ERROR:",
      await response.text()
    );
  }
}


// ======================================
// SESSION
// ======================================

function resetSession(chatId) {
  sessions[chatId] = {
    step: "idle",
    product: "",
    maxPrice: 0,
    minProfit: 0
  };
}


// ======================================
// RESPONSE
// ======================================

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
    "📦 المنتج: " +
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
        `💰 السعر: ${formatPrice(item.price)} грн\n`;

      if (item.city) {
        message +=
          `📍 ${item.city}`;

        if (item.region) {
          message +=
            `، ${item.region}`;
        }

        message += "\n";
      }

      message +=
        `📈 الربح المطلوب: ${formatPrice(item.potentialProfit)} грн\n` +
        `💵 سعر البيع المطلوب: ${formatPrice(item.requiredSellingPrice)} грн\n`;

      if (item.url) {
        message +=
          `🔗 ${item.url}\n`;
      }

      message += "\n";
    }
  );

  message +=
    "استخدم /search لبحث جديد.";

  return message;
}


function formatPrice(value) {
  return Number(value)
    .toLocaleString("en-US", {
      maximumFractionDigits: 0
    });
}


function ok() {
  return {
    statusCode: 200,
    body: "OK"
  };
}