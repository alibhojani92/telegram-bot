/*****************************************************************
 GPSC DENTAL PULSE BOT – FINAL v4.3 (GITHUB READY)
*****************************************************************/

const express = require("express");
const TelegramBot = require("node-telegram-bot-api");
const fs = require("fs");

const app = express();
app.use(express.json());

/* ================= ENV ================= */
const TOKEN = process.env.BOT_TOKEN;
const APP_URL = process.env.APP_URL;
const GROUP_ID = Number(process.env.GROUP_ID);
const ADMIN_ID = Number(process.env.ADMIN_ID);
const PORT = process.env.PORT || 3000;

/* ================= BOT ================= */
const bot = new TelegramBot(TOKEN);
bot.setWebHook(`${APP_URL}/bot${TOKEN}`);

app.post(`/bot${TOKEN}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

app.get("/", (_, res) => res.send("GPSC DENTAL PULSE BOT v4.3 Running ✅"));
app.listen(PORT, () => console.log("Server started"));

/* ================= DATABASE ================= */
const DB_FILE = "./db.json";
let DB = fs.existsSync(DB_FILE)
  ? JSON.parse(fs.readFileSync(DB_FILE))
  : { mcqs: [], reading: {}, tests: [] };

const saveDB = () =>
  fs.writeFileSync(DB_FILE, JSON.stringify(DB, null, 2));

/* ================= HELPERS ================= */
const today = () => new Date().toISOString().slice(0, 10);
const toHM = (m) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const shuffle = (a) => a.sort(() => Math.random() - 0.5);

/* ================= START ================= */
bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, "Dear Arzoo 🌸\nGPSC DENTAL PULSE BOT Running ✅");
});

/* ================= READING ================= */
let readingStart = null;

bot.onText(/(\/read|#read)/, (msg) => {
  readingStart = Date.now();
  bot.sendMessage(msg.chat.id, "Dear Arzoo 📖\nReading started. Stay focused 💪");
});

bot.onText(/\/stop/, (msg) => {
  if (!readingStart) return;
  const mins = Math.floor((Date.now() - readingStart) / 60000);
  readingStart = null;

  const d = today();
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
      `📢 Arzoo stopped reading\nToday total: ${toHM(total)}`
    );
  }
});

/* ================= ADD MCQ (ADMIN) ================= */
bot.onText(/\/addmcq([\s\S]*)/, (msg, m) => {
  if (msg.from.id !== ADMIN_ID) return;

  const text = m[1].trim();
  const blocks = text.split(/\n\s*\n/);
  let added = 0;

  blocks.forEach((b) => {
    const q = b.match(/Q\d*\.(.*)/)?.[1]?.trim();
    const A = b.match(/A\)(.*)/)?.[1];
    const B = b.match(/B\)(.*)/)?.[1];
    const C = b.match(/C\)(.*)/)?.[1];
    const D = b.match(/D\)(.*)/)?.[1];
    const ans = b.match(/OK\s*([A-D])/i)?.[1];
    const exp = b.match(/Explanation:(.*)/s)?.[1]?.trim() || "";
    const subj = b.match(/Subject:(.*)/)?.[1]?.trim() || "General";

    if (q && A && B && C && D && ans) {
      DB.mcqs.push({ q, A, B, C, D, ans, exp, subj });
      added++;
    }
  });

  saveDB();
  bot.sendMessage(msg.chat.id, `✅ ${added} MCQs saved permanently`);
});

/* ================= TEST ENGINE ================= */
let activeTest = null;
let timer = null;
let timeLeft = 0;

function startTest(count) {
  const pool = shuffle([...DB.mcqs]).slice(0, count);
  activeTest = { qs: pool, i: 0, score: 0, wrong: 0, timeup: 0 };
}

function sendQuestion() {
  if (!activeTest || activeTest.i >= activeTest.qs.length) {
    finishTest();
    return;
  }

  const q = activeTest.qs[activeTest.i];
  timeLeft = 300;

  bot.sendMessage(
    GROUP_ID,
`📝 Q${activeTest.i + 1}. ${q.q}

A) ${q.A}
B) ${q.B}
C) ${q.C}
D) ${q.D}

⏳ Remaining Time: 05:00`,
{
  reply_markup: {
    inline_keyboard: [
      [{ text: "A", callback_data: "A" }, { text: "B", callback_data: "B" }],
      [{ text: "C", callback_data: "C" }, { text: "D", callback_data: "D" }]
    ]
  }
});

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
      setTimeout(sendQuestion, 2000);
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
  setTimeout(sendQuestion, 2000);
});

/* ================= FINISH TEST ================= */
function finishTest() {
  if (!activeTest) return;

  const total = activeTest.qs.length;
  const acc = Math.round((activeTest.score / total) * 100);
  const result = activeTest.score >= 12 ? "PASS ✅" : "FAIL ❌";

  bot.sendMessage(
    GROUP_ID,
`📊 Test Result

✅ Correct: ${activeTest.score}
❌ Wrong: ${activeTest.wrong}
⏰ Time-up: ${activeTest.timeup}

🎯 Score: ${activeTest.score}/${total}
📈 Accuracy: ${acc}%
📌 Result: ${result}

💡 Advice: Revise wrong MCQs & improve speed ⏱️`
  );

  DB.tests.push({ date: today(), score: activeTest.score, total });
  saveDB();
  activeTest = null;
}

/* ================= COMMANDS ================= */
bot.onText(/\/dt$/, (msg) => {
  if (msg.chat.id !== GROUP_ID) return;
  startTest(20);
  bot.sendMessage(GROUP_ID, "📝 Daily Test Started (20 MCQs)");
  sendQuestion();
});

bot.onText(/\/dtc$/, (msg) => {
  if (msg.from.id !== ADMIN_ID) return;
  clearInterval(timer);
  activeTest = null;
  bot.sendMessage(GROUP_ID, "🛑 Test Cancelled by Admin\n❌ Not counted");
});

bot.onText(/\/report/, (msg) => {
  let r = `📊 Study Report – Arzoo\n\n`;
  for (let d in DB.reading) {
    r += `📅 ${d}: ${toHM(DB.reading[d])}\n`;
  }
  bot.sendMessage(msg.chat.id, r);
});
