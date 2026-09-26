const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const root = __dirname;
const dataDir = path.join(root, "data");
const uploadDir = path.join(root, "uploads");
const backupDir = path.join(root, "backups");
const dbPath = path.join(dataDir, "fantasia-db.json");
const port = Number(process.env.PORT || 5180);
const loginAttempts = new Map();
const maxAttachmentBytes = 10 * 1024 * 1024;
const allowedAttachmentMimeTypes = new Set([
  "image/png","image/jpeg","image/gif","image/webp",
  "video/mp4","video/webm","video/quicktime",
  "application/pdf","application/zip","text/plain","application/json",
  "audio/webm","audio/mpeg","audio/mp4","audio/ogg"
]);

for (const dir of [dataDir, uploadDir, backupDir]) fs.mkdirSync(dir, { recursive: true });

const mime = {
  ".html":"text/html; charset=utf-8",".css":"text/css; charset=utf-8",
  ".js":"text/javascript; charset=utf-8",".json":"application/json; charset=utf-8",
  ".png":"image/png",".jpg":"image/jpeg",".jpeg":"image/jpeg",
  ".gif":"image/gif",".webp":"image/webp",".mp4":"video/mp4",
  ".webm":"video/webm",".mp3":"audio/mpeg",".ogg":"audio/ogg",
  ".pdf":"application/pdf",".zip":"application/zip",".svg":"image/svg+xml"
};

function now() { return new Date().toISOString(); }
function getClientIp(req) {
  const f = req.headers["x-forwarded-for"];
  if (typeof f === "string") return f.split(",")[0].trim();
  return req.socket?.remoteAddress || "unknown";
}
function applySecurityHeaders(res) {
  res.setHeader("X-Content-Type-Options","nosniff");
  res.setHeader("X-Frame-Options","DENY");
  res.setHeader("Referrer-Policy","no-referrer");
  res.setHeader("Permissions-Policy","camera=(), microphone=(), geolocation=(), interest-cohort=()");
}
function sanitizeText(value, maxLength = 8000) {
  return String(value ?? "").replace(/[\u0000-\u001f]/g,"").replace(/<[^>]*>/g,"").slice(0,maxLength).trim();
}
function id(prefix) { return `${prefix}_${crypto.randomUUID()}`; }
function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.pbkdf2Sync(password, salt, 120000, 32, "sha256").toString("hex");
  return `${salt}:${hash}`;
}
function verifyPassword(password, stored) {
  if (!stored || typeof stored !== "string") return false;
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  return crypto.timingSafeEqual(Buffer.from(hash,"hex"), Buffer.from(hashPassword(password,salt).split(":")[1],"hex"));
}

function defaultDb() {
  const mePassword = process.env.FANTASIA_ME_PASSWORD || "change-me-now";
  const partnerPassword = process.env.FANTASIA_PARTNER_PASSWORD || "change-partner-now";
  return {
    users: [
      { id:"u_me", username: process.env.FANTASIA_ME_USERNAME||"me", displayName: process.env.FANTASIA_ME_NAME||"Me",
        avatar:"/assets/ChatGPT Image May 14, 2026, 10_57_41 AM.png", passwordHash:hashPassword(mePassword),
        bio:"", birthday:"", favoriteColor:"", favoriteSong:"", favoriteFood:"", quote:"", loveLanguage:"", status:"", createdAt:now() },
      { id:"u_partner", username: process.env.FANTASIA_PARTNER_USERNAME||"partner", displayName: process.env.FANTASIA_PARTNER_NAME||"Partner",
        avatar:"/assets/png (3)", passwordHash:hashPassword(partnerPassword),
        bio:"", birthday:"", favoriteColor:"", favoriteSong:"", favoriteFood:"", quote:"", loveLanguage:"", status:"", createdAt:now() }
    ],
    sessions:[],
    messages:[],
    stories:[],
    presence:{},
    relationship:{ startDate: null, milestones:[] },
    memories:[],
    journal:[],
    bucketList:[],
    songs:[],
    openWhen:[],
    moodEntries:[],
    loveNotes:[],
    dateIdeas:[],
    compliments:[],
    games:{ sessions:[], stats:{} },
    locations:[],
    dailyQuestions:[],
    notifications:[],
    settings:{
      appLockSetting:false, screenshotAlerts:true, hideMedia:false, incognitoTyping:false,
      theme:"light", notificationsEnabled:true, loveNotifications:true,
      keyFingerprint:`FA-${crypto.randomBytes(8).toString("hex").toUpperCase().match(/../g).join(" ")}`
    },
    audit:[]
  };
}

function normalizeUser(user, fallback) {
  return {
    id: user?.id||fallback.id,
    username: String(user?.username||fallback.username).trim().slice(0,40)||fallback.username,
    displayName: String(user?.displayName||fallback.displayName).trim().slice(0,80)||fallback.displayName,
    avatar: String(user?.avatar||fallback.avatar||"").trim().slice(0,400)||fallback.avatar,
    passwordHash: user?.passwordHash||fallback.passwordHash,
    bio: String(user?.bio||"").slice(0,500),
    birthday: String(user?.birthday||"").slice(0,20),
    favoriteColor: String(user?.favoriteColor||"").slice(0,50),
    favoriteSong: String(user?.favoriteSong||"").slice(0,200),
    favoriteFood: String(user?.favoriteFood||"").slice(0,200),
    quote: String(user?.quote||"").slice(0,500),
    loveLanguage: String(user?.loveLanguage||"").slice(0,100),
    status: String(user?.status||"").slice(0,200),
    createdAt: user?.createdAt||now()
  };
}

