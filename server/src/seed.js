/**
 * Seed the demo sites explicitly.
 *
 *   npm run seed
 *   npm run seed -- --threshold 600 --phone +919876543210
 *
 * Only useful against a real mongod / Atlas URI: with the in-memory MongoDB
 * fallback the database lives inside the server process, and the server seeds
 * itself on boot instead.
 */
import 'dotenv/config';

import { connectDb, disconnectDb } from './db.js';
import {
  seedDemoSites,
  writeClientEnv,
  writeAgentEnv,
  printSiteBanner,
} from './demoSeed.js';

function arg(flag, fallback) {
  const i = process.argv.indexOf(`--${flag}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

await connectDb();

const sites = await seedDemoSites({
  threshold: Number(arg('threshold', '480')),
  phone: arg('phone', process.env.DEMO_PHONE_NUMBER || null),
});

const clientEnv = writeClientEnv(sites);
writeAgentEnv(sites);
if (clientEnv) console.log(`Wrote ${clientEnv}`);

printSiteBanner(sites);

await disconnectDb();
