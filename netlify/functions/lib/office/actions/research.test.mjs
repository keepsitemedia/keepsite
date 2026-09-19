import { test } from 'node:test';
import assert from 'node:assert/strict';
import { research } from './research.mjs';
import { createStore } from '../store.mjs';
import { memoryBackend } from '../backends.mjs';
import { mintCsrf } from '../session.mjs';
import { emptyStudy, emptyRound, openRound } from '../research.mjs';

// createStore reads questionnaires and never writes them, so the test keeps
// the backend and writes the envelope the questionnaire function would.
const make = async () => {
  const q = memoryBackend();
  const s = createStore({ office: memoryBackend(), questionnaires: q });
  s.putEnvelope = (slug, form, envelope) => q.setText(`${slug}/${form}.json`, JSON.stringify(envelope));
  await s.clients.put('acme', { slug: 'acme', business: 'Acme', name: 'Ann', email: 'ann@example.com', tier: 'Growth' });
  await s.clients.put('beta', { slug: 'beta', business: 'Beta', name: 'Bo', email: 'bo@example.com', tier: 'Range' });
  return s;
};
const post = (fields) => {
  const d = new FormData();
  for (const [k, v] of Object.entries(fields)) d.append(k, v);
  return new Request('https://site.test/office/api/research', { method: 'POST', body: d });
};
let csrf;
test.before(() => { process.env.KEEPSITE_SESSION_SECRET = 's'; csrf = mintCsrf('s'); });
test.after(() => { delete process.env.KEEPSITE_SESSION_SECRET; });
const ctx = () => ({ admin: { email: 'me' }, csrf });
const now = new Date('2026-09-13T12:00:00Z');
const location = (res) => res.headers.get('Location');
const capture = (q, n = 8) => JSON.stringify({ q, results: Array.from({ length: n }, (_, i) => ({ rank: i + 1, url: `https://s${i}.com/p`, title: `S${i}` })), related: ['more'], at: now.toISOString() });

test('draft seeds keywords and areas from the build questionnaire', async () => {
  const s = await make();
  await s.putEnvelope('acme', 'build', { answers: { services: 'Weddings', searchTerms: 'wedding florist provo', serviceArea: 'Provo' } });
  const res = await research(post({ csrf, slug: 'acme', op: 'draft' }), ctx(), s, now);
  assert.equal(location(res), '/office/clients/acme/?tab=research');
  const round = openRound(await s.research.get('acme'));
  assert.equal(round.keywords[0].text, 'wedding florist provo');
  assert.equal(round.keywords[0].cluster, 'Weddings');
  assert.deepEqual(round.areas, ['Provo']);
});

test('add, edit and remove keywords', async () => {
  const s = await make();
  await research(post({ csrf, slug: 'acme', op: 'add', text: ' Wedding florist ', cluster: 'Weddings', arm: '' }), ctx(), s, now);
  let round = openRound(await s.research.get('acme'));
  assert.equal(round.keywords.length, 1);
  assert.equal(round.keywords[0].text, 'Wedding florist');
  const id = round.keywords[0].id;
  await research(post({ csrf, slug: 'acme', op: 'edit', id, text: 'wedding florist provo', cluster: 'W', arm: 'Flowers' }), ctx(), s, now);
  round = openRound(await s.research.get('acme'));
  assert.deepEqual([round.keywords[0].text, round.keywords[0].cluster, round.keywords[0].arm], ['wedding florist provo', 'W', 'Flowers']);
  const dup = await research(post({ csrf, slug: 'acme', op: 'add', text: 'Wedding Florist Provo', cluster: 'W', arm: '' }), ctx(), s, now);
  assert.match(location(dup), /error=.*already/);
  await research(post({ csrf, slug: 'acme', op: 'remove', id }), ctx(), s, now);
  assert.equal(openRound(await s.research.get('acme')).keywords.length, 0);
});

test('capture with one match saves and redirects to that client', async () => {
  const s = await make();
  await research(post({ csrf, slug: 'acme', op: 'add', text: 'wedding florist provo', cluster: 'W', arm: '' }), ctx(), s, now);
  const res = await research(post({ csrf, op: 'capture', payload: capture('Wedding florist provo') }), ctx(), s, now);
  const round = openRound(await s.research.get('acme'));
  const id = round.keywords[0].id;
  assert.equal(location(res), `/office/clients/acme/?tab=research&captured=${id}`);
  assert.equal(round.serps[id].results.length, 8);
  assert.equal(round.serps[id].results[0].pageType, 'Service page');
  assert.equal(round.pages.length, 1);
});

