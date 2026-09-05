import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memoryBackend } from './backends.mjs';
import { createStore, assertSlug } from './store.mjs';
import { newId } from './ids.mjs';

const make = () => createStore({ office: memoryBackend(), questionnaires: memoryBackend() });

test('clients round-trip and list', async () => {
  const s = make();
  await s.clients.put('lova', { slug: 'lova', business: 'Lova' });
  await s.clients.put('acme', { slug: 'acme', business: 'Acme' });
  assert.deepEqual(await s.clients.get('lova'), { slug: 'lova', business: 'Lova' });
  assert.equal(await s.clients.get('none'), null);
  assert.deepEqual((await s.clients.list()).map((c) => c.slug), ['acme', 'lova']);
});

test('per-client documents list by client and in creation order', async () => {
  const s = make();
  const a = newId(new Date('2026-09-04T10:00:00Z'));
  const b = newId(new Date('2026-09-04T10:00:01Z'));
  await s.tasks.put('lova', b, { id: b, title: 'second' });
  await s.tasks.put('lova', a, { id: a, title: 'first' });
  await s.tasks.put('acme', a, { id: a, title: 'other' });
  assert.deepEqual((await s.tasks.list('lova')).map((t) => t.title), ['first', 'second']);
  assert.equal((await s.tasks.listAll()).length, 3);
  await s.tasks.remove('lova', a);
  assert.equal((await s.tasks.list('lova')).length, 1);
});

test('a bad slug or id is refused before any backend call', async () => {
  const s = make();
  await assert.rejects(() => s.clients.get('Bad Slug'), /bad slug/);
  await assert.rejects(() => s.tasks.put('lova', '../x', {}), /bad id/);
  assert.throws(() => assertSlug('../etc'), /bad slug/);
});

test('settings and questionnaires read from their own places', async () => {
  const q = memoryBackend();
  await q.setText('lova/intro.json', JSON.stringify({ form: 'intro', answers: {} }));
  await q.setText('lova/logo-mark.png', 'bytes');
  const s = createStore({ office: memoryBackend(), questionnaires: q });
  assert.equal(await s.settings.get('pipelines'), null);
  await s.settings.put('pipelines', [{ id: 'website' }]);
  assert.deepEqual(await s.settings.get('pipelines'), [{ id: 'website' }]);
  assert.equal((await s.questionnaires.get('lova', 'intro')).form, 'intro');
  assert.equal(await s.questionnaires.get('lova', 'brand'), null);
  assert.deepEqual(await s.questionnaires.files('lova'), ['lova/logo-mark.png']);
  await assert.rejects(() => s.settings.get('../x'), /bad setting/);
  await assert.rejects(() => s.questionnaires.get('lova', 'x/y'), /bad form/);
});

// The keys are the Data page's rows and the export whitelist's shape; a new
// store collection that lands here without an export route breaks that page.
test('counts every type', async () => {
  const s = make();
  await s.clients.put('lova', { slug: 'lova' });
  await s.tasks.put('lova', newId(), { title: 't' });
  assert.deepEqual(Object.keys(await s.counts()), ['clients', 'tasks', 'meetings', 'payments', 'agreements', 'emails', 'documents']);
  assert.deepEqual(await s.counts(), {
    clients: 1, tasks: 1, meetings: 0, payments: 0, agreements: 0, emails: 0, documents: 0,
  });
});

test('documents store bytes with a metadata sidecar and list by client', async () => {
  const s = make();
  const png = new Uint8Array([137, 80, 78, 71]);
  await s.documents.put('lova', 'agreement-1.pdf', new Uint8Array([37, 80, 68, 70]), { type: 'application/pdf', source: 'seal' });
  await s.documents.put('lova', 'sig.png', png, { type: 'image/png', source: 'sign' });
  assert.deepEqual([...(await s.documents.get('lova', 'sig.png'))], [...png]);
  assert.equal(await s.documents.get('lova', 'none.png'), null);
  const meta = await s.documents.meta('lova', 'sig.png');
  assert.equal(meta.name, 'sig.png');
  assert.equal(meta.size, 4);
  assert.equal(meta.type, 'image/png');
  assert.equal(meta.source, 'sign');
  assert.match(meta.uploadedAt, /^\d{4}-/);
  assert.deepEqual((await s.documents.list('lova')).map((m) => m.name), ['agreement-1.pdf', 'sig.png']);
  assert.deepEqual(await s.documents.list('acme'), []);
  await assert.rejects(() => s.documents.put('lova', '../x', png, {}), /bad document name/);
  await assert.rejects(() => s.documents.get('lova', 'a b.png'), /bad document name/);
  assert.equal((await s.counts()).documents, 2);
});

