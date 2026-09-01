const sessions = {};

exports.handler = async (event) => {
  try {
    const body = JSON.parse(event.body || "{}");
    const message = body.message;

    if (!message || !message.chat) {
      return ok();
    }

    const chatId = message.chat.id;
    const text = (message.text || "").trim();
    const token = process.env.TELEGRAM_BOT_TOKEN;

    if (!token) {
      console.error("TELEGRAM_BOT_TOKEN missing");
      return ok();
    }

    if (text === "/start") {
      await sendTelegram(
        token,
        chatId,
        "Welcome to Trade Agent Smart 🤖\n\n" +
        "Agent connected successfully.\n\n" +
        "استخدم /search للبدء."
      );
      return ok();
    }

    if (text === "/search") {
      await sendTelegram(
        token,
        chatId,
        "🔎 أرسل اسم المنتج الذي تريد البحث عنه.\n\nمثال:\niPhone 14"
      );
      return ok();
    }

    await sendTelegram(
      token,
      chatId,
      "استخدم /start أو /search."
    );

    return ok();

  } catch (error) {
    console.error("FUNCTION ERROR:", error);
    return ok();
  }
};

async function sendTelegram(token, chatId, text) {
  const url =
    `https://api.telegram.org/bot${token}/sendMessage`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      chat_id: chatId,
      text: text
    })
  });

  const result = await response.text();

  console.log("TELEGRAM RESPONSE:", result);
}

function ok() {
  return {
    statusCode: 200,
    body: "OK"
  };
}