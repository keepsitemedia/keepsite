import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultFields, createAgreement, sendAgreement, findByToken, viewAgreement, signAgreement, declineAgreement, voidAgreement, expireAgreements, renderCurrent, latestSent, sealAgreement, signatureViews, TemplateGone, DOWNLOADABLE } from './agreements.mjs';
import { sha256 } from './pdf.mjs';
import { PNG, DATA_URL } from './fixtures.mjs';
import { findAgreementTemplate } from './agreement-templates.mjs';
import { createStore } from './store.mjs';
import { memoryBackend } from './backends.mjs';
import { newId } from './ids.mjs';
import { AsyncLocalStorage } from 'node:async_hooks';

const NOW = new Date('2026-09-08T16:00:00Z');
const later = (h) => new Date(NOW.getTime() + h * 3600e3);
const client = { slug: 'lova', name: 'Sierra Lee', business: 'Lova Content Creation', email: 's@example.com', phone: '(801) 555-0100', address: '1 Main St', tier: 'Search' };
const make = async () => {
  const s = createStore({ office: memoryBackend(), questionnaires: memoryBackend() });
  await s.clients.put('lova', client);
  return s;
};
const mailer = () => { const sent = []; return { sent, fetchFn: async (_url, i) => { sent.push(JSON.parse(i.body)); return new Response('{"id":"re"}'); } }; };
test.before(() => { process.env.RESEND_API_KEY = 'k'; process.env.KEEPSITE_NOTIFY_FROM = 'o@x'; process.env.KEEPSITE_NOTIFY_TO = 'me@keepsitemedia.com'; delete process.env.URL; });
test.after(() => { delete process.env.RESEND_API_KEY; delete process.env.KEEPSITE_NOTIFY_FROM; delete process.env.KEEPSITE_NOTIFY_TO; });

async function sentAgreement(s) {
  const a = await createAgreement({ client, templateId: 'search', fields: defaultFields(client, findAgreementTemplate('search'))}, s, NOW);
  return sendAgreement({ slug: 'lova', id: a.id, signatureDataUrl: DATA_URL, ip: '1.1.1.1', userAgent: 'UA' }, s, later(1));
}

test('defaultFields prefill Schedule 1 from the client and the tier', () => {
  const f = defaultFields(client, findAgreementTemplate('search'));
  assert.equal(f.legalName, 'Lova Content Creation');
  assert.equal(f.signerName, 'Sierra Lee');
  assert.equal(f.email, 's@example.com');
  assert.equal(f.buildFee, 175000);
  assert.equal(f.monthlyFee, 15000);
  assert.equal(f.deposit, 87500);
  assert.equal(f.balance, 87500);
  assert.equal(f.pages, 8);
  assert.equal(f.discountApplied, false);
  const other = defaultFields({ ...client, tier: '' }, findAgreementTemplate('presence'));
  assert.equal(other.buildFee, 110000);
  assert.equal(other.pages, 5);
});

test('createAgreement stores a draft with both signers named', async () => {
  const s = await make();
  const a = await createAgreement({ client, templateId: 'search', fields: defaultFields(client, findAgreementTemplate('search'))}, s, NOW);
  assert.equal(a.status, 'draft');
  assert.equal(a.template, 'search');
  assert.equal(a.templateName, 'Search Package');
  assert.equal(a.signers.client.name, 'Sierra Lee');
  assert.equal(a.signers.client.email, 's@example.com');
  assert.equal(a.signers.keepsite.name, 'Sierra Nichols');
  assert.equal((await s.agreements.get('lova', a.id)).id, a.id);
  await assert.rejects(() => createAgreement({ client, templateId: 'nope', fields: {}}, s, NOW), /unknown template/);
});

test('sendAgreement stores the admin signature, signs and sends', async () => {
  const s = await make();
  const a = await sentAgreement(s);
  assert.equal(a.status, 'sent');
  assert.equal(a.signers.keepsite.status, 'signed');
  assert.equal(a.signers.keepsite.signatureKey, `agreement-${a.id}-keepsite.png`);
  assert.deepEqual([...(await s.documents.get('lova', a.signers.keepsite.signatureKey))], [...PNG]);
  assert.equal(a.signers.client.expiresAt, new Date(later(1).getTime() + 14 * 86400e3).toISOString());
  assert.equal(latestSent(await s.agreements.list('lova')).id, a.id);
  await assert.rejects(() => sendAgreement({ slug: 'lova', id: a.id, signatureDataUrl: 'data:image/png;base64,AAAA'}, s, NOW), /signature/);
});

