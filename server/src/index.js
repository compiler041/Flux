import 'dotenv/config';
import express from 'express';
import cors from 'cors';

import { connectDb } from './db.js';
import { Site } from './models/Site.js';
import { sitesRouter } from './routes/sites.js';
import { metricsRouter } from './routes/metrics.js';
import { startAlertWorker } from './services/alerting.js';
import { initNotifier, notifierReady } from './services/notifier.js';
import {
  seedDemoSites,
  writeClientEnv,
  writeAgentEnv,
  printSiteBanner,
} from './demoSeed.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '128kb' }));

app.get('/api/health', async (_req, res, next) => {
  try {
    res.json({
      ok: true,
      sites: await Site.countDocuments(),
      twilio: notifierReady() ? 'configured' : 'dry-run',
      uptime_seconds: Math.round(process.uptime()),
    });
  } catch (err) {
    next(err);
  }
});

app.use('/api', sitesRouter);
app.use('/api', metricsRouter);

app.use((_req, res) => res.status(404).json({ error: 'not found' }));

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error('[server]', err);
  res.status(500).json({ error: 'internal server error' });
});

const port = Number(process.env.PORT) || 4000;

await connectDb();
await initNotifier();
startAlertWorker();

// First run (or in-memory database): create the demo site so there is always
// something to look at. Set AUTOSEED=false to disable.
if (String(process.env.AUTOSEED).toLowerCase() !== 'false') {
  if ((await Site.countDocuments()) === 0) {
    const sites = await seedDemoSites({
      phone: process.env.DEMO_PHONE_NUMBER || null,
    });
    writeClientEnv(sites);
    writeAgentEnv(sites);
    console.log('[seed] empty database - created the demo sites');
    printSiteBanner(sites);
  }
}

app.listen(port, async () => {
  console.log(`[server] Flux ingestion API listening on http://localhost:${port}`);
  const sites = await Site.find();
  console.log(`[server] ${sites.length} site(s): ${sites.map((s) => s._id).join(', ')}`);
});
