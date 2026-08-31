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
// SELECT DEAL
// =========================

if (session.step === "selectDeal") {
  const number = parseInteger(text);

  if (
    !number ||
    !session.results ||
    !session.results[number - 1]
  ) {
    await sendTelegram(
      token,
      chatId,
      "❌ أرسل رقم صفقة صحيح من القائمة."
    );

    return ok();
  }

  session.selectedDeal =
    session.results[number - 1];

  session.step = "ready";

  await sendTelegram(
    token,
    chatId,
    "✅ تم اختيار الصفقة رقم " +
    number +
    "\n\n" +
    "📦 " +
    session.selectedDeal.title +
    "\n" +
    "💰 سعر الشراء: " +
    formatPrice(session.selectedDeal.price) +
    " грн\n" +
    "📈 الربح: " +
    formatPrice(session.selectedDeal.potentialProfit) +
    " грн\n" +
    "💵 سعر البيع: " +
    formatPrice(session.selectedDeal.requiredSellingPrice) +
    " грн\n\n" +
    "🤝 أرسل /buyers للبحث عن زبون لهذه الصفقة."
  );

  return ok();
}
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
    // BUYER SEARCH
    // =========================

    if (text === "/buyers") {

      if (!session.product) {
        await sendTelegram(
          token,
          chatId,
          "❌ لا توجد صفقة محفوظة.\n\n" +
          "استخدم /search أولًا."
        );

        return ok();
      }

      session.step = "findingBuyers";

      await sendTelegram(
        token,
        chatId,
        "🔎 البحث عن زبائن محتملين...\n\n" +
        "📦 المنتج: " +
        session.product +
        "\n" +
        "💵 سعر البيع المقترح: " +
        formatPrice(
          session.bestSellingPrice || 0
        ) +
        " грн\n\n" +
        "⏳ يبحث الوكيل في الإعلانات العامة..."
      );

      try {
        const buyers =
          await searchPotentialBuyers(
            session.product,
            apifyToken
          );

        session.step = "ready";

        await sendTelegram(
          token,
          chatId,
          formatBuyerResults(
            session,
            buyers
          )
        );

      } catch (error) {

        console.error(
          "BUYER SEARCH ERROR:",
          error
        );

        session.step = "ready";

        await sendTelegram(
          token,
          chatId,
          "❌ حدث خطأ أثناء البحث عن الزبائن.\n\n" +
          error.message
        );
      }

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
        formatPrice(price) +
        " грн\n\n" +
        "الآن أرسل نسبة الربح المطلوبة.\n\n" +
        "النسبة يجب أن تكون بين 15% و20%.\n\n" +
        "مثال: 15"
      );

      return ok();
    }

    // =========================
    // PROFIT PERCENTAGE
    // =========================

    if (session.step === "minProfit") {

      const profitPercent =
        parseInteger(text);

      if (
        !profitPercent ||
        profitPercent < 15 ||
        profitPercent > 20
      ) {
        await sendTelegram(
          token,
          chatId,
          "❌ أرسل نسبة صحيحة بين 15% و20%.\n\n" +
          "مثال: 15"
        );

        return ok();
      }

      session.profitPercent =
        profitPercent;

      session.step = "searching";

      await sendTelegram(
        token,
        chatId,
        "⏳ بدأ البحث الحقيقي في OLX.ua...\n\n" +
        "📦 المنتج: " +
        session.product +
        "\n" +
        "💰 أقصى شراء: " +
        formatPrice(session.maxPrice) +
        " грн\n" +
        "📈 نسبة الربح: " +
        session.profitPercent +
        "%"
      );

      try {

        const results =
          await searchOLX(
            session.product,
            session.maxPrice,
            session.profitPercent,
            apifyToken
          );

        session.results = results;
session.step = "selectDeal";
        if (results.length) {

          session.bestDeal =
            results[0];

          session.bestSellingPrice =
            results[0].requiredSellingPrice;

          session.lastResults =
            results;
        }

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

    console.error(
      "FUNCTION ERROR:",
      error
    );

    return {
      statusCode: 500,
      body: "Internal Server Error"
    };
  }
};


// ======================================
// SEARCH OLX
// ======================================

async function searchOLX(
  product,
  maxPrice,
  profitPercent,
  apifyToken
) {

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

  const response =
    await fetch(
      APIFY_URL +
      "?token=" +
      encodeURIComponent(
        apifyToken
      ),
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json"
        },

        body:
          JSON.stringify(input)
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

    data =
      JSON.parse(responseText);

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

    .filter(
      item => item.price > 0
    )

    .filter(
      item =>
        item.price <= maxPrice
    )

    .filter(
      item =>
        isRelevantProduct(
          item.title,
          product
        )
    )

    .map(item => {

      const potentialProfit =
        Math.round(
          item.price *
          profitPercent /
          100
        );

      const requiredSellingPrice =
        item.price +
        potentialProfit;

      return {

        ...item,

        potentialProfit,

        requiredSellingPrice,

        profitPercent
      };
    })

    .sort(
      (a, b) =>
        a.price - b.price
    )

    .slice(0, 10);
}


