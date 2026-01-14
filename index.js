/*************************************************
 * GPSC DENTAL PULSE STUDY BOT
 * Student: Arzoo
 * Hosting: Render (FREE) + UptimeRobot
 * Mode: Webhook (Stable)
 *************************************************/

const express = require("express");
const TelegramBot = require("node-telegram-bot-api");

const app = express();
app.use(express.json());

// ================= CONFIG =================
const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.BOT_TOKEN;
const WEBHOOK_URL = process.env.WEBHOOK_URL;

const STUDENT_NAME = "Arzoo";
const EXAM_DATE = new Date("2026-02-18T00:00:00");

// ================= BOT INIT =================
const bot = new TelegramBot(BOT_TOKEN);

// Webhook setup
bot.setWebHook(`${WEBHOOK_URL}/bot${BOT_TOKEN}`);

app.post(`/bot${BOT_TOKEN}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// ================= HELPERS =================
function isGroup(msg) {
  return msg.chat.type === "group" || msg.chat.type === "supergroup";
}

function prefix(msg) {
  return isGroup(msg) ? `Dear ${STUDENT_NAME}.\n` : "";
}

function daysRemaining() {
  const today = new Date();
  const diff = EXAM_DATE - today;
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

// ================= BASIC COMMANDS =================
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

// ================= DAILY TEST (SIMULATION HOOK) =================
let lastTestResult = null;

bot.onText(/\/dt|#dt/, (msg) => {
  if (!isGroup(msg)) return;

  bot.sendMessage(
    msg.chat.id,
    `${prefix(msg)}📝 Daily Test started.\n20 MCQs incoming 📊`
  );

  // ---- SIMULATION: after some time test ends ----
  // (In your full MCQ engine, this part auto triggers)
  setTimeout(() => {
    // Example score logic (replace with real one later)
    const score = Math.floor(Math.random() * 21); // 0–20
    let result;

    if (score >= 16) result = "EXCELLENT";
    else if (score >= 14) result = "GOOD";
    else if (score >= 12) result = "PASS";
    else result = "FAIL";

    lastTestResult = result;

    bot.sendMessage(
      msg.chat.id,
      `${prefix(msg)}📝 Test Completed\nScore: ${score}/20\nResult: ${result}`
    );

    // Good Night message after 5 minutes
    setTimeout(() => {
      sendGoodNight(msg.chat.id, result);
    }, 5 * 60 * 1000);

  }, 20 * 1000); // demo delay
});

// ================= GOOD NIGHT MOTIVATION =================
function sendGoodNight(chatId, result) {
  let messages = [];

  if (result === "EXCELLENT") {
    messages = [
      "Today’s performance was excellent.\nConsistency like this builds rank.",
      "Excellent accuracy today.\nMaintain this discipline."
    ];
  } else if (result === "GOOD") {
    messages = [
      "Today’s performance was good.\nWith a little more revision, it can be excellent.",
      "Good progress today.\nFocus on weak areas tomorrow."
    ];
  } else if (result === "PASS") {
    messages = [
      "You cleared the test, but improvement is needed.\nAnalyse mistakes tomorrow.",
      "Passing is fine, mastery is better.\nWork on weak topics."
    ];
  } else {
    messages = [
      "Today’s result was not as expected.\nThis is feedback, not failure.",
      "Result was weak today.\nCorrect mistakes and move forward."
    ];
  }

  const msg =
    `Dear ${STUDENT_NAME}.\n🌙 Good Night 🌙\n\n` +
    messages[Math.floor(Math.random() * messages.length)] +
    `\n\nRest well. Tomorrow is a new opportunity 📘`;

  bot.sendMessage(chatId, msg);
}

// ================= EXAM COUNTDOWN (4 TIMES DAILY) =================
const COUNTDOWN_TIMES = [
  { h: 8, m: 0 },
  { h: 12, m: 0 },
  { h: 17, m: 0 },
  { h: 22, m: 0 }
];

setInterval(() => {
  const now = new Date();
  const h = now.getHours();
  const m = now.getMinutes();

  COUNTDOWN_TIMES.forEach(t => {
    if (h === t.h && m === t.m) {
      const days = daysRemaining();
      if (days >= 0) {
        bot.sendMessage(
          process.env.GROUP_ID || "",
          `Dear ${STUDENT_NAME}.\n🦷 GPSC DENTAL EXAM COUNTDOWN ⏳\n\n📅 Exam Date: 18-Feb-2026\n⏰ Days Remaining: ${days} days\n\nEvery day matters. Stay disciplined 💪📚`
        );
      }
    }
  });
}, 60 * 1000);

// ================= HEALTH CHECK =================
app.get("/", (req, res) => {
  res.send("GPSC Dental Pulse Bot is Live 🚀");
});

// ================= START SERVER =================
app.listen(PORT, () => {
  console.log("Server running on port", PORT);
  console.log("GPSC Dental Pulse Bot started ✅");
});
