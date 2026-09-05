// The agreement lifecycle in one place: the office creates and sends, the
// client signs or declines on a token, and completion seals a hashed PDF
// into the client's documents and mails it to both sides.
import site from '../../../../src/data/site.json' with { type: 'json' };
import { store as defaultStore } from './store.mjs';
import { findAgreementTemplate, fillBlocks } from './agreement-templates.mjs';
import { newAgreement, markSent, markViewed, markSigned, markDeclined, markExpired, markVoided, markSealed, isExpired, signerByToken, InvalidTransition } from './agreement-state.mjs';
import { renderAgreement, sha256, signaturePng } from './pdf.mjs';
import { tierPrices } from './payments.mjs';
import { buildContext } from './context.mjs';
import { loadTemplates, findTemplate, render } from './templates.mjs';
import { sendMail, logFailure } from './mail.mjs';

const TIER_FOR_TEMPLATE = { __proto__: null, presence: 'Presence', search: 'Search', 'search-plus': 'Search Plus' };
const money = (s) => Math.round(Number(String(s).replace(/[^0-9.]/g, '')) * 100);

export function defaultFields(client, template) {
  const tier = TIER_FOR_TEMPLATE[template.id];
  const prices = client.tier === tier ? tierPrices(client.tier) : null;
  const buildFee = prices?.build ?? money(template.defaults.buildFee);
  const monthlyFee = prices?.monthly ?? money(template.defaults.monthlyFee);
  return {
    legalName: client.business ?? '', entityType: '', address: client.address ?? '',
    signerName: client.name ?? '', signerTitle: '', email: client.email ?? '', phone: client.phone ?? '',
    buildFee, monthlyFee, deposit: Math.round(buildFee / 2), balance: buildFee - Math.round(buildFee / 2),
    pages: template.defaults.pages ?? null, discountApplied: false,
    discount: { name: '', type: '', amount: '', adjustedBuildFee: null, monthlyType: '', monthlyAmount: '', discountedMonthlyFee: null, months: null, conditions: '' },
  };
}

const keepsiteSigner = (template) => {
  const block = template.blocks.find((b) => b.type === 'signatures');
  const party = block?.parties.find((p) => p.party === 'keepsite') ?? {};
  return { name: party.name ?? site.brand, email: party.email ?? site.email };
};

export async function createAgreement({ client, templateId, fields, admin }, s = defaultStore(), now = new Date()) {
  const template = findAgreementTemplate(templateId);
  if (!template) throw new Error(`unknown template ${templateId}`);
  const a = {
    ...newAgreement({
      slug: client.slug, template: template.id, templateVersion: template.version, fields,
      keepsite: keepsiteSigner(template), client: { name: fields.signerName || client.name, email: fields.email || client.email },
    }, now),
    templateName: template.name,
  };
  await s.agreements.put(client.slug, a.id, a);
  return a;
}

const signatureName = (a, party) => `agreement-${a.id}-${party}.png`;

export async function markAgreementTasks(slug, event, s, now = new Date()) {
  for (const t of await s.tasks.list(slug)) {
    if (t.agreement === event && !t.done) await s.tasks.put(slug, t.id, { ...t, done: true, doneAt: now.toISOString() });
  }
}

async function storeSignature(a, party, dataUrl, s, now) {
  const png = signaturePng(dataUrl);
  if (!png) throw new Error('signature must be a small PNG image');
  const name = signatureName(a, party);
  await s.documents.put(a.slug, name, png, { type: 'image/png', source: 'sign', agreementId: a.id, party }, now);
  return name;
}

export async function sendAgreement({ slug, id, signatureDataUrl, admin, ip, userAgent }, s = defaultStore(), now = new Date()) {
  const a = await s.agreements.get(slug, id);
  if (!a) throw new Error('no such agreement');
  const key = await storeSignature(a, 'keepsite', signatureDataUrl, s, now);
  const signed = markSigned(a, 'keepsite', now, { ip, userAgent, signatureKey: key });
  // markSent accepts an admin-signed draft (partiallySigned with the client
  // still pending); nothing outside the state module touches status.
  const sent = markSent(signed, now);
  await s.agreements.put(slug, id, sent);
  await markAgreementTasks(slug, 'sent', s, now);
  return sent;
}

export async function findByToken(s, token) {
  if (typeof token !== 'string' || token.length < 20) return null;
  for (const a of await s.agreements.listAll()) {
    const party = signerByToken(a, token);
    if (party) return { agreement: a, party };
  }
  return null;
}

const stateOf = (a, party) => {
  if (a.status === 'draft') return 'invalid';
  if (a.status === 'declined') return 'declined';
  if (a.status === 'expired') return 'expired';
  if (a.status === 'voided') return 'voided';
  if (a.signers[party].status === 'signed') return 'signed';
  return 'sign';
};

