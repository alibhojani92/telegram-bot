/*****************************************************************
 GPSC DENTAL PULSE BOT – FINAL v7.0 (PRODUCTION)
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
app.use(express.json());

/* ================= BOT ================= */
const bot = new TelegramBot(TOKEN);
bot.setWebHook(`${APP_URL}/bot${TOKEN}`);

app.post(`/bot${TOKEN}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

app.get("/", (_, res) => res.send("GPSC Dental Pulse Bot v7.0 Running ✅"));
app.listen(PORT);

/* ================= HELPERS ================= */
const nowIST = () =>
  new Date(new Date().toLocaleString("en-US", { timeZone: TIMEZONE }));
const today = () => nowIST().toISOString().slice(0, 10);
const mm = (min) =>
  `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

const intro = (msg) =>
  msg.from.id === ADMIN_ID ? "🛠 Admin Panel\n" : "🌺 Dr. Arzoo Fatema 🌺\n";

/* ================= DATABASE ================= */
const DB_FILE = "./data.json";
let DB = fs.existsSync(DB_FILE)
  ? JSON.parse(fs.readFileSync(DB_FILE))
  : {
      readingLog: {},
      readingSession: {},
      mcqs: [],
      tests: [],
      used: {}, // date-wise used MCQs
    };

const save = () => fs.writeFileSync(DB_FILE, JSON.stringify(DB, null, 2));

/* ================= START ================= */
bot.onText(/\/start/i, (msg) => {
  bot.sendMessage(
    msg.chat.id,
    `🌺 Dr. Arzoo Fatema 🌺
GPSC Dental Pulse Bot is LIVE ✅`
  );
});

/* ================= READING ================= */
bot.onText(/\/read/i, (msg) => {
  if (msg.from.id === ADMIN_ID)
    return bot.sendMessage(msg.chat.id, "ℹ️ Admin test mode – reading not counted");

  const d = today();
  if (DB.readingSession[msg.from.id]?.date === d)
    return bot.sendMessage(msg.chat.id, intro(msg) + "📖 Reading already running");

  DB.readingSession[msg.from.id] = { start: Date.now(), date: d };
  save();

  bot.sendMessage(
    msg.chat.id,
    `${intro(msg)}📖 Reading started
🎯 Target: 08:00
⏳ Remaining: 08:00`
  );
  bot.sendMessage(
    ADMIN_ID,
    `👤 Student started reading\n🕒 ${nowIST().toLocaleTimeString()}`
  );
});

bot.onText(/\/stop/i, (msg) => {
  if (msg.from.id === ADMIN_ID)
    return bot.sendMessage(msg.chat.id, "ℹ️ Admin test mode – no reading session");

  const s = DB.readingSession[msg.from.id];
  if (!s)
    return bot.sendMessage(msg.chat.id, intro(msg) + "⚠️ No active reading");

  const mins = Math.floor((Date.now() - s.start) / 60000);
  DB.readingLog[s.date] = (DB.readingLog[s.date] || 0) + mins;
  delete DB.readingSession[msg.from.id];
  save();

  const total = DB.readingLog[s.date];
  bot.sendMessage(
    msg.chat.id,
    `${intro(msg)}⏱ Reading stopped
📘 Today: ${mm(total)}
🎯 Remaining: ${mm(Math.max(480 - total, 0))}`
  );
  bot.sendMessage(
    ADMIN_ID,
    `👤 Student stopped reading\n📘 Today total: ${mm(total)}`
  );
});

/* ================= MCQ ADD (ADMIN – REPLY) ================= */
let ADD = false;

bot.onText(/\/addmcq$/i, (msg) => {
  if (msg.from.id !== ADMIN_ID) return;
  ADD = true;
  bot.sendMessage(
    msg.chat.id,
    `🛠 Admin Panel
Reply with MCQs (SUBJECT optional)`
  );
});

bot.on("message", (msg) => {
  if (!ADD || !msg.reply_to_message || !msg.text) return;
  if (msg.text.startsWith("/")) return;

  ADD = false;

  let subject = "General";
  const sm = msg.text.match(/^SUBJECT:\s*(.*)$/im);
  if (sm) subject = sm[1].trim();

  const blocks = msg.text
    .replace(/^SUBJECT:.*$/im, "")
    .trim()
    .split(/\n(?=Q\.|\d+\.)/i);

  let add = 0,
    skip = 0;

  blocks.forEach((b) => {
    const q = b.match(/Q\.?\s*\d*\.?\s*(.*)/i)?.[1];
    const A = b.match(/A\)\s*(.*)/i)?.[1];
    const B = b.match(/B\)\s*(.*)/i)?.[1];
    const C = b.match(/C\)\s*(.*)/i)?.[1];
    const D = b.match(/D\)\s*(.*)/i)?.[1];
    const ans = b.match(/Ans[:\s]*(\(?[ABCD]\)?)/i)?.[1]?.replace(/[()]/g, "");
    const exp = b.match(/Exp[:\s]*(.*)/i)?.[1] || "";

    if (q && A && B && C && D && ans) {
      DB.mcqs.push({ q, A, B, C, D, ans, exp, subject });
      add++;
    } else skip++;
  });

  save();
  bot.sendMessage(msg.chat.id, `🛠 Admin Panel\nAdded: ${add}\nSkipped: ${skip}`);
});

