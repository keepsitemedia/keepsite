import { test } from 'node:test';
import assert from 'node:assert/strict';
import { document } from './document.mjs';
import { createStore } from '../store.mjs';
import { memoryBackend } from '../backends.mjs';
import { mintCsrf } from '../session.mjs';

const make = async () => {
  const s = createStore({ office: memoryBackend(), questionnaires: memoryBackend() });
  await s.clients.put('lova', { slug: 'lova', name: 'Sierra Lee', business: 'Lova', email: 's@example.com', tier: 'Search' });
  return s;
};
const post = (fields) => {
  const d = new FormData();
  for (const [k, v] of Object.entries(fields)) d.append(k, v);
  return new Request('https://site.test/office/api/document', { method: 'POST', body: d });
};
let csrf;
test.before(() => { process.env.KEEPSITE_SESSION_SECRET = 's'; csrf = mintCsrf('s'); });
test.after(() => { delete process.env.KEEPSITE_SESSION_SECRET; });
const ctx = () => ({ admin: { email: 'me@x' }, csrf });
const NOW = new Date('2026-09-08T16:00:00Z');
const loc = (res) => decodeURIComponent(res.headers.get('Location'));
const pdf = (name) => new File([new Uint8Array([37, 80, 68, 70])], name, { type: 'application/pdf' });

test('upload stores the file under its safe name with upload metadata', async () => {
  const s = await make();
  const res = await document(post({ csrf, op: 'upload', slug: 'lova', file: pdf('../Brand Brief (final).pdf') }), ctx(), s, NOW);
  assert.equal(loc(res), '/office/clients/lova/?tab=documents');
  const meta = await s.documents.meta('lova', 'Brand-Brief-final-.pdf');
  assert.equal(meta.source, 'upload');
  assert.equal(meta.type, 'application/pdf');
  assert.equal(meta.uploadedBy, 'me@x');
  assert.equal(meta.size, 4);
  assert.equal(meta.uploadedAt, NOW.toISOString());
});

// safeName kept a leading underscore before; the store then refused the name
// and the upload threw out of the action as a 500 instead of storing a file.
test('a name starting with punctuation is stored, not thrown out of', async () => {
  const s = await make();
  const res = await document(post({ csrf, op: 'upload', slug: 'lova', file: pdf('_DSC0001.pdf') }), ctx(), s, NOW);
  assert.equal(loc(res), '/office/clients/lova/?tab=documents');
  assert.equal((await s.documents.meta('lova', 'DSC0001.pdf')).source, 'upload');
});

test('an empty or missing file is refused with a message, not a 500', async () => {
  const s = await make();
  const res = await document(post({ csrf, op: 'upload', slug: 'lova' }), ctx(), s, NOW);
  assert.equal(loc(res), '/office/clients/lova/?tab=documents&error=choose a file');
  assert.deepEqual(await s.documents.list('lova'), []);
});

test('an upload cannot overwrite a sealed or signed document', async () => {
  const s = await make();
  await s.documents.put('lova', 'agreement-1.pdf', new Uint8Array([1]), { type: 'application/pdf', source: 'seal' });
  const res = await document(post({ csrf, op: 'upload', slug: 'lova', file: pdf('agreement-1.pdf') }), ctx(), s, NOW);
  assert.match(loc(res), /error=that name belongs to a sealed or signed document/);
  assert.deepEqual([...(await s.documents.get('lova', 'agreement-1.pdf'))], [1]);
});

test('an upload named like a metadata sidecar is refused', async () => {
  const s = await make();
  await s.documents.put('lova', 'agreement-1.pdf', new Uint8Array([1]), { type: 'application/pdf', source: 'seal' });
  const before = await s.documents.meta('lova', 'agreement-1.pdf');
  const res = await document(post({ csrf, op: 'upload', slug: 'lova', file: pdf('agreement-1.pdf.meta.json') }), ctx(), s, NOW);
  assert.match(loc(res), /error=that name cannot be used/);
  assert.deepEqual(await s.documents.meta('lova', 'agreement-1.pdf'), before);
  assert.equal((await s.documents.list('lova')).length, 1);
});

test('remove deletes an upload and refuses anything else', async () => {
  const s = await make();
  await s.documents.put('lova', 'brief.pdf', new Uint8Array([1]), { type: 'application/pdf', source: 'upload' });
  await s.documents.put('lova', 'agreement-1.pdf', new Uint8Array([1]), { type: 'application/pdf', source: 'seal' });
  assert.equal(loc(await document(post({ csrf, op: 'remove', slug: 'lova', name: 'brief.pdf' }), ctx(), s, NOW)), '/office/clients/lova/?tab=documents');
  assert.equal(await s.documents.meta('lova', 'brief.pdf'), null);
  assert.match(loc(await document(post({ csrf, op: 'remove', slug: 'lova', name: 'agreement-1.pdf' }), ctx(), s, NOW)), /error=only uploads can be removed/);
  assert.ok(await s.documents.meta('lova', 'agreement-1.pdf'));
  assert.match(loc(await document(post({ csrf, op: 'remove', slug: 'lova', name: 'nope.pdf' }), ctx(), s, NOW)), /error=no such document/);
});

test('method, form, csrf, slug and op are checked in that order', async () => {
  const s = await make();
  assert.equal((await document(new Request('https://site.test/office/api/document'), ctx(), s, NOW)).status, 405);
  assert.equal((await document(post({ op: 'upload', slug: 'lova' }), ctx(), s, NOW)).status, 403);
  assert.equal((await document(post({ csrf, op: 'upload', slug: 'Nope' }), ctx(), s, NOW)).status, 400);
  assert.equal((await document(post({ csrf, op: 'upload', slug: 'acme' }), ctx(), s, NOW)).status, 404);
  assert.equal((await document(post({ csrf, op: 'rename', slug: 'lova' }), ctx(), s, NOW)).status, 400);
});
