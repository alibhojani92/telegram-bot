const express = require("express");
const TelegramBot = require("node-telegram-bot-api");

const app = express();
app.use(express.json());

const TOKEN = process.env.BOT_TOKEN;
const PORT = process.env.PORT || 3000;
const BOT_NAME = "GPSC DENTAL PULSE BOT";

const bot = new TelegramBot(TOKEN);
const WEBHOOK_URL = `https://telegram-bot-i9v0.onrender.com/bot${TOKEN}`;

// ---------- WEBHOOK ----------
bot.setWebHook(WEBHOOK_URL);

app.post(`/bot${TOKEN}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// ---------- BASIC ROUTE (Render + UptimeRobot) ----------
app.get("/", (req, res) => {
  res.send("Bot is alive ✅");
});

// ---------- START COMMAND ----------
bot.onText(/\/start/, (msg) => {
  bot.sendMessage(
    msg.chat.id,
    `Dear Arzoo 🌸\n\n${BOT_NAME} Running ✅`
  );
});

// ---------- READ COMMAND ----------
bot.onText(/^(\/read|#read)$/i, (msg) => {
  bot.sendMessage(
    msg.chat.id,
    `Dear Arzoo 📖\n\nReading started.\nStay focused 💪`
  );
});

// ---------- EXAM COUNTDOWN ----------
const EXAM_DATE = new Date("2026-02-18T09:00:00");

function sendCountdown(chatId) {
  const now = new Date();
  const diff = EXAM_DATE - now;
  if (diff <= 0) return;

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  bot.sendMessage(
    chatId,
    `Dear Arzoo ⏳\n\nExam Countdown:\n📅 ${days} days remaining\nStay consistent 💪`
  );
}

// ---------- DAILY SCHEDULE ----------
setInterval(() => {
  const now = new Date();
  const h = now.getHours();
  const m = now.getMinutes();

  // 8 AM, 12 PM, 5 PM, 10 PM
  if (
    (h === 8 || h === 12 || h === 17 || h === 22) &&
    m === 0
  ) {
    sendCountdown(process.env.GROUP_ID);
  }
}, 60000);

// ---------- GOOD NIGHT MOTIVATION ----------
function sendGoodNight(chatId, passed = true) {
  const messagesPass = [
    "Excellent discipline today 🌟",
    "Consistency is building success 💪",
    "Strong effort today, proud of you 👏",
  ];
  const messagesFail = [
    "Tomorrow is a new chance 🌅",
    "Small steps daily lead to big success 💡",
    "Don’t stop, keep pushing 💪",
  ];

  const msg = passed
    ? messagesPass[Math.floor(Math.random() * messagesPass.length)]
    : messagesFail[Math.floor(Math.random() * messagesFail.length)];

  bot.sendMessage(
    chatId,
    `Dear Arzoo 🌙\n\n${msg}\n\nGood Night 😴`
  );
}

// ---------- SERVER ----------
app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
