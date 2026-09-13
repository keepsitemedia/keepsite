import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildIcs, buildFeedIcs } from './ics.mjs';

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

test('sequence and method default to a fresh REQUEST', () => {
  const lines = buildIcs(base).split('\r\n');
  assert.ok(lines.includes('METHOD:REQUEST'));
  assert.ok(lines.includes('SEQUENCE:0'));
  assert.ok(!lines.includes('STATUS:CANCELLED'));
});

test('a CANCEL method carries its sequence and STATUS:CANCELLED', () => {
  const lines = buildIcs({ ...base, sequence: 2, method: 'CANCEL' }).split('\r\n');
  assert.ok(lines.includes('METHOD:CANCEL'));
  assert.ok(lines.includes('SEQUENCE:2'));
  assert.ok(lines.includes('STATUS:CANCELLED'));
});

test('a content line over 75 octets folds with a leading space on the continuation, and unfolding restores it', () => {
  // The emoji sits astride the 75-octet boundary so a byte-unsafe split
  // would corrupt it; back the boundary off to the start of the character.
  const longSummary = 'A'.repeat(65) + '😀' + 'B'.repeat(30);
  const ics = buildIcs({ ...base, summary: longSummary });
  const lines = ics.split('\r\n');
  const first = lines.findIndex((l) => l.startsWith('SUMMARY:'));
  assert.ok(Buffer.byteLength(lines[first], 'utf8') <= 75);
  assert.equal(lines[first + 1][0], ' ');
  assert.ok(Buffer.byteLength(lines[first + 1], 'utf8') <= 75);
  const unfolded = ics.replace(/\r\n /g, '');
  assert.ok(unfolded.includes(`SUMMARY:${longSummary}`));
});

test('URL is passed through unescaped in both builders, and a CRLF in it cannot inject a line', () => {
  const commaUrl = 'https://x/?a=1,2';
  assert.ok(buildIcs({ ...base, url: commaUrl }).includes(`URL:${commaUrl}`));
  const feedItem = (url) => ({ kind: 'task', id: 'u1', business: null, title: 'T', due: '2026-09-19', time: null, done: false, url });
  assert.ok(buildFeedIcs([feedItem(commaUrl)], new Date('2026-09-13T00:00:00Z')).includes(`URL:${commaUrl}`));

  const injectingUrl = 'https://x/\r\nX-EVIL:1';
  const icsA = buildIcs({ ...base, url: injectingUrl });
  assert.ok(!icsA.split('\r\n').some((l) => l.startsWith('X-EVIL')));
  const icsB = buildFeedIcs([feedItem(injectingUrl)], new Date('2026-09-13T00:00:00Z'));
  assert.ok(!icsB.split('\r\n').some((l) => l.startsWith('X-EVIL')));
});

test('an empty window still returns a valid, component-free calendar', () => {
  const ics = buildFeedIcs([], new Date('2026-09-13T00:00:00Z'));
  assert.ok(ics.startsWith('BEGIN:VCALENDAR'));
  assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
  assert.ok(!ics.includes('VEVENT'));
});

test('a meeting item with a link carries it in DESCRIPTION', () => {
  const items = [{ kind: 'meeting', id: 'b1', business: 'Acme', title: 'Kickoff', ymd: '2026-09-20', time: '10:00', minutes: 45, link: 'https://meet/x', url: 'https://x/office/clients/acme/?tab=meetings' }];
  const ics = buildFeedIcs(items, new Date('2026-09-13T00:00:00Z'));
  assert.match(ics, /DESCRIPTION:https:\/\/meet\/x\r\n/);
});

test('buildFeedIcs writes all-day and timed events for a whole window', () => {
  const now = new Date('2026-09-13T15:00:00Z');
  const items = [
    { kind: 'task', id: 'a1', business: null, title: 'Post', due: '2026-09-19', time: null, done: false, url: 'https://x/office/tasks/' },
    { kind: 'task', id: 'a2', business: 'Acme', title: 'Call', due: '2026-09-19', time: '09:00', done: true, url: 'https://x/office/clients/acme/?tab=tasks' },
    { kind: 'meeting', id: 'b1', business: 'Acme', title: 'Kickoff', ymd: '2026-09-20', time: '10:00', minutes: 45, url: 'https://x/office/clients/acme/?tab=meetings' },
  ];
  const ics = buildFeedIcs(items, now);
  assert.match(ics, /^BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-\/\/Keepsite Media\/\/Office\/\/EN\r\n/);
  assert.doesNotMatch(ics, /METHOD:/);
  assert.equal((ics.match(/BEGIN:VEVENT/g) ?? []).length, 3);
  assert.match(ics, /UID:a1@keepsitemedia.com\r\nDTSTAMP:20260913T150000Z\r\nDTSTART;VALUE=DATE:20260919\r\nDTEND;VALUE=DATE:20260920\r\nSUMMARY:Post\r\n/);
  assert.match(ics, /UID:a2@keepsitemedia.com\r\n[^]*?DTSTART:20260919T150000Z\r\nDTEND:20260919T153000Z\r\nSUMMARY:Acme: Call\r\nSTATUS:COMPLETED\r\n/);
  assert.match(ics, /UID:b1@keepsitemedia.com\r\n[^]*?DTSTART:20260920T160000Z\r\nDTEND:20260920T164500Z\r\nSUMMARY:Acme: Kickoff\r\n/);
  assert.match(ics, /URL:https:\/\/x\/office\/tasks\/\r\n/);
  assert.match(ics, /END:VCALENDAR\r\n$/);
});
