/*****************************************************************
 GPSC DENTAL PULSE BOT – FINAL A TO Z
 Webhook + Render | Unlimited MCQs | Group + Private Sync
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

const ADMIN_IDS = [7539477188];      // admin
const STUDENT_IDS = [1072651590];    // students

/* ================= BOT ================= */
const bot = new TelegramBot(TOKEN);
bot.setWebHook(`${APP_URL}/bot${TOKEN}`);

app.post(`/bot${TOKEN}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

app.get("/", (_, res) => res.send("GPSC DENTAL PULSE BOT Running ✅"));
app.listen(PORT, () => console.log("Server started"));

/* ================= DATA ================= */
const DAILY_TARGET = 8;
let readingStart = {};
let studiedToday = {};

let MCQS = []; // unlimited
let activeTest = null;

const QUOTES = [
  "Consistency beats talent.",
  "Small steps daily give big results.",
  "Discipline creates success.",
  "Focus now, shine later.",
  "Hard work always pays off."
];

const randQuote = () => QUOTES[Math.floor(Math.random() * QUOTES.length)];
const hrs = ms => Math.round((ms / 36e5) * 100) / 100;

/* ================= HELPERS ================= */
function mirrorMessage(msg, text) {
  if (msg.chat.type === "private") {
    bot.sendMessage(GROUP_ID, text);
  } else {
    bot.sendMessage(msg.from.id, text);
  }
}

/* ================= START ================= */
bot.onText(/\/start/, msg => {
  bot.sendMessage(msg.chat.id,
    "🌸 Dear Arzoo 🌸\n🤖 GPSC DENTAL PULSE BOT Running ✅");
});

/* ================= READING ================= */
bot.onText(/\/read/, msg => {
  const id = msg.from.id;
  if (readingStart[id]) {
    bot.sendMessage(msg.chat.id, "📖 Reading already running");
    return;
  }
  readingStart[id] = Date.now();
  bot.sendMessage(msg.chat.id, "📖 Reading started. Stay focused 💪");
  mirrorMessage(msg, "📖 Reading started");
});

bot.onText(/\/stop/, msg => {
  const id = msg.from.id;
  if (!readingStart[id]) {
    bot.sendMessage(msg.chat.id, "❌ No active reading");
    return;
  }
  const spent = hrs(Date.now() - readingStart[id]);
  studiedToday[id] = (studiedToday[id] || 0) + spent;
  readingStart[id] = null;

  const remaining = Math.max(0, DAILY_TARGET - studiedToday[id]);
  const text =
    `⏱️ Studied: ${studiedToday[id]} hrs\n🎯 Target: ${DAILY_TARGET}\n⌛ Remaining: ${remaining} hrs`;

  bot.sendMessage(msg.chat.id, text);
  mirrorMessage(msg, text);
});

/* ================= ADD MCQ (ADMIN ONLY) ================= */
bot.onText(/\/addmcq([\s\S]*)/, (msg, match) => {
  if (!ADMIN_IDS.includes(msg.from.id)) return;

  const block = match[1].trim();
  const parts = block.split(/\nQ\d+\./).filter(Boolean);

  let added = 0;

  parts.forEach(p => {
    const q = p.match(/^(.*)\n/)?.[1];
    const A = p.match(/A\)(.*)/)?.[1];
    const B = p.match(/B\)(.*)/)?.[1];
    const C = p.match(/C\)(.*)/)?.[1];
    const D = p.match(/D\)(.*)/)?.[1];
    const ans = p.match(/OK\s*([A-D])/i)?.[1];
    const exp = p.match(/Explanation:(.*)/s)?.[1] || "";

    if (q && A && B && C && D && ans) {
      MCQS.push({ q: q.trim(), options: { A, B, C, D }, ans, exp });
      added++;
    }
  });

  bot.sendMessage(msg.chat.id, `✅ ${added} MCQs added successfully`);
});

/* ================= TEST ENGINE ================= */
function startTest(total) {
  activeTest = {
    index: 0,
    score: 0,
    questions: MCQS.slice(0, total),
    total
  };
}

function sendMCQ() {
  if (!activeTest) return;

  if (activeTest.index >= activeTest.questions.length) {
    const s = activeTest.score;
    const total = activeTest.total;
    const acc = Math.round((s / total) * 100);

    let result =
      acc >= 75 ? "PASS 🟢" :
      acc >= 50 ? "AVERAGE 🟡" :
      "FAIL 🔴";

    bot.sendMessage(
      GROUP_ID,
`🌸 Dear Arzoo 🌸

📊 Test Result
━━━━━━━━━━━━
📝 Total: ${total}
✅ Correct: ${s}
❌ Wrong: ${total - s}
🎯 Accuracy: ${acc}%

🏆 Result: ${result}

💡 ${randQuote()}`
    );

    setTimeout(() => {
      bot.sendMessage(
        GROUP_ID,
        `🌙 Good Night Arzoo 😴\nKeep going 💪📚`
      );
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

/* ================= DAILY TEST ================= */
bot.onText(/\/dt/, msg => {
  if (msg.chat.id !== GROUP_ID) return;
  startTest(20);
  bot.sendMessage(GROUP_ID, "📝 Daily Test Started (20 MCQs)");
  sendMCQ();
});

/* ================= WEEKEND TEST ================= */
bot.onText(/\/dts/, msg => {
  if (msg.chat.id !== GROUP_ID) return;
  startTest(50);
  bot.sendMessage(GROUP_ID, "📝 Weekend Test Started (50 MCQs)");
  sendMCQ();
});

/* ================= ANSWERS ================= */
bot.on("message", msg => {
  if (!activeTest || msg.chat.id !== GROUP_ID) return;

  const ans = msg.text?.trim().toUpperCase();
  if (!["A", "B", "C", "D"].includes(ans)) return;

  const q = activeTest.questions[activeTest.index];
  if (ans === q.ans) {
    activeTest.score++;
    bot.sendMessage(GROUP_ID, "✅ Correct");
  } else {
    bot.sendMessage(GROUP_ID, `❌ Wrong\n📘 ${q.exp}`);
  }

  activeTest.index++;
  sendMCQ();
});

/* ================= 6 AM GOOD MORNING ================= */
setInterval(() => {
  const n = new Date();
  if (n.getHours() === 6 && n.getMinutes() === 0) {
    studiedToday = {};
    readingStart = {};
    bot.sendMessage(
      GROUP_ID,
      `🌅 Good Morning Arzoo 🌸\n"${randQuote()}"\n🎯 Target: 8 hrs`
    );
  }
}, 60000);
