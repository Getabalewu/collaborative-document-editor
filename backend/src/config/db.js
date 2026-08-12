import mongoose from 'mongoose';

const CONNECT_OPTIONS = {
  serverSelectionTimeoutMS: 30000,
  connectTimeoutMS: 30000,
  socketTimeoutMS: 45000,
  maxPoolSize: 10,
};

const MAX_ATTEMPTS = 5;
const RETRY_DELAY_MS = 3000;

function normalizeMongoUri(uri) {
  if (!uri || !uri.includes('mongodb')) return uri;

  // Only normalize URIs that already use percent-encoding in credentials.
  if (!uri.includes('%')) return uri;

  const match = uri.match(/^(mongodb(?:\+srv)?:\/\/)(.+)$/);
  if (!match) return uri;

  const [, prefix, remainder] = match;
  const atIndex = remainder.lastIndexOf('@');
  if (atIndex === -1) return uri;

  const userInfo = remainder.slice(0, atIndex);
  const hostAndRest = remainder.slice(atIndex + 1);
  const colonIndex = userInfo.indexOf(':');
  if (colonIndex === -1) return uri;

  const username = userInfo.slice(0, colonIndex);
  const password = userInfo.slice(colonIndex + 1);
  const encodedUser = encodeURIComponent(decodeURIComponent(username));
  const encodedPass = encodeURIComponent(decodeURIComponent(password));
  return `${prefix}${encodedUser}:${encodedPass}@${hostAndRest}`;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function connectDB() {
  const rawUri = process.env.MONGODB_URI;
  if (!rawUri) {
    throw new Error('MONGODB_URI is not defined in environment variables');
  }

  const uri = normalizeMongoUri(rawUri);
  mongoose.set('strictQuery', false);

  let lastError;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      await mongoose.connect(uri, CONNECT_OPTIONS);
      console.log('MongoDB Atlas connected to', mongoose.connection.host);

      mongoose.connection.on('error', (err) => {
        console.error('MongoDB connection error:', err);
      });

      mongoose.connection.on('disconnected', () => {
        console.warn('MongoDB disconnected');
      });

      return;
    } catch (err) {
      lastError = err;
      console.error(
        `MongoDB connection attempt ${attempt}/${MAX_ATTEMPTS} failed:`,
        err.message || err
      );

      if (attempt < MAX_ATTEMPTS) {
        console.log(`Retrying in ${RETRY_DELAY_MS / 1000}s...`);
        await mongoose.disconnect().catch(() => {});
        await wait(RETRY_DELAY_MS);
      }
    }
  }

  console.error('Failed to connect to MongoDB Atlas:', lastError?.message || lastError);
  throw lastError;
}

export function isDbConnected() {
  return mongoose.connection.readyState === 1;
}
