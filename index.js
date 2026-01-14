/*****************************************************************
 GPSC DENTAL PULSE BOT – FINAL A TO Z (WEBHOOK VERSION)
******************************************************************/

const express = require("express");
const TelegramBot = require("node-telegram-bot-api");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const TOKEN = process.env.BOT_TOKEN;
const GROUP_ID = Number(process.env.GROUP_ID);
const APP_URL = process.env.APP_URL; // https://your-app.onrender.com

// ================= BOT INIT (NO POLLING) =================
const bot = new TelegramBot(TOKEN);
bot.setWebHook(`${APP_URL}/bot${TOKEN}`);

// ================= WEBHOOK ROUTE =================
app.post(`/bot${TOKEN}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// ================= BASIC SERVER =================
app.get("/", (req, res) => res.send("GPSC DENTAL PULSE BOT Running ✅"));
app.listen(PORT, () => console.log("Server started"));

// ================= DATA =================
const DAILY_TARGET = 8;
let readingStart = null;
let studiedToday = 0;

// MCQ
let MCQS = [];
let activeTest = null;

// Semi-ChatGPT
let TOPICS = {};

// Motivation
const QUOTES = [
  "Consistency beats talent.",
  "Small steps daily give big results.",
  "Discipline creates success.",
  "Read today, relax tomorrow.",
  "Focus now, shine later."
];
const randQuote = () => QUOTES[Math.floor(Math.random() * QUOTES.length)];
const hrs = (ms) => Math.round((ms / 36e5) * 100) / 100;

// ================= START =================
bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, "Dear Arzoo 🌸\nGPSC DENTAL PULSE BOT Running ✅");
});

// ================= READING =================
bot.onText(/(\/read|#read)/, (msg) => {
  if (readingStart) {
    bot.sendMessage(msg.chat.id, "Dear Arzoo 📖\nReading already running. Use /stop.");
    return;
  }
  readingStart = Date.now();
  bot.sendMessage(msg.chat.id, "Dear Arzoo 📖\nReading started. Stay focused 💪");
});

bot.onText(/\/stop/, (msg) => {
  if (!readingStart) {
    bot.sendMessage(msg.chat.id, "Dear Arzoo 📘\nNo active reading session.");
    return;
  }
  const spent = hrs(Date.now() - readingStart);
  studiedToday += spent;
  readingStart = null;
  const remaining = Math.max(0, DAILY_TARGET - studiedToday);
  bot.sendMessage(
    msg.chat.id,
    `Dear Arzoo ⏱️\nStudied: ${studiedToday} hrs\nTarget: ${DAILY_TARGET}\nRemaining: ${remaining} hrs`
  );
});

// ================= ADD MCQ (PRIVATE) =================
bot.onText(/\/addmcq([\s\S]*)/, (msg, match) => {
  if (msg.chat.type !== "private") return;

  const t = match[1];
  const q = t.match(/Q:(.*)/)?.[1];
  const A = t.match(/A\)(.*)/)?.[1];
  const B = t.match(/B\)(.*)/)?.[1];
  const C = t.match(/C\)(.*)/)?.[1];
  const D = t.match(/D\)(.*)/)?.[1];
  const ans = t.match(/ANS:(.*)/)?.[1]?.trim();
  const exp = t.match(/EXP:(.*)/)?.[1] || "";

  if (!q || !A || !B || !C || !D || !ans) {
    bot.sendMessage(msg.chat.id, "❌ MCQ format wrong");
    return;
  }

  MCQS.push({ q: q.trim(), options: { A, B, C, D }, ans, exp });
  bot.sendMessage(msg.chat.id, "✅ MCQ saved");
});

// ================= TEST ENGINE =================
function startTest(total) {
  activeTest = {
    index: 0,
    score: 0,
    questions: MCQS.slice(0, total)
  };
}

function sendMCQ() {
  if (!activeTest) return;

  if (activeTest.index >= activeTest.questions.length) {
    const s = activeTest.score;
    const result =
      s >= 16 ? "EXCELLENT" :
      s >= 14 ? "GOOD" :
      s >= 12 ? "PASS" : "FAIL";

    bot.sendMessage(
      GROUP_ID,
      `Dear Arzoo 📊\nTest Finished\nScore: ${s}\nResult: ${result}`
    );

    setTimeout(() => {
      bot.sendMessage(
        GROUP_ID,
        `Dear Arzoo 🌙\nPerformance: ${result}\n${randQuote()}\nGood Night 😴`
      );
    }, 5 * 60 * 1000);

    activeTest = null;
    return;
  }

  const m = activeTest.questions[activeTest.index];
  bot.sendMessage(
    GROUP_ID,
    `Q${activeTest.index + 1}: ${m.q}\nA) ${m.options.A}\nB) ${m.options.B}\nC) ${m.options.C}\nD) ${m.options.D}`
  );
}

// ================= DAILY TEST (20) =================
bot.onText(/\/dt/, (msg) => {
  if (msg.chat.id !== GROUP_ID) return;
  startTest(20);
  bot.sendMessage(GROUP_ID, "Dear Arzoo 📝\nDaily Test Started (20 MCQs)");
  sendMCQ();
});

// ================= WEEKEND TEST (50) =================
bot.onText(/\/dts/, (msg) => {
  if (msg.chat.id !== GROUP_ID) return;
  startTest(50);
  bot.sendMessage(GROUP_ID, "Dear Arzoo 📝\nWeekend Test Started (50 MCQs)");
  sendMCQ();
});

// ================= ANSWER HANDLER =================
bot.on("message", (msg) => {
  if (!activeTest || msg.chat.id !== GROUP_ID) return;

  const ans = msg.text?.trim().toUpperCase();
  if (!["A","B","C","D"].includes(ans)) return;

  const q = activeTest.questions[activeTest.index];
  if (ans === q.ans) activeTest.score++;
  else bot.sendMessage(GROUP_ID, `❌ Wrong\n${q.exp}`);

  activeTest.index++;
  sendMCQ();
});

// ================= SEMI-CHATGPT =================
bot.onText(/\/addtopic([\s\S]*)/, (msg, match) => {
  if (msg.chat.type !== "private") return;

  const topic = match[1].match(/Topic:(.*)/)?.[1]?.trim();
  const ans = match[1].match(/Answer:([\s\S]*)/)?.[1]?.trim();

  if (!topic || !ans) {
    bot.sendMessage(msg.chat.id, "❌ Format wrong");
    return;
  }

  TOPICS[topic.toLowerCase()] = ans;
  bot.sendMessage(msg.chat.id, "✅ Topic saved");
});

bot.on("message", (msg) => {
  if (msg.text?.startsWith("/") || msg.chat.id !== GROUP_ID) return;
  const text = msg.text.toLowerCase();
  for (let t in TOPICS) {
    if (text.includes(t)) {
      bot.sendMessage(msg.chat.id, `Dear Arzoo 📚\n${TOPICS[t]}`);
      break;
    }
  }
});

// ================= 6 AM GOOD MORNING =================
setInterval(() => {
  const n = new Date();
  if (n.getHours() === 6 && n.getMinutes() === 0) {
    studiedToday = 0;
    readingStart = null;
    bot.sendMessage(
      GROUP_ID,
      `🌅 Good Morning Dear Arzoo\n"${randQuote()}"\nToday’s Target: 8 hrs 💪`
    );
  }
}, 60000);
