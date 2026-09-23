import mongoose from 'mongoose';

let memoryServer = null;

/**
 * Connect to MongoDB.
 *
 * Order of preference:
 *   1. MONGODB_URI (local mongod or Atlas)
 *   2. an in-memory MongoDB (mongodb-memory-server), so the project runs on a
 *      machine with nothing installed — data lives only for that process.
 */
export async function connectDb() {
  const uri = process.env.MONGODB_URI;
  const forceMemory = String(process.env.USE_MEMORY_DB).toLowerCase() === 'true';

  if (uri && !forceMemory) {
    try {
      await mongoose.connect(uri, { serverSelectionTimeoutMS: 3000 });
      console.log(`[db] connected to ${redact(uri)}`);
      return;
    } catch (err) {
      console.warn(`[db] could not reach ${redact(uri)} (${err.message})`);
      console.warn('[db] falling back to an in-memory MongoDB');
    }
  }

  let MongoMemoryServer;
  try {
    ({ MongoMemoryServer } = await import('mongodb-memory-server'));
  } catch {
    throw new Error(
      'No MongoDB available. Either start a local mongod / set MONGODB_URI to an ' +
        'Atlas cluster, or install the in-memory fallback with ' +
        '`npm install mongodb-memory-server`.'
    );
  }

  memoryServer = await MongoMemoryServer.create();
  const memoryUri = memoryServer.getUri('flux');
  await mongoose.connect(memoryUri);
  console.log('[db] connected to in-memory MongoDB (data is NOT persisted)');
  // It is a real mongod on a random port, so you can point Compass or mongosh
  // at it while the server is running — handy for inspecting documents.
  console.log(`[db] inspect it with: mongosh "${memoryUri}"`);
}

export async function disconnectDb() {
  await mongoose.disconnect();
  if (memoryServer) await memoryServer.stop();
}

/** Hide credentials before a connection string hits the logs. */
function redact(uri) {
  return uri.replace(/\/\/([^:@/]+):([^@/]+)@/, '//$1:****@');
}

export const nowSec = () => Math.floor(Date.now() / 1000);
