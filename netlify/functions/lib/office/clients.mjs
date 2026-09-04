import packages from '../../../../src/data/packages.json' with { type: 'json' };

export const TIERS = packages.tiers.map((t) => t.name);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
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

export function validateClient(fields) {
  const errors = [];
  if (!fields.name) errors.push('name is required');
  if (!fields.business) errors.push('business is required');
  if (!EMAIL.test(fields.email ?? '')) errors.push('email does not look like an address');
  if (fields.tier && !TIERS.includes(fields.tier)) errors.push(`tier must be one of ${TIERS.join(', ')}`);
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
