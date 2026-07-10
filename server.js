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

for (const dir of [dataDir, uploadDir, backupDir]) fs.mkdirSync(dir, { recursive: true });

const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webm": "audio/webm",
  ".pdf": "application/pdf",
  ".zip": "application/zip"
};

function now() {
  return new Date().toISOString();
}

function id(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.pbkdf2Sync(password, salt, 120000, 32, "sha256").toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(":");
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(hashPassword(password, salt).split(":")[1], "hex"));
}

function defaultDb() {
  const mePassword = process.env.FANTASIA_ME_PASSWORD || "change-me-now";
  const partnerPassword = process.env.FANTASIA_PARTNER_PASSWORD || "change-partner-now";
  return {
    users: [
      {
        id: "u_me",
        username: process.env.FANTASIA_ME_USERNAME || "me",
        displayName: process.env.FANTASIA_ME_NAME || "Me",
        avatar: "/assests/ChatGPT Image May 14, 2026, 10_57_41 AM.png",
        passwordHash: hashPassword(mePassword),
        createdAt: now()
      },
      {
        id: "u_partner",
        username: process.env.FANTASIA_PARTNER_USERNAME || "partner",
        displayName: process.env.FANTASIA_PARTNER_NAME || "Partner",
        avatar: "/assests/png (3)",
        passwordHash: hashPassword(partnerPassword),
        createdAt: now()
      }
    ],
    sessions: [],
    messages: [],
    stories: [],
    presence: {},
    settings: {
      appLockSetting: false,
      screenshotAlerts: true,
      hideMedia: false,
      incognitoTyping: false,
      keyFingerprint: `FA-${crypto.randomBytes(8).toString("hex").toUpperCase().match(/../g).join(" ")}`
    },
    audit: []
  };
}

function loadDb() {
  if (!fs.existsSync(dbPath)) {
    const db = defaultDb();
    saveDb(db);
    console.log("Fantasia created two default accounts:");
    console.log(`  ${db.users[0].username} / ${process.env.FANTASIA_ME_PASSWORD || "change-me-now"}`);
    console.log(`  ${db.users[1].username} / ${process.env.FANTASIA_PARTNER_PASSWORD || "change-partner-now"}`);
    console.log("Change these passwords in the app before exposing it online.");
    return db;
  }
  return JSON.parse(fs.readFileSync(dbPath, "utf8"));
}

function saveDb(db) {
  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
}

let db = loadDb();
const clients = new Map();

function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    avatar: user.avatar
  };
}

function stateFor(user) {
  const partner = db.users.find((item) => item.id !== user.id);
  return {
    me: publicUser(user),
    partner: publicUser(partner),
    messages: db.messages,
    stories: db.stories.filter((story) => !story.expiresAt || Date.now() < new Date(story.expiresAt).getTime()),
    presence: db.presence,
    settings: db.settings
  };
}

function json(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store"
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > 25 * 1024 * 1024) {
        reject(new Error("Request too large."));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error("Invalid JSON."));
      }
    });
    req.on("error", reject);
  });
}

function bearer(req) {
  const auth = req.headers.authorization || "";
  if (auth.startsWith("Bearer ")) return auth.slice(7);
  const url = new URL(req.url, `http://${req.headers.host}`);
  return url.searchParams.get("token");
}

function userFromReq(req) {
  const token = bearer(req);
  if (!token) return null;
  const session = db.sessions.find((item) => item.token === token && new Date(item.expiresAt).getTime() > Date.now());
  if (!session) return null;
  return db.users.find((user) => user.id === session.userId) || null;
}

function requireUser(req, res) {
  const user = userFromReq(req);
  if (!user) json(res, 401, { error: "Not signed in." });
  return user;
}

function sendEvent(res, event, payload) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function broadcast(event = "state", payload = null) {
  for (const [userId, res] of clients) {
    const user = db.users.find((item) => item.id === userId);
    if (!user) continue;
    sendEvent(res, event, payload || stateFor(user));
  }
}

