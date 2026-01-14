/*****************************************************************
 GPSC DENTAL PULSE BOT – v7.0 FIXED CORE (STABLE)
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
const ADMIN_ID = Number(process.env.ADMIN_ID);
const GROUP_ID = Number(process.env.GROUP_ID);
const TIMEZONE = process.env.TIMEZONE || "Asia/Kolkata";

/* ================= BOT ================= */
const bot = new TelegramBot(TOKEN, { polling: false });
bot.setWebHook(`${APP_URL}/bot${TOKEN}`);

app.post(`/bot${TOKEN}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

app.get("/", (req, res) => {
  res.send("GPSC Dental Pulse Bot v7.0 Running ✅");
});

app.listen(PORT);

/* ================= HELPERS ================= */
function intro(msg) {
  return msg.from.id === ADMIN_ID
    ? "🛠 Admin Panel\n"
    : "🌺 Dr. Arzoo Fatema 🌺\n";
}

function nowIST() {
  return new Date(
    new Date().toLocaleString("en-US", { timeZone: TIMEZONE })
  );
}

function today() {
  return nowIST().toISOString().slice(0, 10);
}

function mm(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/* ================= DATABASE ================= */
const DB_FILE = "./data.json";
let DB = fs.existsSync(DB_FILE)
  ? JSON.parse(fs.readFileSync(DB_FILE))
  : { readingLog: {}, readingSession: {}, mcqs: [], tests: [] };

function save() {
  fs.writeFileSync(DB_FILE, JSON.stringify(DB, null, 2));
}

/* ================= START ================= */
bot.onText(/\/start/i, msg => {
  bot.sendMessage(
    msg.chat.id,
    "🌺 Dr. Arzoo Fatema 🌺\nGPSC Dental Pulse Bot is LIVE ✅"
  );
});

/* ================= READING ================= */
bot.onText(/\/read/i, msg => {
  if (msg.from.id === ADMIN_ID) {
    bot.sendMessage(msg.chat.id, "ℹ️ Admin test mode – reading not counted");
    return;
  }

  const d = today();
  if (DB.readingSession[msg.from.id]?.date === d) {
    bot.sendMessage(msg.chat.id, intro(msg) + "📖 Reading already running");
    return;
  }

  DB.readingSession[msg.from.id] = { start: Date.now(), date: d };
  save();

  bot.sendMessage(
    msg.chat.id,
    intro(msg) +
      "📖 Reading started\n🎯 Target: 08:00\n⏳ Remaining: 08:00"
  );

  bot.sendMessage(
    ADMIN_ID,
    `👤 Student started reading\n🕒 ${nowIST().toLocaleTimeString()}`
  );
});

bot.onText(/\/stop/i, msg => {
  if (msg.from.id === ADMIN_ID) {
    bot.sendMessage(msg.chat.id, "ℹ️ Admin test mode – no reading session");
    return;
  }

  const s = DB.readingSession[msg.from.id];
  if (!s) {
    bot.sendMessage(msg.chat.id, intro(msg) + "⚠️ No active reading");
    return;
  }

  const mins = Math.floor((Date.now() - s.start) / 60000);
  DB.readingLog[s.date] = (DB.readingLog[s.date] || 0) + mins;
  delete DB.readingSession[msg.from.id];
  save();

  const total = DB.readingLog[s.date];
  const remaining = Math.max(480 - total, 0);

  bot.sendMessage(
    msg.chat.id,
    intro(msg) +
      `⏱ Reading stopped\n📘 Today: ${mm(total)}\n🎯 Remaining: ${mm(
        remaining
      )}`
  );

  bot.sendMessage(
    ADMIN_ID,
    `👤 Student stopped reading\n📘 Today total: ${mm(total)}`
  );
});

/* ================= MCQ ADD ================= */
let ADD_MODE = false;

bot.onText(/\/addmcq$/i, msg => {
  if (msg.from.id !== ADMIN_ID) return;
  ADD_MODE = true;
  bot.sendMessage(
    msg.chat.id,
    "🛠 Admin Panel\nReply with MCQs (SUBJECT optional)"
  );
});

bot.on("message", msg => {
  if (!ADD_MODE) return;
  if (!msg.reply_to_message) return;
  if (!msg.text) return;
  if (msg.text.startsWith("/")) return;

  ADD_MODE = false;

  let subject = "General";
  const sm = msg.text.match(/^SUBJECT:\s*(.*)$/im);
  if (sm) subject = sm[1].trim();

  const blocks = msg.text
    .replace(/^SUBJECT:.*$/im, "")
    .trim()
    .split(/\n(?=Q\.?\d+)/i);

  let added = 0,
    skipped = 0;

  blocks.forEach(b => {
    const q = b.match(/Q\.?\d*\s*(.*)/i)?.[1];
    const A = b.match(/A\)\s*(.*)/i)?.[1];
    const B = b.match(/B\)\s*(.*)/i)?.[1];
    const C = b.match(/C\)\s*(.*)/i)?.[1];
    const D = b.match(/D\)\s*(.*)/i)?.[1];
    const ans = b.match(/Ans:\s*([ABCD])/i)?.[1];
    const exp = b.match(/Exp:\s*(.*)/i)?.[1] || "";

    if (q && A && B && C && D && ans) {
      DB.mcqs.push({ q, A, B, C, D, ans, exp, subject });
      added++;
    } else skipped++;
  });

  save();

  bot.sendMessage(
    msg.chat.id,
    `🛠 Admin Panel\nAdded: ${added}\nSkipped: ${skipped}`
  );
});

/* ================= MCQ COUNT ================= */
bot.onText(/\/mcqcount/i, msg => {
  if (msg.from.id !== ADMIN_ID) {
    bot.sendMessage(msg.chat.id, "❌ Admin only command");
    return;
  }

  const map = {};
  DB.mcqs.forEach(q => {
    map[q.subject] = (map[q.subject] || 0) + 1;
  });

  let text = `📚 MCQ DATABASE\n\nTotal: ${DB.mcqs.length}\n`;
  for (const s in map) text += `• ${s}: ${map[s]}\n`;

  bot.sendMessage(msg.chat.id, text);
});
