/***********************
 * STUDY TELEGRAM BOT
 * Dental Pulse 18th Edition
 * Single Student: Arzoo
 * Platform: Render (FREE)
 ***********************/

const express = require("express");
const fs = require("fs");
const path = require("path");
const TelegramBot = require("node-telegram-bot-api");

const app = express();
const PORT = process.env.PORT || 3000;
const token = process.env.BOT_TOKEN;

const bot = new TelegramBot(token, { polling: true });

/* ================= BASIC SETUP ================= */

const STUDENT_NAME = "Arzoo";
const DEFAULT_TARGET_HOURS = 8;
let GROUP_ID = null;

// ---- ADMIN ID (lock) ----
// /start private ma ek vaar lakho, logs ma ID aavse, pachhi yaha set kari dejo
const ADMIN_ID = null; // <-- later set

/* ================= DATA FILES ================= */

const DATA_DIR = path.join(__dirname, "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

const MCQ_FILE = path.join(DATA_DIR, "mcq.json");
const STATS_FILE = path.join(DATA_DIR, "stats.json");

if (!fs.existsSync(MCQ_FILE)) fs.writeFileSync(MCQ_FILE, JSON.stringify({}));
if (!fs.existsSync(STATS_FILE)) {
  fs.writeFileSync(
    STATS_FILE,
    JSON.stringify({
      readingMinutes: 0,
      targetHours: DEFAULT_TARGET_HOURS,
      dailyTestScores: [],
      missedTargets: 0
    })
  );
}

/* ================= HELPERS ================= */

function loadJSON(file) {
  return JSON.parse(fs.readFileSync(file));
}

function saveJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function nowMinutes() {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

function formatHours(min) {
  return (min / 60).toFixed(2);
}

function isWeekend() {
  const d = new Date().getDay();
  return d === 0 || d === 6;
}

/* ================= AUTO GROUP DETECT ================= */

bot.on("message", (msg) => {
  if (msg.chat.type === "group" || msg.chat.type === "supergroup") {
    GROUP_ID = msg.chat.id;
  }
});

/* ================= START ================= */

bot.onText(/\/start/, (msg) => {
  console.log("ADMIN ID:", msg.from.id);
  bot.sendMessage(msg.chat.id, "Study Bot is running ✅");
});

/* ================= READING TIMER ================= */

let readingStart = null;

bot.onText(/(\/read|#read)/, () => {
  readingStart = Date.now();
  bot.sendMessage(GROUP_ID, "📖 Reading started. Stay focused 💪");
});

bot.onText(/(\/stop|#stop)/, () => {
  if (!readingStart) {
    bot.sendMessage(GROUP_ID, "❗ Reading was not started.");
    return;
  }
  const diffMin = Math.floor((Date.now() - readingStart) / 60000);
  readingStart = null;

  const stats = loadJSON(STATS_FILE);
  stats.readingMinutes += diffMin;
  saveJSON(STATS_FILE, stats);

  const remaining =
    stats.targetHours * 60 - stats.readingMinutes;

  bot.sendMessage(
    GROUP_ID,
    `⏱ Reading stopped\n📚 Studied: ${formatHours(
      stats.readingMinutes
    )} hrs\n🎯 Target: ${stats.targetHours} hrs\n⏳ Remaining: ${formatHours(
      Math.max(0, remaining)
    )} hrs`
  );
});

/* ================= ADMIN TARGET ================= */

bot.onText(/\/target (\d+)/, (msg, match) => {
  if (ADMIN_ID && msg.from.id !== ADMIN_ID) {
    bot.sendMessage(msg.chat.id, "❌ Only admin can change target.");
    return;
  }
  const hrs = parseInt(match[1]);
  const stats = loadJSON(STATS_FILE);
  stats.targetHours = hrs;
  saveJSON(STATS_FILE, stats);
  bot.sendMessage(GROUP_ID, `🎯 Daily reading target set to ${hrs} hours`);
});

/* ================= GOOD MORNING (7 AM) ================= */

setInterval(() => {
  const m = nowMinutes();
  if (m === 7 * 60) {
    const stats = loadJSON(STATS_FILE);
    const msg = `🌅 Good Morning ${STUDENT_NAME} 🌸

🎯 Today’s Reading Target: ${stats.targetHours} hours
(Set by Admin)

💡 Motivation:
Consistency today builds your Dental seat tomorrow.

Start reading with focus 💪📚`;

    if (GROUP_ID) bot.sendMessage(GROUP_ID, msg);
  }
}, 60000);

/* ================= 4 HOUR REMINDER ================= */

setInterval(() => {
  const stats = loadJSON(STATS_FILE);
  const remaining =
    stats.targetHours * 60 - stats.readingMinutes;

  if (remaining > 0 && stats.readingMinutes > 0) {
    bot.sendMessage(
      GROUP_ID,
      `⏰ Reminder ${STUDENT_NAME}

📖 Studied: ${formatHours(stats.readingMinutes)} hrs
🎯 Target: ${stats.targetHours} hrs
⏳ Remaining: ${formatHours(remaining)} hrs

Stop scrolling, start reading 📚🔥`
    );
  }
}, 4 * 60 * 60 * 1000);

/* ================= MCQ ADD (ADMIN, PRIVATE) ================= */

bot.on("message", (msg) => {
  if (msg.chat.type !== "private") return;
  if (!msg.text || !msg.text.startsWith("/addmcq")) return;
  if (ADMIN_ID && msg.from.id !== ADMIN_ID) {
    bot.sendMessage(msg.chat.id, "❌ Not allowed");
    return;
  }

  const lines = msg.text.split("\n");
  const subject = lines.find(l => l.startsWith("Subject:"))?.replace("Subject:", "").trim();
  const topic = lines.find(l => l.startsWith("Topic:"))?.replace("Topic:", "").trim();
  const ans = lines.find(l => l.startsWith("ANS:"))?.replace("ANS:", "").trim().toUpperCase();
  const exp = lines.find(l => l.startsWith("EXP:"))?.replace("EXP:", "").trim();

  if (!subject || !topic || !ans || !exp) {
    bot.sendMessage(msg.chat.id, "❌ MCQ format error");
    return;
  }

  const qIndex = lines.findIndex(l => l.startsWith("Q:"));
  const aIndex = lines.findIndex(l => l.startsWith("ANS:"));
  const question = lines.slice(qIndex, aIndex).join("\n");

  const db = loadJSON(MCQ_FILE);
  if (!db[subject]) db[subject] = {};
  if (!db[subject][topic]) db[subject][topic] = [];

  db[subject][topic].push({ question, answer: ans, explanation: exp });
  saveJSON(MCQ_FILE, db);

  bot.sendMessage(msg.chat.id, `✅ MCQ Saved\n${subject} → ${topic}`);
});

/* ================= DAILY TEST (MANUAL) ================= */

let testState = null;

bot.onText(/(\/dt|#dt)/, () => {
  const db = loadJSON(MCQ_FILE);
  const all = [];

  Object.values(db).forEach(sub =>
    Object.values(sub).forEach(arr => all.push(...arr))
  );

  if (all.length < 20) {
    bot.sendMessage(GROUP_ID, "❗ Not enough MCQs");
    return;
  }

  testState = {
    index: 0,
    correct: 0,
    questions: all.sort(() => 0.5 - Math.random()).slice(0, 20)
  };

  bot.sendMessage(GROUP_ID, "📝 Daily Test Started (20 MCQ)");
  bot.sendMessage(GROUP_ID, testState.questions[0].question);
});

/* ================= ANSWER HANDLER ================= */

bot.on("message", (msg) => {
  if (!testState) return;
  const ans = msg.text?.toUpperCase();
  if (!["A", "B", "C", "D"].includes(ans)) return;

  const q = testState.questions[testState.index];
  if (ans === q.answer) {
    testState.correct++;
    bot.sendMessage(GROUP_ID, "✅ Correct");
  } else {
    bot.sendMessage(
      GROUP_ID,
      `❌ Wrong\n✅ Correct: ${q.answer}\n📘 ${q.explanation}`
    );
  }

  testState.index++;

  if (testState.index < testState.questions.length) {
    bot.sendMessage(GROUP_ID, testState.questions[testState.index].question);
  } else {
    const score = testState.correct;
    let result = "❌ FAIL";
    if (score >= 16) result = "🔥 EXCELLENT";
    else if (score >= 14) result = "🌟 GOOD";
    else if (score >= 12) result = "⚠️ PASS (Needs extra reading)";

    bot.sendMessage(
      GROUP_ID,
      `📝 Test Completed – ${STUDENT_NAME}

Score: ${score} / 20

${result}`
    );

    const stats = loadJSON(STATS_FILE);
    stats.dailyTestScores.push(score);
    saveJSON(STATS_FILE, stats);

    testState = null;
  }
});

/* ================= SERVER ================= */

app.get("/", (req, res) => res.send("Bot running"));
app.listen(PORT, () => console.log("Server running"));
