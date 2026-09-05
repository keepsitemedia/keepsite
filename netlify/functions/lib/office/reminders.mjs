// Hourly cron. Flags are written before the send so a retry can never send
// twice; the trade is that a failed send is not retried, which the Emails
// tab shows as a failed entry.
import { store as defaultStore } from './store.mjs';
import { toInstant } from './dates.mjs';
import { buildContext } from './context.mjs';
import { loadTemplates, findTemplate, render } from './templates.mjs';
import { sendMail, logFailure } from './mail.mjs';

const HOUR = 3600e3;

export function dueReminders(meetings, now) {
  const out = [];
  for (const m of meetings) {
    const ms = toInstant(m.ymd, m.time) - now;
    if (ms <= 0) continue;
    const sent = m.remindersSent ?? {};
    if (ms <= 2 * HOUR && !sent.hour) out.push({ meeting: m, kind: 'hour' });
    else if (ms <= 25 * HOUR && !sent.day) out.push({ meeting: m, kind: 'day' });
  }
  return out;
}

export async function runMeetingReminders({ s = defaultStore(), now = new Date(), fetchFn = fetch } = {}) {
  const due = dueReminders(await s.meetings.listAll(), now);
  const template = findTemplate(await loadTemplates(s), 'meeting-reminder');
  let sent = 0;
  for (const { meeting, kind } of due) {
    const client = await s.clients.get(meeting.slug);
    if (!client) continue;
    const at = now.toISOString();
    // The hour reminder supersedes a day reminder that never went out.
    const remindersSent = kind === 'hour'
      ? { day: meeting.remindersSent?.day ?? at, hour: at }
      : { ...meeting.remindersSent, day: at };
    // Written even when the template is missing below: an hourly cron
    // must not reconsider the same meeting every run just because the
    // template it needs isn't there.
    await s.meetings.put(meeting.slug, meeting.id, { ...meeting, remindersSent });
    if (!template) {
      await logFailure({ slug: meeting.slug, to: client.email, template: 'meeting-reminder', kind: `meeting-reminder-${kind}`, error: 'template meeting-reminder is missing' }, s, now);
      sent += 1;
      continue;
    }
    const context = buildContext({ client, admin: null, secret: process.env.KEEPSITE_TOKEN_SECRET ?? '', meeting, now });
    const { subject, text, html } = render(template, context, {});
    const base = { slug: meeting.slug, subject, text, html, template: 'meeting-reminder', kind: `meeting-reminder-${kind}` };
    await sendMail({ ...base, to: client.email }, s, fetchFn, now);
    if (process.env.KEEPSITE_NOTIFY_TO) await sendMail({ ...base, to: process.env.KEEPSITE_NOTIFY_TO }, s, fetchFn, new Date(now.getTime() + 1000));
    sent += 1;
  }
  return { considered: due.length, sent };
}
