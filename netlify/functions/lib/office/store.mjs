// The only office module that knows what a key looks like. Pages and actions
// call these accessors and nothing lower, so moving to a database later is a
// rewrite of this file and no other.
import { fileBackend, blobsBackend } from './backends.mjs';
import { ID } from './ids.mjs';

export const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;
const SETTING = /^[a-z]+$/;
const FORM = /^[a-z]+$/;
// Exported so sign.mjs (and any other route that verifies a signing link)
// imports the token shape from one place instead of redefining the regex.
export const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const LOCK = /^[a-z]+-[A-Za-z0-9_-]{1,80}$/;

export function assertSlug(slug) {
  if (!SLUG.test(String(slug))) throw new Error(`bad slug: ${slug}`);
  return slug;
}
const assertId = (id) => {
  if (!ID.test(String(id))) throw new Error(`bad id: ${id}`);
  return id;
};
const assertName = (re, what) => (v) => {
  if (!re.test(String(v))) throw new Error(`bad ${what}: ${v}`);
  return v;
};
const assertSetting = assertName(SETTING, 'setting');
const assertForm = assertName(FORM, 'form');
const assertToken = assertName(TOKEN, 'token');
const assertLock = assertName(LOCK, 'lock');

async function readJSON(backend, key) {
  const text = await backend.getText(key);
  return text == null ? null : JSON.parse(text);
}
const writeJSON = (backend, key, doc) => backend.setText(key, JSON.stringify(doc, null, 2));
const readAll = async (backend, prefix) =>
  Promise.all((await backend.list(prefix)).map((k) => readJSON(backend, k)));

function perClient(backend, type) {
  const key = (slug, id) => `${type}/${assertSlug(slug)}/${assertId(id)}.json`;
  return {
    async get(slug, id) { return readJSON(backend, key(slug, id)); },
    async put(slug, id, doc) { return writeJSON(backend, key(slug, id), doc); },
    async remove(slug, id) { return backend.remove(key(slug, id)); },
    async list(slug) { return readAll(backend, `${type}/${assertSlug(slug)}/`); },
    async listAll() { return readAll(backend, `${type}/`); },
    async count() { return (await backend.list(`${type}/`)).length; },
  };
}

// Exported so a later route that reads a document by name can validate it
// with the same regex the store uses, rather than duplicating it.
export const DOC_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/;
const assertDocName = (name) => {
  const s = String(name);
  // ".meta.json" is the sidecar's own reserved suffix; a document named
  // "x.pdf.meta.json" would otherwise write straight over another
  // document's metadata file.
  if (!DOC_NAME.test(s) || s.endsWith('.meta.json')) throw new Error(`bad document name: ${name}`);
  return name;
};

function documents(backend) {
  const key = (slug, name) => `documents/${assertSlug(slug)}/${assertDocName(name)}`;
  return {
    async put(slug, name, bytes, meta = {}, now = new Date()) {
      await backend.setBytes(key(slug, name), bytes);
      await writeJSON(backend, `${key(slug, name)}.meta.json`, {
        name, size: bytes.byteLength, type: meta.type ?? 'application/octet-stream',
        source: meta.source ?? 'upload', uploadedAt: now.toISOString(), ...meta,
      });
    },
    async get(slug, name) { return backend.getBytes(key(slug, name)); },
    async meta(slug, name) { return readJSON(backend, `${key(slug, name)}.meta.json`); },
    async remove(slug, name) {
      await backend.remove(key(slug, name));
      await backend.remove(`${key(slug, name)}.meta.json`);
    },
    async list(slug) {
      const keys = (await backend.list(`documents/${assertSlug(slug)}/`)).filter((k) => k.endsWith('.meta.json'));
      return Promise.all(keys.map((k) => readJSON(backend, k)));
    },
    async count() {
      return (await backend.list('documents/')).filter((k) => k.endsWith('.meta.json')).length;
    },
  };
}

export const TYPES = ['tasks', 'meetings', 'payments', 'agreements', 'emails'];

export function createStore({ office, questionnaires }) {
  const clientKey = (slug) => `clients/${assertSlug(slug)}.json`;
  const s = {
    clients: {
      async get(slug) { return readJSON(office, clientKey(slug)); },
      async put(slug, doc) { return writeJSON(office, clientKey(slug), doc); },
      async remove(slug) { return office.remove(clientKey(slug)); },
      async list() { return readAll(office, 'clients/'); },
      async count() { return (await office.list('clients/')).length; },
    },
    settings: {
      async get(name) { return readJSON(office, `settings/${assertSetting(name)}.json`); },
      async put(name, doc) { return writeJSON(office, `settings/${assertSetting(name)}.json`, doc); },
    },
    questionnaires: {
      async get(slug, form) { return readJSON(questionnaires, `${assertSlug(slug)}/${assertForm(form)}.json`); },
      async files(slug) {
        return (await questionnaires.list(`${assertSlug(slug)}/`)).filter((k) => !k.endsWith('.json'));
      },
      async file(slug, name) { return questionnaires.getBytes(`${assertSlug(slug)}/${assertDocName(name)}`); },
    },
    documents: documents(office),
    tokens: {
      async get(token) { return readJSON(office, `tokens/${assertToken(token)}.json`); },
      async put(token, ref) { return writeJSON(office, `tokens/${assertToken(token)}.json`, ref); },
    },
    // A lock is a key that can be created once. There is no release: a seal
    // happens once per agreement, so the lock's name carries the agreement id
    // and is never reused.
    locks: {
      async acquire(name) { return office.setTextIfNew(`locks/${assertLock(name)}`, new Date().toISOString()); },
    },
    async counts() {
      const out = { clients: await s.clients.count() };
      for (const t of TYPES) out[t] = await s[t].count();
      out.documents = await s.documents.count();
      return out;
    },
  };
  for (const t of TYPES) s[t] = perClient(office, t);
  return s;
}

let instance;
export function store() {
  if (instance) return instance;
  const dir = process.env.OFFICE_STORE_DIR;
  instance = dir
    ? createStore({ office: fileBackend(`${dir}/office`), questionnaires: fileBackend(`${dir}/questionnaires`) })
    : createStore({ office: blobsBackend('office'), questionnaires: blobsBackend('questionnaires') });
  return instance;
}
