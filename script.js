const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const app = {
  token: localStorage.getItem("fantasia_token"),
  me: null,
  partner: null,
  messages: [],
  stories: [],
  settings: {},
  presence: {},
  attachments: [],
  replyTo: null,
  mediaFilter: "all",
  eventSource: null,
  typingTimer: null,
  call: {
    peer: null,
    localStream: null,
    screenStream: null,
    callId: null,
    incoming: null,
    makingOffer: false
  }
};

const emojiSet = ["💜", "❤️", "😂", "🥹", "😘", "🔥", "✨", "🙏", "👀", "🎧", "🍿", "🌙"];

async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (!(options.body instanceof FormData)) headers["Content-Type"] = "application/json";
  if (app.token) headers.Authorization = `Bearer ${app.token}`;
  const response = await fetch(path, { ...options, headers });
  if (response.status === 401) {
    signOut(false);
    throw new Error("Please sign in again.");
  }
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(data?.error || "Request failed.");
  return data;
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[char]));
}

function renderMarkdown(text) {
  let safe = escapeHtml(text);
  safe = safe.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
  safe = safe.replace(/\*(.*?)\*/g, "<em>$1</em>");
  safe = safe.replace(/`(.*?)`/g, "<code>$1</code>");
  safe = safe.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" rel="noreferrer">$1</a>');
  return safe.replace(/\n/g, "<br>");
}

function timeAgo(ts) {
  const diff = Math.max(1, Math.floor((Date.now() - new Date(ts).getTime()) / 1000));
  if (diff < 60) return `${diff}s`;
  const min = Math.floor(diff / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  return `${Math.floor(hr / 24)}d`;
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.remove("hidden");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.add("hidden"), 2400);
}

function showApp() {
  $("#authScreen").classList.add("hidden");
  $("#appShell").classList.remove("hidden");
}

function showAuth() {
  $("#authScreen").classList.remove("hidden");
  $("#appShell").classList.add("hidden");
}

async function signOut(callServer = true) {
  if (callServer && app.token) {
    try { await api("/api/logout", { method: "POST", body: "{}" }); } catch {}
  }
  localStorage.removeItem("fantasia_token");
  if (app.eventSource) app.eventSource.close();
  stopCall();
  app.token = null;
  showAuth();
}

async function loadSession() {
  if (!app.token) return showAuth();
  const data = await api("/api/session");
  app.me = data.me;
  app.partner = data.partner;
  app.messages = data.messages;
  app.stories = data.stories;
  app.settings = data.settings;
  app.presence = data.presence;
  showApp();
  renderAll();
  connectEvents();
  await api("/api/presence", { method: "POST", body: JSON.stringify({ status: "online" }) });
}

function connectEvents() {
  if (app.eventSource) app.eventSource.close();
  app.eventSource = new EventSource(`/api/events?token=${encodeURIComponent(app.token)}`);
  app.eventSource.addEventListener("state", (event) => {
    const data = JSON.parse(event.data);
    app.messages = data.messages;
    app.stories = data.stories;
    app.settings = data.settings;
    app.presence = data.presence;
    renderAll(false);
  });
  app.eventSource.addEventListener("typing", (event) => {
    const data = JSON.parse(event.data);
    if (data.userId !== app.me.id && !app.settings.incognitoTyping) showTyping(`${app.partner.displayName} is typing...`);
  });
  app.eventSource.addEventListener("call", (event) => handleCallSignal(JSON.parse(event.data)));
  app.eventSource.onerror = () => $("#presenceLine").textContent = "Reconnecting...";
}

function renderIdentity() {
  $("#meAvatar").src = app.me.avatar;
  $("#meName").textContent = app.me.displayName;
  $("#partnerName").textContent = app.partner.displayName;
  const p = app.presence[app.partner.id];
  const online = p?.status === "online" && Date.now() - new Date(p.lastSeenAt).getTime() < 45000;
  $("#presenceLine").textContent = online ? "online now - encrypted server sync" : `last seen ${p?.lastSeenAt ? timeAgo(p.lastSeenAt) : "recently"} ago`;
  $("#sessionLabel").textContent = `@${app.me.username}`;
}

