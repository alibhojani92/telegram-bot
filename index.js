/*****************************************************************
 GPSC DENTAL PULSE BOT – FINAL MASTER VERSION (A–Z)
******************************************************************/

const fs = require("fs");
const path = require("path");
const express = require("express");
const TelegramBot = require("node-telegram-bot-api");

const app = express();
app.use(express.json());

/* ================= ENV ================= */
const PORT = process.env.PORT || 3000;
const TOKEN = process.env.BOT_TOKEN;
const GROUP_ID = Number(process.env.GROUP_ID);
const APP_URL = process.env.APP_URL;

const ADMIN_ID = 7539477188;
const STUDENT_ID = 1072651590;

/* ================= CONSTANTS ================= */
const DAILY_TARGET_HM = { h: 8, m: 0 }; // 08:00
const EXAM_DATE = new Date("2026-02-18");
const DATA_FILE = path.join(__dirname, "data.json");

/* ================= TIME (IST) ================= */
function nowIST() {
  return new Date(Date.now() + 5.5 * 60 * 60 * 1000);
}
function fmtHM(mins) {
  const h = String(Math.floor(mins / 60)).padStart(2, "0");
  const m = String(mins % 60).padStart(2, "0");
  return `${h}:${m}`;
}
function today() {
  return nowIST().toISOString().split("T")[0];
}
function daysToExam() {
  const diff = EXAM_DATE - nowIST();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

/* ================= DATA (FILE STORAGE) ================= */
function loadData() {
  if (!fs.existsSync(DATA_FILE)) {
    const init = {
      readingLog: {},
      testLog: {},
      mcqs: [],
      dailyUsed: {},
      wrongSet: {},
      correctSet: {}
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
app.get("/", (_, res) => res.send("GPSC DENTAL PULSE BOT Running ✅"));
app.listen(PORT);

/* ================= HELPERS ================= */
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function sendStudent(text) {
  bot.sendMessage(GROUP_ID, text);
  bot.sendMessage(STUDENT_ID, text);
}
function adminNotify(text) {
  bot.sendMessage(ADMIN_ID, text);
}

/* ================= READING ================= */
let readingSession = null;

bot.onText(/\/read/, msg => {
  if (msg.from.id !== STUDENT_ID) return;
  if (readingSession) return sendStudent("📖 Reading already running ⚠️");

  readingSession = { start: nowIST() };
  const t = readingSession.start.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });

  sendStudent(
`📖 Reading started 💪

🕒 Start Time: ${t}
🎯 Daily Target: ${fmtHM(DAILY_TARGET_HM.h*60 + DAILY_TARGET_HM.m)} hours`
  );

  adminNotify(`👨‍🎓 Arzoo started reading\n🕒 Time: ${t}`);
});

bot.onText(/\/stop/, msg => {
  if (msg.from.id !== STUDENT_ID) return;
  if (!readingSession) return sendStudent("❌ Reading not started");

  const end = nowIST();
  const start = readingSession.start;
  const mins = Math.max(0, Math.round((end - start) / 60000));
  const d = today();

  DB.readingLog[d] = (DB.readingLog[d] || 0) + mins;
  saveData();

  const startT = start.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  const endT = end.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  const remaining = Math.max(0, (DAILY_TARGET_HM.h*60 + DAILY_TARGET_HM.m) - DB.readingLog[d]);

  readingSession = null;

  sendStudent(
`⏱️ Reading stopped ✅

🕒 Start Time: ${startT}
🕒 End Time: ${endT}
📖 Studied Today: ${fmtHM(DB.readingLog[d])} hours
🎯 Target Remaining: ${fmtHM(remaining)} hours`
  );

  adminNotify(
`👨‍🎓 Arzoo stopped reading
📖 Duration: ${fmtHM(mins)} hours
📅 Date: ${d}`
  );
});

/* ================= ADD MCQ (ADMIN PRIVATE) ================= */
bot.onText(/\/addmcq([\s\S]*)/, (msg, m) => {
  if (msg.from.id !== ADMIN_ID || msg.chat.type !== "private") return;
  const blocks = m[1].trim().split(/\n(?=Q\d+)/);
  let added = 0;

  blocks.forEach(b => {
    const q = b.match(/Q\d+\.?\s*(.*)/)?.[1];
    const A = b.match(/A\)\s*(.*)/)?.[1];
    const B = b.match(/B\)\s*(.*)/)?.[1];
    const C = b.match(/C\)\s*(.*)/)?.[1];
    const D = b.match(/D\)\s*(.*)/)?.[1];
    const ans = b.match(/OK\s*([ABCD])/i)?.[1];
    const exp = b.match(/Explanation:\s*([\s\S]*)/i)?.[1] || "";

    if (q && A && B && C && D && ans) {
      DB.mcqs.push({ id: Date.now()+Math.random(), q, options:{A,B,C,D}, ans, exp });
      added++;
    }
  });

  saveData();
  bot.sendMessage(msg.chat.id, `✅ ${added} MCQs added`);
});

