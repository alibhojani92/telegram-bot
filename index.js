/*****************************************************************
 GPSC DENTAL PULSE BOT – FINAL MASTER VERSION
 ALL FEATURES INCLUDED – LOCKED
******************************************************************/

const express = require("express");
const TelegramBot = require("node-telegram-bot-api");

const app = express();
app.use(express.json());

/* ================= ENV ================= */
const PORT = process.env.PORT || 3000;
const TOKEN = process.env.BOT_TOKEN;
const GROUP_ID = Number(process.env.GROUP_ID);
const APP_URL = process.env.APP_URL;

const ADMIN_ID = 7539477188;
const STUDENT_ID = 1072651590;

/* ================= CONSTANTS ================= */
const DAILY_TARGET = 8;
const EXAM_DATE = new Date("2026-02-18");

/* ================= BOT INIT ================= */
const bot = new TelegramBot(TOKEN);
bot.setWebHook(`${APP_URL}/bot${TOKEN}`);

app.post(`/bot${TOKEN}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

app.get("/", (_, res) => res.send("GPSC DENTAL PULSE BOT Running ✅"));
app.listen(PORT);

/* ================= DATA ================= */
let readingSession = {};
let readingLog = {}; // date -> hours
let testLog = {};    // date -> { correct, total }

let MCQS = [];
let activeTest = null;

const QUOTES = [
  "Consistency beats talent 💪",
  "Discipline creates success 🔥",
  "Small steps daily give big results 🌱",
  "Focus now, shine later ✨"
];

const randQuote = () => QUOTES[Math.floor(Math.random() * QUOTES.length)];
const hrs = ms => Math.round((ms / 36e5) * 100) / 100;
const today = () => new Date().toISOString().split("T")[0];

/* ================= HELPERS ================= */
function sendStudent(text) {
  bot.sendMessage(GROUP_ID, text);
  bot.sendMessage(STUDENT_ID, text);
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function daysToExam() {
  const diff = EXAM_DATE - new Date();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

/* ================= START ================= */
bot.onText(/\/start/, msg => {
  bot.sendMessage(msg.chat.id, "🌸 Dear Arzoo 🌸\n🤖 Study Bot Running ✅");
});

/* ================= READING ================= */
bot.onText(/\/read/, msg => {
  if (msg.from.id !== STUDENT_ID) return;
  if (readingSession.start) {
    sendStudent("📖 Reading already running ⚠️");
    return;
  }
  readingSession.start = Date.now();
  sendStudent("📖 Reading started 💪✨");
});

bot.onText(/\/stop/, msg => {
  if (msg.from.id !== STUDENT_ID) return;
  if (!readingSession.start) {
    sendStudent("❌ Reading not started");
    return;
  }
  const spent = hrs(Date.now() - readingSession.start);
  const d = today();
  readingLog[d] = (readingLog[d] || 0) + spent;
  readingSession.start = null;

  const rem = Math.max(0, DAILY_TARGET - readingLog[d]);
  sendStudent(
    `⏱️ Reading stopped\n📖 Today: ${readingLog[d]} hrs\n🎯 Remaining: ${rem} hrs`
  );
});

/* ================= ADD MCQ (ADMIN) ================= */
bot.onText(/\/addmcq([\s\S]*)/, (msg, m) => {
  if (msg.from.id !== ADMIN_ID || msg.chat.type !== "private") return;
  const blocks = m[1].trim().split(/\n(?=Q\d+)/);
  let added = 0;

  blocks.forEach(b => {
    const q = b.match(/Q\d+\.?\s*(.*)/)?.[1];
    const A = b.match(/A\)\s*(.*)/)?.[1];
    const B = b.match(/B\)\s*(.*)/)?.[1];
    const C = b.match(/C\)\s*(.*)/)?.[1];
    const D = b.match(/D\)\s*(.*)/)?.[1];
    const ans = b.match(/OK\s*([ABCD])/i)?.[1];
    const exp = b.match(/Explanation:\s*([\s\S]*)/i)?.[1] || "";

    if (q && A && B && C && D && ans) {
      MCQS.push({ q, options: { A, B, C, D }, ans, exp });
      added++;
    }
  });

  bot.sendMessage(msg.chat.id, `✅ ${added} MCQs added successfully`);
});

/* ================= TEST ================= */
function startTest(total) {
  activeTest = {
    index: 0,
    score: 0,
    questions: shuffle(MCQS).slice(0, total),
    total
  };
}

function sendMCQ() {
  if (!activeTest) return;

  if (activeTest.index >= activeTest.questions.length) {
    const d = today();
    testLog[d] = { correct: activeTest.score, total: activeTest.total };

    const acc = Math.round((activeTest.score / activeTest.total) * 100);
    let result =
      activeTest.score >= 16 ? "EXCELLENT 🟢" :
      activeTest.score >= 14 ? "GOOD 🟡" :
      activeTest.score >= 12 ? "PASS 🟠" :
      "FAIL 🔴";

    bot.sendMessage(
      GROUP_ID,
`🌸 Dear Arzoo 🌸

📊 Test Analysis
📝 Total: ${activeTest.total}
✅ Correct: ${activeTest.score}
❌ Wrong: ${activeTest.total - activeTest.score}
🎯 Accuracy: ${acc}%

🏆 Result: ${result}

⏳ Exam in ${daysToExam()} days
💡 ${randQuote()}`
    );

    setTimeout(() => {
      bot.sendMessage(GROUP_ID, "🌙 Good Night Arzoo 😴✨");
    }, 5 * 60 * 1000);

    activeTest = null;
    return;
  }

  const m = activeTest.questions[activeTest.index];
  bot.sendMessage(
    GROUP_ID,
`Q${activeTest.index + 1}. ${m.q}
A) ${m.options.A}
B) ${m.options.B}
C) ${m.options.C}
D) ${m.options.D}`
  );
}

bot.onText(/\/dt/, msg => {
  if (msg.chat.id !== GROUP_ID) return;
  startTest(20);
  bot.sendMessage(GROUP_ID, "📝 Daily Test Started 🚀");
  sendMCQ();
});

bot.onText(/\/dts/, msg => {
  if (msg.chat.id !== GROUP_ID) return;
  startTest(50);
  bot.sendMessage(GROUP_ID, "📝 Weekend Test Started 🚀");
  sendMCQ();
});

bot.on("message", msg => {
  if (!activeTest || msg.chat.id !== GROUP_ID) return;
  const ans = msg.text?.trim().toUpperCase();
  if (!["A","B","C","D"].includes(ans)) return;

  const q = activeTest.questions[activeTest.index];
  if (ans === q.ans) {
    activeTest.score++;
    bot.sendMessage(GROUP_ID, `✅ Correct 🎉\n✔️ Correct answer: ${q.ans}\n🔥 Keep going 💪`);
  } else {
    bot.sendMessage(GROUP_ID, `❌ Wrong 😕\n✔️ Correct answer: ${q.ans}\n📘 ${q.exp}`);
  }

  activeTest.index++;
  setTimeout(sendMCQ, 2000);
});

/* ================= REPORT ================= */
bot.onText(/\/report/, msg => {
  if (msg.chat.id !== GROUP_ID) return;

  let text =
`📊 Dear Arzoo – Complete Study Report
📅 Exam Date: 18-Feb-2026
⏳ Days Remaining: ${daysToExam()}

