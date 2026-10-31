/**
 * Gmail email wrapper. Without Gmail credentials, alerts are recorded and
 * printed but no email leaves the machine.
 */
let transporter = null;
let ready = false;

export async function initEmailNotifier() {
  const { GMAIL_USER, GMAIL_APP_PASSWORD } = process.env;
  if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
    console.log('[email] Gmail not configured — email alerts will be skipped');
    return;
  }

  const { default: nodemailer } = await import('nodemailer');
  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
  });
  ready = true;
  console.log(`[email] Gmail ready, sending from ${GMAIL_USER}`);
}

export const emailNotifierReady = () => ready;

/** @returns {Promise<'sent'|'failed'|'skipped'>} */
export async function sendEmail(to, subject, text) {
  if (!to) {
    console.log('[email] no recipient configured — skipping email');
    return 'skipped';
  }
  if (!ready) {
    console.log(`[email] DRY RUN → email to ${to}: ${subject}`);
    return 'skipped';
  }

  try {
    await transporter.sendMail({
      from: process.env.GMAIL_USER,
      to,
      subject,
      text,
    });
    console.log(`[email] alert sent to ${to}`);
    return 'sent';
  } catch (err) {
    console.error(`[email] message to ${to} failed: ${err.message}`);
    return 'failed';
  }
}