test('findByToken and viewAgreement mark the client as having viewed', async () => {
  const s = await make();
  const a = await sentAgreement(s);
  assert.equal(await findByToken(s, 'nope'), null);
  const found = await findByToken(s, a.signers.client.token);
  assert.equal(found.party, 'client');
  const v = await viewAgreement({ token: a.signers.client.token, ip: '2.2.2.2', userAgent: 'UA2' }, s, later(2));
  assert.equal(v.state, 'sign');
  assert.equal(v.agreement.signers.client.status, 'viewed');
  assert.equal((await s.agreements.get('lova', a.id)).signers.client.viewedAt, later(2).toISOString());
  assert.equal((await viewAgreement({ token: 'nope' }, s, NOW)).state, 'invalid');
});

test('signAgreement requires both consents and a PNG, then completes and seals with two emails', async () => {
  const s = await make();
  const a = await sentAgreement(s);
  const { sent, fetchFn } = mailer();
  const t = a.signers.client.token;
  assert.match((await signAgreement({ token: t, signatureDataUrl: DATA_URL, consentTerms: false, consentEsign: true }, s, fetchFn, later(3))).error, /agree to the terms/);
  assert.match((await signAgreement({ token: t, signatureDataUrl: 'nope', consentTerms: true, consentEsign: true }, s, fetchFn, later(3))).error, /signature/);
  const r = await signAgreement({ token: t, signatureDataUrl: DATA_URL, consentTerms: true, consentEsign: true, ip: '3.3.3.3', userAgent: 'UA3' }, s, fetchFn, later(3));
  assert.equal(r.ok, true);
  assert.equal(r.agreement.status, 'completed');
  assert.match(r.agreement.hash, /^[0-9a-f]{64}$/);
  assert.equal(r.agreement.documentKey, `agreement-${a.id}.pdf`);
  const pdf = await s.documents.get('lova', r.agreement.documentKey);
  assert.equal(Buffer.from(pdf.subarray(0, 5)).toString(), '%PDF-');
  const meta = await s.documents.meta('lova', r.agreement.documentKey);
  assert.equal(meta.source, 'seal');
  assert.equal(meta.agreementId, a.id);
  assert.equal(sent.length, 2);
  assert.deepEqual(sent.map((m) => m.to), [['s@example.com'], ['me@keepsitemedia.com']]);
  assert.match(sent[0].subject, /Signed: your Keepsite agreement/);
  assert.equal(sent[0].attachments[0].filename, `agreement-${a.id}.pdf`);
  assert.match(sent[0].text, new RegExp(r.agreement.hash));
  assert.equal((await s.emails.list('lova')).length, 2);
  // Signing twice is refused.
  assert.match((await signAgreement({ token: t, signatureDataUrl: DATA_URL, consentTerms: true, consentEsign: true }, s, fetchFn, later(4))).error, /already/);
});

test('declineAgreement records the reason and tells the admin', async () => {
  const s = await make();
  const a = await sentAgreement(s);
  const { sent, fetchFn } = mailer();
  const r = await declineAgreement({ token: a.signers.client.token, reason: 'Not now', ip: '4.4.4.4' }, s, fetchFn, later(2));
  assert.equal(r.agreement.status, 'declined');
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0].to, ['me@keepsitemedia.com']);
  assert.match(sent[0].text, /Not now/);
  assert.equal((await viewAgreement({ token: a.signers.client.token }, s, later(3))).state, 'declined');
});

test('expiry is applied on view and by the sweep; void works on anything unsigned', async () => {
  const s = await make();
  const a = await sentAgreement(s);
  const v = await viewAgreement({ token: a.signers.client.token }, s, later(24 * 15));
  assert.equal(v.state, 'expired');
  const b = await sentAgreement(s);
  assert.equal(await expireAgreements(s, later(24 * 15)), 1);
  assert.equal((await s.agreements.get('lova', b.id)).status, 'expired');
  const c = await sentAgreement(s);
  const voided = await voidAgreement({ slug: 'lova', id: c.id, note: 'typo' }, s, later(1));
  assert.equal(voided.status, 'voided');
  assert.equal((await viewAgreement({ token: c.signers.client.token }, s, later(2))).state, 'voided');
});

