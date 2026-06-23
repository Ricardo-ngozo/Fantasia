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

const STORAGE_KEY = 'chirp_tweets_v1';
const LIKES_KEY = 'chirp_likes_v1';
const RTS_KEY = 'chirp_rts_v1';

function loadFromStorage() {
  try {
    const savedTweets = localStorage.getItem(STORAGE_KEY);
    if (savedTweets) {
      const parsed = JSON.parse(savedTweets);
      if (Array.isArray(parsed) && parsed.length) {
        // Merge: keep seed but put user posts first or append user ones
        // For simplicity: replace with saved if present (includes seeds at first save)
        tweets.length = 0;
        tweets.push(...parsed);
      }
    }
    const savedLikes = localStorage.getItem(LIKES_KEY);
    if (savedLikes) likedSet = new Set(JSON.parse(savedLikes));
    const savedRts = localStorage.getItem(RTS_KEY);
    if (savedRts) retweetedSet = new Set(JSON.parse(savedRts));
  } catch (e) { /* ignore bad storage */ }
}

function saveToStorage() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tweets));
    localStorage.setItem(LIKES_KEY, JSON.stringify(Array.from(likedSet)));
    localStorage.setItem(RTS_KEY, JSON.stringify(Array.from(retweetedSet)));
  } catch (e) {}
}

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
    saveToStorage();
  } else if(e.target.closest('.retweet-btn')){
    if(retweetedSet.has(id)){
      retweetedSet.delete(id);
    } else {
      retweetedSet.add(id);
      showToast("Chirped to your followers ✦");
    }
    article.outerHTML = tweetTemplate(tweet);
    saveToStorage();
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

// ---------- DARK MODE (safe stub — real toggle button will be added in polish phase) ----------
// Current HTML does not include #themeToggle yet. Guarded to prevent crash.
// Student can implement full dark mode toggle manually later if chosen as the 15-mark feature.
(function initThemeSafe(){
  const saved = localStorage.getItem('chirp-theme');
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const theme = saved || (prefersDark ? 'dark' : 'light');
  document.documentElement.setAttribute('data-theme', theme);
  // TODO for manual feature or polish: add visible toggle button in .sidebar and wire full applyTheme + icons
})();

// ---------- VIEW NAVIGATION (matches current HTML data-view) ----------
function setView(name){
  document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
  const target = document.getElementById(`view-${name}`);
  if (target) {
    target.classList.remove('hidden');
  } else {
    const home = document.getElementById('view-home');
    if (home) home.classList.remove('hidden');
  }

  // Left nav + mobile nav
  document.querySelectorAll('.nav-item[data-view], .mobile-nav a[data-view]').forEach(el => {
    el.classList.toggle('active', el.dataset.view === name);
  });
}

// Wire nav links that exist in HTML (data-view)
document.querySelectorAll('.nav-item[data-view], .mobile-nav a[data-view]').forEach(link => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    const view = link.dataset.view;
    if (view) setView(view);
  });
});

// Make sure Home is visible on load
setView('home');

// ---------- INLINE COMPOSER (home) - matches HTML ids: inlineText, inlinePostBtn, openCompose ----------
const inlineText = document.getElementById('inlineText');
const inlinePostBtn = document.getElementById('inlinePostBtn');
const openComposeBtn = document.getElementById('openCompose');

const inlineCharCount = document.getElementById('inlineCharCount');

if (inlineText && inlinePostBtn) {
  inlineText.addEventListener('input', () => {
    const len = inlineText.value.length;
    const remaining = 280 - len;
    if (inlineCharCount) {
      inlineCharCount.textContent = remaining;
      inlineCharCount.style.color = remaining < 20 ? 'var(--danger)' : 'var(--text-faint)';
    }
    inlinePostBtn.disabled = inlineText.value.trim().length === 0;
  });
  inlinePostBtn.addEventListener('click', () => postNewTweet(inlineText.value, 'inline'));
}

// ---------- MEDIA ATTACHMENTS (AI Feature 1) ----------
// Supports single image per post for simplicity (easy to extend to array)
// Preview + remove for both inline and modal. Uses dataURL for demo (no server).

