import { readForm, redirect, problem, field, checkCsrf, CSRF_REFUSED } from '../http.mjs';
import { store as defaultStore, SLUG } from '../store.mjs';
import { ID } from '../ids.mjs';
import { EMAIL } from '../clients.mjs';
import { findAgreementTemplate } from '../agreement-templates.mjs';
import { createAgreement, sendAgreement, voidAgreement, sealAgreement } from '../agreements.mjs';
import { clientIp, userAgentOf } from '../sign.mjs';
import { dollarsToCents } from './payment.mjs';

const TEXT = ['legalName', 'entityType', 'address', 'signerName', 'signerTitle', 'email', 'phone'];
const DISCOUNT_TEXT = ['name', 'type', 'amount', 'monthlyType', 'monthlyAmount', 'conditions'];

// Schedule 1 from the form. Money arrives as dollars and is stored as cents;
// the two fee halves must add up to the fee the client is actually paying.
export function fieldsFromForm(data) {
  const errors = [];
  const f = Object.fromEntries(TEXT.map((k) => [k, field(data, k)]));
  if (!f.legalName) errors.push('legal business name is required');
  if (!f.signerName) errors.push('signer name is required');
  if (!EMAIL.test(f.email)) errors.push('email does not look like an address');
  for (const k of ['buildFee', 'monthlyFee', 'deposit', 'balance']) {
    f[k] = dollarsToCents(field(data, k));
    if (f[k] === null) errors.push(`${k === 'buildFee' ? 'build fee' : k === 'monthlyFee' ? 'monthly fee' : k} must be a positive dollar amount`);
  }
  const pages = Number(field(data, 'pages'));
  f.pages = Number.isInteger(pages) && pages > 0 ? pages : null;
  if (f.pages === null) errors.push('pages must be a whole number');
  f.discountApplied = field(data, 'discountApplied') === 'on';
  if (f.discountApplied) {
    const adjusted = field(data, 'discount_adjustedBuildFee');
    const discounted = field(data, 'discount_discountedMonthlyFee');
    const months = Number(field(data, 'discount_months'));
    f.discount = {
      ...Object.fromEntries(DISCOUNT_TEXT.map((k) => [k, field(data, `discount_${k}`)])),
      adjustedBuildFee: adjusted ? dollarsToCents(adjusted) : null,
      discountedMonthlyFee: discounted ? dollarsToCents(discounted) : null,
      months: Number.isInteger(months) && months > 0 ? months : null,
    };
    if (f.discount.months === null) errors.push('discount months must be a whole number');
  } else {
    // Unticking the box drops whatever was typed underneath it; Exhibit D
    // is either attached in full or not at all.
    f.discount = { name: '', type: '', amount: '', adjustedBuildFee: null, monthlyType: '', monthlyAmount: '', discountedMonthlyFee: null, months: null, conditions: '' };
  }
  if (errors.length === 0) {
    const effective = f.discountApplied && f.discount.adjustedBuildFee ? f.discount.adjustedBuildFee : f.buildFee;
    if (f.deposit + f.balance !== effective) errors.push(`deposit and balance must add up to the build fee (${(effective / 100).toFixed(2)})`);
  }
  return { fields: f, errors };
}

export async function agreement(request, ctx, s = defaultStore(), fetchFn = fetch, now = new Date()) {
  if (request.method !== 'POST') return problem(405, 'POST only');
  const data = await readForm(request);
  if (!data) return problem(400, 'expected a form');
  if (!checkCsrf(ctx, data)) return problem(403, CSRF_REFUSED);

  const slug = field(data, 'slug');
  if (!SLUG.test(slug)) return problem(400, 'bad slug');
  const client = await s.clients.get(slug);
  if (!client) return problem(404, 'no such client');
  const op = field(data, 'op');
  if (!['create', 'send', 'void', 'reseal'].includes(op)) return problem(400, 'unknown op');
  const tab = `/office/clients/${slug}/?tab=agreements`;
  const back = (message) => redirect(`${tab}&error=${encodeURIComponent(message)}`);
  // A rejected create loses everything the admin typed unless the redirect
  // carries it back; the client page's form reads these over its defaults.
  const createBack = (message) => {
    const params = new URLSearchParams();
    for (const [k, v] of data.entries()) {
      if (k === 'csrf' || typeof v !== 'string') continue;
      params.set(k, v);
    }
    // error goes on the end via encodeURIComponent, not params.set, so a
    // space in the message reads as %20 like every other back() redirect
    // rather than URLSearchParams' '+'.
    return redirect(`${tab}&${params.toString()}&error=${encodeURIComponent(message)}`);
  };

  if (op === 'create') {
    const templateId = field(data, 'template');
    if (!findAgreementTemplate(templateId)) return createBack('unknown template');
    const { fields, errors } = fieldsFromForm(data);
    if (errors.length) return createBack(errors.join('; '));
    const a = await createAgreement({ client, templateId, fields }, s, now);
    return redirect(`/office/agreements/${slug}/${a.id}/sign/`);
  }

  const id = field(data, 'id');
  if (!ID.test(id)) return problem(400, 'bad id');
  const existing = await s.agreements.get(slug, id);
  if (!existing) return problem(404, 'no such agreement');
  // A failed send belongs back on the signing page, where the pad and the
  // consent state still are, not on the tab that lost all of that context.
  const signBack = (message) => redirect(`/office/agreements/${slug}/${id}/sign/?error=${encodeURIComponent(message)}`);

  try {
    if (op === 'send') {
      await sendAgreement({
        slug, id, signatureDataUrl: String(data.get('signature') ?? ''),
        ip: clientIp(request), userAgent: userAgentOf(request),
      }, s, now);
      return redirect(`/office/send/${slug}/agreement/`);
    }
    if (op === 'reseal') {
      // The seal is the only step that can fail after both parties have
      // signed. Voiding is the other way out of a completed-unsealed record;
      // this one keeps the signatures both parties already gave.
      if (existing.status !== 'completed' || existing.documentKey) return back('only a completed agreement with no sealed PDF can be sealed again');
      await sealAgreement(existing, s, fetchFn, now);
      return redirect(tab);
    }
    await voidAgreement({ slug, id, note: field(data, 'note') || null }, s, now);
    return redirect(tab);
  } catch (e) {
    return op === 'send' ? signBack(e.message) : back(e.message);
  }
}