test('renderCurrent returns the sealed PDF when there is one, else a fresh draft', async () => {
  const s = await make();
  const a = await sentAgreement(s);
  const draft = await renderCurrent(a, s);
  assert.equal(Buffer.from(draft.subarray(0, 5)).toString(), '%PDF-');
  const { fetchFn } = mailer();
  const r = await signAgreement({ token: a.signers.client.token, signatureDataUrl: DATA_URL, consentTerms: true, consentEsign: true }, s, fetchFn, later(3));
  const sealed = await renderCurrent(r.agreement, s);
  assert.deepEqual([...sealed], [...(await s.documents.get('lova', r.agreement.documentKey))]);
});

test('renderCurrent throws a TemplateGone when the template has been retired', async () => {
  const s = await make();
  const a = await sentAgreement(s);
  await assert.rejects(() => renderCurrent({ ...a, template: 'retired', documentKey: null }, s), TemplateGone);
});

test('signatureViews has a data URL for a signer who has signed, not one who has not', async () => {
  const s = await make();
  const a = await sentAgreement(s);
  const views = await signatureViews(a, s);
  assert.match(views.keepsite.src, /^data:image\/png;base64,/);
  assert.equal(views.keepsite.signedAt, a.signers.keepsite.signedAt);
  assert.equal(views.client, undefined);
});

test('only the client signs or declines through the token path', async () => {
  const s = await make();
  const draft = await createAgreement({ client, templateId: 'search', fields: defaultFields(client, findAgreementTemplate('search'))}, s, NOW);
  const { fetchFn } = mailer();
  const draftAttempt = await signAgreement({ token: draft.signers.keepsite.token, signatureDataUrl: DATA_URL, consentTerms: true, consentEsign: true }, s, fetchFn, NOW);
  assert.match(draftAttempt.error, /not valid/);
  const sent = await sendAgreement({ slug: 'lova', id: draft.id, signatureDataUrl: DATA_URL, ip: '1.1.1.1', userAgent: 'UA' }, s, later(1));
  const sentAttempt = await signAgreement({ token: sent.signers.keepsite.token, signatureDataUrl: DATA_URL, consentTerms: true, consentEsign: true }, s, fetchFn, later(2));
  assert.match(sentAttempt.error, /not valid/);
  const declineAttempt = await declineAgreement({ token: sent.signers.keepsite.token, reason: 'no' }, s, fetchFn, later(2));
  assert.match(declineAttempt.error, /not valid/);
});

test('viewAgreement refuses a draft, storing nothing', async () => {
  const s = await make();
  const draft = await createAgreement({ client, templateId: 'search', fields: defaultFields(client, findAgreementTemplate('search'))}, s, NOW);
  const v = await viewAgreement({ token: draft.signers.client.token }, s, NOW);
  assert.equal(v.state, 'invalid');
  assert.equal((await s.agreements.get('lova', draft.id)).signers.client.viewedAt, null);
});

test('signing a voided agreement leaves the documents count unchanged', async () => {
  const s = await make();
  const a = await sentAgreement(s);
  const voided = await voidAgreement({ slug: 'lova', id: a.id, note: 'oops' }, s, later(2));
  const before = (await s.counts()).documents;
  const { fetchFn } = mailer();
  const r = await signAgreement({ token: voided.signers.client.token, signatureDataUrl: DATA_URL, consentTerms: true, consentEsign: true }, s, fetchFn, later(3));
  assert.equal(r.ok, false);
  assert.match(r.error, /voided/);
  assert.equal((await s.counts()).documents, before);
});

test('declineAgreement refuses an expired agreement', async () => {
  const s = await make();
  const a = await sentAgreement(s);
  const { fetchFn } = mailer();
  const r = await declineAgreement({ token: a.signers.client.token, reason: 'late' }, s, fetchFn, later(24 * 15));
  assert.equal(r.ok, false);
  assert.match(r.error, /expired/);
  assert.equal((await s.agreements.get('lova', a.id)).status, 'expired');
});

test('sealAgreement is idempotent: sealing twice sends two mails total, not four', async () => {
  const s = await make();
  const a = await sentAgreement(s);
  const { sent, fetchFn } = mailer();
  const r = await signAgreement({ token: a.signers.client.token, signatureDataUrl: DATA_URL, consentTerms: true, consentEsign: true }, s, fetchFn, later(3));
  assert.equal(sent.length, 2);
  const again = await sealAgreement(r.agreement, s, fetchFn, later(4));
  assert.equal(again.documentKey, r.agreement.documentKey);
  assert.equal(again.hash, r.agreement.hash);
  assert.equal(sent.length, 2);
});

