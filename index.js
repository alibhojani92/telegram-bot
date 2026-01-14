const express = require("express");
const TelegramBot = require("node-telegram-bot-api");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.BOT_TOKEN;
const WEBHOOK_URL = process.env.WEBHOOK_URL;

const bot = new TelegramBot(BOT_TOKEN);

// Webhook
bot.setWebHook(`${WEBHOOK_URL}/bot${BOT_TOKEN}`);

app.post(`/bot${BOT_TOKEN}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// ================= HELPER =================
function prefix(msg) {
  if (msg.chat.type === "group" || msg.chat.type === "supergroup") {
    return "Dear Arzoo.\n";
  }
  return "";
}

// ================= COMMANDS =================

bot.onText(/\/start|#start/, (msg) => {
  bot.sendMessage(
    msg.chat.id,
    `${prefix(msg)}GPSC DENTAL PULSE BOT is Running ✅`
  );
});

bot.onText(/\/read|#read/, (msg) => {
  bot.sendMessage(
    msg.chat.id,
    `${prefix(msg)}📖 Reading started.\nStay focused 💪`
  );
});

bot.onText(/\/stop|#stop/, (msg) => {
  bot.sendMessage(
    msg.chat.id,
    `${prefix(msg)}⏹ Reading stopped.\nGood effort 👍`
  );
});

bot.onText(/\/dt|#dt/, (msg) => {
  bot.sendMessage(
    msg.chat.id,
    `${prefix(msg)}📝 Daily Test started.\n20 MCQs incoming 📊`
  );
});

bot.onText(/\/dts|#dts/, (msg) => {
  bot.sendMessage(
    msg.chat.id,
    `${prefix(msg)}📝 Weekend Test started.\n50 MCQs 💯`
  );
});

// ================= HEALTH CHECK =================
app.get("/", (req, res) => {
  res.send("GPSC Dental Pulse Bot is Live 🚀");
});

app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