test('capture with no match or two matches goes to the picker, and a pick saves', async () => {
  const s = await make();
  await research(post({ csrf, slug: 'acme', op: 'add', text: 'shared term', cluster: 'W', arm: '' }), ctx(), s, now);
  await research(post({ csrf, slug: 'beta', op: 'add', text: 'shared term', cluster: 'W', arm: '' }), ctx(), s, now);
  const two = await research(post({ csrf, op: 'capture', payload: capture('shared term') }), ctx(), s, now);
  assert.equal(two.status, 303);
  assert.match(location(two), /^\/office\/research\/capture\/\?pick=1/);
  const none = await research(post({ csrf, op: 'capture', payload: capture('unknown') }), ctx(), s, now);
  assert.match(location(none), /^\/office\/research\/capture\/\?pick=1/);
  const id = openRound(await s.research.get('beta')).keywords[0].id;
  const picked = await research(post({ csrf, op: 'capture', payload: capture('shared term'), slug: 'beta', keyword: id }), ctx(), s, now);
  assert.equal(location(picked), `/office/clients/beta/?tab=research&captured=${id}`);
  assert.ok(openRound(await s.research.get('beta')).serps[id]);
});

test('capture rejects a bad payload', async () => {
  const s = await make();
  const res = await research(post({ csrf, op: 'capture', payload: 'nope' }), ctx(), s, now);
  assert.match(location(res), /^\/office\/research\/capture\/\?error=/);
});

test('page, reset and type edits reshape the study; read is refused', async () => {
  const s = await make();
  for (const t of ['a', 'b', 'c']) await research(post({ csrf, slug: 'acme', op: 'add', text: t, cluster: 'W', arm: '' }), ctx(), s, now);
  let round = openRound(await s.research.get('acme'));
  const [ka, kb, kc] = round.keywords.map((k) => k.id);
  await research(post({ csrf, op: 'capture', payload: capture('a') }), ctx(), s, now);
  await research(post({ csrf, op: 'capture', payload: capture('b') }), ctx(), s, now);
  await research(post({ csrf, op: 'capture', payload: capture('c', 4) }), ctx(), s, now);
  round = openRound(await s.research.get('acme'));
  assert.equal(round.pages.length, 1, 'three lists of the same businesses cluster into one page');

  const refused = await research(post({ csrf, slug: 'acme', op: 'read', key: [ka, kb].sort().join('|'), human: 'Same intent', sameCluster: 'Yes', notes: '' }), ctx(), s, now);
  assert.equal(refused.status, 400);
  assert.match(await refused.text(), /no longer/);

  // Split c off by hand: the page op with a keyword list.
  const split = new FormData();
  for (const [k, v] of Object.entries({ csrf, slug: 'acme', op: 'page', id: 'p9', title: 'C on its own', kind: 'Article', note: 'client asked' })) split.append(k, v);
  split.append('keywords', kc);
  await research(new Request('https://site.test/office/api/research', { method: 'POST', body: split }), ctx(), s, now);
  round = openRound(await s.research.get('acme'));
  assert.deepEqual(round.pages.map((p) => [p.auto, p.keywords.length]), [[false, 1], [true, 2]]);
  assert.equal(round.pages[0].kind, 'Article');
  assert.equal(round.pages[0].note, 'client asked');

  // Pull b into the edited page: a comma-joined list works too, and the
  // released keyword is reclustered on its own.
  await research(post({ csrf, slug: 'acme', op: 'page', id: 'p9', title: 'C and B', kind: 'Service page', note: '', keywords: `${kc},${kb}` }), ctx(), s, now);
  round = openRound(await s.research.get('acme'));
  assert.deepEqual(round.pages.map((p) => p.keywords.length), [2, 1]);
  assert.equal(round.pages[1].keywords[0], ka);

  const badKind = await research(post({ csrf, slug: 'acme', op: 'page', id: 'p9', title: 'x', kind: 'Directory', note: '', keywords: kc }), ctx(), s, now);
  assert.match(location(badKind), /error=.*kind/);

  await research(post({ csrf, slug: 'acme', op: 'reset', id: 'p9' }), ctx(), s, now);
  round = openRound(await s.research.get('acme'));
  assert.equal(round.pages.length, 1);
  assert.equal(round.pages[0].auto, true);

  // Checkboxes cannot all be named "keywords": the shared form reader
  // refuses a repeated field name, so each carries the keyword's own id in
  // its own name instead, and no "keywords" field is posted at all.
  const boxes = new FormData();
  for (const [k, v] of Object.entries({ csrf, slug: 'acme', op: 'page', id: 'p9', title: 'Boxed', kind: 'Article', note: '' })) boxes.append(k, v);
  boxes.append(`kw:${ka}`, 'on');
  boxes.append(`kw:${kb}`, 'on');
  await research(new Request('https://site.test/office/api/research', { method: 'POST', body: boxes }), ctx(), s, now);
  round = openRound(await s.research.get('acme'));
  const boxed = round.pages.find((p) => p.id === 'p9');
  assert.deepEqual([...boxed.keywords].sort(), [ka, kb].sort());

  await research(post({ csrf, slug: 'acme', op: 'type', keyword: ka, rank: '1', pageType: 'Blog/FAQ' }), ctx(), s, now);
  round = openRound(await s.research.get('acme'));
  assert.equal(round.serps[ka].results[0].pageType, 'Blog/FAQ');
  assert.equal(round.serps[ka].results[0].typeSource, 'manual');
});

