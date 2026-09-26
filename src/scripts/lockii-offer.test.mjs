import { test } from 'node:test';
import assert from 'node:assert/strict';
import { discountedPrice, freeMonths, offerSummary } from './lockii-offer.mjs';

test('takes the discount off a display price and rounds to whole dollars', () => {
  assert.equal(discountedPrice('$2,400', 10), '$2,160');
  assert.equal(discountedPrice('$3,600', 10), '$3,240');
  assert.equal(discountedPrice('$4,200', 10), '$3,780');
  assert.equal(discountedPrice('$2,455', 10), '$2,210');
});

test('refuses a price it cannot read', () => {
  assert.throws(() => discountedPrice('quoted', 10), /price/);
  assert.throws(() => discountedPrice('$2,400', 0), /percent/);
});

test('words the free months', () => {
  assert.equal(freeMonths(1), 'first month free');
  assert.equal(freeMonths(2), 'first 2 months free');
});

test('summarises the offer in one line', () => {
  assert.equal(offerSummary({ discountPercent: 10, freeMonths: 1 }), '10% off the build, first month free');
});
