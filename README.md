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
- **Authentication** — Register, login, logout with JWT (+ password reset flow)
- **Dashboard** — Create, rename, delete, duplicate, and open documents
- **Recently Opened** — Dashboard shows documents you opened recently
- **Rich Text Editor** — Headings, bold, italic, underline, lists, alignment, hyperlinks
- **Real-Time Collaboration** — Yjs CRDT + Socket.IO; changes sync instantly without refresh
- **Presence Awareness** — See who is viewing the document with online avatars

### Bonus Features
- **Auto-save** — Content saves automatically every ~2 seconds (debounced) and creates version snapshots every 60 seconds
- **Version History** — Browse and restore previous versions (with full Yjs state) — restore syncs to all live collaborators
- **Comments** — Add, reply to, resolve, and delete your own comments (Viewer / Commenter / Editor permissions)
- **Sharing & Permissions** — Share documents by email with Viewer, Commenter, or Editor roles
- **Live cursors** — TipTap CollaborationCursor shows other users' cursor positions
- **Typing indicators** — See when others are typing
- **Document search** — Filter documents on the dashboard
- **Keyboard shortcuts** — Ctrl+B/I/U for formatting, Ctrl+S to save
- **Dark mode** — Persistent theme toggle
- **Export / Import Markdown** — `.md` export and import

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

> `CLIENT_URL` accepts a comma-separated list of allowed origins (e.g. add your deployed frontend URL). Local development origins (`http://localhost:*`, `http://127.0.0.1:*`) are always allowed. See `backend/.env.example` for optional SMTP settings used by the password-reset email.

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

### Troubleshooting

**MongoDB Atlas connection fails / "degraded mode without DB"**

1. In [Atlas → Network Access](https://cloud.mongodb.com/), add your current IP or `0.0.0.0/0` (development only).
2. Confirm `MONGODB_URI` in `backend/.env` matches Atlas → Connect → Drivers (correct user, password, cluster host).
3. If your password contains `@`, `:`, or `/`, percent-encode those characters in the URI (e.g. `@` → `%40`).
4. Atlas free-tier clusters can take 15–30s to respond on cold start; the backend retries up to 5 times automatically.

**Nodemailer / `node_modules` triggers server restart**

The dev script only watches `backend/src`. Run `npm run dev` from `backend/` (not a broad `node --watch` on the whole project).

**Run everything from the repo root**

```bash
npm install
npm run install:all
npm run dev
```

This starts backend (port 5000) and frontend (port 5173) together.

### 4. Test Real-Time Collaboration

1. Register two users in separate browser windows (use incognito for the second)
2. User A creates a document and shares it with User B's email (Editor permission)
3. Open the same document in both windows — edits appear instantly

## API Overview

All endpoints (except register/login/forgot-password) require a `Authorization: Bearer <token>` header.

### Auth

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Create account (`name`, `email`, `password`) |
| POST | `/api/auth/login` | Sign in → returns `token` + `user` |
| POST | `/api/auth/logout` | Log out |
| GET | `/api/auth/me` | Get current user |
| POST | `/api/auth/forgot-password` | Request password reset (`email`) |
| POST | `/api/auth/reset-password` | Reset password (`token`, `password`) |

### Documents

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/documents` | List owned + shared documents |
| GET | `/api/documents/recent` | Recently opened documents |
| POST | `/api/documents` | Create document |
| GET | `/api/documents/:id` | Get document + `permission` + `hasYjsState` |
| PATCH | `/api/documents/:id` | Update `title` (owner) / `content` (editor) |
| POST | `/api/documents/:id/open` | Record a document open |
| DELETE | `/api/documents/:id` | Delete document (owner) |
| POST | `/api/documents/:id/duplicate` | Duplicate document |
| POST | `/api/documents/:id/save` | Auto-save (`content`, optional `title`, `yjsState`, `createVersion`) |
| GET | `/api/documents/:id/versions` | Version history |
| POST | `/api/documents/:id/versions/:versionId/restore` | Restore a version (owner/editor) |
| GET | `/api/documents/:id/collaborators` | Owner + collaborators |
| POST | `/api/documents/:id/share` | Share with a user (`email`, `permission`) |
| DELETE | `/api/documents/:id/share/:userId` | Remove a collaborator |
| GET | `/api/documents/search/users?q=` | Search registered users |

### Comments

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/documents/:id/comments` | List comments (top-level + replies) |
| POST | `/api/documents/:id/comments` | Add comment or reply (`text`, optional `parent`) |
| PATCH | `/api/documents/:id/comments/:commentId` | Toggle `resolved` or edit own `text` |
| DELETE | `/api/documents/:id/comments/:commentId` | Delete own comment (author or owner); deletes replies too |

### WebSocket events (Socket.IO)

| Event | Direction | Description |
|-------|-----------|-------------|
| `join-document` | client → server | Join a document room (enforces permissions) |
| `ydoc-sync` | server → client | Initial full Yjs state + `permission`/`canEdit` |
| `ydoc-update` | both | Incremental Yjs CRDT updates |
| `ydoc-restore` | server → client | Full Yjs state after a version restore |
| `presence-update` | server → client | Online users in the room |
| `awareness-broadcast` | both | Relayed y-protocols awareness (live cursors) |
| `typing` / `user-typing` | both | Typing indicators |

## Database Schema

```
User
  name            String
  email           String (unique)
  password        String (bcrypt hash)
  passwordResetToken / passwordResetExpires

Document
  title           String
  content         String (HTML, for non-collaborative seed/reload)
  yjsState        Buffer  (full Yjs CRDT state, source of truth for live editing)
  owner           ObjectId -> User
  collaborators   [{ user: ObjectId -> User, permission: 'viewer' | 'commenter' | 'editor' }]

DocumentVersion
  document        ObjectId -> Document
  title           String
  content         String
  yjsState        Buffer
  savedBy         ObjectId -> User
  label           String ('Auto-save' | 'Before restore')

Comment
  document        ObjectId -> Document
  author          ObjectId -> User
  text            String
  resolved        Boolean
  parent          ObjectId -> Comment (null for top-level, replies are one level deep)

RecentDocument
  user            ObjectId -> User
  document        ObjectId -> Document
  openedAt        Date
  (unique compound index: user + document)
```

## Architecture Decisions

- **Yjs CRDT** for conflict-free real-time editing — industry standard for collaborative text. The full Yjs state (`yjsState`) is persisted to MongoDB and is the source of truth during live editing; HTML `content` is kept in sync for seeding new docs and for restore fallbacks.
- **TipTap** on ProseMirror for rich text with built-in collaboration + cursor extensions
- **JWT** for stateless auth; tokens passed to Socket.IO via handshake auth
- **Permission middleware** on every document route and socket join — unauthorized users cannot edit (Viewer/Commenter/Editor enforced on both HTTP and WebSocket paths)
- **Debounced auto-save** to MongoDB plus periodic Yjs-based version snapshots for history
- **Version restore** writes the restored Yjs state into the in-memory doc and broadcasts `ydoc-restore` so every connected client converges without a refresh

## License

MIT
