import { test } from 'node:test';
import assert from 'node:assert/strict';
import { send } from './send.mjs';
import { createStore } from '../store.mjs';
import { memoryBackend } from '../backends.mjs';
import { mintCsrf } from '../session.mjs';

const make = async () => {
  const s = createStore({ office: memoryBackend(), questionnaires: memoryBackend() });
  await s.clients.put('lova', { slug: 'lova', name: 'Sierra Lee', business: 'Lova', email: 's@example.com' });
  return s;
};
const post = (fields) => {
  const d = new FormData();
  for (const [k, v] of Object.entries(fields)) d.append(k, v);
  return new Request('https://site.test/office/api/send', { method: 'POST', body: d });
};
let csrf;
test.before(() => { process.env.KEEPSITE_SESSION_SECRET = 's'; process.env.RESEND_API_KEY = 'k'; process.env.KEEPSITE_NOTIFY_FROM = 'o@x'; csrf = mintCsrf('s'); });
test.after(() => { delete process.env.KEEPSITE_SESSION_SECRET; delete process.env.RESEND_API_KEY; delete process.env.KEEPSITE_NOTIFY_FROM; });
const ctx = () => ({ admin: { email: 'me@x' }, csrf });
const ok = async () => new Response('{"id":"re_1"}');

test('a filled email is sent to the client and logged', async () => {
  const s = await make();
  let sent;
  const fetchFn = async (u, i) => { sent = JSON.parse(i.body); return ok(); };
  const res = await send(post({ csrf, slug: 'lova', template: 'intro', subject: 'Ten minutes', body: 'Hi Sierra\n\nhttps://x' }), ctx(), s, fetchFn);
  assert.equal(res.headers.get('Location'), '/office/clients/lova/?tab=emails&sent=1');
  assert.deepEqual(sent.to, ['s@example.com']);
  assert.equal(sent.subject, 'Ten minutes');
  const [log] = await s.emails.list('lova');
  assert.equal(log.template, 'intro');
  assert.equal(log.kind, 'template');
});

test('an unfilled optional field is stripped rather than refused', async () => {
  const s = await make();
  let sent;
  const fetchFn = async (u, i) => { sent = JSON.parse(i.body); return ok(); };
  const res = await send(post({ csrf, slug: 'lova', template: 'intro', subject: 'x', body: 'Hi\n\n{{note}}\n\nBye' }), ctx(), s, fetchFn);
  assert.equal(res.status, 303);
  assert.equal(sent.text, 'Hi\n\nBye');
});

test('a leftover placeholder goes back to the send screen and sends nothing', async () => {
  const s = await make();
  let called = false;
  const res = await send(post({ csrf, slug: 'lova', template: 'agreement', subject: 'x', body: 'Sign: {{signLink}}' }), ctx(), s, async () => { called = true; });
  assert.equal(res.status, 303);
  assert.match(decodeURIComponent(res.headers.get('Location')), /^\/office\/send\/lova\/agreement\/\?error=.*signLink/);
  assert.equal(called, false);
  assert.equal((await s.emails.list('lova')).length, 0);
});

test('an empty subject, an unknown template, a bad csrf and a missing client are refused', async () => {
  const s = await make();
  const none = async () => { throw new Error('must not send'); };
  let res = await send(post({ csrf, slug: 'lova', template: 'intro', subject: '', body: 'b' }), ctx(), s, none);
  assert.match(decodeURIComponent(res.headers.get('Location')), /error=.*subject/);
  assert.equal((await send(post({ csrf, slug: 'lova', template: 'nope', subject: 's', body: 'b' }), ctx(), s, none)).status, 400);
  assert.equal((await send(post({ csrf: 'x', slug: 'lova', template: 'intro', subject: 's', body: 'b' }), ctx(), s, none)).status, 403);
  assert.equal((await send(post({ csrf, slug: 'ghost', template: 'intro', subject: 's', body: 'b' }), ctx(), s, none)).status, 404);
});

test('a failed send lands on the emails tab with the reason', async () => {
  const s = await make();
  const bad = async () => new Response('{"message":"domain not verified"}', { status: 403 });
  const res = await send(post({ csrf, slug: 'lova', template: 'intro', subject: 's', body: 'b' }), ctx(), s, bad);
  assert.match(decodeURIComponent(res.headers.get('Location')), /tab=emails&error=domain not verified/);
  assert.equal((await s.emails.list('lova'))[0].status, 'failed');
});
