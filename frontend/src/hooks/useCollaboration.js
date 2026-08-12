import * as Y from 'yjs';
import { Awareness } from 'y-protocols/awareness';
import { encodeAwarenessUpdate, applyAwarenessUpdate } from 'y-protocols/awareness';
import { io } from 'socket.io-client';
import { getSocketUrl } from '../api/client';

export class SocketIOProvider {
  constructor(documentId, ydoc, { token, onSynced, onPermission, onPresence, onTyping, onError, onRestore }) {
    this.documentId = documentId;
    this.ydoc = ydoc;
    this.synced = false;
    this.awareness = new Awareness(ydoc);

    this.socket = io(getSocketUrl(), {
      auth: { token },
      transports: ['polling', 'websocket'],
    });

    this.socket.on('connect', () => {
      this.socket.emit('join-document', { documentId });
    });

    this.socket.on('ydoc-sync', ({ state, permission, canEdit }) => {
      Y.applyUpdate(this.ydoc, new Uint8Array(state), this);
      this.synced = true;
      onSynced?.();
      onPermission?.({ permission, canEdit });
    });

    this.socket.on('ydoc-update', (updateArray) => {
      Y.applyUpdate(this.ydoc, new Uint8Array(updateArray), 'remote');
    });

    this.socket.on('ydoc-restore', ({ state }) => {
      Y.applyUpdate(this.ydoc, new Uint8Array(state), 'remote');
      onRestore?.();
    });

    this.ydoc.on('update', (update, origin) => {
      if (origin === this || origin === 'remote') return;
      this.socket.emit('ydoc-update', Array.from(update));
    });

    this.awareness.on('update', ({ added, updated, removed }, origin) => {
      if (origin === 'remote') return;
      const changed = added.concat(updated, removed);
      const encoded = encodeAwarenessUpdate(this.awareness, changed);
      this.socket.emit('awareness-broadcast', Array.from(encoded));
    });

    this.socket.on('awareness-broadcast', (data) => {
      applyAwarenessUpdate(this.awareness, new Uint8Array(data), 'remote');
    });

    this.socket.on('presence-update', ({ users }) => {
      onPresence?.(users);
    });

    this.socket.on('user-typing', (data) => {
      onTyping?.(data);
    });

    this.socket.on('collab-error', ({ message }) => {
      onError?.(message);
    });
  }

  emitTyping(isTyping) {
    this.socket.emit('typing', { isTyping });
  }

  setUser(user) {
    this.awareness.setLocalStateField('user', user);
  }

  destroy() {
    this.awareness.destroy();
    this.socket.emit('leave-document');
    this.socket.disconnect();
  }
}