test('sending closes the "agreement: sent" task and completion closes "agreement: completed"', async () => {
  const s = await make();
  const t1 = newId(NOW); const t2 = newId(new Date(NOW.getTime() + 1000));
  await s.tasks.put('lova', t1, { id: t1, slug: 'lova', title: 'Send agreement', due: '2026-09-08', done: false, doneAt: null, agreement: 'sent', payment: null, questionnaire: null });
  await s.tasks.put('lova', t2, { id: t2, slug: 'lova', title: 'Signed', due: '2026-09-08', done: false, doneAt: null, agreement: 'completed', payment: null, questionnaire: null });
  const a = await sentAgreement(s);
  assert.equal((await s.tasks.get('lova', t1)).done, true);
  assert.equal((await s.tasks.get('lova', t2)).done, false);
  const { fetchFn } = mailer();
  await signAgreement({ token: a.signers.client.token, signatureDataUrl: DATA_URL, consentTerms: true, consentEsign: true }, s, fetchFn, later(1));
  assert.equal((await s.tasks.get('lova', t2)).done, true);
});

const sealedOnce = async (s, a, sent) => {
  const stored = await s.agreements.get('lova', a.id);
  assert.equal(stored.audit.filter((e) => e.event === 'sealed').length, 1);
  assert.deepEqual((await s.documents.list('lova')).filter((d) => d.name.endsWith('.pdf')).map((d) => d.name), [`agreement-${a.id}.pdf`]);
  assert.equal(sha256(await s.documents.get('lova', stored.documentKey)), stored.hash);
  assert.equal(sent.length, 2);
};

test('two overlapping signs seal once, with one PDF whose hash is the stored one', async () => {
  const s = await make();
  const a = await sentAgreement(s);
  const { sent, fetchFn } = mailer();
  const sign = (when, ip) => signAgreement({ token: a.signers.client.token, signatureDataUrl: DATA_URL, consentTerms: true, consentEsign: true, ip }, s, fetchFn, when);
  const results = await Promise.all([sign(later(3), '3.3.3.3'), sign(later(4), '4.4.4.4')]);
  // Whichever submit loses the lock sees the record the winner wrote, or is
  // turned away as already signed; neither outcome writes a second time.
  for (const r of results) assert.ok(r.ok || r.error === 'already signed', JSON.stringify(r));
  await sealedOnce(s, a, sent);
});

test('a submit held at the lock cannot write over the seal that beat it', async () => {
  const s = await make();
  const a = await sentAgreement(s);
  const { sent, fetchFn } = mailer();
  const als = new AsyncLocalStorage();
  let release;
  const gate = new Promise((r) => { release = r; });
  // Holds the late submit between its guard re-read and its write — the
  // window a re-read alone cannot close — while the other signs and seals.
  const wrapped = {
    ...s,
    locks: { async acquire(name) { if (als.getStore() === 'late') await gate; return s.locks.acquire(name); } },
  };
  const sign = (tag, when) => als.run(tag, () => signAgreement(
    { token: a.signers.client.token, signatureDataUrl: DATA_URL, consentTerms: true, consentEsign: true, ip: tag },
    wrapped, fetchFn, when,
  ));
  const late = sign('late', later(3));
  const early = await sign('early', later(4));
  assert.equal(early.ok, true);
  release();
  assert.equal((await late).ok, true);
  const final = await s.agreements.get('lova', a.id);
  assert.equal(final.signers.client.signedAt, later(4).toISOString());
  // The loser saw a record that was already signed, so there is nothing for
  // the office to act on and nothing is logged.
  assert.deepEqual((await s.emails.list('lova')).filter((e) => e.kind === 'sign-lock'), []);
  await sealedOnce(s, a, sent);
});

