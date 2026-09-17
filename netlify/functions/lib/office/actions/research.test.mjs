import { test } from 'node:test';
import assert from 'node:assert/strict';
import { research } from './research.mjs';
import { createStore } from '../store.mjs';
import { memoryBackend } from '../backends.mjs';
import { mintCsrf } from '../session.mjs';
import { emptyStudy, openRound } from '../research.mjs';

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

test('read, page, reset and type edits reshape the study', async () => {
  const s = await make();
  for (const t of ['a', 'b']) await research(post({ csrf, slug: 'acme', op: 'add', text: t, cluster: 'W', arm: '' }), ctx(), s, now);
  let round = openRound(await s.research.get('acme'));
  const [ka, kb] = round.keywords.map((k) => k.id);
  await research(post({ csrf, op: 'capture', payload: capture('a') }), ctx(), s, now);
  await research(post({ csrf, op: 'capture', payload: capture('b', 4) }), ctx(), s, now);
  round = openRound(await s.research.get('acme'));
  assert.equal(round.pages.length, 2);
  const key = [ka, kb].sort().join('|');
  await research(post({ csrf, slug: 'acme', op: 'read', key, human: 'Probably same', sameCluster: 'Yes', notes: 'call' }), ctx(), s, now);
  round = openRound(await s.research.get('acme'));
  assert.deepEqual(round.reads[key], { human: 'Probably same', sameCluster: 'Yes', notes: 'call' });
  assert.equal(round.pages.length, 1);
  const bad = await research(post({ csrf, slug: 'acme', op: 'read', key, human: 'Nope', sameCluster: 'Yes', notes: '' }), ctx(), s, now);
  assert.match(location(bad), /error=/);

  const pid = round.pages[0].id;
  await research(post({ csrf, slug: 'acme', op: 'page', id: pid, title: 'Flowers', type: 'Service page', note: 'n', keywords: `${ka},${kb}` }), ctx(), s, now);
  round = openRound(await s.research.get('acme'));
  assert.equal(round.pages[0].auto, false);
  assert.equal(round.pages[0].title, 'Flowers');
  await research(post({ csrf, slug: 'acme', op: 'reset', id: pid }), ctx(), s, now);
  round = openRound(await s.research.get('acme'));
  assert.ok(round.pages.every((p) => p.auto));

  await research(post({ csrf, slug: 'acme', op: 'type', keyword: ka, rank: '1', pageType: 'Other' }), ctx(), s, now);
  round = openRound(await s.research.get('acme'));
  assert.equal(round.serps[ka].results[0].pageType, 'Other');
  assert.equal(round.serps[ka].results[0].typeSource, 'manual');
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
  assert.equal(openRound(await s.research.get('acme')).reportedAt, now.toISOString());
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

test('refuses without csrf, on GET, and on an unknown client', async () => {
  const s = await make();
  assert.equal((await research(new Request('https://site.test/office/api/research'), ctx(), s, now)).status, 405);
  assert.equal((await research(post({ slug: 'acme', op: 'draft' }), ctx(), s, now)).status, 403);
  assert.equal((await research(post({ csrf, slug: 'zzz', op: 'draft' }), ctx(), s, now)).status, 404);
});
