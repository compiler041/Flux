/**
 * Twilio SMS wrapper.
 *
 * With no Twilio credentials configured, Flux runs in dry-run mode: alerts are
 * still recorded and printed, but no SMS leaves the machine. That keeps the
 * whole project demoable with zero cloud accounts.
 */
let client = null;
let ready = false;

export async function initNotifier() {
  const { TWILIO_ACCOUNT_SID: sid, TWILIO_AUTH_TOKEN: token, TWILIO_FROM_NUMBER: from } =
    process.env;

  if (!sid || !token || !from) {
    console.log('[notifier] Twilio not configured — running in dry-run mode');
    return;
  }
  const { default: twilio } = await import('twilio');
  client = twilio(sid, token);
  ready = true;
  console.log(`[notifier] Twilio ready, sending from ${from}`);
}

export const notifierReady = () => ready;

/** @returns {Promise<'sent'|'failed'|'skipped'>} */
export async function sendSms(to, body) {
  if (!to) {
    console.log('[notifier] site has no phone number — skipping SMS');
    return 'skipped';
  }
  if (!ready) {
    console.log(`[notifier] DRY RUN → SMS to ${to}: ${body}`);
    return 'skipped';
  }
  try {
    const msg = await client.messages.create({
      to,
      from: process.env.TWILIO_FROM_NUMBER,
      body,
    });
    console.log(`[notifier] SMS sent to ${to} (${msg.sid})`);
    return 'sent';
  } catch (err) {
    console.error(`[notifier] SMS to ${to} failed: ${err.message}`);
    return 'failed';
  }
}
