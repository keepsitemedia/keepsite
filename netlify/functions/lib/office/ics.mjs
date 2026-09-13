// Hand-built ICS, one invitation or a whole feed window: the format is
// small, and a dependency for it would be the only one in the office that
// touches nothing else.
import { addDays, toInstant } from './dates.mjs';
import { dayOf } from './feed.mjs';

const stamp = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
const esc = (s) => String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
// A URL is a URI, not free text: it has no ; or , escaping in RFC 5545, so
// esc() would corrupt one. Only a raw CR or LF is stripped, since that is
// the one thing that could forge a second content line.
const urlValue = (u) => String(u ?? '').replace(/[\r\n]/g, '');

// Calendar clients unfold a line by removing every CRLF immediately followed
// by a space before they parse it, and some strict ones refuse to parse a
// raw content line over 75 octets, so every line has to be folded to match.
function fold(line) {
  const bytes = Buffer.from(line, 'utf8');
  if (bytes.length <= 75) return line;
  const chunks = [];
  for (let i = 0; i < bytes.length; ) {
    // The folding space counts toward a continuation line's 75 octets.
    let end = Math.min(i + (i === 0 ? 75 : 74), bytes.length);
    // Back off a continuation byte (10xxxxxx) so a multi-byte character
    // never ends up split across two chunks.
    while (end < bytes.length && (bytes[end] & 0xc0) === 0x80) end--;
    chunks.push(bytes.subarray(i, end).toString('utf8'));
    i = end;
  }
  return chunks.join('\r\n ');
}
const render = (lines) => lines.map(fold).join('\r\n') + '\r\n';

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
    ...(url ? [`URL:${urlValue(url)}`] : []),
    `ORGANIZER;CN=${esc(organizer.name)}:mailto:${esc(organizer.email)}`,
    `ATTENDEE;CN=${esc(attendee.name)};RSVP=FALSE:mailto:${esc(attendee.email)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return render(lines);
}

// The whole window as one calendar the family app can import. No METHOD:
// this is a listing, not an invitation, so nothing here asks for a reply.
//
// An empty window still has to produce a valid file: RFC 5545 wants at
// least one component in a VCALENDAR, but inventing a placeholder VEVENT
// would show a fake entry on the family calendar. Mainstream clients accept
// a component-free VCALENDAR, so an empty window is left as that rather
// than manufactured data.
export function buildFeedIcs(items, now = new Date()) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Keepsite Media//Office//EN'];
  for (const i of items) {
    const day = dayOf(i);
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
    // A subscribed calendar has no other way to surface the join link.
    if (i.kind === 'meeting' && i.link) lines.push(`DESCRIPTION:${esc(i.link)}`);
    if (i.url) lines.push(`URL:${urlValue(i.url)}`);
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return render(lines);
}
