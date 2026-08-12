import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import http from 'http';
import { Server } from 'socket.io';
import { connectDB, isDbConnected } from './config/db.js';
import { socketAuth } from './middleware/auth.js';
import authRoutes from './routes/auth.js';
import documentRoutes from './routes/documents.js';
import commentRoutes from './routes/comments.js';
import { setupCollaboration } from './socket/collaboration.js';

const app = express();
const server = http.createServer(app);

const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
const allowedOrigins = clientUrl
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

function isAllowedOrigin(origin, callback) {
  if (!origin || allowedOrigins.includes(origin)) {
    return callback(null, true);
  }
  // Always allow local development origins regardless of CLIENT_URL.
  try {
    const { protocol, hostname } = new URL(origin);
    const isLocal =
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '[::1]';
    if (protocol === 'http:' && isLocal) {
      return callback(null, true);
    }
  } catch {
    /* fall through */
  }
  return callback(null, false);
}

const io = new Server(server, {
  cors: { origin: isAllowedOrigin, credentials: true },
});

app.use(
  cors({
    origin: isAllowedOrigin,
    credentials: true,
  })
);
app.use(express.json({ limit: '10mb' }));

app.get('/api/health', (_req, res) => {
  const dbConnected = isDbConnected();
  res.status(dbConnected ? 200 : 503).json({
    status: dbConnected ? 'ok' : 'degraded',
    db: dbConnected ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString(),
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/documents/:id/comments', commentRoutes);

io.use(socketAuth);
setupCollaboration(io);

const PORT = parseInt(process.env.PORT, 10) || 5000;

async function startServer() {
  server.listen(PORT, () => {
    console.log(`SyncWrite API running on http://localhost:${PORT}`);
  });

  server.on('error', (err) => {
    console.error('Server error:', err.message);
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${PORT} is already in use. Stop the existing process before restarting the server.`);
    }
    process.exit(1);
  });
}

connectDB()
  .then(() => {
    startServer();
  })
  .catch((err) => {
    console.error('Warning: MongoDB connection failed:', err.message);
    console.error('Starting API in degraded mode without DB. Some features will be disabled.');
    startServer();
  });
