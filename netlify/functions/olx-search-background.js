const {
  connectLambda,
  getStore,
} = require("@netlify/blobs");

let sessionsStore;

const APIFY_ACTOR =
  "lowlanddata~olx-ua-scraper";


// ============================================================
// TEXT HELPERS
// ============================================================

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function containsAny(text, words) {
  const value = normalizeText(text);

  return words.some(word =>
    value.includes(
      normalizeText(word)
    )
  );
}


// ============================================================
// NORMALIZE APIFY RESULT
// ============================================================

function normalizeItems(data) {
  if (Array.isArray(data)) {
    return data;
  }

  if (data && Array.isArray(data.items)) {
    return data.items;
  }

  if (
    data &&
    data.data &&
    Array.isArray(data.data.items)
  ) {
    return data.data.items;
  }

  if (
    data &&
    data.data &&
    Array.isArray(data.data.results)
  ) {
    return data.data.results;
  }

  if (
    data &&
    Array.isArray(data.results)
  ) {
    return data.results;
  }

  if (
    data &&
    typeof data === "object" &&
    (
      data.title ||
      data.name ||
      data.url ||
      data.listingId
    )
  ) {
    return [data];
  }

  return [];
}


// ============================================================
// PRODUCT DETECTION
// ============================================================

function detectProduct(text) {
  const value =
    normalizeText(text);


  // ----------------------------------------------------------
  // iPhone 12 and above
  // ----------------------------------------------------------

  const iphoneMatch =
    value.match(
      /\biphone\s*(1[2-9]|[2-9][0-9])\b/i
    );

  if (iphoneMatch) {
    return {
      category: "iPhone",
      product:
        "iPhone " +
        iphoneMatch[1],
    };
  }


  // ----------------------------------------------------------
  // Samsung Galaxy S21 and above
  // ----------------------------------------------------------

  const samsungMatch =
    value.match(
      /\b(?:samsung\s*)?(?:galaxy\s*)?s(2[1-9]|[3-9][0-9])\b/i
    );

  if (
    samsungMatch &&
    (
      value.includes("samsung") ||
      value.includes("galaxy")
    )
  ) {
    return {
      category:
        "Samsung Galaxy",
      product:
        "Samsung Galaxy S" +
        samsungMatch[1],
    };
  }


  // ----------------------------------------------------------
  // PlayStation 5
  // ----------------------------------------------------------

  if (
    value.includes("ps5") ||
    value.includes("ps 5") ||
    value.includes("playstation 5") ||
    value.includes("play station 5") ||
    value.includes("пс5") ||
    value.includes("пс 5") ||
    value.includes("плейстейшн 5")
  ) {
    return {
      category:
        "PlayStation 5",
      product:
        "PlayStation 5",
    };
  }


  // ----------------------------------------------------------
  // MacBook
  // ----------------------------------------------------------

  if (
    value.includes("macbook") ||
    value.includes("mac book") ||
    value.includes("макбук") ||
    value.includes("мак бук")
  ) {
    return {
      category:
        "MacBook",
      product:
        "MacBook",
    };
  }


  // ----------------------------------------------------------
  // Gaming Laptop
  // ----------------------------------------------------------

  if (
    value.includes("gaming laptop") ||
    value.includes("игровой ноутбук") ||
    value.includes("игровой ноут") ||
    value.includes("геймерский ноутбук") ||
    value.includes("геймерский ноут") ||
    value.includes("ігровий ноутбук") ||
    value.includes("ігровий ноут") ||
    value.includes("ігровий ноутбук")
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


// ============================================================
// PURCHASE REQUEST FILTER
// ============================================================

function isPurchaseRequest(item) {

  const title =
    normalizeText(
      item.title ||
      item.name ||
      ""
    );

  const description =
    normalizeText(
      item.description ||
      item.text ||
      item.details ||
      ""
    );

  const searchQuery =
    normalizeText(
      item.purchaseSearchQuery ||
      ""
    );

  const text =
    normalizeText(
      `${title} ${description}`
    );


  if (!text) {
    return false;
  }


  // ----------------------------------------------------------
  // Product must belong to our target categories
  // ----------------------------------------------------------

  const product =
    detectProduct(text);

  if (!product) {
    return false;
  }


  // ----------------------------------------------------------
  // Words showing that the person wants to BUY
  // ----------------------------------------------------------

  const purchasePatterns = [
    "куплю",
    "хочу купить",
    "хочу приобрести",
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
    "придбаю"
  ];


  const hasPurchaseIntent =
    containsAny(
      text,
      purchasePatterns
    );


  
  // يجب أن تكون نية الشراء موجودة في إعلان الشخص نفسه.
  // لا نعتمد على كلمة "куплю" الموجودة في استعلام البحث.

  if (!hasPurchaseIntent) {
    return false;
  }

  // ----------------------------------------------------------
  // Reject seller advertisements
  // ----------------------------------------------------------

  const sellerPatterns = [
    "продам",
    "продажа",
    "продаю",
    "продається",
    "продается",

    "в наличии",
    "є в наявності",

    "доставка",
    "магазин",
    "магазин",

    "опт",
    "оптом",

    "новый товар",
    "новинка",

    "купить у нас",
    "заказать",
    "замовити",

    "телефоны в наличии",
    "телефони в наявності"
  ];


  if (
    containsAny(
      text,
      sellerPatterns
    )
  ) {
    return false;
  }


  // ----------------------------------------------------------
  // Reject accessories / services / unrelated products
  // ----------------------------------------------------------

  const excludedPatterns = [
    "чохол",
    "чехол",
    "case",

    "дисплей",
    "экран",
    "екран",

    "стекло",
    "скло",

    "защитное стекло",
    "захисне скло",

    "подписка",
    "підписка",

    "аккаунт",
    "акаунт",

    "игра",
    "гра",

    "ремонт",
    "ремонтую",

    "запчасти",
    "запчастина",

    "аксессуар",
    "аксесуари",

    "зарядка",
    "зарядное устройство",

    "чехлы",

    "наушники",

    "кабель",
    "кабели",

    "стекла для",

    "ремонт телефона",
    "ремонт iphone",
    "ремонт samsung"
  ];


  if (
    containsAny(
      text,
      excludedPatterns
    )
  ) {
    return false;
  }


  return true;
}


// ============================================================
// GET DETECTED PRODUCT
// ============================================================

function getDetectedProduct(item) {

  const title =
    item.title ||
    item.name ||
    "";

  const description =
    item.description ||
    item.text ||
    item.details ||
    "";

  const text =
    `${title} ${description}`;

  return detectProduct(text);
}


// ============================================================
// DUPLICATE KEY
// ============================================================

function getDuplicateKey(item) {

  return String(
    item.listingId ||
    item.id ||
    item.url ||
    item.title ||
    Math.random()
  );
}


// ============================================================
// END OF PART 1
// ============================================================
// ============================================================
// APIFY HELPERS
// ============================================================

function apifyHeaders() {
  return {
    "Content-Type": "application/json",
  };
}


// ============================================================
// START APIFY RUN
// ============================================================

async function startApifyRun(
  searchQuery,
  maxItems = 25
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

  const response =
    await fetch(url, {
      method: "POST",
      headers: apifyHeaders(),
      body: JSON.stringify(input),
    });

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

  let data;

  try {
    data = JSON.parse(text);
  } catch (error) {
    throw new Error(
      "Apify returned invalid JSON."
    );
  }

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


// ============================================================
// GET APIFY RUN STATUS
// ============================================================

async function getApifyRun(
  runId
) {
  const token =
    process.env.APIFY_API_TOKEN;

  if (!token) {
    throw new Error(
      "APIFY_API_TOKEN missing."
    );
  }

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

  let data;

  try {
    data = JSON.parse(text);
  } catch (error) {
    throw new Error(
      "Apify status returned invalid JSON."
    );
  }

  return data.data || data;
}


// ============================================================
// WAIT FOR APIFY RUN
// ============================================================

async function waitForApifyRun(
  runId,
  datasetId
) {
  const maxAttempts = 60;

  for (
    let attempt = 0;
    attempt < maxAttempts;
    attempt++
  ) {

    const run =
      await getApifyRun(runId);

    const status =
      String(
        run.status || ""
      ).toUpperCase();

    console.log(
      "APIFY STATUS:",
      runId,
      status,
      "attempt:",
      attempt + 1
    );


    if (
      status === "SUCCEEDED"
    ) {
      return {
        status,
        datasetId:
          run.defaultDatasetId ||
          datasetId ||
          null,
      };
    }


    if (
      status === "FAILED" ||
      status === "ABORTED" ||
      status === "TIMED-OUT"
    ) {
      throw new Error(
        `Apify run ended with status: ${status}`
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
    "Apify run timeout."
  );
}


// ============================================================
// GET DATASET ITEMS
// ============================================================

async function getApifyDataset(
  datasetId
) {
  if (!datasetId) {
    throw new Error(
      "Apify dataset ID missing."
    );
  }

  const token =
    process.env.APIFY_API_TOKEN;

  if (!token) {
    throw new Error(
      "APIFY_API_TOKEN missing."
    );
  }

  const url =
    `https://api.apify.com/v2/datasets/${datasetId}/items?token=${encodeURIComponent(token)}`;

  const response =
    await fetch(url);

  const text =
    await response.text();

  console.log(
    "APIFY DATASET RESPONSE:",
    response.status
  );

  if (!response.ok) {
    throw new Error(
      `Apify dataset failed: ${response.status}`
    );
  }

  let data;

  try {
    data = JSON.parse(text);
  } catch (error) {
    throw new Error(
      "Apify dataset returned invalid JSON."
    );
  }

  const items =
    normalizeItems(data);

  console.log(
    "APIFY DATASET ITEMS:",
    items.length
  );

  return items;
}


// ============================================================
// RUN COMPLETE APIFY SEARCH
// ============================================================

async function runApifySearch(
  searchQuery,
  maxItems = 25
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
    completed.status
  );

  const items =
    await getApifyDataset(
      completed.datasetId
    );

  return normalizeItems(items);
}


// ============================================================
// CONCURRENCY
// ============================================================

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

        const result =
          await jobs[index]();

        results[index] =
          normalizeItems(result);

      } catch (error) {

        console.error(
          "SEARCH JOB ERROR:",
          error.message
        );

        results[index] = [];
      }
    }
  }


  const workers = [];

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


  return results.flatMap(
    result =>
      normalizeItems(result)
  );
}


