# Fantasia

Fantasia is now a full-stack private messaging app for exactly two people. It has a Node backend, real sign-in, persistent server storage, media uploads, live chat updates, stories, privacy settings, backups, export, and browser-to-browser voice/video calling through WebRTC signaling.

## Run

```powershell
node server.js
```

Open:

```text
http://localhost:5180
```

The first server start creates two accounts:

```text
me / change-me-now
partner / change-partner-now
```

Sign in, open Privacy, and change both passwords before putting the app on the internet.

## Send It To Your Partner

Your partner cannot use `file:///C:/...` from far away. Fantasia must run on a machine reachable from the internet.

Good options:

- Deploy it to a Node host such as Render, Railway, Fly.io, a VPS, or your own server.
- Set `PORT` if the host requires it.
- Use HTTPS. Camera, microphone, and screen sharing require HTTPS on real domains.
- Share the public URL with your partner.

Recommended environment variables before first launch:

```text
FANTASIA_ME_USERNAME=yourname
FANTASIA_ME_PASSWORD=use-a-long-private-password
FANTASIA_ME_NAME=Your Name
FANTASIA_PARTNER_USERNAME=partnername
FANTASIA_PARTNER_PASSWORD=another-long-private-password
FANTASIA_PARTNER_NAME=Partner Name
PORT=5180
```

## What Works

- Exactly two accounts.
- Password sign-in and sign-out.
- Live message sync over the internet using server-sent events.
- Persistent messages in `data/fantasia-db.json`.
- Media uploads stored in `uploads/`.
- Text, links, Markdown-style bold/italic/code, replies, forwarding, edit, delete for me, delete for everyone.
- Reactions, pinned messages, starred/saved messages, search, disappearing messages, view-once labels.
- Poll creation and voting.
- Voice notes recorded in the browser and sent as audio.
- Stories/status with 24-hour expiry.
- Shared media gallery.
- Online/last-seen presence and typing indicators.
- Privacy settings and password change.
- Export and backup.
- WebRTC voice/video calls, mute, camera toggle, screen share, and end call.
- Deterministic assistant tools: summary, smart replies, task extraction, mood read.

## Files

- `server.js`: backend, auth, storage, media, live events, call signaling.
- `index.html`: app screens and controls.
- `script.js`: frontend API client, rendering, chat, calls, media, settings.
- `style.css`: responsive UI.
- `data/`: created at runtime for the database.
- `uploads/`: created at runtime for files and voice notes.
- `backups/`: created at runtime for manual backups.

## Important Security Notes

This is a real working full-stack app, but before treating it like Signal or WhatsApp in production, add a reverse proxy with HTTPS, stronger operational hardening, encrypted database/media at rest, and a reviewed end-to-end encryption protocol. The current version protects access with account passwords and private server storage, but the server can still read message contents.

## Verify

```powershell
node --check server.js
node --check script.js
```

Then open two browser windows, sign in as each account, and chat between them.
