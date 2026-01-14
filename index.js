/*****************************************************************
 GPSC DENTAL CLASS-2 BOT – v6.3 FINAL STABLE
 Author: Stable Build
*****************************************************************/

const fs = require("fs");
const express = require("express");
const TelegramBot = require("node-telegram-bot-api");

/* ================= ENV ================= */
const TOKEN = process.env.BOT_TOKEN;
const GROUP_ID = Number(process.env.GROUP_ID);
const ADMIN_ID = Number(process.env.ADMIN_ID);
const PORT = process.env.PORT || 3000;

/* ================= SERVER ================= */
const app = express();
app.use(express.json());
app.get("/", (_, res) => res.send("GPSC Dental Bot v6.3 Running"));
app.listen(PORT);

/* ================= BOT ================= */
const bot = new TelegramBot(TOKEN, { polling: true });

/* ================= DATABASE ================= */
const DB_FILE = "./data.json";
let DB = fs.existsSync(DB_FILE)
  ? JSON.parse(fs.readFileSync(DB_FILE))
  : { readingLog:{}, readingSession:{}, mcqs:[], tests:[] };

const save = () =>
  fs.writeFileSync(DB_FILE, JSON.stringify(DB, null, 2));

/* ================= HELPERS ================= */
const today = () => new Date().toISOString().slice(0,10);

const intro = (msg) =>
  msg.from.id === ADMIN_ID
    ? "🛠 Admin Panel\n"
    : "🌺 Dr. Arzoo Fatema 🌺\n";

/* ================= READ / STOP ================= */
bot.onText(/\/read/i, msg => {
  const u = msg.from.id;
  const d = today();

  if (DB.readingSession[u]?.date === d) {
    bot.sendMessage(msg.chat.id, intro(msg)+"📖 Reading already running");
    return;
  }

  DB.readingSession[u] = { start: Date.now(), date: d };
  save();
  bot.sendMessage(msg.chat.id, intro(msg)+"📚 Reading started");
});

bot.onText(/\/stop/i, msg => {
  const u = msg.from.id;
  const s = DB.readingSession[u];
  if (!s) {
    bot.sendMessage(msg.chat.id, intro(msg)+"⚠️ No active reading");
    return;
  }

  const mins = Math.floor((Date.now()-s.start)/60000);
  DB.readingLog[s.date] = (DB.readingLog[s.date]||0)+mins;
  delete DB.readingSession[u];
  save();

  bot.sendMessage(
    msg.chat.id,
    intro(msg)+`⏱ Reading stopped\nToday: ${DB.readingLog[s.date]} min`
  );
});

/* ================= MCQ ADD ================= */
let ADD_MODE = false;

bot.onText(/\/addmcq/i, msg => {
  if (msg.from.id !== ADMIN_ID) return;
  ADD_MODE = true;
  bot.sendMessage(msg.chat.id,
`🛠 Admin Panel
Reply with MCQs

SUBJECT: Oral Anatomy

Q. Question?
A) A
B) B
C) C
D) D
Ans: A
Exp: Explanation`);
});

bot.on("message", msg => {
  if (!ADD_MODE || !msg.reply_to_message) return;
  ADD_MODE = false;

  let subject = "General";
  const sm = msg.text.match(/SUBJECT:\s*(.*)/i);
  if (sm) subject = sm[1].trim();

  const blocks = msg.text
    .replace(/SUBJECT:.*\n?/i,"")
    .trim()
    .split(/\n(?=Q)/i);

  let add=0, skip=0;

  blocks.forEach(b=>{
    const q=b.match(/Q\.?\s*(.*)/i)?.[1];
    const A=b.match(/A\)\s*(.*)/i)?.[1];
    const B=b.match(/B\)\s*(.*)/i)?.[1];
    const C=b.match(/C\)\s*(.*)/i)?.[1];
    const D=b.match(/D\)\s*(.*)/i)?.[1];
    const ans=b.match(/Ans:\s*([ABCD])/i)?.[1];
    const exp=b.match(/Exp:\s*(.*)/i)?.[1]||"";

    if(q&&A&&B&&C&&D&&ans){
      DB.mcqs.push({q,A,B,C,D,ans,exp,subject});
      add++;
    } else skip++;
  });

  save();
  bot.sendMessage(msg.chat.id,`🛠 Admin Panel\nAdded: ${add}\nSkipped: ${skip}`);
});

/* ================= MCQ COUNT ================= */
bot.onText(/\/mcqcount/i, msg => {
  if (msg.from.id !== ADMIN_ID) return;

  const total = DB.mcqs.length;
  const map = {};
  DB.mcqs.forEach(q=>{
    map[q.subject]=(map[q.subject]||0)+1;
  });

  let text=`🛠 Admin Panel\nTotal MCQs: ${total}\n\n`;
  for(const s in map) text+=`• ${s}: ${map[s]}\n`;
  bot.sendMessage(msg.chat.id,text);
});

/* ================= TEST ENGINE ================= */
let TEST=null;

function startTest(type,total){
  const pool=[...DB.mcqs].sort(()=>Math.random()-0.5).slice(0,total);
  TEST={type,total,pool,i:0,correct:0,wrong:0};
  ask();
}

function ask(){
  if(!TEST) return;
  if(TEST.i>=TEST.total){
    const acc=Math.round(TEST.correct/TEST.total*100);
    DB.tests.push({date:today(),type:TEST.type,total:TEST.total,correct:TEST.correct,acc});
    save();

    bot.sendMessage(GROUP_ID,
`🌺 Dr. Arzoo Fatema 🌺
${TEST.type} Test Finished

Score: ${TEST.correct}/${TEST.total} (${acc}%)

💡 Tip:
Weak subjects revise karo 💪`);
    TEST=null; return;
  }

  const q=TEST.pool[TEST.i];
  bot.sendMessage(GROUP_ID,
`${q.q}

A) ${q.A}
B) ${q.B}
C) ${q.C}
D) ${q.D}`,
{
reply_markup:{inline_keyboard:[
[{text:"A",callback_data:"A"},{text:"B",callback_data:"B"}],
[{text:"C",callback_data:"C"},{text:"D",callback_data:"D"}]
]}
});
}

bot.on("callback_query", q=>{
  if(!TEST) return;
  bot.answerCallbackQuery(q.id);

  const cur=TEST.pool[TEST.i];
  let msg=`📚 Subject: ${cur.subject}\n`;

  if(q.data===cur.ans){
    TEST.correct++;
    msg+="✅ Correct\n";
  } else {
    TEST.wrong++;
    msg+=`❌ Wrong\n✔ Correct: ${cur.ans}\n`;
  }

  msg+=`\n💡 Explanation:\n${cur.exp}`;
  bot.sendMessage(GROUP_ID,msg);

  TEST.i++;
  setTimeout(ask,1500);
});

/* ================= TEST COMMANDS ================= */
bot.onText(/\/dt/i,msg=>{
  if(msg.chat.id===GROUP_ID) startTest("Daily",20);
});
bot.onText(/\/wt/i,msg=>{
  if(msg.chat.id===GROUP_ID) startTest("Weekly",50);
});
bot.onText(/\/dtc|\/wtc/i,msg=>{
  if(msg.from.id===ADMIN_ID){
    TEST=null;
    bot.sendMessage(GROUP_ID,"🛑 Test cancelled");
  }
});
