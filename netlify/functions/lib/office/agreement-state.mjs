// Every change to an agreement's status goes through here and leaves an
// audit entry, because the audit trail is half of what makes the signature
// worth anything. Transitions return new objects; callers persist them.
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { newId } from './ids.mjs';

export class InvalidTransition extends Error {}

const EXPIRY_DAYS = 14;

export const newToken = () => randomBytes(32).toString('base64url');

export function tokenMatches(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || !a || !b) return false;
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

const signer = ({ name, email }) => ({
  name, email, token: newToken(), expiresAt: null, status: 'pending',
  viewedAt: null, signedAt: null, consentAt: null, ip: null, userAgent: null, signatureKey: null,
  declinedAt: null, declineReason: null,
});

const entry = (now, event, party, extra = {}) => ({ at: now.toISOString(), event, party, ip: extra.ip ?? null, note: extra.note ?? null });

const fail = (message) => { throw new InvalidTransition(message); };
const assertStatus = (a, allowed, what) => {
  if (!allowed.includes(a.status)) fail(`cannot ${what} an agreement that is ${a.status}`);
};
const assertParty = (party) => {
  if (party !== 'keepsite' && party !== 'client') fail(`unknown party ${party}`);
};
const withSigner = (a, party, patch) => ({ ...a, signers: { ...a.signers, [party]: { ...a.signers[party], ...patch } } });
const touch = (a, now, e) => ({ ...a, audit: [...a.audit, e], updatedAt: now.toISOString() });

export function newAgreement({ slug, template, templateVersion, fields, keepsite, client }, now = new Date()) {
  const at = now.toISOString();
  return {
    id: newId(now), slug, template, templateVersion, status: 'draft', fields,
    signers: { keepsite: signer(keepsite), client: signer(client) },
    audit: [entry(now, 'created', 'admin')],
    hash: null, documentKey: null, sentAt: null, completedAt: null, createdAt: at, updatedAt: at,
  };
}

export function markSent(a, now = new Date()) {
  // The admin may sign the draft before sending; what must not have
  // happened yet is the client's signature, which only exists once sent.
  const preSigned = a.status === 'partiallySigned' && a.signers.client.status !== 'signed';
  if (a.status !== 'draft' && !preSigned) fail(`cannot send an agreement that is ${a.status}`);
  const expiresAt = new Date(now.getTime() + EXPIRY_DAYS * 86400e3).toISOString();
  let next = withSigner(withSigner(a, 'keepsite', { expiresAt }), 'client', { expiresAt });
  next = { ...next, status: 'sent', sentAt: now.toISOString() };
  return touch(next, now, entry(now, 'sent', 'admin'));
}

export function markViewed(a, party, now = new Date(), { ip, userAgent } = {}) {
  assertParty(party);
  assertStatus(a, ['sent', 'partiallySigned'], 'view');
  if (a.signers[party].status !== 'pending') return a;
  const next = withSigner(a, party, { status: 'viewed', viewedAt: now.toISOString(), ip: ip ?? null, userAgent: userAgent ?? null });
  return touch(next, now, entry(now, 'viewed', party, { ip }));
}

export function markSigned(a, party, now = new Date(), { ip, userAgent, signatureKey } = {}) {
  assertParty(party);
  // The admin signs the draft before it goes out; the client only ever
  // signs something that was sent to them.
  assertStatus(a, party === 'keepsite' ? ['draft', 'sent', 'partiallySigned'] : ['sent', 'partiallySigned'], 'sign');
  const s = a.signers[party];
  if (s.status === 'signed') fail(`${party} already signed`);
  if (s.status === 'declined' || s.status === 'expired') fail(`${party} is ${s.status}`);
  const at = now.toISOString();
  let next = withSigner(a, party, { status: 'signed', signedAt: at, consentAt: at, ip: ip ?? null, userAgent: userAgent ?? null, signatureKey: signatureKey ?? null });
  const both = next.signers.keepsite.status === 'signed' && next.signers.client.status === 'signed';
  next = { ...next, status: both ? 'completed' : 'partiallySigned', completedAt: both ? at : null };
  return touch(next, now, entry(now, 'signed', party, { ip }));
}

export function markDeclined(a, party, now = new Date(), { ip, reason } = {}) {
  assertParty(party);
  assertStatus(a, ['sent', 'partiallySigned'], 'decline');
  const at = now.toISOString();
  const next = { ...withSigner(a, party, { status: 'declined', declinedAt: at, declineReason: reason ?? null, ip: ip ?? null }), status: 'declined' };
  return touch(next, now, entry(now, 'declined', party, { ip, note: reason }));
}

export function isExpired(a, now = new Date()) {
  if (!['sent', 'partiallySigned'].includes(a.status)) return false;
  return Object.values(a.signers).some((s) => s.status !== 'signed' && s.expiresAt && new Date(s.expiresAt) < now);
}

export function markExpired(a, now = new Date()) {
  assertStatus(a, ['sent', 'partiallySigned'], 'expire');
  if (!isExpired(a, now)) fail('cannot expire an agreement that has not lapsed');
  let next = a;
  for (const party of ['keepsite', 'client']) {
    if (next.signers[party].status !== 'signed') next = withSigner(next, party, { status: 'expired' });
  }
  return touch({ ...next, status: 'expired' }, now, entry(now, 'expired', 'system'));
}

export function markVoided(a, now = new Date(), note = null) {
  // A completed agreement whose seal never landed is the one recoverable
  // failure state: no PDF, no hash, nothing either party can keep. Once the
  // PDF exists it is the evidence, and evidence does not change.
  if (a.status === 'completed' && a.documentKey) fail('cannot void a sealed agreement');
  return touch({ ...a, status: 'voided' }, now, entry(now, 'voided', 'admin', { note }));
}

export function markSealed(a, now = new Date(), { hash, documentKey }) {
  assertStatus(a, ['completed'], 'seal');
  return touch({ ...a, hash, documentKey }, now, entry(now, 'sealed', 'system', { note: hash }));
}

export function signerByToken(a, token) {
  for (const party of ['keepsite', 'client']) {
    if (tokenMatches(a.signers[party].token, token)) return party;
  }
  return null;
}
