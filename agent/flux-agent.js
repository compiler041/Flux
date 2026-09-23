/**
 * flux-agent — the whole client library.
 *
 * Counts requests in memory and POSTs the count to a Flux server every N
 * seconds. No log tailing, no load-balancer integration: one counter, one
 * timer, one fetch.
 *
 * Express:
 *
 *   import { fluxAgent } from 'flux-agent';
 *   app.use(fluxAgent({
 *     url: 'http://localhost:4000',
 *     siteId: 'demo-site',
 *     apiKey: 'flux_...',
 *     intervalSeconds: 10,
 *   }));
 *
 * Any other framework / plain Node:
 *
 *   const flux = createFluxReporter({ ... });
 *   flux.increment();          // call this wherever a request is handled
 *   flux.stop();               // on shutdown
 */

/**
 * Low-level counter + reporter. Framework agnostic.
 *
 * @param {object}  opts
 * @param {string}  opts.url              Flux server base URL.
 * @param {string}  opts.siteId           Site id registered with Flux.
 * @param {string}  opts.apiKey           That site's API key.
 * @param {number} [opts.intervalSeconds] Flush interval (default 10).
 * @param {boolean}[opts.sendZeroes]      Also report idle periods (default true).
 * @param {(msg: string) => void} [opts.onError]
 */
export function createFluxReporter({
  url,
  siteId,
  apiKey,
  intervalSeconds = 10,
  sendZeroes = true,
  onError = (msg) => console.warn(`[flux-agent] ${msg}`),
}) {
  if (!url || !siteId || !apiKey) {
    throw new Error('flux-agent needs url, siteId and apiKey');
  }

  const endpoint = `${url.replace(/\/$/, '')}/api/metrics`;
  let counter = 0;

  async function flush() {
    const count = counter;
    counter = 0;
    if (count === 0 && !sendZeroes) return;

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          site_id: siteId,
          timestamp: Math.floor(Date.now() / 1000),
          request_count: count,
        }),
      });
      if (!res.ok) {
        onError(`server replied ${res.status}: ${await res.text()}`);
      }
    } catch (err) {
      // Never let monitoring take the app down — drop the sample and move on.
      onError(`could not report metrics: ${err.message}`);
    }
  }

  const timer = setInterval(flush, intervalSeconds * 1000);
  timer.unref?.(); // don't keep the process alive just for the agent

  return {
    increment: (by = 1) => {
      counter += by;
    },
    flush,
    stop: () => clearInterval(timer),
  };
}

/**
 * Express/Connect middleware wrapper around createFluxReporter.
 * Drop it in as the first `app.use(...)` and every request is counted.
 */
export function fluxAgent(opts) {
  const reporter = createFluxReporter(opts);
  const middleware = (_req, _res, next) => {
    reporter.increment();
    next();
  };
  middleware.reporter = reporter;
  return middleware;
}

export default fluxAgent;
