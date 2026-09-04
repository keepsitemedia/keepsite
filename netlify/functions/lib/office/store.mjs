// The only office module that knows what a key looks like. Pages and actions
// call these accessors and nothing lower, so moving to a database later is a
// rewrite of this file and no other.
import { memoryBackend, fileBackend, blobsBackend } from './backends.mjs';
import { ID } from './ids.mjs';

export const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;
const SETTING = /^[a-z]+$/;
const FORM = /^[a-z]+$/;

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
    },
    async counts() {
      const out = { clients: await s.clients.count() };
      for (const t of TYPES) out[t] = await s[t].count();
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
