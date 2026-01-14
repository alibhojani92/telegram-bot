/*****************************************************************
 GPSC DENTAL PULSE BOT – v7.2 FINAL (LOCKED & STABLE)
*****************************************************************/

const fs = require("fs");
const express = require("express");
const TelegramBot = require("node-telegram-bot-api");

/* ================= ENV ================= */
const PORT = process.env.PORT || 3000;
const TOKEN = process.env.BOT_TOKEN;
const APP_URL = process.env.APP_URL;
const ADMIN_ID = Number(process.env.ADMIN_ID);
const GROUP_ID = Number(process.env.GROUP_ID);
const TIMEZONE = process.env.TIMEZONE || "Asia/Kolkata";

/* ================= SERVER ================= */
const app = express();
app.use(express.json({ limit: "25mb" }));

/* ================= BOT ================= */
const bot = new TelegramBot(TOKEN, { webHook: true });
bot.setWebHook(`${APP_URL}/bot${TOKEN}`);

app.post(`/bot${TOKEN}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

app.get("/", (_, res) =>
  res.send("GPSC Dental Pulse Bot v7.2 Running ✅")
);

app.listen(PORT);

/* ================= TIME HELPERS ================= */
const nowIST = () =>
  new Date(new Date().toLocaleString("en-US", { timeZone: TIMEZONE }));
const today = () => nowIST().toISOString().slice(0, 10);

/* ================= DATABASE ================= */
const DB_FILE = "./data.json";
let DB = fs.existsSync(DB_FILE)
  ? JSON.parse(fs.readFileSync(DB_FILE))
  : {
      mcqs: [],
      used: {},
      readingLog: {},
      readingSession: {},
      lastMotivationDate: ""
    };

const save = () =>
  fs.writeFileSync(DB_FILE, JSON.stringify(DB, null, 2));

/* ================= INTRO ================= */
const intro = () => "🌸 Dr. Arzoo Fatema 🌸\n";

/* ================= START ================= */
bot.onText(/^\/start$/, (msg) => {
  bot.sendMessage(
    msg.chat.id,
    intro() + "GPSC Dental Pulse Bot is LIVE ✅"
  );
});

/* ================= DAILY MOTIVATION (ONCE) ================= */
function dailyMotivation(chatId) {
  if (DB.lastMotivationDate === today()) return;
  DB.lastMotivationDate = today();
  save();

  bot.sendMessage(
    chatId,
    "🌅 New day, new chance 🌱\nAaje thodu pan padhsho to kal confident feel thase 💪"
  );
}

/* ================= READING ================= */
bot.onText(/^\/read$/i, (msg) => {
  dailyMotivation(msg.chat.id);

  if (msg.from.id === ADMIN_ID) {
    return bot.sendMessage(
      msg.chat.id,
      "🛠 Admin mode: reading count nathi thatu"
    );
  }

  DB.readingSession[msg.from.id] = {
    start: Date.now(),
    date: today(),
  };
  save();

  bot.sendMessage(
    msg.chat.id,
    "📖 Reading started\n🎯 Target: 8 hours\nStay focused 💪"
  );

  bot.sendMessage(
    ADMIN_ID,
    "👤 Student started reading"
  );
});

bot.onText(/^\/stop$/i, (msg) => {
  const s = DB.readingSession[msg.from.id];
  if (!s) {
    return bot.sendMessage(msg.chat.id, "⚠️ Reading already stopped");
  }

  const mins = Math.floor((Date.now() - s.start) / 60000);
  DB.readingLog[s.date] = (DB.readingLog[s.date] || 0) + mins;
  delete DB.readingSession[msg.from.id];
  save();

  const total = DB.readingLog[s.date];

  bot.sendMessage(
    msg.chat.id,
    `📖 Reading stopped\nToday: ${total} min\nKeep going 🌱`
  );

  bot.sendMessage(
    ADMIN_ID,
    `👤 Student stopped reading\nToday total: ${total} min`
  );
});

/* ================= MCQ ADD (ADMIN – BULK SAFE) ================= */
bot.onText(/^\/addmcq$/i, (msg) => {
  if (msg.from.id !== ADMIN_ID) return;

  bot.sendMessage(
    msg.chat.id,
    "🛠 Admin Panel\nReply to THIS message with MCQs\n\nFormat:\nSUBJECT: Oral Pathology\nQ1..."
  );
});

bot.on("message", (msg) => {
  if (
    msg.from.id !== ADMIN_ID ||
    !msg.reply_to_message ||
    !msg.reply_to_message.text?.includes("Admin Panel") ||
    !msg.text ||
    msg.text.startsWith("/")
  )
    return;

  let subject = "General";
  const sm = msg.text.match(/^SUBJECT:\s*(.*)$/im);
  if (sm) subject = sm[1].trim();

  const blocks = msg.text
    .replace(/^SUBJECT:.*$/im, "")
    .trim()
    .split(/(?=\nQ\d+\.)/i);

  let added = 0,
    skipped = 0;

  blocks.forEach((b) => {
    const q = b.match(/Q\d+\.\s*(.*)/i)?.[1];
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
bot.onText(/^\/mcqcount$/, (msg) => {
  if (msg.from.id !== ADMIN_ID) return;

  const map = {};
  DB.mcqs.forEach((m) => {
    map[m.subject] = (map[m.subject] || 0) + 1;
  });

  let text = `📚 MCQ DATABASE\nTotal: ${DB.mcqs.length}\n\n`;
  Object.keys(map).forEach(
    (s) => (text += `${s}: ${map[s]}\n`)
  );

  bot.sendMessage(msg.chat.id, text);
});

/* ================= TEST ENGINE ================= */
let TEST = null;

function pickMCQs(total, subject) {
  const d = today();
  DB.used[d] = DB.used[d] || [];

  let pool = DB.mcqs.filter(
    (m) =>
      !DB.used[d].includes(m.q) &&
      (!subject ||
        m.subject.toLowerCase() === subject.toLowerCase())
  );

  pool = pool.sort(() => Math.random() - 0.5).slice(0, total);
  pool.forEach((q) => DB.used[d].push(q.q));
  save();
  return pool;
}

function sendQuestion() {
  const q = TEST.mcqs[TEST.index];
  bot.sendMessage(
    TEST.chatId,
    `Q${TEST.index + 1}. ${q.q}\n\nA) ${q.A}\nB) ${q.B}\nC) ${q.C}\nD) ${q.D}`
  );
}

/* ================= DAILY TEST ================= */
bot.onText(/^\/dt(?:\s+(.*))?$/i, (msg, m) => {
  TEST = null; // HARD RESET (BUG FIX)

  const subject = m[1]?.trim();
  const mcqs = pickMCQs(20, subject);

  if (mcqs.length < 10) {
    return bot.sendMessage(
      msg.chat.id,
      "⚠️ Minimum 10 MCQs required to start Daily Test"
    );
  }

  TEST = {
    chatId: msg.chat.id,
    index: 0,
    score: 0,
    mcqs,
  };

  sendQuestion();
});

/* ================= ANSWER HANDLER ================= */
bot.on("message", (msg) => {
  if (!TEST || msg.chat.id !== TEST.chatId) return;

  const ans = msg.text?.toUpperCase();
  if (!["A", "B", "C", "D"].includes(ans)) return;

  const q = TEST.mcqs[TEST.index];
  let feedback = "";

  if (ans === q.ans) {
    TEST.score++;
    feedback = "✅ Correct";
  } else {
    feedback = `❌ Wrong\n✔️ Correct: ${q.ans}`;
  }

  if (q.exp) {
    feedback += `\n💡 Explanation:\n${q.exp}`;
  }

  bot.sendMessage(msg.chat.id, feedback);

  TEST.index++;

  if (TEST.index >= TEST.mcqs.length) {
    const percent = Math.round(
      (TEST.score / TEST.mcqs.length) * 100
    );

    let motivation = "";
    if (percent >= 80)
      motivation =
        "🌟 Excellent! Keep this consistency – GPSC clear thase 💪";
    else if (percent >= 50)
      motivation =
        "🙂 Good attempt! Weak areas revise karo – improvement pakki che";
    else
      motivation =
        "🤍 Don’t worry. Slowly revise karo – consistency > marks";

    bot.sendMessage(
      msg.chat.id,
      `${intro()}Daily Test Finished\nScore: ${TEST.score}/${TEST.mcqs.length} (${percent}%)\n\n${motivation}`
    );

    TEST = null;
  } else {
    setTimeout(sendQuestion, 2000);
  }
});