function audit(userId, action, payload = {}) {
  db.audit.push({ id: id("audit"), userId, action, payload, createdAt: now() });
  db.audit = db.audit.slice(-1000);
}

function saveAttachment(file) {
  if (!file?.data || !file?.name) return null;
  const match = String(file.data).match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error("Invalid attachment.");
  const type = file.type || match[1] || "application/octet-stream";
  const safeExt = path.extname(file.name).replace(/[^a-zA-Z0-9.]/g, "") || ".bin";
  const fileName = `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${safeExt}`;
  const disk = path.join(uploadDir, fileName);
  fs.writeFileSync(disk, Buffer.from(match[2], "base64"));
  return {
    id: id("file"),
    name: file.name.slice(0, 160),
    type,
    size: fs.statSync(disk).size,
    url: `/uploads/${fileName}`,
    createdAt: now()
  };
}

function routeStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === "/") pathname = "/index.html";
  const base = pathname.startsWith("/uploads/") ? root : root;
  const file = path.normalize(path.join(base, pathname));
  if (!file.startsWith(root)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    res.writeHead(200, {
      "Content-Type": mime[path.extname(file).toLowerCase()] || "application/octet-stream",
      "X-Content-Type-Options": "nosniff"
    });
    res.end(data);
  });
}