test('a document name ending in .meta.json is rejected as reserved', async () => {
  const s = make();
  await assert.rejects(() => s.documents.put('lova', 'x.pdf.meta.json', new Uint8Array([1]), {}), /bad document name/);
  await s.documents.put('lova', 'x.pdf', new Uint8Array([1]), { type: 'application/pdf' });
  assert.ok(await s.documents.meta('lova', 'x.pdf'));
});

test('locks are acquired once', async () => {
  const s = make();
  assert.equal(await s.locks.acquire('seal-abc'), true);
  assert.equal(await s.locks.acquire('seal-abc'), false);
  assert.equal(await s.locks.acquire('seal-def'), true);
  await assert.rejects(() => s.locks.acquire('bad name!'), /bad lock/);
});

test('tokens index round-trips and rejects bad tokens', async () => {
  const s = make();
  const tok = 'A'.repeat(43);
  assert.equal(await s.tokens.get(tok), null);
  await s.tokens.put(tok, { slug: 'lova', id: 'x', party: 'client' });
  assert.deepEqual(await s.tokens.get(tok), { slug: 'lova', id: 'x', party: 'client' });
  await assert.rejects(() => s.tokens.put('short', {}), /bad token/);
  await assert.rejects(() => s.tokens.get('../clients/lova.json'), /bad token/);
});

test('documents remove bytes and sidecar together', async () => {
  const s = make();
  await s.documents.put('lova', 'brief.pdf', new Uint8Array([1, 2, 3]), { type: 'application/pdf' });
  assert.equal((await s.documents.list('lova')).length, 1);
  await s.documents.remove('lova', 'brief.pdf');
  assert.equal(await s.documents.get('lova', 'brief.pdf'), null);
  assert.equal(await s.documents.meta('lova', 'brief.pdf'), null);
  assert.deepEqual(await s.documents.list('lova'), []);
});

test('a sidecar that will not parse is read as null, not thrown', async () => {
  const office = memoryBackend();
  const s = createStore({ office, questionnaires: memoryBackend() });
  await s.documents.put('lova', 'brief.pdf', new Uint8Array([1]), { type: 'application/pdf', source: 'upload' });
  await office.setText('documents/lova/broken.pdf.meta.json', '{bad');
  await office.setText('documents/lova/empty.pdf.meta.json', '');
  const rows = await s.documents.list('lova');
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.filter(Boolean).map((m) => m.name), ['brief.pdf']);
});

test('the sidecar holds the real name, size and time whatever the caller passes', async () => {
  const s = make();
  await s.documents.put('lova', 'brief.pdf', new Uint8Array([1, 2]), { name: 'other.pdf', size: 999, uploadedAt: 'whenever', source: 'upload' }, new Date('2026-09-08T16:00:00Z'));
  const meta = await s.documents.meta('lova', 'brief.pdf');
  assert.equal(meta.name, 'brief.pdf');
  assert.equal(meta.size, 2);
  assert.equal(meta.uploadedAt, '2026-09-08T16:00:00.000Z');
  assert.equal(meta.source, 'upload');
});

test('a remove that only gets the sidecar hides the row', async () => {
  const office = memoryBackend();
  const s = createStore({ office, questionnaires: memoryBackend() });
  await s.documents.put('lova', 'brief.pdf', new Uint8Array([1]), { type: 'application/pdf', source: 'upload' });
  const remove = office.remove.bind(office);
  office.remove = async (k) => { if (!k.endsWith('.meta.json')) throw new Error('backend down'); return remove(k); };
  await assert.rejects(() => s.documents.remove('lova', 'brief.pdf'), /backend down/);
  assert.deepEqual(await s.documents.list('lova'), []);
});

test('questionnaire files are readable by name', async () => {
  const q = memoryBackend();
  const s = createStore({ office: memoryBackend(), questionnaires: q });
  await q.setBytes('lova/logo-mark.png', new Uint8Array([137, 80]));
  assert.deepEqual([...(await s.questionnaires.file('lova', 'logo-mark.png'))], [137, 80]);
  assert.equal(await s.questionnaires.file('lova', 'none.png'), null);
  await assert.rejects(() => s.questionnaires.file('lova', '../acme/logo.png'), /bad document name/);
});
