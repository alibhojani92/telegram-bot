const TelegramBot = require("node-telegram-bot-api");

const token = process.env.BOT_TOKEN || process.env.Bot_token;
if (!token) {
  console.error("BOT_TOKEN missing");
  process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });

/* ---------------- DATA STORES (in-memory) ---------------- */
const readingStart = {};      // userId -> timestamp
const todayStudy = {};        // userId -> minutes
const dailyTarget = {};       // groupId -> minutes
const dailyTestUsers = {};    // userId -> progress
const weekendTestUsers = {};  // userId -> progress

/* ---------------- HELPERS ---------------- */
function isWeekend() {
  const d = new Date().getDay();
  return d === 0 || d === 6; // Sun or Sat
}

function nowMinutes() {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

function formatTime(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}h ${m}m`;
}

function isDailyTestTime() {
  const m = nowMinutes();
  return m >= 23 * 60 && m <= 23 * 60 + 30; // 11:00–11:30 PM
}

function isWeekendTestTime() {
  const m = nowMinutes();
  return m >= 17 * 60 && m <= 18 * 60; // around 5 PM
}

/* ---------------- COMMAND PARSER ---------------- */
function match(cmd, text) {
  return text === `/${cmd}` || text === `#${cmd}`;
}

/* ---------------- STUDY COMMANDS ---------------- */
bot.on("message", (msg) => {
  const text = (msg.text || "").trim();
  const userId = msg.from.id;
  const chatId = msg.chat.id;

  /* /read or #read */
  if (match("read", text)) {
    if (readingStart[userId]) {
      bot.sendMessage(chatId, "⚠️ You are already reading.");
      return;
    }
    readingStart[userId] = Date.now();
    bot.sendMessage(chatId, "📖 Reading started. Stay focused 💪");
  }

  /* /stop or #stop */
  if (match("stop", text)) {
    if (!readingStart[userId]) {
      bot.sendMessage(chatId, "⚠️ You didn’t start reading.");
      return;
    }
    const mins = Math.floor((Date.now() - readingStart[userId]) / 60000);
    delete readingStart[userId];
    todayStudy[userId] = (todayStudy[userId] || 0) + mins;

    const target = dailyTarget[chatId] || 600; // default 10h
    const remaining = Math.max(target - todayStudy[userId], 0);

    bot.sendMessage(
      chatId,
      `✅ Study stopped\n📚 Today: ${formatTime(todayStudy[userId])}\n🎯 Target: ${formatTime(
        target
      )}\n⏳ Remaining: ${formatTime(remaining)}`
    );
  }

  /* /status */
  if (match("status", text)) {
    const studied = todayStudy[userId] || 0;
    const target = dailyTarget[chatId] || 600;
    const remaining = Math.max(target - studied, 0);
    bot.sendMessage(
      chatId,
      `📊 Status\n📚 Studied: ${formatTime(studied)}\n🎯 Target: ${formatTime(
        target
      )}\n⏳ Remaining: ${formatTime(remaining)}`
    );
  }

  /* /target 10  (admin or anyone) */
  if (text.startsWith("/target")) {
    const parts = text.split(" ");
    if (parts.length === 2 && !isNaN(parts[1])) {
      dailyTarget[chatId] = parseInt(parts[1]) * 60;
      bot.sendMessage(chatId, `🎯 Daily target set to ${parts[1]} hours`);
    }
  }

  /* ---------------- MCQ LOGIC (DEMO) ---------------- */

  /* Daily Test: /dt or #dt */
  if (match("dt", text)) {
    if (!isDailyTestTime()) {
      bot.sendMessage(chatId, "⏰ Daily test runs 11:00–11:30 PM");
      return;
    }
    dailyTestUsers[userId] = 0;
    bot.sendMessage(chatId, "📝 Daily Test started (20 MCQ)\nQ1: 2 + 2 = ?");
  }

  /* Weekend Test: /dts or #dts */
  if (match("dts", text)) {
    if (!isWeekend() || !isWeekendTestTime()) {
      bot.sendMessage(chatId, "⏰ Weekend test runs Sat/Sun at 5:00 PM");
      return;
    }
    weekendTestUsers[userId] = 0;
    bot.sendMessage(chatId, "🟢 Weekend Test started (50 MCQ)\nQ1: Capital of India?");
  }
});

console.log("Bot started...");
