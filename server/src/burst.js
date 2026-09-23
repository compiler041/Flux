/**
 * Fire enough traffic at the ingestion API to trip a site's threshold.
 *
 *   npm run burst
 *   npm run burst -- --count 400 --posts 10
 *
 * Talks to the API over HTTP only (never the database directly), so it works
 * the same against a real mongod and against the in-memory fallback. It reads
 * credentials from .demo-site.json (written when the site was seeded), or from
 * FLUX_URL / FLUX_SITE_ID / FLUX_API_KEY.
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
const demoFile = path.resolve(here, '../.demo-site.json');

let demo = {};
if (fs.existsSync(demoFile)) {
  demo = JSON.parse(fs.readFileSync(demoFile, 'utf8'));
}

const url = arg('url', process.env.FLUX_URL || demo.url || 'http://localhost:4000');
const siteId = arg('site', process.env.FLUX_SITE_ID || demo.site_id);
const apiKey = arg('key', process.env.FLUX_API_KEY || demo.api_key);

if (!siteId || !apiKey) {
  console.error(
    'No site credentials found.\n' +
      'Start the server once (it seeds a demo site and writes .demo-site.json),\n' +
      'or pass --site <id> --key <api_key>.'
  );
  process.exit(1);
}

// Default: about 2x the seeded threshold, spread over 8 posts a second apart.
const threshold = Number(demo.alert_threshold) || 120;
const total = Number(arg('count', String(threshold * 2)));
const posts = Number(arg('posts', '8'));
const per = Math.ceil(total / posts);

console.log(
  `Sending ${posts} x ${per} = ${per * posts} requests to "${siteId}" at ${url} ` +
    `(threshold ${threshold})...`
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
