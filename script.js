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
  const emojis=["❤️","💕","💗","💖","💝","🌸","✨"];
  for (let i=0;i<12;i++) {
    const h=document.createElement("div"); h.className="floating-heart";
    h.textContent=emojis[Math.floor(Math.random()*emojis.length)];
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
  const titles={chat:"Fantasia",us:"Our World ❤️",memories:"Memories",play:"Play Together",love:"Love",settings:"Settings"};
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
  try { await api("/api/relationship",{method:"PATCH",body:JSON.stringify({startDate:v})}); app.relationship.startDate=v; closeModal("setRelDateModal"); renderCounter(); showToast("Start date saved ❤️"); } catch(e){showToast(e.message);}
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
  list.innerHTML=html||`<div style="text-align:center;padding:40px;color:var(--text-muted);font-size:14px">No messages yet. Say hello! 👋</div>`;

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