// ============================================================
// END OF PART 2
// ============================================================
// ============================================================
// PURCHASE SEARCH QUERIES
// ============================================================

function getPurchaseQueries() {
  return [

    // iPhone 12 and above
    "куплю iphone 12",
    "куплю iphone 13",
    "куплю iphone 14",
    "куплю iphone 15",
    "куплю iphone 16",

    "шукаю iphone 12",
    "шукаю iphone 13",
    "шукаю iphone 14",
    "шукаю iphone 15",
    "шукаю iphone 16",

    "хочу купить iphone 12",
    "хочу купить iphone 13",
    "хочу купить iphone 14",
    "хочу купить iphone 15",
    "хочу купить iphone 16",

    // Samsung Galaxy S21 and above
    "куплю samsung galaxy s21",
    "куплю samsung galaxy s22",
    "куплю samsung galaxy s23",
    "куплю samsung galaxy s24",
    "куплю samsung galaxy s25",

    "шукаю samsung galaxy s21",
    "шукаю samsung galaxy s22",
    "шукаю samsung galaxy s23",
    "шукаю samsung galaxy s24",
    "шукаю samsung galaxy s25",

    "хочу купить samsung galaxy s21",
    "хочу купить samsung galaxy s22",
    "хочу купить samsung galaxy s23",
    "хочу купить samsung galaxy s24",
    "хочу купить samsung galaxy s25",

    // PlayStation 5
    "куплю ps5",
    "куплю playstation 5",
    "шукаю ps5",
    "шукаю playstation 5",
    "хочу купить ps5",
    "хочу купить playstation 5",

    // MacBook
    "куплю macbook",
    "шукаю macbook",
    "хочу купить macbook",

    // Gaming Laptop
    "куплю игровой ноутбук",
    "шукаю игровой ноутбук",
    "хочу купить игровой ноутбук",

    "куплю ігровий ноутбук",
    "шукаю ігровий ноутбук",
    "хочу купити ігровий ноутбук"
  ];
}