test('volume imports a Planner CSV, stores ranges, and reports both unmatched lists', async () => {
  const s = await make();
  for (const t of ['utah bridal makeup', 'moab makeup']) await research(post({ csrf, slug: 'acme', op: 'add', text: t, cluster: 'W', arm: '' }), ctx(), s, now);
  const csv = 'Keyword Stats\r\nSep\r\nKeyword\tAvg. monthly searches\tMin search volume\tMax search volume\r\nUtah Bridal Makeup\t\t100\t1000\r\nnot here\t50\t\t\r\n';
  const file = new File([new Uint8Array([0xff, 0xfe, ...Buffer.from(csv, 'utf16le')])], 'planner.csv', { type: 'text/csv' });
  const res = await research(post({ csrf, slug: 'acme', op: 'volume', file }), ctx(), s, now);
  assert.equal(location(res), '/office/clients/acme/?tab=research');
  const round = openRound(await s.research.get('acme'));
  assert.deepEqual(round.keywords[0].volume, { min: 100, max: 1000, source: 'planner', at: now.toISOString() });
  assert.equal(round.keywords[1].volume, undefined);
  assert.deepEqual(round.volumeImport.unmatchedRows, ['not here']);
  assert.deepEqual(round.volumeImport.unmatchedKeywords, [round.keywords[1].id]);
  assert.equal(round.volumeImport.matched, 1);

  const empty = await research(post({ csrf, slug: 'acme', op: 'volume', file: new File([], 'x.csv') }), ctx(), s, now);
  assert.match(location(empty), /error=.*choose/);
  const junk = await research(post({ csrf, slug: 'acme', op: 'volume', file: new File(['a,b\n1,2\n'], 'x.csv') }), ctx(), s, now);
  assert.match(location(junk), /error=.*Keyword/);
});

test('volume-none counts the keywords Planner left out as zero and refuses once none remain', async () => {
  const s = await make();
  await research(post({ csrf, slug: 'acme', op: 'add', text: 'named keyword', cluster: 'W', arm: '' }), ctx(), s, now);
  await research(post({ csrf, slug: 'acme', op: 'add', text: 'silent keyword', cluster: 'W', arm: '' }), ctx(), s, now);
  await research(post({ csrf, slug: 'acme', op: 'volume', file: new File(['keyword,volume\nnamed keyword,50\n'], 'v.csv') }), ctx(), s, now);
  let round = openRound(await s.research.get('acme'));
  const [named, silent] = round.keywords;
  assert.deepEqual(named.volume, { min: 50, max: 50, source: 'csv', at: now.toISOString() });
  assert.equal(silent.volume, undefined);

  const res = await research(post({ csrf, slug: 'acme', op: 'volume-none' }), ctx(), s, now);
  assert.equal(location(res), '/office/clients/acme/?tab=research');
  round = openRound(await s.research.get('acme'));
  assert.deepEqual(round.keywords.find((k) => k.id === silent.id).volume, { min: 0, max: 0, source: 'none', at: now.toISOString() });
  assert.deepEqual(round.keywords.find((k) => k.id === named.id).volume, { min: 50, max: 50, source: 'csv', at: now.toISOString() });
  assert.deepEqual(round.volumeImport, { at: now.toISOString(), matched: 1, unmatchedRows: [], unmatchedKeywords: [] });

  const again = await research(post({ csrf, slug: 'acme', op: 'volume-none' }), ctx(), s, now);
  assert.match(location(again), /error=.*already/);
});

