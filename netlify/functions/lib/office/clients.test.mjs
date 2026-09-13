import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slugify, uniqueSlug, validateClient, newClient, applyEdit, TIERS, OWN_SLUG, isRetiredTier } from './clients.mjs';

const NOW = new Date('2026-09-04T16:00:00Z');
const good = { name: 'Sierra', business: 'Lova Content Creation', email: 'sierra@example.com', tier: 'Growth' };

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
  assert.deepEqual(TIERS, ['Presence', 'Growth', 'Agile', 'Range']);
});

// Clients stored before the four packages carry "Search" or "Search Plus".
// They keep working untouched; the first edit has to move them.
test('validateClient keeps a retired tier only while it is unchanged', () => {
  const stored = { ...good, tier: 'Search' };
  assert.deepEqual(validateClient({ ...good, tier: 'Search' }, stored), []);
  assert.match(validateClient({ ...good, tier: 'Search' }, { ...good, tier: 'Growth' }).join(), /tier/);
  assert.match(validateClient({ ...good, tier: 'Search Plus' }, stored).join(), /tier/);
  assert.match(validateClient({ ...good, tier: 'Search' }).join(), /tier/);
  assert.equal(isRetiredTier('Search'), true);
  assert.equal(isRetiredTier('Growth'), false);
  assert.equal(isRetiredTier(''), false);
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

test('the own-tasks slug is never handed to a client', () => {
  assert.equal(OWN_SLUG, 'office');
  assert.equal(uniqueSlug('office', new Set()), 'office-2');
  assert.equal(uniqueSlug('office', new Set(['office-2'])), 'office-3');
  assert.equal(slugify('Office'), 'office');
});

test('TIERS matches packages.json', async () => {
  const packages = (await import('../../../../src/data/packages.json', { with: { type: 'json' } })).default;
  assert.deepEqual(TIERS, packages.tiers.map((t) => t.name));
});
