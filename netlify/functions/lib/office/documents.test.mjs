import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contentType, disposition, formatSize, validateUpload, listDocuments, UPLOAD_MAX } from './documents.mjs';
import { createStore, DOC_NAME } from './store.mjs';
import { safeName } from '../blob-key.mjs';
import { memoryBackend } from './backends.mjs';

test('content types come from the extension and default to octet-stream', () => {
  assert.equal(contentType('brief.PDF'), 'application/pdf');
  assert.equal(contentType('logo-mark.png'), 'image/png');
  assert.equal(contentType('notes.md'), 'text/markdown');
  assert.equal(contentType('mystery'), 'application/octet-stream');
});

test('only images and PDFs are shown inline', () => {
  assert.equal(disposition('application/pdf', 'a.pdf'), 'inline; filename="a.pdf"');
  assert.equal(disposition('image/png', 'a.png'), 'inline; filename="a.png"');
  assert.equal(disposition('image/svg+xml', 'a.svg'), 'attachment; filename="a.svg"');
  assert.equal(disposition('text/plain', 'a.txt'), 'attachment; filename="a.txt"');
});

test('sizes format for humans', () => {
  assert.equal(formatSize(null), '');
  assert.equal(formatSize(512), '512 B');
  assert.equal(formatSize(20 * 1024), '20 KB');
  assert.equal(formatSize(1.5 * 1024 * 1024), '1.5 MB');
});

test('uploads must be a non-empty file under the limit', () => {
  assert.equal(validateUpload(null), 'choose a file');
  assert.equal(validateUpload(new File([], 'empty.txt')), 'choose a file');
  assert.equal(validateUpload(new File([new Uint8Array(UPLOAD_MAX + 1)], 'big.bin')), 'file is larger than 6 MB');
  assert.equal(validateUpload(new File([new Uint8Array(10)], 'ok.bin')), null);
});

test('a bare Blob is not a File, even with bytes', () => {
  assert.equal(validateUpload(new Blob([new Uint8Array(10)])), 'choose a file');
});

// The upload action stores whatever safeName returns, and the store throws on
// a name DOC_NAME refuses; the two have to agree or an upload becomes a 500.
test('safeName always yields a name the store will accept', () => {
  for (const raw of ['_final.pdf', '_', '.._x.pdf', '\u65e5\u672c\u8a9e.pdf', 'a b.pdf', '../../etc/passwd', 'x'.repeat(200)]) {
    assert.ok(DOC_NAME.test(safeName(raw)), `${raw} -> ${safeName(raw)}`);
  }
});

test('listDocuments merges office documents and questionnaire files, newest first', async () => {
  const q = memoryBackend();
  const s = createStore({ office: memoryBackend(), questionnaires: q });
  await s.documents.put('lova', 'agreement-1.pdf', new Uint8Array(4), { type: 'application/pdf', source: 'seal' }, new Date('2026-09-05T10:00:00Z'));
  await s.documents.put('lova', 'brief.pdf', new Uint8Array(8), { type: 'application/pdf', source: 'upload' }, new Date('2026-09-06T10:00:00Z'));
  await q.setBytes('lova/logo-mark.png', new Uint8Array(2));
  await q.setText('lova/intro.json', '{}');
  const rows = await listDocuments('lova', s);
  assert.deepEqual(rows.map((r) => r.name), ['brief.pdf', 'agreement-1.pdf', 'logo-mark.png']);
  assert.deepEqual(rows.map((r) => r.removable), [true, false, false]);
  assert.equal(rows[0].href, '/office/documents/lova/brief.pdf');
  assert.equal(rows[2].href, '/office/documents/lova/intake/logo-mark.png');
  assert.equal(rows[2].source, 'questionnaire');
  assert.equal(rows[2].type, 'image/png');
});

test('rows with the same uploadedAt tie-break by name', async () => {
  const q = memoryBackend();
  const s = createStore({ office: memoryBackend(), questionnaires: q });
  const when = new Date('2026-09-05T10:00:00Z');
  await s.documents.put('lova', 'zeta.pdf', new Uint8Array(4), { type: 'application/pdf', source: 'upload' }, when);
  await s.documents.put('lova', 'alpha.pdf', new Uint8Array(4), { type: 'application/pdf', source: 'upload' }, when);
  const rows = await listDocuments('lova', s);
  assert.deepEqual(rows.map((r) => r.name), ['alpha.pdf', 'zeta.pdf']);
});
