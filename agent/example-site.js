/**
 * A pretend customer site, instrumented with flux-agent.
 *
 *   npm run example
 *
 * Reads credentials from ../server/.demo-site.json (written when the site was
 * seeded), or from FLUX_URL / FLUX_SITE_ID / FLUX_API_KEY.
 *
 * It serves a trivial page on :3000 and also drives its own synthetic traffic
 * so you can watch the dashboard move without clicking refresh 200 times.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';

import { fluxAgent } from './flux-agent.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const demoFile = path.resolve(here, '../server/.demo-site.json');
const demo = fs.existsSync(demoFile)
  ? JSON.parse(fs.readFileSync(demoFile, 'utf8'))
  : {};

const url = process.env.FLUX_URL || demo.url || 'http://localhost:4000';
const siteId = process.env.FLUX_SITE_ID || demo.site_id;
const apiKey = process.env.FLUX_API_KEY || demo.api_key;

if (!siteId || !apiKey) {
  console.error(
    'No Flux credentials. Start the Flux server once (it seeds a demo site and\n' +
      'writes server/.demo-site.json), or set FLUX_SITE_ID and FLUX_API_KEY.'
  );
  process.exit(1);
}

const app = express();

// ── the one line a site owner actually adds ────────────────────────────────
app.use(fluxAgent({ url, siteId, apiKey, intervalSeconds: 5 }));

app.get('/', (_req, res) => res.send('Hello from the example site.'));
app.get('/about', (_req, res) => res.send('About the example site.'));

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => {
  console.log(`[example-site] listening on http://localhost:${port}`);
  console.log(`[example-site] reporting to ${url} as "${siteId}" every 5s`);
});

// ── synthetic visitors, so the chart has something to draw ─────────────────
if (process.env.NO_SYNTHETIC !== 'true') {
  setInterval(async () => {
    const hits = 3 + Math.floor(Math.random() * 5);
    for (let i = 0; i < hits; i++) {
      try {
        await fetch(`http://localhost:${port}/`);
      } catch {
        /* server still starting */
      }
    }
  }, 1000);
  console.log('[example-site] generating synthetic visitors (NO_SYNTHETIC=true to stop)');
}
