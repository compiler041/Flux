/**
 * flux-probe — point real HTTP traffic at a site you own and report the count.
 *
 *   node probe.js --url https://myshop.in --site myshop.in --key flux_... --rps 5
 *
 * Use this when you cannot (yet) add flux-agent to the application itself: it
 * runs on your machine, sends real requests to the real URL, and reports how
 * many it made. That is enough to see the dashboard move and to trip a
 * threshold end to end.
 *
 * What it is NOT: a measure of your site's actual visitor traffic. It only
 * counts requests *this process* makes. For real traffic, mount flux-agent
 * inside the app (see flux-agent.js) so every visitor is counted at the source.
 *
 * Be sensible with --rps: this is load you are generating against your own
 * infrastructure. Start low.
 */
import { createFluxReporter } from './flux-agent.js';

function arg(flag, fallback) {
  const i = process.argv.indexOf(`--${flag}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const target = arg('url');
const siteId = arg('site');
const apiKey = arg('key', process.env.FLUX_API_KEY);
const fluxUrl = arg('flux', process.env.FLUX_URL || 'http://localhost:4000');
const rps = Number(arg('rps', '5'));
const seconds = Number(arg('seconds', '60'));

if (!target || !siteId || !apiKey) {
  console.error(
    'Usage: node probe.js --url <https://your-site> --site <site_id> --key <flux_api_key>\n' +
      '                    [--rps 5] [--seconds 60] [--flux http://localhost:4000]\n\n' +
      'The site_id must already be registered with Flux (POST /api/sites), and the\n' +
      'key must be that site\'s own key.'
  );
  process.exit(1);
}
if (!Number.isFinite(rps) || rps < 1 || rps > 200) {
  console.error('--rps must be between 1 and 200. This is load against your own site.');
  process.exit(1);
}

// Report on the same cadence as the dashboard's bucket, so one flush lands in
// one bucket and the chart shows the real shape rather than a sawtooth.
const flux = createFluxReporter({
  url: fluxUrl,
  siteId,
  apiKey,
  intervalSeconds: 4,
});

const statuses = new Map();
let sent = 0;
let failed = 0;

async function hit() {
  try {
    const res = await fetch(target, { redirect: 'follow' });
    statuses.set(res.status, (statuses.get(res.status) ?? 0) + 1);
    // Count what the site actually served.
    flux.increment();
    sent += 1;
  } catch (err) {
    failed += 1;
    if (failed === 1) console.warn(`  first failure: ${err.message}`);
  }
}

console.log(
  `Probing ${target} at ~${rps} req/s for ${seconds}s, reporting to ${fluxUrl} as "${siteId}".`
);

const ticker = setInterval(() => {
  for (let i = 0; i < rps; i++) hit();
}, 1000);

const progress = setInterval(() => {
  const codes = [...statuses.entries()].map(([c, n]) => `${c}:${n}`).join(' ');
  console.log(`  sent ${sent}${failed ? `, failed ${failed}` : ''}  [${codes}]`);
}, 5000);

setTimeout(async () => {
  clearInterval(ticker);
  clearInterval(progress);
  // Let the last requests land, then flush what is left in the counter.
  await new Promise((r) => setTimeout(r, 1500));
  await flux.flush();
  flux.stop();

  const codes = [...statuses.entries()].map(([c, n]) => `${c}: ${n}`).join(', ');
  console.log(`\nDone. ${sent} requests served (${codes})${failed ? `, ${failed} failed` : ''}.`);
  console.log('Check the dashboard — the series for this site should show the load.');
}, seconds * 1000);
