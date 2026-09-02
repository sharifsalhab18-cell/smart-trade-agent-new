// ======================================================
// TRADE AGENT SMART
// OLX SEARCH BACKGROUND FUNCTION
// ======================================================

const {
  connectLambda,
  getStore,
} = require("@netlify/blobs");

let sessionsStore;

// ------------------------------------------------------
// Constants
// ------------------------------------------------------

const APIFY_ACTOR =
  "lowlanddata/olx-ua-scraper";

const MAX_TELEGRAM_LENGTH = 3800;

const PURCHASE_INTENT_WORDS = [
  "куплю",
  "купить",
  "ищу",
  "нужен",
  "нужна",
  "нужно",
  "потрібен",
  "потрібна",
  "потрібно",
  "шукаю",
  "хочу купити",
  "хочу придбати",
  "придбаю",
];

const SELLER_WORDS = [
  "продам",
  "продажа",
  "продаю",
  "продається",
  "продаю",
  "в наличии",
  "є в наявності",
  "доставка",
  "магазин",
  "опт",
  "новый товар",
  "новинка",
];

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

  const result =
    await response.text();

  console.log(
    "TELEGRAM RESPONSE:",
    response.status,
    result
  );

  return result;
}

// ------------------------------------------------------
// Telegram long message splitter
// ------------------------------------------------------

function splitMessage(
  text,
  maxLength = MAX_TELEGRAM_LENGTH
) {
  const value =
    String(text || "");

  if (value.length <= maxLength) {
    return [value];
  }

  const parts = [];
  let remaining = value;

  while (
    remaining.length > maxLength
  ) {
    let cut =
      remaining.lastIndexOf(
        "\n",
        maxLength
      );

    if (
      cut < 1000
    ) {
      cut = maxLength;
    }

    parts.push(
      remaining.slice(0, cut)
    );

    remaining =
      remaining.slice(cut)
      .trimStart();
  }

  if (remaining) {
    parts.push(remaining);
  }

  return parts;
}

async function sendLongTelegram(
  token,
  chatId,
  text
) {
  const parts =
    splitMessage(text);

  for (const part of parts) {
    await sendTelegram(
      token,
      chatId,
      part
    );
  }
}

// ------------------------------------------------------
// Text helpers
// ------------------------------------------------------