/* ================= MCQ COUNT ================= */
bot.onText(/\/mcqcount/i, (msg) => {
  if (msg.from.id !== ADMIN_ID)
    return bot.sendMessage(msg.chat.id, "❌ Admin only command");

  const map = {};
  DB.mcqs.forEach((m) => (map[m.subject] = (map[m.subject] || 0) + 1));

  let t = `📚 MCQ DATABASE\nTotal: ${DB.mcqs.length}\n\n`;
  Object.keys(map).forEach((s) => (t += `• ${s}: ${map[s]}\n`));
  bot.sendMessage(msg.chat.id, t);
});

/* ================= TEST ENGINE ================= */
let TEST = null;

function pickMCQs(total, subject) {
  const d = today();
  DB.used[d] = DB.used[d] || [];
  let pool = DB.mcqs.filter(
    (m) => !DB.used[d].includes(m.q) && (!subject || m.subject.toLowerCase() === subject)
  );
  pool = pool.sort(() => Math.random() - 0.5).slice(0, total);
  pool.forEach((q) => DB.used[d].push(q.q));
  save();
  return pool;
}

function startTest(type, total, subject = null) {
  const pool = pickMCQs(total, subject);
  if (!pool.length)
    return bot.sendMessage(GROUP_ID, "❌ No MCQs found for this subject");

  TEST = { type, total, pool, i: 0, correct: 0, wrong: 0 };
  ask();
}

function ask() {
  if (!TEST) return;
  if (TEST.i >= TEST.total) {
    DB.tests.push({
      date: today(),
      type: TEST.type,
      total: TEST.total,
      correct: TEST.correct,
      wrong: TEST.wrong,
    });
    save();
    bot.sendMessage(
      GROUP_ID,
      `🌺 Dr. Arzoo Fatema 🌺
📊 ${TEST.type} Test Finished
✅ ${TEST.correct}/${TEST.total}`
    );
    TEST = null;
    return;
  }

  const q = TEST.pool[TEST.i];
  let min = 5;

  bot.sendMessage(
    GROUP_ID,
    `🌺 Dr. Arzoo Fatema 🌺
📝 ${TEST.type} – Q${TEST.i + 1}
📚 ${q.subject}

${q.q}

A) ${q.A}
B) ${q.B}
C) ${q.C}
D) ${q.D}

⏱️ Time: 5 min`,
    {
      reply_markup: {
        inline_keyboard: [
          [
            { text: "A", callback_data: "A" },
            { text: "B", callback_data: "B" },
          ],
          [
            { text: "C", callback_data: "C" },
            { text: "D", callback_data: "D" },
          ],
        ],
      },
    }
  );

  TEST.tick = setInterval(() => {
    min--;
    if (min <= 2 && min > 0)
      bot.sendMessage(GROUP_ID, `⏳ ${min} min left`);
  }, 60000);

  TEST.timer = setTimeout(() => {
    clearInterval(TEST.tick);
    TEST.wrong++;
    bot.sendMessage(
      GROUP_ID,
      `⏰ Time up!
✔️ Correct: ${q.ans}
💡 ${q.exp}`
    );
    TEST.i++;
    ask();
  }, 300000);
}

bot.on("callback_query", (cq) => {
  if (!TEST) return;
  clearTimeout(TEST.timer);
  clearInterval(TEST.tick);

  const q = TEST.pool[TEST.i];
  if (cq.data === q.ans) TEST.correct++;
  else TEST.wrong++;

  bot.sendMessage(
    GROUP_ID,
    `${cq.data === q.ans ? "✅ Correct" : "❌ Wrong"}
✔️ ${q.ans}
💡 ${q.exp}`
  );
  TEST.i++;
  setTimeout(ask, 2000);
});

bot.onText(/\/dt(?:\s+(.*))?/i, (msg, m) => {
  if (msg.chat.id !== GROUP_ID) return;
  startTest("Daily", 20, m[1]?.toLowerCase());
});
bot.onText(/\/wt/i, (msg) => {
  if (msg.chat.id !== GROUP_ID) return;
  startTest("Weekly", 50);
});
bot.onText(/\/dtc|\/wtc/i, (msg) => {
  if (msg.from.id !== ADMIN_ID) return;
  TEST = null;
  bot.sendMessage(GROUP_ID, "🛑 Test cancelled by admin");
});

/* ================= REPORTS ================= */
bot.onText(/\/report/i, (msg) => {
  const mins = DB.readingLog[today()] || 0;
  bot.sendMessage(
    msg.chat.id,
    `${intro(msg)}📊 Daily Report
📘 Study: ${mm(mins)}
💡 Keep revising weak subjects`
  );
});

bot.onText(/\/mr/i, (msg) => {
  let total = 0;
  Object.values(DB.readingLog).forEach((m) => (total += m));
  bot.sendMessage(
    msg.chat.id,
    `${intro(msg)}📊 Monthly Report
📘 Total: ${mm(total)}`
  );
});

/* ================= AUTO MESSAGES ================= */
setInterval(() => {
  const n = nowIST();
  if (n.getHours() === 0 && n.getMinutes() === 0) DB.readingSession = {};
  if (n.getHours() === 6 && n.getMinutes() === 0)
    bot.sendMessage(GROUP_ID, "🌅 Good Morning\n🎯 Target: 08:00");
  if (n.getHours() === 23 && n.getMinutes() === 59)
    bot.sendMessage(GROUP_ID, "🌙 Good Night\nRevise weak areas");
}, 60000);
