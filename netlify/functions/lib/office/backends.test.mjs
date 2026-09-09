import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { memoryBackend, fileBackend, blobsBackend } from './backends.mjs';

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

  test(`${name} setTextIfNew writes once`, async () => {
    const b = await make();
    assert.equal(await b.setTextIfNew('locks/a', '1'), true);
    assert.equal(await b.setTextIfNew('locks/a', '2'), false);
    assert.equal(await b.getText('locks/a'), '1');
    // Ten racers, one winner.
    const results = await Promise.all(Array.from({ length: 10 }, (_, i) => b.setTextIfNew('locks/b', String(i))));
    assert.equal(results.filter(Boolean).length, 1);
  });
}

// The Blobs backend is an adapter over the SDK's store, so a fake store
// standing in for the module is enough to check what the adapter asks for.
function fakeBlobs() {
  const calls = [];
  const map = new Map();
  const store = {
    async get(key, opts) {
      if (!map.has(key)) return null;
      return opts?.type === 'arrayBuffer' ? map.get(key) : map.get(key);
    },
    async set(key, value, opts) {
      if (opts?.onlyIfNew && map.has(key)) return { modified: false };
      map.set(key, value);
      return { modified: true };
    },
    async list({ prefix }) { return { blobs: [...map.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) }; },
    async delete(key) { map.delete(key); },
  };
  return { calls, module: { getStore(opts) { calls.push(opts); return store; } } };
}

test('blobs opens the store once, by name, with strong consistency', async () => {
  const { calls, module } = fakeBlobs();
  const b = blobsBackend('office', async () => module);
  await b.setText('clients/a.json', 'A');
  assert.equal(await b.getText('clients/a.json'), 'A');
  assert.equal(await b.setTextIfNew('locks/a', '1'), true);
  assert.equal(await b.setTextIfNew('locks/a', '2'), false);
  assert.deepEqual(await b.list('clients/'), ['clients/a.json']);
  await b.remove('clients/a.json');
  assert.equal(await b.getText('clients/a.json'), null);
  assert.deepEqual(calls, [{ name: 'office', consistency: 'strong' }]);
});