// ============================================================
// SEARCH PURCHASE REQUESTS
// ============================================================

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

  console.log(
    "PURCHASE QUERIES:",
    queries.length
  );


  // ----------------------------------------------------------
  // Create Apify search jobs
  // ----------------------------------------------------------

  const jobs =
    queries.map(
      query =>
        async () => {

          console.log(
            "PURCHASE SEARCH QUERY:",
            query
          );

          const items =
            await runApifySearch(
              query,
              25
            );


          const normalized =
            normalizeItems(items);


          console.log(
            "PURCHASE QUERY RESULTS:",
            query,
            normalized.length
          );


          return normalized.map(
            item => ({
              ...item,

              purchaseSearchQuery:
                query
            })
          );
        }
    );


  // ----------------------------------------------------------
  // Run searches with limited concurrency
  // ----------------------------------------------------------

  const rawItems =
    await runWithConcurrency(
      jobs,
      4
    );


  console.log(
    "PURCHASE RAW ITEMS:",
    rawItems.length
  );


  // ----------------------------------------------------------
  // Diagnostic logging
  // ----------------------------------------------------------

  const purchaseSamples =
    rawItems.filter(
      item => {

        const title =
          normalizeText(
            item.title ||
            item.name ||
            ""
          );

        const description =
          normalizeText(
            item.description ||
            item.text ||
            ""
          );

        const text =
          `${title} ${description}`;

        return containsAny(
          text,
          [
            "куплю",
            "ищу",
            "нужен",
            "нужна",
            "нужно",
            "шукаю",
            "потрібен",
            "потрібна",
            "потрібно"
          ]
        );
      }
    );


  console.log(
    "PURCHASE INTENT SAMPLES:",
    JSON.stringify(
      purchaseSamples.slice(0, 10),
      null,
      2
    )
  );


  console.log(
    "PURCHASE TITLES SAMPLE:",
    rawItems
      .slice(0, 20)
      .map(
        item =>
          item.title ||
          item.name ||
          ""
      )
  );


  // ----------------------------------------------------------
  // Filter and remove duplicates
  // ----------------------------------------------------------

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
      unique.has(key)
    ) {
      continue;
    }


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
        "OLX"
    };


    unique.set(
      key,
      prepared
    );
  }


  const results =
    Array.from(
      unique.values()
    );


  console.log(
    "PURCHASE FINAL RESULTS:",
    results.length
  );


  // ----------------------------------------------------------
  // Save results to Telegram session
  // ----------------------------------------------------------

  const session =
    await sessionsStore.get(
      `chat-${chatId}`,
      {
        type: "json"
      }
    );


  const updatedSession =
    session || {
      step: "idle",
      purchaseRequests: [],
      selectedRequest: null,
      selectedNumber: null
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


  // ----------------------------------------------------------
  // No results
  // ----------------------------------------------------------

  if (!results.length) {

    await sendTelegram(
      token,
      chatId,

      "⚠️ انتهى البحث في OLX، لكن لم يتم العثور على طلبات شراء مطابقة للفئات المطلوبة.\n\n" +

      "المطلوب البحث عنه:\n" +

      "📱 iPhone 12 وما فوق\n" +
      "📱 Samsung Galaxy S21 وما فوق\n" +
      "🎮 PlayStation 5\n" +
      "💻 MacBook\n" +
      "💻 Gaming Laptop\n\n" +

      "يمكنك إعادة المحاولة بإرسال:\n" +
      "/search"
    );

    return;
  }


  // ----------------------------------------------------------
  // Build Telegram results
  // ----------------------------------------------------------

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


// ============================================================
// END OF PART 3
// ============================================================
// ============================================================
// FORMAT PURCHASE REQUEST
// ============================================================

function formatPurchaseRequest(
  item,
  number
) {
  const detected =
    getDetectedProduct(item);

  const title =
    item.title ||
    item.name ||
    "بدون عنوان";

  const description =
    item.description ||
    item.text ||
    item.details ||
    "";

  const city =
    item.city ||
    item.location ||
    item.region ||
    "غير محدد";

  const region =
    item.region ||
    "";

  const url =
    item.url ||
    item.link ||
    item.listingUrl ||
    "";

  const price =
    item.price ||
    item.priceKop ||
    null;

  const currency =
    item.currency ||
    "UAH";


  let message =
    "🔹 طلب شراء رقم " +
    number +
    "\n\n";


  // ----------------------------------------------------------
  // Product
  // ----------------------------------------------------------

  message +=
    "📦 المنتج: " +
    (
      detected
        ? detected.product
        : title
    ) +
    "\n";


  // ----------------------------------------------------------
  // Original title
  // ----------------------------------------------------------

  message +=
    "📝 الإعلان: " +
    title +
    "\n";


  // ----------------------------------------------------------
  // Location
  // ----------------------------------------------------------

  message +=
    "📍 المدينة: " +
    city +
    "\n";


  if (
    region &&
    region !== city
  ) {
    message +=
      "🗺 المنطقة: " +
      region +
      "\n";
  }


  // ----------------------------------------------------------
  // Price
  // ----------------------------------------------------------

  if (
    price !== null &&
    price !== undefined &&
    price !== ""
  ) {

    let displayPrice =
      price;

    if (
      typeof price === "number" &&
      item.priceKop
    ) {
      displayPrice =
        price / 100;
    }

    message +=
      "💰 السعر المذكور: " +
      displayPrice +
      " " +
      currency +
      "\n";
  }


  // ----------------------------------------------------------
  // Description
  // ----------------------------------------------------------

  if (
    description
  ) {

    const shortDescription =
      String(description)
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 500);

    message +=
      "\n📄 التفاصيل:\n" +
      shortDescription +
      "\n";
  }


  // ----------------------------------------------------------
  // Source
  // ----------------------------------------------------------

  message +=
    "\n🌐 المصدر: OLX\n";


  // ----------------------------------------------------------
  // Link
  // ----------------------------------------------------------

  if (url) {
    message +=
      "🔗 الرابط:\n" +
      url +
      "\n";
  }


  return message;
}


