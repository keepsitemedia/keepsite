// Hand-built ICS, one invitation or a whole feed window: the format is
// small, and a dependency for it would be the only one in the office that
// touches nothing else.
import { addDays, toInstant } from './dates.mjs';

const stamp = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
const esc = (s) => String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

export function buildIcs({
  uid, start, minutes, summary, description, url, organizer, attendee,
  stamp: at = new Date(), sequence = 0, method = 'REQUEST',
}) {
  const end = new Date(start.getTime() + minutes * 60e3);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Keepsite Media//Office//EN',
    `METHOD:${method}`,
    'BEGIN:VEVENT',
    `UID:${esc(uid)}`,
    `DTSTAMP:${stamp(at)}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    `SEQUENCE:${sequence}`,
    ...(method === 'CANCEL' ? ['STATUS:CANCELLED'] : []),
    `SUMMARY:${esc(summary)}`,
    `DESCRIPTION:${esc(description)}`,
    ...(url ? [`URL:${esc(url)}`] : []),
    `ORGANIZER;CN=${esc(organizer.name)}:mailto:${esc(organizer.email)}`,
    `ATTENDEE;CN=${esc(attendee.name)};RSVP=FALSE:mailto:${esc(attendee.email)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.join('\r\n') + '\r\n';
}

// The whole window as one calendar the family app can import. No METHOD:
// this is a listing, not an invitation, so nothing here asks for a reply.
export function buildFeedIcs(items, now = new Date()) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Keepsite Media//Office//EN'];
  for (const i of items) {
    const day = i.kind === 'task' ? i.due : i.ymd;
    const summary = i.business ? `${i.business}: ${i.title}` : i.title;
    lines.push('BEGIN:VEVENT', `UID:${esc(i.id)}@keepsitemedia.com`, `DTSTAMP:${stamp(now)}`);
    if (i.time) {
      const start = toInstant(day, i.time);
      const minutes = i.kind === 'meeting' ? i.minutes : 30;
      lines.push(`DTSTART:${stamp(start)}`, `DTEND:${stamp(new Date(start.getTime() + minutes * 60e3))}`);
    } else {
      lines.push(`DTSTART;VALUE=DATE:${day.replace(/-/g, '')}`, `DTEND;VALUE=DATE:${addDays(day, 1).replace(/-/g, '')}`);
    }
    lines.push(`SUMMARY:${esc(summary)}`);
    if (i.kind === 'task' && i.done) lines.push('STATUS:COMPLETED');
    if (i.url) lines.push(`URL:${esc(i.url)}`);
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}