`;

  Object.keys(readingLog).sort().reverse().forEach(d => {
    const r = readingLog[d] || 0;
    const t = testLog[d];
    text += `📅 ${d}\n📖 Reading: ${r} hrs\n`;
    if (t) text += `📝 Test: ${t.correct}/${t.total}\n`;
    text += "\n";
  });

  bot.sendMessage(GROUP_ID, text);
});

/* ================= DAILY AUTOMATION ================= */
setInterval(() => {
  const n = new Date();

  // 6:00 AM reset
  if (n.getHours() === 6 && n.getMinutes() === 0) {
    readingSession = {};
  }

  // 6:01 AM good morning + yesterday report
  if (n.getHours() === 6 && n.getMinutes() === 1) {
    const y = new Date(Date.now() - 86400000).toISOString().split("T")[0];
    const r = readingLog[y] || 0;

    bot.sendMessage(
      GROUP_ID,
`🌅 Good Morning Arzoo 🌸

📅 Yesterday (${y}) Report
📖 Reading: ${r} hrs
🎯 Target: ${DAILY_TARGET} hrs

⏳ Exam in ${daysToExam()} days
🔥 New day, new chance!`
    );
  }

  // Exam reminders
  const reminders = [8, 12, 17, 22];
  if (reminders.includes(n.getHours()) && n.getMinutes() === 0) {
    bot.sendMessage(
      GROUP_ID,
`⏳ Exam Countdown Alert 📚
📅 Exam Date: 18-Feb-2026
⏳ Days Remaining: ${daysToExam()}
Stay focused 💪🔥`
    );
  }

}, 60000);
