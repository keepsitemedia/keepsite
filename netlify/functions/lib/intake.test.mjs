import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pullIntake } from './intake.mjs';

const fake = (entries) => ({
  async getText(key) { return typeof entries[key] === 'string' ? entries[key] : null; },
  async getBytes(key) { return entries[key] instanceof Uint8Array ? entries[key] : null; },
  async list(prefix) { return Object.keys(entries).filter((k) => k.startsWith(prefix)).sort(); },
});

test('pullIntake writes the forms it finds and reports the ones it does not', async () => {
  const out = {};
  const source = fake({ 'lova/intro.json': '{"form":"intro"}', 'lova/brand.json': '{"form":"brand"}', 'lova/logo-lova.png': new Uint8Array([1, 2]), 'acme/build.json': '{}' });
  const result = await pullIntake({ slug: 'lova', dir: '/work', source, write: async (p, data) => { out[p] = data; } });
  assert.deepEqual(result.written, ['/work/lova/intake/intro.json', '/work/lova/intake/brand.json', '/work/lova/intake/logo-lova.png']);
  assert.deepEqual(result.missing, ['build']);
  assert.equal(out['/work/lova/intake/intro.json'], '{"form":"intro"}');
  assert.deepEqual([...out['/work/lova/intake/logo-lova.png']], [1, 2]);
  assert.equal(out['/work/acme/intake/build.json'], undefined);
});

test('pullIntake refuses a bad slug before touching the source', async () => {
  await assert.rejects(() => pullIntake({ slug: '../etc', dir: '/work', source: fake({}), write: async () => {} }), /bad slug/);
});

test('pullIntake skips an attachment key that would escape intake/ via ..', async () => {
  const out = {};
  const source = fake({ 'lova/../acme/x.png': new Uint8Array([9]) });
  const result = await pullIntake({ slug: 'lova', dir: '/work', source, write: async (p, data) => { out[p] = data; } });
  assert.deepEqual(result.written, []);
  assert.equal(Object.keys(out).length, 0);
});

test('pullIntake skips a bare prefix key with no attachment name', async () => {
  const out = {};
  const source = fake({ 'lova/': new Uint8Array([9]) });
  const result = await pullIntake({ slug: 'lova', dir: '/work', source, write: async (p, data) => { out[p] = data; } });
  assert.deepEqual(result.written, []);
  assert.equal(Object.keys(out).length, 0);
});

test('pullIntake still writes a normal flat attachment', async () => {
  const out = {};
  const source = fake({ 'lova/logo.png': new Uint8Array([1, 2]) });
  const result = await pullIntake({ slug: 'lova', dir: '/work', source, write: async (p, data) => { out[p] = data; } });
  assert.deepEqual(result.written, ['/work/lova/intake/logo.png']);
  assert.deepEqual([...out['/work/lova/intake/logo.png']], [1, 2]);
});

test('pullIntake pulls a client upload whose name ends in .json', async () => {
  const out = {};
  const source = fake({ 'lova/brand.json': '{"form":"brand"}', 'lova/logo-x.json': new Uint8Array([7]) });
  const result = await pullIntake({ slug: 'lova', dir: '/work', source, write: async (p, data) => { out[p] = data; } });
  assert.deepEqual(result.written, ['/work/lova/intake/brand.json', '/work/lova/intake/logo-x.json']);
  assert.deepEqual([...out['/work/lova/intake/logo-x.json']], [7]);
});