function ensureDbShape(input) {
  const fallback = defaultDb();
  const raw = input && typeof input === "object" ? input : {};
  const users = Array.isArray(raw.users) ? raw.users : [];
  return {
    ...fallback, ...raw,
    users:[normalizeUser(users[0],fallback.users[0]), normalizeUser(users[1],fallback.users[1])],
    sessions: Array.isArray(raw.sessions) ? raw.sessions.filter(Boolean) : [],
    messages: Array.isArray(raw.messages) ? raw.messages : [],
    stories: Array.isArray(raw.stories) ? raw.stories : [],
    presence: raw.presence&&typeof raw.presence==="object" ? raw.presence : {},
    relationship: raw.relationship&&typeof raw.relationship==="object" ? { startDate: raw.relationship.startDate||null, milestones: Array.isArray(raw.relationship.milestones)?raw.relationship.milestones:[] } : fallback.relationship,
    memories: Array.isArray(raw.memories) ? raw.memories : [],
    journal: Array.isArray(raw.journal) ? raw.journal : [],
    bucketList: Array.isArray(raw.bucketList) ? raw.bucketList : [],
    songs: Array.isArray(raw.songs) ? raw.songs : [],
    openWhen: Array.isArray(raw.openWhen) ? raw.openWhen : [],
    moodEntries: Array.isArray(raw.moodEntries) ? raw.moodEntries : [],
    loveNotes: Array.isArray(raw.loveNotes) ? raw.loveNotes : [],
    dateIdeas: Array.isArray(raw.dateIdeas) ? raw.dateIdeas : [],
    compliments: Array.isArray(raw.compliments) ? raw.compliments : [],
    games: raw.games&&typeof raw.games==="object" ? { sessions:Array.isArray(raw.games.sessions)?raw.games.sessions:[], stats:raw.games.stats||{} } : fallback.games,
    locations: Array.isArray(raw.locations) ? raw.locations : [],
    dailyQuestions: Array.isArray(raw.dailyQuestions) ? raw.dailyQuestions : [],
    notifications: Array.isArray(raw.notifications) ? raw.notifications : [],
    settings: { ...fallback.settings, ...(raw.settings&&typeof raw.settings==="object"?raw.settings:{}) },
    audit: Array.isArray(raw.audit) ? raw.audit.slice(-1000) : []
  };
}

function pruneExpiredSessions() { db.sessions = db.sessions.filter(s => new Date(s.expiresAt).getTime() > Date.now()); }

function applyRateLimit(req, res) {
  const key = getClientIp(req);
  const n = Date.now();
  const entry = loginAttempts.get(key)||{ count:0, resetAt:n+60_000 };
  if (n > entry.resetAt) { entry.count=0; entry.resetAt=n+60_000; }
  entry.count += 1;
  loginAttempts.set(key, entry);
  if (entry.count > 12) { json(res,429,{error:"Too many requests. Please try again shortly."}); return true; }
  return false;
}

function loadDb() {
  if (!fs.existsSync(dbPath)) {
    const db = defaultDb();
    saveDb(db);
    console.log("Fantasia created two default accounts:");
    console.log(`  ${db.users[0].username} / ${process.env.FANTASIA_ME_PASSWORD||"change-me-now"}`);
    console.log(`  ${db.users[1].username} / ${process.env.FANTASIA_PARTNER_PASSWORD||"change-partner-now"}`);
    return db;
  }
  return ensureDbShape(JSON.parse(fs.readFileSync(dbPath,"utf8")));
}

function saveDb(db) { fs.writeFileSync(dbPath, JSON.stringify(ensureDbShape(db),null,2)); }

let db = loadDb();
const clients = new Map();

function publicUser(user) {
  return { id:user.id, username:user.username, displayName:user.displayName, avatar:user.avatar,
    bio:user.bio, birthday:user.birthday, favoriteColor:user.favoriteColor, favoriteSong:user.favoriteSong,
    favoriteFood:user.favoriteFood, quote:user.quote, loveLanguage:user.loveLanguage, status:user.status };
}

function stateFor(user) {
  const partner = db.users.find(u => u.id !== user.id);
  return {
    me: publicUser(user), partner: publicUser(partner),
    messages: db.messages,
    stories: db.stories.filter(s => !s.expiresAt || Date.now() < new Date(s.expiresAt).getTime()),
    presence: db.presence,
    relationship: db.relationship,
    memories: db.memories,
    journal: db.journal,
    bucketList: db.bucketList,
    songs: db.songs,
    openWhen: db.openWhen,
    moodEntries: db.moodEntries,
    loveNotes: db.loveNotes,
    dateIdeas: db.dateIdeas,
    compliments: db.compliments,
    games: db.games,
    locations: db.locations,
    dailyQuestions: db.dailyQuestions,
    notifications: db.notifications.filter(n => n.toUserId === user.id),
    settings: db.settings
  };
}

