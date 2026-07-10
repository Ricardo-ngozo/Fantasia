const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');

function waitForServer(url, timeoutMs = 10000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      fetch(url)
        .then(() => resolve())
        .catch(() => {
          if (Date.now() - start > timeoutMs) reject(new Error(`Server did not start at ${url}`));
          else setTimeout(tryOnce, 200);
        });
    };
    tryOnce();
  });
}

test('restore endpoint recovers the latest backup', async () => {
  const server = spawn(process.execPath, ['server.js'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, PORT: '5191' },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let output = '';
  server.stdout.on('data', (chunk) => { output += chunk.toString(); });
  server.stderr.on('data', (chunk) => { output += chunk.toString(); });

  try {
    await waitForServer('http://127.0.0.1:5191');

    const loginRes = await fetch('http://127.0.0.1:5191/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'me', password: 'change-me-now' })
    });
    assert.equal(loginRes.status, 200);
    const loginData = await loginRes.json();
    assert.ok(loginData.token);

    const messageText = `restore-test-${Date.now()}`;
    const createRes = await fetch('http://127.0.0.1:5191/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${loginData.token}` },
      body: JSON.stringify({ text: messageText })
    });
    assert.equal(createRes.status, 201);

    const backupRes = await fetch('http://127.0.0.1:5191/api/backup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${loginData.token}` },
      body: '{}'
    });
    assert.equal(backupRes.status, 200);

    const deleteRes = await fetch('http://127.0.0.1:5191/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${loginData.token}` },
      body: JSON.stringify({ text: `delete-me-${Date.now()}` })
    });
    assert.equal(deleteRes.status, 201);

    const restoreRes = await fetch('http://127.0.0.1:5191/api/restore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${loginData.token}` },
      body: '{}'
    });
    assert.equal(restoreRes.status, 200);

    const sessionRes = await fetch('http://127.0.0.1:5191/api/session', {
      headers: { Authorization: `Bearer ${loginData.token}` }
    });
    assert.equal(sessionRes.status, 200);
    const sessionData = await sessionRes.json();
    assert.ok(sessionData.messages.some((message) => message.text === messageText));
  } finally {
    server.kill('SIGTERM');
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
});