function visibleMessages() {
  const query = ($("#searchInput").value || "").toLowerCase().trim();
  const type = $("#searchType").value;
  return app.messages.filter((message) => {
    if (message.hiddenFor?.includes(app.me.id)) return false;
    if (message.expiresAt && Date.now() > new Date(message.expiresAt).getTime()) return false;
    const hasMedia = message.attachments?.length;
    const hasLink = /https?:\/\//i.test(message.text);
    const matchesType =
      type === "all" ||
      (type === "media" && hasMedia) ||
      (type === "links" && hasLink) ||
      (type === "pinned" && message.pinned) ||
      (type === "starred" && message.starred);
    const haystack = [message.text, message.poll?.question, ...(message.attachments || []).map((file) => file.name)].join(" ").toLowerCase();
    return matchesType && (!query || haystack.includes(query));
  });
}

function renderMessages(keepScroll = false) {
  const list = $("#messageList");
  const atBottom = list.scrollTop + list.clientHeight >= list.scrollHeight - 80;
  list.innerHTML = visibleMessages().map((message) => {
    const sender = message.senderId === app.me.id ? app.me : app.partner;
    const mine = sender.id === app.me.id;
    const reply = message.replyTo ? app.messages.find((item) => item.id === message.replyTo) : null;
    const reactions = Object.entries(message.reactions || {}).filter(([, users]) => users.length);
    return `
      <article class="message ${mine ? "mine" : "theirs"}" data-id="${message.id}">
        <img class="message-avatar" src="${sender.avatar}" alt="">
        <div class="bubble">
          <div class="message-meta">
            <strong>${escapeHtml(sender.displayName)}</strong>
            <span>${timeAgo(message.createdAt)} - ${message.status}</span>
          </div>
          ${reply ? `<button class="quoted" data-jump="${reply.id}">${escapeHtml(reply.text.slice(0, 90))}</button>` : ""}
          <div class="message-text">${renderMarkdown(message.text)}</div>
          ${renderAttachments(message)}
          ${renderPoll(message)}
          <div class="message-badges">
            ${message.pinned ? "<span>Pinned</span>" : ""}
            ${message.starred ? "<span>Starred</span>" : ""}
            ${message.viewOnce ? "<span>View once</span>" : ""}
            ${message.expiresAt ? `<span>Expires ${timeAgo(message.expiresAt)}</span>` : ""}
            ${message.editedAt ? "<span>Edited</span>" : ""}
          </div>
          <div class="reaction-row">${reactions.map(([emoji, ids]) => `<button data-react="${escapeHtml(emoji)}">${escapeHtml(emoji)} ${ids.length}</button>`).join("")}</div>
          <div class="message-actions">
            <button data-act="reply">Reply</button>
            <button data-act="react">React</button>
            ${mine ? '<button data-act="edit">Edit</button>' : ""}
            <button data-act="pin">${message.pinned ? "Unpin" : "Pin"}</button>
            <button data-act="star">${message.starred ? "Unstar" : "Star"}</button>
            <button data-act="forward">Forward</button>
            <button data-act="deleteMe">Delete me</button>
            ${mine ? '<button data-act="deleteAll">Delete all</button>' : ""}
          </div>
        </div>
      </article>
    `;
  }).join("");
  renderPinned();
  if (!keepScroll || atBottom) list.scrollTop = list.scrollHeight;
}

function renderAttachments(message) {
  if (!message.attachments?.length || app.settings.hideMedia) return "";
  return `<div class="attachment-list">${message.attachments.map((file) => {
    if (file.type.startsWith("image/")) {
      return `<figure class="image-attachment"><img src="${file.url}" alt="${escapeHtml(file.name)}"><figcaption>${escapeHtml(file.name)}</figcaption></figure>`;
    }
    if (file.type.startsWith("audio/")) {
      return `<div class="file-attachment"><strong>${escapeHtml(file.name)}</strong><audio controls src="${file.url}"></audio></div>`;
    }
    return `<a class="file-attachment" href="${file.url}" download><strong>${escapeHtml(file.name)}</strong><span>${escapeHtml(file.type)}</span></a>`;
  }).join("")}</div>`;
}

