exports.handler = async (event) => {
  try {
    const body = JSON.parse(event.body || "{}");
    const message = body.message;

    if (!message || !message.chat) {
      return {
        statusCode: 200,
        body: "OK"
      };
    }

    const chatId = message.chat.id;
    const text = message.text || "";

    let reply = "Welcome to Smart Trade Agent 🤖";

    if (text === "/start") {
      reply = "Welcome to Smart Trade Agent 🤖\nAgent connected successfully. Bot ready.";
    }

    const token = process.env.TELEGRAM_BOT_TOKEN;

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