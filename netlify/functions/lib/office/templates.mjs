// Templates are data the admin edits in the office. Two kinds of placeholder:
// auto-filled from the client and the event, and prompted, which the send
// screen asks for. Anything unresolved stays as {{name}} so a half-filled
// email is seen before it is sent, never sent with a blank.
import { marked } from 'marked';
import seed from '../../../../src/data/office/templates.json' with { type: 'json' };

const KEY = /^[a-z][a-zA-Z0-9-]{0,31}$/;
const PLACEHOLDER = /\{\{\s*([a-zA-Z][a-zA-Z0-9_.]*)\s*\}\}/g;

export const KNOWN_PLACEHOLDERS = [
  'client.name', 'client.firstName', 'client.business', 'client.email',
  'links.intro', 'links.brand', 'links.build', 'links.demo',
  'site.brand', 'site.url', 'site.email', 'site.phone',
  'admin.email',
  'questionnaire.title', 'questionnaire.link',
  'meeting.title', 'meeting.when', 'meeting.link', 'meeting.minutes', 'meeting.hours',
];

export function validateTemplates(value) {
  const errors = [];
  if (!Array.isArray(value)) return ['templates must be a list'];
  const ids = new Set();
  value.forEach((t, i) => {
    const at = `template ${i + 1}`;
    if (!t || typeof t !== 'object') return errors.push(`${at}: not an object`);
    if (!KEY.test(String(t.id))) errors.push(`${at}: id must be lowercase letters, digits and hyphens`);
    if (ids.has(t.id)) errors.push(`${at}: duplicate template id "${t.id}"`);
    ids.add(t.id);
    if (!t.name) errors.push(`${at}: name is required`);
    if (!t.subject) errors.push(`${at}: subject is required`);
    if (!t.body) errors.push(`${at}: body is required`);
    if (t.fields !== undefined) {
      if (!Array.isArray(t.fields)) return errors.push(`${at}: fields must be a list`);
      t.fields.forEach((f, j) => {
        const fat = `${at}, field ${j + 1}`;
        if (!f || typeof f !== 'object') return errors.push(`${fat}: not an object`);
        if (!KEY.test(String(f.key))) errors.push(`${fat}: key must be a single word`);
        if (!f.label) errors.push(`${fat}: label is required`);
      });
    }
  });
  return errors;
}

export async function loadTemplates(store) {
  return (await store.settings.get('templates')) ?? seed;
}

export const findTemplate = (templates, id) => templates.find((t) => t.id === id);

export const placeholdersIn = (source) =>
  [...new Set([...String(source).matchAll(PLACEHOLDER)].map((m) => m[1]))];

const lookup = (context, path) =>
  path.split('.').reduce((o, k) => (o != null && typeof o === 'object' ? o[k] : undefined), context);

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function fill(source, context, prompted = {}, { escape = false } = {}) {
  const unresolved = [];
  const text = String(source).replace(PLACEHOLDER, (whole, name) => {
    let v = Object.hasOwn(prompted, name) ? prompted[name] : lookup(context, name);
    if (v == null || v === '') {
      if (!unresolved.includes(name)) unresolved.push(name);
      return `{{${name}}}`;
    }
    v = String(v);
    return escape ? escapeHtml(v) : v;
  });
  return { text, unresolved };
}

export function toHtml(markdown) {
  return marked.parse(markdown, { async: false, gfm: true, breaks: true });
}

export function render(template, context, prompted = {}) {
  const fields = template.fields ?? [];
  const values = Object.fromEntries(fields.map((f) => [f.key, prompted[f.key] ?? f.default ?? '']));
  // A field with default '' resolves to nothing rather than staying visible:
  // an optional note the admin left blank is not a mistake to flag.
  const optionalBlank = fields.filter((f) => !f.required && (values[f.key] ?? '') === '').map((f) => f.key);
  const strip = (r) => ({
    text: optionalBlank.reduce((t, k) => t.replace(new RegExp(`\\{\\{\\s*${k}\\s*\\}\\}`, 'g'), ''), r.text),
    unresolved: r.unresolved.filter((n) => !optionalBlank.includes(n)),
  });
  const subject = strip(fill(template.subject, context, values));
  const text = strip(fill(template.body, context, values));
  const htmlSource = strip(fill(template.body, context, values, { escape: true }));
  const missing = fields.filter((f) => f.required && (values[f.key] ?? '') === '').map((f) => f.key);
  return {
    subject: subject.text.replace(/\s+/g, ' ').trim(),
    text: text.text.replace(/\n{3,}/g, '\n\n').trim(),
    html: toHtml(htmlSource.text.replace(/\n{3,}/g, '\n\n').trim()),
    unresolved: [...new Set([...subject.unresolved, ...text.unresolved])],
    missing,
  };
}
