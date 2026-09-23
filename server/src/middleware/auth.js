import { Site } from '../models/Site.js';

/**
 * API-key auth. The key arrives as `Authorization: Bearer <key>` or as an
 * `x-api-key` header, and is resolved to the site it belongs to.
 */
export async function requireApiKey(req, res, next) {
  const header = req.get('authorization') || '';
  const key = header.startsWith('Bearer ')
    ? header.slice(7).trim()
    : req.get('x-api-key');

  if (!key) return res.status(401).json({ error: 'missing API key' });

  try {
    const site = await Site.findOne({ api_key: key });
    if (!site) return res.status(401).json({ error: 'invalid API key' });
    req.site = site;
    next();
  } catch (err) {
    next(err);
  }
}

/** The key must belong to the site named in the URL / body. */
export function requireSiteMatch(siteId, req, res) {
  if (siteId !== req.site._id) {
    res.status(403).json({ error: 'API key does not match site_id' });
    return false;
  }
  return true;
}
