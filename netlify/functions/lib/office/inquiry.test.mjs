import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recordInquiry } from './inquiry.mjs';
import { createStore } from './store.mjs';
import { memoryBackend } from './backends.mjs';

const make = () => createStore({ office: memoryBackend(), questionnaires: memoryBackend() });
const NOW = new Date('2026-09-04T16:00:00Z');
const data = {
  name: 'Sierra', email: 'Sierra@Example.com', business: 'Lova Content Creation',
  website: 'https://lova.example', package: 'Search', about: 'Content for creators.', notes: 'Soon please',
};

test('a new inquiry becomes a client at the first stage with its tasks', async () => {
  const s = make();
  const r = await recordInquiry(data, s, NOW);
  assert.deepEqual(r, { slug: 'lova-content-creation', created: true });
  const c = await s.clients.get('lova-content-creation');
  assert.equal(c.stage, 'inquiry');
  assert.equal(c.tier, 'Search');
  assert.equal(c.email, 'Sierra@Example.com');
  assert.match(c.notes, /Content for creators\./);
  assert.match(c.notes, /Soon please/);
  assert.equal((await s.tasks.list('lova-content-creation')).length, 1);
});

test('a repeat inquiry from the same email is appended as a note', async () => {
  const s = make();
  await recordInquiry(data, s, NOW);
  const r = await recordInquiry({ ...data, email: 'sierra@example.com', notes: 'Second thoughts' }, s, new Date('2026-09-07T00:00:00Z'));
  assert.deepEqual(r, { slug: 'lova-content-creation', created: false });
  assert.equal((await s.clients.list()).length, 1);
  assert.match((await s.clients.get('lova-content-creation')).notes, /2026-09-06.*Second thoughts/s);
});

test('"Not sure yet" and unknown packages leave the tier blank', async () => {
  const s = make();
  await recordInquiry({ ...data, package: 'Not sure yet' }, s, NOW);
  assert.equal((await s.clients.get('lova-content-creation')).tier, '');
});

test('a garbage submission still lands rather than throwing', async () => {
  const s = make();
  const r = await recordInquiry({ email: 'x@example.com' }, s, NOW);
  assert.equal(r.created, true);
  assert.equal(r.slug, 'client');
});
