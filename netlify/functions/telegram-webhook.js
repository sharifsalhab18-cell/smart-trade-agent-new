const sessions = {};

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

    if (!token) {
      return {
        statusCode: 500,
        body: "TELEGRAM_BOT_TOKEN is not configured"
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
      const price = Number(text.replace(/[^\d.]/g, ""));

      if (!price || price <= 0) {
        reply = "❌ أرسل سعرًا صحيحًا، مثال: 15000";
      } else {
        session.maxPrice = price;
        session.step = "minProfit";

        reply =
          "💰 أقصى سعر شراء: " + price + " грн\n\n" +
          "الآن أرسل أدنى ربح تريده بالـ hryvnia (грн).\n\n" +
          "مثال: 3000";
      }
    }

    else if (session.step === "minProfit") {
      const profit = Number(text.replace(/[^\d.]/g, ""));

      if (!profit || profit <= 0) {
        reply = "❌ أرسل ربحًا صحيحًا، مثال: 3000";
      } else {
        session.minProfit = profit;
        session.step = "ready";

        reply =
          "✅ تم تسجيل طلب البحث:\n\n" +
          "📦 المنتج: " + session.product + "\n" +
          "💰 أقصى شراء: " + session.maxPrice + " грн\n" +
          "📈 أدنى ربح: " + session.minProfit + " грн\n" +
          "🇺🇦 المنطقة: أوكرانيا\n\n" +
          "🔎 الوكيل جاهز للبحث الحقيقي.";
      }
    }

    else {
      reply =
        "استخدم /search لبدء بحث جديد.";
    }

    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: reply
      })
    });

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