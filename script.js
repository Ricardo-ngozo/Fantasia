// ============================================================
// chirp — Twitter timeline clone
// Manual feature: Dark mode toggle (no AI assistance)
// Cursor feature 1: Tweet compose modal
// Cursor feature 2: Explore page w/ live search + category filter
// ============================================================

const tweets = [
  {
    id: 1,
    name: "Naledi Khumalo",
    handle: "@naledi_dev",
    time: "2h",
    text: "Just shipped dark mode on my side project at 1am. The toggle works. I do not. ☕",
    likes: 142, retweets: 18, replies: 9,
    img: null
  },
  {
    id: 2,
    name: "Zaio",
    handle: "@zaio_io",
    time: "4h",
    text: "Reminder: ship the #project before you polish it forever. Done beats perfect, every cohort, every time.",
    likes: 980, retweets: 210, replies: 44,
    img: null
  },
  {
    id: 3,
    name: "Thabo Mokoena",
    handle: "@thabo_builds",
    time: "5h",
    text: "Built my first #JavaScript modal from scratch today. Cursor suggested a div inside a div inside a div. I suggested touching grass instead.",
    likes: 320, retweets: 41, replies: 22,
    img: "https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=800&q=60"
  },
  {
    id: 4,
    name: "Amahle Dlamini",
    handle: "@amahle.codes",
    time: "7h",
    text: "Responsive design checklist:\n– test on 4K\n– test on your cousin's 2017 Android\n– cry a little\n– fix the flexbox\n– repeat",
    likes: 540, retweets: 88, replies: 31,
    img: null
  },
  {
    id: 5,
    name: "Sipho Ndlovu",
    handle: "@sipho_n",
    time: "9h",
    text: "Loom videos under 5 minutes are basically a speedrun category now. #DevLife",
    likes: 76, retweets: 5, replies: 3,
    img: null
  },
  {
    id: 6,
    name: "Refilwe Tau",
    handle: "@refi_ui",
    time: "11h",
    text: "Deployed to Netlify, the link works, the images load, and I only screamed twice. Solid Tuesday. #Netlify #deployed",
    likes: 412, retweets: 29, replies: 14,
    img: "https://images.unsplash.com/photo-1551033406-611cf9a28f67?w=800&q=60"
  }
];

const trends = [
  { cat: "Technology · Trending", name: "#JavaScript", count: "84.2K chirps", tag: "tech" },
  { cat: "Trending in South Africa", name: "#LoadShedding", count: "61.5K chirps", tag: "news" },
  { cat: "Sport · Trending", name: "Bafana Bafana", count: "33.8K chirps", tag: "sport" },
  { cat: "Music · Trending", name: "#Amapiano", count: "120K chirps", tag: "music" },
  { cat: "Technology · Trending", name: "#Netlify", count: "9,302 chirps", tag: "tech" },
  { cat: "Trending", name: "#CursorAI", count: "27.1K chirps", tag: "tech" },
  { cat: "Sport", name: "#RugbyChampionship", count: "18.4K chirps", tag: "sport" },
  { cat: "Music", name: "Black Coffee", count: "14.7K chirps", tag: "music" },
  { cat: "Trending", name: "#LoomVideo", count: "2,108 chirps", tag: "news" }
];

const peopleToFollow = [
  { name: "Cursor", handle: "@cursor_ai", img: "https://i.pravatar.cc/48?img=33" },
  { name: "Zaio", handle: "@zaio_io", img: "https://i.pravatar.cc/48?img=5" },
  { name: "Netlify", handle: "@netlify", img: "https://i.pravatar.cc/48?img=8" }
];

let likedSet = new Set();
let retweetedSet = new Set();
let userTweetCount = 0;

// ---------- ICONS ----------
const ICONS = {
  reply: `<svg viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="2" d="M21 12c0 4.4-4 8-9 8-1.4 0-2.7-.3-3.9-.8L3 20l1.1-4.3C3.4 14.4 3 13.2 3 12c0-4.4 4-8 9-8s9 3.6 9 8z"/></svg>`,
  retweet: `<svg viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="2" d="M17 1l4 4-4 4M3 11V9a4 4 0 014-4h14M7 23l-4-4 4-4M21 13v2a4 4 0 01-4 4H3"/></svg>`,
  like: `<svg viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="2" d="M12 21s-7.5-4.9-10-9.5C.5 7.8 2.6 4 6.3 4c2 0 3.6 1.1 4.5 2.5C11.7 5.1 13.3 4 15.3 4 19 4 21.1 7.8 20.6 11.5 18.1 16.1 12 21 12 21z"/></svg>`,
  likeFilled: `<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 21s-7.5-4.9-10-9.5C.5 7.8 2.6 4 6.3 4c2 0 3.6 1.1 4.5 2.5C11.7 5.1 13.3 4 15.3 4 19 4 21.1 7.8 20.6 11.5 18.1 16.1 12 21 12 21z"/></svg>`,
  share: `<svg viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="2" d="M12 16V4M7 8l5-5 5 5M5 14v5a1 1 0 001 1h12a1 1 0 001-1v-5"/></svg>`
};

