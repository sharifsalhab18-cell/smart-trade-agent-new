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
        "Welcome to Trade Agent Smart 🤖\n\n" +
        "Agent connected successfully.\n\n" +
        "استخدم /search للبحث عن طلبات شراء."
      );

      return ok();
    }

    // =========================
    // SEARCH START
    // =========================

    if (text === "/search") {
      resetSession(chatId);

      session.step = "buyerProducts";

      await sendTelegram(
        token,
        chatId,
        "🔎 البحث عن طلبات شراء\n\n" +
        "أرسل اسم منتج واحد أو عدة منتجات.\n\n" +
        "يمكنك كتابة عدة منتجات مفصولة بفاصلة.\n\n" +
        "مثال:\n" +
        "iPhone 14, PlayStation 5, MacBook Air\n\n" +
        "سيبحث الوكيل عن طلبات شراء حقيقية في OLX.ua."
      );

      return ok();
    }

    // =========================
    // BUYER REQUEST SEARCH
    // =========================

    if (session.step === "buyerProducts") {

      const products = text
        .split(",")
        .map(item => item.trim())
        .filter(Boolean)
        .slice(0, 10);

      if (!products.length) {
        await sendTelegram(
          token,
          chatId,
          "❌ أرسل اسم منتج واحد على الأقل."
        );

        return ok();
      }

      session.requestProducts = products;
      session.step = "findingRequests";

      await sendTelegram(
        token,
        chatId,
        "🔎 بدأ البحث عن طلبات الشراء...\n\n" +
        products
          .map((p, i) => `${i + 1}. ${p}`)
          .join("\n") +
        "\n\n⏳ يبحث الوكيل في الإعلانات العامة..."
      );

      try {

        const requests = [];

        for (const product of products) {

          const found =
            await searchBuyerRequests(
              product,
              apifyToken
            );

          found.forEach(item => {

            requests.push({
              ...item,
              requestedProduct: product
            });

          });
        }

        session.requestResults =
          requests.slice(0, 20);

        session.step = "selectRequest";

        await sendTelegram(
          token,
          chatId,
          formatRequestResults(
            session,
            session.requestResults
          )
        );

      } catch (error) {

        console.error(
          "BUYER REQUEST SEARCH ERROR:",
          error
        );

        session.step = "ready";

        await sendTelegram(
          token,
          chatId,
          "❌ حدث خطأ أثناء البحث عن طلبات الشراء.\n\n" +
          error.message +
          "\n\n" +
          "استخدم /search للمحاولة من جديد."
        );
      }

      return ok();
    }

    // =========================
    // SELECT REQUEST
    // =========================

    if (session.step === "selectRequest") {

      const number = parseInteger(text);

      if (
        !number ||
        !session.requestResults ||
        !session.requestResults[number - 1]
      ) {

        await sendTelegram(
          token,
          chatId,
          "❌ أرسل رقم طلب صحيح من القائمة."
        );

        return ok();
      }

      const selectedRequest =
        session.requestResults[number - 1];

      session.selectedRequest =
        selectedRequest;

      session.product =
        selectedRequest.requestedProduct;

      session.step = "findingOffers";

      await sendTelegram(
        token,
        chatId,
        "✅ تم اختيار الطلب رقم " +
        number +
        "\n\n" +
        "📦 المطلوب: " +
        session.product +
        "\n\n" +
        "🔎 الآن يبحث الوكيل عن المعروضات المناسبة...\n\n" +
        "⏳ البحث في OLX.ua..."
      );

      try {

        const offers =
          await searchOLX(
            session.product,
            apifyToken
          );

        session.results = offers;
        session.lastResults = offers;

        if (offers.length) {
          session.step = "selectDeal";
        } else {
          session.step = "ready";
        }

        await sendTelegram(
          token,
          chatId,
          formatResults(
            session,
            offers
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
          "❌ حدث خطأ أثناء البحث عن المعروضات.\n\n" +
          error.message
        );
      }

      return ok();
    }

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
          "❌ أرسل رقم المعروضة الصحيح من القائمة."
        );

        return ok();
      }

      session.selectedDeal =
        session.results[number - 1];

      session.product =
        session.selectedDeal.product ||
        session.product;

      session.bestDeal =
        session.selectedDeal;

      session.bestSellingPrice =
        session.selectedDeal.requiredSellingPrice;

      session.step = "ready";

      await sendTelegram(
        token,
        chatId,
        "✅ تم اختيار المعروضة رقم " +
        number +
        "\n\n" +
        "📦 " +
        session.selectedDeal.title +
        "\n" +
        "💰 سعر الشراء: " +
        formatPrice(
          session.selectedDeal.price
        ) +
        " грн\n" +
        "📈 الربح المتوقع: " +
        formatPrice(
          session.selectedDeal.potentialProfit
        ) +
        " грн\n" +
        "💵 سعر البيع المقترح: " +
        formatPrice(
          session.selectedDeal.requiredSellingPrice
        ) +
        " грн\n\n" +
        "🤝 أرسل /buyers إذا أردت البحث عن زبائن محتملين لهذه المعروضة."
      );

      return ok();
    }

    // =========================
    // BUYER SEARCH
    // =========================

    if (text === "/buyers") {

      if (
        !session.selectedDeal ||
        !session.product
      ) {

        await sendTelegram(
          token,
          chatId,
          "❌ يجب أولًا اختيار طلب ثم اختيار معروضة.\n\n" +
          "استخدم /search للبدء."
        );

        return ok();
      }

      session.step = "findingBuyers";

      await sendTelegram(
        token,
        chatId,
        "🤝 البحث عن زبائن محتملين...\n\n" +
        "📦 المنتج: " +
        session.product +
        "\n" +
        "💰 سعر الشراء: " +
        formatPrice(
          session.selectedDeal.price
        ) +
        " грн\n" +
        "💵 سعر البيع المقترح: " +
        formatPrice(
          session.selectedDeal.requiredSellingPrice
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
// SEARCH BUYER REQUESTS
// ======================================

async function searchBuyerRequests(
  product,
  apifyToken
) {

  const input = {

    searchQuery:
      `${product} куплю`,

    sortBy: "date",

    maxItems: 25,

    proxyConfiguration: {
      useApifyProxy: true
    }
  };

  console.log(
    "REQUEST SEARCH INPUT:",
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
      `Apify request search HTTP ${response.status}: ${responseText}`
    );
  }

  let data;

  try {

    data =
      JSON.parse(responseText);

  } catch {

    throw new Error(
      "Request search returned invalid JSON."
    );
  }

  if (!Array.isArray(data)) {

    throw new Error(
      "Request search returned unexpected data."
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
// SEARCH OLX OFFERS
// ======================================

async function searchOLX(
  product,
  apifyToken
) {

  const input = {

    searchQuery:
      product,

    sortBy: "date",

    maxItems: 25,

    proxyConfiguration: {
      useApifyProxy: true
    }
  };

  console.log(
    "OFFER SEARCH INPUT:",
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
      `Apify offer search HTTP ${response.status}: ${responseText}`
    );
  }

  let data;

  try {

    data =
      JSON.parse(responseText);

  } catch {

    throw new Error(
      "Offer search returned invalid JSON."
    );
  }

  if (!Array.isArray(data)) {

    throw new Error(
      "Offer search returned unexpected dataset format."
    );
  }

  console.log(
    "APIFY OFFER ITEMS:",
    data.length
  );

  return data

    .map(normalizeListing)

    .filter(
      item =>
        item.price > 0
    )

    .filter(
      item =>
        isRelevantProduct(
          item.title,
          product
        )
    )

    .map(item => {

      // الربح الافتراضي 15%
      const profitPercent = 15;

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

        product,

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

function isRelevantProduct(
  title,
  product
) {

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
  // استبعاد الإكسسوارات وقطع الغيار
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

    "запчасть",
    "запчасти",
    "запчастина",
    "запчастини"
  ];

  const isAccessory =
    excludedWords.some(
      word =>
        t.includes(word)
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
      word =>
        t.includes(word)
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

    const hasIphone =
      t.includes("iphone") ||
      t.includes("айфон");

    if (!hasIphone) {
      return false;
    }

    const modelMatch =
      p.match(
        /(?:iphone|айфон)\s*(\d{1,2})/i
      );

    if (modelMatch) {

      const requestedModel =
        modelMatch[1];

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
// FORMAT REQUEST RESULTS
// ======================================

function formatRequestResults(
  session,
  results
) {

  if (!results.length) {

    return (

      "🔎 طلبات الشراء\n\n" +

      "لم يجد الوكيل حاليًا طلبات شراء واضحة للمنتجات المطلوبة.\n\n" +

      "استخدم /search للبحث من جديد."
    );
  }

  let message =
    "🔎 طلبات الشراء الموجودة\n\n";

  results.forEach(
    (item, index) => {

      message +=

        `${index + 1}. 📦 ${item.requestedProduct}\n`;

      message +=
        `📝 ${item.title}\n`;

      if (item.city) {

        message +=
          `📍 ${item.city}`;

        if (item.region) {

          message +=
            `، ${item.region}`;
        }

        message += "\n";
      }

      if (item.description) {

        const description =
          item.description
            .replace(/\s+/g, " ")
            .slice(0, 160);

        message +=
          `💬 ${description}\n`;
      }

      if (item.url) {

        message +=
          `🔗 ${item.url}\n`;
      }

      message += "\n";
    }
  );

  message +=
    "👇 أرسل رقم الطلب الذي تريد من الوكيل البحث عن معروضات له.\n\n" +
    "مثال: 4";

  return message;
}


// ======================================
// FORMAT OFFER RESULTS
// ======================================

function formatResults(
  session,
  results
) {

  if (!results.length) {

    return (

      "📦 المعروضات\n\n" +

      "لم يجد الوكيل معروضات مناسبة حاليًا لـ:\n\n" +

      "📦 " +
      session.product +
      "\n\n" +

      "استخدم /search لبحث جديد."
    );
  }

  let message =

    "📦 المعروضات المناسبة\n\n" +

    "📦 الطلب المختار: " +
    session.product +
    "\n\n";

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

    "⚠️ هذه زبائن محتملون فقط من إعلانات عامة، وليست تأكيدًا أن صاحب الإعلان سيشتري.\n\n" +

    "استخدم /search لبحث جديد.";

  return message;
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

    requestProducts: [],

    requestResults: [],

    selectedRequest: null,

    results: [],

    lastResults: [],

    selectedDeal: null,

    bestDeal: null,

    bestSellingPrice: 0
  };
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