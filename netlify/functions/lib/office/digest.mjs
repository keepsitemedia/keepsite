// One morning email instead of a ping per task: at thirty clients the pings
// become noise and the list does not. Empty sections are left out, and an
// empty digest is not sent at all.
import { store as defaultStore } from './store.mjs';
import { addDays, formatYmd, formatTime, todayIn, TZ } from './dates.mjs';
import { dueBucket } from './calendar.mjs';
import { sendMail } from './mail.mjs';
import { siteUrl } from './context.mjs';

const DAY = 86400e3;
const money = (cents) => `$${(cents / 100).toFixed(2)}`;

export function buildDigest({ clients, tasks, meetings, submitted, agreements = [], payments = [], today, now }) {
  const name = new Map(clients.map((c) => [c.slug, c.business]));
  const who = (slug) => name.get(slug) ?? slug;
  const open = tasks.filter((t) => !t.done).sort((a, b) => a.due.localeCompare(b.due) || (a.time ?? '').localeCompare(b.time ?? ''));
  const line = (t) => `${who(t.slug)}: ${t.title}${t.time ? ` at ${formatTime(t.time)}` : ''}${t.due === today ? '' : ` (${formatYmd(t.due)})`}`;
  const bucket = (b) => open.filter((t) => dueBucket(t, today) === b).map(line);

  const tomorrow = addDays(today, 1);
  const meetingLines = meetings
    .filter((m) => m.ymd === today || m.ymd === tomorrow)
    .sort((a, b) => `${a.ymd}${a.time}`.localeCompare(`${b.ymd}${b.time}`))
    .map((m) => `${who(m.slug)}: ${m.title}, ${formatYmd(m.ymd)} at ${formatTime(m.time)}`);

  const nudgeAfter = addDays(today, -3);
  const waiting = open
    .filter((t) => t.questionnaire && t.due <= nudgeAfter && !submitted.has(`${t.slug}/${t.questionnaire}`))
    .map((t) => `${who(t.slug)}: ${t.questionnaire}, due ${formatYmd(t.due)} — nudge: ${siteUrl()}/office/send/${t.slug}/questionnaire-reminder/?form=${t.questionnaire}`);

  const failed = payments
    .filter((p) => p.status === 'failed')
    .map((p) => `${who(p.slug)}: ${p.kind} ${money(p.amount)}${p.failureReason ? `, ${p.failureReason}` : ''}`);

  const unsigned = agreements
    .filter((a) => a.status === 'sent' && now - new Date(a.sentAt) > 5 * DAY)
    // sentAt is an instant; slicing it would read UTC's calendar day, a day
    // ahead of Mountain evenings, so go through todayIn for the reader's zone.
    .map((a) => `${who(a.slug)}: sent ${formatYmd(todayIn(undefined, new Date(a.sentAt)))}`);

  const sections = [
    ['Overdue', bucket('overdue')],
    ['Due today', bucket('today')],
    ['Next three days', bucket('soon')],
    ['Meetings today and tomorrow', meetingLines],
    ['Questionnaires waiting', waiting],
    ['Failed payments', failed],
    ['Agreements unsigned', unsigned],
  ].filter(([, items]) => items.length);

  const generated = new Intl.DateTimeFormat('en-US', { timeZone: TZ, dateStyle: 'medium', timeStyle: 'short' }).format(now);
  const text = [
    ...sections.map(([title, items]) => `${title} (${items.length})\n${items.map((i) => `- ${i}`).join('\n')}`),
    `Generated ${generated} Mountain`,
  ].join('\n\n');
  return { empty: sections.length === 0, subject: `Office digest for ${formatYmd(today)}`, text };
}

export async function runDigest({ s = defaultStore(), now = new Date(), fetchFn = fetch } = {}) {
  const today = todayIn(undefined, now);
  const [clients, tasks, meetings, agreements, payments] = await Promise.all([
    s.clients.list(), s.tasks.listAll(), s.meetings.listAll(), s.agreements.listAll(), s.payments.listAll(),
  ]);
  const submitted = new Set();
  for (const t of tasks) {
    if (t.questionnaire && !t.done && (await s.questionnaires.get(t.slug, t.questionnaire))) submitted.add(`${t.slug}/${t.questionnaire}`);
  }
  const digest = buildDigest({ clients, tasks, meetings, submitted, agreements, payments, today, now });
  if (digest.empty || !process.env.KEEPSITE_NOTIFY_TO) return { sent: false };
  await sendMail({ slug: 'office', to: process.env.KEEPSITE_NOTIFY_TO, subject: digest.subject, text: digest.text, kind: 'digest' }, s, fetchFn, now);
  return { sent: true };
}
