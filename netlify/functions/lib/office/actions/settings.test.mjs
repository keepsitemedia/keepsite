import { test } from 'node:test';
import assert from 'node:assert/strict';
import { settings } from './settings.mjs';
import { createStore } from '../store.mjs';
import { memoryBackend } from '../backends.mjs';
import { mintCsrf } from '../session.mjs';

const make = () => createStore({ office: memoryBackend(), questionnaires: memoryBackend() });
const post = (fields) => {
  const d = new FormData();
  for (const [k, v] of Object.entries(fields)) d.append(k, v);
  return new Request('https://site.test/office/api/settings', { method: 'POST', body: d });
};
let csrf;
test.before(() => { process.env.KEEPSITE_SESSION_SECRET = 's'; csrf = mintCsrf('s'); });
test.after(() => { delete process.env.KEEPSITE_SESSION_SECRET; });
const ctx = () => ({ admin: { email: 'me' }, csrf });
const valid = JSON.stringify([{ id: 'photo', name: 'Photo shoot', stages: [{ id: 'booked', name: 'Booked', tasks: [{ title: 'Confirm', due: 1 }] }] }]);

test('valid pipelines are stored', async () => {
  const s = make();
  const res = await settings(post({ csrf, name: 'pipelines', value: valid }), ctx(), s);
  assert.equal(res.headers.get('Location'), '/office/settings/?saved=1');
  assert.equal((await s.settings.get('pipelines'))[0].id, 'photo');
});

test('invalid JSON and invalid pipelines go back with the reason', async () => {
  const s = make();
  let res = await settings(post({ csrf, name: 'pipelines', value: '{not json' }), ctx(), s);
  assert.match(decodeURIComponent(res.headers.get('Location')), /error=.*JSON/);
  res = await settings(post({ csrf, name: 'pipelines', value: '[{"id":"BAD","name":"x","stages":[]}]' }), ctx(), s);
  assert.match(decodeURIComponent(res.headers.get('Location')), /error=.*id must be/);
  assert.equal(await s.settings.get('pipelines'), null);
});

test('unknown setting names and bad csrf are refused', async () => {
  const s = make();
  assert.equal((await settings(post({ csrf, name: 'other', value: '[]' }), ctx(), s)).status, 400);
  assert.equal((await settings(post({ csrf: 'x', name: 'pipelines', value: valid }), ctx(), s)).status, 403);
});
