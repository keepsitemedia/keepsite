import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mint, verify } from './token.mjs';

const SECRET = 'test-secret';

test('a minted token verifies', () => {
  const t = mint(SECRET, 'lova-content-creation', 'build');
  assert.equal(verify(SECRET, 'lova-content-creation', 'build', t), true);
});

test('a token is bound to its slug', () => {
  const t = mint(SECRET, 'lova-content-creation', 'build');
  assert.equal(verify(SECRET, 'makeup-by-brynlie', 'build', t), false);
});

test('a token is bound to its form', () => {
  const t = mint(SECRET, 'lova-content-creation', 'build');
  assert.equal(verify(SECRET, 'lova-content-creation', 'brand', t), false);
});

test('a tampered token fails', () => {
  const t = mint(SECRET, 'lova-content-creation', 'build');
  const bad = t.slice(0, -1) + (t.endsWith('A') ? 'B' : 'A');
  assert.equal(verify(SECRET, 'lova-content-creation', 'build', bad), false);
});

test('a different secret fails', () => {
  const t = mint(SECRET, 'lova-content-creation', 'build');
  assert.equal(verify('other-secret', 'lova-content-creation', 'build', t), false);
});

test('malformed input returns false rather than throwing', () => {
  for (const bad of [undefined, null, '', 'not-base64!!', 'AAAA']) {
    assert.equal(verify(SECRET, 'lova-content-creation', 'build', bad), false);
  }
});

test('tokens are url-safe', () => {
  const t = mint(SECRET, 'lova-content-creation', 'build');
  assert.equal(encodeURIComponent(t), t);
});

test('no collision between (slug, form) pairs', () => {
  assert.notEqual(mint(SECRET, 'a:b', 'c'), mint(SECRET, 'a', 'b:c'));
  assert.equal(verify(SECRET, 'a', 'b:c', mint(SECRET, 'a:b', 'c')), false);
});
