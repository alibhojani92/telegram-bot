/*****************************************************************
 GPSC DENTAL PULSE BOT – FINAL v4.2
*****************************************************************/
const express = require("express");
const TelegramBot = require("node-telegram-bot-api");
const fs = require("fs");

/* ================= BASIC SETUP ================= */
const app = express();
app.use(express.json());

const TOKEN = process.env.BOT_TOKEN;
const APP_URL = process.env.APP_URL;
const GROUP_ID = Number(process.env.GROUP_ID);
const ADMIN_ID = Number(process.env.ADMIN_ID);
const PORT = process.env.PORT || 3000;

/* ================= BOT INIT (WEBHOOK) ================= */
const bot = new TelegramBot(TOKEN);
bot.setWebHook(`${APP_URL}/bot${TOKEN}`);

app.post(`/bot${TOKEN}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

app.get("/", (_, res) => res.send("GPSC DENTAL PULSE BOT Running ✅"));
app.listen(PORT, () => console.log("Server started"));

/* ================= DATA STORE (SAFE) ================= */
const DB_FILE = "./db.json";
let DB = fs.existsSync(DB_FILE)
  ? JSON.parse(fs.readFileSync(DB_FILE))
  : {
      mcqs: [],
      reading: {},
      tests: [],
      usedDaily: []
    };

const saveDB = () =>
  fs.writeFileSync(DB_FILE, JSON.stringify(DB, null, 2));

/* ================= HELPERS ================= */
const nowDate = () => new Date().toISOString().slice(0, 10);
const toHM = (m) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

function shuffle(arr) {
  return arr.sort(() => Math.random() - 0.5);
}

/* ================= START ================= */
bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, "Dear Arzoo 🌸\nGPSC DENTAL PULSE BOT Running ✅");
});

/* ================= READING SYSTEM ================= */
let readingSession = {};

bot.onText(/(\/read|#read)/, (msg) => {
  readingSession[msg.from.id] = Date.now();
  bot.sendMessage(msg.chat.id, "Dear Arzoo 📖\nReading started. Stay focused 💪");
});

bot.onText(/\/stop/, (msg) => {
  const uid = msg.from.id;
  if (!readingSession[uid]) return;

  const mins = Math.floor((Date.now() - readingSession[uid]) / 60000);
  delete readingSession[uid];

  const d = nowDate();
  DB.reading[d] = (DB.reading[d] || 0) + mins;
  saveDB();

  const total = DB.reading[d];
  const rem = Math.max(0, 480 - total);

  bot.sendMessage(
    msg.chat.id,
    `Dear Arzoo ⏱️\nStudied: ${toHM(total)}\nRemaining Target: ${toHM(rem)}`
  );

  if (msg.from.id !== ADMIN_ID) {
    bot.sendMessage(
      ADMIN_ID,
      `📢 Arzoo stopped reading\nToday: ${toHM(total)}`
    );
  }
});

/* ================= ADD MCQ (ADMIN ONLY) ================= */
bot.onText(/\/addmcq([\s\S]*)/, (msg, m) => {
  if (msg.from.id !== ADMIN_ID) return;

  const t = m[1];
  const q = t.match(/Q\d*\.(.*)/)?.[1]?.trim();
  const A = t.match(/A\)(.*)/)?.[1];
  const B = t.match(/B\)(.*)/)?.[1];
  const C = t.match(/C\)(.*)/)?.[1];
  const D = t.match(/D\)(.*)/)?.[1];
  const ans = t.match(/OK\s*([A-D])/i)?.[1];
  const exp = t.match(/Explanation:(.*)/s)?.[1]?.trim() || "";
  const subj = t.match(/Subject:(.*)/)?.[1]?.trim() || "General";

  if (!q || !A || !B || !C || !D || !ans) {
    bot.sendMessage(msg.chat.id, "❌ MCQ format wrong");
    return;
  }

  DB.mcqs.push({ q, A, B, C, D, ans, exp, subj });
  saveDB();
  bot.sendMessage(msg.chat.id, "✅ MCQ saved");
});

/* ================= TEST ENGINE ================= */
let activeTest = null;
let timer = null;
let timeLeft = 300;

function startTest(count, subject = null) {
  let pool = DB.mcqs;
  if (subject) pool = pool.filter(m => m.subj.toLowerCase() === subject);

  const unused = pool.filter((_, i) => !DB.usedDaily.includes(i));
  const qs = shuffle(unused.length ? unused : pool).slice(0, count);

  activeTest = {
    qs,
    i: 0,
    score: 0,
    wrong: 0,
    timeup: 0,
    start: Date.now()
  };
}

function sendQ() {
  if (!activeTest) return;

  if (activeTest.i >= activeTest.qs.length) {
    finishTest();
    return;
  }

  const q = activeTest.qs[activeTest.i];
  timeLeft = 300;

  bot.sendMessage(
    GROUP_ID,
`📝 Q${activeTest.i + 1}️⃣ ${q.q}

A. ${q.A}
B. ${q.B}
C. ${q.C}
D. ${q.D}

⏳ Remaining Time: 05:00`,
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: "A", callback_data: "A" }, { text: "B", callback_data: "B" }],
          [{ text: "C", callback_data: "C" }, { text: "D", callback_data: "D" }]
        ]
      }
    }
  );

  clearInterval(timer);
  timer = setInterval(() => {
    timeLeft--;
    if ([240,180,120,60].includes(timeLeft)) {
      bot.sendMessage(GROUP_ID, `⏳ ${timeLeft/60}:00 minutes remaining`);
    }
    if (timeLeft <= 0) {
      clearInterval(timer);
      activeTest.timeup++;
      activeTest.wrong++;
      bot.sendMessage(
        GROUP_ID,
        `⏰ Time’s Up!\n✔️ Correct Answer: ${q.ans}\n📚 ${q.subj}\n💡 ${q.exp}`
      );
      activeTest.i++;
      setTimeout(sendQ, 2000);
    }
  }, 1000);
}

bot.on("callback_query", (cq) => {
  if (!activeTest) return;
  clearInterval(timer);

  const ans = cq.data;
  const q = activeTest.qs[activeTest.i];

  if (ans === q.ans) {
    activeTest.score++;
    bot.sendMessage(GROUP_ID, "✅ Correct 🎉");
  } else {
    activeTest.wrong++;
    bot.sendMessage(
      GROUP_ID,
      `❌ Wrong\n✔️ Correct: ${q.ans}\n📚 ${q.subj}\n💡 ${q.exp}`
    );
  }

  activeTest.i++;
  setTimeout(sendQ, 2000);
});

/* ================= FINISH TEST ================= */
function finishTest() {
  const total = activeTest.qs.length;
  const accuracy = Math.round((activeTest.score / total) * 100);

  const result =
    activeTest.score >= 12 ? "PASS ✅" : "FAIL ❌";

  const summary =
`📊 Test Result – Daily Test

✅ Correct: ${activeTest.score}
❌ Wrong: ${activeTest.wrong}
⏰ Time-up: ${activeTest.timeup}

🎯 Score: ${activeTest.score} / ${total}
📈 Accuracy: ${accuracy}%
📌 Result: ${result}

💡 Advice:
Focus on weak topics & improve speed ⏱️`;

  bot.sendMessage(GROUP_ID, summary);

  DB.tests.push({
    date: nowDate(),
    score: activeTest.score,
    total,
    accuracy
  });
  saveDB();
  activeTest = null;
}

/* ================= COMMANDS ================= */
bot.onText(/\/dt$/, (msg) => {
  if (msg.chat.id !== GROUP_ID) return;
  startTest(20);
  bot.sendMessage(GROUP_ID, "📝 Daily Test Started (20 MCQs)");
  sendQ();
});

bot.onText(/\/report/, (msg) => {
  let r = `📊 Study Report – Arzoo\n\n`;
  for (let d in DB.reading) {
    r += `📅 ${d}: ${toHM(DB.reading[d])}\n`;
  }
  bot.sendMessage(msg.chat.id, r);
});
