/**
 * Thin wrapper over the Flux ingestion API.
 *
 * Credentials come from Vite env vars (client/.env.local, written by the seed
 * step). The key is a per-site read/write key — fine for a self-hosted MVP
 * dashboard, not something to ship to the public internet.
 */
const BASE = import.meta.env.VITE_FLUX_API_URL || "http://localhost:4000";
const API_KEY = import.meta.env.VITE_FLUX_API_KEY || "";

async function request(path) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { authorization: `Bearer ${API_KEY}` },
  });

  if (!res.ok) {
    let detail = res.statusText;
    try {
      detail = (await res.json()).error ?? detail;
    } catch {
      /* body was not JSON */
    }
    throw new Error(`${res.status} ${detail}`);
  }
  return res.json();
}

/** Every site registered with this Flux server. */
export const fetchSites = () => request("/api/sites");

/**
 * Series + stats + recent alerts for one site, in a single call.
 *
 * `bucket` pins the width of a plotted point so it matches the server's alert
 * window - that is what makes the threshold line on the chart comparable to
 * the series it is drawn over.
 */
export const fetchMetrics = (siteId, window = "2m", bucket = 4) =>
  request(
    `/api/sites/${siteId}/metrics?window=${encodeURIComponent(window)}&bucket=${bucket}`
  );
