/* ═══════════════════════════════════════════════════════════════
   FANTASIA — Complete App Logic
   Couples private messaging app with all features
═══════════════════════════════════════════════════════════════ */
"use strict";

// ── HELPERS ──────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const $$ = sel => [...document.querySelectorAll(sel)];
const esc = s => String(s||"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fmt = ts => { if (!ts) return ""; const d = new Date(ts); return d.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}); };
const fmtDate = ts => { if (!ts) return ""; return new Date(ts).toLocaleDateString([],{year:"numeric",month:"short",day:"numeric"}); };
const fmtShort = ts => { if (!ts) return ""; const d = new Date(ts); const diff = Date.now()-d.getTime(); if (diff<60000) return "just now"; if (diff<3600000) return Math.floor(diff/60000)+"m ago"; if (diff<86400000) return Math.floor(diff/3600000)+"h ago"; return fmtDate(ts); };
const pad = n => String(n).padStart(2,"0");

// ── APP STATE ─────────────────────────────────────────────────
const app = {
  token: localStorage.getItem("fantasia_token"),
  me: null, partner: null,
  messages: [], stories: [], memories: [], journal: [], bucketList: [],
  songs: [], openWhen: [], moodEntries: [], loveNotes: [], dateIdeas: [],
  compliments: [], games: {sessions:[],stats:{}}, locations: [],
  dailyQuestions: [], notifications: [], relationship: {startDate:null,milestones:[]},
  settings: {}, presence: {},
  attachments: [], replyTo: null,
  activeTab: "chat", activeLoveSub: "thinking",
  memoriesView: "grid", bucketView: "todo", compCat: "all",
  ctxMsgId: null, typingTimer: null, counterTimer: null,
  eventSource: null, selectedMood: null, selectedJeMood: null,
  selectedMilestoneEmoji: "💕", selectedDateCat: null,
  theme: localStorage.getItem("fantasia_theme") || "light",
  lastSeenAt: Date.now()
};

// ── API ───────────────────────────────────────────────────────
async function api(path, opts={}) {
  const h = {"Content-Type":"application/json",...(opts.headers||{})};
  if (app.token) h["Authorization"] = "Bearer "+app.token;
  const r = await fetch(path, {...opts, headers:h});
  if (r.status===401) { signOut(false); throw new Error("Session expired."); }
  const text = await r.text();
  const data = text ? JSON.parse(text) : null;
  if (!r.ok) throw new Error(data?.error||"Request failed.");
  return data;
}

function showToast(msg, dur=2600) {
  const t = $("toast"); t.textContent=msg; t.classList.remove("hidden");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(()=>t.classList.add("hidden"), dur);
}
function setLoading(on) { $("loadingOverlay").classList.toggle("hidden",!on); }

// ── AUTH ──────────────────────────────────────────────────────
$("loginForm").addEventListener("submit", async e => {
  e.preventDefault();
  const u=$("loginUsername").value.trim(), p=$("loginPassword").value;
  const err=$("loginError"); err.classList.add("hidden");
  try {
    setLoading(true);
    const d = await api("/api/login",{method:"POST",body:JSON.stringify({username:u,password:p})});
    app.token = d.token;
    localStorage.setItem("fantasia_token", d.token);
    await boot();
  } catch(e) { err.textContent=e.message; err.classList.remove("hidden"); }
  finally { setLoading(false); }
});

$("pwToggle").addEventListener("click",()=>{
  const i=$("loginPassword");
  i.type = i.type==="password"?"text":"password";
});

async function signOut(notify=true) {
  if (notify) { try { await api("/api/logout",{method:"POST"}); } catch{} }
  localStorage.removeItem("fantasia_token");
  app.token=null; app.me=null;
  if (app.eventSource) { app.eventSource.close(); app.eventSource=null; }
  clearInterval(app.counterTimer);
  $("appShell").classList.add("hidden");
  $("authScreen").classList.remove("hidden");
}
["logoutBtn","logoutBtnSettings"].forEach(id=>{ const b=$(id); if(b) b.addEventListener("click",()=>signOut(true)); });

// ── BOOT ──────────────────────────────────────────────────────
async function boot() {
  if (!app.token) { setLoading(false); return; }
  setLoading(true);
  try {
    const s = await api("/api/session");
    applyState(s);
    applyTheme(app.theme);
    $("authScreen").classList.add("hidden");
    $("appShell").classList.remove("hidden");
    connectSSE();
    startCounter();
    startPresenceBeacon();
    renderAll();
    loadSeedData();
  } catch { setLoading(false); }
  finally { setLoading(false); }
}

function applyState(s) {
  if (s.me)             app.me            = s.me;
  if (s.partner)        app.partner       = s.partner;
  if (s.messages)       app.messages      = s.messages;
  if (s.stories)        app.stories       = s.stories;
  if (s.memories)       app.memories      = s.memories;
  if (s.journal)        app.journal       = s.journal;
  if (s.bucketList)     app.bucketList    = s.bucketList;
  if (s.songs)          app.songs         = s.songs;
  if (s.openWhen)       app.openWhen      = s.openWhen;
  if (s.moodEntries)    app.moodEntries   = s.moodEntries;
  if (s.loveNotes)      app.loveNotes     = s.loveNotes;
  if (s.dateIdeas)      app.dateIdeas     = s.dateIdeas;
  if (s.compliments)    app.compliments   = s.compliments;
  if (s.games)          app.games         = s.games;
  if (s.locations)      app.locations     = s.locations;
  if (s.dailyQuestions) app.dailyQuestions= s.dailyQuestions;
  if (s.notifications)  app.notifications = s.notifications;
  if (s.relationship)   app.relationship  = s.relationship;
  if (s.settings)       app.settings      = s.settings;
  if (s.presence)       app.presence      = s.presence;
}

function renderAll() {
  renderHeader();
  renderMessages();
  renderUs();
  renderMemories();
  renderLove();
  renderSettings();
  updateNotifBadge();
}
