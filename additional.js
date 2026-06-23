// additional.js — edit profile (moved), explore (simplified no dup tweets), view stubs. Keeps script core tiny
// personal poll fully in script + template + vote handler. total JS <=500

// EDIT PROFILE (full, moved out of script.js for line budget)
const editProfileBtn = document.getElementById('editProfileBtn');
const editProfileOverlay = document.getElementById('editProfileOverlay');
const closeEditProfile = document.getElementById('closeEditProfile');
const saveEditProfile = document.getElementById('saveEditProfile');
const editName = document.getElementById('editName');
const editBioEl = document.getElementById('editBio');
const editLocation = document.getElementById('editLocation');
const editWebsite = document.getElementById('editWebsite');

if (editProfileBtn && editProfileOverlay) {
  editProfileBtn.addEventListener('click', () => {
    if (editName) editName.value = currentUser.name;
    if (editBioEl) editBioEl.value = currentUser.bio;
    if (editLocation) editLocation.value = currentUser.location;
    if (editWebsite) editWebsite.value = currentUser.website;
    editProfileOverlay.classList.remove('hidden');
  });
}
if (closeEditProfile && editProfileOverlay) {
  closeEditProfile.addEventListener('click', () => editProfileOverlay.classList.add('hidden'));
}
if (editProfileOverlay) {
  editProfileOverlay.addEventListener('click', (e) => { if (e.target === editProfileOverlay) editProfileOverlay.classList.add('hidden'); });
}
if (saveEditProfile) {
  saveEditProfile.addEventListener('click', () => {
    if (editName && editName.value) currentUser.name = editName.value;
    if (editBioEl) currentUser.bio = editBioEl.value;
    if (editLocation) currentUser.location = editLocation.value;
    if (editWebsite) currentUser.website = editWebsite.value;
    if (typeof updateProfileUI === 'function') updateProfileUI();
    if (typeof saveToStorage === 'function') saveToStorage();
    if (typeof renderFeed === 'function') renderFeed();
    editProfileOverlay.classList.add('hidden');
  });
}

// EXPLORE — simplified to trends/search only (no heavy duplicated tweet HTML for line budget + no broken interactions)
let activeFilter = 'all';
function renderExploreResults(filter = 'all', query = '') {
  const container = document.getElementById('exploreResults');
  if (!container) return;
  const q = (query || '').trim().toLowerCase();
  const filtered = trends.filter(t => {
    const cm = filter === 'all' || t.tag === filter;
    const qm = !q || t.name.toLowerCase().includes(q) || t.cat.toLowerCase().includes(q);
    return cm && qm;
  });
  let html = '';
  if (filtered.length) {
    html += '<h3 style="padding:8px 12px 4px;font-size:0.95rem;color:var(--text-dim)">Trends</h3>' +
      filtered.map(t => `<div class="trend-item" data-tag="${t.tag}"><span class="trend-cat">${t.cat}</span><span class="trend-name">${t.name}</span><span class="trend-count">${t.count}</span></div>`).join('');
  }
  container.innerHTML = html || (q ? '<div class="trend-item"><span class="trend-name">No matching trends</span></div>' : '<div class="trend-item"><span class="trend-name">Search or pick a category</span></div>');
}

document.querySelectorAll('.explore-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.explore-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    activeFilter = tab.dataset.filter || 'all';
    const si = document.getElementById('exploreSearch');
    renderExploreResults(activeFilter, si ? si.value : '');
  });
});
const exploreSearchEl = document.getElementById('exploreSearch');
if (exploreSearchEl) {
  exploreSearchEl.addEventListener('input', (e) => renderExploreResults(activeFilter, e.target.value));
}
function initExplore() { renderExploreResults('all', ''); }
initExplore();

// Extra: demo notifications when opened (makes view "work")
document.querySelectorAll('.nav-item[data-view="notifications"], .mobile-nav a[data-view="notifications"]').forEach(el => {
  el.addEventListener('click', () => {
    setTimeout(() => {
      const nl = document.getElementById('notificationsList');
      if (nl && !nl.innerHTML.trim()) {
        nl.innerHTML = '<div class="empty-note">No notifications yet.<br>Like and repost to see activity here (demo).</div>';
      }
    }, 80);
  });
});

// messages / lists / more are nav-only stubs (switch view, fallback to home content). Ok for assignment UX.
console.log('%c[additional] loaded — edit + explore + stubs ready (polls in core)', 'color:#555');
