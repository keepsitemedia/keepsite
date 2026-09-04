// One VEVENT, hand-built: the format is small, and a dependency for it would
// be the only one in the office that touches nothing else.
const stamp = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
const esc = (s) => String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

export function buildIcs({ uid, start, minutes, summary, description, url, organizer, attendee, stamp: at = new Date() }) {
  const end = new Date(start.getTime() + minutes * 60e3);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Keepsite Media//Office//EN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${esc(uid)}`,
    `DTSTAMP:${stamp(at)}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${esc(summary)}`,
    `DESCRIPTION:${esc(description)}`,
    ...(url ? [`URL:${esc(url)}`] : []),
    `ORGANIZER;CN=${esc(organizer.name)}:mailto:${organizer.email}`,
    `ATTENDEE;CN=${esc(attendee.name)};RSVP=FALSE:mailto:${attendee.email}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.join('\r\n') + '\r\n';
}
