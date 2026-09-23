/**
 * Fire enough traffic at the ingestion API to trip a site's threshold.
 *
 *   npm run burst
 *   npm run burst -- --site checkout.mystore.in --posts 8
 *
 * Talks to the API over HTTP only (never the database directly), so it works
 * the same against a real mongod and against the in-memory fallback. It reads
 * credentials from .demo-sites.json (written when the sites were seeded), or
 * from FLUX_URL / FLUX_SITE_ID / FLUX_API_KEY.
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function arg(flag, fallback) {
  const i = process.argv.indexOf(`--${flag}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const here = path.dirname(fileURLToPath(import.meta.url));
const demoFile = path.resolve(here, '../.demo-sites.json');
const demo = fs.existsSync(demoFile)
  ? JSON.parse(fs.readFileSync(demoFile, 'utf8'))
  : { sites: [] };

const url = arg('url', process.env.FLUX_URL || demo.url || 'http://localhost:4000');
const siteId = arg('site', process.env.FLUX_SITE_ID || demo.sites[0]?.site_id);

// The API key must belong to the site being written to, so look it up.
const known = demo.sites.find((s) => s.site_id === siteId);
const apiKey = process.env.FLUX_API_KEY || known?.api_key;

if (!siteId || !apiKey) {
  const names = demo.sites.map((s) => s.site_id).join(', ') || '(none)';
  console.error(
    `No credentials for site "${siteId ?? '?'}".\n` +
      `Known sites: ${names}\n` +
      'Start the server once (it seeds the demo sites and writes .demo-sites.json).'
  );
  process.exit(1);
}

const threshold = Number(known?.alert_threshold) || 480;
// Each post lands inside one 4s alert window, so a single post must clear the
// threshold on its own for the breach to be unambiguous.
const per = Number(arg('count', String(Math.ceil(threshold * 1.5))));
const posts = Number(arg('posts', '6'));

console.log(
  `Sending ${posts} posts of ${per} requests to "${siteId}" at ${url} ` +
    `(threshold ${threshold} per alert window)...`
);

for (let i = 0; i < posts; i++) {
  try {
    const res = await fetch(`${url}/api/metrics`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        site_id: siteId,
        timestamp: Math.floor(Date.now() / 1000),
        request_count: per,
      }),
    });
    if (!res.ok) {
      console.error(`  post ${i + 1} failed: ${res.status} ${await res.text()}`);
    } else {
      console.log(`  post ${i + 1}/${posts} -> ${per} requests`);
    }
  } catch (err) {
    console.error(`  post ${i + 1} failed: ${err.message} (is the server running?)`);
  }
  await new Promise((r) => setTimeout(r, 1000));
}

console.log(
  '\nDone. The alert worker runs every 30s by default - watch the server log for ' +
    'the SMS, and the dashboard for the new alert row.'
);