// ======================================
// FIND POTENTIAL BUYERS
// ======================================

async function searchPotentialBuyers(
  product,
  apifyToken
) {

  /*
   * مهم:
   * هذا يبحث عن إعلانات عامة تحتوي
   * على مؤشرات مثل "куплю" أو "ищу".
   *
   * لا يتم استخراج أرقام هواتف أو
   * بيانات شخصية.
   */

  const buyerQuery =
    `${product} куплю`;

  const input = {

    searchQuery:
      buyerQuery,

    sortBy: "date",

    maxItems: 25,

    proxyConfiguration: {
      useApifyProxy: true
    }
  };

  console.log(
    "BUYER APIFY INPUT:",
    JSON.stringify(input)
  );

  const response =
    await fetch(
      APIFY_URL +
      "?token=" +
      encodeURIComponent(
        apifyToken
      ),
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json"
        },

        body:
          JSON.stringify(input)
      }
    );

  const responseText =
    await response.text();

  if (!response.ok) {

    throw new Error(
      `Apify buyer search HTTP ${response.status}: ${responseText}`
    );
  }

  let data;

  try {

    data =
      JSON.parse(responseText);

  } catch {

    throw new Error(
      "Buyer search returned invalid JSON."
    );
  }

  if (!Array.isArray(data)) {

    throw new Error(
      "Buyer search returned unexpected data."
    );
  }

  return data

    .map(normalizeListing)

    .filter(
      item =>
        isPotentialBuyer(
          item,
          product
        )
    )

    .slice(0, 10);
}


// ======================================
// BUYER MATCH
// ======================================

function isPotentialBuyer(
  item,
  product
) {

  const text =
    (
      String(item.title || "") +
      " " +
      String(item.description || "")
    )
      .toLowerCase();

  const productWords =
    String(product || "")
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);

  const buyerWords = [

    "куплю",
    "купить",
    "ищу",
    "потрібен",
    "потрібна",
    "потрібно",
    "хочу купити",
    "шукаю"
  ];

  const hasBuyerIntent =
    buyerWords.some(
      word =>
        text.includes(word)
    );

  const hasProduct =
    productWords.length === 0 ||
    productWords.some(
      word =>
        text.includes(word)
    );

  return (
    hasBuyerIntent &&
    hasProduct
  );
}


// ======================================
// NORMALIZE LISTING
// ======================================

