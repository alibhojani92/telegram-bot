/*****************************************************************
 GPSC DENTAL CLASS-2 BOT – v6.3 FINAL
 Reading + MCQs + Tests + Inline Keyboard + Semi-AI Analysis
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
app.get("/", (_, res) => res.send("GPSC Dental Bot v6.3 Running ✅"));
app.listen(PORT);

/* ================= HELPERS ================= */
function intro(msg){
  return msg.from.id === ADMIN_ID
    ? "🛠️ Admin Panel\n"
    : "🌺 Dr. Arzoo Fatema 🌺\n";
}

function nowIST(){
  return new Date(new Date().toLocaleString("en-US",{timeZone:TIMEZONE}));
}
function today(){ return nowIST().toISOString().slice(0,10); }
function mm(min){
  const h=Math.floor(min/60), m=min%60;
  return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;
}

/* ================= DATABASE ================= */
const DB_FILE="./data.json";
let DB = fs.existsSync(DB_FILE)
 ? JSON.parse(fs.readFileSync(DB_FILE))
 : { readingLog:{}, readingSession:{}, mcqs:[], tests:[], subjectStats:{} };

const save=()=>fs.writeFileSync(DB_FILE,JSON.stringify(DB,null,2));

/* ================= READING ================= */
bot.onText(/^\/read$/i,msg=>{
  const d=today(), u=msg.from.id;
  if(DB.readingSession[u]?.date===d){
    bot.sendMessage(msg.chat.id,intro(msg)+"📖 Reading already running");
    return;
  }
  DB.readingSession[u]={start:Date.now(),date:d};
  save();
  bot.sendMessage(msg.chat.id,intro(msg)+"📚 Reading started\nStay focused 💪");
});

bot.onText(/^\/stop$/i,msg=>{
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

/* ================= REPORT ================= */
bot.onText(/^\/report$/i,msg=>{
  const d=today();
  const mins=DB.readingLog[d]||0;
  const last=DB.tests.filter(t=>t.date===d).slice(-1)[0];

  let advice="Maintain consistency for GPSC Dental success.";
  if(last && last.acc<60) advice="Revise weak subjects & wrong MCQs today.";

  bot.sendMessage(
    msg.chat.id,
    intro(msg)+
`📊 Daily Report

📘 Study: ${mm(mins)} / 08:00
${last?`📝 Test: ${last.correct}/${last.total} (${last.acc}%)`:"📝 Test: Not attempted"}

💡 Advice:
${advice}`
  );
});

/* ================= MCQ ADD (ADMIN) ================= */
let ADD=false;

bot.onText(/^\/addmcq$/i,msg=>{
  if(msg.from.id!==ADMIN_ID) return;
  ADD=true;
  bot.sendMessage(
    msg.chat.id,
`🛠 Admin Panel
Reply with MCQs

SUBJECT: Oral Anatomy

Q.1 Question?
A) A
B) B
C) C
D) D
Ans: A
Exp: Explanation`
  );
});

bot.on("message",msg=>{
  if(!ADD || !msg.reply_to_message) return;
  ADD=false;

  let subject="General";
  const sm=msg.text.match(/^SUBJECT:\s*(.*)$/im);
  if(sm) subject=sm[1].trim();

  const blocks=msg.text
    .replace(/^SUBJECT:.*$/im,"")
    .trim()
    .split(/\n(?=Q\.)/i);

  let add=0;
  blocks.forEach(b=>{
    const q=b.match(/Q\.\s*(.*)/i)?.[1];
    const A=b.match(/A\)\s*(.*)/i)?.[1];
    const B=b.match(/B\)\s*(.*)/i)?.[1];
    const C=b.match(/C\)\s*(.*)/i)?.[1];
    const D=b.match(/D\)\s*(.*)/i)?.[1];
    const ans=b.match(/Ans:\s*([ABCD])/i)?.[1];
    const exp=b.match(/Exp:\s*(.*)/i)?.[1]||"";

    if(q&&A&&B&&C&&D&&ans){
      DB.mcqs.push({q,A,B,C,D,ans,exp,subject});
      add++;
    }
  });
  save();
  bot.sendMessage(msg.chat.id,`🛠 Admin Panel\nAdded: ${add}`);
});

/* ================= TEST ENGINE ================= */
let TEST=null;

function startTest(type,total){
  const pool=[...DB.mcqs].sort(()=>Math.random()-0.5).slice(0,total);
  TEST={type,total,pool,i:0,correct:0,wrong:0,stats:{}};
  ask();
}

function ask(){
  if(!TEST) return;
  if(TEST.i>=TEST.total){
    const acc=Math.round(TEST.correct/TEST.total*100);

    DB.tests.push({
      date:today(),
      type:TEST.type,
      total:TEST.total,
      correct:TEST.correct,
      wrong:TEST.wrong,
      acc
    });

    let summary="📚 Subject-wise Accuracy:\n";
    for(const s in TEST.stats){
      const a=Math.round(TEST.stats[s].c/(TEST.stats[s].t)*100);
      summary+=`• ${s}: ${a}%\n`;
    }

    let advice=acc>=75
      ? "Excellent performance! Maintain revision."
      : acc>=50
      ? "Good effort. Focus on weak subjects."
      : "Low accuracy. Revise Dental Pulse concepts.";

    bot.sendMessage(
      GROUP_ID,
`🌺 Dr. Arzoo Fatema 🌺
📊 ${TEST.type} Test Summary

📝 Score: ${TEST.correct}/${TEST.total}
🎯 Accuracy: ${acc}%

${summary}
💡 Advice:
${advice}`
    );
    TEST=null; save(); return;
  }

  const q=TEST.pool[TEST.i];
  let time=5;

  bot.sendMessage(
    GROUP_ID,
`🌺 Dr. Arzoo Fatema 🌺
📝 ${TEST.type} Test – Q${TEST.i+1}
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
    }
  );

  TEST.timer=setTimeout(()=>{
    TEST.wrong++;
    bot.sendMessage(
      GROUP_ID,
`⏰ Time up!
✔️ Correct: ${q.ans}

💡 ${q.exp}`
    );
    TEST.i++; ask();
  },300000);
}

bot.on("callback_query",q=>{
  if(!TEST) return;
  const cur=TEST.pool[TEST.i];

  TEST.stats[cur.subject]=TEST.stats[cur.subject]||{c:0,t:0};
  TEST.stats[cur.subject].t++;

  let text=`🌺 Dr. Arzoo Fatema 🌺\n\n📚 Subject: ${cur.subject}\n`;

  if(q.data===cur.ans){
    TEST.correct++;
    TEST.stats[cur.subject].c++;
    text+="✅ Correct Answer\n";
  } else {
    TEST.wrong++;
    text+=`❌ Wrong Answer\n✔️ Correct: ${cur.ans}\n`;
  }

  text+=`\n💡 Explanation:\n${cur.exp}`;
  bot.sendMessage(GROUP_ID,text);

  TEST.i++;
  setTimeout(ask,2000);
});

/* ================= COMMANDS ================= */
bot.onText(/^\/dt$/i,msg=>msg.chat.id===GROUP_ID&&startTest("Daily",20));
bot.onText(/^\/wt$/i,msg=>msg.chat.id===GROUP_ID&&startTest("Weekly",50));
bot.onText(/^\/dtc$|^\/wtc$/i,msg=>{
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
},60000);