/* ================= TEST ENGINE ================= */
let activeTest = null;

function pickDaily20() {
  const unused = DB.mcqs.filter(m => !DB.dailyUsed[m.id]);
  const sel = shuffle(unused).slice(0, 20);
  sel.forEach(m => DB.dailyUsed[m.id] = true);
  saveData();
  return sel;
}

function pickWeekly50() {
  const wrong = DB.mcqs.filter(m => DB.wrongSet[m.id]);
  const fresh = DB.mcqs.filter(m => !DB.dailyUsed[m.id]);
  const correct = DB.mcqs.filter(m => DB.correctSet[m.id]);

  let picked = [];
  picked = picked.concat(shuffle(wrong).slice(0, 30));
  if (picked.length < 50) picked = picked.concat(shuffle(fresh).slice(0, 50-picked.length));
  if (picked.length < 50) picked = picked.concat(shuffle(correct).slice(0, 50-picked.length));
  return picked.slice(0,50);
}

function startTest(type) {
  const qs = type==="daily" ? pickDaily20() : pickWeekly50();
  activeTest = {
    type,
    index: 0,
    score: 0,
    qs,
    timer: null,
    msgId: null,
    startedAt: nowIST()
  };
}

function sendQuestion() {
  if (!activeTest) return;
  if (activeTest.index >= activeTest.qs.length) {
    const d = today();
    DB.testLog[d] = { correct: activeTest.score, total: activeTest.qs.length };
    saveData();

    let res =
      activeTest.score>=16 ? "EXCELLENT 🟢" :
      activeTest.score>=14 ? "GOOD 🟡" :
      activeTest.score>=12 ? "PASS 🟠" : "FAIL 🔴";

    bot.sendMessage(GROUP_ID,
`📊 Test Result

📝 Total: ${activeTest.qs.length}
✅ Correct: ${activeTest.score}
❌ Wrong: ${activeTest.qs.length-activeTest.score}
🎯 Accuracy: ${Math.round(activeTest.score/activeTest.qs.length*100)}%

🏆 Result: ${res}`);
    activeTest = null;
    return;
  }

  const q = activeTest.qs[activeTest.index];
  let remaining = 5;

  bot.sendMessage(GROUP_ID,
`Q${activeTest.index+1}. ${q.q}

⏳ Time Remaining: 05:00`, {
    reply_markup: {
      inline_keyboard: [
        [{text:"A",callback_data:"A"},{text:"B",callback_data:"B"}],
        [{text:"C",callback_data:"C"},{text:"D",callback_data:"D"}]
      ]
    }
  }).then(m => {
    activeTest.msgId = m.message_id;

    activeTest.timer = setInterval(()=>{
      remaining--;
      if (remaining<=0) {
        clearInterval(activeTest.timer);
        DB.wrongSet[q.id]=true; saveData();
        bot.editMessageText(
`⏰ Time’s Up Arzoo!

❌ Question not answered
✔️ Correct answer: ${q.ans}

💡 Advice:
Speed improve karo. Timed practice jaruri che 💪`,
          { chat_id: GROUP_ID, message_id: activeTest.msgId }
        );
        activeTest.index++;
        setTimeout(sendQuestion,2000);
      } else {
        bot.editMessageText(
`Q${activeTest.index+1}. ${q.q}

⏳ Time Remaining: 0${remaining}:00`,
          { chat_id: GROUP_ID, message_id: activeTest.msgId }
        );
      }
    },60000);
  });
}