function renderPoll(message) {
  if (!message.poll) return "";
  const total = Object.values(message.poll.votes).flat().length || 1;
  return `<div class="poll-card"><strong>${escapeHtml(message.poll.question)}</strong>${message.poll.options.map((option) => {
    const voters = message.poll.votes[option] || [];
    const pct = Math.round((voters.length / total) * 100);
    const voted = voters.includes(app.me.id);
    return `<button data-poll="${escapeHtml(option)}" class="${voted ? "voted" : ""}"><span>${escapeHtml(option)}</span><i style="width:${pct}%"></i><b>${pct}%</b></button>`;
  }).join("")}</div>`;
}

function renderPinned() {
  const pinned = app.messages.filter((message) => message.pinned && !message.hiddenFor?.includes(app.me.id));
  $("#pinnedStrip").innerHTML = pinned.length ? pinned.map((message) => `
    <button data-jump="${message.id}"><strong>Pinned</strong><span>${escapeHtml(message.text.slice(0, 100))}</span></button>
  `).join("") : "";
}

function renderStories() {
  $("#storyList").innerHTML = app.stories.length ? app.stories.map((story) => {
    const user = story.userId === app.me.id ? app.me : app.partner;
    return `<article class="story-card"><img src="${user.avatar}" alt=""><div><strong>${escapeHtml(user.displayName)}</strong><p>${escapeHtml(story.text)}</p><span>${timeAgo(story.createdAt)} ago - ${story.views.length} view</span></div></article>`;
  }).join("") : `<div class="empty-state">No stories yet.</div>`;
  $("#streakCount").textContent = String(calculateStreak());
}

function calculateStreak() {
  const days = new Set(app.messages.map((message) => new Date(message.createdAt).toDateString()));
  return days.size;
}

function renderMedia() {
  const media = app.messages.flatMap((message) => (message.attachments || []).map((file) => ({ ...file, message })));
  const filtered = media.filter((file) => app.mediaFilter === "all" || file.type.startsWith(`${app.mediaFilter}/`) || (app.mediaFilter === "file" && !file.type.startsWith("image/") && !file.type.startsWith("audio/")));
  $("#mediaGrid").innerHTML = filtered.length ? filtered.map((file) => {
    if (file.type.startsWith("image/")) return `<figure><img src="${file.url}" alt=""><figcaption>${escapeHtml(file.name)}</figcaption></figure>`;
    return `<a class="media-file" href="${file.url}" download><strong>${escapeHtml(file.name)}</strong><span>${escapeHtml(file.type)}</span></a>`;
  }).join("") : `<div class="empty-state">Shared media will appear here.</div>`;
}

function renderSaved() {
  const saved = app.messages.filter((message) => message.starred);
  $("#savedList").innerHTML = saved.length ? saved.map((message) => `<button data-jump="${message.id}">${escapeHtml(message.text.slice(0, 120))}</button>`).join("") : "No saved messages yet.";
}

function renderSettings() {
  $("#appLockSetting").checked = !!app.settings.appLockSetting;
  $("#screenshotAlerts").checked = !!app.settings.screenshotAlerts;
  $("#hideMedia").checked = !!app.settings.hideMedia;
  $("#incognitoTyping").checked = !!app.settings.incognitoTyping;
  $("#keyFingerprint").textContent = app.settings.keyFingerprint;
  $("#passwordHelp").textContent = `You are changing the password for @${app.me.username}. Use that account's current password. Default: ${app.me.username === "me" ? "change-me-now" : "change-partner-now"}.`;
}

function renderAll(keepScroll = true) {
  renderIdentity();
  renderMessages(keepScroll);
  renderStories();
  renderMedia();
  renderSaved();
  renderSettings();
}

async function fileToPayload(file) {
  const data = await new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(file);
  });
  return { name: file.name, type: file.type || "application/octet-stream", data };
}

function renderAttachmentPreview() {
  $("#attachmentPreview").innerHTML = app.attachments.map((file, index) => `
    <div class="preview-pill"><span>${escapeHtml(file.name)}</span><button type="button" data-remove-attachment="${index}">x</button></div>
  `).join("");
}

