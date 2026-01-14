/*****************************************************************
 GPSC DENTAL PULSE BOT – v7.0 FINAL (PRODUCTION)
 Stable • Webhook • Render-ready • IST safe • No feature removed
*****************************************************************/

const fs = require("fs");
const express = require("express");
const TelegramBot = require("node-telegram-bot-api");

/* ================= BASIC SETUP ================= */
const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const TOKEN = process.env.BOT_TOKEN;
const APP_URL = "https://telegram-bot-i9v0.onrender.com";
const ADMIN_ID = 7539477188;
const GROUP_ID = -5154292869;
const TIMEZONE = "Asia/Kolkata";

/* ================= BOT ================= */
const bot = new TelegramBot(TOKEN);
bot.setWebHook(`${APP_URL}/bot${TOKEN}`);

app.post(`/bot${TOKEN}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});
app.get("/", (_, res) => res.send("Dental Pulse Bot v7.0 LIVE ✅"));
app.listen(PORT);

/* ================= HELPERS ================= */
function nowIST(){
  return new Date(new Date().toLocaleString("en-US",{timeZone:TIMEZONE}));
}
function today(){
  return nowIST().toISOString().slice(0,10);
}
function mm(min){
  const h=Math.floor(min/60), m=min%60;
  return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;
}
function isAdmin(id){ return id===ADMIN_ID; }

/* ================= DATABASE ================= */
const DB_FILE="./data.json";
let DB = fs.existsSync(DB_FILE)
 ? JSON.parse(fs.readFileSync(DB_FILE))
 : {
    readingLog:{},
    readingSession:{},
    mcqs:[],
    tests:[],
    askedHistory:{},   // date → [qids]
    saved:{}
   };

const save=()=>fs.writeFileSync(DB_FILE,JSON.stringify(DB,null,2));

/* ================= MOTIVATION ================= */
const MOTIVATION=[
 "Today read → Tomorrow rank 📚",
 "Consistency beats talent 💪",
 "One MCQ today = one mark tomorrow 🧠",
 "GPSC Dental – discipline decides rank 🦷",
 "Revise weak subjects, not comfort ones 🔥"
];

/* ================= READING ================= */
bot.onText(/\/read/i,msg=>{
  if(isAdmin(msg.from.id)){
    bot.sendMessage(msg.chat.id,"ℹ️ Admin read not counted (test mode)");
    return;
  }
  const d=today(), u=msg.from.id;
  if(DB.readingSession[u]?.date===d){
    bot.sendMessage(msg.chat.id,"📖 Reading already running");
    return;
  }
  DB.readingSession[u]={start:Date.now(),date:d};
  save();

  bot.sendMessage(msg.from.id,
`📚 Reading Started
🎯 Target: 08:00
🔥 Stay focused!`);

  bot.sendMessage(ADMIN_ID,
`👤 Student started reading
ID: ${u}`);
});

bot.onText(/\/stop/i,msg=>{
  if(isAdmin(msg.from.id)){
    bot.sendMessage(msg.chat.id,"ℹ️ Admin read stop ignored");
    return;
  }
  const u=msg.from.id,s=DB.readingSession[u];
  if(!s){
    bot.sendMessage(msg.chat.id,"⚠️ No active reading");
    return;
  }
  const mins=Math.floor((Date.now()-s.start)/60000);
  DB.readingLog[s.date]=(DB.readingLog[s.date]||0)+mins;
  delete DB.readingSession[u];
  save();

  const total=DB.readingLog[s.date];
  bot.sendMessage(msg.from.id,
`⏱️ Reading Stopped
📘 Today: ${mm(total)}
🎯 Remaining: ${mm(Math.max(480-total,0))}`);

  bot.sendMessage(ADMIN_ID,
`👤 Student stopped reading
⏱️ Today: ${mm(total)}`);
});

/* ================= MCQ ADD (ADMIN) ================= */
let ADD=false;

bot.onText(/\/addmcq/i,msg=>{
  if(!isAdmin(msg.from.id)) return;
  ADD=true;
  bot.sendMessage(msg.chat.id,
`🛠 Admin Panel – MCQ ADD

Format:
SUBJECT: Physiology

Q. Question?
A) ..
B) ..
C) ..
D) ..
Ans: A
Exp: Explanation`);
});

bot.on("message",msg=>{
  if(!ADD||!msg.reply_to_message) return;
  ADD=false;

  let subject="General";
  const sm=msg.text.match(/^SUBJECT:\s*(.*)$/im);
  if(sm) subject=sm[1].trim();

  const blocks=msg.text
    .replace(/^SUBJECT:.*$/im,"")
    .trim()
    .split(/\n(?=Q\.|\nQ\s)/i);

  let add=0,skip=0;

  blocks.forEach(b=>{
    const q=b.match(/Q\.?\s*(.*)/i)?.[1];
    const A=b.match(/A\)\s*(.*)/i)?.[1];
    const B=b.match(/B\)\s*(.*)/i)?.[1];
    const C=b.match(/C\)\s*(.*)/i)?.[1];
    const D=b.match(/D\)\s*(.*)/i)?.[1];
    const ans=b.match(/Ans:\s*([ABCD])/i)?.[1];
    const exp=b.match(/Exp:\s*(.*)/i)?.[1]||"";

    if(q&&A&&B&&C&&D&&ans){
      DB.mcqs.push({
        id:Date.now()+Math.random(),
        q,A,B,C,D,ans,exp,
        subject
      });
      add++;
    } else skip++;
  });

  save();
  bot.sendMessage(msg.chat.id,
`🛠 Admin Panel
Added: ${add}
Skipped: ${skip}`);
});

/* ================= MCQ COUNT ================= */
bot.onText(/\/mcqcount/i,msg=>{
  if(!isAdmin(msg.from.id)) return;

  const map={};
  DB.mcqs.forEach(q=>{
    map[q.subject]=(map[q.subject]||0)+1;
  });

  let t=`📚 MCQ DATABASE\nTotal: ${DB.mcqs.length}\n\n`;
  for(const s in map) t+=`• ${s}: ${map[s]}\n`;
  bot.sendMessage(msg.chat.id,t);
});

/* ================= TEST ENGINE ================= */
let TEST=null;

function selectRandom(total,subject){
  const used=new Set(DB.askedHistory[today()]||[]);
  let pool=DB.mcqs.filter(q=>!used.has(q.id));
  if(subject){
    pool=pool.filter(q=>q.subject.toLowerCase()===subject.toLowerCase());
    if(!pool.length) return null;
  }
  pool.sort(()=>Math.random()-0.5);
  return pool.slice(0,total);
}

function startTest(type,total,subject){
  const pool=selectRandom(total,subject);
  if(!pool){
    bot.sendMessage(GROUP_ID,
"❌ Subject not found.\nUse correct spelling or /dt");
    return;
  }
  TEST={type,total,pool,i:0,correct:0,wrong:0,subject};
  ask();
}

function ask(){
  if(!TEST) return;

  if(TEST.i>=TEST.total){
    DB.tests.push({
      date:today(),
      type:TEST.type,
      total:TEST.total,
      correct:TEST.correct,
      wrong:TEST.wrong
    });
    save();

    const quote=MOTIVATION[Math.floor(Math.random()*MOTIVATION.length)];

    bot.sendMessage(GROUP_ID,
`🌺 Dr. Arzoo Fatema 🌺
📊 ${TEST.type} Test Finished

