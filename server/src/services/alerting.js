import cron from 'node-cron';
import { Site } from '../models/Site.js';
import { Alert } from '../models/Alert.js';
import { sumSince } from './metrics.js';
import { sendSms } from './notifier.js';
import { nowSec } from '../db.js';

/**
 * Evaluate one site against its threshold.
 * @returns the stored alert if one fired, otherwise null.
 */
export async function evaluateSite(site, { windowSeconds, cooldownSeconds }) {
  const now = nowSec();
  const observed = await sumSince(site._id, now - windowSeconds);

  if (observed <= site.alert_threshold) return null;

  // Cooldown: at most one alert per site per cooldown window, however long the
  // breach lasts. Stops a sustained spike turning into an SMS storm.
  const last = await Alert.findOne({ site_id: site._id }).sort({ fired_at: -1 });
  const since = last ? now - last.fired_at : Infinity;
  if (since < cooldownSeconds) {
    console.log(
      `[alerting] ${site._id} still breaching (${observed} > ${site.alert_threshold}) ` +
        `but in cooldown for another ${cooldownSeconds - since}s`
    );
    return null;
  }

  const message =
    `[Flux] ${site.name} traffic spike: ${observed} requests in the last ` +
    `${windowSeconds}s (threshold ${site.alert_threshold}).`;

  const sms_status = await sendSms(site.phone_number, message);

  const alert = await Alert.create({
    site_id: site._id,
    fired_at: now,
    request_count: observed,
    threshold: site.alert_threshold,
    message,
    sms_status,
  });

  console.log(`[alerting] ALERT ${site._id} — ${message} (sms: ${sms_status})`);
  return alert;
}

/** One evaluation pass over every registered site. */
export async function runOnce(opts) {
  const sites = await Site.find();
  for (const site of sites) {
    try {
      await evaluateSite(site, opts);
    } catch (err) {
      console.error(`[alerting] ${site._id} check failed: ${err.message}`);
    }
  }
}

/** Start the background worker. @returns a stop() function. */
export function startAlertWorker() {
  const expression = process.env.ALERT_CRON || '*/30 * * * * *';
  const opts = {
    windowSeconds: Number(process.env.ALERT_WINDOW_SECONDS) || 60,
    cooldownSeconds: Number(process.env.ALERT_COOLDOWN_SECONDS) || 300,
  };

  if (!cron.validate(expression)) {
    throw new Error(`ALERT_CRON is not a valid cron expression: ${expression}`);
  }

  const task = cron.schedule(expression, () => {
    runOnce(opts).catch((err) =>
      console.error(`[alerting] pass failed: ${err.message}`)
    );
  });

  console.log(
    `[alerting] worker started (cron "${expression}", window ${opts.windowSeconds}s, ` +
      `cooldown ${opts.cooldownSeconds}s)`
  );
  return () => task.stop();
}