test('remove drops the keyword from the last import\'s unmatched list too', async () => {
  const s = await make();
  await research(post({ csrf, slug: 'acme', op: 'add', text: 'a', cluster: 'W', arm: '' }), ctx(), s, now);
  await research(post({ csrf, slug: 'acme', op: 'volume', file: new File(['keyword,volume\nzzz,5\n'], 'v.csv') }), ctx(), s, now);
  let round = openRound(await s.research.get('acme'));
  assert.equal(round.volumeImport.unmatchedKeywords.length, 1);
  await research(post({ csrf, slug: 'acme', op: 'remove', id: round.keywords[0].id }), ctx(), s, now);
  round = openRound(await s.research.get('acme'));
  assert.deepEqual(round.volumeImport.unmatchedKeywords, []);
});

test('starting a round freezes the final page list on the round it closes', async () => {
  const s = await make();
  await research(post({ csrf, slug: 'acme', op: 'add', text: 'a', cluster: 'W', arm: '' }), ctx(), s, now);
  await research(post({ csrf, op: 'capture', payload: capture('a') }), ctx(), s, now);
  await research(post({ csrf, slug: 'acme', op: 'round' }), ctx(), s, now);
  const study = await s.research.get('acme');
  const closed = study.rounds[0];
  assert.ok(closed.closedAt);
  assert.equal(closed.pages.length, 1);
  assert.ok(closed.pages[0].kind, 'the frozen row carries its kind');
  assert.ok(closed.pages[0].reason, 'and its reason');
});

test('report writes a document and stamps reportedAt', async () => {
  const s = await make();
  await research(post({ csrf, slug: 'acme', op: 'add', text: 'a', cluster: 'W', arm: '' }), ctx(), s, now);
  await research(post({ csrf, op: 'capture', payload: capture('a') }), ctx(), s, now);
  const res = await research(post({ csrf, slug: 'acme', op: 'report' }), ctx(), s, now);
  assert.equal(location(res), '/office/clients/acme/?tab=documents');
  const meta = await s.documents.meta('acme', 'search-research-2026-09-13.pdf');
  assert.equal(meta.source, 'research');
  assert.equal(meta.type, 'application/pdf');
  const saved = await s.research.get('acme');
  assert.equal(openRound(saved).reportedAt, now.toISOString());
  // report writes through touch like every other op, so it also refreshes
  // updatedAt and the round's page list rather than only stamping reportedAt.
  assert.equal(saved.updatedAt, now.toISOString());
  assert.equal(openRound(saved).pages.length, 1);
});

test('a legacy document is migrated on the way in and saved with rounds', async () => {
  const s = await make();
  await s.clients.put('x', { slug: 'x', business: 'X', name: 'X', email: 'x@example.com', tier: 'Growth' });
  await s.research.put('x', {
    slug: 'x', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    areas: [], keywords: [], serps: {}, reads: {}, pages: [], reportedAt: null,
  });
  await research(post({ csrf, slug: 'x', op: 'add', text: 'wedding florist', cluster: 'Flowers', arm: '' }), ctx(), s, now);
  const saved = await s.research.get('x');
  assert.equal(saved.rounds.length, 1);
  assert.equal(saved.rounds.at(-1).keywords.at(-1).text, 'wedding florist');
  assert.equal(saved.keywords, undefined);
});

test('areas saves the service areas and the place Google searches from', async () => {
  const s = await make();
  await research(post({ csrf, slug: 'acme', op: 'areas', areas: 'Provo, Moab', location: ' Utah, United States ' }), ctx(), s, now);
  const round = openRound(await s.research.get('acme'));
  assert.deepEqual(round.areas, ['Provo', 'Moab']);
  assert.equal(round.location, 'Utah, United States');
  await research(post({ csrf, slug: 'acme', op: 'areas', areas: 'Provo', location: '' }), ctx(), s, now);
  assert.equal(openRound(await s.research.get('acme')).location, '', 'clearing it is allowed');
});

