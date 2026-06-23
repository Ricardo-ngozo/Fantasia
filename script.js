// X clone | base+Cursor(media+follow)+manual polls | all in <400 lines main, total<500
const tweets = [
  {id:1,name:"Naledi Khumalo",handle:"@naledi_dev",time:"2h",text:"Just shipped dark mode on my side project at 1am. The toggle works. I do not. ☕",likes:142,retweets:18,replies:9,img:null},
  {id:2,name:"Zaio",handle:"@zaio_io",time:"4h",text:"Reminder: ship the #project before you polish it forever. Done beats perfect.",likes:980,retweets:210,replies:44,img:null},
  {id:3,name:"Thabo Mokoena",handle:"@thabo_builds",time:"5h",text:"Built my first #JavaScript modal from scratch today. Cursor helped a bit. I touched grass after.",likes:320,retweets:41,replies:22,img:"https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=800&q=60"},
  {id:4,name:"Amahle Dlamini",handle:"@amahle.codes",time:"7h",text:"Responsive checklist: test on 4K, test on 2017 Android, fix flex, repeat.",likes:540,retweets:88,replies:31,img:null}
];
const trends = [
  {cat:"Technology · Trending",name:"#JavaScript",count:"84.2K posts",tag:"tech"},
  {cat:"Trending in South Africa",name:"#LoadShedding",count:"61.5K posts",tag:"news"},
  {cat:"Sport · Trending",name:"Bafana Bafana",count:"33.8K posts",tag:"sport"},
  {cat:"Technology · Trending",name:"#Netlify",count:"9.3K posts",tag:"tech"},
  {cat:"Trending",name:"#CursorAI",count:"27.1K posts",tag:"tech"}
];
const peopleToFollow = [
  {name:"Cursor",handle:"@cursor_ai",img:"https://i.pravatar.cc/48?img=33"},
  {name:"Zaio",handle:"@zaio_io",img:"https://i.pravatar.cc/48?img=5"},
  {name:"Netlify",handle:"@netlify",img:"https://i.pravatar.cc/48?img=8"}
];
let likedSet = new Set(), retweetedSet = new Set(), followed = new Set(), bookmarked = new Set(), userPollVotes = {};
let currentUser = {name:"Samukelo Ricardo Ngozo",handle:"@samukelo",avatar:"https://i.pravatar.cc/48?img=28",bio:"Fullstack web developer | Learning at Zaio",location:"Johannesburg, South Africa",website:"samukelo.dev",joined:"March 2024"};
const STORAGE_KEY = 'chirp_tweets_v1', LIKES_KEY='chirp_likes_v1', RTS_KEY='chirp_rts_v1', POLL_KEY='chirp_pollvotes_v1', FOL_KEY='chirp_followed_v1', BM_KEY='chirp_bookmarks_v1', USER_KEY='chirp_current_user_v1';

function loadFromStorage() {
  try {
    const st = localStorage.getItem(STORAGE_KEY); if (st) { const p=JSON.parse(st); if (Array.isArray(p)&&p.length){ tweets.length=0; tweets.push(...p); } }
    const sl=localStorage.getItem(LIKES_KEY); if(sl) likedSet=new Set(JSON.parse(sl));
    const sr=localStorage.getItem(RTS_KEY); if(sr) retweetedSet=new Set(JSON.parse(sr));
    const sf=localStorage.getItem(FOL_KEY); if(sf) followed=new Set(JSON.parse(sf));
    const sb=localStorage.getItem(BM_KEY); if(sb) bookmarked=new Set(JSON.parse(sb));
    const su=localStorage.getItem(USER_KEY); if(su) currentUser={...currentUser,...JSON.parse(su)};
    const sp=localStorage.getItem(POLL_KEY); if(sp) userPollVotes=JSON.parse(sp)||{};
  } catch(e){}
}
function saveToStorage() {
  try {
    localStorage.setItem(STORAGE_KEY,JSON.stringify(tweets));
    localStorage.setItem(LIKES_KEY,JSON.stringify([...likedSet]));
    localStorage.setItem(RTS_KEY,JSON.stringify([...retweetedSet]));
    localStorage.setItem(FOL_KEY,JSON.stringify([...followed]));
    localStorage.setItem(BM_KEY,JSON.stringify([...bookmarked]));
    localStorage.setItem(USER_KEY,JSON.stringify(currentUser));
    localStorage.setItem(POLL_KEY,JSON.stringify(userPollVotes));
  } catch(e){}
}
function updateProfileUI() {
  const ids=['sidebarName','sidebarHandle','sidebarAvatar','profileName','profileHandle','profileBio','profileLocation','profileWebsite','profileJoinDate','profileAvatar'];
  const vals=[currentUser.name,currentUser.handle,currentUser.avatar,currentUser.name,currentUser.handle,currentUser.bio,currentUser.location,currentUser.website,currentUser.joined,currentUser.avatar.replace('/48?','/120?')];
  ids.forEach((id,i)=>{const el=document.getElementById(id); if(!el) return; if(id.includes('Avatar')) el.src=vals[i]; else if(id==='profileWebsite'){ el.textContent=vals[i]; el.href=vals[i].startsWith('http')?vals[i]:'https://'+vals[i]; } else el.textContent=vals[i];});
}