test('a stranded seal lock leaves the record sent for the office to void', async () => {
  const s = await make();
  const a = await sentAgreement(s);
  const { sent, fetchFn } = mailer();
  // What a crash between the acquire and the write leaves behind.
  assert.equal(await s.locks.acquire(`seal-${a.id}`), true);
  const r = await signAgreement({ token: a.signers.client.token, signatureDataUrl: DATA_URL, consentTerms: true, consentEsign: true }, s, fetchFn, later(3));
  assert.equal(r.ok, true);
  const stored = await s.agreements.get('lova', a.id);
  assert.equal(stored.status, 'sent');
  assert.equal(stored.signers.client.status, 'pending');
  assert.equal(sent.length, 0);
  // The client was thanked for a signature nobody has; the failed row is how
  // the office finds out.
  const logged = (await s.emails.list('lova')).filter((e) => e.kind === 'sign-lock');
  assert.equal(logged.length, 1);
  assert.equal(logged[0].status, 'failed');
  assert.match(logged[0].error, /void and recreate/);
  assert.equal((await voidAgreement({ slug: 'lova', id: a.id, note: 'stuck' }, s, later(4))).status, 'voided');
});

test('the sweep leaves an agreement completed between the listing and the write alone', async () => {
  const s = await make();
  const a = await sentAgreement(s);
  const { fetchFn } = mailer();
  await signAgreement({ token: a.signers.client.token, signatureDataUrl: DATA_URL, consentTerms: true, consentEsign: true }, s, fetchFn, later(3));
  // The snapshot the sweep loops over predates the signature.
  const stale = { ...s, agreements: { ...s.agreements, async listAll() { return [a]; } } };
  assert.equal(await expireAgreements(stale, later(24 * 15)), 0);
  assert.equal((await s.agreements.get('lova', a.id)).status, 'completed');
});

test('renderCurrent throws a TemplateGone when the stored version is not the current one', async () => {
  const s = await make();
  const a = await sentAgreement(s);
  await assert.rejects(() => renderCurrent({ ...a, templateVersion: '2020-01-01', documentKey: null }, s), TemplateGone);
});

test('the PDF route serves the statuses the sign page offers a download for, and no others', () => {
  assert.deepEqual(DOWNLOADABLE, ['sent', 'partiallySigned', 'completed']);
  for (const status of ['draft', 'declined', 'expired', 'voided']) assert.equal(DOWNLOADABLE.includes(status), false);
});

test('a template that moved before the submit refuses the sign and stores nothing', async () => {
  const s = await make();
  const a = await sentAgreement(s);
  await s.agreements.put('lova', a.id, { ...a, templateVersion: '2020-01-01' });
  const before = (await s.counts()).documents;
  const { sent, fetchFn } = mailer();
  const r = await signAgreement({ token: a.signers.client.token, signatureDataUrl: DATA_URL, consentTerms: true, consentEsign: true }, s, fetchFn, later(3));
  assert.equal(r.ok, false);
  assert.match(r.error, /template has changed/);
  assert.equal((await s.agreements.get('lova', a.id)).status, 'sent');
  assert.equal((await s.counts()).documents, before);
  assert.equal(sent.length, 0);
});

test('a template that moves before the seal still thanks the client and parks the record', async () => {
  const s = await make();
  const a = await sentAgreement(s);
  const { sent, fetchFn } = mailer();
  // The version moves with the write of the signed record, which is the
  // narrowest window signAgreement's own check cannot cover.
  const moving = { ...s, agreements: { ...s.agreements, put: (slug, id, doc) => s.agreements.put(slug, id, { ...doc, templateVersion: '2020-01-01' }) } };
  const r = await signAgreement({ token: a.signers.client.token, signatureDataUrl: DATA_URL, consentTerms: true, consentEsign: true }, moving, fetchFn, later(3));
  assert.equal(r.ok, true);
  assert.equal(r.agreement.status, 'completed');
  assert.equal(r.agreement.documentKey, null);
  assert.equal(sent.length, 0);
  // The office can still get out of it: void, or reseal once the template is back.
  assert.equal((await voidAgreement({ slug: 'lova', id: a.id, note: 'template moved' }, s, later(4))).status, 'voided');
});

test('voiding is refused once the PDF exists', async () => {
  const s = await make();
  const a = await sentAgreement(s);
  const { fetchFn } = mailer();
  const r = await signAgreement({ token: a.signers.client.token, signatureDataUrl: DATA_URL, consentTerms: true, consentEsign: true }, s, fetchFn, later(3));
  assert.equal(r.agreement.documentKey, `agreement-${a.id}.pdf`);
  await assert.rejects(() => voidAgreement({ slug: 'lova', id: a.id, note: 'no' }, s, later(4)), /sealed/);
});