bot.onText(/\/dt/, msg => {
  if (msg.chat.id!==GROUP_ID) return;
  startTest("daily");
  bot.sendMessage(GROUP_ID,"📝 Daily Test Started");
  sendQuestion();
});

bot.onText(/\/dts/, msg => {
  if (msg.chat.id!==GROUP_ID) return;
  startTest("weekly");
  bot.sendMessage(GROUP_ID,"📝 Weekend Test Started");
  sendQuestion();
});

bot.on("callback_query", q => {
  if (!activeTest) return;
  clearInterval(activeTest.timer);

  const cur = activeTest.qs[activeTest.index];
  if (q.data===cur.ans) {
    activeTest.score++;
    DB.correctSet[cur.id]=true;
    bot.editMessageText(
`✅ Correct 🎉
✔️ Correct answer: ${cur.ans}

💡 Explanation:
${cur.exp || "Concept revise karo – exam favourite area che."}`,
      { chat_id: GROUP_ID, message_id: activeTest.msgId }
    );
  } else {
    DB.wrongSet[cur.id]=true;
    bot.editMessageText(
`❌ Wrong 😕
✔️ Correct answer: ${cur.ans}

💡 Explanation:
${cur.exp || "Key difference samjho – exam ma puchay che."}`,
      { chat_id: GROUP_ID, message_id: activeTest.msgId }
    );
  }
  saveData();
  activeTest.index++;
  setTimeout(sendQuestion,2000);
});

/* ================= REPORT ================= */
bot.onText(/\/report/, msg => {
  if (msg.chat.id!==GROUP_ID) return;

  let out =
`📊 Study Report – Arzoo

📆 Exam Date: 18-Feb-2026
⏳ Days Remaining: ${daysToExam()}

`;
  Object.keys(DB.readingLog).sort().reverse().forEach(d=>{
    const r = fmtHM(DB.readingLog[d]);
    const t = DB.testLog[d];
    out += `📅 ${d}\n📖 Reading: ${r}\n`;
    if (t) out += `📝 Test: ${t.correct}/${t.total}\n`;
    out += `💡 Tip:\nConsistency rakho. Weak topics revise karo.\n\n`;
  });
  out += "🌟 Overall Advice:\nDaily revision + timed MCQs = score boost 💪📚";
  bot.sendMessage(GROUP_ID,out);
});

/* ================= DAILY AUTOMATION ================= */
setInterval(()=>{
  const n = nowIST();

  // 6:00 reset
  if (n.getHours()===6 && n.getMinutes()===0) readingSession=null;

  // 6:01 morning
  if (n.getHours()===6 && n.getMinutes()===1) {
    const y = new Date(n.getTime()-86400000).toISOString().split("T")[0];
    bot.sendMessage(GROUP_ID,
`🌅 Good Morning Arzoo 🌸

📅 Yesterday (${y})
📖 Reading: ${fmtHM(DB.readingLog[y]||0)}
🎯 Target: 08:00

💡 Tip:
Early start = calm mind 💪`);
  }

  // exam reminders + motivation
  const hrs=[8,12,17,22];
  if (hrs.includes(n.getHours()) && n.getMinutes()===0) {
    bot.sendMessage(GROUP_ID,
`⏳ Exam Reminder 📚
📅 Exam: 18-Feb-2026
⏳ Days Remaining: ${daysToExam()}

💡 Exam Motivation:
Every MCQ today reduces exam pressure. Stay focused 💪🦷`);
  }

  // 11:59 daily summary
  if (n.getHours()===23 && n.getMinutes()===59) {
    const d=today();
    bot.sendMessage(GROUP_ID,
`🌙 Good Night Arzoo 🌸

📖 Today’s Reading: ${fmtHM(DB.readingLog[d]||0)}
📝 Test: ${DB.testLog[d]?`${DB.testLog[d].correct}/${DB.testLog[d].total}`:"No test"}

💡 Advice:
Consistency > intensity.
Sleep well & recharge 😴📚`);
  }
},60000);
