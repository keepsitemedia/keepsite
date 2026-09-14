import { test } from 'node:test';
import assert from 'node:assert/strict';
import { research } from './research.mjs';
import { createStore } from '../store.mjs';
import { memoryBackend } from '../backends.mjs';
import { mintCsrf } from '../session.mjs';
import { emptyStudy } from '../research.mjs';

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
  const study = await s.research.get('acme');
  assert.equal(study.keywords[0].text, 'wedding florist provo');
  assert.equal(study.keywords[0].cluster, 'Weddings');
  assert.deepEqual(study.areas, ['Provo']);
});

test('add, edit and remove keywords', async () => {
  const s = await make();
  await research(post({ csrf, slug: 'acme', op: 'add', text: ' Wedding florist ', cluster: 'Weddings', arm: '' }), ctx(), s, now);
  let study = await s.research.get('acme');
  assert.equal(study.keywords.length, 1);
  assert.equal(study.keywords[0].text, 'Wedding florist');
  const id = study.keywords[0].id;
  await research(post({ csrf, slug: 'acme', op: 'edit', id, text: 'wedding florist provo', cluster: 'W', arm: 'Flowers' }), ctx(), s, now);
  study = await s.research.get('acme');
  assert.deepEqual([study.keywords[0].text, study.keywords[0].cluster, study.keywords[0].arm], ['wedding florist provo', 'W', 'Flowers']);
  const dup = await research(post({ csrf, slug: 'acme', op: 'add', text: 'Wedding Florist Provo', cluster: 'W', arm: '' }), ctx(), s, now);
  assert.match(location(dup), /error=.*already/);
  await research(post({ csrf, slug: 'acme', op: 'remove', id }), ctx(), s, now);
  assert.equal((await s.research.get('acme')).keywords.length, 0);
});

test('capture with one match saves and redirects to that client', async () => {
  const s = await make();
  await research(post({ csrf, slug: 'acme', op: 'add', text: 'wedding florist provo', cluster: 'W', arm: '' }), ctx(), s, now);
  const res = await research(post({ csrf, op: 'capture', payload: capture('Wedding florist provo') }), ctx(), s, now);
  const study = await s.research.get('acme');
  const id = study.keywords[0].id;
  assert.equal(location(res), `/office/clients/acme/?tab=research&captured=${id}`);
  assert.equal(study.serps[id].results.length, 8);
  assert.equal(study.serps[id].results[0].pageType, 'Service page');
  assert.equal(study.pages.length, 1);
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
  const id = (await s.research.get('beta')).keywords[0].id;
  const picked = await research(post({ csrf, op: 'capture', payload: capture('shared term'), slug: 'beta', keyword: id }), ctx(), s, now);
  assert.equal(location(picked), `/office/clients/beta/?tab=research&captured=${id}`);
  assert.ok((await s.research.get('beta')).serps[id]);
});

test('capture rejects a bad payload', async () => {
  const s = await make();
  const res = await research(post({ csrf, op: 'capture', payload: 'nope' }), ctx(), s, now);
  assert.match(location(res), /^\/office\/research\/capture\/\?error=/);
});

test('read, page, reset and type edits reshape the study', async () => {
  const s = await make();
  for (const t of ['a', 'b']) await research(post({ csrf, slug: 'acme', op: 'add', text: t, cluster: 'W', arm: '' }), ctx(), s, now);
  let study = await s.research.get('acme');
  const [ka, kb] = study.keywords.map((k) => k.id);
  await research(post({ csrf, op: 'capture', payload: capture('a') }), ctx(), s, now);
  await research(post({ csrf, op: 'capture', payload: capture('b', 4) }), ctx(), s, now);
  study = await s.research.get('acme');
  assert.equal(study.pages.length, 2);
  const key = [ka, kb].sort().join('|');
  await research(post({ csrf, slug: 'acme', op: 'read', key, human: 'Probably same', sameCluster: 'Yes', notes: 'call' }), ctx(), s, now);
  study = await s.research.get('acme');
  assert.deepEqual(study.reads[key], { human: 'Probably same', sameCluster: 'Yes', notes: 'call' });
  assert.equal(study.pages.length, 1);
  const bad = await research(post({ csrf, slug: 'acme', op: 'read', key, human: 'Nope', sameCluster: 'Yes', notes: '' }), ctx(), s, now);
  assert.match(location(bad), /error=/);

  const pid = study.pages[0].id;
  await research(post({ csrf, slug: 'acme', op: 'page', id: pid, title: 'Flowers', type: 'Service page', note: 'n', keywords: `${ka},${kb}` }), ctx(), s, now);
  study = await s.research.get('acme');
  assert.equal(study.pages[0].auto, false);
  assert.equal(study.pages[0].title, 'Flowers');
  await research(post({ csrf, slug: 'acme', op: 'reset', id: pid }), ctx(), s, now);
  study = await s.research.get('acme');
  assert.ok(study.pages.every((p) => p.auto));

  await research(post({ csrf, slug: 'acme', op: 'type', keyword: ka, rank: '1', pageType: 'Other' }), ctx(), s, now);
  study = await s.research.get('acme');
  assert.equal(study.serps[ka].results[0].pageType, 'Other');
  assert.equal(study.serps[ka].results[0].typeSource, 'manual');
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
  assert.equal((await s.research.get('acme')).reportedAt, now.toISOString());
});

test('refuses without csrf, on GET, and on an unknown client', async () => {
  const s = await make();
  assert.equal((await research(new Request('https://site.test/office/api/research'), ctx(), s, now)).status, 405);
  assert.equal((await research(post({ slug: 'acme', op: 'draft' }), ctx(), s, now)).status, 403);
  assert.equal((await research(post({ csrf, slug: 'zzz', op: 'draft' }), ctx(), s, now)).status, 404);
});
