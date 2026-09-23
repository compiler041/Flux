import { Router } from 'express';
import { requireApiKey, requireSiteMatch } from '../middleware/auth.js';
import { Site, newApiKey } from '../models/Site.js';

export const sitesRouter = Router();

/** Strip the secret before anything leaves the server. */
const publicSite = (s) => ({
  id: s._id,
  name: s.name,
  alert_threshold: s.alert_threshold,
  phone_number: s.phone_number,
  created_at: s.created_at,
});

/**
 * POST /api/sites — register a site and mint its API key.
 *
 * Local-dev convenience: open unless ADMIN_TOKEN is set, in which case an
 * `x-admin-token` header must match it. Sites can also be created offline
 * with `npm run seed`.
 */
sitesRouter.post('/sites', async (req, res, next) => {
  try {
    const admin = process.env.ADMIN_TOKEN;
    if (admin && req.get('x-admin-token') !== admin) {
      return res.status(401).json({ error: 'invalid admin token' });
    }

    const { id, name, alert_threshold, phone_number } = req.body ?? {};
    if (!id || !name) {
      return res.status(400).json({ error: 'id and name are required' });
    }
    if (await Site.findById(id)) {
      return res.status(409).json({ error: `site "${id}" already exists` });
    }

    const api_key = newApiKey();
    const site = await Site.create({
      _id: id,
      name,
      api_key,
      alert_threshold: Number(alert_threshold) || 100,
      phone_number: phone_number ?? null,
    });

    // The only time the raw key is ever returned.
    res.status(201).json({ ...publicSite(site), api_key });
  } catch (err) {
    next(err);
  }
});

/** GET /api/sites — list registered sites (any valid key). */
sitesRouter.get('/sites', requireApiKey, async (_req, res, next) => {
  try {
    const sites = await Site.find().sort({ created_at: 1 });
    res.json({ sites: sites.map(publicSite) });
  } catch (err) {
    next(err);
  }
});

/** GET /api/sites/:site_id — one site's config. */
sitesRouter.get('/sites/:site_id', requireApiKey, (req, res) => {
  if (!requireSiteMatch(req.params.site_id, req, res)) return;
  res.json(publicSite(req.site));
});

/** PATCH /api/sites/:site_id — change threshold / phone number / name. */
sitesRouter.patch('/sites/:site_id', requireApiKey, async (req, res, next) => {
  try {
    if (!requireSiteMatch(req.params.site_id, req, res)) return;

    const { name, alert_threshold, phone_number } = req.body ?? {};
    if (alert_threshold !== undefined && !(Number(alert_threshold) > 0)) {
      return res.status(400).json({ error: 'alert_threshold must be > 0' });
    }

    if (name !== undefined) req.site.name = name;
    if (alert_threshold !== undefined) req.site.alert_threshold = Number(alert_threshold);
    if (phone_number !== undefined) req.site.phone_number = phone_number;

    await req.site.save();
    res.json(publicSite(req.site));
  } catch (err) {
    next(err);
  }
});