test('sendAgreement indexes both tokens and findByToken uses the index', async () => {
  const s = await make();
  const a = await sentAgreement(s);
  assert.deepEqual(await s.tokens.get(a.signers.client.token), { slug: 'lova', id: a.id, party: 'client' });
  assert.deepEqual(await s.tokens.get(a.signers.keepsite.token), { slug: 'lova', id: a.id, party: 'keepsite' });
  let scans = 0;
  const listAll = s.agreements.listAll.bind(s.agreements);
  s.agreements.listAll = async () => { scans += 1; return listAll(); };
  const found = await findByToken(s, a.signers.client.token);
  assert.equal(found.party, 'client');
  assert.equal(scans, 0);
});

// The index is the only lookup, so a token it does not hold resolves to
// nothing rather than costing a read of every agreement in the store.
test('an unindexed or forged token resolves to nothing without a scan', async () => {
  const s = await make();
  const a = await sentAgreement(s);
  let scans = 0;
  const listAll = s.agreements.listAll.bind(s.agreements);
  s.agreements.listAll = async () => { scans += 1; return listAll(); };
  assert.equal(await findByToken(s, 'f'.repeat(43)), null);
  await s.tokens.put(a.signers.client.token, { slug: 'lova', id: 'nope', party: 'client' });
  assert.equal(await findByToken(s, a.signers.client.token), null);
  assert.equal(scans, 0);
});

test('an index entry pointing at the wrong agreement resolves to nothing', async () => {
  const s = await make();
  const a = await sentAgreement(s);
  const b = await sentAgreement(s);
  await s.tokens.put(a.signers.client.token, { slug: 'lova', id: b.id, party: 'client' });
  assert.equal(await findByToken(s, a.signers.client.token), null);
  assert.equal((await findByToken(s, b.signers.client.token)).agreement.id, b.id);
});

test('two simultaneous signs with the same clock seal once', async () => {
  const s = await make();
  const a = await sentAgreement(s);
  const sent = [];
  const fetchFn = async () => { sent.push(1); return new Response('{}', { status: 200 }); };
  const args = { token: a.signers.client.token, signatureDataUrl: DATA_URL, consentTerms: true, consentEsign: true, ip: '1.1.1.1', userAgent: 'ua' };
  const [r1, r2] = await Promise.all([signAgreement(args, s, fetchFn, NOW), signAgreement(args, s, fetchFn, NOW)]);
  assert.ok(r1.ok && r2.ok);
  const final = await s.agreements.get('lova', a.id);
  assert.equal(final.audit.filter((e) => e.event === 'sealed').length, 1);
  assert.equal(sent.length, 2);
  assert.equal((await s.documents.list('lova')).filter((d) => d.source === 'seal').length, 1);
});

test('a submit that loses the lock to one still writing stores nothing', async () => {
  const s = await make();
  const a = await sentAgreement(s);
  const { sent, fetchFn } = mailer();
  const als = new AsyncLocalStorage();
  let release;
  const gate = new Promise((r) => { release = r; });
  // Tags each call's async context so the wrapper can hold the winner inside
  // its signature write — the window the other submit used to write through —
  // regardless of how the two actually interleave.
  const wrapped = {
    ...s,
    documents: {
      ...s.documents,
      async put(...args) {
        if (als.getStore() === 'holder') await gate;
        return s.documents.put(...args);
      },
    },
  };
  const sign = (tag, when) => als.run(tag, () => signAgreement(
    { token: a.signers.client.token, signatureDataUrl: DATA_URL, consentTerms: true, consentEsign: true },
    wrapped, fetchFn, when,
  ));
  const holder = sign('holder', later(3));
  const loser = await sign('loser', later(4));
  // Nothing of the loser's is stored: no record, no signature image, and the
  // office is told the lock is held over an unsigned record.
  assert.equal(loser.ok, true);
  assert.equal(loser.agreement.documentKey, null);
  assert.equal((await s.emails.list('lova')).filter((e) => e.kind === 'sign-lock').length, 1);
  release();
  const won = await holder;
  assert.equal(won.ok, true);
  const final = await s.agreements.get('lova', a.id);
  assert.equal(final.documentKey, `agreement-${a.id}.pdf`);
  assert.equal(final.hash, won.agreement.hash);
  assert.equal(final.audit.filter((e) => e.event === 'sealed').length, 1);
  assert.equal(sent.length, 2);
  // The sealed PDF embeds the winner's signature image; the loser must not be
  // able to write its own PNG over it.
  const sig = await s.documents.meta('lova', `agreement-${a.id}-client.png`);
  assert.equal(sig.uploadedAt, final.signers.client.signedAt);
});

