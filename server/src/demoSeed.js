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

/** The sites the dashboard ships with. */
export const DEMO_SITES = [
  { id: 'api.mystore.in', name: 'api.mystore.in' },
  { id: 'checkout.mystore.in', name: 'checkout.mystore.in' },
  { id: 'cdn.mystore.in', name: 'cdn.mystore.in' },
];

/** The chart plots one point per this many seconds; so does the alert worker. */
export const BUCKET_SECONDS = 4;

/**
 * Create or update the demo sites and backfill a calm baseline series for
 * each. Points are spaced `BUCKET_SECONDS` apart so the dashboard's threshold
 * line is directly comparable to the plotted values.
 *
 * @returns the site documents.
 */
export async function seedDemoSites({
  threshold = 480,
  phone = null,
  backfillMinutes = 15,
} = {}) {
  const sites = [];

  for (const [index, spec] of DEMO_SITES.entries()) {
    let site = await Site.findById(spec.id);
    if (site) {
      site.name = spec.name;
      site.alert_threshold = threshold;
      site.phone_number = phone;
      await site.save();
    } else {
      site = await Site.create({
        _id: spec.id,
        name: spec.name,
        api_key: newApiKey(),
        alert_threshold: threshold,
        phone_number: phone,
      });
    }

    await Metric.deleteMany({ site_id: spec.id });

    const now = nowSec();
    const points = (backfillMinutes * 60) / BUCKET_SECONDS;
    const docs = [];
    for (let i = points; i > 0; i--) {
      // A calm baseline at roughly 45% of the threshold, each site a little
      // different so switching tabs actually shows you something.
      const base = threshold * (0.45 - index * 0.08);
      const wobble = Math.sin(i / 9 + index) * threshold * 0.06;
      const noise = (Math.random() - 0.5) * threshold * 0.08;
      docs.push({
        site_id: spec.id,
        timestamp: now - i * BUCKET_SECONDS,
        request_count: Math.max(0, Math.round(base + wobble + noise)),
      });
    }
    await Metric.insertMany(docs);

    sites.push(site);
  }

  return sites;
}

const here = path.dirname(fileURLToPath(import.meta.url));
const apiBase = () => `http://localhost:${process.env.PORT || 4000}`;

/** Write the dashboard's env file so `npm run dev` needs no copy-paste. */
export function writeClientEnv(sites) {
  const target = path.resolve(here, '../../client/.env.local');
  try {
    fs.writeFileSync(
      target,
      `VITE_FLUX_API_URL=${apiBase()}\n` + `VITE_FLUX_API_KEY=${sites[0].api_key}\n`
    );
    return target;
  } catch (err) {
    console.warn(`[seed] could not write client/.env.local: ${err.message}`);
    return null;
  }
}

/** Drop every site's credentials next to the server for the agent + burst script. */
export function writeAgentEnv(sites) {
  const target = path.resolve(here, '../.demo-sites.json');
  try {
    fs.writeFileSync(
      target,
      JSON.stringify(
        {
          url: apiBase(),
          sites: sites.map((s) => ({
            site_id: s._id,
            api_key: s.api_key,
            alert_threshold: s.alert_threshold,
          })),
        },
        null,
        2
      ) + '\n'
    );
    return target;
  } catch (err) {
    console.warn(`[seed] could not write .demo-sites.json: ${err.message}`);
    return null;
  }
}

export function printSiteBanner(sites) {
  const rows = sites
    .map((s) => `  ${s._id.padEnd(22)} ${s.api_key}  threshold ${s.alert_threshold}`)
    .join('\n');

  console.log(`
──────────────────────────────────────────────────────────────────────────────
  SITE                   API KEY                                    THRESHOLD
${rows}
  Phone number: ${sites[0].phone_number || '(none - SMS will be skipped)'}
──────────────────────────────────────────────────────────────────────────────

  Point a site at it   (cd ../agent)  : npm run example
  Trip the threshold   (cd ../server) : npm run burst
  Dashboard            (cd ../client) : npm run dev   ->  http://localhost:5173
`);
}