async function sendMessage(extra = {}) {
  const text = extra.text ?? $("#messageInput").value.trim();
  if (!text && !app.attachments.length && !extra.poll) return;
  await api("/api/messages", {
    method: "POST",
    body: JSON.stringify({
      text,
      replyTo: app.replyTo,
      viewOnce: $("#viewOnceMode").checked,
      timer: Number($("#timerMode").value),
      attachments: app.attachments,
      poll: extra.poll || null
    })
  });
  app.attachments = [];
  app.replyTo = null;
  $("#messageInput").value = "";
  $("#replyPreview").classList.add("hidden");
  renderAttachmentPreview();
}

async function handleMessageAction(messageId, action) {
  const message = app.messages.find((item) => item.id === messageId);
  if (!message) return;
  if (action === "reply") {
    app.replyTo = message.id;
    $("#replyPreview").innerHTML = `<span>Replying to: ${escapeHtml(message.text.slice(0, 80))}</span><button type="button" id="clearReply">x</button>`;
    $("#replyPreview").classList.remove("hidden");
    $("#messageInput").focus();
    return;
  }
  if (action === "react") {
    const emoji = prompt("Reaction", "💜");
    if (emoji) await api(`/api/messages/${messageId}/reactions`, { method: "POST", body: JSON.stringify({ emoji }) });
    return;
  }
  if (action === "edit") {
    const text = prompt("Edit message", message.text);
    if (text !== null) await api(`/api/messages/${messageId}`, { method: "PATCH", body: JSON.stringify({ text }) });
    return;
  }
  if (action === "pin" || action === "star") {
    await api(`/api/messages/${messageId}`, { method: "PATCH", body: JSON.stringify({ [action === "pin" ? "pinned" : "starred"]: !message[action === "pin" ? "pinned" : "starred"] }) });
    return;
  }
  if (action === "forward") {
    await api("/api/messages", { method: "POST", body: JSON.stringify({ text: `Forwarded: ${message.text}`, attachments: message.attachments }) });
    return;
  }
  if (action === "deleteMe") await api(`/api/messages/${messageId}?mode=me`, { method: "DELETE" });
  if (action === "deleteAll") await api(`/api/messages/${messageId}?mode=everyone`, { method: "DELETE" });
}

function showTyping(text) {
  $("#typingLine").textContent = text;
  clearTimeout(showTyping.timer);
  showTyping.timer = setTimeout(() => $("#typingLine").textContent = "", 1600);
}

async function updateSetting(key, value) {
  app.settings[key] = value;
  renderSettings();
  await api("/api/settings", { method: "PATCH", body: JSON.stringify({ [key]: value }) });
}

function renderPanel(view) {
  $$(".rail-btn").forEach((button) => button.classList.toggle("active", button.dataset.panel === view));
  $$(".panel-view").forEach((panel) => panel.classList.toggle("active", panel.dataset.view === view));
}

async function createPeer(video) {
  stopCall(false);
  const peer = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
  app.call.peer = peer;
  app.call.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video });
  $("#localVideo").srcObject = app.call.localStream;
  $("#remoteVideo").srcObject = new MediaStream();
  app.call.localStream.getTracks().forEach((track) => peer.addTrack(track, app.call.localStream));
  peer.ontrack = (event) => event.streams[0].getTracks().forEach((track) => $("#remoteVideo").srcObject.addTrack(track));
  peer.onicecandidate = (event) => {
    if (event.candidate) sendCallSignal("candidate", event.candidate);
  };
  peer.onconnectionstatechange = () => $("#callStatus").textContent = `Call ${peer.connectionState}`;
  return peer;
}

async function startCall(video) {
  renderPanel("calls");
  app.call.callId = crypto.randomUUID();
  $("#callStatus").textContent = "Calling...";
  const peer = await createPeer(video);
  app.call.makingOffer = true;
  const offer = await peer.createOffer();
  await peer.setLocalDescription(offer);
  app.call.makingOffer = false;
  await sendCallSignal("offer", { sdp: peer.localDescription, video, callId: app.call.callId });
}

