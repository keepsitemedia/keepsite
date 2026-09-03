import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileKey, safeName } from './blob-key.mjs';

test('an ordinary filename survives intact', () => {
  assert.equal(safeName('Lova-logo_v2.png'), 'Lova-logo_v2.png');
  assert.equal(fileKey('lova', 'logo', 'Lova-logo_v2.png'), 'lova/logo-Lova-logo_v2.png');
});

// The client prefix is the boundary between one client's uploads and
// another's. A name that walks out of it would put a submission somewhere the
// design says it can never be.
test('a traversal attempt cannot escape the client prefix', () => {
  for (const evil of ['../../other/logo.png', '..\\..\\other\\logo.png', '../../../etc/passwd']) {
    const at = fileKey('lova', 'logo', evil);
    assert.ok(at.startsWith('lova/logo-'), at);
    assert.ok(!at.split('/').includes('..'), at);
    assert.equal(at.split('/').length, 2, at);
  }
});

test('a name that is nothing but dots and slashes falls back', () => {
  assert.equal(safeName('..'), 'upload');
  assert.equal(safeName('/'), 'upload');
  assert.equal(safeName(''), 'upload');
  assert.equal(safeName(undefined), 'upload');
});

test('the charset is restricted and the length is capped', () => {
  assert.equal(safeName('a b;c"d e.png'), 'a-b-c-d-e.png');
  assert.match(safeName('logo \u00e9 \u00fc.png'), /^[A-Za-z0-9._-]+$/);
  assert.ok(safeName('x'.repeat(500)).length <= 80);
  assert.match(fileKey('lova', 'brandGuide', 'a b\nc.pdf'), /^lova\/brandGuide-[A-Za-z0-9._-]+$/);
});
