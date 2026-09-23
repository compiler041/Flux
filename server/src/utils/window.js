/**
 * Parse a window string like "60s", "15m", "2h", "1d" (or a bare number of
 * seconds) into seconds. Clamped to 10s..7d. Falls back to 15 minutes.
 */
export function parseWindow(input, fallback = 15 * 60) {
  if (input === undefined || input === null || input === '') return fallback;
  const m = String(input).trim().match(/^(\d+)\s*([smhd]?)$/i);
  if (!m) return fallback;
  const mult = { s: 1, m: 60, h: 3600, d: 86400 }[(m[2] || 's').toLowerCase()];
  return Math.min(Math.max(Number(m[1]) * mult, 10), 7 * 86400);
}

/** Bucket width that yields roughly 60 points for the given window. */
export const bucketFor = (windowSeconds) =>
  Math.max(1, Math.round(windowSeconds / 60));
