/*****************************************************************
 GPSC DENTAL CLASS-2 BOT — v7.0 LOCKED PRODUCTION BUILD
 Owner: Dr. Arzoo Fatema
******************************************************************/

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
const TIMEZONE = "Asia/Kolkata";

/* ================= BOT ================= */
const bot = new TelegramBot(TOKEN);
bot.setWebHook(`${APP_URL}/bot${TOKEN}`);

app.post(`/bot${TOKEN}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});
app.get("/", (_, res) =>
  res.send("GPSC Dental Mentor AI v7.0 Running ✅")
);
app.listen(PORT);

/* ================= TIME HELPERS ================= */
const nowIST = () =>
  new Date(new Date().toLocaleString("en-US", { timeZone: TIMEZONE }));
const today = () => nowIST().toISOString().slice(0, 10);
const mm = m =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/* ================= DATABASE ================= */
const DB_FILE = "./data.json";
let DB = fs.existsSync(DB_FILE)
  ? JSON.parse(fs.readFileSync(DB_FILE))
  : {
      readingLog: {},
      readingSession: {},
      mcqs: [],
      tests: [],
      mcqUsage: {},
      saved: {}
    };

const save = () =>
  fs.writeFileSync(DB_FILE, JSON.stringify(DB, null, 2));

/* ================= INTRO ================= */
const intro = () => "🌺 Dr. Arzoo Fatema 🌺\n";

/* ================= READING ================= */
bot.onText(/\/read/i, msg => {
  const uid = msg.from.id;
  const d = today();

  // Admin test — no counting
  if (uid === ADMIN_ID) {
    return bot.sendMessage(
      msg.chat.id,
      intro() +
        `📖 Reading Started\n🕒 ${nowIST().toLocaleTimeString()}`
    );
  }

  if (DB.readingSession[uid]?.date === d) {
    return bot.sendMessage(
      msg.chat.id,
      intro() + "⚠️ Reading already running. Use /stop"
    );
  }

  const firstToday = !DB.readingLog[d];
  DB.readingSession[uid] = { start: Date.now(), date: d };
  save();

  let weakText = "";
  const last = DB.tests.slice(-1)[0];
  if (firstToday && last?.weak?.length) {
    weakText =
      "\n📌 Weak Subjects Today:\n• " + last.weak.join("\n• ");
  }

  bot.sendMessage(
    msg.chat.id,
    intro() +
      `📖 Reading Started\n🎯 Target: 08:00\n⏳ Remaining: 08:00${weakText}`
  );

  bot.sendMessage(
    ADMIN_ID,
    `🛠️ Admin Panel\n📖 Student started reading\n🕒 ${nowIST().toLocaleTimeString()}`
  );
});

bot.onText(/\/stop/i, msg => {
  const uid = msg.from.id;

  // Admin stop — no count
  if (uid === ADMIN_ID) {
    return bot.sendMessage(
      msg.chat.id,
      intro() +
        `⏱️ Reading Stopped\n🕒 ${nowIST().toLocaleTimeString()}`
    );
  }

  const s = DB.readingSession[uid];
  if (!s)
    return bot.sendMessage(
      msg.chat.id,
      intro() + "⚠️ No active reading session."
    );

  const mins = Math.floor((Date.now() - s.start) / 60000);
  DB.readingLog[s.date] = (DB.readingLog[s.date] || 0) + mins;
  delete DB.readingSession[uid];
  save();

  const total = DB.readingLog[s.date];

  bot.sendMessage(
    msg.chat.id,
    intro() +
      `⏱️ Reading Stopped\n📘 Today: ${mm(total)}\n⏳ Remaining: ${mm(
        Math.max(480 - total, 0)
      )}`
  );

  bot.sendMessage(
    ADMIN_ID,
    `🛠️ Admin Panel\n⏱️ Student stopped reading\n📘 Duration: ${mm(mins)}`
  );
});

/* ================= MCQ ADD (ADMIN) ================= */
let ADD = false;

bot.onText(/\/addmcq/i, msg => {
  if (msg.from.id !== ADMIN_ID) return;
  ADD = true;
  bot.sendMessage(
    msg.chat.id,
`Reply with MCQs:

SUBJECT: Oral Anatomy

Q. Question?
A) A
B) B
C) C
D) D
Ans: A
Exp: Explanation`
  );
});

bot.on("message", msg => {
  if (!ADD || !msg.reply_to_message || msg.from.id !== ADMIN_ID) return;
  ADD = false;

  let subject = "General";
  const sm = msg.text.match(/^SUBJECT:\s*(.*)$/im);
  if (sm) subject = sm[1].trim();

  const blocks = msg.text
    .replace(/^SUBJECT:.*$/im, "")
    .split(/\n(?=Q\.)/i);

  let added = 0;

  blocks.forEach(b => {
    const q = b.match(/Q\.\s*(.*)/i)?.[1];
    const A = b.match(/A\)\s*(.*)/i)?.[1];
    const B = b.match(/B\)\s*(.*)/i)?.[1];
    const C = b.match(/C\)\s*(.*)/i)?.[1];
    const D = b.match(/D\)\s*(.*)/i)?.[1];
    const ans = b.match(/Ans:\s*([ABCD])/i)?.[1];
    const exp = b.match(/Exp:\s*(.*)/i)?.[1] || "";

    if (q && A && B && C && D && ans) {
      DB.mcqs.push({
        id: Date.now() + Math.random(),
        q, A, B, C, D, ans, exp, subject
      });
      added++;
    }
  });

  save();
  bot.sendMessage(
    msg.chat.id,
    `🛠️ Admin Panel\n✅ MCQs Added: ${added}`
  );
});

/* ================= TEST ENGINE ================= */
let TEST = null;

const eligibleMCQs = subject => {
  const cutoff = new Date(today());
  cutoff.setDate(cutoff.getDate() - 30);

  return DB.mcqs.filter(m => {
    if (subject && m.subject.toLowerCase() !== subject) return false;
    const last = DB.mcqUsage[m.id];
    return !last || new Date(last) < cutoff;
  });
};

function startTest(type, total, subject = null) {
  if (TEST) return;

  const pool = eligibleMCQs(subject)
    .sort(() => Math.random() - 0.5)
    .slice(0, total);

  if (pool.length < total)
    return bot.sendMessage(
      GROUP_ID,
      "⚠️ Not enough fresh MCQs. Add more questions."
    );

  TEST = { type, total, pool, i: 0, correct: 0, wrong: 0, subj: {} };
  ask();
}

function ask() {
  if (!TEST) return;
  if (TEST.i >= TEST.total) {
    const weak = Object.entries(TEST.subj)
      .sort((a, b) => a[1] - b[1])
      .slice(0, 3)
      .map(x => x[0]);

    DB.tests.push({
      date: today(),
      type: TEST.type,
      weak
    });
    save();

    bot.sendMessage(
      GROUP_ID,
      intro() +
        `📊 ${TEST.type} Test Completed\n✅ ${TEST.correct}/${TEST.total}\n📌 Weak: ${weak.join(", ")}`
    );
    TEST = null;
    return;
  }

  const q = TEST.pool[TEST.i];
  DB.mcqUsage[q.id] = today();
  save();

  bot.sendMessage(
    GROUP_ID,
`${intro()}📝 ${TEST.type} Test – Q${TEST.i + 1}

