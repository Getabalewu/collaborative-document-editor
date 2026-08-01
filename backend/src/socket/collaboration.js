import * as Y from 'yjs';
import Document from '../models/Document.js';
import User from '../models/User.js';
import { getDocumentAccess, canEdit, canView } from '../utils/permissions.js';

const docs = new Map();
const saveTimers = new Map();

function getUserColor(userId) {
  const colors = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
    '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9',
  ];
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

async function getOrCreateYDoc(documentId) {
  if (docs.has(documentId)) {
    return docs.get(documentId);
  }

  const ydoc = new Y.Doc();
  const doc = await Document.findById(documentId);

  if (doc?.yjsState?.length) {
    Y.applyUpdate(ydoc, new Uint8Array(doc.yjsState));
  }

  const entry = {
    ydoc,
    clients: new Set(),
    awareness: new Map(),
  };
  docs.set(documentId, entry);
  return entry;
}

function scheduleSave(documentId, ydoc) {
  if (saveTimers.has(documentId)) {
    clearTimeout(saveTimers.get(documentId));
  }
  const timer = setTimeout(async () => {
    try {
      const state = Y.encodeStateAsUpdate(ydoc);
      await Document.findByIdAndUpdate(documentId, {
        yjsState: Buffer.from(state),
      });
    } catch (err) {
      console.error('Auto-save failed:', err.message);
    }
  }, 2000);
  saveTimers.set(documentId, timer);
}

function broadcastPresence(io, documentId, entry) {
  const users = Array.from(entry.awareness.values());
  io.to(`doc:${documentId}`).emit('presence-update', { users });
}

export function setupCollaboration(io) {
  io.on('connection', async (socket) => {
    const user = await User.findById(socket.userId).select('name email');
    if (!user) {
      socket.disconnect();
      return;
    }
    socket.user = user;

    socket.on('join-document', async ({ documentId }) => {
      try {
        const { doc, permission } = await getDocumentAccess(documentId, socket.userId);
        if (!doc || !canView(permission)) {
          socket.emit('collab-error', { message: 'Access denied' });
          return;
        }

        if (socket.documentId) {
          socket.leave(`doc:${socket.documentId}`);
        }

        socket.documentId = documentId;
        socket.permission = permission;
        socket.join(`doc:${documentId}`);

        const entry = await getOrCreateYDoc(documentId);
        entry.clients.add(socket.id);

        entry.awareness.set(socket.id, {
          id: socket.userId,
          name: user.name,
          color: getUserColor(user._id.toString()),
          online: true,
        });

        const state = Y.encodeStateAsUpdate(entry.ydoc);
        socket.emit('ydoc-sync', {
          state: Array.from(state),
          permission,
          canEdit: canEdit(permission),
        });

        broadcastPresence(io, documentId, entry);

        socket.emit('joined-document', {
          documentId,
          permission,
          canEdit: canEdit(permission),
        });
      } catch (err) {
        socket.emit('collab-error', { message: err.message });
      }
    });

    socket.on('ydoc-update', (updateArray) => {
      if (!socket.documentId || !canEdit(socket.permission)) return;

      const entry = docs.get(socket.documentId);
      if (!entry) return;

      const update = new Uint8Array(updateArray);
      Y.applyUpdate(entry.ydoc, update, socket.id);
      socket.to(`doc:${socket.documentId}`).emit('ydoc-update', updateArray);
      scheduleSave(socket.documentId, entry.ydoc);
    });

    socket.on('awareness-broadcast', (data) => {
      if (!socket.documentId) return;
      socket.to(`doc:${socket.documentId}`).emit('awareness-broadcast', data);
    });

    socket.on('typing', ({ isTyping }) => {
      if (!socket.documentId) return;
      socket.to(`doc:${socket.documentId}`).emit('user-typing', {
        userId: socket.userId,
        name: socket.user.name,
        isTyping,
      });
    });

    socket.on('leave-document', () => {
      handleDisconnect(socket, io);
    });

    socket.on('disconnect', () => {
      handleDisconnect(socket, io);
    });
  });
}

function handleDisconnect(socket, io) {
  if (!socket.documentId) return;

  const entry = docs.get(socket.documentId);
  if (entry) {
    entry.clients.delete(socket.id);
    entry.awareness.delete(socket.id);
    broadcastPresence(io, socket.documentId, entry);

    if (entry.clients.size === 0) {
      const state = Y.encodeStateAsUpdate(entry.ydoc);
      Document.findByIdAndUpdate(socket.documentId, {
        yjsState: Buffer.from(state),
      }).catch(console.error);
      docs.delete(socket.documentId);
    }
  }

  socket.leave(`doc:${socket.documentId}`);
  socket.documentId = null;
}