function normalizeListing(item) {

  const title =
    item.title ||
    "بدون عنوان";

  let price = 0;

  if (
    typeof item.priceKop ===
    "number"
  ) {

    price =
      item.priceKop / 100;

  } else if (
    typeof item.price ===
    "number"
  ) {

    price =
      item.price;

  } else if (
    item.price
  ) {

    price =
      parseInteger(
        item.price
      );
  }

  return {

    title,

    description:
      item.description ||
      "",

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
      .toLowerCase()
      .trim();

  const p =
    String(product || "")
      .toLowerCase()
      .trim();

  if (!p) {
    return true;
  }

  // ======================================
  // كلمات تستبعد الإكسسوارات وقطع الغيار
  // ======================================

  const excludedWords = [
    "чохол",
    "чехол",
    "case",
    "кабель",
    "кабели",
    "кабель для",
    "скло",
    "стекло",
    "захисне скло",
    "защитное стекло",
    "дисплей",
    "дисплейный",
    "екран",
    "экран",
    "корпус",
    "корпус на",
    "крышка",
    "задняя крышка",
    "акумулятор",
    "батарея",
    "battery",
    "зарядка",
    "зарядное",
    "блок живлення",
    "наушники",
    "навушники",
    "держатель",
    "тримач",
    "пленка",
    "плівка",
    "стекло защитное",
    "запчасть",
    "запчасти",
    "запчастина",
    "запчастини"
  ];

  const isAccessory =
    excludedWords.some(
      word => t.includes(word)
    );

  if (isAccessory) {
    return false;
  }
  // ======================================
  // استبعاد الأجهزة المعطلة
  // ======================================

  const brokenWords = [
    "не робочий",
    "нерабочий",
    "не працює",
    "не работает",
    "несправний",
    "неисправный",
    "зламаний",
    "сломанный",
    "на запчастини",
    "на запчасти",
    "під відновлення",
    "под восстановление",
    "потребує ремонту",
    "требует ремонта"
  ];

  const isBroken =
    brokenWords.some(
      word => t.includes(word)
    );

  if (isBroken) {
    return false;
  }
  // ======================================
  // iPhone
  // ======================================

  if (
    p.includes("iphone") ||
    p.includes("айфон")
  ) {

    // يجب أن يحتوي العنوان على iPhone
    const hasIphone =
      t.includes("iphone") ||
      t.includes("айфон");

    if (!hasIphone) {
      return false;
    }

    // استخراج موديل iPhone من طلب المستخدم
    const modelMatch =
      p.match(
        /(?:iphone|айфон)\s*(\d{1,2})/i
      );

    if (modelMatch) {

      const requestedModel =
        modelMatch[1];

      /*
       * نقبل الموديل المطلوب فقط.
       *
       * مثال:
       * iPhone 14
       *
       * يقبل:
       * iPhone 14
       * Apple iPhone 14 128GB
       *
       * ويرفض:
       * iPhone 13
       * iPhone XR
       * iPhone 15
       */

      const modelRegex =
        new RegExp(
          "(?:iphone|айфон)\\s*" +
          requestedModel +
          "(?:\\D|$)",
          "i"
        );

      if (
        !modelRegex.test(t)
      ) {
        return false;
      }
    }
  }

  // ======================================
  // باقي المنتجات
  // ======================================

  const words =
    p.split(/\s+/)
      .filter(Boolean);

  if (!words.length) {
    return true;
  }

  return words.every(
    word =>
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

        body:
          JSON.stringify({
            chat_id:
              chatId,
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

function resetSession(
  chatId
) {

  sessions[chatId] = {

    step: "idle",

    product: "",

    maxPrice: 0,

    profitPercent: 15,

    bestDeal: null,

    bestSellingPrice: 0,

    lastResults: []
  };
}


// ======================================
// FORMAT RESULTS
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
      formatPrice(
        session.maxPrice
      ) +
      " грн\n" +

      "📈 نسبة الربح: " +
      session.profitPercent +
      "%\n\n" +

      "استخدم /search لبحث جديد."
    );
  }

  let message =

    "🔎 نتائج البحث الحقيقي في OLX.ua\n\n" +

    "📦 المنتج: " +
    session.product +
    "\n" +

    "💰 أقصى شراء: " +
    formatPrice(
      session.maxPrice
    ) +
    " грн\n" +

    "📈 نسبة الربح: " +
    session.profitPercent +
    "%\n\n";

  results.forEach(
    (item, index) => {

      message +=

        `${index + 1}. ${item.title}\n` +

        `💰 سعر الشراء: ${formatPrice(item.price)} грн\n`;

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

        `📈 الربح المتوقع: ${formatPrice(item.potentialProfit)} грн\n` +

        `💵 سعر البيع المقترح: ${formatPrice(item.requiredSellingPrice)} грн\n`;

      if (item.url) {

        message +=
          `🔗 ${item.url}\n`;
      }

      message += "\n";
    }
  );

  message +=

    "🤝 إذا أردت البحث عن زبون محتمل لهذه الصفقة، أرسل:\n" +

    "/buyers\n\n" +

    "استخدم /search لبحث جديد.";

  return message;
}


// ======================================
// FORMAT BUYERS
// ======================================

function formatBuyerResults(
  session,
  buyers
) {

  if (!buyers.length) {

    return (

      "🤝 البحث عن الزبائن\n\n" +

      "لم يجد الوكيل حاليًا إعلانات عامة تشير بوضوح إلى رغبة في شراء:\n\n" +

      "📦 " +
      session.product +
      "\n\n" +

      "يمكنك استخدام /search لبحث جديد."
    );
  }

  let message =

    "🤝 زبائن محتملون\n\n" +

    "📦 المنتج: " +
    session.product +
    "\n" +

    "💵 سعر البيع المقترح: " +
    formatPrice(
      session.bestSellingPrice
    ) +
    " грн\n\n";

  buyers.forEach(
    (item, index) => {

      message +=

        `${index + 1}. ${item.title}\n`;

      if (item.description) {

        const description =
          item.description
            .replace(/\s+/g, " ")
            .slice(0, 180);

        message +=
          `📝 ${description}\n`;
      }

      if (item.city) {

        message +=
          `📍 ${item.city}`;

        if (item.region) {

          message +=
            `، ${item.region}`;
        }

        message += "\n";
      }

      if (item.url) {

        message +=
          `🔗 ${item.url}\n`;
      }

      message += "\n";
    }
  );

  message +=

    "⚠️ هذه زبائن محتملون فقط من إعلانات عامة، وليست تأكيدًا أن صاحب الإعلان سيشتري.\n\n" +

    "استخدم /search لبحث جديد.";

  return message;
}


// ======================================
// PRICE
// ======================================

function formatPrice(value) {

  return Number(value)
    .toLocaleString(
      "en-US",
      {
        maximumFractionDigits: 0
      }
    );
}


// ======================================
// OK
// ======================================

function ok() {

  return {

    statusCode: 200,

    body: "OK"
  };
}