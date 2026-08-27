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
      return { statusCode: 500, body: "TELEGRAM_BOT_TOKEN is not configured" };
    }

    // Temporary conversation state
    const state = text === "/search" ? "product" : "next";

    let reply;

    if (text === "/start") {
      reply =
        "Welcome to Smart Trade Agent 🤖\n\n" +
        "Agent connected successfully. Bot ready.\n\n" +
        "استخدم /search لبدء البحث عن فرصة تجارية.";
    } else if (text === "/search") {
      reply =
        "🔎 Smart Trade Agent\n\n" +
        "أرسل اسم المنتج الذي تريد البحث عنه.\n\n" +
        "مثال:\n" +
        "iPhone 13";
    } else {
      reply =
        "📦 المنتج: " + text + "\n\n" +
        "الآن أرسل أقصى سعر شراء تريده بالـ hryvnia (грн).\n\n" +
        "مثال: 15000";
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