async function sendCallSignal(type, payload) {
  await api("/api/calls/signal", { method: "POST", body: JSON.stringify({ type, payload, callId: app.call.callId }) });
}

async function handleCallSignal(signal) {
  if (signal.from === app.me.id) return;
  if (signal.type === "offer") {
    app.call.incoming = signal;
    app.call.callId = signal.callId;
    $("#incomingCallText").textContent = `${app.partner.displayName} is calling.`;
    $("#incomingCallDialog").showModal();
    return;
  }
  const peer = app.call.peer;
  if (!peer) return;
  if (signal.type === "answer") await peer.setRemoteDescription(signal.payload.sdp);
  if (signal.type === "candidate") await peer.addIceCandidate(signal.payload);
  if (signal.type === "hangup") stopCall();
}

async function acceptCall() {
  const signal = app.call.incoming;
  if (!signal) return;
  renderPanel("calls");
  const peer = await createPeer(!!signal.payload.video);
  await peer.setRemoteDescription(signal.payload.sdp);
  const answer = await peer.createAnswer();
  await peer.setLocalDescription(answer);
  await sendCallSignal("answer", { sdp: peer.localDescription });
  $("#callStatus").textContent = "Call active";
}

function stopCall(notify = true) {
  if (notify && app.call.callId) sendCallSignal("hangup", {}).catch(() => {});
  app.call.peer?.close();
  app.call.localStream?.getTracks().forEach((track) => track.stop());
  app.call.screenStream?.getTracks().forEach((track) => track.stop());
  app.call = { peer: null, localStream: null, screenStream: null, callId: null, incoming: null, makingOffer: false };
  $("#localVideo").srcObject = null;
  $("#remoteVideo").srcObject = null;
  $("#callStatus").textContent = "Ready for encrypted browser-to-browser calling.";
}

async function shareScreen() {
  if (!app.call.peer) return showToast("Start a call first.");
  app.call.screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
  const screenTrack = app.call.screenStream.getVideoTracks()[0];
  const sender = app.call.peer.getSenders().find((item) => item.track?.kind === "video");
  if (sender) sender.replaceTrack(screenTrack);
  screenTrack.onended = () => {
    const cameraTrack = app.call.localStream?.getVideoTracks()[0];
    if (sender && cameraTrack) sender.replaceTrack(cameraTrack);
  };
}

function summarize() {
  const recent = app.messages.slice(-12).map((message) => `${message.senderId === app.me.id ? app.me.displayName : app.partner.displayName}: ${message.text}`);
  $("#aiOutput").innerHTML = `<strong>Summary</strong><p>${escapeHtml(recent.join(" ")).slice(0, 600) || "No messages yet."}</p>`;
}

function smartReplies() {
  const replies = ["I love you.", "Tell me more.", "Can we call?", "I saved this.", "I miss you."];
  $("#aiOutput").innerHTML = replies.map((reply) => `<button data-insert="${escapeHtml(reply)}">${escapeHtml(reply)}</button>`).join("");
}

function tasks() {
  const found = app.messages.filter((message) => /remember|buy|book|call|plan|tomorrow|today|task|todo/i.test(message.text));
  $("#aiOutput").innerHTML = found.length ? found.map((message) => `<p>${escapeHtml(message.text)}</p>`).join("") : "No tasks detected.";
}

function mood() {
  const text = app.messages.slice(-20).map((message) => message.text).join(" ").toLowerCase();
  const warm = (text.match(/love|miss|happy|sweet|kiss|proud/g) || []).length;
  const tense = (text.match(/sad|angry|sorry|tired|stress|miss/g) || []).length;
  $("#aiOutput").textContent = warm >= tense ? "Mood: warm and connected." : "Mood: needs care and reassurance.";
}

