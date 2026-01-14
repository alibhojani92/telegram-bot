/*****************************************************************
 GPSC DENTAL CLASS-2 BOT – v6.2 FINAL
 Inline keyboard + live timer + reports + history
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
app.get("/", (_, res) => res.send("GPSC Dental Bot v6.2 Running ✅"));
app.listen(PORT);

/* ================= HELPERS ================= */
function intro(msg){
  return msg.from.id === ADMIN_ID
    ? "🛠️ Admin Panel\n"
    : "🌺 Dr. Arzoo Fatema 🌺\n";
}

function nowIST(){
  return new Date(
    new Date().toLocaleString("en-US",{ timeZone: TIMEZONE })
  );
}
function today(){
  return nowIST().toISOString().slice(0,10);
}
function mm(min){
  const h=Math.floor(min/60), m=min%60;
  return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;
}

/* ================= DATABASE ================= */
const DB_FILE="./data.json";
let DB = fs.existsSync(DB_FILE)
 ? JSON.parse(fs.readFileSync(DB_FILE))
 : { readingLog:{}, readingSession:{}, mcqs:[], tests:[] };

const save=()=>fs.writeFileSync(DB_FILE,JSON.stringify(DB,null,2));

/* ================= READING ================= */
bot.onText(/\/read/,msg=>{
  const d=today(), u=msg.from.id;
  if(DB.readingSession[u]?.date===d){
    bot.sendMessage(msg.chat.id,intro(msg)+"📖 Reading already running");
    return;
  }
  DB.readingSession[u]={ start:Date.now(), date:d };
  save();
  bot.sendMessage(msg.chat.id,intro(msg)+"📚 Reading started\nStay focused 💪");
});

bot.onText(/\/stop/,msg=>{
  const u=msg.from.id, s=DB.readingSession[u];
  if(!s){
    bot.sendMessage(msg.chat.id,intro(msg)+"⚠️ No active reading");
    return;
  }
  const mins=Math.floor((Date.now()-s.start)/60000);
  DB.readingLog[s.date]=(DB.readingLog[s.date]||0)+mins;
  delete DB.readingSession[u];
  save();

  const total=DB.readingLog[s.date];
  bot.sendMessage(
    msg.chat.id,
    intro(msg)+
    `⏱️ Reading stopped\n\n📘 Today: ${mm(total)}\n🎯 Remaining: ${mm(Math.max(480-total,0))}`
  );
});

/* ================= DAILY REPORT ================= */
bot.onText(/\/report/,msg=>{
  const d=today();
  const mins=DB.readingLog[d]||0;
  const lastTest=DB.tests.filter(t=>t.date===d).slice(-1)[0];

  bot.sendMessage(
    msg.chat.id,
    intro(msg)+
`📊 Daily Report

📘 Study: ${mm(mins)} / 08:00
${lastTest ? `📝 Test: ${lastTest.correct}/${lastTest.total} (${lastTest.acc}%)` : "📝 Test: Not attempted"}

💡 GPSC Tip:
Revise weak MCQs tonight`
  );
});

/* ================= MONTHLY REPORT ================= */
bot.onText(/\/mr/,msg=>{
  const n=nowIST(), m=n.getMonth(), y=n.getFullYear();
  let total=0, days=0, best={d:"",m:0};

  for(const d in DB.readingLog){
    const dt=new Date(d);
    if(dt.getMonth()===m && dt.getFullYear()===y){
      days++; total+=DB.readingLog[d];
      if(DB.readingLog[d]>best.m) best={d, m:DB.readingLog[d]};
    }
  }

  bot.sendMessage(
    msg.chat.id,
    intro(msg)+
`📊 Monthly Report – ${n.toLocaleString("en",{month:"long"})}

📘 Days studied: ${days}
📘 Total: ${mm(total)}
📘 Avg/day: ${mm(days?Math.floor(total/days):0)}
🏆 Best day: ${best.d||"N/A"} (${mm(best.m)})

💡 Advice:
Consistency + MCQs = GPSC success`
  );
});

/* ================= MCQ ADD (ADMIN) ================= */
let ADD=false;

bot.onText(/\/addmcq$/,msg=>{
  if(msg.from.id!==ADMIN_ID) return;
  ADD=true;
  bot.sendMessage(
    msg.chat.id,
`🛠️ Admin Panel
Reply with MCQs

Q. Question
A) ..
B) ..
C) ..
D) ..
Ans: A
Exp: Explanation`
  );
});