async function routeApi(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const method = req.method;

  try {
    if (method === "POST" && url.pathname === "/api/login") {
      const body = await readBody(req);
      const user = db.users.find((item) => item.username.toLowerCase() === String(body.username || "").toLowerCase());
      if (!user || !verifyPassword(String(body.password || ""), user.passwordHash)) {
        return json(res, 401, { error: "Wrong username or password." });
      }
      const token = crypto.randomBytes(32).toString("hex");
      db.sessions.push({ token, userId: user.id, createdAt: now(), expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString() });
      db.presence[user.id] = { status: "online", lastSeenAt: now() };
      audit(user.id, "login");
      saveDb(db);
      broadcast();
      return json(res, 200, { token });
    }

    const user = requireUser(req, res);
    if (!user) return;

    if (method === "POST" && url.pathname === "/api/logout") {
      const token = bearer(req);
      db.sessions = db.sessions.filter((item) => item.token !== token);
      db.presence[user.id] = { status: "offline", lastSeenAt: now() };
      audit(user.id, "logout");
      saveDb(db);
      broadcast();
      return json(res, 200, { ok: true });
    }

    if (method === "GET" && url.pathname === "/api/session") {
      return json(res, 200, stateFor(user));
    }

    if (method === "GET" && url.pathname === "/api/events") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive"
      });
      clients.set(user.id, res);
      sendEvent(res, "state", stateFor(user));
      req.on("close", () => clients.delete(user.id));
      return;
    }

    if (method === "POST" && url.pathname === "/api/presence") {
      db.presence[user.id] = { status: "online", lastSeenAt: now() };
      saveDb(db);
      broadcast();
      return json(res, 200, { ok: true });
    }

    if (method === "POST" && url.pathname === "/api/presence/offline") {
      db.presence[user.id] = { status: "offline", lastSeenAt: now() };
      saveDb(db);
      broadcast();
      return json(res, 200, { ok: true });
    }

    if (method === "POST" && url.pathname === "/api/typing") {
      for (const [userId, client] of clients) {
        if (userId !== user.id) sendEvent(client, "typing", { userId: user.id, at: now() });
      }
      return json(res, 200, { ok: true });
    }

    if (method === "POST" && url.pathname === "/api/messages") {
      const body = await readBody(req);
      const attachments = (body.attachments || []).map(saveAttachment).filter(Boolean);
      const createdAt = body.scheduledFor || now();
      const expiresAt = body.timer ? new Date(new Date(createdAt).getTime() + Number(body.timer) * 1000).toISOString() : null;
      const poll = body.poll ? {
        question: String(body.poll.question || "").slice(0, 240),
        options: (body.poll.options || []).map((item) => String(item).slice(0, 80)).filter(Boolean).slice(0, 6),
        votes: {}
      } : null;
      if (poll) poll.options.forEach((option) => poll.votes[option] = []);
      const message = {
        id: id("msg"),
        senderId: user.id,
        text: String(body.text || "").slice(0, 8000),
        attachments,
        replyTo: body.replyTo || null,
        viewOnce: !!body.viewOnce,
        status: body.scheduledFor ? "scheduled" : "sent",
        createdAt,
        deliveredAt: now(),
        readBy: [user.id],
        hiddenFor: [],
        reactions: {},
        pinned: false,
        starred: false,
        poll,
        expiresAt,
        editedAt: null
      };
      if (!message.text && !attachments.length && !poll) return json(res, 400, { error: "Message is empty." });
      db.messages.push(message);
      audit(user.id, "message:create", { messageId: message.id });
      saveDb(db);
      broadcast();
      return json(res, 201, message);
    }

    const messageMatch = url.pathname.match(/^\/api\/messages\/([^/]+)$/);
    if (messageMatch) {
      const message = db.messages.find((item) => item.id === messageMatch[1]);
      if (!message) return json(res, 404, { error: "Message not found." });

      if (method === "PATCH") {
        const body = await readBody(req);
        if (typeof body.text === "string") {
          if (message.senderId !== user.id) return json(res, 403, { error: "Only the sender can edit this message." });
          message.text = body.text.slice(0, 8000);
          message.editedAt = now();
        }
        if (typeof body.pinned === "boolean") message.pinned = body.pinned;
        if (typeof body.starred === "boolean") message.starred = body.starred;
        audit(user.id, "message:update", { messageId: message.id });
        saveDb(db);
        broadcast();
        return json(res, 200, message);
      }

      if (method === "DELETE") {
        const mode = url.searchParams.get("mode");
        if (mode === "everyone") {
          if (message.senderId !== user.id) return json(res, 403, { error: "Only the sender can delete for everyone." });
          db.messages = db.messages.filter((item) => item.id !== message.id);
        } else {
          message.hiddenFor = [...new Set([...(message.hiddenFor || []), user.id])];
        }
        audit(user.id, "message:delete", { messageId: message.id, mode });
        saveDb(db);
        broadcast();
        return json(res, 200, { ok: true });
      }
    }

    const reactionMatch = url.pathname.match(/^\/api\/messages\/([^/]+)\/reactions$/);
    if (method === "POST" && reactionMatch) {
      const body = await readBody(req);
      const message = db.messages.find((item) => item.id === reactionMatch[1]);
      if (!message) return json(res, 404, { error: "Message not found." });
      const emoji = String(body.emoji || "💜").slice(0, 12);
      message.reactions[emoji] = message.reactions[emoji] || [];
      if (message.reactions[emoji].includes(user.id)) message.reactions[emoji] = message.reactions[emoji].filter((id) => id !== user.id);
      else message.reactions[emoji].push(user.id);
      saveDb(db);
      broadcast();
      return json(res, 200, message);
    }

    const pollMatch = url.pathname.match(/^\/api\/messages\/([^/]+)\/poll$/);
    if (method === "POST" && pollMatch) {
      const body = await readBody(req);
      const message = db.messages.find((item) => item.id === pollMatch[1]);
      if (!message?.poll) return json(res, 404, { error: "Poll not found." });
      for (const voters of Object.values(message.poll.votes)) {
        const index = voters.indexOf(user.id);
        if (index >= 0) voters.splice(index, 1);
      }
      const option = String(body.option || "");
      if (!message.poll.votes[option]) return json(res, 400, { error: "Invalid poll option." });
      message.poll.votes[option].push(user.id);
      saveDb(db);
      broadcast();
      return json(res, 200, message);
    }

    if (method === "POST" && url.pathname === "/api/stories") {
      const body = await readBody(req);
      const text = String(body.text || "").trim();
      if (!text) return json(res, 400, { error: "Story is empty." });
      const story = { id: id("story"), userId: user.id, text: text.slice(0, 400), views: [], createdAt: now(), expiresAt: new Date(Date.now() + 86400000).toISOString() };
      db.stories.unshift(story);
      saveDb(db);
      broadcast();
      return json(res, 201, story);
    }

    if (method === "PATCH" && url.pathname === "/api/settings") {
      const body = await readBody(req);
      for (const key of ["appLockSetting", "screenshotAlerts", "hideMedia", "incognitoTyping"]) {
        if (typeof body[key] === "boolean") db.settings[key] = body[key];
      }
      audit(user.id, "settings:update", body);
      saveDb(db);
      broadcast();
      return json(res, 200, db.settings);
    }

    if (method === "POST" && url.pathname === "/api/password") {
      const body = await readBody(req);
      if (!verifyPassword(String(body.oldPassword || ""), user.passwordHash)) return json(res, 403, { error: "Current password is wrong." });
      if (String(body.newPassword || "").length < 10) return json(res, 400, { error: "Use at least 10 characters." });
      user.passwordHash = hashPassword(String(body.newPassword));
      audit(user.id, "password:change");
      saveDb(db);
      return json(res, 200, { ok: true });
    }

    if (method === "POST" && url.pathname === "/api/security-alert") {
      const body = await readBody(req);
      db.messages.push({
        id: id("msg"),
        senderId: user.id,
        text: String(body.text || "Security alert.").slice(0, 800),
        attachments: [],
        replyTo: null,
        viewOnce: false,
        status: "sent",
        createdAt: now(),
        deliveredAt: now(),
        readBy: [user.id],
        hiddenFor: [],
        reactions: {},
        pinned: false,
        starred: false,
        poll: null,
        expiresAt: null,
        editedAt: null
      });
      saveDb(db);
      broadcast();
      return json(res, 201, { ok: true });
    }

    if (method === "POST" && url.pathname === "/api/calls/signal") {
      const body = await readBody(req);
      const signal = { from: user.id, type: body.type, payload: body.payload, callId: body.callId || id("call"), at: now() };
      for (const [userId, client] of clients) {
        if (userId !== user.id) sendEvent(client, "call", signal);
      }
      return json(res, 200, { ok: true });
    }

    if (method === "POST" && url.pathname === "/api/backup") {
      const file = path.join(backupDir, `fantasia-${Date.now()}.json`);
      fs.copyFileSync(dbPath, file);
      audit(user.id, "backup:create", { file: path.basename(file) });
      saveDb(db);
      return json(res, 200, { message: `Backup created: ${path.basename(file)}` });
    }

    if (method === "GET" && url.pathname === "/api/export") {
      const exportData = JSON.stringify({ exportedAt: now(), messages: db.messages, stories: db.stories }, null, 2);
      res.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": "attachment; filename=\"fantasia-export.json\""
      });
      res.end(exportData);
      return;
    }

    json(res, 404, { error: "Not found." });
  } catch (error) {
    json(res, 500, { error: error.message || "Server error." });
  }
}

setInterval(() => {
  const beforeMessages = db.messages.length;
  const beforeStories = db.stories.length;
  db.messages = db.messages.filter((message) => !message.expiresAt || Date.now() < new Date(message.expiresAt).getTime());
  db.stories = db.stories.filter((story) => !story.expiresAt || Date.now() < new Date(story.expiresAt).getTime());
  if (db.messages.length !== beforeMessages || db.stories.length !== beforeStories) {
    saveDb(db);
    broadcast();
  }
}, 15000);

const server = http.createServer((req, res) => {
  if (req.url.startsWith("/api/")) routeApi(req, res);
  else routeStatic(req, res);
});

server.listen(port, () => {
  console.log(`Fantasia is running at http://localhost:${port}`);
});
