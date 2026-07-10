# Fantasia Technical Docs

## Architecture

Fantasia is a Node-served full-stack app:

- `server.js` serves the frontend, authenticates exactly two accounts, persists app data, stores uploads, broadcasts real-time events, and relays WebRTC call signals.
- `index.html`, `style.css`, and `script.js` are the browser app.
- `data/fantasia-db.json` is created at runtime for users, sessions, messages, stories, settings, presence, and audit events.
- `uploads/` stores uploaded files and voice notes.
- `backups/` stores manual database backups.

## Runtime API

- `POST /api/login`
- `POST /api/logout`
- `GET /api/session`
- `GET /api/events`
- `POST /api/presence`
- `POST /api/presence/offline`
- `POST /api/typing`
- `POST /api/messages`
- `PATCH /api/messages/:id`
- `DELETE /api/messages/:id?mode=me|everyone`
- `POST /api/messages/:id/reactions`
- `POST /api/messages/:id/poll`
- `POST /api/stories`
- `PATCH /api/settings`
- `POST /api/password`
- `POST /api/security-alert`
- `POST /api/calls/signal`
- `POST /api/backup`
- `GET /api/export`

## Data Model

The JSON database contains:

- `users`: the only two accounts.
- `sessions`: bearer tokens with expiry.
- `messages`: text, attachments, replies, reactions, poll data, pin/star state, visibility, expiry, edit timestamps.
- `stories`: 24-hour private status posts.
- `presence`: online/offline and last-seen state.
- `settings`: shared privacy and app settings.
- `audit`: recent security and account events.

## Deployment

Run locally:

```powershell
node server.js
```

For internet use, deploy to a Node host and use HTTPS. WebRTC calls, microphone access, camera access, and screen sharing require HTTPS outside localhost.

Set these before the first launch:

```text
FANTASIA_ME_USERNAME=
FANTASIA_ME_PASSWORD=
FANTASIA_ME_NAME=
FANTASIA_PARTNER_USERNAME=
FANTASIA_PARTNER_PASSWORD=
FANTASIA_PARTNER_NAME=
PORT=
```

## Security

Current working protections:

- Only two configured accounts exist.
- Passwords are salted and hashed with PBKDF2.
- Sessions use random bearer tokens with expiry.
- Uploads are written server-side with generated filenames.
- Message delete-for-everyone is limited to the sender.
- Password changes require the current password.
- Export, backup, settings, calls, and messages require authentication.

Production hardening still recommended:

- Put the app behind HTTPS and a reverse proxy.
- Store `data/`, `uploads/`, and `backups/` on persistent encrypted storage.
- Add request rate limits at the proxy.
- Add true end-to-end encryption if the server must never read messages.
- Add managed secrets instead of default passwords.

## Testing

Smoke-tested locally:

- Server start.
- Login.
- Message create.
- Session fetch with saved message.

Manual end-to-end test:

1. Start `node server.js`.
2. Open two browsers or profiles.
3. Sign in as each account.
4. Send messages both directions.
5. Test edit, delete, reaction, pin, star, poll, story, upload, voice note, backup, export.
6. Test video call on HTTPS deployment.