export async function viewAgreement({ token, ip, userAgent }, s = defaultStore(), now = new Date()) {
  const found = await findByToken(s, token);
  if (!found) return { agreement: null, party: null, state: 'invalid' };
  let { agreement: a } = found;
  const { party } = found;
  // stateOf already keeps a draft off the markViewed path; the catch below
  // is the same backstop signAgreement and declineAgreement use, in case a
  // status this function does not yet special-case turns out to be illegal.
  try {
    if (isExpired(a, now)) {
      a = markExpired(a, now);
      await s.agreements.put(a.slug, a.id, a);
    }
    const state = stateOf(a, party);
    if (state === 'sign' && a.signers[party].status === 'pending') {
      a = markViewed(a, party, now, { ip, userAgent });
      await s.agreements.put(a.slug, a.id, a);
    }
    return { agreement: a, party, state };
  } catch (e) {
    if (e instanceof InvalidTransition) return { agreement: null, party: null, state: 'invalid' };
    throw e;
  }
}

const signaturesFor = async (a, s) => {
  const out = {};
  for (const party of ['keepsite', 'client']) {
    const sg = a.signers[party];
    if (sg.status === 'signed' && sg.signatureKey) {
      const png = await s.documents.get(a.slug, sg.signatureKey);
      if (png) out[party] = { png, name: sg.name, signedAt: sg.signedAt };
    }
  }
  return out;
};

// A template pulled after an agreement was created (never expected, but a
// docx re-generation could drop one); the document route maps this to a 410
// rather than a 500, and the office sign page checks for it separately since
// it reads fillBlocks directly instead of going through renderCurrent.
export class TemplateGone extends Error {}

// A render must match the version the stored record and the certificate name,
// or the client would be shown (and sealed into) text nobody agreed to: the
// docx regeneration that retires a template can also rewrite one in place.
export function templateFor(a) {
  const template = findAgreementTemplate(a.template);
  if (!template) throw new TemplateGone(`template ${a.template} no longer exists`);
  if (template.version !== a.templateVersion) throw new TemplateGone(`template ${a.template} has changed since this agreement was created`);
  return template;
}

// The same PNGs sealAgreement embeds in the PDF, as data URLs for the admin
// and (task 7) public signing pages to show inline; only for signers who
// have actually signed, so an unsigned party still shows the blank line.
export async function signatureViews(a, s = defaultStore()) {
  const raw = await signaturesFor(a, s);
  const out = {};
  for (const party of ['keepsite', 'client']) {
    if (raw[party]) out[party] = { src: `data:image/png;base64,${Buffer.from(raw[party].png).toString('base64')}`, signedAt: raw[party].signedAt };
  }
  return out;
}

export async function sealAgreement(stale, s = defaultStore(), fetchFn = fetch, now = new Date()) {
  // Idempotent: a second call would re-render (a different renderedAt hashes
  // differently), overwrite the stored PDF, and mail both parties again. The
  // caller's copy can predate another request's seal, so decide from a fresh
  // read rather than from what was passed in.
  const a = (await s.agreements.get(stale.slug, stale.id)) ?? stale;
  if (a.documentKey) return a;
  const template = templateFor(a);
  const blocks = fillBlocks(template, a.fields);
  const signatures = await signaturesFor(a, s);
  const inner = await renderAgreement({ blocks, signatures, renderedAt: now });
  const certificate = {
    agreementId: a.id, template: a.template, version: a.templateVersion, hash: sha256(inner),
    signers: ['keepsite', 'client'].map((p) => ({ party: p, ...a.signers[p] })),
    audit: a.audit,
  };
  const final = await renderAgreement({ blocks, signatures, certificate, renderedAt: now });
  const documentKey = `agreement-${a.id}.pdf`;
  await s.documents.put(a.slug, documentKey, final, { type: 'application/pdf', source: 'seal', agreementId: a.id }, now);
  const sealed = markSealed(a, now, { hash: sha256(final), documentKey });
  await s.agreements.put(a.slug, a.id, sealed);
  await markAgreementTasks(a.slug, 'completed', s, now);

  const client = await s.clients.get(a.slug);
  const template2 = findTemplate(await loadTemplates(s), 'agreement-completed');
  if (client && template2) {
    const ctx = buildContext({ client, admin: null, secret: process.env.KEEPSITE_TOKEN_SECRET ?? '', agreement: sealed, now });
    const { subject, text, html } = render(template2, ctx, {});
    const attachments = [{ filename: documentKey, content: Buffer.from(final).toString('base64') }];
    const base = { slug: a.slug, subject, text, html, attachments, template: 'agreement-completed', kind: 'agreement-completed' };
    await sendMail({ ...base, to: sealed.signers.client.email }, s, fetchFn, now);
    if (process.env.KEEPSITE_NOTIFY_TO) await sendMail({ ...base, to: process.env.KEEPSITE_NOTIFY_TO }, s, fetchFn, new Date(now.getTime() + 1000));
  } else {
    await logFailure({ slug: a.slug, to: a.signers.client.email, template: 'agreement-completed', kind: 'agreement-completed', error: 'template agreement-completed or client is missing' }, s, now);
  }
  return sealed;
}

