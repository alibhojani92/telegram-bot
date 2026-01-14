/*****************************************************************
 GPSC DENTAL PULSE BOT – SAFE FINAL VERSION v3 (LOCKED)
******************************************************************/
process.env.TZ = "Asia/Kolkata";

const fs = require("fs");
const path = require("path");
const express = require("express");
const TelegramBot = require("node-telegram-bot-api");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const TOKEN = process.env.BOT_TOKEN;
const GROUP_ID = Number(process.env.GROUP_ID);
const ADMIN_ID = Number(process.env.ADMIN_ID);
const APP_URL = process.env.APP_URL;

const DATA_FILE = path.join(__dirname, "data.json");

/* ================= FILE STORAGE ================= */
function loadData() {
  if (!fs.existsSync(DATA_FILE)) {
    const init = {
      readingLog: {},
      mcqs: [],
      testLog: {}
    };
    fs.writeFileSync(DATA_FILE, JSON.stringify(init, null, 2));
    return init;
  }
  return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
}
function saveData() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(DB, null, 2));
}
let DB = loadData();

/* ================= BOT INIT ================= */
const bot = new TelegramBot(TOKEN);
bot.setWebHook(`${APP_URL}/bot${TOKEN}`);

app.post(`/bot${TOKEN}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});
app.get("/", (_, res) => res.send("Dental Pulse Bot Running ✅"));
app.listen(PORT);

/* ================= HELPERS ================= */
const DAILY_TARGET = 8 * 60;
const EXAM_DATE = new Date("2026-02-18");

const today = () => new Date().toISOString().split("T")[0];
const fmt = m => `${String(Math.floor(m/60)).padStart(2,"0")}:${String(m%60).padStart(2,"0")}`;
const daysLeft = () => Math.ceil((EXAM_DATE - new Date()) / 86400000);
const timeHM = () => new Date().toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"});

/* ================= READING ================= */
let readingSession = null;

bot.onText(/\/read/, msg => {
  if (readingSession) return;
  readingSession = Date.now();
  const t = timeHM();

  bot.sendMessage(msg.chat.id,
`📖 Reading started 💪
🕒 Start Time: ${t}
🎯 Daily Target: 08:00`);

  if (ADMIN_ID) {
    bot.sendMessage(ADMIN_ID,
`👨‍🎓 Arzoo started reading
🕒 Time: ${t}
📅 Date: ${today()}`);
  }
});

bot.onText(/\/stop/, msg => {
  if (!readingSession) return;

  const mins = Math.floor((Date.now() - readingSession) / 60000);
  readingSession = null;

  DB.readingLog[today()] = (DB.readingLog[today()] || 0) + mins;
  saveData();

  const rem = Math.max(0, DAILY_TARGET - DB.readingLog[today()]);
  const t = timeHM();

  bot.sendMessage(msg.chat.id,
`⏱️ Reading stopped ✅
📖 Studied Today: ${fmt(DB.readingLog[today()])}
🎯 Target Remaining: ${fmt(rem)}`);

  if (ADMIN_ID) {
    bot.sendMessage(ADMIN_ID,
`👨‍🎓 Arzoo stopped reading
🕒 End Time: ${t}
📖 Duration: ${fmt(mins)}
📅 Date: ${today()}`);
  }
});

/* ================= ADD MCQ ================= */
bot.onText(/\/addmcq([\s\S]*)/, (msg, m) => {
  if (msg.chat.type !== "private") return;
  const blocks = m[1].split(/Q\d+\./).filter(Boolean);

  blocks.forEach(b => {
    const q = b.match(/^(.*?)A\)/s)?.[1];
    const A = b.match(/A\)(.*?)B\)/s)?.[1];
    const B = b.match(/B\)(.*?)C\)/s)?.[1];
    const C = b.match(/C\)(.*?)D\)/s)?.[1];
    const D = b.match(/D\)(.*?)OK/s)?.[1];
    const ans = b.match(/OK\s*([ABCD])/i)?.[1];
    const subject = b.match(/Subject:(.*)/i)?.[1]?.trim() || "General";
    const exp = b.match(/Explanation:(.*)/s)?.[1] || "";

    if (q && A && B && C && D && ans) {
      DB.mcqs.push({ q, A, B, C, D, ans, subject, exp });
    }
  });

  saveData();
  bot.sendMessage(msg.chat.id, "✅ MCQs saved permanently");
});

/* ================= TEST ENGINE ================= */
let activeTest = null;

function startTest(count) {
  const pool = DB.mcqs.sort(() => 0.5 - Math.random()).slice(0, count);
  activeTest = { i: 0, score: 0, qs: pool };
  sendQ();
}

function sendQ() {
  if (!activeTest || activeTest.i >= activeTest.qs.length) {
    bot.sendMessage(GROUP_ID,
`📊 Test Finished
Score: ${activeTest.score}/${activeTest.qs.length}`);
    activeTest = null;
    return;
  }

  const q = activeTest.qs[activeTest.i];
  bot.sendMessage(GROUP_ID,
`Q${activeTest.i + 1}. ${q.q}`,
{
  reply_markup: {
    inline_keyboard: [
      [{ text: "A", callback_data: "A" }, { text: "B", callback_data: "B" }],
      [{ text: "C", callback_data: "C" }, { text: "D", callback_data: "D" }]
    ]
  }
});
}

bot.onText(/\/dt/, () => startTest(20));

/* ===== ADMIN ONLY TEST CANCEL ===== */
bot.onText(/\/dtc/, msg => {
  if (msg.from.id !== ADMIN_ID) {
    bot.sendMessage(msg.chat.id, "🚫 Only Admin can cancel the test");
    return;
  }
  if (!activeTest) return;

  activeTest = null;
  bot.sendMessage(GROUP_ID,
`⚠️ Test has been cancelled by Admin
This test will NOT be counted`);
});

/* ===== ANSWER HANDLER ===== */
bot.on("callback_query", q => {
  if (!activeTest) return;
  const cur = activeTest.qs[activeTest.i];

  if (q.data === cur.ans) {
    activeTest.score++;
    bot.sendMessage(GROUP_ID,
`✅ Correct 🎉
📚 Subject: ${cur.subject}

💡 ${cur.exp}`);
  } else {
    bot.sendMessage(GROUP_ID,
`❌ Wrong 😕
✔️ Correct Answer: ${cur.ans}
📚 Subject: ${cur.subject}

💡 ${cur.exp}`);
  }

  activeTest.i++;
  setTimeout(sendQ, 2000);
});

/* ================= DAILY AUTOMATION ================= */
setInterval(() => {
  const n = new Date();

  if (n.getHours() === 6 && n.getMinutes() === 1) {
    const y = new Date(Date.now() - 86400000).toISOString().split("T")[0];
    bot.sendMessage(GROUP_ID,
`🌅 Good Morning Arzoo 🌸
📖 Yesterday Reading: ${fmt(DB.readingLog[y] || 0)}
🎯 Exam in ${daysLeft()} days`);
  }

  if ([8, 12, 17, 22].includes(n.getHours()) && n.getMinutes() === 0) {
    bot.sendMessage(GROUP_ID,
`⏳ Exam Reminder 📚
⏳ ${daysLeft()} days left
Stay focused 💪`);
  }

  if (n.getHours() === 23 && n.getMinutes() === 59) {
    bot.sendMessage(GROUP_ID,
`🌙 Good Night Arzoo 🌸
📖 Today: ${fmt(DB.readingLog[today()] || 0)}
💡 Advice: Consistency matters. Sleep well 😴`);
  }
}, 60000);