test('starting a round closes the old one and inherits keywords with their ids', async () => {
  const s = await make();
  await research(post({ csrf, slug: 'acme', op: 'add', text: 'one', cluster: 'C', arm: '' }), ctx(), s, now);
  await research(post({ csrf, slug: 'acme', op: 'areas', areas: 'Provo', location: 'Utah, United States' }), ctx(), s, now);
  await research(post({ csrf, op: 'capture', payload: capture('one') }), ctx(), s, now);
  const keyword = openRound(await s.research.get('acme')).keywords[0];
  const opened = new Date('2027-03-02T00:00:00Z');
  await research(post({ csrf, slug: 'acme', op: 'round' }), ctx(), s, opened);
  const saved = await s.research.get('acme');
  assert.equal(saved.rounds.length, 2);
  assert.equal(saved.rounds[0].closedAt, '2027-03-02T00:00:00.000Z');
  assert.equal(saved.rounds[1].id, 'r2');
  assert.deepEqual(saved.rounds[1].keywords, [keyword]);
  assert.deepEqual(saved.rounds[1].areas, ['Provo']);
  assert.equal(saved.rounds[1].location, 'Utah, United States', 'and the place it searches from');
  assert.deepEqual(saved.rounds[1].serps, {});
  assert.deepEqual(saved.rounds[1].reads, {});
  assert.equal(saved.rounds[1].reportedAt, null);
  assert.deepEqual(saved.rounds[1].notes, { intro: '', closing: '' });
});

test('an op naming a closed round is refused, not retargeted', async () => {
  const s = await make();
  const study = { slug: 'acme', createdAt: now.toISOString(), updatedAt: now.toISOString(), rounds: [{ ...emptyRound('r1', now), closedAt: 'z' }, emptyRound('r2', now)] };
  await s.research.put('acme', study);
  const res = await research(post({ csrf, slug: 'acme', op: 'add', text: 'one', round: 'r1' }), ctx(), s, now);
  assert.equal(res.status, 400);
  assert.deepEqual(await s.research.get('acme'), study);
});

test('a closed round id on the report op is refused, and nothing is written', async () => {
  const s = await make();
  const study = { slug: 'acme', createdAt: now.toISOString(), updatedAt: now.toISOString(), rounds: [{ ...emptyRound('r1', now), closedAt: 'z' }, emptyRound('r2', now)] };
  await s.research.put('acme', study);
  // A stale Research tab still holds the round it was rendered with; the
  // guard is what turns that into a loud refusal instead of a report quietly
  // filed under whatever round happens to be open now.
  const res = await research(post({ csrf, slug: 'acme', op: 'report', round: 'r1' }), ctx(), s, now);
  assert.equal(res.status, 400);
  assert.deepEqual(await s.research.get('acme'), study);
  assert.equal(await s.documents.meta('acme', 'search-research-2026-09-13.pdf'), null);
});

test('an empty new round can be discarded, a captured one cannot', async () => {
  const s = await make();
  await s.research.put('acme', { slug: 'acme', createdAt: now.toISOString(), updatedAt: now.toISOString(), rounds: [{ ...emptyRound('r1', now), closedAt: 'z' }, emptyRound('r2', now)] });
  await research(post({ csrf, slug: 'acme', op: 'round-discard' }), ctx(), s, now);
  const saved = await s.research.get('acme');
  assert.equal(saved.rounds.length, 1);
  assert.equal(saved.rounds[0].closedAt, null);

  await s.research.put('beta', {
    slug: 'beta', createdAt: now.toISOString(), updatedAt: now.toISOString(),
    rounds: [{ ...emptyRound('r1', now), closedAt: 'z' }, { ...emptyRound('r2', now), serps: { k1: {} } }],
  });
  const res = await research(post({ csrf, slug: 'beta', op: 'round-discard' }), ctx(), s, now);
  assert.equal(res.status, 400);
});

test('notes are stored on the round and trimmed', async () => {
  const s = await make();
  await research(post({ csrf, slug: 'acme', op: 'notes', intro: '  What we looked at.  ', closing: 'What to do next.' }), ctx(), s, now);
  assert.deepEqual(openRound(await s.research.get('acme')).notes, { intro: 'What we looked at.', closing: 'What to do next.' });
});

test('an omitted note is stored as an empty string, not dropped', async () => {
  const s = await make();
  await research(post({ csrf, slug: 'acme', op: 'notes', intro: 'Only this one.' }), ctx(), s, now);
  assert.deepEqual(openRound(await s.research.get('acme')).notes, { intro: 'Only this one.', closing: '' });
});

test('refuses without csrf, on GET, and on an unknown client', async () => {
  const s = await make();
  assert.equal((await research(new Request('https://site.test/office/api/research'), ctx(), s, now)).status, 405);
  assert.equal((await research(post({ slug: 'acme', op: 'draft' }), ctx(), s, now)).status, 403);
  assert.equal((await research(post({ csrf, slug: 'zzz', op: 'draft' }), ctx(), s, now)).status, 404);
});
