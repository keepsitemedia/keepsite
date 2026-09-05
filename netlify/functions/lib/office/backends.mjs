// Three backends behind one four-method shape. Blobs is the real one; the
// file backend lets `astro dev` run without the Netlify CLI, and memory keeps
// tests free of disk and network. Text and bytes: JSON documents are text;
// signature images and sealed PDFs are bytes.
import fs from 'node:fs/promises';
import path from 'node:path';

export function memoryBackend() {
  const map = new Map();
  return {
    async getText(key) { return map.has(key) ? map.get(key) : null; },
    async setText(key, text) { map.set(key, text); },
    async getBytes(key) { return map.has(key) ? map.get(key) : null; },
    async setBytes(key, bytes) { map.set(key, bytes); },
    async list(prefix) { return [...map.keys()].filter((k) => k.startsWith(prefix)).sort(); },
    async remove(key) { map.delete(key); },
  };
}

export function fileBackend(dir) {
  const file = (key) => path.join(dir, key);
  async function walk(d) {
    let entries;
    try { entries = await fs.readdir(d, { withFileTypes: true }); } catch (e) {
      if (e.code === 'ENOENT') return [];
      throw e;
    }
    const out = [];
    for (const e of entries) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) out.push(...(await walk(p)));
      else out.push(path.relative(dir, p).split(path.sep).join('/'));
    }
    return out;
  }
  return {
    async getText(key) {
      try { return await fs.readFile(file(key), 'utf8'); } catch (e) {
        if (e.code === 'ENOENT') return null;
        throw e;
      }
    },
    async setText(key, text) {
      await fs.mkdir(path.dirname(file(key)), { recursive: true });
      await fs.writeFile(file(key), text);
    },
    async getBytes(key) {
      try { return new Uint8Array(await fs.readFile(file(key))); } catch (e) {
        if (e.code === 'ENOENT') return null;
        throw e;
      }
    },
    async setBytes(key, bytes) {
      await fs.mkdir(path.dirname(file(key)), { recursive: true });
      await fs.writeFile(file(key), bytes);
    },
    async list(prefix) { return (await walk(dir)).filter((k) => k.startsWith(prefix)).sort(); },
    async remove(key) { await fs.rm(file(key), { force: true }); },
  };
}

export function blobsBackend(name) {
  let store;
  // Imported lazily so a test process that never touches Blobs never loads it.
  const open = async () => (store ??= (await import('@netlify/blobs')).getStore(name));
  return {
    async getText(key) { return (await (await open()).get(key)) ?? null; },
    async setText(key, text) { await (await open()).set(key, text); },
    async getBytes(key) {
      const buf = await (await open()).get(key, { type: 'arrayBuffer' });
      return buf ? new Uint8Array(buf) : null;
    },
    async setBytes(key, bytes) {
      await (await open()).set(key, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    },
    async list(prefix) {
      const { blobs } = await (await open()).list({ prefix });
      return blobs.map((b) => b.key).sort();
    },
    async remove(key) { await (await open()).delete(key); },
  };
}
