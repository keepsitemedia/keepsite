import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stage } from './stage.mjs';
import { client as clientAction } from './client.mjs';
import { createStore } from '../store.mjs';
import { memoryBackend } from '../backends.mjs';
import { mintCsrf } from '../session.mjs';

const make = () => createStore({ office: memoryBackend(), questionnaires: memoryBackend() });
const post = (fields, path = 'stage') => {
  const d = new FormData();
  for (const [k, v] of Object.entries(fields)) d.append(k, v);
  return new Request(`https://site.test/office/api/${path}`, { method: 'POST', body: d });
};
let csrf;
test.before(() => { process.env.KEEPSITE_SESSION_SECRET = 's'; csrf = mintCsrf('s'); });
test.after(() => { delete process.env.KEEPSITE_SESSION_SECRET; });
const ctx = () => ({ admin: { email: 'me' }, csrf });

async function seeded() {
  const s = make();
  await clientAction(post({ op: 'create', csrf, name: 'S', business: 'Lova', email: 's@example.com', pipeline: 'website' }, 'client'), ctx(), s);
  return s;
}

test('advancing writes the stage and its tasks and opens the stage email', async () => {
  const s = await seeded();
  const res = await stage(post({ csrf, slug: 'lova', stage: 'agreement' }), ctx(), s, new Date('2026-09-04T16:00:00Z'));
  assert.equal(res.headers.get('Location'), '/office/send/lova/agreement/');
  assert.equal((await s.clients.get('lova')).stage, 'agreement');
  const titles = (await s.tasks.list('lova')).map((t) => t.title).sort();
  assert.deepEqual(titles, ['Deposit received', 'Reply with recommendation', 'Send agreement']);
});

test('a stage without an email, or re-setting the same stage, lands on the client page', async () => {
  const s = await seeded();
  const demo = await stage(post({ csrf, slug: 'lova', stage: 'demo' }), ctx(), s);
  assert.equal(demo.headers.get('Location'), '/office/clients/lova/');
  await stage(post({ csrf, slug: 'lova', stage: 'agreement' }), ctx(), s);
  const again = await stage(post({ csrf, slug: 'lova', stage: 'agreement' }), ctx(), s);
  assert.equal(again.headers.get('Location'), '/office/clients/lova/');
});

test('unknown client or stage is refused, bad csrf is 403', async () => {
  const s = await seeded();
  assert.equal((await stage(post({ csrf, slug: 'ghost', stage: 'demo' }), ctx(), s)).status, 404);
  assert.equal((await stage(post({ csrf, slug: 'lova', stage: 'nope' }), ctx(), s)).status, 400);
  assert.equal((await stage(post({ csrf: 'x', slug: 'lova', stage: 'demo' }), ctx(), s)).status, 403);
});
