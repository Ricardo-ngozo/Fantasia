# 💫 Fantasia — Your Private World for Two

A beautiful, full-featured private messaging app exclusively for two people.  
Chat, share memories, play games, track milestones, and more — all in one place.

---

## 🚀 How to Deploy & Share with Your Partner

There are three ways. **Render (free tier)** is the easiest — no server to manage.

---

### Option 1 — Render.com (Recommended — Free, always-on)

> Render gives you a free URL like `https://fantasia-xxxx.onrender.com` that both of you visit from anywhere.

**Steps:**

1. **Create a free account** at [render.com](https://render.com)

2. **Push this project to GitHub**
   ```bash
   git init
   git add .
   git commit -m "Initial Fantasia"
   ```
   Then create a new repo on [github.com](https://github.com) and push:
   ```bash
   git remote add origin https://github.com/YOUR_USERNAME/fantasia.git
   git push -u origin main
   ```

3. **Create a new Web Service on Render**
   - Click **New → Web Service**
   - Connect your GitHub repo
   - Settings:
     | Field | Value |
     |-------|-------|
     | Environment | `Node` |
     | Build Command | `npm install` (or leave blank) |
     | Start Command | `node server.js` |
     | Instance Type | **Free** |

4. **Set Environment Variables** (in Render → Environment tab):
   ```
   FANTASIA_ME_USERNAME     = your-username
   FANTASIA_ME_PASSWORD     = YourStrongPassword1!
   FANTASIA_ME_NAME         = Your Name
   FANTASIA_PARTNER_USERNAME = partner-username
   FANTASIA_PARTNER_PASSWORD = PartnerStrongPassword1!
   FANTASIA_PARTNER_NAME    = Partner's Name
   PORT                     = 10000
   ```

5. **Deploy** — Render builds and starts the app. Takes ~2 minutes.

6. **Share the URL** — Send your partner the Render URL and their username/password over any secure channel (WhatsApp, iMessage, etc.).

> ⚠️ **Free tier note:** Render free services spin down after 15 minutes of inactivity and take ~30 seconds to wake up on first visit. Upgrade to the $7/month plan for always-on.

---

### Option 2 — Railway.app (Also free, faster cold starts)

1. Go to [railway.app](https://railway.app) and sign in with GitHub
2. Click **New Project → Deploy from GitHub repo**
3. Select your Fantasia repo
4. Add the same environment variables as above under **Variables**
5. Railway auto-detects Node and deploys. You get a URL like `fantasia.up.railway.app`

---

### Option 3 — Run Locally (same WiFi / network)

Both of you need to be on the same network, or you expose it via a tunnel.

**Start the server:**
```bash
node server.js
```

**Find your local IP:**
```powershell
ipconfig
# Look for IPv4 Address, e.g. 192.168.1.42
```

**Your partner visits:** `http://192.168.1.42:5180`

**For access over the internet (without deploying), use a tunnel:**
```bash
# Install ngrok from https://ngrok.com/download, then:
ngrok http 5180
# You get a public URL like https://abc123.ngrok.io — share that link
```

---

## 🔑 Default Accounts

When first run with no database, the app creates two accounts:

| Account | Default username | Default password |
|---------|-----------------|-----------------|
| You | `me` | `change-me-now` |
| Partner | `partner` | `change-partner-now` |

**Change these immediately** via Settings → Account Security, or set via environment variables before deploying.

---

## 📱 Add to Home Screen (Mobile)

For the best experience, both of you should add it to your phone home screen:

**iPhone (Safari):**
1. Open the app URL in Safari
2. Tap the Share button → **Add to Home Screen**
3. Name it "Fantasia" → Add

**Android (Chrome):**
1. Open the app URL in Chrome
2. Tap the three-dot menu → **Add to Home Screen**
3. Name it → Add

It will open full-screen like a native app.

---

## 🛠️ Local Development

```bash
# Install (no dependencies — pure Node.js)
# Just run:
node server.js

# App runs at:
http://localhost:5180
```

---

## 🔒 Security Notes

- All passwords are hashed with PBKDF2 (120,000 iterations)
- Sessions expire after 30 days
- Rate limiting on login (12 attempts per minute per IP)
- No third-party tracking or analytics
- Media files stored server-side in `/uploads/`
- For production, use HTTPS (Render/Railway handle this automatically)

---

## 💾 Data & Backups

- All data lives in `data/fantasia-db.json`
- Automatic backups in `backups/` folder
- Export your data anytime via Settings → Export Data
- On Render/Railway, data persists between deploys on the same instance

> For permanent storage on free tiers, consider adding a free [PlanetScale](https://planetscale.com) or [Supabase](https://supabase.com) database, or upgrade to a paid plan with a persistent disk.
