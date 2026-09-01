exports.handler = async () => {
const token = process.env.TELEGRAM_BOT_TOKEN;

if (!token) {
return {
statusCode: 500,
body: "TELEGRAM_BOT_TOKEN is not configured"
};
}

const webhookUrl =
"https://coruscating-alpaca-71b3d8.netlify.app/.netlify/functions/telegram-webhook";

const telegramUrl =
"https://api.telegram.org/bot${token}/setWebhook?url=${encodeURIComponent(webhookUrl)}";

const response = await fetch(telegramUrl);

const result = await response.json();

return {
statusCode: response.ok ? 200 : 502,
headers: {
"Content-Type": "application/json"
},
body: JSON.stringify(result)
};
};