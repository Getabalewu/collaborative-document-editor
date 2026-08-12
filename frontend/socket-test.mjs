import { io } from 'socket.io-client';

const BASE = 'http://127.0.0.1:5000/api';
const SOCKET = 'http://127.0.0.1:5000';

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

function waitFor(socket, event, timeout = 8000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), timeout);
    socket.once(event, (payload) => {
      clearTimeout(t);
      resolve(payload);
    });
  });
}

let failures = 0;
function assert(cond, msg) {
  if (!cond) { failures++; console.log('FAIL:', msg); }
  else console.log('ok:', msg);
}

(async () => {
  const stamp = Date.now();
  const userA = await req('/auth/register', 'POST', { name: 'Alice', email: `alice_${stamp}@example.com`, password: 'secret123' });
  const userB = await req('/auth/register', 'POST', { name: 'Bob', email: `bob_${stamp}@example.com`, password: 'secret123' });
  const tokenA = userA.data.token;
  const tokenB = userB.data.token;

  const doc = await req('/documents', 'POST', { title: 'Collab Test' }, tokenA);
  const docId = doc.data._id;
  assert(!!docId, 'create doc');

  const share = await req(`/documents/${docId}/share`, 'POST', { email: `bob_${stamp}@example.com`, permission: 'editor' }, tokenA);
  assert(share.status === 200, 'share with Bob as editor');

  const socketA = await connectSocket(tokenA);
  const socketB = await connectSocket(tokenB);

  const syncA = waitFor(socketA, 'ydoc-sync');
  socketA.emit('join-document', { documentId: docId });
  const syncAPayload = await syncA;
  assert(syncAPayload.canEdit === true, 'A receives sync + canEdit');

  const presence1 = waitFor(socketA, 'presence-update');
  const syncB = waitFor(socketB, 'ydoc-sync');
  socketB.emit('join-document', { documentId: docId });
  await syncB;
  const presence2 = await presence1;
  assert(presence2.users.length >= 2, `presence shows 2 users (got ${presence2.users.length})`);

  // A sends an update, B must receive it
  const bGotUpdate = waitFor(socketB, 'ydoc-update');
  const aUpdate = new Uint8Array([0, 1, 2, 3]);
  socketA.emit('ydoc-update', Array.from(aUpdate));
  const bUpdate = await bGotUpdate;
  assert(JSON.stringify(bUpdate) === JSON.stringify(Array.from(aUpdate)), 'B receives A ydoc-update');

  // Viewer (no access) must be rejected
  const userC = await req('/auth/register', 'POST', { name: 'Eve', email: `eve_${stamp}@example.com`, password: 'secret123' });
  const socketC = await connectSocket(userC.data.token);
  const cError = waitFor(socketC, 'collab-error');
  socketC.emit('join-document', { documentId: docId });
  const errPayload = await cError;
  assert(errPayload && errPayload.message, 'unauthorized user rejected');

  // Restore broadcast: A should receive ydoc-restore
  const aRestore = waitFor(socketA, 'ydoc-restore');
  const saved = await req(`/documents/${docId}/save`, 'POST', { content: '<p>x</p>', title: 'Collab Test', createVersion: true, yjsState: Array.from(new Uint8Array([9,9,9])) }, tokenA);
  const versions = await req(`/documents/${docId}/versions`, 'GET', null, tokenA);
  const restore = await req(`/documents/${docId}/versions/${versions.data.versions[0]._id}/restore`, 'POST', null, tokenA);
  assert(restore.status === 200, 'restore version');
  await aRestore;
  assert(true, 'A receives ydoc-restore broadcast');

  // Typing event
  const bTyping = waitFor(socketB, 'user-typing');
  socketA.emit('typing', { isTyping: true });
  const typingPayload = await bTyping;
  assert(typingPayload.isTyping === true && typingPayload.name === 'Alice', 'B receives typing indicator');

  socketA.emit('leave-document');
  socketB.emit('leave-document');
  socketC.disconnect();
  socketA.disconnect();
  socketB.disconnect();

  const cleanup = await req(`/documents/${docId}`, 'DELETE', null, tokenA);
  assert(cleanup.status === 200, 'cleanup doc');

  console.log(failures === 0 ? '\nALL SOCKET COLLABORATION TESTS PASSED' : `\n${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
