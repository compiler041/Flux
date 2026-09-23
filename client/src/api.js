/**
 * Thin wrapper over the Flux ingestion API.
 *
 * Credentials come from Vite env vars (client/.env.local, written by the
 * seed step). The API key is a per-site read/write key — fine for a
 * self-hosted MVP dashboard, not something to ship to the public internet.
 */
const BASE = import.meta.env.VITE_FLUX_API_URL || 'http://localhost:4000';

export const SITE_ID = import.meta.env.VITE_FLUX_SITE_ID || 'demo-site';
const API_KEY = import.meta.env.VITE_FLUX_API_KEY || '';

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${API_KEY}`,
      ...options.headers,
    },
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

/** Series + stats + recent alerts for the dashboard, in one call. */
export const fetchMetrics = (siteId = SITE_ID, window = '15m') =>
  request(`/api/sites/${siteId}/metrics?window=${encodeURIComponent(window)}`);

/** Update the site's alert threshold or phone number. */
export const updateSite = (siteId, patch) =>
  request(`/api/sites/${siteId}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });

export const health = () => request('/api/health');