// ============================================================
// SEND TELEGRAM MESSAGE
// ============================================================

async function sendTelegram(
  token,
  chatId,
  text
) {
  if (!token) {
    throw new Error(
      "TELEGRAM_BOT_TOKEN missing."
    );
  }

  if (!chatId) {
    throw new Error(
      "Telegram chat ID missing."
    );
  }

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
          text: text,
          disable_web_page_preview:
            false
        })
      }
    );


  const result =
    await response.text();


  console.log(
    "TELEGRAM RESPONSE:",
    response.status,
    result
  );


  if (!response.ok) {
    throw new Error(
      `Telegram send failed: ${response.status}`
    );
  }


  let data;

  try {
    data =
      JSON.parse(result);
  } catch (error) {
    throw new Error(
      "Telegram returned invalid JSON."
    );
  }


  if (!data.ok) {
    throw new Error(
      data.description ||
      "Telegram API error."
    );
  }


  return data;
}


// ============================================================
// SEND LONG TELEGRAM MESSAGE
// ============================================================

async function sendLongTelegram(
  token,
  chatId,
  text
) {
  const maxLength =
    4000;

  if (
    !text ||
    !String(text).trim()
  ) {
    return;
  }


  const value =
    String(text);


  if (
    value.length <= maxLength
  ) {

    await sendTelegram(
      token,
      chatId,
      value
    );

    return;
  }


  let start = 0;


  while (
    start < value.length
  ) {

    let end =
      Math.min(
        start + maxLength,
        value.length
      );


    if (
      end < value.length
    ) {

      const lastBreak =
        value.lastIndexOf(
          "\n",
          end
        );


      if (
        lastBreak > start
      ) {
        end =
          lastBreak;
      }
    }


    const part =
      value.slice(
        start,
        end
      ).trim();


    if (part) {

      await sendTelegram(
        token,
        chatId,
        part
      );
    }


    start =
      end;
  }
}