test('a second send of a sent agreement throws and leaves the stored signature alone', async () => {
  const s = await make();
  const a = await sentAgreement(s);
  const key = a.signers.keepsite.signatureKey;
  const before = await s.documents.meta('lova', key);
  await assert.rejects(() => sendAgreement({ slug: 'lova', id: a.id, signatureDataUrl: DATA_URL, ip: '9.9.9.9' }, s, later(2)), /already signed/);
  // The same bytes, but a re-store would carry the second send's clock.
  assert.deepEqual([...(await s.documents.get('lova', key))], [...PNG]);
  assert.deepEqual(await s.documents.meta('lova', key), before);
  assert.equal(before.uploadedAt, later(1).toISOString());
  assert.equal((await s.agreements.get('lova', a.id)).signers.keepsite.signedAt, a.signers.keepsite.signedAt);
});

test('sendAgreement indexes the tokens before the record goes out as sent', async () => {
  const s = await make();
  const draft = await createAgreement({ client, templateId: 'search', fields: defaultFields(client, findAgreementTemplate('search')) }, s, NOW);
  // The emailed link resolves through the index; a record that reads `sent`
  // while its tokens are still unindexed is a link that resolves to nothing.
  const failing = { ...s, agreements: { ...s.agreements, async put() { throw new Error('put failed'); } } };
  await assert.rejects(() => sendAgreement({ slug: 'lova', id: draft.id, signatureDataUrl: DATA_URL }, failing, later(1)), /put failed/);
  assert.equal((await s.agreements.get('lova', draft.id)).status, 'draft');
  assert.deepEqual(await s.tokens.get(draft.signers.client.token), { slug: 'lova', id: draft.id, party: 'client' });
});

test('a void that lands before the lock is not overwritten by the sign', async () => {
  const s = await make();
  const a = await sentAgreement(s);
  const { sent, fetchFn } = mailer();
  // The office voids between the submit's read and its lock: the window a
  // record built from the first read would write straight over.
  const racing = {
    ...s,
    locks: {
      async acquire(name) {
        await voidAgreement({ slug: 'lova', id: a.id, note: 'wrong address' }, s, later(2));
        return s.locks.acquire(name);
      },
    },
  };
  const r = await signAgreement({ token: a.signers.client.token, signatureDataUrl: DATA_URL, consentTerms: true, consentEsign: true }, racing, fetchFn, later(3));
  assert.equal(r.ok, false);
  assert.match(r.error, /voided/);
  const stored = await s.agreements.get('lova', a.id);
  assert.equal(stored.status, 'voided');
  assert.equal(stored.signers.client.status, 'pending');
  assert.deepEqual(stored.audit.map((e) => e.event), ['created', 'signed', 'sent', 'voided']);
  assert.equal(await s.documents.meta('lova', `agreement-${a.id}-client.png`), null);
  assert.equal(sent.length, 0);
});

test('a seal that fails after the signature landed still thanks the client and logs the failure', async () => {
  const s = await make();
  const a = await sentAgreement(s);
  const { sent, fetchFn } = mailer();
  const broken = {
    ...s,
    documents: {
      ...s.documents,
      async put(slug, name, ...rest) {
        if (name.endsWith('.pdf')) throw new Error('blob store down');
        return s.documents.put(slug, name, ...rest);
      },
    },
  };
  const r = await signAgreement({ token: a.signers.client.token, signatureDataUrl: DATA_URL, consentTerms: true, consentEsign: true }, broken, fetchFn, later(3));
  assert.equal(r.ok, true);
  assert.equal(r.agreement.status, 'completed');
  assert.equal(r.agreement.documentKey, null);
  assert.equal(sent.length, 0);
  const logged = (await s.emails.list('lova')).filter((e) => e.kind === 'seal');
  assert.equal(logged.length, 1);
  assert.equal(logged[0].status, 'failed');
  assert.match(logged[0].error, /blob store down/);
  // The office gets out of it with "Seal again".
  const sealed = await sealAgreement(r.agreement, s, fetchFn, later(4));
  assert.equal(sealed.documentKey, `agreement-${a.id}.pdf`);
});
