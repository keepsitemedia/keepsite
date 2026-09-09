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

// The store's own name check wants an alphanumeric first character, so a
// leading underscore has to go the same way a leading dot or dash does.
test('leading punctuation is stripped so the store can hold the name', () => {
  assert.equal(safeName('_final.pdf'), 'final.pdf');
  assert.equal(safeName('_DSC0001.jpg'), 'DSC0001.jpg');
  assert.equal(safeName('-.._x.pdf'), 'x.pdf');
});

test('a name that is nothing but dots and slashes falls back', () => {
  assert.equal(safeName('..'), 'upload');
  assert.equal(safeName('_'), 'upload');
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

// The extension is what the office derives a content type from, so it
// survives a stem that collapses or one that is cut to length.
test('the extension survives a stem that empties or is cut', () => {
  assert.equal(safeName('日本語.pdf'), 'upload.pdf');
  assert.equal(safeName('日本語 report.pdf'), 'report.pdf');
  const long = safeName(`${'x'.repeat(500)}.docx`);
  assert.equal(long.length, 80);
  assert.ok(long.endsWith('.docx'), long);
  assert.equal(safeName('.bashrc'), 'bashrc');
  assert.equal(safeName('archive.tar.gz'), 'archive.tar.gz');
});