let inlineSelectedImage = null;   // dataURL or null
let modalSelectedImage = null;

function setupImageUpload(btnId, inputId, previewId, onSelect) {
  const btn = document.getElementById(btnId);
  const input = document.getElementById(inputId);
  const preview = document.getElementById(previewId);
  if (!btn || !input || !preview) return;

  btn.addEventListener('click', () => input.click());

  input.addEventListener('change', () => {
    const file = input.files && input.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('Please choose an image file');
      input.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      onSelect(e.target.result, preview);
    };
    reader.readAsDataURL(file);
    input.value = ''; // allow same file again later
  });
}

function setPreview(previewEl, dataUrl, clearFn) {
  previewEl.innerHTML = `
    <img class="image-preview" src="${dataUrl}" alt="preview">
    <button class="remove-image-btn" title="Remove image">✕</button>
  `;
  const removeBtn = previewEl.querySelector('.remove-image-btn');
  removeBtn.addEventListener('click', () => {
    previewEl.innerHTML = '';
    clearFn();
  });
}

function clearInlineImage() {
  inlineSelectedImage = null;
}
function clearModalImage() {
  modalSelectedImage = null;
}

// Wire inline
const inlinePreview = document.getElementById('inlineImagePreview');
setupImageUpload('inlineImageBtn', 'inlineFileInput', 'inlineImagePreview', (dataUrl, previewEl) => {
  inlineSelectedImage = dataUrl;
  setPreview(previewEl, dataUrl, () => { inlineSelectedImage = null; });
});

// Wire modal (HTML already has the preview container)
const modalPreview = document.getElementById('modalImagePreview');
setupImageUpload('modalImageBtn', 'modalFileInput', 'modalImagePreview', (dataUrl, previewEl) => {
  modalSelectedImage = dataUrl;
  setPreview(previewEl, dataUrl, () => { modalSelectedImage = null; });
});

function getCurrentImageFor(source) {
  return source === 'inline' ? inlineSelectedImage : modalSelectedImage;
}

function clearImageFor(source) {
  if (source === 'inline') {
    inlineSelectedImage = null;
    if (inlinePreview) inlinePreview.innerHTML = '';
  } else {
    modalSelectedImage = null;
    if (modalPreview) modalPreview.innerHTML = '';
  }
}

function postNewTweet(text, source = 'inline'){
  text = text.trim();
  if(!text) return;

  userTweetCount++;
  const attachedImg = getCurrentImageFor(source);

  tweets.unshift({
    id: 'u' + Date.now(),
    name: "Lerato M.",
    handle: "@lerato_codes",
    time: "now",
    text,
    likes: 0, retweets: 0, replies: 0,
    img: attachedImg || null,
    avatar: "https://i.pravatar.cc/48?img=12"
  });

  renderFeed();

  // Clear text + image for source
  if (source === 'inline' && inlineText) {
    inlineText.value = '';
    if (inlinePostBtn) inlinePostBtn.disabled = true;
    clearImageFor('inline');
  } else {
    const modalT = document.getElementById('modalText');
    if (modalT) modalT.value = '';
    const modalBtn = document.getElementById('modalPostBtn');
    if (modalBtn) modalBtn.disabled = true;
    const countEl = document.getElementById('charCount');
    if (countEl) countEl.textContent = '280';
    clearImageFor('modal');
  }

  // Only close modal if it was the source
  if (source !== 'inline') {
    closeComposeModal();
  }

  saveToStorage();
  showToast("Your chirp was sent ✦");
  window.scrollTo({top:0, behavior:'smooth'});
}

// ---------- COMPOSE MODAL (matches current HTML: modalOverlay, modalText, modalPostBtn, charCount, openCompose) ----------
const overlay = document.getElementById('modalOverlay');
const modalText = document.getElementById('modalText');
const modalPostBtn = document.getElementById('modalPostBtn');
const charCount = document.getElementById('charCount');
const closeModalBtn = document.getElementById('closeModal');