function normalizeText(
  value
) {
  return String(
    value || ""
  )
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function containsAny(
  text,
  words
) {
  const value =
    normalizeText(text);

  return words.some(
    word =>
      value.includes(
        normalizeText(word)
      )
  );
}

// ------------------------------------------------------
// Product detection
// ------------------------------------------------------

function detectProduct(
  text
) {
  const value =
    normalizeText(text);

  // iPhone 12 and above
  const iphoneMatch =
    value.match(
      /\biphone\s*(\d{2})(?:\s*(pro\s*max|pro|plus|mini))?/i
    );

  if (iphoneMatch) {
    const model =
      Number(iphoneMatch[1]);

    if (model >= 12) {
      return {
        category: "iPhone",
        product:
          `iPhone ${iphoneMatch[1]}` +
          (
            iphoneMatch[2]
              ? ` ${iphoneMatch[2]}`
              : ""
          ),
      };
    }
  }

  // iPhone written with Apple wording
  if (
    value.includes("айфон") ||
    value.includes("iphone")
  ) {
    const numberMatch =
      value.match(
        /\b(?:iphone|айфон)\s*(\d{2})/i
      );

    if (
      numberMatch &&
      Number(numberMatch[1]) >= 12
    ) {
      return {
        category: "iPhone",
        product:
          `iPhone ${numberMatch[1]}`,
      };
    }
  }

  // Samsung Galaxy S21+
  const samsungMatch =
    value.match(
      /\b(?:samsung\s*)?(?:galaxy\s*)?s(\d{2})(?:\s*(ultra|plus|\+|fe))?/i
    );

  if (samsungMatch) {
    const model =
      Number(samsungMatch[1]);

    if (model >= 21) {
      return {
        category:
          "Samsung Galaxy",
        product:
          `Samsung Galaxy S${samsungMatch[1]}` +
          (
            samsungMatch[2]
              ? ` ${samsungMatch[2]}`
              : ""
          ),
      };
    }
  }

  // Samsung in Ukrainian/Russian spelling
  const samsungAlt =
    value.match(
      /\b(?:самсунг|самсун)\s*(?:галакси|galaxy)?\s*s?(\d{2})/i
    );

  if (
    samsungAlt &&
    Number(samsungAlt[1]) >= 21
  ) {
    return {
      category:
        "Samsung Galaxy",
      product:
        `Samsung Galaxy S${samsungAlt[1]}`,
    };
  }

  // PlayStation 5
  if (
    value.includes("playstation 5") ||
    value.includes("play station 5") ||
    value.includes("ps5") ||
    value.includes("пс5") ||
    value.includes("плейстейшен 5")
  ) {
    let variant = "";

    if (
      value.includes("digital") ||
      value.includes("цифров") ||
      value.includes("digital edition")
    ) {
      variant = " Digital";
    } else if (
      value.includes("disc") ||
      value.includes("дисковод") ||
      value.includes("дисков")
    ) {
      variant = " Disc";
    }

    return {
      category:
        "PlayStation 5",
      product:
        `PlayStation 5${variant}`,
    };
  }

  // MacBook
  if (
    value.includes("macbook") ||
    value.includes("макбук")
  ) {
    let product =
      "MacBook";

    if (
      value.includes("air")
    ) {
      product += " Air";
    } else if (
      value.includes("pro")
    ) {
      product += " Pro";
    }

    const chip =
      value.match(
        /\b(m[1-5])\b/i
      );

    if (chip) {
      product +=
        ` ${chip[1].toUpperCase()}`;
    }

    return {
      category: "MacBook",
      product,
    };
  }

  // Gaming Laptop
  if (
    value.includes("gaming laptop") ||
    value.includes("игровой ноутбук") ||
    value.includes("игровой ноут") ||
    value.includes("ігровий ноутбук") ||
    value.includes("ігровий ноут")
  ) {
    return {
      category:
        "Gaming Laptop",
      product:
        "Gaming Laptop",
    };
  }

  return null;
}

// ------------------------------------------------------
// Extract text from an OLX item
// ------------------------------------------------------

function itemText(
  item
) {
  const fields = [
    item.title,
    item.name,
    item.description,
    item.text,
    item.details,
    item.category,
    item.product,
    item.searchQuery,
  ];

  return normalizeText(
    fields
      .filter(Boolean)
      .join(" ")
  );
}

// ------------------------------------------------------
// Purchase request validation
// ------------------------------------------------------

function isPurchaseRequest(
  item
) {
  const text =
    itemText(item);

  if (!text) {
    return false;
  }

  const product =
    detectProduct(text);

  if (!product) {
    return false;
  }

  const hasIntent =
    containsAny(
      text,
      PURCHASE_INTENT_WORDS
    );

  if (!hasIntent) {
    return false;
  }

  const looksLikeSeller =
    containsAny(
      text,
      SELLER_WORDS
    );

  if (looksLikeSeller) {
    return false;
  }

  return true;
}

// ------------------------------------------------------
// Price extraction
// ------------------------------------------------------

function parsePrice(
  item
) {
  const directFields = [
    item.price,
    item.priceValue,
    item.priceAmount,
  ];

  for (
    const value of directFields
  ) {
    if (
      typeof value === "number" &&
      value > 0
    ) {
      return value;
    }
  }

  const textFields = [
    item.priceText,
    item.price,
  ];

  for (
    const value of textFields
  ) {
    if (!value) {
      continue;
    }

    const text =
      String(value);

    // Price should contain currency
    const match =
      text.match(
        /(\d[\d\s.,]{2,})\s*(грн|₴|uah|дол|usd|\$|євро|eur|€)/i
      );

    if (match) {
      const number =
        Number(
          match[1]
            .replace(/\s/g, "")
            .replace(/,/g, "")
            .replace(/\.(?=\d{3})/g, "")
        );

      if (
        Number.isFinite(number) &&
        number > 0
      ) {
        return number;
      }
    }
  }

  return null;
}

// ------------------------------------------------------
// Generic item fields
// ------------------------------------------------------

function getTitle(
  item
) {
  return (
    item.title ||
    item.name ||
    item.product ||
    "Без назви"
  );
}

function getUrl(
  item
) {
  return (
    item.url ||
    item.link ||
    item.webUrl ||
    item.itemUrl ||
    item.href ||
    ""
  );
}

function getLocation(
  item
) {
  return (
    item.location ||
    item.city ||
    item.region ||
    item.address ||
    ""
  );
}

function getAuthor(
  item
) {
  return (
    item.author ||
    item.user ||
    item.seller ||
    item.requester ||
    item.owner ||
    ""
  );
}

function getDescription(
  item
) {
  return (
    item.description ||
    item.text ||
    item.details ||
    ""
  );
}

function getDate(
  item
) {
  return (
    item.date ||
    item.postedAt ||
    item.createdAt ||
    item.publishedAt ||
    ""
  );
}

// ------------------------------------------------------
// Product normalization
// ------------------------------------------------------

function getDetectedProduct(
  item
) {
  const text =
    itemText(item);

  return detectProduct(text);
}

// ------------------------------------------------------
// Create stable duplicate key
// ------------------------------------------------------

function normalizeTitle(
  title
) {
  return normalizeText(title)
    .replace(
      /[^a-zа-яіїєґ0-9]+/gi,
      " "
    )
    .trim();
}

function getDuplicateKey(
  item
) {
  const url =
    getUrl(item);

  if (url) {
    return `url:${url}`;
  }

  const title =
    normalizeTitle(
      getTitle(item)
    );

  const location =
    normalizeText(
      getLocation(item)
    );

  return `text:${title}|${location}`;
}

// ------------------------------------------------------
// Format purchase request
// ------------------------------------------------------

function formatPurchaseRequest(
  item,
  number
) {
  const detected =
    getDetectedProduct(item);

  const title =
    getTitle(item);

  const description =
    getDescription(item);

  const location =
    getLocation(item);

  const author =
    getAuthor(item);

  const date =
    getDate(item);

  const url =
    getUrl(item);

  const price =
    item.price ||
    item.priceText ||
    "";

  let text =
    `${number}️⃣ ${title}\n`;

  if (detected) {
    text +=
      `📦 الصنف: ${detected.product}\n`;
  }

  if (location) {
    text +=
      `📍 الموقع: ${location}\n`;
  }

  if (price) {
    text +=
      `💰 السعر المذكور: ${price}\n`;
  }

  if (author) {
    text +=
      `👤 صاحب الطلب: ${author}\n`;
  }

  if (date) {
    text +=
      `📅 التاريخ: ${date}\n`;
  }

  if (description) {
    text +=
      `📝 التفاصيل:\n${description}\n`;
  }

  if (url) {
    text +=
      `🔗 ${url}\n`;
  }

  return text;
}

// ------------------------------------------------------
// Format seller listing
// ------------------------------------------------------

function formatSellerListing(
  item,
  number
) {
  const title =
    getTitle(item);

  const price =
    item.price ||
    item.priceText ||
    "";

  const location =
    getLocation(item);

  const author =
    getAuthor(item);

  const date =
    getDate(item);

  const description =
    getDescription(item);

  const url =
    getUrl(item);

  let text =
    `${number}️⃣ ${title}\n`;

  if (price) {
    text +=
      `💰 السعر: ${price}\n`;
  }

  if (location) {
    text +=
      `📍 الموقع: ${location}\n`;
  }

  if (author) {
    text +=
      `👤 البائع: ${author}\n`;
  }

  if (date) {
    text +=
      `📅 التاريخ: ${date}\n`;
  }

  if (description) {
    text +=
      `📝 الوصف:\n${description}\n`;
  }

  if (url) {
    text +=
      `🔗 ${url}\n`;
  }

  return text;
}

// ------------------------------------------------------
// Apify API
// ------------------------------------------------------

function apifyHeaders() {
  return {
    "Content-Type":
      "application/json",
  };
}

// ------------------------------------------------------
// Start Apify run
// ------------------------------------------------------

async function startApifyRun(
  searchQuery,
  maxItems = 20
) {
  const token =
    process.env.APIFY_API_TOKEN;

  if (!token) {
    throw new Error(
      "APIFY_API_TOKEN missing."
    );
  }

  const url =
    `https://api.apify.com/v2/acts/${APIFY_ACTOR}/runs?token=${encodeURIComponent(token)}`;

  const input = {
    searchQuery,
    maxItems,
    proxyConfiguration: {
      useApifyProxy: true,
    },
  };

  console.log(
    "APIFY START:",
    JSON.stringify(input)
  );

  let response;

try {
  response = await fetch(url, {
    method: "POST",
    headers:
      apifyHeaders(),
    body:
      JSON.stringify(input),
  });
} catch (error) {
  console.error(
    "APIFY FETCH ERROR:",
    error
  );

  throw error;
}

  const text =
    await response.text();

  console.log(
    "APIFY START RESPONSE:",
    response.status,
    text
  );

  if (!response.ok) {
    throw new Error(
      `Apify start failed: ${response.status}`
    );
  }

  const data =
    JSON.parse(text);

  const run =
    data.data || data;

  if (!run.id) {
    throw new Error(
      "Apify did not return a run ID."
    );
  }

  return {
    runId: run.id,
    datasetId:
      run.defaultDatasetId ||
      null,
  };
}

// ------------------------------------------------------
// Get Apify run status
// ------------------------------------------------------

async function getApifyRun(
  runId
) {
  const token =
    process.env.APIFY_API_TOKEN;

  const url =
    `https://api.apify.com/v2/actor-runs/${runId}?token=${encodeURIComponent(token)}`;

  const response =
    await fetch(url);

  const text =
    await response.text();

  if (!response.ok) {
    throw new Error(
      `Apify status failed: ${response.status}`
    );
  }

  const data =
    JSON.parse(text);

  return data.data || data;
}

// ------------------------------------------------------
// Wait for Apify run
// ------------------------------------------------------

async function waitForApifyRun(
  runId,
  initialDatasetId
) {
  const startedAt =
    Date.now();

  const timeout =
    4 * 60 * 1000;

  let datasetId =
    initialDatasetId;

  while (
    Date.now() - startedAt <
    timeout
  ) {
    const run =
      await getApifyRun(
        runId
      );

    const status =
      String(
        run.status || ""
      ).toUpperCase();

    console.log(
      "APIFY STATUS:",
      runId,
      status
    );

    if (
      run.defaultDatasetId
    ) {
      datasetId =
        run.defaultDatasetId;
    }

    if (
      status === "SUCCEEDED"
    ) {
      return {
        datasetId,
        status,
      };
    }

    if (
      [
        "FAILED",
        "ABORTED",
        "TIMED-OUT",
        "TIMED_OUT",
      ].includes(status)
    ) {
      throw new Error(
        `Apify run ${runId} ended with status ${status}`
      );
    }

    await new Promise(
      resolve =>
        setTimeout(
          resolve,
          3000
        )
    );
  }

  throw new Error(
    `Apify run ${runId} timed out while waiting.`
  );
}

// ------------------------------------------------------
// Get Apify dataset
// ------------------------------------------------------

async function getApifyDataset(
  datasetId
) {
  const token =
    process.env.APIFY_API_TOKEN;

  if (!datasetId) {
    return [];
  }

  const url =
    `https://api.apify.com/v2/datasets/${datasetId}/items?token=${encodeURIComponent(token)}&clean=true&format=json`;

  const response =
    await fetch(url);

  const text =
    await response.text();

  console.log(
    "APIFY DATASET RESPONSE:",
    response.status,
    `length=${text.length}`
  );

  if (!response.ok) {
    throw new Error(
      `Apify dataset failed: ${response.status}`
    );
  }

  const data =
    JSON.parse(text);

  return Array.isArray(data)
    ? data
    : [];
}

// ------------------------------------------------------
// Complete one Apify search
// ------------------------------------------------------

async function runApifySearch(
  searchQuery,
  maxItems = 20
) {
  const started =
    await startApifyRun(
      searchQuery,
      maxItems
    );

  console.log(
    "APIFY RUN CREATED:",
    started.runId
  );

  const completed =
    await waitForApifyRun(
      started.runId,
      started.datasetId
    );

  console.log(
    "APIFY RUN COMPLETED:",
    started.runId,
    completed.status,
    completed.datasetId
  );

  const items =
    await getApifyDataset(
      completed.datasetId
    );

  return items;
}

// ------------------------------------------------------
// Run jobs with limited concurrency
// ------------------------------------------------------

async function runWithConcurrency(
  jobs,
  limit = 4
) {
  const results =
    new Array(jobs.length);

  let nextIndex = 0;

  async function worker() {
    while (true) {
      const index =
        nextIndex++;

      if (
        index >= jobs.length
      ) {
        return;
      }

      try {
        results[index] =
          await jobs[index]();
      } catch (error) {
        console.error(
          "SEARCH JOB ERROR:",
          error.message
        );

        results[index] = [];
      }
    }
  }

  const workers =
    [];

  const count =
    Math.min(
      limit,
      jobs.length
    );

  for (
    let i = 0;
    i < count;
    i++
  ) {
    workers.push(
      worker()
    );
  }

  await Promise.all(
    workers
  );

  return results.flat();
}

// ------------------------------------------------------
// Purchase search queries
// ------------------------------------------------------

function getPurchaseQueries() {
  return [
    "куплю iphone 12",
    "куплю iphone 13",
    "куплю iphone 14",
    "куплю iphone 15",
    "куплю samsung galaxy s21",
    "куплю samsung galaxy s22",
    "куплю ps5",
    "куплю macbook",
    "куплю игровой ноутбук",
    "шукаю iphone samsung ps5 macbook ноутбук",
  ];
}

// ------------------------------------------------------
// Seller search query
// ------------------------------------------------------

function buildSellerQueries(
  selected
) {
  const source =
    [
      selected.requestSearchProduct,
      selected.exactProduct,
      selected.title,
      selected.normalizedProduct,
      selected.description,
      selected.text,
    ]
      .filter(Boolean)
      .join(" ");

  const detected =
    detectProduct(source);

  if (!detected) {
    return [
      String(
        selected.title ||
        selected.requestSearchProduct ||
        "товар"
      ),
    ];
  }

  const product =
    detected.product;

  const queries = [
    product,
    product + " купить",
    product + " продажа",
  ];

  // Keep exact useful specifications when present
  const lower =
    normalizeText(source);

  const storage =
    lower.match(
      /\b(64|128|256|512|1024)\s*(gb|гб)\b/i
    );

  if (storage) {
    queries.unshift(
      `${product} ${storage[1]} ${storage[2]}`
    );
  }

  return [
    ...new Set(
      queries
    ),
  ];
}

// ------------------------------------------------------
// Seller validation
// ------------------------------------------------------

function isSellerListing(
  item,
  selected
) {
  const text =
    itemText(item);

  if (!text) {
    return false;
  }

  const detected
 =
    detectProduct(text);

  if (!detected) {
    return false;
  }

  const selectedText =
    normalizeText(
      [
        selected.requestSearchProduct,
        selected.exactProduct,
        selected.title,
        selected.normalizedProduct,
        selected.description,
      ]
        .filter(Boolean)
        .join(" ")
    );

  const selectedProduct =
    detectProduct(
      selectedText
    );

  if (!selectedProduct) {
    return false;
  }

  // Must be same main product
  if (
    detected.category !==
    selectedProduct.category
  ) {
    return false;
  }

  // For phones, require same model number
  if (
    detected.category ===
    "iPhone"
  ) {
    const a =
      selectedProduct.product.match(
        /\d{2}/
      );

    const b =
      detected.product.match(
        /\d{2}/
      );

    if (
      a &&
      b &&
      a[0] !== b[0]
    ) {
      return false;
    }
  }

  if (
    detected.category ===
    "Samsung Galaxy"
  ) {
    const a =
      selectedProduct.product.match(
        /S\d{2}/i
      );

    const b =
      detected.product.match(
        /S\d{2}/i
      );

    if (
      a &&
      b &&
      a[0].toLowerCase() !==
      b[0].toLowerCase()
    ) {
      return false;
    }
  }

  // Seller ads should normally contain price or selling language
  const hasPrice =
    parsePrice(item) !== null;

  const sellerLanguage =
    containsAny(
      text,
      [
        "продам",
        "продаю",
        "продажа",
        "продається",
        "цена",
        "ціна",
        "грн",
        "uah",
        "₴",
      ]
    );

  return (
    hasPrice ||
    sellerLanguage
  );
}

// ------------------------------------------------------
// Market price analysis
// ------------------------------------------------------

function calculateMarketOpinion(
  item,
  allItems
) {
  const price =
    parsePrice(item);

  if (!price) {
    return "ℹ️ Оцінка ціни: недостатньо даних";
  }

  const prices =
    allItems
      .map(parsePrice)
      .filter(
        value =>
          Number.isFinite(value) &&
          value > 0
      );

  if (prices.length < 2) {
    return "ℹ️ Оцінка ціни: недостатньо порівняльних оголошень";
  }

  const sorted =
    [...prices].sort(
      (a, b) => a - b
    );

  const middle =
    Math.floor(
      sorted.length / 2
    );

  const median =
    sorted.length % 2
      ? sorted[middle]
      : (
          sorted[middle - 1] +
          sorted[middle]
        ) / 2;

  const lowLimit =
    median * 0.85;

  const highLimit =
    median * 1.15;

  if (price < lowLimit) {
    return (
      `🟢 رأي تقريبي بالسعر: منخفض ` +
      `(مقارنة بمتوسط السوق الظاهر ≈ ${Math.round(median)} )`
    );
  }

  if (price > highLimit) {
    return (
      `🔴 رأي تقريبي بالسعر: مرتفع ` +
      `(مقارنة بمتوسط السوق الظاهر ≈ ${Math.round(median)} )`
    );
  }

  return (
    `🟡 رأي تقريبي بالسعر: طبيعي ` +
    `(متوسط السوق الظاهر ≈ ${Math.round(median)} )`
  );
}
// ------------------------------------------------------
// Purchase request search
// ------------------------------------------------------

async function searchPurchaseRequests(
  chatId,
  token
) {
  console.log(
    "PURCHASE SEARCH START:",
    chatId
  );

  const queries =
    getPurchaseQueries();

  const jobs =
    queries.map(
      query =>
        async () => {
          console.log(
            "PURCHASE QUERY:",
            query
          );

          return runApifySearch(
            query,
            20
          );
        }
    );

  const rawItems =
    await runWithConcurrency(
      jobs,
      4
    );

  console.log(
    "PURCHASE RAW ITEMS:",
    rawItems.length
  );

  const unique =
    new Map();

  for (
    const item of rawItems
  ) {
    if (
      !isPurchaseRequest(item)
    ) {
      continue;
    }

    const key =
      getDuplicateKey(item);

    if (
      !unique.has(key)
    ) {
      const detected =
        getDetectedProduct(item);

      const prepared = {
        ...item,

        requestSearchProduct:
          detected
            ? detected.product
            : "",

        exactProduct:
          detected
            ? detected.product
            : "",

        normalizedProduct:
          detected
            ? detected.product
            : "",

        searchSource:
          "OLX",
      };

      unique.set(
        key,
        prepared
      );
    }
  }

  const results =
    Array.from(
      unique.values()
    );

  console.log(
    "PURCHASE FINAL RESULTS:",
    results.length
  );

  const session =
    await sessionsStore.get(
      `chat-${chatId}`,
      {
        type: "json",
        consistency: "strong"
      }
    );

  const updatedSession =
    session || {
      step: "idle",
      purchaseRequests: [],
      selectedRequest: null,
      selectedNumber: null,
    };

  updatedSession.purchaseRequests =
    results;

  updatedSession.selectedRequest =
    null;

  updatedSession.selectedNumber =
    null;

  updatedSession.step =
    results.length
      ? "waitingForSelection"
      : "idle";

  updatedSession.updatedAt =
    Date.now();

  await sessionsStore.setJSON(
    `chat-${chatId}`,
    updatedSession
  );

  if (!results.length) {
    await sendTelegram(
      token,
      chatId,
      "⚠️ انتهى البحث في OLX، لكن لم يتم العثور على طلبات شراء مطابقة للفئات المطلوبة.\n\n" +
      "يمكنك إعادة المحاولة بإرسال:\n" +
      "/search"
    );

    return;
  }

  let message =
    "✅ انتهى البحث عن طلبات الشراء.\n\n" +
    `وجد الوكيل ${results.length} طلبًا.\n\n`;

  for (
    let i = 0;
    i < results.length;
    i++
  ) {
    message +=
      formatPurchaseRequest(
        results[i],
        i + 1
      );

    message +=
      "\n━━━━━━━━━━━━━━\n\n";
  }

  message +=
    "📌 أرسل رقم الطلب الذي تريد اختياره.";

  await sendLongTelegram(
    token,
    chatId,
    message
  );
}
// ------------------------------------------------------
// Seller search
// ------------------------------------------------------

async function searchSellers(
  chatId,
  token,
  selected
) {
  console.log(
    "SELLER SEARCH START:",
    chatId,
    JSON.stringify(selected)
  );

  const queries =
    buildSellerQueries(
      selected
    );

  console.log(
    "SELLER QUERIES:",
    queries
  );

  const jobs =
    queries.map(
      query =>
        async () => {
          return runApifySearch(
            query,
            25
          );
        }
    );

  const rawItems =
    await runWithConcurrency(
      jobs,
      4
    );

  console.log(
    "SELLER RAW ITEMS:",
    rawItems.length
  );

  const unique =
    new Map();

  for (
    const item of rawItems
  ) {
    if (
      !isSellerListing(
        item,
        selected
      )
    ) {
      continue;
    }

    const key =
      getDuplicateKey(item);

    if (
      !unique.has(key)
    ) {
      unique.set(
        key,
        item
      );
    }
  }

  const results =
    Array.from(
      unique.values()
    );

  console.log(
    "SELLER FINAL RESULTS:",
    results.length
  );

  const session =
    await sessionsStore.get(
      `chat-${chatId}`,
      {
        type: "json",
        consistency: "strong"
      }
    );

  const updatedSession =
    session || {
      step: "idle",
      purchaseRequests: [],
      selectedRequest:
        selected,
      selectedNumber: null,
    };

  updatedSession.step =
    "waitingForSellerCommand";

  updatedSession.selectedRequest =
    selected;

  updatedSession.sellerResults =
    results;

  updatedSession.updatedAt =
    Date.now();

  await sessionsStore.setJSON(
    `chat-${chatId}`,
    updatedSession
  );
  if (!results.length) {
    await sendTelegram(
      token,
      chatId,
      "⚠️ انتهى البحث في OLX، لكن لم يتم العثور على إعلانات بيع مطابقة للصنف المطلوب.\n\n" +
      "يمكنك العودة واختيار طلب آخر بإرسال:\n" +
      "/search"
    );

    return;
  }

  const product =
    selected.requestSearchProduct ||
    selected.exactProduct ||
    selected.title ||
    "الصنف المطلوب";

  let message =
    "✅ انتهى البحث عن البائعين.\n\n" +
    `📦 الصنف المطلوب: ${product}\n\n` +
    `وجد الوكيل ${results.length} إعلان بيع.\n\n`;

  for (
    let i = 0;
    i < results.length;
    i++
  ) {
    message +=
      formatSellerListing(
        results[i],
        i + 1
      );

    message +=
      calculateMarketOpinion(
        results[i],
        results
      );

    message +=
      "\n━━━━━━━━━━━━━━\n\n";
  }

  message +=
    "ℹ️ تقييم السعر استرشادي فقط ويعتمد على الإعلانات التي ظهرت في البحث.\n\n" +
    "🤝 أنت تتواصل بنفسك مع المشتري والبائع وتتفاوض وتغلق الصفقة.";

  await sendLongTelegram(
    token,
    chatId,
    message
  );
}
// ------------------------------------------------------
// Main background handler
// ------------------------------------------------------

exports.handler = async function (
  event
) {
connectLambda(event);

sessionsStore = getStore(
  "trade-agent-sessions"
);
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

  let body = {};

  try {
    body =
      JSON.parse(
        event.body || "{}"
      );
  } catch (error) {
    console.error(
      "INVALID JSON:",
      error.message
    );

    return {
      statusCode: 400,
      body:
        "Invalid JSON",
    };
  }

  const chatId =
    body.chatId;

  const mode =
    body.mode;

  const request =
    body.request || null;

  if (!chatId || !mode) {
    console.error(
      "Missing chatId or mode."
    );

    return {
      statusCode: 400,
      body:
        "Missing chatId or mode",
    };
  }

  console.log(
    "BACKGROUND FUNCTION START:",
    JSON.stringify({
      chatId,
      mode,
    })
  );

  if (
    mode === "purchaseRequests"
  ) {
    try {
  await searchPurchaseRequests(
    chatId,
    token
  );
} catch (error) {
        console.error(
          "PURCHASE BACKGROUND FAILED:",
          error
        );

        try {
          await sendTelegram(
            token,
            chatId,
            "❌ حدث خطأ أثناء البحث عن طلبات الشراء.\n\n" +
            error.message
          );
        } catch (
          telegramError
        ) {
          console.error(
            "TELEGRAM ERROR:",
            telegramError
          );
        }
      }
    );
  }

  else if (
    mode === "seller"
  ) {
    if (!request) {
      return {
        statusCode: 400,
        body:
          "Missing selected request",
      };
    }

    searchSellers(
      chatId,
      token,
      request
    ).catch(
      async error => {
        console.error(
          "SELLER BACKGROUND FAILED:",
          error
        );

        try {
          await sendTelegram(
            token,
            chatId,
            "❌ حدث خطأ أثناء البحث عن البائعين.\n\n" +
            error.message
          );
        } catch (
          telegramError
        ) {
          console.error(
            "TELEGRAM ERROR:",
            telegramError
          );
        }
      }
    );
  }

  else {
    return {
      statusCode: 400,
      body:
        "Unknown search mode",
    };
  }

  return {
    statusCode: 202,
    body:
      "Background search started",
  };
};