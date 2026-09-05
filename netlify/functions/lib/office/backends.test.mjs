import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { memoryBackend, fileBackend } from './backends.mjs';

// Both local backends must behave identically; Blobs is not testable here.
for (const [name, make] of [
  ['memory', async () => memoryBackend()],
  ['file', async () => fileBackend(await fs.mkdtemp(path.join(os.tmpdir(), 'office-')))],
]) {
  test(`${name}: round-trips text and lists by prefix in key order`, async () => {
    const b = await make();
    assert.equal(await b.getText('clients/a.json'), null);
    await b.setText('clients/b.json', 'B');
    await b.setText('clients/a.json', 'A');
    await b.setText('tasks/a/1.json', 'T');
    assert.equal(await b.getText('clients/a.json'), 'A');
    assert.deepEqual(await b.list('clients/'), ['clients/a.json', 'clients/b.json']);
    assert.deepEqual(await b.list('nothing/'), []);
    await b.remove('clients/a.json');
    assert.equal(await b.getText('clients/a.json'), null);
    await b.remove('clients/never.json');
  });

  test(`${name}: round-trips bytes and keeps them apart from text`, async () => {
    const b = await make();
    assert.equal(await b.getBytes('documents/a/x.png'), null);
    const bytes = new Uint8Array([137, 80, 78, 71, 0, 255]);
    await b.setBytes('documents/a/x.png', bytes);
    assert.deepEqual([...(await b.getBytes('documents/a/x.png'))], [...bytes]);
    assert.deepEqual(await b.list('documents/a/'), ['documents/a/x.png']);
    await b.remove('documents/a/x.png');
    assert.equal(await b.getBytes('documents/a/x.png'), null);
  });
}
