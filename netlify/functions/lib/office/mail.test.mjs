import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sendMail } from './mail.mjs';
import { createStore } from './store.mjs';
import { memoryBackend } from './backends.mjs';

const make = () => createStore({ office: memoryBackend(), questionnaires: memoryBackend() });
const NOW = new Date('2026-09-04T16:00:00Z');
const env = (vars, fn) => {
  const prior = { ...process.env };
  Object.assign(process.env, vars);
  for (const k of Object.keys(vars)) if (vars[k] === undefined) delete process.env[k];
  return fn().finally(() => {
    for (const k of Object.keys(vars)) {
      if (prior[k] === undefined) delete process.env[k]; else process.env[k] = prior[k];
    }
  });
};

test('a successful send is logged with the Resend id', async () => {
  await env({ RESEND_API_KEY: 'k', KEEPSITE_NOTIFY_FROM: 'office@x' }, async () => {
    const s = make();
    const calls = [];
    const fetchFn = async (url, init) => { calls.push({ url, init }); return new Response(JSON.stringify({ id: 're_1' }), { status: 200 }); };
    const r = await sendMail({ slug: 'lova', to: 's@example.com', subject: 'Hi', text: 'Body **b**', template: 'intro', kind: 'stage' }, s, fetchFn, NOW);
    assert.equal(r.ok, true);
    const [log] = await s.emails.list('lova');
    assert.equal(log.status, 'sent');
    assert.equal(log.resendId, 're_1');
    assert.deepEqual(log.to, ['s@example.com']);
    const body = JSON.parse(calls[0].init.body);
    assert.equal(body.from, 'office@x');
    assert.match(body.html, /<strong>b<\/strong>/);
    assert.equal(calls[0].init.headers.Authorization, 'Bearer k');
  });
});

test('a Resend error and a network failure are logged as failed, not thrown', async () => {
  await env({ RESEND_API_KEY: 'k', KEEPSITE_NOTIFY_FROM: 'office@x' }, async () => {
    const s = make();
    const bad = async () => new Response(JSON.stringify({ message: 'nope' }), { status: 422 });
    const r = await sendMail({ slug: 'lova', to: 'a@b', subject: 's', text: 't' }, s, bad, NOW);
    assert.equal(r.ok, false);
    assert.equal(r.error, 'nope');
    const boom = async () => { throw new Error('offline'); };
    const r2 = await sendMail({ slug: 'lova', to: 'a@b', subject: 's', text: 't' }, s, boom, new Date('2026-09-04T16:00:01Z'));
    assert.equal(r2.error, 'offline');
    assert.equal((await s.emails.list('lova')).filter((e) => e.status === 'failed').length, 2);
  });
});

test('missing secrets fail closed without calling Resend', async () => {
  await env({ RESEND_API_KEY: undefined, KEEPSITE_NOTIFY_FROM: undefined }, async () => {
    const s = make();
    let called = false;
    const r = await sendMail({ slug: 'lova', to: 'a@b', subject: 's', text: 't' }, s, async () => { called = true; }, NOW);
    assert.equal(called, false);
    assert.equal(r.ok, false);
    assert.match(r.error, /RESEND_API_KEY/);
    assert.equal((await s.emails.list('lova'))[0].status, 'failed');
  });
});

test('attachments and an explicit html body pass through', async () => {
  await env({ RESEND_API_KEY: 'k', KEEPSITE_NOTIFY_FROM: 'office@x' }, async () => {
    let sent;
    const fetchFn = async (url, init) => { sent = JSON.parse(init.body); return new Response('{"id":"x"}'); };
    await sendMail({ slug: 'lova', to: ['a@b', 'c@d'], subject: 's', text: 't', html: '<p>given</p>', attachments: [{ filename: 'm.ics', content: 'QUJD' }] }, make(), fetchFn, NOW);
    assert.equal(sent.html, '<p>given</p>');
    assert.deepEqual(sent.to, ['a@b', 'c@d']);
    assert.equal(sent.attachments[0].filename, 'm.ics');
  });
});
