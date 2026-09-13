import packages from '../../../../src/data/packages.json' with { type: 'json' };

export const TIERS = packages.tiers.map((t) => t.name);
export const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EDITABLE = ['name', 'business', 'email', 'phone', 'address', 'website', 'tier', 'notes'];

export function slugify(text) {
  const s = String(text ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
    .replace(/-+$/, '');
  return s || 'client';
}

export function uniqueSlug(base, taken) {
  if (!taken.has(base)) return base;
  for (let n = 2; ; n += 1) {
    const candidate = `${base.slice(0, 64 - String(n).length - 1)}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

export const isRetiredTier = (name) => Boolean(name) && !TIERS.includes(name);

export function validateClient(fields, existing = null) {
  const errors = [];
  if (!fields.name) errors.push('name is required');
  if (!fields.business) errors.push('business is required');
  if (!EMAIL.test(fields.email ?? '')) errors.push('email does not look like an address');
  // A retired tier stays valid only while it is left alone, so old clients
  // keep working and the first edit moves them to a current package.
  const keepsRetired = isRetiredTier(fields.tier) && existing?.tier === fields.tier;
  if (fields.tier && !TIERS.includes(fields.tier) && !keepsRetired) errors.push(`tier must be one of ${TIERS.join(', ')}`);
  return errors;
}

const pick = (fields) => Object.fromEntries(EDITABLE.map((k) => [k, String(fields[k] ?? '').trim()]));

export function newClient(fields, { pipeline, stage, today, now = new Date() }) {
  const at = now.toISOString();
  return {
    slug: fields.slug || slugify(fields.business),
    ...pick(fields),
    pipeline,
    stage,
    stages: [{ stage, at }],
    stripeCustomerId: null,
    dates: { inquiry: today, signed: null, launched: null },
    createdAt: at,
    updatedAt: at,
  };
}

export function applyEdit(client, fields, now = new Date()) {
  return { ...client, ...pick(fields), updatedAt: now.toISOString() };
}

export const clientFields = (data) =>
  Object.fromEntries(EDITABLE.map((k) => [k, String(data.get(k) ?? '').trim()]));
