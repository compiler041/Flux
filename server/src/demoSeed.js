/**
 * Shared seeding logic.
 *
 * Used two ways:
 *   • `npm run seed` — explicit, against a real mongod / Atlas URI.
 *   • automatically on server boot when the database has no sites yet, which
 *     is what makes the in-memory MongoDB fallback demoable (that database
 *     only exists inside the server process, so an external seed script could
 *     never reach it).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { nowSec } from './db.js';
import { Site, newApiKey } from './models/Site.js';
import { Metric } from './models/Metric.js';

/**
 * Create or update a site and backfill a calm baseline series.
 * @returns the site document.
 */
export async function seedDemoSite({
  id = 'demo-site',
  name = 'Demo Site',
  threshold = 120,
  phone = null,
  backfillMinutes = 15,
} = {}) {
  let site = await Site.findById(id);
  if (site) {
    site.name = name;
    site.alert_threshold = threshold;
    site.phone_number = phone;
    await site.save();
  } else {
    site = await Site.create({
      _id: id,
      name,
      api_key: newApiKey(),
      alert_threshold: threshold,
      phone_number: phone,
    });
  }

  // Baseline traffic: one point every 15s, comfortably under the threshold.
  await Metric.deleteMany({ site_id: id });
  const now = nowSec();
  const step = 15;
  const points = (backfillMinutes * 60) / step;
  const docs = [];
  for (let i = points; i > 0; i--) {
    const base = threshold * 0.35;
    const wobble = Math.sin(i / 6) * threshold * 0.08;
    const noise = (Math.random() - 0.5) * threshold * 0.08;
    docs.push({
      site_id: id,
      timestamp: now - i * step,
      request_count: Math.max(0, Math.round(base + wobble + noise)),
    });
  }
  await Metric.insertMany(docs);

  return site;
}

/** Write the React client's env file so `npm run dev` needs no copy-paste. */
export function writeClientEnv(site) {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const target = path.resolve(here, '../../client/.env.local');
  const apiBase = `http://localhost:${process.env.PORT || 4000}`;
  try {
    fs.writeFileSync(
      target,
      `VITE_FLUX_API_URL=${apiBase}\n` +
        `VITE_FLUX_SITE_ID=${site._id}\n` +
        `VITE_FLUX_API_KEY=${site.api_key}\n`
    );
    return target;
  } catch (err) {
    console.warn(`[seed] could not write client/.env.local: ${err.message}`);
    return null;
  }
}

/** Also drop the credentials next to the server for the agent + burst script. */
export function writeAgentEnv(site) {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const target = path.resolve(here, '../.demo-site.json');
  const apiBase = `http://localhost:${process.env.PORT || 4000}`;
  try {
    fs.writeFileSync(
      target,
      JSON.stringify(
        {
          url: apiBase,
          site_id: site._id,
          api_key: site.api_key,
          alert_threshold: site.alert_threshold,
        },
        null,
        2
      ) + '\n'
    );
    return target;
  } catch (err) {
    console.warn(`[seed] could not write .demo-site.json: ${err.message}`);
    return null;
  }
}

export function printSiteBanner(site) {
  const apiBase = `http://localhost:${process.env.PORT || 4000}`;
  console.log(`
──────────────────────────────────────────────────────────────
  Site id         : ${site._id}
  Name            : ${site.name}
  API key         : ${site.api_key}
  Alert threshold : ${site.alert_threshold} requests per alert window
  Phone number    : ${site.phone_number || '(none - SMS will be skipped)'}
──────────────────────────────────────────────────────────────

  Point a site at it   (cd ../agent)  : npm run example
  Trip the threshold   (cd ../server) : npm run burst
  Dashboard            (cd ../client) : npm run dev   ->  ${apiBase.replace('4000', '5173')}
`);
}