document.addEventListener("click", async (event) => {
  const panel = event.target.closest("[data-panel]");
  if (panel) renderPanel(panel.dataset.panel);

  const action = event.target.closest("[data-act]");
  if (action) await handleMessageAction(action.closest(".message").dataset.id, action.dataset.act);

  const jump = event.target.closest("[data-jump]");
  if (jump) document.querySelector(`[data-id="${jump.dataset.jump}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });

  const poll = event.target.closest("[data-poll]");
  if (poll) await api(`/api/messages/${poll.closest(".message").dataset.id}/poll`, { method: "POST", body: JSON.stringify({ option: poll.dataset.poll }) });

  const remove = event.target.closest("[data-remove-attachment]");
  if (remove) {
    app.attachments.splice(Number(remove.dataset.removeAttachment), 1);
    renderAttachmentPreview();
  }

  const filter = event.target.closest("[data-media-filter]");
  if (filter) {
    app.mediaFilter = filter.dataset.mediaFilter;
    $$("[data-media-filter]").forEach((button) => button.classList.toggle("active", button === filter));
    renderMedia();
  }

  const insert = event.target.closest("[data-insert]");
  if (insert) {
    $("#messageInput").value = insert.dataset.insert;
    $("#messageInput").focus();
  }

  if (event.target.id === "clearReply") {
    app.replyTo = null;
    $("#replyPreview").classList.add("hidden");
  }
});

$("#loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const data = await api("/api/login", {
      method: "POST",
      body: JSON.stringify({ username: $("#loginUsername").value.trim(), password: $("#loginPassword").value })
    });
    app.token = data.token;
    localStorage.setItem("fantasia_token", app.token);
    await loadSession();
  } catch (error) {
    showToast(error.message);
  }
});

$("#composer").addEventListener("submit", async (event) => {
  event.preventDefault();
  await sendMessage();
});

$("#messageInput").addEventListener("input", () => {
  clearTimeout(app.typingTimer);
  if (!app.settings.incognitoTyping) api("/api/typing", { method: "POST", body: "{}" }).catch(() => {});
  app.typingTimer = setTimeout(() => {}, 1000);
});

$("#attachBtn").addEventListener("click", () => $("#fileInput").click());
$("#fileInput").addEventListener("change", async (event) => {
  const payloads = await Promise.all([...event.target.files].map(fileToPayload));
  app.attachments.push(...payloads);
  renderAttachmentPreview();
  event.target.value = "";
});

$("#emojiBtn").addEventListener("click", () => $("#emojiPicker").classList.toggle("hidden"));
$("#emojiPicker").innerHTML = emojiSet.map((emoji) => `<button type="button" data-insert="${emoji}">${emoji}</button>`).join("");

$("#pollBtn").addEventListener("click", async () => {
  const question = prompt("Poll question");
  if (!question) return;
  const options = (prompt("Options separated by commas", "Dinner, Movie, Call") || "").split(",").map((item) => item.trim()).filter(Boolean).slice(0, 6);
  if (options.length < 2) return showToast("Add at least two options.");
  await sendMessage({ text: question, poll: { question, options } });
});

$("#scheduleBtn").addEventListener("click", async () => {
  const text = $("#messageInput").value.trim();
  if (!text) return showToast("Type a message first.");
  const minutes = Number(prompt("Send in how many minutes?", "1"));
  if (!minutes) return;
  await api("/api/messages", { method: "POST", body: JSON.stringify({ text, scheduledFor: new Date(Date.now() + minutes * 60000).toISOString() }) });
  $("#messageInput").value = "";
});

let recorder = null;
let voiceChunks = [];
$("#voiceNoteBtn").addEventListener("click", async () => {
  if (recorder?.state === "recording") {
    recorder.stop();
    $("#voiceNoteBtn").classList.remove("active");
    return;
  }
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  voiceChunks = [];
  recorder = new MediaRecorder(stream);
  recorder.ondataavailable = (event) => voiceChunks.push(event.data);
  recorder.onstop = async () => {
    stream.getTracks().forEach((track) => track.stop());
    const blob = new Blob(voiceChunks, { type: "audio/webm" });
    const file = new File([blob], `voice-${Date.now()}.webm`, { type: "audio/webm" });
    app.attachments.push(await fileToPayload(file));
    await sendMessage({ text: "Voice note" });
  };
  recorder.start();
  $("#voiceNoteBtn").classList.add("active");
  showToast("Recording. Tap Voice again to send.");
});

$("#storyForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = $("#storyInput").value.trim();
  if (!text) return;
  await api("/api/stories", { method: "POST", body: JSON.stringify({ text }) });
  $("#storyInput").value = "";
});

$("#searchToggle").addEventListener("click", () => $("#searchStrip").classList.toggle("hidden"));
$("#privacyShortcut").addEventListener("click", () => renderPanel("privacy"));
$("#searchInput").addEventListener("input", () => renderMessages(true));
$("#searchType").addEventListener("change", () => renderMessages(true));
$("#logoutBtn").addEventListener("click", () => signOut());
$("#exportBtn").addEventListener("click", () => window.open(`/api/export?token=${encodeURIComponent(app.token)}`));
$("#backupBtn").addEventListener("click", async () => showToast((await api("/api/backup", { method: "POST", body: "{}" })).message));
$("#clearLocalBtn").addEventListener("click", () => { localStorage.clear(); showToast("Local cache cleared."); });
$("#savedBtn").addEventListener("click", () => $("#savedPanel").scrollIntoView({ behavior: "smooth" }));

$("#voiceCallBtn").addEventListener("click", () => startCall(false).catch((error) => showToast(error.message)));
$("#videoCallBtn").addEventListener("click", () => startCall(true).catch((error) => showToast(error.message)));
$("#acceptCallBtn").addEventListener("click", (event) => { event.preventDefault(); $("#incomingCallDialog").close(); acceptCall().catch((error) => showToast(error.message)); });
$("#declineCallBtn").addEventListener("click", () => { sendCallSignal("hangup", {}).catch(() => {}); app.call.incoming = null; });
$("#endCallBtn").addEventListener("click", () => stopCall());
$("#screenBtn").addEventListener("click", () => shareScreen().catch((error) => showToast(error.message)));
$("#muteBtn").addEventListener("click", () => {
  app.call.localStream?.getAudioTracks().forEach((track) => track.enabled = !track.enabled);
  $("#muteBtn").classList.toggle("active");
});
$("#cameraBtn").addEventListener("click", () => {
  app.call.localStream?.getVideoTracks().forEach((track) => track.enabled = !track.enabled);
  $("#cameraBtn").classList.toggle("active");
});

["appLockSetting", "screenshotAlerts", "hideMedia", "incognitoTyping"].forEach((id) => {
  $(`#${id}`).addEventListener("change", (event) => updateSetting(id, event.target.checked).catch((error) => showToast(error.message)));
});

$("#passwordForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const status = $("#passwordStatus");
  status.className = "form-status";
  status.textContent = "";
  const oldPassword = $("#oldPassword").value;
  const newPassword = $("#newPassword").value;
  if (newPassword.length < 10) {
    status.classList.add("error");
    status.textContent = "New password must be at least 10 characters.";
    return;
  }
  try {
    await api("/api/password", { method: "POST", body: JSON.stringify({ oldPassword, newPassword }) });
    $("#oldPassword").value = "";
    $("#newPassword").value = "";
    status.classList.add("success");
    status.textContent = "Password changed. Use the new password next time you sign in.";
    showToast("Password changed.");
  } catch (error) {
    status.classList.add("error");
    status.textContent = error.message;
    showToast(error.message);
  }
});

$("#summarizeBtn").addEventListener("click", summarize);
$("#replyIdeasBtn").addEventListener("click", smartReplies);
$("#tasksBtn").addEventListener("click", tasks);
$("#moodBtn").addEventListener("click", mood);

document.addEventListener("visibilitychange", () => {
  if (document.hidden && app.token && app.settings.screenshotAlerts) {
    api("/api/security-alert", { method: "POST", body: JSON.stringify({ text: "The app was backgrounded on one device. A screenshot or screen recording may have happened." }) }).catch(() => {});
  }
});

window.addEventListener("beforeunload", () => {
  if (app.token) {
    fetch("/api/presence/offline", {
      method: "POST",
      keepalive: true,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${app.token}` },
      body: "{}"
    }).catch(() => {});
  }
});

loadSession().catch(() => showAuth());
