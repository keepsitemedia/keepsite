import { test } from 'node:test';
import assert from 'node:assert/strict';
import { submit, decline, clientIp, userAgentOf } from './sign.mjs';
import { createAgreement, sendAgreement, defaultFields } from './agreements.mjs';
import { findAgreementTemplate } from './agreement-templates.mjs';
import { createStore } from './store.mjs';
import { memoryBackend } from './backends.mjs';

const NOW = new Date('2026-09-08T16:00:00Z');
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const DATA_URL = `data:image/png;base64,${PNG.toString('base64')}`;
const client = { slug: 'lova', name: 'Sierra Lee', business: 'Lova', email: 's@example.com', phone: '', address: '', tier: 'Search' };
const post = (path, fields, headers = {}) => {
  const d = new FormData();
  for (const [k, v] of Object.entries(fields)) d.append(k, v);
  return new Request(`https://site.test${path}`, { method: 'POST', body: d, headers });
};
const mailer = () => { const sent = []; return { sent, fetchFn: async (u, i) => { sent.push(JSON.parse(i.body)); return new Response('{"id":"re"}'); } }; };
test.before(() => { process.env.RESEND_API_KEY = 'k'; process.env.KEEPSITE_NOTIFY_FROM = 'o@x'; process.env.KEEPSITE_NOTIFY_TO = 'me@x'; });
test.after(() => { delete process.env.RESEND_API_KEY; delete process.env.KEEPSITE_NOTIFY_FROM; delete process.env.KEEPSITE_NOTIFY_TO; });

async function ready() {
  const s = createStore({ office: memoryBackend(), questionnaires: memoryBackend() });
  await s.clients.put('lova', client);
  const a = await createAgreement({ client, templateId: 'search', fields: defaultFields(client, findAgreementTemplate('search')), admin: { email: 'me@x' } }, s, NOW);
  const sent = await sendAgreement({ slug: 'lova', id: a.id, signatureDataUrl: DATA_URL, admin: { email: 'me@x' } }, s, NOW);
  return { s, a: sent, t: sent.signers.client.token };
}

test('submit signs with both consents and records the client IP', async () => {
  const { s, a, t } = await ready();
  const { fetchFn } = mailer();
  const res = await submit(post('/sign/api/submit', { t, consentTerms: 'on', consentEsign: 'on', signature: DATA_URL }, { 'x-nf-client-connection-ip': '203.0.113.9', 'user-agent': 'UA' }), s, fetchFn, NOW);
  assert.equal(res.status, 303);
  assert.equal(res.headers.get('Location'), `/sign/?t=${t}`);
  const after = await s.agreements.get('lova', a.id);
  assert.equal(after.status, 'completed');
  assert.equal(after.signers.client.ip, '203.0.113.9');
  assert.equal(after.signers.client.userAgent, 'UA');
});

test('submit without a consent or a signature goes back with the reason', async () => {
  const { s, a, t } = await ready();
  const { fetchFn } = mailer();
  const res = await submit(post('/sign/api/submit', { t, consentEsign: 'on', signature: DATA_URL }), s, fetchFn, NOW);
  assert.match(decodeURIComponent(res.headers.get('Location')), /error=you must agree to the terms/);
  assert.equal((await s.agreements.get('lova', a.id)).status, 'sent');
  const res2 = await submit(post('/sign/api/submit', { t, consentTerms: 'on', consentEsign: 'on', signature: '' }), s, fetchFn, NOW);
  assert.match(decodeURIComponent(res2.headers.get('Location')), /error=draw your signature/);
});

test('an unknown token is 404, a GET is 405, and a non-form body is 400', async () => {
  const { s } = await ready();
  assert.equal((await submit(post('/sign/api/submit', { t: 'nope', consentTerms: 'on', consentEsign: 'on', signature: DATA_URL }), s)).status, 404);
  assert.equal((await submit(new Request('https://site.test/sign/api/submit'), s)).status, 405);
  assert.equal((await submit(new Request('https://site.test/sign/api/submit', { method: 'POST', body: 'x' }), s)).status, 400);
});

test('decline records the reason and lands on the declined state', async () => {
  const { s, a, t } = await ready();
  const { sent, fetchFn } = mailer();
  const res = await decline(post('/sign/api/decline', { t, reason: 'Not this year' }), s, fetchFn, NOW);
  assert.equal(res.headers.get('Location'), `/sign/?t=${t}`);
  assert.equal((await s.agreements.get('lova', a.id)).status, 'declined');
  assert.equal(sent.length, 1);
});

test('clientIp falls back to x-forwarded-for and bounds both to 45 chars', () => {
  const req = (headers) => new Request('https://site.test/sign/api/submit', { headers });
  assert.equal(clientIp(req({ 'x-nf-client-connection-ip': '', 'x-forwarded-for': '9.9.9.9' })), '9.9.9.9');
  const long = '9'.repeat(3000);
  assert.equal(clientIp(req({ 'x-forwarded-for': long })).length, 45);
});

test('userAgentOf bounds the header to 300 chars', () => {
  const req = (ua) => new Request('https://site.test/sign/api/submit', { headers: { 'user-agent': ua } });
  assert.equal(userAgentOf(req('x'.repeat(3000))).length, 300);
  assert.equal(userAgentOf(new Request('https://site.test/sign/api/submit')), null);
});
