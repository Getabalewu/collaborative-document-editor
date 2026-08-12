import { io } from 'socket.io-client';

const BASE = 'http://127.0.0.1:5000/api';
const SOCKET = 'http://127.0.0.1:5000';

async function req(path, method = 'GET', body, token) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

(async () => {
  const stamp = Date.now();
  const reg = await req('/auth/register', 'POST', { name: 'Diag', email: `diag_${stamp}@example.com`, password: 'secret123' });
  const token = reg.data.token;
  const doc = await req('/documents', 'POST', { title: 'Diag' }, token);
  const docId = doc.data._id;
  console.log('docId', docId);

  const socket = io(SOCKET, { auth: { token }, transports: ['polling', 'websocket'], forceNew: true });
  socket.on('connect_error', (e) => console.log('CONNECT_ERROR', e.message));
  socket.on('connect', () => {
    console.log('CONNECTED');
    socket.emit('join-document', { documentId: docId });
    console.log('EMITTED join-document');
  });
  socket.onAny((event, payload) => console.log('EVENT', event, JSON.stringify(payload)?.slice(0, 200)));
  setTimeout(() => { console.log('done'); process.exit(0); }, 6000);
})();
