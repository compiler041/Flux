import { Router } from 'express';
import { requireApiKey, requireSiteMatch } from '../middleware/auth.js';
import { Metric } from '../models/Metric.js';
import { Alert } from '../models/Alert.js';
import { bucketedMetrics } from '../services/metrics.js';
import { parseWindow, bucketFor } from '../utils/window.js';
import { nowSec } from '../db.js';

export const metricsRouter = Router();

/**
 * Agents are allowed to be this far ahead of the server's clock. Anything
 * further in the future is rejected: a single bad timestamp would otherwise
 * stretch every chart's time axis out to meet it.
 */
const MAX_CLOCK_SKEW_SECONDS = 300;

/** Accept unix seconds, unix millis or an ISO string. Returns unix seconds. */
function normaliseTimestamp(timestamp) {
  if (timestamp === undefined || timestamp === null) return nowSec();
  if (typeof timestamp === 'number') {
    return timestamp > 1e11 ? Math.floor(timestamp / 1000) : Math.floor(timestamp);
  }
  const parsed = Date.parse(timestamp);
  return Number.isNaN(parsed) ? null : Math.floor(parsed / 1000);
}

/**
 * POST /api/metrics
 * Body: { site_id, timestamp?, request_count }
 * Auth: the API key must belong to `site_id`.
 */
metricsRouter.post('/metrics', requireApiKey, async (req, res, next) => {
  try {
    const { site_id, timestamp, request_count } = req.body ?? {};

    if (!site_id || typeof site_id !== 'string') {
      return res.status(400).json({ error: 'site_id is required' });
    }
    if (!requireSiteMatch(site_id, req, res)) return;

    const count = Number(request_count);
    if (!Number.isFinite(count) || count < 0) {
      return res
        .status(400)
        .json({ error: 'request_count must be a non-negative number' });
    }

    const ts = normaliseTimestamp(timestamp);
    if (ts === null) {
      return res.status(400).json({ error: 'timestamp is not a valid date' });
    }
    if (ts > nowSec() + MAX_CLOCK_SKEW_SECONDS) {
      return res.status(400).json({ error: 'timestamp is too far in the future' });
    }

    await Metric.create({
      site_id,
      timestamp: ts,
      request_count: Math.round(count),
    });

    res.status(202).json({
      ok: true,
      site_id,
      timestamp: ts,
      request_count: Math.round(count),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/sites/:site_id/metrics?window=15m
 * Bucketed series + summary stats + recent alerts — everything the dashboard
 * needs in a single poll.
 */
metricsRouter.get('/sites/:site_id/metrics', requireApiKey, async (req, res, next) => {
  try {
    const { site_id } = req.params;
    if (!requireSiteMatch(site_id, req, res)) return;

    const windowSeconds = parseWindow(req.query.window);
    const bucket = bucketFor(windowSeconds);
    const since = nowSec() - windowSeconds;

    const points = await bucketedMetrics(site_id, since, bucket);
    const counts = points.map((p) => p.request_count);
    const total = counts.reduce((a, b) => a + b, 0);
    const alerts = await Alert.find({ site_id }).sort({ fired_at: -1 }).limit(10);

    res.json({
      site: {
        id: req.site._id,
        name: req.site.name,
        alert_threshold: req.site.alert_threshold,
        phone_number: req.site.phone_number,
      },
      window_seconds: windowSeconds,
      bucket_seconds: bucket,
      points, // [{ timestamp (unix seconds), request_count }]
      stats: {
        current: counts.length ? counts[counts.length - 1] : 0,
        average: counts.length ? Math.round(total / counts.length) : 0,
        peak: counts.length ? Math.max(...counts) : 0,
        total,
      },
      alerts,
    });
  } catch (err) {
    next(err);
  }
});

/** GET /api/sites/:site_id/alerts — alert history. */
metricsRouter.get('/sites/:site_id/alerts', requireApiKey, async (req, res, next) => {
  try {
    const { site_id } = req.params;
    if (!requireSiteMatch(site_id, req, res)) return;

    const limit = Math.min(Number(req.query.limit) || 25, 100);
    const alerts = await Alert.find({ site_id }).sort({ fired_at: -1 }).limit(limit);
    res.json({ alerts });
  } catch (err) {
    next(err);
  }
});
