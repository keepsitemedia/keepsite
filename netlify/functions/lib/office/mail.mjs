// The one door to Resend. Every send, sent or failed, leaves a document in
// emails/{slug}/, because "did that go out?" is the question the Emails tab
// exists to answer, and a failure nobody can see is the worst outcome.
import { store as defaultStore } from './store.mjs';
import { newId } from './ids.mjs';
import { toSafeHtml } from './templates.mjs';

const RESEND = 'https://api.resend.com/emails';

export async function sendMail(
  { slug, to, subject, text, html, attachments = [], template = null, kind = 'manual' },
  s = defaultStore(),
  fetchFn = fetch,
  now = new Date(),
) {
  const id = newId(now);
  const entry = {
    id, slug, kind, template,
    to: [].concat(to).filter(Boolean),
    subject, text,
    sentAt: now.toISOString(),
    resendId: null, status: 'failed', error: null,
  };
  const key = process.env.RESEND_API_KEY;
  const from = process.env.KEEPSITE_NOTIFY_FROM;
  if (!key || !from) {
    entry.error = 'RESEND_API_KEY or KEEPSITE_NOTIFY_FROM is not set';
  } else {
    try {
      const res = await fetchFn(RESEND, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to: entry.to, subject, text, html: html ?? toSafeHtml(text), attachments }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        entry.status = 'sent';
        entry.resendId = body.id ?? null;
      } else {
        entry.error = body.message ?? `Resend responded ${res.status}`;
      }
    } catch (e) {
      entry.error = e.message;
    }
  }
  await s.emails.put(slug, id, entry);
  return { ok: entry.status === 'sent', id, error: entry.error };
}

// A failure that never reaches Resend still needs a row the Emails tab can
// show; a silent skip is the failure the log exists to prevent.
export async function logFailure({ slug, to, template = null, kind = 'manual', error }, s = defaultStore(), now = new Date()) {
  const id = newId(now);
  const entry = {
    id, slug, kind, template,
    to: [].concat(to).filter(Boolean),
    subject: '', text: '',
    sentAt: now.toISOString(),
    resendId: null, status: 'failed', error,
  };
  await s.emails.put(slug, id, entry);
  return { ok: false, id, error };
}
