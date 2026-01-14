/*****************************************************************
 GPSC DENTAL PULSE BOT – FINAL v4.5
 DATA SAFE | KEYWORD REVISION | ALL BUGS FIXED
*****************************************************************/

const fs = require("fs");
const express = require("express");
const TelegramBot = require("node-telegram-bot-api");

const app = express();
app.use(express.json());

/* ================= ENV ================= */
const PORT = process.env.PORT || 3000;
const TOKEN = process.env.BOT_TOKEN;
const APP_URL = process.env.APP_URL;
const GROUP_ID = Number(process.env.GROUP_ID);
const ADMIN_ID = Number(process.env.ADMIN_ID);
const TIMEZONE = process.env.TIMEZONE || "Asia/Kolkata";

/* ================= BOT ================= */
const bot = new TelegramBot(TOKEN);
bot.setWebHook(`${APP_URL}/bot${TOKEN}`);

app.post(`/bot${TOKEN}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

app.get("/", (_, res) =>
  res.send("GPSC DENTAL PULSE BOT v4.5 Running ✅")
);

app.listen(PORT);

/* ================= DATABASE ================= */
const DATA_FILE = "./data.json";

let DB = fs.existsSync(DATA_FILE)
  ? JSON.parse(fs.readFileSync(DATA_FILE))
  : {
      readingLog: {},
      readingSession: {},
      mcqs: [],
      testHistory: {}
    };

function saveDB() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(DB, null, 2));
}

/* ================= TIME UTILS ================= */
function today() {
  return new Date().toLocaleDateString("en-CA", {
    timeZone: TIMEZONE
  });
}

function mmToHHMM(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/* ================= READING ================= */
bot.onText(/\/read/, msg => {
  const uid = msg.from.id;
  if (DB.readingSession[uid]) {
    bot.sendMessage(msg.chat.id, "📖 Already reading!");
    return;
  }
  DB.readingSession[uid] = Date.now();
  saveDB();
  bot.sendMessage(
    msg.chat.id,
    "📚 Reading started\nStay focused 💪"
  );
});

bot.onText(/\/stop/, msg => {
  const uid = msg.from.id;
  const start = DB.readingSession[uid];
  if (!start) {
    bot.sendMessage(msg.chat.id, "⚠️ No active reading");
    return;
  }

  const spentMin = Math.floor((Date.now() - start) / 60000);
  delete DB.readingSession[uid];

  const d = today();
  DB.readingLog[d] = (DB.readingLog[d] || 0) + spentMin;
  saveDB();

  const studied = DB.readingLog[d];
  const remaining = Math.max(480 - studied, 0);

  bot.sendMessage(
    msg.chat.id,
    `⏱️ Reading stopped

📘 Today: ${mmToHHMM(studied)}
🎯 Remaining: ${mmToHHMM(remaining)}`
  );

  if (msg.from.id !== ADMIN_ID) {
    bot.sendMessage(
      ADMIN_ID,
      `📢 Arzoo stopped reading
Today total: ${mmToHHMM(studied)}`
    );
  }
});

/* ================= ADD MCQ ================= */
bot.onText(/\/addmcq([\s\S]*)/, (msg, m) => {
  if (msg.chat.type !== "private" || msg.from.id !== ADMIN_ID) return;

  const t = m[1];
  const q = t.match(/Q\d*\.(.*)/)?.[1];
  const A = t.match(/A\)(.*)/)?.[1];
  const B = t.match(/B\)(.*)/)?.[1];
  const C = t.match(/C\)(.*)/)?.[1];
  const D = t.match(/D\)(.*)/)?.[1];
  const ans = t.match(/OK\s*(A|B|C|D)/)?.[1];
  const exp = t.match(/Explanation:(.*)/)?.[1] || "";
  const subject = t.match(/Subject:(.*)/)?.[1] || "General";

  if (!q || !A || !B || !C || !D || !ans) {
    bot.sendMessage(msg.chat.id, "❌ MCQ format wrong");
    return;
  }

  DB.mcqs.push({ q, A, B, C, D, ans, exp, subject });
  saveDB();
  bot.sendMessage(msg.chat.id, "✅ MCQ saved permanently");
});

/* ================= KEYWORD REVISION ================= */
const KEYWORDS = {
  physiology: ["blood", "ph", "heart", "rbc"],
  anatomy: ["enamel", "dentin", "pulp"],
  pathology: ["leukoplakia", "osmf"],
  biochemistry: ["insulin", "enzyme"]
};

function detectSubject(text) {
  text = text.toLowerCase();
  for (let s in KEYWORDS) {
    if (KEYWORDS[s].some(k => text.includes(k))) return s;
  }
  return null;
}

function sendRevision(chatId, list, i = 0) {
  if (i >= list.length) {
    bot.sendMessage(chatId, "✅ Revision completed 💪");
    return;
  }

  const q = list[i];
  bot.sendMessage(
    chatId,
    `📘 ${q.subject}

Q${i + 1}. ${q.q}
A) ${q.A}
B) ${q.B}
C) ${q.C}
D) ${q.D}`
  );

  setTimeout(() => {
    bot.sendMessage(chatId, `✅ Correct Answer: ${q.ans}`);
    setTimeout(() => {
      bot.sendMessage(chatId, `💡 Explanation:\n${q.exp}`);
      setTimeout(() => sendRevision(chatId, list, i + 1), 2000);
    }, 1500);
  }, 1500);
}

bot.on("message", msg => {
  if (msg.text?.startsWith("/")) return;
  const subject = detectSubject(msg.text || "");
  if (!subject) return;

  const list = DB.mcqs.filter(
    m => m.subject.toLowerCase() === subject
  );
  if (!list.length) return;

  bot.sendMessage(
    msg.chat.id,
    `📘 Auto detected subject: ${subject}\nRevision started`
  );
  sendRevision(msg.chat.id, list);
});

/* ================= DAILY AUTOMATION ================= */
setInterval(() => {
  const n = new Date(
    new Date().toLocaleString("en-US", { timeZone: TIMEZONE })
  );

  if (n.getHours() === 6 && n.getMinutes() === 0) {
    DB.readingLog = {};
    saveDB();
  }

  if (n.getHours() === 6 && n.getMinutes() === 1) {
    bot.sendMessage(
      GROUP_ID,
      "🌅 Good Morning Arzoo\n🎯 Target: 08:00\n🔥 Stay consistent"
    );
  }

  if (n.getHours() === 23 && n.getMinutes() === 59) {
    const d = today();
    const mins = DB.readingLog[d] || 0;
    bot.sendMessage(
      GROUP_ID,
      `🌙 Daily Report

📘 Studied: ${mmToHHMM(mins)}
💡 Advice: Consistency beats intensity`
    );
  }
}, 60000);
