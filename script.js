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
  const err=$("loginError"), errTxt=$("loginErrorText");
  err.classList.add("hidden");
  try {
    setLoading(true);
    const d = await api("/api/login",{method:"POST",body:JSON.stringify({username:u,password:p})});
    app.token = d.token;
    localStorage.setItem("fantasia_token", d.token);
    await boot();
  } catch(e) { errTxt.textContent=e.message; err.classList.remove("hidden"); }
  finally { setLoading(false); }
});

$("pwToggle").addEventListener("click",()=>{
  const i=$("loginPassword");
  const showing = i.type === "text";
  i.type = showing ? "password" : "text";
  $("pwEyeIcon").innerHTML = showing
    ? `<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>`
    : `<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>`;
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

// ── SSE ───────────────────────────────────────────────────────
function connectSSE() {
  if (app.eventSource) app.eventSource.close();
  const es = new EventSource(`/api/events?token=${app.token}`);
  app.eventSource = es;
  es.addEventListener("state", e => {
    applyState(JSON.parse(e.data));
    renderAll();
  });
  es.addEventListener("typing", e => {
    const d = JSON.parse(e.data);
    if (d.userId !== app.me?.id) showTyping(d);
  });
  es.addEventListener("notification", e => {
    const n = JSON.parse(e.data);
    app.notifications.unshift(n);
    updateNotifBadge();
    handleIncomingNotification(n);
  });
  es.addEventListener("call", e => handleCallSignal(JSON.parse(e.data)));
  es.onerror = () => setTimeout(connectSSE, 3000);
}

function handleIncomingNotification(n) {
  if (!app.settings.notificationsEnabled && n.type!=="love_note") return;
  if (n.type === "love_note") {
    if (!app.settings.loveNotifications) return;
    showLoveNotif(n);
  }
  if (n.type === "mood") showToast(`${n.data?.emoji||"😊"} ${app.partner?.displayName} is feeling ${n.data?.mood}`);
}

function showLoveNotif(n) {
  const overlay = $("loveNotifOverlay"), emoji = $("loveNotifEmoji"), txt = $("loveNotifText");
  const from = app.partner?.displayName || "Someone";
  const msg = n.data?.message ? `"${n.data.message}"` : `is ${n.data?.msg||"thinking of you"}`;
  emoji.textContent = n.data?.emoji || "💗";
  txt.textContent = `${from} ${msg}`;
  overlay.classList.remove("hidden");
  launchFloatingHearts();
}
$("loveNotifClose").addEventListener("click",()=>$("loveNotifOverlay").classList.add("hidden"));

function launchFloatingHearts() {
  const c = $("floatingHearts"); c.innerHTML="";
  const SVG = `<svg viewBox="0 0 24 24" style="width:20px;height:20px"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" fill="var(--love)" opacity="0.8"/></svg>`;
  for (let i=0;i<12;i++) {
    const h=document.createElement("div"); h.className="floating-heart";
    h.innerHTML=SVG;
    h.style.left=Math.random()*100+"%";
    h.style.animationDelay=Math.random()*1.5+"s";
    h.style.animationDuration=(2+Math.random()*2)+"s";
    c.appendChild(h);
  }
}

function showConfetti(x,y) {
  const colors=["#075E54","#25D366","#e91e63","#ffd700","#00bcd4","#ff5722"];
  for (let i=0;i<20;i++) {
    const p=document.createElement("div"); p.className="confetti-piece";
    p.style.left=x+"px"; p.style.top=y+"px";
    p.style.background=colors[Math.floor(Math.random()*colors.length)];
    const angle=Math.random()*360, dist=60+Math.random()*100;
    p.style.setProperty("--tx",`${Math.cos(angle*Math.PI/180)*dist}px`);
    p.style.setProperty("--ty",`${Math.sin(angle*Math.PI/180)*dist}px`);
    p.style.setProperty("--rot",`${Math.random()*360}deg`);
    document.body.appendChild(p);
    setTimeout(()=>p.remove(), 1300);
  }
}

// ── PRESENCE BEACON ──────────────────────────────────────────
function startPresenceBeacon() {
  api("/api/presence",{method:"POST"}).catch(()=>{});
  setInterval(()=>{ api("/api/presence",{method:"POST"}).catch(()=>{}); }, 30000);
  document.addEventListener("visibilitychange",()=>{
    if (document.hidden) api("/api/presence/offline",{method:"POST"}).catch(()=>{});
    else api("/api/presence",{method:"POST"}).catch(()=>{});
  });
}

// ── THEME ─────────────────────────────────────────────────────
function applyTheme(t) {
  app.theme=t; document.body.dataset.theme=t;
  localStorage.setItem("fantasia_theme",t);
  $$(".theme-btn").forEach(b=>b.classList.toggle("active",b.dataset.theme===t));
  const icon=$("themeIcon");
  if (icon) {
    if (t==="dark") icon.innerHTML='<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z"/>';
    else icon.innerHTML='<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>';
  }
}
$("themeToggle").addEventListener("click",()=>{ const themes=["light","dark","rose"]; const i=themes.indexOf(app.theme); applyTheme(themes[(i+1)%themes.length]); api("/api/settings",{method:"PATCH",body:JSON.stringify({theme:app.theme})}).catch(()=>{}); });
$$(".theme-btn").forEach(b=>b.addEventListener("click",()=>{ applyTheme(b.dataset.theme); api("/api/settings",{method:"PATCH",body:JSON.stringify({theme:b.dataset.theme})}).catch(()=>{}); }));

// ── TAB NAVIGATION ────────────────────────────────────────────
function switchTab(tab, loveSub) {
  app.activeTab=tab;
  $$(".tab-panel").forEach(p=>p.classList.toggle("active",p.id==="tab-"+tab));
  $$(".nav-btn,.bnav-btn").forEach(b=>b.classList.toggle("active",b.dataset.tab===tab));
  updateMobileHeader(tab);
  if (tab==="love" && loveSub) switchLoveSub(loveSub);
  if (tab==="chat") scrollToBottom(true);
}

$$(".nav-btn,.bnav-btn").forEach(b=>b.addEventListener("click",()=>switchTab(b.dataset.tab)));
$$(".us-card").forEach(c=>c.addEventListener("click",()=>switchTab(c.dataset.tab, c.dataset.sub)));

function updateMobileHeader(tab) {
  const titles={chat:"Fantasia",us:"Our World",memories:"Memories",play:"Play Together",love:"Love",settings:"Settings"};
  const subs={chat:app.partner?.displayName||"Partner",us:"Your private world",memories:"Your shared moments",play:"Games for two",love:"Love features",settings:"Account & preferences"};
  $("mhTitle").textContent=titles[tab]||"Fantasia";
  $("mhSub").textContent=subs[tab]||"";
  if (tab==="chat" && app.partner) {
    $("mhAvatar").src=app.partner.avatar||"";
    $("mhAvatarWrap").style.display="flex";
    const p=app.presence[app.partner.id];
    $("mhOnlineDot").classList.toggle("visible",p?.status==="online");
  } else {
    $("mhAvatarWrap").style.display="none";
  }
}

// ── HEADER RENDER ─────────────────────────────────────────────
function renderHeader() {
  if (!app.me||!app.partner) return;
  $("mhAvatar").src=app.partner.avatar||"";
  $("sidebarAvatar").src=app.me.avatar||"";
  $("sidebarName").textContent=app.me.displayName||app.me.username;
  $("chatPartnerAvatar").src=app.partner.avatar||"";
  $("chatPartnerName").textContent=app.partner.displayName||app.partner.username;
  $("infoAvatar").src=app.partner.avatar||"";
  $("infoName").textContent=app.partner.displayName||app.partner.username;
  $("infoStatus").textContent=app.partner.status||"";
  $("thinkingPartnerName").textContent=app.partner.displayName||app.partner.username;
  renderPresence();
  updateMobileHeader(app.activeTab);
}

function renderPresence() {
  if (!app.partner) return;
  const p=app.presence[app.partner.id];
  const online=p?.status==="online";
  const line = online ? "Online" : (p?.lastSeenAt ? "Last seen "+fmtShort(p.lastSeenAt) : "Offline");
  $("chatPresenceLine").textContent=line;
  $("chatOnlineDot").classList.toggle("visible",online);
  $("mhOnlineDot").classList.toggle("visible",online);
}

function showTyping({userId}) {
  if (userId===app.me?.id) return;
  if (app.settings.incognitoTyping) return;
  const el=$("typingIndicator"), nm=$("typingName");
  nm.textContent=app.partner?.displayName||"Partner";
  el.classList.remove("hidden");
  clearTimeout(app.typingTimer);
  app.typingTimer=setTimeout(()=>el.classList.add("hidden"),3000);
}

// ── RELATIONSHIP COUNTER ──────────────────────────────────────
function startCounter() {
  clearInterval(app.counterTimer);
  app.counterTimer = setInterval(renderCounter, 1000);
  renderCounter();
}

function renderCounter() {
  const start = app.relationship?.startDate;
  if (!start) {
    $("rcDays").textContent="?"; $("rcHours").textContent="??";
    $("rcMins").textContent="??"; $("rcSecs").textContent="??";
    return;
  }
  const diff = Math.max(0, Date.now() - new Date(start).getTime());
  const s=Math.floor(diff/1000), m=Math.floor(s/60), h=Math.floor(m/60), d=Math.floor(h/24);
  $("rcDays").textContent=d;
  $("rcHours").textContent=pad(h%24);
  $("rcMins").textContent=pad(m%60);
  $("rcSecs").textContent=pad(s%60);
}

$("setRelationshipDateBtn").addEventListener("click",()=>{ openModal("setRelDateModal"); const d=app.relationship?.startDate; if(d) $("relDateInput").value=d.slice(0,10); });
$("saveRelDateBtn").addEventListener("click",async()=>{
  const v=$("relDateInput").value; if(!v) return;
  try { await api("/api/relationship",{method:"PATCH",body:JSON.stringify({startDate:v})}); app.relationship.startDate=v; closeModal("setRelDateModal"); renderCounter(); showToast("Start date saved"); } catch(e){showToast(e.message);}
});

// ── MESSAGES ─────────────────────────────────────────────────
let _lastSearchQuery="", _searchFilter="all";

function visibleMessages() {
  return app.messages.filter(m => !(m.hiddenFor||[]).includes(app.me?.id));
}

function renderMessages() {
  const list=$("messageList"), msgs=visibleMessages();
  const q=_lastSearchQuery.toLowerCase(), f=_searchFilter;
  const filtered = q||f!=="all" ? msgs.filter(m=>{
    if (f==="pinned") return m.pinned;
    if (f==="starred") return m.starred;
    if (f==="media") return m.attachments?.length>0;
    return m.text?.toLowerCase().includes(q)||(m.attachments?.length>0&&f==="all");
  }) : msgs;

  let lastDate="";
  let html="";
  filtered.forEach(m=>{
    const d=new Date(m.createdAt).toDateString();
    if(d!==lastDate) { lastDate=d; html+=`<div class="date-sep"><span>${d===new Date().toDateString()?"Today":fmtDate(m.createdAt)}</span></div>`; }
    html+=buildBubble(m);
  });
  list.innerHTML=html||`<div style="text-align:center;padding:40px;color:var(--text-muted);font-size:14px">No messages yet. Say hello!</div>`;

  // bind events
  list.querySelectorAll(".bubble").forEach(b=>{
    const id=b.closest(".bubble-row")?.dataset.id;
    b.addEventListener("contextmenu",e=>{e.preventDefault();showCtxMenu(e,id);});
    b.addEventListener("click",e=>{ if(e.target.tagName==="IMG") openLightbox(e.target.src); });
    b.addEventListener("dblclick",e=>{ e.preventDefault(); if(id) toggleReact(id,"❤️"); });
  });
  list.querySelectorAll(".reaction-chip").forEach(c=>{
    c.addEventListener("click",e=>{e.stopPropagation();const id=c.closest(".bubble-row")?.dataset.id;const emoji=c.dataset.emoji;if(id&&emoji)toggleReact(id,emoji);});
  });
  list.querySelectorAll(".poll-option").forEach(o=>{
    o.addEventListener("click",()=>{ const mid=o.closest(".bubble-row")?.dataset.id; const opt=o.dataset.opt; if(mid&&opt) votePoll(mid,opt); });
  });

  const unread=msgs.filter(m=>!m.readBy?.includes(app.me?.id)&&m.senderId!==app.me?.id);
  if(unread.length>0) markRead(unread.map(m=>m.id));
  updatePinnedBar(filtered);
  updateMediaMini(msgs);
  updateChatInfoLists(msgs);
  scrollToBottom();
}

function buildBubble(m) {
  const out=m.senderId===app.me?.id;
  const sender=out?app.me:app.partner;
  const avatar=sender?.avatar||"";
  const read=m.readBy?.length>1;
  const tick=out?`<span class="read-tick">${read?"✓✓":"✓"}</span>`:"";
  const edited=m.editedAt?`<span class="bubble-edited">edited</span>`:"";
  const replyHtml=m.replyTo?buildReplyPreview(m.replyTo):"";
  const attachHtml=buildAttachments(m, out);
  const pollHtml=m.poll?buildPoll(m):"";
  const reactHtml=buildReactions(m);
  const text=m.text?`<span>${renderLinks(esc(m.text))}</span>`:"";
  const viewOnce=m.viewOnce&&!read?`<div class="view-once-indicator">🔒 View once</div>`:"";
  return `<div class="bubble-row ${out?"out":"in"}" data-id="${m.id}">
    ${!out?`<img class="bubble-avatar" src="${esc(avatar)}" alt="">`:""}
    <div class="bubble">
      ${replyHtml}${attachHtml}${pollHtml}${text}${viewOnce}
      <div class="bubble-meta">${edited}${fmt(m.createdAt)}${tick}</div>
      ${m.pinned?'<span style="position:absolute;top:4px;right:8px;font-size:10px">📌</span>':""}
      ${m.starred?'<span style="position:absolute;top:4px;right:22px;font-size:10px">⭐</span>':""}
      ${!out?"":`<div class="bubble-tail-out"></div>`}
      ${out?"":`<div class="bubble-tail-in"></div>`}
      ${reactHtml}
    </div>
  </div>`;
}

function buildReplyPreview(replyToId) {
  const orig=app.messages.find(m=>m.id===replyToId); if(!orig) return "";
  const name=orig.senderId===app.me?.id?app.me?.displayName:app.partner?.displayName;
  const preview=orig.text?esc(orig.text.slice(0,60)):"📎 Attachment";
  return `<div class="bubble-reply"><strong>${esc(name)}</strong>${preview}</div>`;
}

function buildAttachments(m, out) {
  if (!m.attachments?.length) return "";
  return m.attachments.map(a=>{
    if (a.type?.startsWith("image/")) return `<img class="bubble-img" src="${esc(a.url)}" alt="${esc(a.name)}" loading="lazy">`;
    if (a.type?.startsWith("video/")) return `<video class="bubble-video" src="${esc(a.url)}" controls></video>`;
    if (a.type?.startsWith("audio/")) return `<audio class="bubble-audio" src="${esc(a.url)}" controls></audio>`;
    return `<a href="${esc(a.url)}" target="_blank" rel="noreferrer" style="font-size:13px;color:var(--text-link)">📎 ${esc(a.name)}</a>`;
  }).join("");
}

function buildPoll(m) {
  const p=m.poll; const total=Object.values(p.votes||{}).reduce((s,v)=>s+v.length,0);
  const opts=p.options.map(o=>{
    const cnt=(p.votes[o]||[]).length; const pct=total?Math.round(cnt/total*100):0;
    const voted=(p.votes[o]||[]).includes(app.me?.id);
    return `<div class="poll-option${voted?" selected":""}" data-opt="${esc(o)}"><span>${esc(o)}</span><div class="poll-bar" style="width:${pct}%"></div><span style="font-size:11px;color:var(--text-muted);margin-left:auto">${pct}%</span></div>`;
  }).join("");
  return `<div class="bubble-poll"><div class="poll-q">${esc(p.question)}</div>${opts}</div>`;
}

function buildReactions(m) {
  const r=m.reactions||{}; const keys=Object.keys(r).filter(k=>r[k].length>0); if(!keys.length) return "";
  const chips=keys.map(k=>`<span class="reaction-chip" data-emoji="${esc(k)}">${k} ${r[k].length}</span>`).join("");
  return `<div class="bubble-reactions">${chips}</div>`;
}

function renderLinks(text) {
  return text.replace(/(https?:\/\/[^\s<>"]+)/g,'<a href="$1" target="_blank" rel="noreferrer" style="color:var(--text-link)">$1</a>');
}

function scrollToBottom(force=false) {
  const list=$("messageList");
  const near=list.scrollHeight-list.scrollTop-list.clientHeight<200;
  if(near||force) list.scrollTo({top:list.scrollHeight,behavior:"smooth"});
  $("scrollBottom").classList.toggle("hidden",near||force);
}
$("scrollBottom").addEventListener("click",()=>scrollToBottom(true));
$("messageList").addEventListener("scroll",()=>{
  const list=$("messageList");
  const near=list.scrollHeight-list.scrollTop-list.clientHeight<200;
  $("scrollBottom").classList.toggle("hidden",near);
});

async function markRead(ids) {
  for(const id of ids) {
    const m=app.messages.find(x=>x.id===id);
    if(m&&!m.readBy?.includes(app.me?.id)) {
      try { await api(`/api/messages/${id}`,{method:"PATCH",body:JSON.stringify({})}); } catch{}
    }
  }
}

function updatePinnedBar(msgs) {
  const pinned=msgs.find(m=>m.pinned);
  const bar=$("pinnedBar"), txt=$("pinnedBarText");
  if(pinned) { txt.textContent=pinned.text?pinned.text.slice(0,60):"📎 Pinned attachment"; bar.classList.remove("hidden"); }
  else bar.classList.add("hidden");
}
$("pinnedBar").addEventListener("click",()=>{ const p=visibleMessages().find(m=>m.pinned); if(p){_lastSearchQuery="";_searchFilter="pinned";$("searchFilter").value="pinned";renderMessages();} });

function updateMediaMini(msgs) {
  const imgs=msgs.flatMap(m=>m.attachments||[]).filter(a=>a.type?.startsWith("image/")).slice(0,9);
  $("mediaMini").innerHTML=imgs.map(a=>`<img src="${esc(a.url)}" alt="" loading="lazy">`).join("");
  $("mediaMini").querySelectorAll("img").forEach(i=>i.addEventListener("click",()=>openLightbox(i.src)));
}

function updateChatInfoLists(msgs) {
  const pin=msgs.filter(m=>m.pinned);
  const star=msgs.filter(m=>m.starred);
  $("pinnedList").innerHTML=pin.map(m=>`<div class="compact-item">${esc(m.text||"📎")}</div>`).join("")||"<div style='font-size:13px;color:var(--text-muted);padding:8px'>No pinned messages</div>";
  $("starredList").innerHTML=star.map(m=>`<div class="compact-item">${esc(m.text||"📎")}</div>`).join("")||"<div style='font-size:13px;color:var(--text-muted);padding:8px'>No starred messages</div>";
}

// ── COMPOSER ─────────────────────────────────────────────────
const msgInput=$("msgInput");
msgInput.addEventListener("input",()=>{
  msgInput.style.height="auto";
  msgInput.style.height=Math.min(msgInput.scrollHeight,96)+"px";
  if(!app.settings.incognitoTyping) { clearTimeout(app._typingSend); app._typingSend=setTimeout(()=>api("/api/typing",{method:"POST"}).catch(()=>{}),400); }
});
msgInput.addEventListener("keydown",e=>{ if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();$("composer").dispatchEvent(new Event("submit"));} });

$("composer").addEventListener("submit",async e=>{
  e.preventDefault();
  const text=msgInput.value.trim();
  if(!text&&!app.attachments.length) return;
  const body={text,replyTo:app.replyTo,attachments:app.attachments,viewOnce:$("viewOnceMode").checked};
  const timer=parseInt($("timerMode").value)||0;
  if(timer>0) body.timer=timer;
  try {
    app.attachments=[]; app.replyTo=null;
    msgInput.value=""; msgInput.style.height="auto";
    $("attachChips").innerHTML=""; $("replyBanner").classList.add("hidden");
    await api("/api/messages",{method:"POST",body:JSON.stringify(body)});
  } catch(e){showToast(e.message);}
});

// Emoji picker
const emojis=["😀","😂","🥰","😍","🤩","😘","😭","🥹","😊","😎","🤗","😏","😢","😤","😴","🤯","❤️","💕","💗","💖","💝","🔥","✨","🌸","🎉","👍","👏","🙏","🫂","💯","🎵","🎶","📸","💫","⭐","🌙","☀️","🌈","🍕","🧁","🎂","🥂","🚀","💌","📖","🎭","🏖","🌺","🦋","💎"];
$("emojiPicker").innerHTML=emojis.map(e=>`<button type="button">${e}</button>`).join("");
$("emojiPicker").querySelectorAll("button").forEach(b=>b.addEventListener("click",()=>{ msgInput.value+=b.textContent; msgInput.focus(); }));
$("emojiBtn").addEventListener("click",e=>{ e.stopPropagation(); $("emojiPicker").classList.toggle("hidden"); });
document.addEventListener("click",e=>{ if(!e.target.closest("#emojiPicker")&&!e.target.closest("#emojiBtn")) $("emojiPicker").classList.add("hidden"); });

// File attach
$("attachBtn").addEventListener("click",()=>$("fileInput").click());
$("fileInput").addEventListener("change",async()=>{
  const files=[...$("fileInput").files];
  for(const file of files) {
    const reader=new FileReader();
    await new Promise(res=>{ reader.onload=()=>{ app.attachments.push({name:file.name,type:file.type,data:reader.result}); res(); }; reader.readAsDataURL(file); });
  }
  $("fileInput").value="";
  renderAttachChips();
});
function renderAttachChips() {
  $("attachChips").innerHTML=app.attachments.map((a,i)=>`<div class="att-chip">${a.type.startsWith("image/")?"📷":a.type.startsWith("video/")?"🎬":"📎"} ${esc(a.name.slice(0,20))}<button onclick="app.attachments.splice(${i},1);renderAttachChips()">✕</button></div>`).join("");
}

// Reply
$("replyCancel").addEventListener("click",()=>{ app.replyTo=null; $("replyBanner").classList.add("hidden"); });

// Search
$("searchToggle").addEventListener("click",()=>{ $("searchBar").classList.toggle("hidden"); if(!$("searchBar").classList.contains("hidden")) $("searchInput").focus(); });
$("searchClose").addEventListener("click",()=>{ $("searchBar").classList.add("hidden"); _lastSearchQuery=""; _searchFilter="all"; renderMessages(); });
$("searchInput").addEventListener("input",()=>{ _lastSearchQuery=$("searchInput").value; renderMessages(); });
$("searchFilter").addEventListener("change",()=>{ _searchFilter=$("searchFilter").value; renderMessages(); });

// Poll builder
$("pollBtn").addEventListener("click",()=>{
  const q=prompt("Poll question?"); if(!q) return;
  const opts=[];
  for(let i=1;i<=4;i++){const o=prompt(`Option ${i}? (blank to stop)`); if(!o) break; opts.push(o);}
  if(opts.length<2){showToast("Need at least 2 options");return;}
  api("/api/messages",{method:"POST",body:JSON.stringify({text:"",poll:{question:q,options:opts}})}).catch(e=>showToast(e.message));
});

// Voice note recording
let mediaRecorder, audioChunks=[];
$("voiceNoteBtn").addEventListener("click",async()=>{
  if(mediaRecorder&&mediaRecorder.state==="recording"){
    mediaRecorder.stop();
    $("voiceNoteBtn").classList.remove("recording");
  } else {
    try {
      const stream=await navigator.mediaDevices.getUserMedia({audio:true});
      audioChunks=[];
      mediaRecorder=new MediaRecorder(stream);
      mediaRecorder.ondataavailable=e=>audioChunks.push(e.data);
      mediaRecorder.onstop=async()=>{
        const blob=new Blob(audioChunks,{type:"audio/webm"});
        const reader=new FileReader();
        reader.onload=()=>{ app.attachments.push({name:"voice-note.webm",type:"audio/webm",data:reader.result}); renderAttachChips(); };
        reader.readAsDataURL(blob);
        stream.getTracks().forEach(t=>t.stop());
        showToast("Voice note ready — press Send");
      };
      mediaRecorder.start();
      $("voiceNoteBtn").classList.add("recording");
      showToast("Recording... tap mic to stop");
    } catch { showToast("Microphone not available"); }
  }
});

// ── CONTEXT MENU ─────────────────────────────────────────────
function showCtxMenu(e,msgId) {
  e.preventDefault();
  app.ctxMsgId=msgId;
  const menu=$("contextMenu");
  const msg=app.messages.find(m=>m.id===msgId);
  if(!msg) return;
  const isMine=msg.senderId===app.me?.id;
  menu.querySelector('[data-action="edit"]').style.display=isMine?"block":"none";
  menu.querySelector('[data-action="delete-all"]').style.display=isMine?"block":"none";
  menu.classList.remove("hidden");
  const x=Math.min(e.clientX,window.innerWidth-200), y=Math.min(e.clientY,window.innerHeight-320);
  menu.style.left=x+"px"; menu.style.top=y+"px";
}
document.addEventListener("click",e=>{ if(!e.target.closest("#contextMenu")&&!e.target.closest("#reactionPicker")) { $("contextMenu").classList.add("hidden"); $("reactionPicker").classList.add("hidden"); } });

$("contextMenu").querySelectorAll("button").forEach(b=>{
  b.addEventListener("click",async()=>{
    const id=app.ctxMsgId; $("contextMenu").classList.add("hidden");
    const msg=app.messages.find(m=>m.id===id); if(!msg) return;
    switch(b.dataset.action){
      case "reply":
        app.replyTo=id;
        $("replyBannerSender").textContent=msg.senderId===app.me?.id?app.me?.displayName:app.partner?.displayName;
        $("replyBannerText").textContent=msg.text?msg.text.slice(0,80):"📎 Attachment";
        $("replyBanner").classList.remove("hidden");
        msgInput.focus(); break;
      case "react":
        const rp=$("reactionPicker"); rp.classList.remove("hidden");
        rp.style.left=$("contextMenu").style.left; rp.style.top=(parseInt($("contextMenu").style.top||"0")-60)+"px"; break;
      case "copy":
        if(msg.text) navigator.clipboard?.writeText(msg.text).then(()=>showToast("Copied")).catch(()=>{}); break;
      case "star":
        try { await api(`/api/messages/${id}`,{method:"PATCH",body:JSON.stringify({starred:!msg.starred})}); showToast(msg.starred?"Unstarred":"Starred ⭐"); } catch(e){showToast(e.message);} break;
      case "pin":
        try { await api(`/api/messages/${id}`,{method:"PATCH",body:JSON.stringify({pinned:!msg.pinned})}); showToast(msg.pinned?"Unpinned":"Pinned 📌"); } catch(e){showToast(e.message);} break;
      case "edit":
        const nt=prompt("Edit message:",msg.text||""); if(nt===null) break;
        try { await api(`/api/messages/${id}`,{method:"PATCH",body:JSON.stringify({text:nt})}); } catch(e){showToast(e.message);} break;
      case "delete-me":
        try { await api(`/api/messages/${id}?mode=me`,{method:"DELETE"}); } catch(e){showToast(e.message);} break;
      case "delete-all":
        if(confirm("Delete for everyone?")) try { await api(`/api/messages/${id}?mode=everyone`,{method:"DELETE"}); } catch(e){showToast(e.message);} break;
    }
  });
});

$("reactionPicker").querySelectorAll("button").forEach(b=>{
  b.addEventListener("click",()=>{ $("reactionPicker").classList.add("hidden"); toggleReact(app.ctxMsgId,b.dataset.emoji); });
});

async function toggleReact(msgId,emoji) {
  try { await api(`/api/messages/${msgId}/reactions`,{method:"POST",body:JSON.stringify({emoji})}); } catch(e){showToast(e.message);}
}
async function votePoll(msgId,option) {
  try { await api(`/api/messages/${msgId}/poll`,{method:"POST",body:JSON.stringify({option})}); } catch(e){showToast(e.message);}
}

// ── LIGHTBOX ──────────────────────────────────────────────────
function openLightbox(src) { $("lightboxImg").src=src; $("lightbox").classList.remove("hidden"); }
$("lightboxClose").addEventListener("click",()=>$("lightbox").classList.add("hidden"));
$("lightbox").addEventListener("click",e=>{ if(e.target===$("lightbox")) $("lightbox").classList.add("hidden"); });

// ── NOTIFICATIONS ─────────────────────────────────────────────
function updateNotifBadge() {
  const unread=app.notifications.filter(n=>!n.read).length;
  [$("notifBadge"),$("notifBadgeDesktop")].forEach(b=>{ if(!b)return; b.textContent=unread; b.classList.toggle("hidden",unread===0); });
}
[$("mhNotifBtn"),$("notifBtnDesktop")].forEach(b=>{ if(b) b.addEventListener("click",e=>{ e.stopPropagation(); toggleNotifPanel(); }); });
function toggleNotifPanel() {
  const p=$("notifPanel"); p.classList.toggle("hidden");
  if(!p.classList.contains("hidden")) {
    renderNotifPanel();
    api("/api/notifications/read",{method:"POST"}).then(()=>{ app.notifications.forEach(n=>n.read=true); updateNotifBadge(); }).catch(()=>{});
  }
}
$("closeNotifPanel").addEventListener("click",()=>$("notifPanel").classList.add("hidden"));
document.addEventListener("click",e=>{ if(!e.target.closest("#notifPanel")&&!e.target.closest("#mhNotifBtn")&&!e.target.closest("#notifBtnDesktop")) $("notifPanel").classList.add("hidden"); });
function renderNotifPanel() {
  const list=$("notifPanelList");
  if(!app.notifications.length){ list.innerHTML='<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:13px">No notifications yet</div>'; return; }
  list.innerHTML=app.notifications.slice(0,30).map(n=>{
    const icons={love_note:"💌",mood:"🌡️",message:"💬",milestone:"✨"};
    const from=app.partner?.displayName||"Partner";
    const msgs={love_note:`${from} sent you a love note ${n.data?.emoji||"💗"}`,mood:`${from} is feeling ${n.data?.mood||"something"} ${n.data?.emoji||""}`,message:`New message from ${from}`,milestone:`New milestone: ${n.data?.title||""}`};
    return `<div class="notif-item${n.read?"":" unread"}"><div class="notif-item-emoji">${icons[n.type]||"🔔"}</div><div class="notif-item-text"><div class="notif-item-msg">${esc(msgs[n.type]||"You have a notification")}</div><div class="notif-item-time">${fmtShort(n.createdAt)}</div></div></div>`;
  }).join("");
}

// ── MODALS ────────────────────────────────────────────────────
function openModal(id) { $(id).classList.remove("hidden"); }
function closeModal(id) { $(id).classList.add("hidden"); }
$$(".modal-close, [data-modal]").forEach(b=>b.addEventListener("click",()=>closeModal(b.dataset.modal||b.closest(".modal-overlay")?.id)));
$$(".modal-overlay").forEach(o=>o.addEventListener("click",e=>{ if(e.target===o) closeModal(o.id); }));

// ── US TAB ────────────────────────────────────────────────────
function renderUs() {
  if(!app.me||!app.partner) return;
  $("usAvatar1").src=app.me.avatar||"";
  $("usAvatar2").src=app.partner.avatar||"";
  $("usTitle").textContent=`${app.me.displayName} & ${app.partner.displayName} 💫`;
  $("statMessages").textContent=app.messages.length;
  $("statMemories").textContent=app.memories.length;
  $("statSongs").textContent=app.songs.length;
  $("statBucket").textContent=app.bucketList.filter(i=>i.completed).length;
  renderDailyQuestion();
  renderMemoryOfDay();
}

const DAILY_QUESTIONS=["What's one memory of us you would relive?","What's your favourite thing we've done together?","If you could take us anywhere tomorrow, where would it be?","What's one thing I do that always makes you smile?","What song reminds you most of us?","What's the moment you knew we were special?","If we had a whole day with no plans, what would you want to do?","What's one thing you want us to try together this month?","Describe our relationship in three words.","What's something small I do that means the world to you?","What's the funniest moment we've shared?","If you wrote us a song, what would it be called?","What's your favourite photo of us and why?","What's one thing you appreciate about me today?","Where do you see us in five years?"];

function renderDailyQuestion() {
  const today=new Date().toISOString().slice(0,10);
  const idx=today.split("-").reduce((s,n)=>s+parseInt(n),0)%DAILY_QUESTIONS.length;
  const q=app.dailyQuestions.find(q=>q.date===today)||{question:DAILY_QUESTIONS[idx],date:today,answers:{}};
  $("dqText").textContent=q.question;
  const a1=q.answers[app.me?.id], a2=q.answers[app.partner?.id];
  const both=a1&&a2;
  let html="";
  if(a1) html+=`<div class="dq-answer"><strong>${esc(app.me?.displayName)}</strong>${esc(a1)}</div>`;
  if(both&&a2) html+=`<div class="dq-answer"><strong>${esc(app.partner?.displayName)}</strong>${esc(a2)}</div>`;
  else if(a1&&!a2) html+=`<div class="dq-answer" style="opacity:0.5"><strong>${esc(app.partner?.displayName)}</strong>Waiting for their answer... 💭</div>`;
  $("dqAnswers").innerHTML=html;
  $("dqInput").value=a1||"";
  $("dqInput").placeholder=a1?"Your answer (update it)":"Your answer...";
}

$("dqSubmit").addEventListener("click",async()=>{
  const ans=$("dqInput").value.trim(); if(!ans) return;
  const today=new Date().toISOString().slice(0,10);
  const q=app.dailyQuestions.find(q=>q.date===today);
  try { await api("/api/dailyquestions",{method:"POST",body:JSON.stringify({question:q?.question||DAILY_QUESTIONS[0],answer:ans})}); showToast("Answer saved 💬"); } catch(e){showToast(e.message);}
});

$("nextQuestionBtn").addEventListener("click",()=>{
  const idx=Math.floor(Math.random()*DAILY_QUESTIONS.length);
  $("dqText").textContent=DAILY_QUESTIONS[idx];
});

function renderMemoryOfDay() {
  if(!app.memories.length) return;
  const old=app.memories.filter(m=>{ const d=Date.now()-new Date(m.date||m.createdAt).getTime(); return d>7*86400000; });
  if(!old.length) return;
  const m=old[Math.floor(Math.random()*old.length)];
  const days=Math.floor((Date.now()-new Date(m.date||m.createdAt).getTime())/86400000);
  const card=$("motdCard"); card.classList.remove("hidden");
  const img=m.attachments?.[0];
  $("motdBody").innerHTML=`<div class="motd-header">📸 A memory from ${days} days ago</div>${img&&img.type?.startsWith("image/")?`<img src="${esc(img.url)}" alt="" style="width:100%;border-radius:8px;max-height:160px;object-fit:cover;margin-bottom:8px">`:`<div style="font-size:32px;padding:16px;text-align:center">📸</div>`}<div class="motd-caption"><strong>${esc(m.title)}</strong>${m.caption?`<br>${esc(m.caption)}`:""}</div>`;
}

// ── MEMORIES ──────────────────────────────────────────────────
function renderMemories() {
  const c=$("memoriesContainer"); c.innerHTML="";
  const view=app.memoriesView;
  let items=app.memories;
  if(view==="favorites") items=items.filter(m=>m.favorited);
  if(!items.length){ c.innerHTML=`<div style="text-align:center;padding:40px;color:var(--text-muted)"><div style="font-size:48px;margin-bottom:12px">📸</div><p>No memories yet.<br>Add your first one!</p></div>`; return; }
  if(view==="grid") c.innerHTML=`<div class="mem-grid">${items.map(m=>buildMemGridItem(m)).join("")}</div>`;
  else if(view==="timeline") c.innerHTML=`<div class="mem-timeline">${items.map(m=>buildMemTimelineItem(m)).join("")}</div>`;
  else if(view==="polaroid") c.innerHTML=`<div class="mem-polaroid">${items.map(m=>buildPolaroid(m)).join("")}</div>`;
  else if(view==="favorites") c.innerHTML=`<div class="mem-favorites">${items.map(m=>buildMemFavCard(m)).join("")}</div>`;

  c.querySelectorAll("[data-mem-id]").forEach(el=>{
    el.addEventListener("click",()=>showMemoryDetail(el.dataset.memId));
  });
  c.querySelectorAll("[data-fav-id]").forEach(btn=>{
    btn.addEventListener("click",async e=>{ e.stopPropagation(); const id=btn.dataset.favId; const m=app.memories.find(x=>x.id===id); if(!m) return; try { await api(`/api/memories/${id}`,{method:"PATCH",body:JSON.stringify({favorited:!m.favorited})}); btn.textContent=m.favorited?"🤍":"❤️"; } catch(e){showToast(e.message);} });
  });
}

function buildMemGridItem(m) {
  const img=m.attachments?.find(a=>a.type?.startsWith("image/"));
  return `<div class="mem-grid-item" data-mem-id="${m.id}">${img?`<img src="${esc(img.url)}" alt="" loading="lazy">`:`<div class="mem-no-media">📸</div>`}<div class="mem-grid-overlay"><span class="mem-grid-title">${esc(m.title)}</span></div></div>`;
}
function buildMemTimelineItem(m) {
  const img=m.attachments?.find(a=>a.type?.startsWith("image/"));
  return `<div class="timeline-item"><div class="timeline-line-wrap"><div class="timeline-dot"></div><div class="timeline-line"></div></div><div class="timeline-content" data-mem-id="${m.id}">${img?`<img class="timeline-img" src="${esc(img.url)}" alt="" loading="lazy">`:""}
  <div class="timeline-date">${fmtDate(m.date||m.createdAt)}</div><div class="timeline-title">${esc(m.title)}</div><div class="timeline-caption">${esc(m.caption)}</div></div></div>`;
}
function buildPolaroid(m) {
  const img=m.attachments?.find(a=>a.type?.startsWith("image/"));
  return `<div class="polaroid-card" data-mem-id="${m.id}">${img?`<img class="polaroid-img" src="${esc(img.url)}" alt="" loading="lazy">`:`<div class="polaroid-no-img">📸</div>`}<div class="polaroid-caption">${esc(m.title)}</div></div>`;
}
function buildMemFavCard(m) {
  const img=m.attachments?.find(a=>a.type?.startsWith("image/"));
  return `<div class="mem-fav-card" data-mem-id="${m.id}">${img?`<img class="mem-fav-img" src="${esc(img.url)}" alt="" loading="lazy">`:`<div style="height:120px;background:var(--accent-light);display:flex;align-items:center;justify-content:center;font-size:32px">📸</div>`}<div class="mem-fav-body"><div class="mem-fav-title">${esc(m.title)}</div><div class="mem-fav-date">${fmtDate(m.date||m.createdAt)}</div></div></div>`;
}

function showMemoryDetail(id) {
  const m=app.memories.find(x=>x.id===id); if(!m) return;
  const img=m.attachments?.find(a=>a.type?.startsWith("image/"));
  const html=`<div style="padding:20px"><h3 style="font-size:18px;margin-bottom:8px;color:var(--text-primary)">${esc(m.title)}</h3>
  <div style="font-size:12px;color:var(--text-muted);margin-bottom:12px">${fmtDate(m.date||m.createdAt)}${m.location?` · 📍${esc(m.location)}`:""}</div>
  ${img?`<img src="${esc(img.url)}" style="width:100%;border-radius:12px;margin-bottom:12px;max-height:280px;object-fit:cover" alt="">`:""}
  ${m.caption?`<p style="font-size:14px;color:var(--text-secondary);margin-bottom:8px">${esc(m.caption)}</p>`:""}
  ${m.song?`<div style="font-size:13px;color:var(--text-muted)">🎵 ${esc(m.song)}</div>`:""}
  <div style="display:flex;gap:8px;margin-top:16px;flex-wrap:wrap">
    <button class="ghost-btn small" onclick="toggleMemFav('${m.id}')">${m.favorited?"💔 Unfavourite":"❤️ Favourite"}</button>
    <button class="danger-btn" style="font-size:12px;padding:6px 14px" onclick="deleteMem('${m.id}')">Delete</button>
  </div></div>`;
  openDetailModal("📸 Memory", html);
}
window.toggleMemFav=async id=>{ const m=app.memories.find(x=>x.id===id); if(!m) return; try { await api(`/api/memories/${id}`,{method:"PATCH",body:JSON.stringify({favorited:!m.favorited})}); closeModal("detailModal"); showToast(m.favorited?"Removed from favourites":"Added to favourites ❤️"); } catch(e){showToast(e.message);} };
window.deleteMem=async id=>{ if(!confirm("Delete this memory?")) return; try { await api(`/api/memories/${id}`,{method:"DELETE"}); closeModal("detailModal"); showToast("Memory deleted"); } catch(e){showToast(e.message);} };

$$(".seg-btn[data-memories-view]").forEach(b=>b.addEventListener("click",()=>{ app.memoriesView=b.dataset.memoriesView; $$(".seg-btn[data-memories-view]").forEach(x=>x.classList.toggle("active",x===b)); renderMemories(); }));

// Add memory
$("addMemoryBtn").addEventListener("click",()=>{ $("memDate").value=new Date().toISOString().slice(0,10); openModal("addMemoryModal"); });
$("memFileArea").addEventListener("click",()=>$("memFileInput").click());
$("memFileInput").addEventListener("change",async()=>{
  const files=[...$("memFileInput").files]; const preview=$("memFilePreview"); preview.innerHTML="";
  app._memFiles=[];
  for(const f of files){
    const reader=new FileReader();
    await new Promise(res=>{reader.onload=()=>{app._memFiles=app._memFiles||[]; app._memFiles.push({name:f.name,type:f.type,data:reader.result}); const img=document.createElement("img"); img.src=reader.result; img.className="preview-thumb"; preview.appendChild(img); res();};reader.readAsDataURL(f);});
  }
});
$("saveMemoryBtn").addEventListener("click",async()=>{
  const title=$("memTitle").value.trim(); if(!title){showToast("Add a title");return;}
  const body={title,date:$("memDate").value,location:$("memLocation").value,people:$("memPeople").value,song:$("memSong").value,caption:$("memCaption").value,note:$("memNote").value,attachments:app._memFiles||[]};
  try { await api("/api/memories",{method:"POST",body:JSON.stringify(body)}); closeModal("addMemoryModal"); app._memFiles=[]; $("memFilePreview").innerHTML=""; showToast("Memory saved 📸"); showConfetti(window.innerWidth/2,200); } catch(e){showToast(e.message);}
});

// ── LOVE TAB ──────────────────────────────────────────────────
function renderLove() {
  renderThinkingOfYou();
  renderOpenWhen();
  renderJournal();
  renderBucketList();
  renderSongs();
  renderMoodHistory();
  renderCompliments();
  renderLocations();
  renderTimeline();
}

function switchLoveSub(sub) {
  app.activeLoveSub=sub;
  $$(".love-sub").forEach(s=>s.classList.toggle("active",s.id==="love-"+sub));
  $$(".love-tab-btn").forEach(b=>b.classList.toggle("active",b.dataset.loveSub===sub));
}
$$(".love-tab-btn").forEach(b=>b.addEventListener("click",()=>switchLoveSub(b.dataset.loveSub)));

// ── THINKING OF YOU ──────────────────────────────────────────
function renderThinkingOfYou() {
  const list=$("loveNotesList");
  if(!app.loveNotes.length){list.innerHTML='<div style="color:var(--text-muted);font-size:13px;padding:8px">No love notes yet 💭</div>';return;}
  list.innerHTML=app.loveNotes.slice().reverse().slice(0,10).map(n=>{
    const from=n.fromUserId===app.me?.id?app.me:app.partner;
    return `<div class="love-note-item"><span class="ln-emoji">${esc(n.emoji)}</span><div class="ln-content"><div class="ln-msg">${esc(from?.displayName)} — "${esc(n.message)}"</div><div class="ln-meta">${fmtShort(n.createdAt)}</div></div></div>`;
  }).join("");
}

$$(".love-big-btn").forEach(btn=>{
  btn.addEventListener("click",async()=>{
    try {
      await api("/api/lovenotes",{method:"POST",body:JSON.stringify({type:btn.dataset.type,emoji:btn.dataset.emoji,message:btn.dataset.msg})});
      showToast(`${btn.dataset.emoji} Sent!`);
      btn.animate([{transform:"scale(1)"},{transform:"scale(1.3)"},{transform:"scale(1)"}],{duration:400});
    } catch(e){showToast(e.message);}
  });
});
$("sendCustomLove").addEventListener("click",async()=>{
  const msg=$("customLoveMsg").value.trim(); if(!msg){showToast("Write a message first");return;}
  try { await api("/api/lovenotes",{method:"POST",body:JSON.stringify({type:"custom",emoji:"💌",message:msg})}); $("customLoveMsg").value=""; showToast("💌 Sent!"); } catch(e){showToast(e.message);}
});

// ── OPEN WHEN ─────────────────────────────────────────────────
function renderOpenWhen() {
  const grid=$("openWhenGrid");
  const defaultLabels=["you're sad","you miss me","you need encouragement","you can't sleep","you're having a bad day","you need to smile","you want to feel loved","you're anxious"];
  const items=[...app.openWhen];
  if(!items.length && defaultLabels.length){
    grid.innerHTML=defaultLabels.map(l=>`<div class="ow-card empty"><div class="ow-envelope">💌</div><div class="ow-label">Open when ${esc(l)}</div><div class="ow-status">No letter yet</div></div>`).join(""); return;
  }
  grid.innerHTML=items.map(l=>{
    const now=new Date(); const locked=l.unlocksAt&&new Date(l.unlocksAt)>now;
    return `<div class="ow-card${locked?" locked":""}${l.opened?" opened":""}" data-ow-id="${l.id}">
      <div class="ow-envelope">${locked?"🔒":"💌"}</div>
      <div class="ow-label">${esc(l.label)}</div>
      <div class="ow-status">${locked?"Opens "+fmtDate(l.unlocksAt):l.opened?"Opened ✓":"Tap to open"}</div>
    </div>`;
  }).join("");
  grid.querySelectorAll(".ow-card[data-ow-id]").forEach(c=>{
    c.addEventListener("click",()=>openOwLetter(c.dataset.owId));
  });
}

async function openOwLetter(id) {
  const l=app.openWhen.find(x=>x.id===id); if(!l) return;
  if(l.unlocksAt&&new Date(l.unlocksAt)>new Date()){showToast("🔒 This letter isn't ready yet — "+fmtDate(l.unlocksAt));return;}
  try {
    const updated=await api(`/api/openwhen/${id}/open`,{method:"POST"});
    l.opened=true; l.openedAt=updated.openedAt;
    openDetailModal("💌 "+l.label, `<div style="padding:20px"><div style="font-size:32px;text-align:center;margin-bottom:16px;animation:popIn 0.5s ease">💌</div><p style="font-size:16px;line-height:1.7;color:var(--text-primary);white-space:pre-wrap">${esc(l.text)}</p><div style="text-align:center;margin-top:20px;font-size:22px;animation:heartPulse 1s infinite">❤️</div></div>`);
    renderOpenWhen();
  } catch(e){showToast(e.message);}
}

$("addOpenWhenBtn").addEventListener("click",()=>openModal("addOpenWhenModal"));
$("saveOpenWhenBtn").addEventListener("click",async()=>{
  const label=$("owLabel").value.trim(), text=$("owText").value.trim();
  if(!label||!text){showToast("Fill in both fields");return;}
  const body={label,text,unlocksAt:$("owUnlockDate").value||null};
  try { await api("/api/openwhen",{method:"POST",body:JSON.stringify(body)}); closeModal("addOpenWhenModal"); $("owLabel").value=""; $("owText").value=""; $("owUnlockDate").value=""; showToast("Letter created 💌"); } catch(e){showToast(e.message);}
});

// ── JOURNAL ───────────────────────────────────────────────────
const JOURNAL_PROMPTS=["Today I realised...","Something I'm grateful for...","Something I love about you...","Something I want us to do...","A moment this week that made me happy...","One thing I'm looking forward to...","What I wish you knew about me...","A dream I had about us...","Something that made me think of you today...","What our relationship means to me..."];

function renderJournal() {
  const idx=new Date().getDate()%JOURNAL_PROMPTS.length;
  $("journalPrompt").textContent=JOURNAL_PROMPTS[idx];
  const list=$("journalList");
  if(!app.journal.length){list.innerHTML='<div style="text-align:center;padding:40px;color:var(--text-muted)"><div style="font-size:40px">📖</div><p>No entries yet</p></div>';return;}
  const today=new Date().toISOString().slice(0,10);
  list.innerHTML=app.journal.map(e=>{
    const isMine=e.createdBy===app.me?.id;
    const name=isMine?app.me?.displayName:app.partner?.displayName;
    const locked=e.visibility==="locked"&&e.unlocksAt&&new Date(e.unlocksAt)>new Date();
    const private_=e.visibility==="private"&&!isMine;
    const text=locked?"🔒 Locked until "+fmtDate(e.unlocksAt):private_?"🔒 Private — not yet revealed":esc(e.text||"");
    const reactions=Object.entries(e.reactions||{}).filter(([,v])=>v.length>0).map(([k,v])=>`<button class="je-react-btn" data-jeid="${e.id}" data-emoji="${esc(k)}">${k} ${v.length}</button>`).join("");
    return `<div class="journal-entry"><div class="je-header"><div><div class="je-meta">${esc(name)} · ${fmtDate(e.createdAt)}</div>${e.title?`<div class="je-title">${esc(e.title)}</div>`:""}</div><span class="je-mood">${esc(e.mood||"")}</span></div><div class="je-text">${text}</div><div class="je-reactions">${reactions}<button class="je-react-btn" data-jeid="${e.id}" data-emoji="❤️">❤️</button><button class="je-react-btn" data-jeid="${e.id}" data-emoji="🥹">🥹</button><button class="je-react-btn" data-jeid="${e.id}" data-emoji="💕">💕</button></div></div>`;
  }).join("");
  list.querySelectorAll(".je-react-btn").forEach(b=>{
    b.addEventListener("click",async()=>{
      try { await api(`/api/journal/${b.dataset.jeid}/reactions`,{method:"POST",body:JSON.stringify({emoji:b.dataset.emoji})}); } catch(e){showToast(e.message);}
    });
  });
}

// Journal mood mini grid
const jeMoods=[{e:"😊",l:"Happy"},{e:"🥹",l:"Emotional"},{e:"😔",l:"Sad"},{e:"😌",l:"Calm"},{e:"🤩",l:"Excited"},{e:"😴",l:"Tired"},{e:"😤",l:"Frustrated"},{e:"❤️",l:"Loved"}];
$("jeMoodGrid").innerHTML=jeMoods.map(m=>`<button type="button" data-mood="${m.l}" title="${m.l}">${m.e}</button>`).join("");
$("jeMoodGrid").querySelectorAll("button").forEach(b=>{
  b.addEventListener("click",()=>{ app.selectedJeMood=b.dataset.mood; $$(".mood-mini-grid button").forEach(x=>x.classList.toggle("active",x===b)); });
});
document.querySelector('[name="jeVis"][value="locked"]')?.addEventListener("change",()=>$("jeUnlockDate").classList.remove("hidden"));
document.querySelector('[name="jeVis"][value="shared"]')?.addEventListener("change",()=>$("jeUnlockDate").classList.add("hidden"));
document.querySelector('[name="jeVis"][value="private"]')?.addEventListener("change",()=>$("jeUnlockDate").classList.add("hidden"));

$("addJournalBtn").addEventListener("click",()=>openModal("addJournalModal"));
$("saveJournalBtn").addEventListener("click",async()=>{
  const text=$("jeText").value.trim(); if(!text){showToast("Write something first");return;}
  const vis=document.querySelector('[name="jeVis"]:checked')?.value||"shared";
  const body={title:$("jeTitle").value,text,mood:app.selectedJeMood||"",visibility:vis,unlocksAt:$("jeUnlockDate").value||null};
  try { await api("/api/journal",{method:"POST",body:JSON.stringify(body)}); closeModal("addJournalModal"); $("jeTitle").value=""; $("jeText").value=""; app.selectedJeMood=null; showToast("Entry saved 📖"); } catch(e){showToast(e.message);}
});

// ── BUCKET LIST ───────────────────────────────────────────────
function renderBucketList() {
  const list=$("bucketList");
  const todo=app.bucketList.filter(i=>!i.completed);
  const done=app.bucketList.filter(i=>i.completed);
  const items=app.bucketView==="done"?done:todo;
  if(!items.length){list.innerHTML=`<div style="text-align:center;padding:40px;color:var(--text-muted)"><div style="font-size:40px">${app.bucketView==="done"?"🎉":"🌎"}</div><p>${app.bucketView==="done"?"Nothing completed yet — go make memories!":"Empty list — add your first dream!"}</p></div>`;return;}
  list.innerHTML=items.map(i=>`<div class="bucket-item${i.completed?" done":""}"><div class="bucket-check${i.completed?" checked":""}">✓</div><div class="bucket-item-content"><div class="bucket-item-text">${esc(i.text)}</div>${i.category?`<div class="bucket-item-cat">${esc(i.category)}</div>`:""} ${i.note?`<div class="bucket-item-note">${esc(i.note)}</div>`:""}</div><button class="bucket-del-btn" data-blid="${i.id}">🗑</button></div>`).join("");
  list.querySelectorAll(".bucket-check").forEach(c=>{
    const id=c.closest(".bucket-item")?.querySelector(".bucket-del-btn")?.dataset.blid;
    c.addEventListener("click",async()=>{
      const item=app.bucketList.find(i=>i.id===id); if(!item) return;
      try { await api(`/api/bucketlist/${id}`,{method:"PATCH",body:JSON.stringify({completed:!item.completed})}); if(!item.completed) showConfetti(window.innerWidth/2,window.innerHeight/2); } catch(e){showToast(e.message);}
    });
  });
  list.querySelectorAll(".bucket-del-btn").forEach(b=>{
    b.addEventListener("click",async()=>{ if(!confirm("Remove this item?")) return; try { await api(`/api/bucketlist/${b.dataset.blid}`,{method:"DELETE"}); showToast("Removed"); } catch(e){showToast(e.message);} });
  });
}
$$(".seg-btn[data-bucket-view]").forEach(b=>b.addEventListener("click",()=>{ app.bucketView=b.dataset.bucketView; $$(".seg-btn[data-bucket-view]").forEach(x=>x.classList.toggle("active",x===b)); renderBucketList(); }));
$("addBucketBtn").addEventListener("click",()=>openModal("addBucketModal"));
$("saveBucketBtn").addEventListener("click",async()=>{
  const text=$("blText").value.trim(); if(!text){showToast("Add a description");return;}
  try { await api("/api/bucketlist",{method:"POST",body:JSON.stringify({text,category:$("blCategory").value,note:$("blNote").value})}); closeModal("addBucketModal"); $("blText").value=""; $("blNote").value=""; showToast("Added to bucket list 🌎"); } catch(e){showToast(e.message);}
});

// ── SONGS ─────────────────────────────────────────────────────
const PLAYLISTS=["Our Songs","Late Night","Road Trips","Missing You","Fun Together"];
function renderSongs() {
  const active=app._activePl||"Our Songs";
  const tabs=$("playlistTabs");
  tabs.innerHTML=PLAYLISTS.map(p=>`<button class="seg-btn${p===active?" active":""}" data-pl="${esc(p)}">${esc(p)}</button>`).join("");
  tabs.querySelectorAll(".seg-btn").forEach(b=>b.addEventListener("click",()=>{ app._activePl=b.dataset.pl; renderSongs(); }));
  const items=app.songs.filter(s=>s.playlist===active||(!s.playlist&&active==="Our Songs"));
  const list=$("songsList");
  if(!items.length){list.innerHTML=`<div style="text-align:center;padding:40px;color:var(--text-muted)"><div style="font-size:40px">🎵</div><p>No songs in "${active}" yet</p></div>`;return;}
  list.innerHTML=items.map(s=>`<div class="song-item"><div class="song-disc">🎵</div><div class="song-info"><div class="song-title">${esc(s.title)}</div><div class="song-artist">${esc(s.artist)}</div>${s.note?`<div class="song-note">${esc(s.note)}</div>`:""}</div><div class="song-actions">${s.url?`<a class="song-link" href="${esc(s.url)}" target="_blank" rel="noreferrer" title="Open">▶</a>`:""}<button class="icon-btn" style="width:32px;height:32px;font-size:14px" data-sid="${s.id}">🗑</button></div></div>`).join("");
  list.querySelectorAll("[data-sid]").forEach(b=>b.addEventListener("click",async()=>{ if(!confirm("Remove song?")) return; try { await api(`/api/songs/${b.dataset.sid}`,{method:"DELETE"}); showToast("Removed"); } catch(e){showToast(e.message);} }));
}
$("addSongBtn").addEventListener("click",()=>openModal("addSongModal"));
$("saveSongBtn").addEventListener("click",async()=>{
  const title=$("songTitle").value.trim(); if(!title){showToast("Add a title");return;}
  try { await api("/api/songs",{method:"POST",body:JSON.stringify({title,artist:$("songArtist").value,playlist:$("songPlaylist").value,url:$("songUrl").value,note:$("songNote").value})}); closeModal("addSongModal"); $("songTitle").value=""; $("songArtist").value=""; $("songNote").value=""; $("songUrl").value=""; showToast("Song added 🎵"); } catch(e){showToast(e.message);}
});

// ── MOOD ──────────────────────────────────────────────────────
function renderMoodHistory() {
  const hist=$("moodHistory");
  const recent=app.moodEntries.slice().reverse().slice(0,20);
  if(!recent.length){hist.innerHTML='<div style="color:var(--text-muted);font-size:13px">No check-ins yet</div>';return;}
  hist.innerHTML=recent.map(e=>`<div class="mood-chip">${esc(e.emoji)} ${esc(e.mood)}<span style="font-size:10px;color:var(--text-muted);margin-left:4px">${fmtShort(e.createdAt)}</span></div>`).join("");
}

$$(".mood-btn").forEach(b=>{
  b.addEventListener("click",async()=>{
    app.selectedMood={mood:b.dataset.mood,emoji:b.dataset.emoji};
    $$(".mood-btn").forEach(x=>x.classList.toggle("selected",x===b));
    try {
      await api("/api/mood",{method:"POST",body:JSON.stringify({mood:b.dataset.mood,emoji:b.dataset.emoji,note:$("moodNote").value})});
      showToast(`${b.dataset.emoji} Mood logged`);
      $("moodNote").value=""; app.selectedMood=null;
      $$(".mood-btn").forEach(x=>x.classList.remove("selected"));
    } catch(e){showToast(e.message);}
  });
});

// ── COMPLIMENTS ───────────────────────────────────────────────
function renderCompliments() {
  const cat=app.compCat;
  const items=cat==="all"?app.compliments:app.compliments.filter(c=>c.category===cat);
  const list=$("complimentsList");
  if(!items.length){list.innerHTML='<div style="text-align:center;padding:40px;color:var(--text-muted)"><div style="font-size:40px">💬</div><p>Add your first compliment!</p></div>';return;}
  const catIcons={love:"❤️",appreciation:"🥹",funny:"😂",cute:"🌸",encouragement:"💪",flirty:"😘"};
  list.innerHTML=items.map(c=>`<div class="compliment-item"><span class="comp-cat-badge">${catIcons[c.category]||"💬"}</span><span class="comp-text">${esc(c.text)}</span><button class="comp-del" data-cid="${c.id}">🗑</button></div>`).join("");
  list.querySelectorAll(".comp-del").forEach(b=>b.addEventListener("click",async()=>{ try { await api(`/api/compliments/${b.dataset.cid}`,{method:"DELETE"}); showToast("Removed"); } catch(e){showToast(e.message);} }));
}
$$(".seg-btn[data-comp-cat]").forEach(b=>b.addEventListener("click",()=>{ app.compCat=b.dataset.compCat; $$(".seg-btn[data-comp-cat]").forEach(x=>x.classList.toggle("active",x===b)); renderCompliments(); }));
$("randomComplimentBtn").addEventListener("click",()=>{
  if(!app.compliments.length){showToast("Add some compliments first 💬");return;}
  const r=app.compliments[Math.floor(Math.random()*app.compliments.length)];
  $("complimentText").textContent=r.text;
  $("complimentDisplay").style.animation="none"; setTimeout(()=>$("complimentDisplay").style.animation="",10);
});
$("addComplimentBtn").addEventListener("click",()=>openModal("addComplimentModal"));
$("saveComplimentBtn").addEventListener("click",async()=>{
  const text=$("compText").value.trim(); if(!text){showToast("Write something first");return;}
  try { await api("/api/compliments",{method:"POST",body:JSON.stringify({text,category:$("compCategory").value})}); closeModal("addComplimentModal"); $("compText").value=""; showToast("Saved 💬"); } catch(e){showToast(e.message);}
});

// ── LOCATIONS / LOVE MAP ──────────────────────────────────────
function renderLocations() {
  const list=$("locationsList"), pins=$("mapPinsLayer");
  pins.innerHTML="";
  if(!app.locations.length){list.innerHTML='<div style="text-align:center;padding:40px;color:var(--text-muted)"><div style="font-size:40px">🗺️</div><p>Add your special places</p></div>';return;}
  const emojis={"First date":"💘","Where we met":"🤝","Favourite restaurant":"🍽️","First trip":"✈️","Favourite place":"🌟","Special event":"✨"};
  list.innerHTML=app.locations.map(l=>`<div class="location-item"><span class="loc-emoji">${emojis[l.label]||"📍"}</span><div class="loc-info"><div class="loc-name">${esc(l.name)}</div><div class="loc-label">${esc(l.label)}</div>${l.date?`<div class="loc-date">${fmtDate(l.date)}</div>`:""}</div><button class="loc-del" data-lid="${l.id}">🗑</button></div>`).join("");
  list.querySelectorAll(".loc-del").forEach(b=>b.addEventListener("click",async()=>{ if(!confirm("Remove place?")) return; try { await api(`/api/locations/${b.dataset.lid}`,{method:"DELETE"}); showToast("Removed"); } catch(e){showToast(e.message);} }));
  // Decorate map with pins
  app.locations.forEach((l,i)=>{
    const pin=document.createElement("div");
    pin.style.cssText=`position:absolute;left:${(i*17+10)%85}%;top:${(i*23+15)%70}%;font-size:20px;cursor:pointer;transform:translateX(-50%);animation:pulse 2s ${i*0.3}s infinite`;
    pin.textContent=emojis[l.label]||"📍"; pin.title=l.name;
    pin.addEventListener("click",()=>openDetailModal("📍 "+l.name,`<div style="padding:20px"><p style="color:var(--text-secondary);margin-bottom:8px">${esc(l.label)}</p>${l.date?`<p style="font-size:13px;color:var(--text-muted)">${fmtDate(l.date)}</p>`:""}<p style="margin-top:12px;font-size:14px;line-height:1.6;color:var(--text-primary)">${esc(l.description)}</p></div>`));
    pins.appendChild(pin);
  });
}
$("addLocationBtn").addEventListener("click",()=>{ $("locDate").value=new Date().toISOString().slice(0,10); openModal("addLocationModal"); });
$("saveLocationBtn").addEventListener("click",async()=>{
  const name=$("locName").value.trim(); if(!name){showToast("Add a place name");return;}
  try { await api("/api/locations",{method:"POST",body:JSON.stringify({name,label:$("locLabel").value,date:$("locDate").value,description:$("locDesc").value})}); closeModal("addLocationModal"); $("locName").value=""; $("locDesc").value=""; showToast("Place saved 📍"); } catch(e){showToast(e.message);}
});

// ── TIMELINE ──────────────────────────────────────────────────
function renderTimeline() {
  const container=$("timelineContainer");
  const ms=app.relationship?.milestones||[];
  if(!ms.length){container.innerHTML='<div style="text-align:center;padding:40px;color:var(--text-muted)"><div style="font-size:40px">⏳</div><p>Add your first milestone</p></div>';return;}
  const sorted=[...ms].sort((a,b)=>new Date(a.date)-new Date(b.date));
  container.innerHTML=`<div class="rel-timeline">${sorted.map(m=>`<div class="milestone-item"><div class="ms-dot-wrap"><div class="ms-dot">${esc(m.emoji)}</div></div><div class="ms-content"><div class="ms-date">${fmtDate(m.date)}</div><div class="ms-title">${esc(m.title)}</div>${m.description?`<div class="ms-desc">${esc(m.description)}</div>`:""}<button class="ms-del" data-msid="${m.id}" style="float:right;color:var(--text-muted);font-size:12px;margin-top:6px">×</button></div></div>`).join("")}</div>`;
  container.querySelectorAll(".ms-del").forEach(b=>{
    b.addEventListener("click",async()=>{ if(!confirm("Delete milestone?")) return; try { await api(`/api/milestones/${b.dataset.msid}`,{method:"DELETE"}); showToast("Deleted"); } catch(e){showToast(e.message);} });
  });
}
$("addMilestoneBtn").addEventListener("click",()=>{ $("msDate").value=new Date().toISOString().slice(0,10); openModal("addMilestoneModal"); });
$$(".emoji-sel-btn").forEach(b=>b.addEventListener("click",()=>{ app.selectedMilestoneEmoji=b.dataset.val; $$(".emoji-sel-btn").forEach(x=>x.classList.toggle("active",x===b)); }));
$("saveMilestoneBtn").addEventListener("click",async()=>{
  const title=$("msTitle").value.trim(); if(!title){showToast("Add a title");return;}
  try { await api("/api/milestones",{method:"POST",body:JSON.stringify({title,date:$("msDate").value,description:$("msDesc").value,emoji:app.selectedMilestoneEmoji||"💕"})}); closeModal("addMilestoneModal"); $("msTitle").value=""; $("msDesc").value=""; showToast("Milestone added ✨"); showConfetti(window.innerWidth/2,200); } catch(e){showToast(e.message);}
});

// ── SETTINGS ──────────────────────────────────────────────────
function renderSettings() {
  if (!app.me) return;
  $("profileAvatar").src=app.me.avatar||"";
  $("pDisplayName").value=app.me.displayName||"";
  $("pStatus").value=app.me.status||"";
  $("pBio").value=app.me.bio||"";
  $("pBirthday").value=app.me.birthday||"";
  $("pFavSong").value=app.me.favoriteSong||"";
  $("pFavFood").value=app.me.favoriteFood||"";
  $("pLoveLanguage").value=app.me.loveLanguage||"";
  $("pQuote").value=app.me.quote||"";
  if(app.relationship?.startDate) $("relStartDate").value=app.relationship.startDate.slice(0,10);
  $("sMyName").value=app.me.displayName||"";
  $("sPartnerName").value=app.partner?.displayName||"";
  $("setAppLock").checked=!!app.settings.appLockSetting;
  $("setScreenshotAlerts").checked=!!app.settings.screenshotAlerts;
  $("setHideMedia").checked=!!app.settings.hideMedia;
  $("setIncognito").checked=!!app.settings.incognitoTyping;
  $("setNotifications").checked=app.settings.notificationsEnabled!==false;
  $("setLoveNotifs").checked=app.settings.loveNotifications!==false;
  renderPartnerProfile();
}

function renderPartnerProfile() {
  const p=app.partner; if(!p) return;
  const card=$("partnerProfileCard");
  card.innerHTML=`<div class="partner-profile-view"><div class="pp-header"><img class="pp-avatar" src="${esc(p.avatar)}" alt=""><div><div class="pp-name">${esc(p.displayName)}</div><div class="pp-status">${esc(p.status||"")}</div></div></div><div class="pp-fields">${[["Bio",p.bio],["Birthday",p.birthday?fmtDate(p.birthday):""],["Favourite Song",p.favoriteSong],["Favourite Food",p.favoriteFood],["Love Language",p.loveLanguage],["Quote",p.quote]].filter(([,v])=>v).map(([k,v])=>`<div class="pp-field"><div class="pp-field-label">${k}</div><div class="pp-field-value">${esc(v)}</div></div>`).join("")}</div></div>`;
}

$("saveProfileBtn").addEventListener("click",async()=>{
  const body={displayName:$("pDisplayName").value,status:$("pStatus").value,bio:$("pBio").value,birthday:$("pBirthday").value,favoriteSong:$("pFavSong").value,favoriteFood:$("pFavFood").value,loveLanguage:$("pLoveLanguage").value,quote:$("pQuote").value};
  try { const u=await api("/api/profile",{method:"PATCH",body:JSON.stringify(body)}); Object.assign(app.me,u); renderSettings(); renderHeader(); showToast("Profile saved ✓"); } catch(e){showToast(e.message);}
});

$("editAvatarBtn").addEventListener("click",()=>$("avatarFileInput").click());
$("avatarFileInput").addEventListener("change",async()=>{
  const f=$("avatarFileInput").files[0]; if(!f) return;
  const reader=new FileReader();
  reader.onload=async()=>{
    try {
      const att={name:f.name,type:f.type,data:reader.result};
      const saved=await api("/api/messages",{method:"POST",body:JSON.stringify({text:"",attachments:[att]})}).then(m=>m.attachments?.[0]).catch(()=>null);
      if(saved?.url){ await api("/api/profile",{method:"PATCH",body:JSON.stringify({avatar:saved.url})}); app.me.avatar=saved.url; $("profileAvatar").src=saved.url; $("sidebarAvatar").src=saved.url; $("mhAvatar").src=saved.url; showToast("Avatar updated"); }
    } catch(e){showToast(e.message);}
  };
  reader.readAsDataURL(f);
});

$("saveRelSettingsBtn").addEventListener("click",async()=>{
  const d=$("relStartDate").value;
  if(d){ try { await api("/api/relationship",{method:"PATCH",body:JSON.stringify({startDate:d})}); app.relationship.startDate=d; } catch{} }
  showToast("Saved ✓");
});

["setAppLock","setScreenshotAlerts","setHideMedia","setIncognito","setNotifications","setLoveNotifs"].forEach(id=>{
  const el=$(id); if(!el) return;
  const keyMap={setAppLock:"appLockSetting",setScreenshotAlerts:"screenshotAlerts",setHideMedia:"hideMedia",setIncognito:"incognitoTyping",setNotifications:"notificationsEnabled",setLoveNotifs:"loveNotifications"};
  el.addEventListener("change",()=>{ app.settings[keyMap[id]]=el.checked; api("/api/settings",{method:"PATCH",body:JSON.stringify({[keyMap[id]]:el.checked})}).catch(()=>{}); });
});

$("passwordForm").addEventListener("submit",async e=>{
  e.preventDefault();
  const s=$("passwordStatus");
  try { await api("/api/password",{method:"POST",body:JSON.stringify({oldPassword:$("oldPassword").value,newPassword:$("newPassword").value})}); s.textContent="Password changed ✓"; s.className="status-msg ok"; $("passwordForm").reset(); } catch(err){s.textContent=err.message; s.className="status-msg err";}
});

$("exportBtn").addEventListener("click",()=>{ window.open("/api/export?token="+app.token); });
$("backupBtn").addEventListener("click",async()=>{ try { const r=await api("/api/backup",{method:"POST"}); showToast(r.message); } catch(e){showToast(e.message);} });
$("restoreBtn").addEventListener("click",async()=>{ if(!confirm("Restore latest backup? Current data will be replaced.")) return; try { const r=await api("/api/restore",{method:"POST"}); showToast(r.message); } catch(e){showToast(e.message);} });

// ── GAMES ─────────────────────────────────────────────────────
const GAMES={
  "know-me":{
    title:"How Well Do You Know Me?",
    questions:[
      {q:"What's my favourite food?",type:"text"},
      {q:"What's my biggest fear?",type:"text"},
      {q:"What was my dream job as a child?",type:"text"},
      {q:"What's my love language?",choices:["Words of Affirmation","Acts of Service","Receiving Gifts","Quality Time","Physical Touch"]},
      {q:"How do I like to relax?",type:"text"},
      {q:"What's my favourite movie genre?",choices:["Romance","Comedy","Action","Horror","Drama","Sci-Fi"]},
      {q:"What makes me laugh most?",type:"text"},
      {q:"What's my favourite season?",choices:["Spring 🌸","Summer ☀️","Autumn 🍂","Winter ❄️"]},
    ]
  },
  "this-or-that":{
    title:"This or That",
    pairs:[
      ["Beach 🏖️","Mountains 🏔️"],["Movie night 🎬","Dinner date 🍽️"],["Morning person 🌅","Night owl 🌙"],["Coffee ☕","Tea 🍵"],["City 🏙️","Countryside 🌿"],["Summer ☀️","Winter ❄️"],["Cook at home 🍳","Eat out 🍕"],["Dogs 🐶","Cats 🐱"],["Road trip 🚗","Fly ✈️"],["Dancing 💃","Singing 🎤"]
    ]
  },
  "would-you-rather":{
    title:"Would You Rather",
    pairs:[
      ["Travel the world for a year","Stay home but make it perfect"],["Always be 10 minutes early","Always be 10 minutes late"],["Have breakfast in Paris","Have dinner under the stars"],["Know all the answers","Never have to ask for directions"],["Live without music","Live without movies"],["Always feel sleepy","Always feel full"],["Have a personal chef","Have a personal driver"],["Kiss in the rain","Dance under stars"],["Spend a week at a beach resort","Spend a week in a mountain cabin"]
    ]
  },
  "truth-dare":{
    title:"Truth or Dare",
    truths:["What's your most embarrassing memory?","What's one thing you've never told me?","What was your first impression of me?","What's your biggest insecurity?","What do I do that makes you feel most loved?","What's the sweetest thing I've ever done for you?","If you could change one thing about our relationship, what would it be?","What's something you want us to try together?","What song reminds you of us and why?","What's a dream you've never told anyone?"],
    dares:["Send me a voice note saying something sweet","Do your best impression of me","Write me a 2-line poem right now","Tell me one thing you love about me without using the word 'love'","Send me your favourite photo of us","Call me and say only 'I miss you' then hang up","Draw a quick doodle for me and send it","Write me a message you'd put in a time capsule","Tell me your favourite memory of us in as much detail as you can"]
  },
  "emoji-guess":{
    title:"Emoji Guessing Game",
    rounds:[
      {emoji:"🌹🍷🌙✨",answer:"romantic evening"},
      {emoji:"🏖️☀️🍹👙",answer:"beach holiday"},
      {emoji:"🍕🎬🛋️❤️",answer:"movie night"},
      {emoji:"🚗🗺️🎵☕",answer:"road trip"},
      {emoji:"🌸💐🥂🎂",answer:"anniversary"},
      {emoji:"⛄❄️🔥🧦",answer:"cosy winter"},
      {emoji:"✈️🧳🗼🤩",answer:"travel adventure"},
      {emoji:"📚☕🕯️🌧️",answer:"rainy day reading"}
    ]
  }
};

let gameState={};

$$(".game-card button").forEach(btn=>{
  const card=btn.closest(".game-card");
  btn.addEventListener("click",()=>startGame(card.dataset.game));
});

function startGame(type) {
  const arena=$("gameArena"), body=$("gameArenaBody"), title=$("gameArenaTitle");
  const def=GAMES[type];
  if(type==="date-gen"){showDateGenerator();return;}
  if(!def){showToast("Coming soon!");return;}
  title.textContent=def.title;
  gameState={type,step:0,score:0};
  arena.classList.remove("hidden");
  renderGameStep(type);
}

$("closeGameArena").addEventListener("click",()=>{ $("gameArena").classList.add("hidden"); gameState={}; });

function renderGameStep(type) {
  const body=$("gameArenaBody");
  if(type==="know-me"){
    const q=GAMES[type].questions[gameState.step];
    if(!q){body.innerHTML=buildGameEnd();return;}
    const opts=q.choices?`<div class="game-options">${q.choices.map(c=>`<button class="game-option" onclick="selectKnowMeAnswer(this,'${esc(c)}')">${esc(c)}</button>`).join("")}</div>`:`<div style="padding:12px 0"><textarea id="knMeInput" rows="3" style="width:100%;border:1.5px solid var(--border-input);border-radius:var(--radius);padding:10px;font-size:14px;background:var(--bg-input);color:var(--text-primary)" placeholder="Your guess..."></textarea><button class="primary-btn" style="margin-top:8px;width:100%" onclick="submitKnowMe()">Submit</button></div>`;
    body.innerHTML=`<div class="game-question-card"><div class="game-q-label">Question ${gameState.step+1} of ${GAMES[type].questions.length}</div><div class="game-q-text">${esc(q.q)}</div>${opts}</div>`;
  } else if(type==="this-or-that"||type==="would-you-rather"){
    const pair=GAMES[type].pairs[gameState.step%GAMES[type].pairs.length];
    body.innerHTML=`<div class="game-question-card"><div class="game-q-label">${GAMES[type].title}</div><div class="game-q-text">${type==="would-you-rather"?"Would you rather...":""}</div><div class="vs-layout"><div class="vs-option" onclick="pickVs(this,0)"><div style="font-size:16px;line-height:1.4">${esc(pair[0])}</div></div><div style="display:flex;align-items:center;font-weight:800;color:var(--text-muted)">VS</div><div class="vs-option" onclick="pickVs(this,1)"><div style="font-size:16px;line-height:1.4">${esc(pair[1])}</div></div></div><button class="primary-btn game-next-btn hidden" id="vsNext" onclick="nextVs()">Next →</button></div>`;
  } else if(type==="truth-dare"){
    body.innerHTML=`<div class="game-question-card"><div class="game-q-text">What do you choose?</div><div class="vs-layout"><div class="vs-option" onclick="showTruthDare('truth')"><div style="font-size:32px">🤫</div><div class="vs-label">Truth</div></div><div class="vs-option" onclick="showTruthDare('dare')"><div style="font-size:32px">🔥</div><div class="vs-label">Dare</div></div></div></div>`;
  } else if(type==="emoji-guess"){
    const r=GAMES[type].rounds[gameState.step%GAMES[type].rounds.length];
    body.innerHTML=`<div class="game-question-card"><div class="game-q-label">Guess the phrase!</div><div class="game-q-text" style="font-size:40px;margin:20px 0">${r.emoji}</div><textarea id="emojiGuessInput" rows="2" style="width:100%;border:1.5px solid var(--border-input);border-radius:var(--radius);padding:10px;font-size:14px;background:var(--bg-input);color:var(--text-primary)" placeholder="What is this?"></textarea><button class="primary-btn" style="margin-top:8px;width:100%" onclick="submitEmojiGuess('${esc(r.answer)}')">Guess!</button></div>`;
  }
}

window.selectKnowMeAnswer=function(btn,val){
  $$(".game-option").forEach(b=>b.classList.remove("selected")); btn.classList.add("selected");
  setTimeout(()=>{ gameState.step++; renderGameStep("know-me"); },600);
};
window.submitKnowMe=function(){
  const v=document.getElementById("knMeInput")?.value?.trim(); if(!v){showToast("Write an answer first");return;}
  gameState.step++; renderGameStep("know-me");
};
window.pickVs=function(btn,idx){ const type=gameState.type; $$(".vs-option").forEach(b=>b.classList.remove("chosen")); btn.classList.add("chosen"); const nxt=document.getElementById("vsNext"); if(nxt) nxt.classList.remove("hidden"); };
window.nextVs=function(){ gameState.step++; const type=gameState.type; const pairs=GAMES[type].pairs; if(gameState.step>=pairs.length) { $("gameArenaBody").innerHTML=buildGameEnd(); } else renderGameStep(type); };
window.showTruthDare=function(pick){
  const def=GAMES["truth-dare"]; const arr=pick==="truth"?def.truths:def.dares; const item=arr[Math.floor(Math.random()*arr.length)];
  $("gameArenaBody").innerHTML=`<div class="game-question-card"><div class="game-q-label">${pick==="truth"?"🤫 Truth":"🔥 Dare"}</div><div class="game-q-text">${esc(item)}</div><button class="primary-btn game-next-btn" onclick="renderGameStep('truth-dare')">Next →</button></div>`;
};
window.submitEmojiGuess=function(answer){
  const inp=document.getElementById("emojiGuessInput"); if(!inp) return;
  const val=inp.value.trim().toLowerCase(); const correct=answer.toLowerCase();
  const match=val.includes(correct)||correct.includes(val);
  inp.style.borderColor=match?"var(--accent-2)":"#e53935";
  $("gameArenaBody").innerHTML+=`<div style="text-align:center;margin-top:12px;font-size:15px;color:${match?"var(--accent-2)":"#e53935"};font-weight:700">${match?"🎉 Correct! It was: "+answer:"❌ The answer was: "+answer}</div><button class="primary-btn" style="margin-top:12px;width:100%" onclick="nextEmojiRound()">Next →</button>`;
};
window.nextEmojiRound=function(){ gameState.step++; renderGameStep("emoji-guess"); };

function buildGameEnd() {
  return `<div class="game-question-card" style="text-align:center"><div style="font-size:48px;margin-bottom:12px">🎉</div><div class="game-q-text">That's a wrap!</div><p style="color:var(--text-secondary);font-size:14px">Thanks for playing together ❤️</p><button class="primary-btn" style="margin-top:16px" onclick="$('gameArena').classList.add('hidden')">Done</button></div>`;
}

// ── DATE GENERATOR ────────────────────────────────────────────
const DATE_IDEAS={
  "🏠 At home":["Cook a new recipe together 🍳","Have a board game night 🎲","Build a blanket fort and watch movies 🎬","Give each other massages 💆","Do a DIY craft project together 🎨","Have a picnic in the living room 🧺","Write letters to each other 💌","Learn a TikTok dance together 💃"],
  "🌎 Outdoors":["Watch the sunrise together 🌅","Go for a hike and bring a picnic 🏔️","Visit a farmers market 🌸","Stargaze somewhere quiet ⭐","Take a walk somewhere new 🚶","Find a waterfall to visit 💦","Go on a spontaneous drive 🚗","Watch the sunset at a special spot 🌇"],
  "🍿 Movie":["Watch all the films in a series 🎬","Pick each other's favourite movies 🎥","Watch a documentary about something new 🌍","Do a blind movie night — no looking up ratings","Re-watch your first movie together 🥹","Cinema trip for a film you both want to see"],
  "🍕 Food":["Try a restaurant you've never been to 🍽️","Cook a dish from another culture 🌏","Have a dessert-only evening 🧁","Do a blind taste test 😋","Order from 3 different restaurants and share","Make homemade pizza together 🍕"],
  "🎮 Games":["Play a co-op video game together 🎮","Do a puzzle race ⬛","Play 20 questions about yourselves","Try a virtual escape room online","Play the Fantasia games together 💕","Do a trivia night on a topic you love"],
  "💰 Budget-friendly":["Free museum or gallery day 🖼️","Pack a picnic to the park 🌿","Explore a neighbourhood you've never been to","Window shopping with a wish list 🛍️","Free outdoor concert or event 🎵","Cook the fanciest meal you can with what you have"],
  "✨ Special":["Book a surprise day trip","Recreate your first date ❤️","Commission a piece of art together","Write and seal a time capsule letter","Plan your dream holiday together — even if it's far off","Rent a cabin or Airbnb for a night 🌲"]
};

function showDateGenerator() {
  const arena=$("gameArena"), body=$("gameArenaBody"), title=$("gameArenaTitle");
  title.textContent="📅 Date Generator";
  arena.classList.remove("hidden");
  const cats=Object.keys(DATE_IDEAS);
  const saved=app.dateIdeas.filter(d=>d.saved);
  body.innerHTML=`<div class="date-gen-card">
    <p style="color:var(--text-secondary);font-size:14px;margin-bottom:12px">Pick a vibe or spin for anything!</p>
    <div class="date-category-grid">${cats.map(c=>`<button class="date-cat-btn" data-cat="${esc(c)}">${esc(c)}</button>`).join("")}</div>
    <button class="primary-btn" style="width:100%;margin-bottom:16px" id="spinDateBtn">🎲 Spin!</button>
    <div class="date-gen-result" id="dateGenResult">Press Spin!</div>
    <button class="ghost-btn" style="width:100%;margin-top:8px" id="saveDateBtn">💾 Save this idea</button>
    <div class="saved-dates-list">${saved.length?`<p style="font-size:12px;color:var(--text-muted);font-weight:600;margin-bottom:8px">SAVED IDEAS</p>${saved.map(d=>`<div class="saved-date-item${d.completed?" done":""}"><button onclick="toggleDateDone('${d.id}')" style="font-size:16px">${d.completed?"✅":"⬜"}</button><span>${esc(d.title)}</span></div>`).join("")}`:""}</div>
  </div>`;

  body.querySelectorAll(".date-cat-btn").forEach(b=>{
    b.addEventListener("click",()=>{ body.querySelectorAll(".date-cat-btn").forEach(x=>x.classList.remove("active")); b.classList.add("active"); app.selectedDateCat=b.dataset.cat; });
  });
  document.getElementById("spinDateBtn").addEventListener("click",()=>{
    const cat=app.selectedDateCat||cats[Math.floor(Math.random()*cats.length)];
    const ideas=DATE_IDEAS[cat]; const idea=ideas[Math.floor(Math.random()*ideas.length)];
    app._currentDateIdea={title:idea,category:cat};
    document.getElementById("dateGenResult").textContent=idea;
  });
  document.getElementById("saveDateBtn").addEventListener("click",async()=>{
    if(!app._currentDateIdea){showToast("Spin first!");return;}
    try { await api("/api/dateideas",{method:"POST",body:JSON.stringify(app._currentDateIdea)}); showToast("Saved 💾"); showDateGenerator(); } catch(e){showToast(e.message);}
  });
}

window.toggleDateDone=async function(id){
  const idea=app.dateIdeas.find(d=>d.id===id); if(!idea) return;
  try { await api(`/api/dateideas/${id}`,{method:"PATCH",body:JSON.stringify({completed:!idea.completed})}); if(!idea.completed) showConfetti(window.innerWidth/2,window.innerHeight/2); } catch(e){showToast(e.message);}
};

// ── DETAIL MODAL (generic) ────────────────────────────────────
function openDetailModal(title, html) {
  let modal=document.getElementById("detailModal");
  if(!modal){
    modal=document.createElement("div");
    modal.id="detailModal"; modal.className="modal-overlay";
    modal.innerHTML=`<div class="modal"><div class="modal-header"><h3 id="detailModalTitle"></h3><button class="modal-close" data-modal="detailModal">✕</button></div><div class="modal-body" id="detailModalBody" style="padding:0"></div></div>`;
    document.body.appendChild(modal);
    modal.querySelector(".modal-close").addEventListener("click",()=>closeModal("detailModal"));
    modal.addEventListener("click",e=>{ if(e.target===modal) closeModal("detailModal"); });
  }
  document.getElementById("detailModalTitle").textContent=title;
  document.getElementById("detailModalBody").innerHTML=html;
  openModal("detailModal");
}

// ── SEED DATA ─────────────────────────────────────────────────
function loadSeedData() {
  if(app.compliments.length===0) {
    const defaults=["You make ordinary days feel special.","Your smile is my favourite thing in the world.","Being with you feels like home.","You're the reason I look forward to every day.","You make everything better just by being you.","I love the way you laugh.","You're my favourite person, always.","Life is so much sweeter with you in it."];
    defaults.forEach(text=>api("/api/compliments",{method:"POST",body:JSON.stringify({text,category:"love"})}).catch(()=>{}));
  }
  if((app.relationship?.milestones||[]).length===0 && app.relationship?.startDate) {
    const defaults=[{title:"We met",emoji:"💕",date:app.relationship.startDate,description:"The beginning of everything."},{title:"Became official",emoji:"❤️",date:app.relationship.startDate,description:"When we made it official."}];
    defaults.forEach(m=>api("/api/milestones",{method:"POST",body:JSON.stringify(m)}).catch(()=>{}));
  }
}

// ── INIT ──────────────────────────────────────────────────────
applyTheme(app.theme);
if (app.token) {
  boot();
} else {
  setLoading(false);
}
