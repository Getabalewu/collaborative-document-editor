import { spawn } from 'child_process';
import { io } from 'socket.io-client';
import * as Y from 'yjs';

const BACKEND_DIR = 'C:/Users/Quantum Technologies/Downloads/collaborative-document-editor/backend';
const PORT = 5002;
const BASE = `http://127.0.0.1:${PORT}/api`;
const SOCKET = `http://127.0.0.1:${PORT}`;

const serverLogs = [];

async function req(path, method = 'GET', body, token) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

function connectSocket(token) {
  return new Promise((resolve, reject) => {
    const socket = io(SOCKET, { auth: { token }, transports: ['polling', 'websocket'], forceNew: true });
    socket.on('connect_error', reject);
    socket.on('connect', () => resolve(socket));
  });
}

function waitFor(socket, event, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), timeout);
    socket.once(event, (payload) => { clearTimeout(t); resolve(payload); });
  });
}

function waitForPresence(socket, minUsers, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout waiting for ${minUsers} presence users`)), timeout);
    function handler(payload) {
      if (payload?.users?.length >= minUsers) {
        clearTimeout(t);
        socket.off('presence-update', handler);
        resolve(payload);
      }
    }
    socket.on('presence-update', handler);
  });
}

let failures = 0;
function assert(cond, msg) {
  if (!cond) { failures++; console.log('FAIL:', msg); }
  else console.log('ok:', msg);
}

function makeSampleUpdate(text = 'x') {
  const doc = new Y.Doc();
  doc.getText('sample').insert(0, text);
  return Array.from(Y.encodeStateAsUpdate(doc));
}

async function waitForHealth(retries = 30) {
  for (let i = 0; i < retries; i++) {
    try {
      const r = await fetch(`${BASE}/health`);
      if (r.ok) return;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error('server never became healthy');
}

const server = spawn('node', ['src/index.js'], {
  cwd: BACKEND_DIR,
  env: { ...process.env, PORT: String(PORT) },
  stdio: ['ignore', 'pipe', 'pipe'],
});
server.stdout.on('data', (d) => serverLogs.push(String(d)));
server.stderr.on('data', (d) => serverLogs.push(String(d)));

(async () => {
  await waitForHealth();

  const stamp = Date.now();
  const userA = await req('/auth/register', 'POST', { name: 'Alice', email: `alice_${stamp}@example.com`, password: 'secret123' });
  const userB = await req('/auth/register', 'POST', { name: 'Bob', email: `bob_${stamp}@example.com`, password: 'secret123' });
  assert(!!userA.data.token && !!userB.data.token, 'register A + B');
  const tokenA = userA.data.token;
  const tokenB = userB.data.token;

  const doc = await req('/documents', 'POST', { title: 'Collab E2E' }, tokenA);
  const docId = doc.data._id;
  assert(!!docId, 'create doc');

  const share = await req(`/documents/${docId}/share`, 'POST', { email: `bob_${stamp}@example.com`, permission: 'editor' }, tokenA);
  assert(share.status === 200, 'share with Bob as editor');

  const socketA = await connectSocket(tokenA);
  const syncAP = waitFor(socketA, 'ydoc-sync');
  socketA.emit('join-document', { documentId: docId });
  const syncA = await syncAP;
  assert(syncA.canEdit === true, 'A receives ydoc-sync + canEdit');

  const presenceAfterB = waitForPresence(socketA, 2);
  const socketB = await connectSocket(tokenB);
  const syncB = waitFor(socketB, 'ydoc-sync');
  socketB.emit('join-document', { documentId: docId });
  await syncB;
  const presence2 = await presenceAfterB;
  assert(presence2.users.length >= 2, `presence shows 2 users (got ${presence2.users.length})`);

  const bGotUpdate = waitFor(socketB, 'ydoc-update');
  const aUpdate = makeSampleUpdate('hello');
  socketA.emit('ydoc-update', aUpdate);
  const bUpdate = await bGotUpdate;
  assert(JSON.stringify(bUpdate) === JSON.stringify(aUpdate), 'B receives A ydoc-update');

  const userC = await req('/auth/register', 'POST', { name: 'Eve', email: `eve_${stamp}@example.com`, password: 'secret123' });
  const socketC = await connectSocket(userC.data.token);
  const cError = waitFor(socketC, 'collab-error');
  socketC.emit('join-document', { documentId: docId });
  const errPayload = await cError;
  assert(errPayload && errPayload.message, 'unauthorized user rejected');

  const aRestore = waitFor(socketA, 'ydoc-restore');
  const sampleState = makeSampleUpdate('version');
  await req(`/documents/${docId}/save`, 'POST', { content: '<p>x</p>', title: 'Collab E2E', createVersion: true, yjsState: sampleState }, tokenA);
  const versions = await req(`/documents/${docId}/versions`, 'GET', null, tokenA);
  const restore = await req(`/documents/${docId}/versions/${versions.data.versions[0]._id}/restore`, 'POST', null, tokenA);
  assert(restore.status === 200, 'restore version');
  await aRestore;
  assert(true, 'A receives ydoc-restore broadcast');

  const bTyping = waitFor(socketB, 'user-typing');
  socketA.emit('typing', { isTyping: true });
  const typingPayload = await bTyping;
  assert(typingPayload.isTyping === true && typingPayload.name === 'Alice', 'B receives typing indicator');

  socketA.disconnect();
  socketB.disconnect();
  socketC.disconnect();

  const cleanup = await req(`/documents/${docId}`, 'DELETE', null, tokenA);
  assert(cleanup.status === 200, 'cleanup doc');

  console.log(failures === 0 ? '\nALL E2E TESTS PASSED' : `\n${failures} FAILURES`);
  server.kill();
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => {
  console.error('ERROR:', e.message);
  server.kill();
  process.exit(1);
});