export async function signAgreement({ token, signatureDataUrl, consentTerms, consentEsign, ip, userAgent }, s = defaultStore(), fetchFn = fetch, now = new Date()) {
  const found = await findByToken(s, token);
  if (!found) return { ok: false, error: 'this signing link is not valid' };
  let { agreement: a } = found;
  const { party } = found;
  // Only the client signs through their own token; the office signs via
  // sendAgreement, never this path.
  if (party !== 'client') return { ok: false, error: 'this signing link is not valid' };
  if (isExpired(a, now)) {
    a = markExpired(a, now);
    await s.agreements.put(a.slug, a.id, a);
  }
  if (a.signers[party].status === 'signed') return { ok: false, error: 'already signed' };
  if (!consentTerms) return { ok: false, error: 'you must agree to the terms' };
  if (!consentEsign) return { ok: false, error: 'you must agree to sign electronically' };
  if (!signaturePng(signatureDataUrl)) return { ok: false, error: 'draw your signature before sending' };
  try {
    // markSigned first: it is pure and throws on a bad transition (a voided
    // or otherwise closed agreement), so a rejected sign never leaves an
    // orphan PNG behind in documents.
    const next = markSigned(a, party, now, { ip, userAgent, signatureKey: signatureName(a, party) });
    await storeSignature(a, party, signatureDataUrl, s, now);
    await s.agreements.put(a.slug, a.id, next);
    // Two submits that overlap both pass the checks above against the same
    // stored copy and both write; the store is last-write-wins, so the one
    // whose signature survived the write owns the seal and the other is a
    // duplicate that must not seal, mail or answer ok.
    const fresh = await s.agreements.get(a.slug, a.id);
    if (fresh?.signers[party].signedAt !== now.toISOString()) return { ok: false, error: 'already signed' };
    return { ok: true, agreement: fresh.status === 'completed' ? await sealAgreement(fresh, s, fetchFn, now) : fresh };
  } catch (e) {
    if (e instanceof InvalidTransition) return { ok: false, error: e.message };
    throw e;
  }
}

export async function declineAgreement({ token, reason, ip }, s = defaultStore(), fetchFn = fetch, now = new Date()) {
  const found = await findByToken(s, token);
  if (!found) return { ok: false, error: 'this signing link is not valid' };
  let { agreement: a } = found;
  const { party } = found;
  // Only the client declines through their own token.
  if (party !== 'client') return { ok: false, error: 'this signing link is not valid' };
  if (isExpired(a, now)) {
    a = markExpired(a, now);
    await s.agreements.put(a.slug, a.id, a);
  }
  try {
    const next = markDeclined(a, party, now, { ip, reason: String(reason ?? '').slice(0, 500) });
    await s.agreements.put(a.slug, a.id, next);
    const client = await s.clients.get(a.slug);
    const template = findTemplate(await loadTemplates(s), 'agreement-declined');
    if (client && template && process.env.KEEPSITE_NOTIFY_TO) {
      const ctx = buildContext({ client, admin: null, secret: '', agreement: next, now });
      const { subject, text, html } = render(template, ctx, {});
      await sendMail({ slug: a.slug, to: process.env.KEEPSITE_NOTIFY_TO, subject, text, html, template: 'agreement-declined', kind: 'agreement-declined' }, s, fetchFn, now);
    }
    return { ok: true, agreement: next };
  } catch (e) {
    if (e instanceof InvalidTransition) return { ok: false, error: e.message };
    throw e;
  }
}

export async function voidAgreement({ slug, id, note }, s = defaultStore(), now = new Date()) {
  const a = await s.agreements.get(slug, id);
  if (!a) throw new Error('no such agreement');
  const next = markVoided(a, now, note ?? null);
  await s.agreements.put(slug, id, next);
  return next;
}

export async function expireAgreements(s = defaultStore(), now = new Date()) {
  let n = 0;
  // The listing is a snapshot: a client can sign between the read and the
  // write, and writing a record built from the snapshot would overwrite a
  // completed, sealed agreement with 'expired'. Re-read each candidate.
  for (const stale of await s.agreements.listAll()) {
    const a = await s.agreements.get(stale.slug, stale.id);
    if (a && isExpired(a, now)) {
      await s.agreements.put(a.slug, a.id, markExpired(a, now));
      n += 1;
    }
  }
  return n;
}

export async function renderCurrent(a, s = defaultStore()) {
  if (a.documentKey) {
    const bytes = await s.documents.get(a.slug, a.documentKey);
    if (bytes) return bytes;
  }
  return renderAgreement({ blocks: fillBlocks(templateFor(a), a.fields), signatures: await signaturesFor(a, s) });
}

// The public PDF route answers for exactly the statuses whose sign page
// offers a download; a draft, declined, expired or voided agreement is a 404
// there, so its PDF must not be fetchable either.
export const DOWNLOADABLE = ['sent', 'partiallySigned', 'completed'];

export const latestSent = (agreements) =>
  agreements.filter((a) => a.status === 'sent' || a.status === 'partiallySigned').sort((x, y) => y.id.localeCompare(x.id))[0];