Score: ${TEST.correct}/${TEST.total}
💡 ${quote}`);

    TEST=null; return;
  }

  const q=TEST.pool[TEST.i];
  DB.askedHistory[today()]=DB.askedHistory[today()]||[];
  DB.askedHistory[today()].push(q.id);
  save();

  let time=5;

  bot.sendMessage(GROUP_ID,
`📝 ${TEST.type} Test – Q${TEST.i+1}
📚 Subject: ${q.subject}

${q.q}

A) ${q.A}
B) ${q.B}
C) ${q.C}
D) ${q.D}

⏱️ Time: 5 min`,
{
 reply_markup:{
  inline_keyboard:[
   [{text:"A",callback_data:"A"},{text:"B",callback_data:"B"}],
   [{text:"C",callback_data:"C"},{text:"D",callback_data:"D"}]
  ]
 }
});

  TEST.tick=setInterval(()=>{
    time--;
    if(time<=2 && time>0)
      bot.sendMessage(GROUP_ID,`⏳ ${time} min left`);
  },60000);

  TEST.timer=setTimeout(()=>{
    clearInterval(TEST.tick);
    TEST.wrong++;
    bot.sendMessage(GROUP_ID,
`⏰ Time up
✔️ Correct: ${q.ans}
💡 ${q.exp}`);
    TEST.i++; ask();
  },300000);
}

bot.on("callback_query",q=>{
  if(!TEST) return;
  clearTimeout(TEST.timer);
  clearInterval(TEST.tick);

  const cur=TEST.pool[TEST.i];
  let text=`📚 ${cur.subject}\n`;

  if(q.data===cur.ans){
    TEST.correct++;
    text+="✅ Correct\n";
  } else {
    TEST.wrong++;
    text+=`❌ Wrong\n✔️ Correct: ${cur.ans}\n`;
  }
  text+=`\n💡 Explanation:\n${cur.exp}`;

  bot.sendMessage(GROUP_ID,text);
  TEST.i++;
  setTimeout(ask,2000);
});

/* ================= COMMANDS ================= */
bot.onText(/\/dt(?:\s+(.*))?/i,(msg,m)=>{
  if(msg.chat.id!==GROUP_ID) return;
  startTest("Daily",20,m[1]);
});
bot.onText(/\/wt(?:\s+(.*))?/i,(msg,m)=>{
  if(msg.chat.id!==GROUP_ID) return;
  startTest("Weekly",50,m[1]);
});
bot.onText(/\/dtc|\/wtc/i,msg=>{
  if(isAdmin(msg.from.id)){
    TEST=null;
    bot.sendMessage(GROUP_ID,"🛑 Test cancelled by admin");
  }
});

/* ================= AUTOMATION ================= */
setInterval(()=>{
  const n=nowIST();
  const h=n.getHours(),m=n.getMinutes();

  if(h>=6&&h<=22&&m===0){
    bot.sendMessage(GROUP_ID,
`📖 Reading Motivation
${MOTIVATION[Math.floor(Math.random()*MOTIVATION.length)]}`);
  }

  if(h===23&&m===59){
    const mins=DB.readingLog[today()]||0;
    bot.sendMessage(GROUP_ID,
`🌙 Good Night
📘 Today: ${mm(mins)}`);
  }
},60000);
