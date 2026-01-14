const express = require("express");
const TelegramBot = require("node-telegram-bot-api");

const app = express();
app.use(express.json());

const TOKEN = process.env.BOT_TOKEN;
const GROUP_ID = process.env.GROUP_ID;
const PORT = process.env.PORT || 3000;

// ================= BOT =================
const bot = new TelegramBot(TOKEN);
const BOT_NAME = "GPSC DENTAL PULSE BOT";

// ================= DATA =================
let readingStart = null;
let studiedToday = 0;
const DAILY_TARGET = 8; // hours

const motivationQuotes = [
  "Success comes from consistency, not intensity.",
  "Every page you read is a step closer to success.",
  "Small progress daily leads to big results.",
  "Discipline beats motivation every time.",
  "Your future self will thank you for today’s effort."
];

function randomQuote() {
  return motivationQuotes[Math.floor(Math.random() * motivationQuotes.length)];
}

// ================= WEBHOOK =================
const WEBHOOK_URL = `https://telegram-bot-i9v0.onrender.com/webhook`;
bot.setWebHook(WEBHOOK_URL);

// ================= EXPRESS =================
app.post("/webhook", (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

app.get("/", (req, res) => {
  res.send("GPSC DENTAL PULSE BOT is running ✅");
});

app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});

// ================= COMMANDS =================

// START
bot.onText(/\/start/, (msg) => {
  bot.sendMessage(
    msg.chat.id,
    `Dear Arzoo 🌸

🤖 *${BOT_NAME}* is running ✅`,
    { parse_mode: "Markdown" }
  );
});

// READ START
bot.onText(/(\/read|#read)/, (msg) => {
  if (!readingStart) {
    readingStart = Date.now();
    bot.sendMessage(
      msg.chat.id,
      `Dear Arzoo 📖

Reading started.
Stay focused 💪`
    );
  } else {
    bot.sendMessage(
      msg.chat.id,
      `Dear Arzoo 📚

Reading already running 💡`
    );
  }
});

// STOP READING (FIXED)
bot.onText(/\/stop/, (msg) => {
  if (!readingStart) {
    bot.sendMessage(
      msg.chat.id,
      `Dear Arzoo ⚠️

Reading is not active.`
    );
    return;
  }

  const diff = (Date.now() - readingStart) / (1000 * 60 * 60);
  studiedToday += diff;
  readingStart = null;

  const remaining = Math.max(0, DAILY_TARGET - studiedToday).toFixed(2);

  bot.sendMessage(
    msg.chat.id,
    `Dear Arzoo ⏱️

📚 Studied: ${studiedToday.toFixed(2)} hrs
🎯 Target: ${DAILY_TARGET} hrs
⏳ Remaining: ${remaining} hrs`
  );
});

// ================= DAILY 6 AM MESSAGE =================
setInterval(() => {
  const now = new Date();
  if (now.getHours() === 6 && now.getMinutes() === 0) {
    studiedToday = 0;
    readingStart = null;

    bot.sendMessage(
      GROUP_ID,
      `🌅 Good Morning Dear Arzoo 🌸

📚 Quote of the day:
"${randomQuote()}"

🎯 Today’s Reading Target: 8 hours
Let’s make today productive 💪`
    );
  }
}, 60000);
