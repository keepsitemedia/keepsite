import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exportData } from './export.mjs';
import { createStore } from '../store.mjs';
import { memoryBackend } from '../backends.mjs';
import { newId } from '../ids.mjs';

const make = async () => {
  const s = createStore({ office: memoryBackend(), questionnaires: memoryBackend() });
  await s.clients.put('lova', { slug: 'lova', business: 'Lova', email: 'l@example.com' });
  await s.tasks.put('lova', newId(), { slug: 'lova', title: 'x', due: '2026-09-10' });
  return s;
};
const get = (q) => new Request(`https://site.test/office/api/export?${q}`);
const ctx = { admin: { email: 'me' }, csrf: '' };

test('json export returns the documents as an attachment', async () => {
  const res = await exportData(get('type=clients&format=json'), ctx, await make(), new Date('2026-09-04T16:00:00Z'));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('Content-Disposition'), 'attachment; filename="clients-2026-09-04.json"');
  assert.equal((await res.json())[0].slug, 'lova');
});

test('csv export flattens documents', async () => {
  const res = await exportData(get('type=tasks&format=csv'), ctx, await make());
  assert.match(res.headers.get('Content-Type'), /text\/csv/);
  assert.match(await res.text(), /^slug,title,due\r\nlova,x,2026-09-10\r\n$/);
});

test('unknown type or format is 400; POST is 405', async () => {
  const s = await make();
  assert.equal((await exportData(get('type=secrets&format=json'), ctx, s)).status, 400);
  assert.equal((await exportData(get('type=clients&format=xml'), ctx, s)).status, 400);
  assert.equal((await exportData(new Request('https://site.test/office/api/export', { method: 'POST' }), ctx, s)).status, 405);
});
