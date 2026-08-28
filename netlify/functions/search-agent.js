exports.handler = async function (event) {

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({
        ok: false,
        message: "Method Not Allowed"
      })
    };
  }

  try {

    const data = JSON.parse(event.body || "{}");

    const product = String(data.product || "").trim();
    const maxPrice = Number(data.maxPrice || 0);
    const minProfit = Number(data.minProfit || 0);
    const region = String(data.region || "أوكرانيا").trim();

    if (!product || maxPrice <= 0 || minProfit <= 0) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          ok: false,
          message: "بيانات البحث غير مكتملة"
        })
      };
    }

    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!token || !chatId) {
      return {
        statusCode: 500,
        body: JSON.stringify({
          ok: false,
          message: "إعدادات Telegram غير موجودة في Netlify"
        })
      };
    }

    const message =
      "🔎 طلب جديد من Smart Trade Agent\n\n" +
      "📦 المنتج: " + product + "\n" +
      "💰 أقصى شراء: " + maxPrice.toLocaleString() + " грн\n" +
      "📈 أدنى ربح: " + minProfit.toLocaleString() + " грн\n" +
      "🇺🇦 المنطقة: " + region;

    const telegramResponse = await fetch(
      "https://api.telegram.org/bot" + token + "/sendMessage",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          chat_id: chatId,
          text: message
        })
      }
    );

    const telegramData = await telegramResponse.json();

    if (!telegramResponse.ok || !telegramData.ok) {
      return {
        statusCode: 502,
        body: JSON.stringify({
          ok: false,
          message: "فشل إرسال الطلب إلى Telegram"
        })
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        message: "تم إرسال الطلب إلى الوكيل وTelegram"
      })
    };

  } catch (error) {

    return {
      statusCode: 500,
      body: JSON.stringify({
        ok: false,
        message: "حدث خطأ في الوكيل"
      })
    };
  }
};