// ============================================================
// END OF PART 4
// ============================================================
// ============================================================
// SELLER SEARCH
// ============================================================

async function searchSellers(
  chatId,
  token,
  request
) {
  const product =
    request.exactProduct ||
    request.requestSearchProduct ||
    request.title ||
    "";

  console.log(
    "SELLER SEARCH START:",
    product
  );

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


  const queries = [
    product,
    `${product} продам`,
    `${product} продаю`
  ];


  const jobs =
    queries.map(
      query =>
        async () => {

          const items =
            await runApifySearch(
              query,
              25
            );

          return normalizeItems(
            items
          ).map(
            item => ({
              ...item,
              sellerSearchQuery:
                query
            })
          );
        }
    );


  const rawItems =
    await runWithConcurrency(
      jobs,
      3
    );


  const unique =
    new Map();


  for (
    const item of rawItems
  ) {

    const title =
      normalizeText(
        item.title ||
        item.name ||
        ""
      );

    const description =
      normalizeText(
        item.description ||
        item.text ||
        ""
      );

    const text =
      `${title} ${description}`;


    if (!text) {
      continue;
    }


    const sellerWords = [
      "продам",
      "продаю",
      "продажа",
      "продається",
      "продается",
      "в наличии",
      "є в наявності"
    ];


    if (
      !containsAny(
        text,
        sellerWords
      )
    ) {
      continue;
    }


    const excluded = [
      "чохол",
      "чехол",
      "case",
      "дисплей",
      "экран",
      "екран",
      "стекло",
      "скло",
      "подписка",
      "підписка",
      "аккаунт",
      "акаунт",
      "игра",
      "гра",
      "ремонт",
      "запчасти",
      "запчастина",
      "аксессуар",
      "аксесуари"
    ];


    if (
      containsAny(
        text,
        excluded
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


  if (!results.length) {

    await sendTelegram(
      token,
      chatId,
      "⚠️ لم يتم العثور على إعلانات بيع مطابقة للطلب المحدد.\n\n" +
      "يمكنك اختيار طلب شراء آخر وإعادة البحث."
    );

    return;
  }


  let message =
    "✅ انتهى البحث عن البائعين.\n\n" +
    `وجد الوكيل ${results.length} إعلان بيع.\n\n`;


  for (
    let i = 0;
    i < results.length;
    i++
  ) {

    message +=
      formatSellerResult(
        results[i],
        i + 1
      );

    message +=
      "\n━━━━━━━━━━━━━━\n\n";
  }


  await sendLongTelegram(
    token,
    chatId,
    message
  );
}


// ============================================================
// FORMAT SELLER RESULT
// ============================================================

function formatSellerResult(
  item,
  number
) {
  const title =
    item.title ||
    item.name ||
    "بدون عنوان";

  const city =
    item.city ||
    item.location ||
    item.region ||
    "غير محدد";

  const region =
    item.region ||
    "";

  const url =
    item.url ||
    item.link ||
    item.listingUrl ||
    "";

  let price =
    item.price ||
    item.priceKop ||
    null;

  if (
    typeof price === "number" &&
    item.priceKop
  ) {
    price =
      price / 100;
  }

  const currency =
    item.currency ||
    "UAH";


  let message =
    "🔹 إعلان بيع رقم " +
    number +
    "\n\n";

  message +=
    "📦 المنتج: " +
    title +
    "\n";

  message +=
    "📍 المدينة: " +
    city +
    "\n";


  if (
    region &&
    region !== city
  ) {
    message +=
      "🗺 المنطقة: " +
      region +
      "\n";
  }


  if (
    price !== null &&
    price !== undefined &&
    price !== ""
  ) {
    message +=
      "💰 السعر: " +
      price +
      " " +
      currency +
      "\n";
  }


  message +=
    "🌐 المصدر: OLX\n";


  if (url) {
    message +=
      "🔗 الرابط:\n" +
      url +
      "\n";
  }


  return message;
}


// ============================================================
// NETLIFY FUNCTION HANDLER
// ============================================================

exports.handler =
  async function(event) {

    try {

      connectLambda(event);


      sessionsStore =
        getStore(
          "trade-agent-sessions"
        );


      let body = {};


      if (
        event.body
      ) {
        try {
          body =
            JSON.parse(
              event.body
            );
        } catch (error) {
          console.error(
            "INVALID REQUEST BODY:",
            error.message
          );
        }
      }


      const mode =
        body.mode ||
        body.searchMode ||
        "";


      const chatId =
        body.chatId ||
        body.chat_id;


      const token =
        process.env
          .TELEGRAM_BOT_TOKEN;


      if (!chatId) {
        return {
          statusCode: 400,
          body:
            "Missing chatId"
        };
      }


      if (!token) {
        return {
          statusCode: 500,
          body:
            "TELEGRAM_BOT_TOKEN missing"
        };
      }


      // --------------------------------------------------------
      // PURCHASE REQUEST SEARCH
      // --------------------------------------------------------

      if (
        mode ===
        "purchaseRequests"
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


        return {
          statusCode: 200,
          body: "OK"
        };
      }


      // --------------------------------------------------------
      // SELLER SEARCH
      // --------------------------------------------------------

      if (
        mode === "seller"
      ) {

        const request =
          body.request ||
          body.selectedRequest;


        if (!request) {

          return {
            statusCode: 400,
            body:
              "Missing selected request"
          };
        }


        try {

          await searchSellers(
            chatId,
            token,
            request
          );

        } catch (error) {

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


        return {
          statusCode: 200,
          body: "OK"
        };
      }


      // --------------------------------------------------------
      // UNKNOWN MODE
      // --------------------------------------------------------

      return {
        statusCode: 400,
        body:
          "Unknown search mode"
      };


    } catch (error) {

      console.error(
        "BACKGROUND FUNCTION ERROR:",
        error
      );


      return {
        statusCode: 500,
        body:
          "Internal server error: " +
          error.message
      };
    }
  };


// ============================================================
// END OF FILE
// ============================================================