const ICONS = {
  reply:`<svg viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="2" d="M21 12c0 4.4-4 8-9 8-1.4 0-2.7-.3-3.9-.8L3 20l1.1-4.3C3.4 14.4 3 13.2 3 12c0-4.4 4-8 9-8s9 3.6 9 8z"/></svg>`,
  retweet:`<svg viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="2" d="M17 1l4 4-4 4M3 11V9a4 4 0 014-4h14M7 23l-4-4 4-4M21 13v2a4 4 0 01-4 4H3"/></svg>`,
  like:`<svg viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="2" d="M12 21s-7.5-4.9-10-9.5C.5 7.8 2.6 4 6.3 4c2 0 3.6 1.1 4.5 2.5C11.7 5.1 13.3 4 15.3 4 19 4 21.1 7.8 20.6 11.5 18.1 16.1 12 21 12 21z"/></svg>`,
  likeFilled:`<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 21s-7.5-4.9-10-9.5C.5 7.8 2.6 4 6.3 4c2 0 3.6 1.1 4.5 2.5C11.7 5.1 13.3 4 15.3 4 19 4 21.1 7.8 20.6 11.5 18.1 16.1 12 21 12 21z"/></svg>`,
  share:`<svg viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="2" d="M12 16V4M7 8l5-5 5 5M5 14v5a1 1 0 001 1h12a1 1 0 001-1v-5"/></svg>`,
  bookmark:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/></svg>`,
  bookmarkFilled:`<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/></svg>`
};
function escapeHtml(s){return s.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function linkify(t){return escapeHtml(t).replace(/#(\w+)/g,'<span class="tag">#$1</span>');}
function fmt(n){return n>=1000?(n/1000).toFixed(1).replace(/\.0$/,'')+'K':n;}

let pendingInlinePoll=null, pendingModalPoll=null;
function createPollFor(source){
  const q = prompt('Poll question (your manual feature)?');
  if(!q) return;
  const os = prompt('2-4 options, comma sep:','Yes,No,Maybe');
  if(!os) return;
  const opts = os.split(',').map(x=>x.trim()).filter(Boolean).slice(0,4);
  if(opts.length<2){alert('Need 2+ options');return;}
  const p = {question:q, options:opts, votes:opts.map(()=>0)};
  if(source==='inline') pendingInlinePoll = p; else pendingModalPoll = p;
  showToast('Poll attached 📊 Post to share it!');
}

function tweetTemplate(t){
  const liked=likedSet.has(t.id), rt=retweetedSet.has(t.id), bm=bookmarked.has(t.id);
  let phtml='';
  if(t.poll && t.poll.options){
    const vi = userPollVotes[t.id];
    phtml = `<div class="poll"><div class="poll-q">${escapeHtml(t.poll.question)}</div>` +
      t.poll.options.map((o,i)=>`<button class="poll-opt${vi===i?' voted':''}" data-pid="${t.id}" data-oi="${i}">${escapeHtml(o)}<span class="pv">${t.poll.votes[i]||0}</span></button>`).join('') + `</div>`;
  }
  return `<article class="tweet" data-id="${t.id}">
    <img class="avatar" src="${t.avatar||'https://i.pravatar.cc/48?u='+t.id}" alt="">
    <div class="tweet-body">
      <div class="tweet-meta"><strong>${escapeHtml(t.name)}</strong> <span class="handle">${t.handle}</span> <span class="dot">·</span> <span class="time">${t.time}</span></div>
      <div class="tweet-text">${linkify(t.text)}</div>
      ${t.img?`<img class="tweet-img" src="${t.img}" alt="" loading="lazy">`:''}
      ${phtml}
      <div class="tweet-actions">
        <button class="reply-btn">${ICONS.reply}<span>${fmt(t.replies||0)}</span></button>
        <button class="retweet-btn ${rt?'retweeted':''}">${ICONS.retweet}<span>${fmt((t.retweets||0)+(rt?1:0))}</span></button>
        <button class="like-btn ${liked?'liked':''}">${liked?ICONS.likeFilled:ICONS.like}<span>${fmt((t.likes||0)+(liked?1:0))}</span></button>
        <button class="share-btn">${ICONS.share}</button>
        <button class="bookmark-btn">${bm?ICONS.bookmarkFilled:ICONS.bookmark}</button>
      </div>
    </div>
  </article>`;
}

let homeTab = 'foryou';
function renderFeed(){
  const feed = document.getElementById('feed');
  let list = tweets;
  if(homeTab==='following') list = tweets.filter(t => followed.has(t.handle) || t.handle===currentUser.handle);
  feed.innerHTML = list.map(tweetTemplate).join('');
}
function renderBookmarks(){
  const c = document.getElementById('bookmarksFeed'); if(!c) return;
  const f = tweets.filter(t=>bookmarked.has(t.id));
  c.innerHTML = f.length ? f.map(tweetTemplate).join('') : '<div class="empty-note">No bookmarks yet. Tap bookmark on posts.</div>';
}

// Document delegation: fixes feed + bookmarks + explore results interactions
document.addEventListener('click', e => {
  const art = e.target.closest('.tweet'); if(!art) return;
  const raw = art.dataset.id; const tw = tweets.find(x => String(x.id) === String(raw)); if(!tw) return;
  const id = tw.id;
  if(e.target.closest('.like-btn')){
    likedSet.has(id)?likedSet.delete(id):likedSet.add(id);
    art.outerHTML = tweetTemplate(tw); saveToStorage();
  } else if(e.target.closest('.retweet-btn')){
    if(retweetedSet.has(id)) retweetedSet.delete(id); else { retweetedSet.add(id); showToast('Reposted to followers ✦'); }
    art.outerHTML = tweetTemplate(tw); saveToStorage();
  } else if(e.target.closest('.reply-btn')){
    tw.replies = (tw.replies||0)+1; art.outerHTML=tweetTemplate(tw); saveToStorage();
    openComposeModal(); setTimeout(()=>{ const f=document.getElementById('modalText')||document.getElementById('inlineText'); if(f){f.value='@'+tw.handle+' '; f.focus(); f.selectionStart=f.selectionEnd=f.value.length;} },40);
  } else if(e.target.closest('.share-btn')){ showToast('Link copied ✦'); }
  else if(e.target.closest('.bookmark-btn')){
    if(bookmarked.has(id)) bookmarked.delete(id); else {bookmarked.add(id); showToast('Added to Bookmarks');}
    art.outerHTML = tweetTemplate(tw); saveToStorage();
  } else if(e.target.closest('.poll-opt')){
    const po = e.target.closest('.poll-opt'); const pid=po.dataset.pid, oi=+po.dataset.oi;
    const pt = tweets.find(x=>String(x.id)===String(pid)); if(!pt||!pt.poll||userPollVotes[pid]!=null) return;
    pt.poll.votes[oi]=(pt.poll.votes[oi]||0)+1; userPollVotes[pid]=oi;
    art.outerHTML = tweetTemplate(pt); saveToStorage();
  }
});

let toastT; function showToast(m){ const t=document.getElementById('toast'); t.textContent=m; t.classList.remove('hidden'); clearTimeout(toastT); toastT=setTimeout(()=>t.classList.add('hidden'),2300); }

function setView(n){
  document.querySelectorAll('.view').forEach(v=>v.classList.add('hidden'));
  let tgt = document.getElementById('view-'+n);
  if(!tgt){
    // stub unsupported views (lists/messages/more) gracefully
    tgt = document.getElementById('view-home');
    const main = document.getElementById('mainContent');
    if(main && n!=='home'){ main.dataset.stub = n; }
  }
  tgt.classList.remove('hidden');
  document.querySelectorAll('.nav-item[data-view],.mobile-nav a[data-view]').forEach(el=>el.classList.toggle('active',el.dataset.view===n));
  if(n==='bookmarks') renderBookmarks();
}
document.querySelectorAll('.nav-item[data-view], .mobile-nav a[data-view]').forEach(l=>l.addEventListener('click',e=>{e.preventDefault(); if(l.dataset.view) setView(l.dataset.view);}));
setView('home');

const inlineText=document.getElementById('inlineText'), inlinePostBtn=document.getElementById('inlinePostBtn'), inlineChar=document.getElementById('inlineCharCount');
if(inlineText&&inlinePostBtn){
  inlineText.addEventListener('input',()=>{ const r=280-inlineText.value.length; if(inlineChar){inlineChar.textContent=r; inlineChar.style.color=r<20?'var(--danger)':'var(--text-faint)';} inlinePostBtn.disabled=!inlineText.value.trim(); if(!inlineText.value.trim()) pendingInlinePoll=null; });
  inlinePostBtn.addEventListener('click',()=>postNewTweet(inlineText.value,'inline'));
}
const inlinePollBtn=document.getElementById('inlinePollBtn'), modalPollBtn=document.getElementById('modalPollBtn');
if(inlinePollBtn) inlinePollBtn.addEventListener('click',()=>createPollFor('inline'));
if(modalPollBtn) modalPollBtn.addEventListener('click',()=>createPollFor('modal'));

// Media (Cursor)
let inlineImg=null, modalImg=null;
function setupImg(btnId,inId,preId,cb){
  const b=document.getElementById(btnId), inp=document.getElementById(inId), pre=document.getElementById(preId); if(!b||!inp||!pre)return;
  b.addEventListener('click',()=>inp.click());
  inp.addEventListener('change',()=>{ const f=inp.files&&inp.files[0]; if(!f||!f.type.startsWith('image/')){inp.value='';return;} const r=new FileReader(); r.onload=e=>{cb(e.target.result,pre);}; r.readAsDataURL(f); inp.value=''; });
}
function setPre(el,du,clr){ el.innerHTML=`<img class="image-preview" src="${du}" alt=""><button class="remove-image-btn">✕</button>`; el.querySelector('.remove-image-btn').addEventListener('click',()=>{el.innerHTML='';clr();}); }
setupImg('inlineImageBtn','inlineFileInput','inlineImagePreview',(d,p)=>{inlineImg=d; setPre(p,d,()=>{inlineImg=null;});});
setupImg('modalImageBtn','modalFileInput','modalImagePreview',(d,p)=>{modalImg=d; setPre(p,d,()=>{modalImg=null;});});
function getImg(s){return s==='inline'?inlineImg:modalImg;}
function clrImg(s){ if(s==='inline'){inlineImg=null; const p=document.getElementById('inlineImagePreview'); if(p)p.innerHTML='';} else {modalImg=null; const p=document.getElementById('modalImagePreview'); if(p)p.innerHTML='';} }

function postNewTweet(txt,src='inline'){
  txt=(txt||'').trim(); if(!txt) return;
  const img = getImg(src); const poll = src==='inline'?pendingInlinePoll:pendingModalPoll;
  tweets.unshift({id:'u'+Date.now(), name:currentUser.name, handle:currentUser.handle, time:'now', text:txt, likes:0,retweets:0,replies:0, img:img||null, avatar:currentUser.avatar, poll:poll||null });
  renderFeed();
  if(src==='inline'){
    if(inlineText) inlineText.value=''; if(inlinePostBtn) inlinePostBtn.disabled=true; clrImg('inline'); pendingInlinePoll=null;
  } else {
    const mt=document.getElementById('modalText'); if(mt)mt.value=''; const mp=document.getElementById('modalPostBtn'); if(mp)mp.disabled=true; const cc=document.getElementById('charCount'); if(cc)cc.textContent='280'; clrImg('modal'); pendingModalPoll=null; closeComposeModal();
  }
  saveToStorage(); showToast('Posted ✦'); window.scrollTo({top:0,behavior:'smooth'});
}

// Modal compose
const overlay=document.getElementById('modalOverlay'), modalText=document.getElementById('modalText'), modalPost=document.getElementById('modalPostBtn'), ccEl=document.getElementById('charCount'), closeM=document.getElementById('closeModal'), openC=document.getElementById('openCompose');
function openComposeModal(){ if(overlay){overlay.classList.remove('hidden'); if(modalText)modalText.focus(); document.body.style.overflow='hidden';} }
function closeComposeModal(){ if(overlay){overlay.classList.add('hidden'); document.body.style.overflow=''; pendingModalPoll=null;} }
if(openC) openC.addEventListener('click',openComposeModal);
if(closeM) closeM.addEventListener('click',closeComposeModal);
if(overlay) overlay.addEventListener('click',e=>{if(e.target===overlay)closeComposeModal();});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&overlay&&!overlay.classList.contains('hidden'))closeComposeModal();});
if(modalText&&modalPost&&ccEl){
  modalText.addEventListener('input',()=>{ const r=280-modalText.value.length; ccEl.textContent=r; ccEl.style.color=r<20?'var(--danger)':'var(--text-faint)'; modalPost.disabled=!modalText.value.trim(); if(!modalText.value.trim()) pendingModalPoll=null; });
  modalPost.addEventListener('click',()=>postNewTweet(modalText.value,'modal'));
}

// Right sidebar (trends + follows)
function renderRightSidebar(){
  const te=document.getElementById('trends'), fe=document.getElementById('followList');
  if(te) te.innerHTML=trends.slice(0,5).map(t=>`<div class="trend-item" data-tag="${t.tag}"><span class="trend-cat">${t.cat}</span><span class="trend-name">${t.name}</span><span class="trend-count">${t.count}</span></div>`).join('');
  if(fe) fe.innerHTML=peopleToFollow.map((p,i)=>`<div class="follow-item" data-idx="${i}"><img class="avatar" src="${p.img}" alt=""><div class="follow-meta"><strong>${p.name}</strong><span>${p.handle}</span></div><button class="follow-btn ${followed.has(p.handle)?'following':''}">${followed.has(p.handle)?'Following':'Follow'}</button></div>`).join('');
}
const flEl=document.getElementById('followList');
if(flEl) flEl.addEventListener('click',e=>{
  const btn=e.target.closest('.follow-btn'); if(!btn)return;
  const it=btn.closest('.follow-item'); const h=it?peopleToFollow[+it.dataset.idx].handle:null; if(!h)return;
  followed.has(h)?followed.delete(h):followed.add(h);
  btn.classList.toggle('following',followed.has(h)); btn.textContent=followed.has(h)?'Following':'Follow';
  saveToStorage(); if(homeTab==='following') renderFeed();
});

// Home tabs
document.querySelectorAll('.home-tab').forEach(tab=>{
  tab.addEventListener('click',()=>{
    document.querySelectorAll('.home-tab').forEach(t=>{t.classList.remove('active'); t.style.color='var(--text-dim)'; t.style.borderBottom='';});
    tab.classList.add('active'); tab.style.color='var(--text)'; tab.style.borderBottom='2px solid var(--accent)';
    homeTab=tab.dataset.tab; renderFeed();
  });
});

// Init
function initApp(){
  loadFromStorage(); updateProfileUI(); renderFeed(); renderRightSidebar();
  if(followed.size===0){ followed.add('@zaio_io'); followed.add('@naledi_dev'); renderRightSidebar(); }
  const hv=document.getElementById('view-home'); if(hv) hv.classList.remove('hidden');
  setView('home');
}
initApp();