bot.on("message",msg=>{
  if(!ADD||!msg.reply_to_message) return;
  ADD=false;

  const blocks=msg.text.split(/\n(?=Q\.)/i);
  let add=0,skip=0;

  blocks.forEach(b=>{
    const q=b.match(/Q\.\s*(.*)/i)?.[1];
    const A=b.match(/A\)(.*)/)?.[1];
    const B=b.match(/B\)(.*)/)?.[1];
    const C=b.match(/C\)(.*)/)?.[1];
    const D=b.match(/D\)(.*)/)?.[1];
    const ans=b.match(/Ans:\s*([ABCD])/i)?.[1];
    const exp=b.match(/Exp:\s*(.*)/i)?.[1]||"";
    if(q&&A&&B&&C&&D&&ans){
      DB.mcqs.push({q,A,B,C,D,ans,exp});
      add++;
    } else skip++;
  });
  save();
  bot.sendMessage(msg.chat.id,`🛠️ Admin Panel\nAdded: ${add}\nSkipped: ${skip}`);
});

/* ================= TEST ENGINE ================= */
let TEST=null;

function startTest(type,total){
  const pool=[...DB.mcqs].sort(()=>Math.random()-0.5).slice(0,total);
  TEST={ type,total, pool, i:0, correct:0, wrong:0, timer:null, tick:null };
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
      wrong:TEST.wrong,
      acc:Math.round(TEST.correct/TEST.total*100)
    });
    save();
    bot.sendMessage(
      GROUP_ID,
`🌺 Dr. Arzoo Fatema 🌺
📊 ${TEST.type} Test Finished

✅ ${TEST.correct} / ${TEST.total}
💡 Revise wrong MCQs`
    );
    TEST=null; return;
  }

  const q=TEST.pool[TEST.i];
  let time=5;

  bot.sendMessage(
    GROUP_ID,
`🌺 Dr. Arzoo Fatema 🌺
📝 ${TEST.type} Test – Q${TEST.i+1}

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
    }
  );

  TEST.tick=setInterval(()=>{
    time--;
    if(time>0)
      bot.sendMessage(GROUP_ID,`⏳ Time left: ${time} min`);
  },60000);

  TEST.timer=setTimeout(()=>{
    clearInterval(TEST.tick);
    TEST.wrong++;
    bot.sendMessage(GROUP_ID,`⏰ Time up!\nCorrect: ${q.ans}\n${q.exp}`);
    TEST.i++; ask();
  },300000);
}

bot.on("callback_query",q=>{
  if(!TEST) return;
  clearTimeout(TEST.timer);
  clearInterval(TEST.tick);
  const cur=TEST.pool[TEST.i];
  if(q.data===cur.ans){
    TEST.correct++;
    bot.sendMessage(GROUP_ID,"✅ Correct!");
  } else {
    TEST.wrong++;
    bot.sendMessage(GROUP_ID,`❌ Wrong\nCorrect: ${cur.ans}\n${cur.exp}`);
  }
  TEST.i++; setTimeout(ask,2000);
});

bot.onText(/\/dt$/,msg=>{
  if(msg.chat.id===GROUP_ID) startTest("Daily",20);
});
bot.onText(/\/wt$/,msg=>{
  if(msg.chat.id===GROUP_ID) startTest("Weekly",50);
});
bot.onText(/\/dtc|\/wtc/,msg=>{
  if(msg.from.id===ADMIN_ID){
    TEST=null;
    bot.sendMessage(GROUP_ID,"🛑 Test cancelled by admin");
  }
});

/* ================= AUTOMATION ================= */
setInterval(()=>{
  const n=nowIST();

  if(n.getHours()===0&&n.getMinutes()===0){
    DB.readingSession={}; save();
  }

  if(n.getHours()===18&&n.getMinutes()===0)
    bot.sendMessage(GROUP_ID,"🌺 Dr. Arzoo Fatema 🌺\nDaily Test at 11 PM\n⏳ 5 hrs left");

  if(n.getHours()===21&&n.getMinutes()===30)
    bot.sendMessage(GROUP_ID,"🌺 Dr. Arzoo Fatema 🌺\nDaily Test at 11 PM\n⌛ 1.5 hrs left");

  if(n.getDay()===5&&n.getHours()===21&&n.getMinutes()===0)
    bot.sendMessage(GROUP_ID,"🌺 Dr. Arzoo Fatema 🌺\nTomorrow 5 PM Weekly Test");

  if(n.getDay()===6&&n.getHours()===21&&n.getMinutes()===0)
    bot.sendMessage(GROUP_ID,"🌺 Dr. Arzoo Fatema 🌺\nTomorrow 5 PM Weekly Test");

  if(n.getDay()===0&&n.getHours()===21&&n.getMinutes()===0)
    bot.sendMessage(GROUP_ID,"🌺 Dr. Arzoo Fatema 🌺\n📊 Weekly report posted");

  if(n.getHours()===23&&n.getMinutes()===59){
    const mins=DB.readingLog[today()]||0;
    bot.sendMessage(GROUP_ID,`🌺 Dr. Arzoo Fatema 🌺\n🌙 Good Night\n📘 Today: ${mm(mins)}`);
  }
},60000);
