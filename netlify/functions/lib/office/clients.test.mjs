import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slugify, uniqueSlug, validateClient, newClient, applyEdit, TIERS } from './clients.mjs';

const NOW = new Date('2026-09-04T16:00:00Z');
const good = { name: 'Sierra', business: 'Lova Content Creation', email: 'sierra@example.com', tier: 'Search' };

test('slugify makes a usable slug from a business name', () => {
  assert.equal(slugify('Lova Content Creation'), 'lova-content-creation');
  assert.equal(slugify("  P&P Bakery, LLC. "), 'p-p-bakery-llc');
  assert.equal(slugify('###'), 'client');
  assert.equal(slugify('x'.repeat(100)).length, 64);
  assert.equal(slugify('-leading'), 'leading');
});

test('uniqueSlug appends a counter only when taken', () => {
  assert.equal(uniqueSlug('lova', new Set()), 'lova');
  assert.equal(uniqueSlug('lova', new Set(['lova'])), 'lova-2');
  assert.equal(uniqueSlug('lova', new Set(['lova', 'lova-2'])), 'lova-3');
});

test('validateClient requires name, business and a plausible email', () => {
  assert.deepEqual(validateClient(good), []);
  assert.match(validateClient({ ...good, name: '' }).join(), /name/);
  assert.match(validateClient({ ...good, email: 'nope' }).join(), /email/);
  assert.match(validateClient({ ...good, tier: 'Gold' }).join(), /tier/);
  assert.deepEqual(validateClient({ ...good, tier: '' }), []);
});

test('newClient fills every field with a value', () => {
  const c = newClient(good, { pipeline: 'website', stage: 'inquiry', today: '2026-09-04', now: NOW });
  assert.equal(c.slug, 'lova-content-creation');
  assert.equal(c.phone, '');
  assert.equal(c.stage, 'inquiry');
  assert.deepEqual(c.stages, [{ stage: 'inquiry', at: NOW.toISOString() }]);
  assert.deepEqual(c.dates, { inquiry: '2026-09-04', signed: null, launched: null });
  assert.equal(c.stripeCustomerId, null);
  assert.equal(c.createdAt, NOW.toISOString());
});

test('newClient honours a given slug and applyEdit changes only editable fields', () => {
  const c = newClient({ ...good, slug: 'lova' }, { pipeline: 'website', stage: 'inquiry', today: '2026-09-04', now: NOW });
  assert.equal(c.slug, 'lova');
  const later = new Date('2026-09-05T00:00:00Z');
  const e = applyEdit(c, { ...good, phone: '555', slug: 'hacked', stage: 'live' }, later);
  assert.equal(e.slug, 'lova');
  assert.equal(e.stage, 'inquiry');
  assert.equal(e.phone, '555');
  assert.equal(e.updatedAt, later.toISOString());
});

test('TIERS matches packages.json', async () => {
  const packages = (await import('../../../../src/data/packages.json', { with: { type: 'json' } })).default;
  assert.deepEqual(TIERS, packages.tiers.map((t) => t.name));
});
