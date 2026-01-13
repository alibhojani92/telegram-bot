const express = require("express");
const TelegramBot = require("node-telegram-bot-api");

const app = express();
const PORT = process.env.PORT || 3000;

// ====== Telegram Bot ======
const token = process.env.BOT_TOKEN;
const bot = new TelegramBot(token, { polling: true });

// Test command
bot.onText(/\/start|#start/, (msg) => {
  bot.sendMessage(msg.chat.id, "Hello! Study bot is running ✅");
});

// ====== Dummy Web Server (IMPORTANT for Render) ======
app.get("/", (req, res) => {
  res.send("Bot is running 🚀");
});

app.listen(PORT, () => {
  console.log("Server running on port", PORT);
  console.log("Bot started...");
});
