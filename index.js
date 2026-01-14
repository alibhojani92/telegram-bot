/*****************************************************************
 GPSC DENTAL PULSE BOT – FINAL STABLE VERSION (WEBHOOK)
******************************************************************/

const express = require("express");
const TelegramBot = require("node-telegram-bot-api");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const TOKEN = process.env.BOT_TOKEN;
const APP_URL = process.env.APP_URL;
const GROUP_ID = Number(process.env.GROUP_ID);
const ADMIN_ID = Number(process.env.ADMIN_ID);
const STUDENT_ID = Number(process.env.STUDENT_ID);

// ================= BOT INIT =================
const bot = new TelegramBot(TOKEN);
bot.setWebHook(`${APP_URL}/bot${TOKEN}`);

// ================= WEBHOOK =================
app.post(`/bot${TOKEN}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

app.get("/", (_, res) => res.send("GPSC DENTAL PULSE BOT Running ✅"));
app.listen(PORT, () => console.log("Server Live"));

// ================= HELPERS =================
const DAILY_TARGET = 8;
const QUOTES = [
  "Consistency beats talent.",
  "Small steps daily give big results.",
  "Discipline creates success.",
  "Read today, relax tomorrow.",
  "Focus now, shine later."
];
const randQuote = () => QUOTES[Math.floor(Math.random() * QUOTES.length)];
const hrs = (ms) => Math.round((ms / 36e5) * 100) / 100;

const isAdmin = (id) => id === ADMIN_ID;
const isStudent = (id) => id === STUDENT_ID;

// Student sync: group + private
function sendStudent(msg) {
  bot.sendMessage(GROUP_ID, msg);
  bot.sendMessage(STUDENT_ID, msg);
}

// ================= READING (CHAT-WISE FIX) =================
const reading = {}; // chatId -> { start, total }

bot.onText(/(\/read|#read)/, (msg) => {
  const cid = msg.chat.id;
  if (!reading[cid]) reading[cid] = { start: null, total: 0 };

  if (reading[cid].start) {
    const t = "Dear Arzoo 📖\nAlready reading.";
    return isStudent(msg.from.id) ? sendStudent(t) : bot.sendMessage(cid, t);
  }

  reading[cid].start = Date.now();
  const t = "Dear Arzoo 📖\nReading started. Stay focused 💪";
  isStudent(msg.from.id) ? sendStudent(t) : bot.sendMessage(cid, t);
});

bot.onText(/\/stop/, (msg) => {
  const cid = msg.chat.id;
  if (!reading[cid] || !reading[cid].start) {
    const t = "Dear Arzoo ⏹️\nReading not started.";
    return isStudent(msg.from.id) ? sendStudent(t) : bot.sendMessage(cid, t);
  }

  const spent = hrs(Date.now() - reading[cid].start);
  reading[cid].total += spent;
  reading[cid].start = null;

  const remaining = Math.max(0, DAILY_TARGET - reading[cid].total);
  const t =
    `Dear Arzoo ⏱️\nStudied: ${reading[cid].total.toFixed(2)} hrs\n` +
    `Target: ${DAILY_TARGET} hrs\nRemaining: ${remaining.toFixed(2)} hrs 🎯`;

  isStudent(msg.from.id) ? sendStudent(t) : bot.sendMessage(cid, t);
});

// ================= START =================
bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, "Dear Arzoo 🌸\nGPSC DENTAL PULSE BOT Running ✅");
});

// ================= MCQ STORAGE =================
let MCQS = [];
let MCQ_ID = 1;

// ================= ADD MCQ (UNLIMITED – PRIVATE ADMIN) =================
bot.onText(/\/addmcq([\s\S]*)/, (msg, match) => {
  if (msg.chat.type !== "private" || !isAdmin(msg.from.id)) return;

  const text = match[1].trim();
  if (!text) return bot.sendMessage(msg.chat.id, "❌ Paste MCQs after /addmcq");

  const blocks = text.split(/\n(?=Q\d+[\.\:])/i);
  let added = 0;

  blocks.forEach((b) => {
    const q = b.match(/Q\d+[\.\:]\s*(.*)/i)?.[1];
    const A = b.match(/A\)\s*(.*)/)?.[1];
    const B = b.match(/B\)\s*(.*)/)?.[1];
    const C = b.match(/C\)\s*(.*)/)?.[1];
    const D = b.match(/D\)\s*(.*)/)?.[1];
    const ans = b.match(/OK\s*([ABCD])/i)?.[1];
    const exp = b.match(/Explanation:\s*([\s\S]*)/i)?.[1] || "";

    if (q && A && B && C && D && ans) {
      MCQS.push({
        id: MCQ_ID++,
        q: q.trim(),
        options: { A, B, C, D },
        ans,
        exp: exp.trim()
      });
      added++;
    }
  });

  bot.sendMessage(msg.chat.id, `✅ ${added} MCQs added successfully`);
});

// ================= DELETE MCQ =================
bot.onText(/\/deletemcq (\d+)/, (msg, m) => {
  if (!isAdmin(msg.from.id)) return;
  const id = Number(m[1]);
  const len = MCQS.length;
  MCQS = MCQS.filter(x => x.id !== id);
  bot.sendMessage(msg.chat.id, len !== MCQS.length ? `🗑️ MCQ ${id} deleted` : "❌ MCQ not found");
});

bot.onText(/\/delete_last/, (msg) => {
  if (!isAdmin(msg.from.id)) return;
  if (MCQS.length) MCQS.pop();
  bot.sendMessage(msg.chat.id, "🗑️ Last MCQ deleted");
});

// ================= TEST ENGINE =================
let activeTest = null;

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
    const result = s >= 16 ? "EXCELLENT" : s >= 14 ? "GOOD" : s >= 12 ? "PASS" : "FAIL";
    sendStudent(`Dear Arzoo 📊\nScore: ${s}\nResult: ${result}`);

    setTimeout(() => {
      sendStudent(`🌙 Good Night Dear Arzoo\n${randQuote()}`);
    }, 5 * 60 * 1000);

    activeTest = null;
    return;
  }

  const m = activeTest.questions[activeTest.index];
  sendStudent(
    `Q${activeTest.index + 1}. ${m.q}\n` +
    `A) ${m.options.A}\nB) ${m.options.B}\nC) ${m.options.C}\nD) ${m.options.D}`
  );
}

bot.onText(/\/dt/, (msg) => {
  if (msg.chat.id !== GROUP_ID) return;
  startTest(20);
  sendStudent("📝 Daily Test Started (20 MCQs)");
  sendMCQ();
});

bot.onText(/\/dts/, (msg) => {
  if (msg.chat.id !== GROUP_ID) return;
  startTest(50);
  sendStudent("📝 Weekend Test Started (50 MCQs)");
  sendMCQ();
});

bot.on("message", (msg) => {
  if (!activeTest || msg.chat.id !== GROUP_ID) return;
  const ans = msg.text?.trim().toUpperCase();
  if (!["A","B","C","D"].includes(ans)) return;

  const q = activeTest.questions[activeTest.index];
  if (ans === q.ans) activeTest.score++;
  else if (q.exp) sendStudent(`❌ Wrong\n${q.exp}`);

  activeTest.index++;
  sendMCQ();
});
