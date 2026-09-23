/**
 * Seed a demo site explicitly.
 *
 *   npm run seed
 *   npm run seed -- --id shop --name "Corner Shop" --threshold 200 --phone +919876543210
 *
 * Only useful against a real mongod / Atlas URI: with the in-memory MongoDB
 * fallback the database lives inside the server process, and the server seeds
 * itself on boot instead.
 */
import 'dotenv/config';

import { connectDb, disconnectDb } from './db.js';
import {
  seedDemoSite,
  writeClientEnv,
  writeAgentEnv,
  printSiteBanner,
} from './demoSeed.js';

function arg(flag, fallback) {
  const i = process.argv.indexOf(`--${flag}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

await connectDb();

const site = await seedDemoSite({
  id: arg('id', 'demo-site'),
  name: arg('name', 'Demo Site'),
  threshold: Number(arg('threshold', '120')),
  phone: arg('phone', process.env.DEMO_PHONE_NUMBER || null),
});

const clientEnv = writeClientEnv(site);
writeAgentEnv(site);
if (clientEnv) console.log(`Wrote ${clientEnv}`);

printSiteBanner(site);

await disconnectDb();
