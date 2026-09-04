import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildIcs } from './ics.mjs';

const base = {
  uid: 'm1@keepsitemedia.com',
  start: new Date('2026-09-08T20:30:00Z'),
  minutes: 30,
  summary: 'Kickoff, then more',
  description: 'Line one\nLine two; with semicolon',
  url: 'https://meet/x',
  organizer: { name: 'Keepsite Media', email: 'office@x' },
  attendee: { name: 'Sierra Lee', email: 's@example.com' },
  stamp: new Date('2026-09-04T16:00:00Z'),
};

test('a calendar file has the required lines in UTC with CRLF endings', () => {
  const ics = buildIcs(base);
  const lines = ics.split('\r\n');
  assert.equal(lines[0], 'BEGIN:VCALENDAR');
  assert.ok(lines.includes('DTSTART:20260908T203000Z'));
  assert.ok(lines.includes('DTEND:20260908T210000Z'));
  assert.ok(lines.includes('DTSTAMP:20260904T160000Z'));
  assert.ok(lines.includes('UID:m1@keepsitemedia.com'));
  assert.ok(lines.includes('SUMMARY:Kickoff\\, then more'));
  assert.ok(lines.includes('DESCRIPTION:Line one\\nLine two\\; with semicolon'));
  assert.ok(lines.includes('URL:https://meet/x'));
  assert.ok(lines.includes('ORGANIZER;CN=Keepsite Media:mailto:office@x'));
  assert.ok(lines.includes('ATTENDEE;CN=Sierra Lee;RSVP=FALSE:mailto:s@example.com'));
  assert.equal(lines.at(-2), 'END:VCALENDAR');
  assert.equal(lines.at(-1), '');
  assert.ok(!ics.includes('\n\n'));
});

test('an empty url is omitted', () => {
  assert.ok(!buildIcs({ ...base, url: '' }).includes('URL:'));
});

test('a CRLF-injecting attendee email cannot add a calendar line', () => {
  const ics = buildIcs({ ...base, attendee: { name: 'Sierra Lee', email: 's@example.com\r\nX-EVIL:1' } });
  assert.ok(!ics.split('\r\n').some((line) => line.startsWith('X-EVIL')));
});
