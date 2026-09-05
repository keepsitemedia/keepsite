import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newAgreement, newToken, tokenMatches, markSent, markViewed, markSigned, markDeclined, markExpired, markVoided, markSealed, isExpired, signerByToken, InvalidTransition } from './agreement-state.mjs';

const NOW = new Date('2026-09-08T16:00:00Z');
const later = (h) => new Date(NOW.getTime() + h * 3600e3);
const base = () => newAgreement({
  slug: 'lova', template: 'search', templateVersion: '2026-09-04', fields: { legalName: 'Lova' },
  keepsite: { name: 'Sierra Nichols', email: 'keepsitemedia@gmail.com' }, client: { name: 'Sierra Lee', email: 's@example.com' },
}, NOW);
const evidence = { ip: '203.0.113.5', userAgent: 'UA', signatureKey: 'sig.png' };

test('tokens are 32 random bytes and compare in constant time', () => {
  const t = newToken();
  assert.match(t, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(t, newToken());
  assert.ok(tokenMatches(t, t));
  assert.ok(!tokenMatches(t, t.slice(0, -1) + (t.endsWith('a') ? 'b' : 'a')));
  assert.ok(!tokenMatches(t, ''));
  assert.ok(!tokenMatches(t, null));
});

test('a new agreement is a draft with two pending signers and one audit entry', () => {
  const a = base();
  assert.match(a.id, /^20260908T160000/);
  assert.equal(a.status, 'draft');
  assert.equal(a.signers.client.status, 'pending');
  assert.notEqual(a.signers.client.token, a.signers.keepsite.token);
  assert.equal(a.signers.client.expiresAt, null);
  assert.deepEqual(a.audit.map((e) => e.event), ['created']);
  assert.equal(a.hash, null);
  assert.equal(signerByToken(a, a.signers.client.token), 'client');
  assert.equal(signerByToken(a, a.signers.keepsite.token), 'keepsite');
  assert.equal(signerByToken(a, 'nope'), null);
});

test('the admin signs the draft, then sending sets expiry and does not mutate the input', () => {
  const a = base();
  const signed = markSigned(a, 'keepsite', NOW, evidence);
  assert.equal(a.status, 'draft');
  assert.equal(signed.status, 'partiallySigned');
  assert.equal(signed.signers.keepsite.status, 'signed');
  assert.equal(signed.signers.keepsite.signatureKey, 'sig.png');
  assert.equal(signed.signers.keepsite.signedAt, NOW.toISOString());
  const sent = markSent({ ...signed, status: 'draft' }, later(1));
  assert.equal(sent.status, 'sent');
  assert.equal(sent.sentAt, later(1).toISOString());
  assert.equal(sent.signers.client.expiresAt, new Date(later(1).getTime() + 14 * 86400e3).toISOString());
  assert.deepEqual(sent.audit.map((e) => e.event), ['created', 'signed', 'sent']);
  assert.equal(sent.audit[1].party, 'keepsite');
  assert.equal(sent.audit[1].ip, '203.0.113.5');
});

test('the client views then signs, completing the agreement; sealing records the hash', () => {
  let a = markSent({ ...markSigned(base(), 'keepsite', NOW, evidence), status: 'draft' }, NOW);
  a = { ...a, status: 'sent' };
  const viewed = markViewed(a, 'client', later(2), { ip: '198.51.100.7', userAgent: 'UA2' });
  assert.equal(viewed.signers.client.status, 'viewed');
  assert.equal(viewed.signers.client.viewedAt, later(2).toISOString());
  assert.equal(markViewed(viewed, 'client', later(3), {}).audit.length, viewed.audit.length);
  const done = markSigned(viewed, 'client', later(4), { ...evidence, signatureKey: 'client.png' });
  assert.equal(done.status, 'completed');
  assert.equal(done.completedAt, later(4).toISOString());
  assert.equal(done.signers.client.consentAt, later(4).toISOString());
  const sealed = markSealed(done, later(5), { hash: 'abc', documentKey: 'agreement-x.pdf' });
  assert.equal(sealed.hash, 'abc');
  assert.equal(sealed.documentKey, 'agreement-x.pdf');
  assert.equal(sealed.audit.at(-1).event, 'sealed');
  assert.throws(() => markSealed(viewed, NOW, { hash: 'x', documentKey: 'y' }), InvalidTransition);
});

test('the client may not sign a draft, and nobody signs twice', () => {
  assert.throws(() => markSigned(base(), 'client', NOW, evidence), InvalidTransition);
  const a = markSent({ ...markSigned(base(), 'keepsite', NOW, evidence), status: 'draft' }, NOW);
  assert.throws(() => markSigned({ ...a, status: 'sent' }, 'keepsite', NOW, evidence), /already signed/);
});

test('decline, expire and void', () => {
  const sent = { ...markSent({ ...markSigned(base(), 'keepsite', NOW, evidence), status: 'draft' }, NOW), status: 'sent' };
  const declined = markDeclined(sent, 'client', later(1), { ip: '1.2.3.4', reason: 'Changed our minds' });
  assert.equal(declined.status, 'declined');
  assert.equal(declined.signers.client.declineReason, 'Changed our minds');
  assert.throws(() => markSigned(declined, 'client', later(2), evidence), InvalidTransition);
  assert.equal(isExpired(sent, later(24 * 13)), false);
  assert.equal(isExpired(sent, later(24 * 15)), true);
  const expired = markExpired(sent, later(24 * 15));
  assert.equal(expired.status, 'expired');
  assert.equal(expired.signers.client.status, 'expired');
  assert.equal(expired.signers.keepsite.status, 'signed');
  assert.throws(() => markExpired(base(), NOW), InvalidTransition);
  const voided = markVoided(sent, later(1), 'sent to the wrong address');
  assert.equal(voided.status, 'voided');
  assert.equal(voided.audit.at(-1).note, 'sent to the wrong address');
  const completed = markSigned({ ...markViewed(sent, 'client', NOW, {}) }, 'client', NOW, evidence);
  assert.throws(() => markVoided(completed, NOW, 'x'), InvalidTransition);
});