function json(res, status, data) {
  applySecurityHeaders(res);
  const body = JSON.stringify(data);
  res.writeHead(status,{"Content-Type":"application/json; charset=utf-8","Content-Length":Buffer.byteLength(body),"Cache-Control":"no-store"});
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve,reject) => {
    let size = 0; const chunks = [];
    req.on("data",chunk => {
      size += chunk.length;
      if (size > 25*1024*1024) { reject(new Error("Request too large.")); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on("end",() => { const raw = Buffer.concat(chunks).toString("utf8"); try { resolve(raw?JSON.parse(raw):{}); } catch { reject(new Error("Invalid JSON.")); } });
    req.on("error",reject);
  });
}

function bearer(req) {
  const auth = req.headers.authorization||"";
  if (auth.startsWith("Bearer ")) return auth.slice(7);
  const url = new URL(req.url,`http://${req.headers.host}`);
  return url.searchParams.get("token");
}

function userFromReq(req) {
  const token = bearer(req);
  if (!token) return null;
  const session = db.sessions.find(s => s.token===token && new Date(s.expiresAt).getTime()>Date.now());
  if (!session) return null;
  return db.users.find(u => u.id===session.userId)||null;
}

function requireUser(req,res) { const u = userFromReq(req); if (!u) json(res,401,{error:"Not signed in."}); return u; }

function sendEvent(res, event, payload) { res.write(`event: ${event}\n`); res.write(`data: ${JSON.stringify(payload)}\n\n`); }

function broadcast(event="state", payload=null) {
  for (const [userId,res] of clients) {
    const user = db.users.find(u => u.id===userId);
    if (!user) continue;
    sendEvent(res, event, payload||stateFor(user));
  }
}

function pushNotification(toUserId, fromUserId, type, data={}) {
  const notif = { id:id("notif"), toUserId, fromUserId, type, data, read:false, createdAt:now() };
  db.notifications.push(notif);
  db.notifications = db.notifications.slice(-200);
  const clientRes = clients.get(toUserId);
  if (clientRes) sendEvent(clientRes, "notification", notif);
}

function audit(userId, action, payload={}) {
  db.audit.push({ id:id("audit"), userId, action, payload, createdAt:now() });
  db.audit = db.audit.slice(-1000);
}

function saveAttachment(file) {
  if (!file?.data && !file?.name) return null;
  if (!file?.data) return null;
  const match = String(file.data).match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error("Invalid attachment.");
  const declaredType = String(file.type||match[1]||"application/octet-stream").toLowerCase();
  if (!allowedAttachmentMimeTypes.has(declaredType)) throw new Error(`Unsupported file type: ${declaredType}`);
  const bytes = Buffer.from(match[2],"base64");
  if (bytes.length > maxAttachmentBytes) throw new Error("Attachment exceeds 10MB.");
  const safeBase = String(file.name||"attachment").replace(/[\\/:*?"<>|]/g,"_").slice(0,120)||"attachment";
  const safeExt = path.extname(safeBase).replace(/[^a-zA-Z0-9.]/g,"")||".bin";
  const fileName = `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${safeExt}`;
  const disk = path.join(uploadDir,fileName);
  fs.writeFileSync(disk,bytes);
  return { id:id("file"), name:safeBase.slice(0,160), type:declaredType, size:fs.statSync(disk).size, url:`/uploads/${fileName}`, createdAt:now() };
}

function routeStatic(req,res) {
  applySecurityHeaders(res);
  const url = new URL(req.url,`http://${req.headers.host}`);
  let pathname = decodeURIComponent(url.pathname);
  if (pathname==="/") pathname="/index.html";
  const file = path.normalize(path.join(root,pathname));
  if (!file.startsWith(root)) { res.writeHead(403); res.end("Forbidden"); return; }
  fs.readFile(file,(err,data) => {
    if (err) { res.writeHead(404,{"Content-Type":"text/plain; charset=utf-8"}); res.end("Not found"); return; }
    res.writeHead(200,{"Content-Type":mime[path.extname(file).toLowerCase()]||"application/octet-stream","X-Content-Type-Options":"nosniff"});
    res.end(data);
  });
}

async function routeApi(req,res) {
  const url = new URL(req.url,`http://${req.headers.host}`);
  const method = req.method;

  try {
    pruneExpiredSessions();

    if (method==="GET" && url.pathname==="/health") return json(res,200,{ok:true,uptime:process.uptime(),messages:db.messages.length});

    if (method==="POST" && url.pathname==="/api/login") {
      if (applyRateLimit(req,res)) return;
      const body = await readBody(req);
      const username = String(body.username||"").trim().toLowerCase();
      const password = String(body.password||"");
      if (!username||!password) return json(res,400,{error:"Username and password are required."});
      const user = db.users.find(u => u.username.toLowerCase()===username);
      if (!user||!verifyPassword(password,user.passwordHash)) return json(res,401,{error:"Wrong username or password."});
      const token = crypto.randomBytes(32).toString("hex");
      db.sessions.push({token,userId:user.id,createdAt:now(),expiresAt:new Date(Date.now()+1000*60*60*24*30).toISOString()});
      db.presence[user.id]={status:"online",lastSeenAt:now()};
      audit(user.id,"login");
      saveDb(db);
      broadcast();
      return json(res,200,{token});
    }

    const user = requireUser(req,res);
    if (!user) return;

    if (method==="POST" && url.pathname==="/api/logout") {
      const token = bearer(req);
      db.sessions = db.sessions.filter(s => s.token!==token);
      db.presence[user.id]={status:"offline",lastSeenAt:now()};
      audit(user.id,"logout");
      saveDb(db); broadcast();
      return json(res,200,{ok:true});
    }

    if (method==="GET" && url.pathname==="/api/session") return json(res,200,stateFor(user));

    if (method==="GET" && url.pathname==="/api/events") {
      res.writeHead(200,{"Content-Type":"text/event-stream","Cache-Control":"no-cache, no-transform","Connection":"keep-alive"});
      clients.set(user.id,res);
      sendEvent(res,"state",stateFor(user));
      const heartbeat = setInterval(()=>res.write(":ping\n\n"),25000);
      req.on("close",()=>{ clients.delete(user.id); clearInterval(heartbeat); });
      return;
    }

    if (method==="POST" && url.pathname==="/api/presence") {
      db.presence[user.id]={status:"online",lastSeenAt:now()};
      saveDb(db); broadcast(); return json(res,200,{ok:true});
    }
    if (method==="POST" && url.pathname==="/api/presence/offline") {
      db.presence[user.id]={status:"offline",lastSeenAt:now()};
      saveDb(db); broadcast(); return json(res,200,{ok:true});
    }
    if (method==="POST" && url.pathname==="/api/typing") {
      for (const [uid,client] of clients) { if (uid!==user.id) sendEvent(client,"typing",{userId:user.id,at:now()}); }
      return json(res,200,{ok:true});
    }

    // ── MESSAGES ──
    if (method==="POST" && url.pathname==="/api/messages") {
      const body = await readBody(req);
      const attachments = (body.attachments||[]).map(saveAttachment).filter(Boolean);
      const createdAt = body.scheduledFor||now();
      const expiresAt = body.timer ? new Date(new Date(createdAt).getTime()+Number(body.timer)*1000).toISOString() : null;
      const poll = body.poll ? {
        question:sanitizeText(body.poll.question,240),
        options:(body.poll.options||[]).map(o=>sanitizeText(o,80)).filter(Boolean).slice(0,6),
        votes:{}
      } : null;
      if (poll) poll.options.forEach(o=>poll.votes[o]=[]);
      const message = {
        id:id("msg"), senderId:user.id, text:sanitizeText(body.text,8000),
        attachments, replyTo:body.replyTo||null, viewOnce:!!body.viewOnce,
        status:body.scheduledFor?"scheduled":"sent", createdAt, deliveredAt:now(),
        readBy:[user.id], hiddenFor:[], reactions:{}, pinned:false, starred:false,
        poll, expiresAt, editedAt:null
      };
      if (!message.text&&!attachments.length&&!poll) return json(res,400,{error:"Message is empty."});
      db.messages.push(message);
      audit(user.id,"message:create",{messageId:message.id});
      saveDb(db); broadcast();
      return json(res,201,message);
    }

    const msgMatch = url.pathname.match(/^\/api\/messages\/([^/]+)$/);
    if (msgMatch) {
      const msg = db.messages.find(m => m.id===msgMatch[1]);
      if (!msg) return json(res,404,{error:"Message not found."});
      if (method==="PATCH") {
        const body = await readBody(req);
        if (typeof body.text==="string") {
          if (msg.senderId!==user.id) return json(res,403,{error:"Only the sender can edit."});
          msg.text=sanitizeText(body.text,8000); msg.editedAt=now();
        }
        if (typeof body.pinned==="boolean") msg.pinned=body.pinned;
        if (typeof body.starred==="boolean") msg.starred=body.starred;
        if (!msg.readBy.includes(user.id)) msg.readBy.push(user.id);
        saveDb(db); broadcast(); return json(res,200,msg);
      }
      if (method==="DELETE") {
        const mode = url.searchParams.get("mode");
        if (mode==="everyone") { if (msg.senderId!==user.id) return json(res,403,{error:"Only the sender can delete for everyone."}); db.messages=db.messages.filter(m=>m.id!==msg.id); }
        else { msg.hiddenFor=[...new Set([...(msg.hiddenFor||[]),user.id])]; }
        saveDb(db); broadcast(); return json(res,200,{ok:true});
      }
      if (method==="POST" && url.pathname.endsWith("/read")) {
        if (!msg.readBy.includes(user.id)) msg.readBy.push(user.id);
        saveDb(db); broadcast(); return json(res,200,{ok:true});
      }
    }

    const reactMatch = url.pathname.match(/^\/api\/messages\/([^/]+)\/reactions$/);
    if (method==="POST" && reactMatch) {
      const body = await readBody(req);
      const msg = db.messages.find(m => m.id===reactMatch[1]);
      if (!msg) return json(res,404,{error:"Message not found."});
      const emoji = String(body.emoji||"❤️").slice(0,12);
      msg.reactions[emoji]=msg.reactions[emoji]||[];
      if (msg.reactions[emoji].includes(user.id)) msg.reactions[emoji]=msg.reactions[emoji].filter(i=>i!==user.id);
      else msg.reactions[emoji].push(user.id);
      saveDb(db); broadcast(); return json(res,200,msg);
    }

    // ── PROFILE ──
    if (method==="PATCH" && url.pathname==="/api/profile") {
      const body = await readBody(req);
      const allowed = ["displayName","avatar","bio","birthday","favoriteColor","favoriteSong","favoriteFood","quote","loveLanguage","status"];
      for (const k of allowed) { if (typeof body[k]==="string") user[k]=sanitizeText(body[k],500); }
      audit(user.id,"profile:update");
      saveDb(db); broadcast(); return json(res,200,publicUser(user));
    }

    // ── RELATIONSHIP ──
    if (method==="PATCH" && url.pathname==="/api/relationship") {
      const body = await readBody(req);
      if (body.startDate) db.relationship.startDate = String(body.startDate).slice(0,30);
      saveDb(db); broadcast(); return json(res,200,db.relationship);
    }

    // ── MILESTONES ──
    if (method==="GET" && url.pathname==="/api/milestones") return json(res,200,db.relationship.milestones);
    if (method==="POST" && url.pathname==="/api/milestones") {
      const body = await readBody(req);
      const milestone = { id:id("ms"), title:sanitizeText(body.title,200), date:String(body.date||now()).slice(0,30),
        description:sanitizeText(body.description||"",1000), emoji:String(body.emoji||"💕").slice(0,8),
        photos:(body.photos||[]).map(p=>sanitizeText(p,400)).slice(0,10), createdBy:user.id, createdAt:now() };
      db.relationship.milestones.push(milestone);
      saveDb(db); broadcast(); return json(res,201,milestone);
    }
    const msMatch = url.pathname.match(/^\/api\/milestones\/([^/]+)$/);
    if (msMatch) {
      const ms = db.relationship.milestones.find(m=>m.id===msMatch[1]);
      if (!ms) return json(res,404,{error:"Milestone not found."});
      if (method==="PATCH") { const body=await readBody(req); if (body.title) ms.title=sanitizeText(body.title,200); if (body.description) ms.description=sanitizeText(body.description,1000); saveDb(db); broadcast(); return json(res,200,ms); }
      if (method==="DELETE") { db.relationship.milestones=db.relationship.milestones.filter(m=>m.id!==msMatch[1]); saveDb(db); broadcast(); return json(res,200,{ok:true}); }
    }

    // ── MEMORIES ──
    if (method==="GET" && url.pathname==="/api/memories") return json(res,200,db.memories);
    if (method==="POST" && url.pathname==="/api/memories") {
      const body = await readBody(req);
      const attachments = (body.attachments||[]).map(saveAttachment).filter(Boolean);
      const memory = { id:id("mem"), title:sanitizeText(body.title||"Memory",200), caption:sanitizeText(body.caption||"",1000),
        date:String(body.date||now()).slice(0,30), location:sanitizeText(body.location||"",200),
        people:sanitizeText(body.people||"",200), song:sanitizeText(body.song||"",200),
        note:sanitizeText(body.note||"",2000), attachments, favorited:false, createdBy:user.id, createdAt:now() };
      db.memories.unshift(memory);
      saveDb(db); broadcast(); return json(res,201,memory);
    }
    const memMatch = url.pathname.match(/^\/api\/memories\/([^/]+)$/);
    if (memMatch) {
      const mem = db.memories.find(m=>m.id===memMatch[1]);
      if (!mem) return json(res,404,{error:"Memory not found."});
      if (method==="PATCH") { const body=await readBody(req); if (typeof body.favorited==="boolean") mem.favorited=body.favorited; if (body.caption) mem.caption=sanitizeText(body.caption,1000); saveDb(db); broadcast(); return json(res,200,mem); }
      if (method==="DELETE") { db.memories=db.memories.filter(m=>m.id!==memMatch[1]); saveDb(db); broadcast(); return json(res,200,{ok:true}); }
    }

    // ── JOURNAL ──
    if (method==="GET" && url.pathname==="/api/journal") return json(res,200,db.journal);
    if (method==="POST" && url.pathname==="/api/journal") {
      const body = await readBody(req);
      const attachments = (body.attachments||[]).map(saveAttachment).filter(Boolean);
      const entry = { id:id("je"), title:sanitizeText(body.title||"",200), text:sanitizeText(body.text||"",8000),
        mood:sanitizeText(body.mood||"",50), visibility:["private","shared","locked"].includes(body.visibility)?body.visibility:"shared",
        unlocksAt:body.unlocksAt||null, reactions:{}, attachments, createdBy:user.id, createdAt:now(), editedAt:null };
      db.journal.push(entry);
      saveDb(db); broadcast(); return json(res,201,entry);
    }
    const jeMatch = url.pathname.match(/^\/api\/journal\/([^/]+)$/);
    if (jeMatch) {
      const je = db.journal.find(e=>e.id===jeMatch[1]);
      if (!je) return json(res,404,{error:"Journal entry not found."});
      if (method==="PATCH") { const body=await readBody(req); if (body.text) { je.text=sanitizeText(body.text,8000); je.editedAt=now(); } if (body.mood) je.mood=sanitizeText(body.mood,50); if (body.visibility) je.visibility=body.visibility; saveDb(db); broadcast(); return json(res,200,je); }
      if (method==="DELETE") { if (je.createdBy!==user.id) return json(res,403,{error:"Not allowed."}); db.journal=db.journal.filter(e=>e.id!==jeMatch[1]); saveDb(db); broadcast(); return json(res,200,{ok:true}); }
    }
    const jeReactMatch = url.pathname.match(/^\/api\/journal\/([^/]+)\/reactions$/);
    if (method==="POST" && jeReactMatch) {
      const body=await readBody(req);
      const je=db.journal.find(e=>e.id===jeReactMatch[1]);
      if (!je) return json(res,404,{error:"Not found."});
      const emoji=String(body.emoji||"❤️").slice(0,12);
      je.reactions[emoji]=je.reactions[emoji]||[];
      if (je.reactions[emoji].includes(user.id)) je.reactions[emoji]=je.reactions[emoji].filter(i=>i!==user.id);
      else je.reactions[emoji].push(user.id);
      saveDb(db); broadcast(); return json(res,200,je);
    }

    // ── BUCKET LIST ──
    if (method==="GET" && url.pathname==="/api/bucketlist") return json(res,200,db.bucketList);
    if (method==="POST" && url.pathname==="/api/bucketlist") {
      const body = await readBody(req);
      const item = { id:id("bl"), text:sanitizeText(body.text,500), category:sanitizeText(body.category||"",100),
        completed:false, completedAt:null, completedBy:null, note:sanitizeText(body.note||"",1000),
        photos:[], createdBy:user.id, createdAt:now() };
      db.bucketList.push(item);
      saveDb(db); broadcast(); return json(res,201,item);
    }
    const blMatch = url.pathname.match(/^\/api\/bucketlist\/([^/]+)$/);
    if (blMatch) {
      const item = db.bucketList.find(i=>i.id===blMatch[1]);
      if (!item) return json(res,404,{error:"Item not found."});
      if (method==="PATCH") {
        const body=await readBody(req);
        if (body.text) item.text=sanitizeText(body.text,500);
        if (body.note) item.note=sanitizeText(body.note,1000);
        if (typeof body.completed==="boolean") { item.completed=body.completed; item.completedAt=body.completed?now():null; item.completedBy=body.completed?user.id:null; }
        saveDb(db); broadcast(); return json(res,200,item);
      }
      if (method==="DELETE") { db.bucketList=db.bucketList.filter(i=>i.id!==blMatch[1]); saveDb(db); broadcast(); return json(res,200,{ok:true}); }
    }

    // ── SONGS ──
    if (method==="GET" && url.pathname==="/api/songs") return json(res,200,db.songs);
    if (method==="POST" && url.pathname==="/api/songs") {
      const body = await readBody(req);
      const song = { id:id("song"), title:sanitizeText(body.title,200), artist:sanitizeText(body.artist||"",200),
        playlist:sanitizeText(body.playlist||"Our Songs",100), note:sanitizeText(body.note||"",1000),
        url:sanitizeText(body.url||"",500), createdBy:user.id, createdAt:now() };
      db.songs.push(song);
      saveDb(db); broadcast(); return json(res,201,song);
    }
    const songMatch = url.pathname.match(/^\/api\/songs\/([^/]+)$/);
    if (songMatch) {
      if (method==="DELETE") { db.songs=db.songs.filter(s=>s.id!==songMatch[1]); saveDb(db); broadcast(); return json(res,200,{ok:true}); }
    }

    // ── OPEN WHEN ──
    if (method==="GET" && url.pathname==="/api/openwhen") return json(res,200,db.openWhen);
    if (method==="POST" && url.pathname==="/api/openwhen") {
      const body = await readBody(req);
      const attachments=(body.attachments||[]).map(saveAttachment).filter(Boolean);
      const letter = { id:id("ow"), label:sanitizeText(body.label,200), text:sanitizeText(body.text||"",8000),
        toUserId:body.toUserId||db.users.find(u=>u.id!==user.id)?.id,
        unlocksAt:body.unlocksAt||null, opened:false, openedAt:null, attachments,
        createdBy:user.id, createdAt:now() };
      db.openWhen.push(letter);
      saveDb(db); broadcast(); return json(res,201,letter);
    }
    const owMatch = url.pathname.match(/^\/api\/openwhen\/([^/]+)\/open$/);
    if (method==="POST" && owMatch) {
      const letter = db.openWhen.find(l=>l.id===owMatch[1]);
      if (!letter) return json(res,404,{error:"Letter not found."});
      if (letter.unlocksAt && new Date(letter.unlocksAt)>new Date()) return json(res,403,{error:"This letter is not ready yet."});
      letter.opened=true; letter.openedAt=now();
      saveDb(db); broadcast(); return json(res,200,letter);
    }
    const owDelMatch = url.pathname.match(/^\/api\/openwhen\/([^/]+)$/);
    if (owDelMatch && method==="DELETE") { db.openWhen=db.openWhen.filter(l=>l.id!==owDelMatch[1]); saveDb(db); broadcast(); return json(res,200,{ok:true}); }

    // ── MOOD ──
    if (method==="GET" && url.pathname==="/api/mood") return json(res,200,db.moodEntries);
    if (method==="POST" && url.pathname==="/api/mood") {
      const body = await readBody(req);
      const entry = { id:id("mood"), mood:sanitizeText(body.mood,50), emoji:sanitizeText(body.emoji||"😊",8),
        note:sanitizeText(body.note||"",500), userId:user.id, createdAt:now() };
      db.moodEntries.push(entry);
      db.moodEntries = db.moodEntries.slice(-500);
      const partner = db.users.find(u=>u.id!==user.id);
      pushNotification(partner.id, user.id, "mood", {mood:entry.mood, emoji:entry.emoji});
      saveDb(db); broadcast(); return json(res,201,entry);
    }

    // ── LOVE NOTES (Thinking of You) ──
    if (method==="GET" && url.pathname==="/api/lovenotes") return json(res,200,db.loveNotes);
    if (method==="POST" && url.pathname==="/api/lovenotes") {
      const body = await readBody(req);
      const partner = db.users.find(u=>u.id!==user.id);
      const note = { id:id("ln"), type:sanitizeText(body.type||"thinking",50), emoji:sanitizeText(body.emoji||"💗",8),
        message:sanitizeText(body.message||"",500), fromUserId:user.id, toUserId:partner.id, createdAt:now() };
      db.loveNotes.push(note);
      db.loveNotes = db.loveNotes.slice(-200);
      pushNotification(partner.id, user.id, "love_note", {type:note.type, emoji:note.emoji, message:note.message});
      saveDb(db); broadcast(); return json(res,201,note);
    }

    // ── DATE IDEAS ──
    if (method==="GET" && url.pathname==="/api/dateideas") return json(res,200,db.dateIdeas);
    if (method==="POST" && url.pathname==="/api/dateideas") {
      const body = await readBody(req);
      const idea = { id:id("di"), title:sanitizeText(body.title,300), category:sanitizeText(body.category||"",100),
        description:sanitizeText(body.description||"",1000), completed:false, completedAt:null,
        saved:true, createdBy:user.id, createdAt:now() };
      db.dateIdeas.push(idea);
      saveDb(db); broadcast(); return json(res,201,idea);
    }
    const diMatch = url.pathname.match(/^\/api\/dateideas\/([^/]+)$/);
    if (diMatch) {
      const idea = db.dateIdeas.find(d=>d.id===diMatch[1]);
      if (!idea) return json(res,404,{error:"Not found."});
      if (method==="PATCH") { const body=await readBody(req); if (typeof body.completed==="boolean") { idea.completed=body.completed; idea.completedAt=body.completed?now():null; } saveDb(db); broadcast(); return json(res,200,idea); }
      if (method==="DELETE") { db.dateIdeas=db.dateIdeas.filter(d=>d.id!==diMatch[1]); saveDb(db); broadcast(); return json(res,200,{ok:true}); }
    }

    // ── COMPLIMENTS ──
    if (method==="GET" && url.pathname==="/api/compliments") return json(res,200,db.compliments);
    if (method==="POST" && url.pathname==="/api/compliments") {
      const body = await readBody(req);
      const comp = { id:id("cp"), text:sanitizeText(body.text,500), category:sanitizeText(body.category||"love",50),
        createdBy:user.id, createdAt:now() };
      db.compliments.push(comp);
      saveDb(db); broadcast(); return json(res,201,comp);
    }
    const cpMatch = url.pathname.match(/^\/api\/compliments\/([^/]+)$/);
    if (cpMatch && method==="DELETE") { db.compliments=db.compliments.filter(c=>c.id!==cpMatch[1]); saveDb(db); broadcast(); return json(res,200,{ok:true}); }

    // ── GAMES ──
    if (method==="GET" && url.pathname==="/api/games") return json(res,200,db.games);
    if (method==="POST" && url.pathname==="/api/games/session") {
      const body = await readBody(req);
      const session = { id:id("gs"), gameType:sanitizeText(body.gameType,50), state:body.state||{},
        turn:user.id, players:[user.id, db.users.find(u=>u.id!==user.id)?.id],
        createdBy:user.id, createdAt:now(), updatedAt:now() };
      db.games.sessions.push(session);
      db.games.sessions = db.games.sessions.slice(-50);
      saveDb(db); broadcast(); return json(res,201,session);
    }
    const gsMatch = url.pathname.match(/^\/api\/games\/session\/([^/]+)$/);
    if (gsMatch) {
      const session = db.games.sessions.find(s=>s.id===gsMatch[1]);
      if (!session) return json(res,404,{error:"Game session not found."});
      if (method==="PATCH") {
        const body=await readBody(req);
        session.state=body.state||session.state;
        session.turn=body.turn||session.turn;
        session.updatedAt=now();
        saveDb(db); broadcast(); return json(res,200,session);
      }
    }
    if (method==="POST" && url.pathname==="/api/games/stats") {
      const body = await readBody(req);
      db.games.stats[user.id]=db.games.stats[user.id]||{};
      for (const [k,v] of Object.entries(body)) { if (typeof v==="number") db.games.stats[user.id][k]=(db.games.stats[user.id][k]||0)+v; }
      saveDb(db); broadcast(); return json(res,200,db.games.stats);
    }

    // ── LOCATIONS / LOVE MAP ──
    if (method==="GET" && url.pathname==="/api/locations") return json(res,200,db.locations);
    if (method==="POST" && url.pathname==="/api/locations") {
      const body = await readBody(req);
      const loc = { id:id("loc"), name:sanitizeText(body.name,200), label:sanitizeText(body.label||"",100),
        lat:Number(body.lat)||0, lng:Number(body.lng)||0, date:String(body.date||now()).slice(0,30),
        description:sanitizeText(body.description||"",1000), emoji:String(body.emoji||"📍").slice(0,8),
        photos:(body.photos||[]).map(p=>sanitizeText(p,400)).slice(0,10),
        createdBy:user.id, createdAt:now() };
      db.locations.push(loc);
      saveDb(db); broadcast(); return json(res,201,loc);
    }
    const locMatch = url.pathname.match(/^\/api\/locations\/([^/]+)$/);
    if (locMatch && method==="DELETE") { db.locations=db.locations.filter(l=>l.id!==locMatch[1]); saveDb(db); broadcast(); return json(res,200,{ok:true}); }

    // ── DAILY QUESTIONS ──
    if (method==="GET" && url.pathname==="/api/dailyquestions") return json(res,200,db.dailyQuestions);
    if (method==="POST" && url.pathname==="/api/dailyquestions") {
      const body = await readBody(req);
      const today = new Date().toISOString().slice(0,10);
      let q = db.dailyQuestions.find(q=>q.date===today);
      if (!q) { q={ id:id("dq"), question:sanitizeText(body.question||"",500), date:today, answers:{}, createdAt:now() }; db.dailyQuestions.push(q); db.dailyQuestions=db.dailyQuestions.slice(-365); }
      q.answers[user.id]=sanitizeText(body.answer||"",2000);
      saveDb(db); broadcast(); return json(res,200,q);
    }

    // ── NOTIFICATIONS ──
    if (method==="GET" && url.pathname==="/api/notifications") return json(res,200,db.notifications.filter(n=>n.toUserId===user.id));
    if (method==="POST" && url.pathname==="/api/notifications/read") {
      db.notifications.filter(n=>n.toUserId===user.id).forEach(n=>n.read=true);
      saveDb(db); return json(res,200,{ok:true});
    }

    // ── STORIES ──
    if (method==="POST" && url.pathname==="/api/stories") {
      const body = await readBody(req);
      const text = sanitizeText(body.text,400);
      if (!text) return json(res,400,{error:"Story is empty."});
      const story={ id:id("story"), userId:user.id, text, views:[], createdAt:now(), expiresAt:new Date(Date.now()+86400000).toISOString() };
      db.stories.unshift(story);
      saveDb(db); broadcast(); return json(res,201,story);
    }

    // ── SETTINGS ──
    if (method==="PATCH" && url.pathname==="/api/settings") {
      const body = await readBody(req);
      for (const k of ["appLockSetting","screenshotAlerts","hideMedia","incognitoTyping","notificationsEnabled","loveNotifications","theme"]) {
        if (body[k]!==undefined) db.settings[k]=body[k];
      }
      audit(user.id,"settings:update",body);
      saveDb(db); broadcast(); return json(res,200,db.settings);
    }

    // ── PASSWORD ──
    if (method==="POST" && url.pathname==="/api/password") {
      if (applyRateLimit(req,res)) return;
      const body = await readBody(req);
      const oldPassword=String(body.oldPassword||""); const newPassword=String(body.newPassword||"");
      if (!verifyPassword(oldPassword,user.passwordHash)) return json(res,403,{error:"Current password is wrong."});
      if (newPassword.length<10) return json(res,400,{error:"Use at least 10 characters."});
      user.passwordHash=hashPassword(newPassword);
      audit(user.id,"password:change"); saveDb(db); return json(res,200,{ok:true});
    }

    // ── CALLS ──
    if (method==="POST" && url.pathname==="/api/calls/signal") {
      const body = await readBody(req);
      const signal={from:user.id,type:body.type,payload:body.payload,callId:body.callId||id("call"),at:now()};
      for (const [uid,client] of clients) { if (uid!==user.id) sendEvent(client,"call",signal); }
      return json(res,200,{ok:true});
    }

    // ── BACKUP / RESTORE / EXPORT ──
    if (method==="POST" && url.pathname==="/api/backup") {
      const file = path.join(backupDir,`fantasia-${Date.now()}.json`);
      fs.copyFileSync(dbPath,file);
      audit(user.id,"backup:create",{file:path.basename(file)});
      saveDb(db); return json(res,200,{message:`Backup created: ${path.basename(file)}`});
    }
    if (method==="POST" && url.pathname==="/api/restore") {
      const files = fs.readdirSync(backupDir).filter(n=>n.endsWith(".json")).map(n=>path.join(backupDir,n)).sort((a,b)=>fs.statSync(b).mtimeMs-fs.statSync(a).mtimeMs);
      if (!files.length) return json(res,404,{error:"No backup files found."});
      db = ensureDbShape(JSON.parse(fs.readFileSync(files[0],"utf8")));
      saveDb(db); audit(user.id,"backup:restore",{file:path.basename(files[0])}); broadcast();
      return json(res,200,{message:`Restored: ${path.basename(files[0])}`});
    }
    if (method==="GET" && url.pathname==="/api/export") {
      const data = JSON.stringify({exportedAt:now(),messages:db.messages,memories:db.memories,journal:db.journal,songs:db.songs},null,2);
      res.writeHead(200,{"Content-Type":"application/json; charset=utf-8","Content-Disposition":"attachment; filename=\"fantasia-export.json\""});
      res.end(data); return;
    }

    json(res,404,{error:"Not found."});
  } catch(err) {
    json(res,500,{error:err.message||"Server error."});
  }
}

// cleanup expired content
setInterval(()=>{
  const bm=db.messages.length, bs=db.stories.length;
  db.messages=db.messages.filter(m=>!m.expiresAt||Date.now()<new Date(m.expiresAt).getTime());
  db.stories=db.stories.filter(s=>!s.expiresAt||Date.now()<new Date(s.expiresAt).getTime());
  if (db.messages.length!==bm||db.stories.length!==bs) { saveDb(db); broadcast(); }
},15000);

const server = http.createServer((req,res) => {
  if (req.url.startsWith("/api/")||req.url==="/health") routeApi(req,res);
  else routeStatic(req,res);
});

server.listen(port,"0.0.0.0",()=>{ console.log(`Fantasia running at http://0.0.0.0:${port}`); });