${q.q}

A) ${q.A}
B) ${q.B}
C) ${q.C}
D) ${q.D}

⏱️ Time: 5 min`,
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: "A", callback_data: "A" }, { text: "B", callback_data: "B" }],
          [{ text: "C", callback_data: "C" }, { text: "D", callback_data: "D" }]
        ]
      }
    }
  );

  TEST.timer = setTimeout(() => {
    TEST.wrong++;
    TEST.subj[q.subject] = (TEST.subj[q.subject] || 0) + 1;
    bot.sendMessage(
      GROUP_ID,
      `⏰ Time up!\n✔️ ${q.ans}\n${q.exp}`
    );
    TEST.i++;
    ask();
  }, 300000);
}

bot.on("callback_query", q => {
  if (!TEST) return;
  clearTimeout(TEST.timer);

  const cur = TEST.pool[TEST.i];
  if (q.data === cur.ans) TEST.correct++;
  else TEST.wrong++;

  TEST.subj[cur.subject] = (TEST.subj[cur.subject] || 0) + 1;

  bot.sendMessage(
    GROUP_ID,
`✔️ Correct: ${cur.ans}
📚 Subject: ${cur.subject}
💡 ${cur.exp}`
  );

  TEST.i++;
  setTimeout(ask, 2000);
});

/* ================= COMMANDS ================= */
bot.onText(/\/dt\s*(.*)/i, (m, match) => {
  const sub = match[1]?.trim().toLowerCase();
  startTest("Daily", 20, sub || null);
});
bot.onText(/\/wt\s*(.*)/i, (m, match) => {
  const sub = match[1]?.trim().toLowerCase();
  startTest("Weekly", 50, sub || null);
});
bot.onText(/\/dtc|\/wtc/i, m => {
  if (m.from.id === ADMIN_ID) {
    TEST = null;
    bot.sendMessage(GROUP_ID, "🛑 Test cancelled by Admin");
  }
});

/* ================= AUTO MESSAGE ================= */
setInterval(() => {
  if (TEST) return;

  const n = nowIST();
  if (n.getHours() === 23 && n.getMinutes() === 59) {
    const mins = DB.readingLog[today()] || 0;
    bot.sendMessage(
      GROUP_ID,
      intro() + `🌙 Good Night\n📘 Today: ${mm(mins)}`
    );
  }
}, 60000);
