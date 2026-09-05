import { readForm, redirect, problem, field, checkCsrf, safeNext, CSRF_REFUSED } from '../http.mjs';
import { store as defaultStore, SLUG } from '../store.mjs';
import { newId, ID } from '../ids.mjs';
import { isYmd, isHhmm, toInstant } from '../dates.mjs';
import { buildContext } from '../context.mjs';
import { loadTemplates, findTemplate, render } from '../templates.mjs';
import { buildIcs } from '../ics.mjs';
import { sendMail, logFailure } from '../mail.mjs';

const LINK = /^https?:\/\/\S+$/;
const slugify = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'meeting';

// Both parties get the same mail with the same calendar file, so neither can
// hold a different time (or miss a cancellation). Sends are best-effort: the
// meeting document is already written, and the Emails tab shows a failure.
async function sendMeetingMail({ templateId, method, client, meeting, admin, s, fetchFn = fetch, now = new Date() }) {
  const template = findTemplate(await loadTemplates(s), templateId);
  if (!template) {
    await logFailure({ slug: client.slug, to: client.email, template: templateId, kind: templateId, error: `template ${templateId} is missing` }, s, now);
    return;
  }
  const context = buildContext({ client, admin, secret: process.env.KEEPSITE_TOKEN_SECRET ?? '', meeting, now });
  const { subject, text, html } = render(template, context, {});
  // A cancellation bumps SEQUENCE past whatever the client's calendar last
  // saw, which is what tells it to replace the event with STATUS:CANCELLED
  // rather than ignore a stale-looking update.
  const sequence = method === 'CANCEL' ? (meeting.sequence ?? 0) + 1 : (meeting.sequence ?? 0);
  const ics = buildIcs({
    uid: `${meeting.id}@keepsitemedia.com`,
    start: toInstant(meeting.ymd, meeting.time),
    minutes: meeting.minutes,
    summary: meeting.title,
    description: [meeting.notes, meeting.link].filter(Boolean).join('\n'),
    url: meeting.link,
    organizer: { name: context.site.brand, email: process.env.KEEPSITE_NOTIFY_FROM ?? context.site.email },
    attendee: { name: client.name, email: client.email },
    stamp: now,
    sequence,
    method,
  });
  const attachments = [{ filename: `${slugify(meeting.title)}.ics`, content: Buffer.from(ics).toString('base64') }];
  const base = { slug: client.slug, subject, text, html, attachments, template: templateId, kind: templateId };
  await sendMail({ ...base, to: client.email }, s, fetchFn, now);
  if (process.env.KEEPSITE_NOTIFY_TO) await sendMail({ ...base, to: process.env.KEEPSITE_NOTIFY_TO }, s, fetchFn, new Date(now.getTime() + 1000));
}

export async function confirmMeeting({ client, meeting, admin, s, fetchFn = fetch, now = new Date() }) {
  await sendMeetingMail({ templateId: 'meeting-confirmation', method: 'REQUEST', client, meeting, admin, s, fetchFn, now });
}

async function cancelMeeting({ client, meeting, admin, s, fetchFn = fetch, now = new Date() }) {
  await sendMeetingMail({ templateId: 'meeting-cancelled', method: 'CANCEL', client, meeting, admin, s, fetchFn, now });
}

const when = (data) => {
  const ymd = field(data, 'date');
  const time = field(data, 'time');
  if (!isYmd(ymd)) return { error: 'date must be a date' };
  if (!isHhmm(time)) return { error: 'time must be HH:MM' };
  return { ymd, time };
};

export async function meeting(request, ctx, s = defaultStore(), fetchFn = fetch, now = new Date()) {
  if (request.method !== 'POST') return problem(405, 'POST only');
  const data = await readForm(request);
  if (!data) return problem(400, 'expected a form');
  if (!checkCsrf(ctx, data)) return problem(403, CSRF_REFUSED);

  const slug = field(data, 'slug');
  if (!SLUG.test(slug)) return problem(400, 'bad slug');
  const client = await s.clients.get(slug);
  if (!client) return problem(404, 'no such client');
  const back = field(data, 'back');
  const to = safeNext(back) === back ? back : `/office/clients/${slug}/?tab=meetings`;
  const op = field(data, 'op');
  const at = now.toISOString();

  if (op === 'add') {
    const title = field(data, 'title');
    if (!title) return problem(400, 'title is required');
    const w = when(data);
    if (w.error) return problem(400, w.error);
    const minutes = Number(field(data, 'minutes') || 30);
    if (!Number.isInteger(minutes) || minutes < 5 || minutes > 480) return problem(400, 'minutes must be between 5 and 480');
    const link = field(data, 'link');
    if (link && !LINK.test(link)) return problem(400, 'link must start with http:// or https://');
    const id = newId(now);
    const doc = {
      id, slug, title, ymd: w.ymd, time: w.time, minutes, link, notes: field(data, 'notes'),
      remindersSent: { day: null, hour: null }, sequence: 0, createdAt: at, updatedAt: at,
    };
    await s.meetings.put(slug, id, doc);
    await confirmMeeting({ client, meeting: doc, admin: ctx.admin, s, fetchFn, now });
    return redirect(to);
  }

  const id = field(data, 'id');
  if (!ID.test(id)) return problem(400, 'bad id');
  const existing = await s.meetings.get(slug, id);
  if (!existing) return problem(404, 'no such meeting');

  if (op === 'reschedule') {
    const w = when(data);
    if (w.error) return problem(400, w.error);
    // A moved meeting is a new meeting to the reminder cron, and a new
    // revision of the calendar event to the client's calendar app.
    const doc = { ...existing, ymd: w.ymd, time: w.time, remindersSent: { day: null, hour: null }, sequence: (existing.sequence ?? 0) + 1, updatedAt: at };
    await s.meetings.put(slug, id, doc);
    await confirmMeeting({ client, meeting: doc, admin: ctx.admin, s, fetchFn, now });
    return redirect(to);
  }
  if (op === 'delete') {
    await cancelMeeting({ client, meeting: existing, admin: ctx.admin, s, fetchFn, now });
    await s.meetings.remove(slug, id);
    return redirect(to);
  }
  return problem(400, 'unknown op');
}