function escapeHtml(str){
  return str.replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
function linkify(text){
  return escapeHtml(text).replace(/#(\w+)/g, '<span class="tag">#$1</span>');
}
function fmt(n){
  return n >= 1000 ? (n/1000).toFixed(1).replace(/\.0$/,'') + "K" : n;
}

function tweetTemplate(t){
  const liked = likedSet.has(t.id);
  const retweeted = retweetedSet.has(t.id);
  return `
  <article class="tweet" data-id="${t.id}">
    <img class="avatar" src="${t.avatar || `https://i.pravatar.cc/48?u=${t.id}`}" alt="">
    <div class="tweet-body">
      <div class="tweet-meta">
        <strong>${escapeHtml(t.name)}</strong>
        <span class="handle">${t.handle}</span>
        <span class="dot">·</span>
        <span class="time">${t.time}</span>
      </div>
      <div class="tweet-text">${linkify(t.text)}</div>
      ${t.img ? `<img class="tweet-img" src="${t.img}" alt="" loading="lazy">` : ""}
      <div class="tweet-actions">
        <button class="reply-btn">${ICONS.reply}<span>${fmt(t.replies)}</span></button>
        <button class="retweet-btn ${retweeted ? 'retweeted':''}">${ICONS.retweet}<span>${fmt(t.retweets + (retweeted?1:0))}</span></button>
        <button class="like-btn ${liked ? 'liked':''}">${liked ? ICONS.likeFilled : ICONS.like}<span>${fmt(t.likes + (liked?1:0))}</span></button>
        <button class="share-btn">${ICONS.share}</button>
      </div>
    </div>
  </article>`;
}

function renderFeed(){
  const feed = document.getElementById('feed');
  feed.innerHTML = tweets.map(tweetTemplate).join('');
}

// ---------- TWEET INTERACTIONS ----------
document.getElementById('feed').addEventListener('click', (e) => {
  const article = e.target.closest('.tweet');
  if(!article) return;
  const id = Number(article.dataset.id);
  const tweet = tweets.find(t => t.id === id);

  if(e.target.closest('.like-btn')){
    likedSet.has(id) ? likedSet.delete(id) : likedSet.add(id);
    article.outerHTML = tweetTemplate(tweet);
  } else if(e.target.closest('.retweet-btn')){
    if(retweetedSet.has(id)){
      retweetedSet.delete(id);
    } else {
      retweetedSet.add(id);
      showToast("Chirped to your followers ✦");
    }
    article.outerHTML = tweetTemplate(tweet);
  } else if(e.target.closest('.reply-btn')){
    openComposeModal();
  } else if(e.target.closest('.share-btn')){
    showToast("Link copied ✦");
  }
});

// ---------- TOAST ----------
let toastTimer;
function showToast(msg){
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.add('hidden'), 2400);
}

// ---------- DARK MODE (MANUAL FEATURE, NO AI) ----------
const themeToggle = document.getElementById('themeToggle');
const sunIcon = themeToggle.querySelector('.icon-sun');
const moonIcon = themeToggle.querySelector('.icon-moon');
const toggleLabel = themeToggle.querySelector('.toggle-label');

function applyTheme(theme){
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('chirp-theme', theme);
  const isDark = theme === 'dark';
  sunIcon.hidden = isDark;
  moonIcon.hidden = !isDark;
  toggleLabel.textContent = isDark ? 'Light mode' : 'Dark mode';
  themeToggle.setAttribute('aria-pressed', String(isDark));
}

(function initTheme(){
  const saved = localStorage.getItem('chirp-theme');
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  applyTheme(saved || (prefersDark ? 'dark' : 'light'));
})();

themeToggle.addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme');
  applyTheme(current === 'dark' ? 'light' : 'dark');
});

// ---------- VIEW NAVIGATION ----------
const navLinks = document.querySelectorAll('[data-nav]');
function setView(name){
  document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
  const target = document.getElementById(`view-${name}`);
  if(target) target.classList.remove('hidden');
  else document.getElementById('view-home').classList.remove('hidden'); // fallback for unbuilt views

  document.querySelectorAll('.nav-item[data-nav], .mnav-item[data-nav]').forEach(el => {
    el.classList.toggle('active', el.dataset.nav === name);
  });
}
navLinks.forEach(link => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    setView(link.dataset.nav);
  });
});

// ---------- INLINE COMPOSER (home) ----------
const inlineText = document.getElementById('inlineComposeText');
const inlinePostBtn = document.getElementById('inlinePostBtn');
inlineText.addEventListener('input', () => {
  inlinePostBtn.disabled = inlineText.value.trim().length === 0;
});
inlinePostBtn.addEventListener('click', () => postNewTweet(inlineText.value));

function postNewTweet(text){
  text = text.trim();
  if(!text) return;
  userTweetCount++;
  tweets.unshift({
    id: 'u' + Date.now(),
    name: "Lerato M.",
    handle: "@lerato_codes",
    time: "now",
    text,
    likes: 0, retweets: 0, replies: 0,
    img: null,
    avatar: "https://i.pravatar.cc/48?img=12"
  });
  renderFeed();
  inlineText.value = '';
  inlinePostBtn.disabled = true;
  closeComposeModal();
  document.getElementById('modalComposeText').value = '';
  showToast("Your chirp was sent ✦");
  window.scrollTo({top:0, behavior:'smooth'});
}

// ---------- COMPOSE MODAL (CURSOR FEATURE 1) ----------
const overlay = document.getElementById('composeModalOverlay');
const modalText = document.getElementById('modalComposeText');
const modalPostBtn = document.getElementById('modalPostBtn');
const charCount = document.getElementById('charCount');

function openComposeModal(){
  overlay.classList.remove('hidden');
  modalText.focus();
  document.body.style.overflow = 'hidden';
}
function closeComposeModal(){
  overlay.classList.add('hidden');
  document.body.style.overflow = '';
}

document.getElementById('openComposeModal').addEventListener('click', openComposeModal);
document.getElementById('mobileComposeBtn').addEventListener('click', openComposeModal);
document.getElementById('closeComposeModal').addEventListener('click', closeComposeModal);
overlay.addEventListener('click', (e) => { if(e.target === overlay) closeComposeModal(); });
document.addEventListener('keydown', (e) => {
  if(e.key === 'Escape' && !overlay.classList.contains('hidden')) closeComposeModal();
});

modalText.addEventListener('input', () => {
  const remaining = 280 - modalText.value.length;
  charCount.textContent = remaining;
  charCount.style.color = remaining < 20 ? 'var(--danger)' : 'var(--text-faint)';
  modalPostBtn.disabled = modalText.value.trim().length === 0;
});
modalPostBtn.addEventListener('click', () => postNewTweet(modalText.value));

// ---------- EXPLORE PAGE (CURSOR FEATURE 2) ----------
function trendItemTemplate(t){
  return `<div class="trend-item" data-tag="${t.tag}">
    <span class="trend-cat">${t.cat}</span>
    <span class="trend-name">${t.name}</span>
    <span class="trend-count">${t.count}</span>
  </div>`;
}

function renderTrends(filter = 'all', query = ''){
  const list = document.getElementById('trendsList');
  const q = query.trim().toLowerCase();
  const filtered = trends.filter(t => {
    const catMatch = filter === 'all' || t.tag === filter;
    const qMatch = !q || t.name.toLowerCase().includes(q) || t.cat.toLowerCase().includes(q);
    return catMatch && qMatch;
  });
  list.innerHTML = filtered.length
    ? filtered.map(trendItemTemplate).join('')
    : `<div class="trend-item"><span class="trend-name">No chirps found</span><span class="trend-count">Try a different search or category.</span></div>`;
}

function renderSidePanels(){
  document.getElementById('trendsPanel').innerHTML = trends.slice(0,5).map(t =>
    `<div class="trend-item" data-tag="${t.tag}">
      <span class="trend-cat">${t.cat}</span>
      <span class="trend-name">${t.name}</span>
      <span class="trend-count">${t.count}</span>
    </div>`
  ).join('');

  document.getElementById('followPanel').innerHTML = peopleToFollow.map((p,i) =>
    `<div class="follow-item" data-idx="${i}">
      <img class="avatar" src="${p.img}" alt="">
      <div class="follow-meta"><strong>${p.name}</strong><span>${p.handle}</span></div>
      <button class="follow-btn">Follow</button>
    </div>`
  ).join('');
}

document.getElementById('followPanel').addEventListener('click', (e) => {
  const btn = e.target.closest('.follow-btn');
  if(!btn) return;
  const following = btn.classList.toggle('following');
  btn.textContent = following ? 'Following' : 'Follow';
});

let activeCat = 'all';
document.querySelectorAll('.explore-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.explore-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    activeCat = tab.dataset.cat;
    renderTrends(activeCat, document.getElementById('exploreSearch').value);
  });
});
document.getElementById('exploreSearch').addEventListener('input', (e) => {
  renderTrends(activeCat, e.target.value);
});

// ---------- INIT ----------
renderFeed();
renderTrends();
renderSidePanels();