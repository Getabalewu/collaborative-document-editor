# SyncWrite — Real-Time Collaborative Document Editor

A production-ready prototype of a Google Docs–style collaborative editor built for the SyncWrite investor demo. Multiple authenticated users can create, edit, and collaborate on documents in real time with presence awareness, comments, version history, and role-based sharing.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18, Vite, TipTap, Yjs |
| Backend | Node.js, Express, Socket.IO |
| Database | MongoDB Atlas |
| Auth | JWT (Bearer tokens) |

## Features

### Core Requirements
- **Authentication** — Register, login, logout with JWT
- **Dashboard** — Create, rename, delete, duplicate, and open documents
- **Rich Text Editor** — Headings, bold, italic, underline, lists, alignment, hyperlinks
- **Real-Time Collaboration** — Yjs CRDT + Socket.IO; changes sync instantly without refresh
- **Presence Awareness** — See who is viewing the document with online avatars

### Bonus Features
- **Auto-save** — Content saves automatically every 2 seconds (debounced) and creates version snapshots every 60 seconds
- **Version History** — Browse and restore previous document versions
- **Comments** — Add, resolve, and manage comments (Viewer / Commenter / Editor permissions)
- **Sharing & Permissions** — Share documents by email with Viewer, Commenter, or Editor roles
- **Live cursors** — TipTap CollaborationCursor shows other users' cursor positions
- **Typing indicators** — See when others are typing
- **Document search** — Filter documents on the dashboard
- **Keyboard shortcuts** — Ctrl+B/I/U for formatting

## Project Structure

```
collaboration-document-editor/
├── backend/
│   ├── src/
│   │   ├── config/db.js          # MongoDB Atlas connection
│   │   ├── models/               # User, Document, Version, Comment
│   │   ├── routes/               # REST API routes
│   │   ├── middleware/auth.js    # JWT auth
│   │   ├── socket/collaboration.js  # Real-time Yjs sync
│   │   └── index.js              # Server entry point
│   └── .env.example
└── frontend/
    ├── src/
    │   ├── pages/                # Login, Register, Dashboard, Editor
    │   ├── components/           # Toolbar, Sidebar
    │   ├── hooks/                # SocketIOProvider for Yjs
    │   └── context/              # Auth context
    └── .env.example
```

## Setup Instructions

### Prerequisites
- Node.js 18+
- MongoDB Atlas cluster (free tier works)

### 1. MongoDB Atlas

1. Create a cluster at [mongodb.com/atlas](https://www.mongodb.com/atlas)
2. Create a database user with read/write access
3. Whitelist your IP (or `0.0.0.0/0` for development)
4. Copy the connection string

### 2. Backend

```bash
cd backend
npm install
```

Create `backend/.env`:

```env
MONGODB_URI=mongodb+srv://YOUR_USER:YOUR_PASSWORD@YOUR_CLUSTER.mongodb.net/syncwrite?retryWrites=true&w=majority
JWT_SECRET=change-this-to-a-long-random-string
PORT=5000
CLIENT_URL=http://localhost:5173
```

Start the server:

```bash
npm run dev
```

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173)

### 4. Test Real-Time Collaboration

1. Register two users in separate browser windows (use incognito for the second)
2. User A creates a document and shares it with User B's email (Editor permission)
3. Open the same document in both windows — edits appear instantly

## API Overview

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Create account |
| POST | `/api/auth/login` | Sign in |
| GET | `/api/documents` | List documents |
| POST | `/api/documents` | Create document |
| PATCH | `/api/documents/:id` | Update title/content |
| POST | `/api/documents/:id/share` | Share with permission |
| GET | `/api/documents/:id/versions` | Version history |
| GET | `/api/documents/:id/comments` | List comments |

WebSocket events: `join-document`, `ydoc-update`, `ydoc-sync`, `presence-update`, `typing`

## Architecture Decisions

- **Yjs CRDT** for conflict-free real-time editing — industry standard for collaborative text
- **TipTap** on ProseMirror for rich text with built-in collaboration extensions
- **JWT** for stateless auth; tokens passed to Socket.IO via handshake auth
- **Permission middleware** on every document route and socket join — unauthorized users cannot edit
- **Debounced auto-save** to MongoDB plus periodic version snapshots for history

## License

MIT