function openComposeModal(){
  if (!overlay) return;
  overlay.classList.remove('hidden');
  if (modalText) modalText.focus();
  document.body.style.overflow = 'hidden';
}
function closeComposeModal(){
  if (!overlay) return;
  overlay.classList.add('hidden');
  document.body.style.overflow = '';
}

// Wire existing buttons from HTML
if (openComposeBtn) {
  openComposeBtn.addEventListener('click', openComposeModal);
}
if (closeModalBtn) {
  closeModalBtn.addEventListener('click', closeComposeModal);
}
if (overlay) {
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeComposeModal(); });
}
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && overlay && !overlay.classList.contains('hidden')) closeComposeModal();
});

if (modalText && modalPostBtn && charCount) {
  modalText.addEventListener('input', () => {
    const remaining = 280 - modalText.value.length;
    charCount.textContent = remaining;
    charCount.style.color = remaining < 20 ? 'var(--danger)' : 'var(--text-faint)';
    modalPostBtn.disabled = modalText.value.trim().length === 0;
  });
  modalPostBtn.addEventListener('click', () => postNewTweet(modalText.value, 'modal'));
}

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

function renderRightSidebar(){
  // HTML has #trends and #followList
  const trendsEl = document.getElementById('trends');
  const followEl = document.getElementById('followList');

  if (trendsEl) {
    trendsEl.innerHTML = trends.slice(0, 5).map(t =>
      `<div class="trend-item" data-tag="${t.tag}">
        <span class="trend-cat">${t.cat}</span>
        <span class="trend-name">${t.name}</span>
        <span class="trend-count">${t.count}</span>
      </div>`
    ).join('');
  }

  if (followEl) {
    followEl.innerHTML = peopleToFollow.map((p, i) =>
      `<div class="follow-item" data-idx="${i}">
        <img class="avatar" src="${p.img}" alt="">
        <div class="follow-meta"><strong>${p.name}</strong><span>${p.handle}</span></div>
        <button class="follow-btn">Follow</button>
      </div>`
    ).join('');
  }
}

const followListEl = document.getElementById('followList');
if (followListEl) {
  followListEl.addEventListener('click', (e) => {
    const btn = e.target.closest('.follow-btn');
    if (!btn) return;
    const following = btn.classList.toggle('following');
    btn.textContent = following ? 'Following' : 'Follow';
  });
}

// ---------- EXPLORE (adapt to HTML: data-filter, #exploreSearch, #exploreResults) ----------
let activeFilter = 'all';

function renderExploreResults(filter = 'all', query = '') {
  const container = document.getElementById('exploreResults');
  if (!container) return;

  const q = query.trim().toLowerCase();
  const filtered = trends.filter(t => {
    const catMatch = filter === 'all' || t.tag === filter;
    const qMatch = !q || t.name.toLowerCase().includes(q) || t.cat.toLowerCase().includes(q);
    return catMatch && qMatch;
  });

  container.innerHTML = filtered.length
    ? filtered.map(t => `
        <div class="trend-item" data-tag="${t.tag}">
          <span class="trend-cat">${t.cat}</span>
          <span class="trend-name">${t.name}</span>
          <span class="trend-count">${t.count}</span>
        </div>
      `).join('')
    : `<div class="trend-item"><span class="trend-name">No results</span><span class="trend-count">Try a different search or tab.</span></div>`;
}

// Wire explore tabs (HTML uses data-filter) and search
document.querySelectorAll('.explore-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.explore-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    activeFilter = tab.dataset.filter || 'all';
    const searchInput = document.getElementById('exploreSearch');
    renderExploreResults(activeFilter, searchInput ? searchInput.value : '');
  });
});

const exploreSearch = document.getElementById('exploreSearch');
if (exploreSearch) {
  exploreSearch.addEventListener('input', (e) => {
    renderExploreResults(activeFilter, e.target.value);
  });
}

// Initial render of explore (will show when view switched or on load)
function initExplore() {
  renderExploreResults('all', '');
}

// ---------- INIT (safe) ----------
function initApp() {
  loadFromStorage();
  renderFeed();
  renderRightSidebar();
  initExplore();

  // Show home by default
  const homeView = document.getElementById('view-home');
  if (homeView) homeView.classList.remove('hidden');
}

initApp();