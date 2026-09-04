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

test('counts every type', async () => {
  const s = make();
  await s.clients.put('lova', { slug: 'lova' });
  await s.tasks.put('lova', newId(), { title: 't' });
  assert.deepEqual(await s.counts(), { clients: 1, tasks: 1, meetings: 0, payments: 0, agreements: 0, emails: 0 });
});
