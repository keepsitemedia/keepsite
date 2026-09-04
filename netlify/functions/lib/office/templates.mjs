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

// Substituted values come from clients and must never become Markdown: a
// business name like "[click me](javascript:...)" would otherwise become a
// live link once toHtml runs. Backslash first, so the escapes below are not
// doubled by the ones inserted for backslash itself. A bare "http(s)://" is
// also split with a zero-width space: marked's GFM literal-URL autolinking
// matches that scheme text on its own, outside of any [](...)  syntax, so
// backslash-escaping brackets alone does not stop a malformed value like
// "https://evil.test/x)" from still rendering as a live link.
const ZERO_WIDTH_SPACE = '\u200B';
const escapeMarkdown = (s) =>
  String(s)
    .replace(/\\/g, '\\\\')
    .replace(/[`*_[\]()#>!|~]/g, (c) => `\\${c}`)
    .replace(/(https?:)\/\//gi, `$1${ZERO_WIDTH_SPACE}//`);

// URL values (signing and payment links, mainly) are the one kind that must
// stay live: escapeMarkdown would corrupt an underscore in the path, which
// autolink services put there routinely. The strict pattern excludes
// whitespace, quotes and brackets so nothing in the value can close the
// autolink early or smuggle a second, attacker-chosen scheme into the href.
const URL_ONLY = /^https?:\/\/[^\s<>"'()]+$/;

export function fill(source, context, prompted = {}, { escape = false } = {}) {
  const unresolved = [];
  const text = String(source).replace(PLACEHOLDER, (whole, name) => {
    let v = Object.hasOwn(prompted, name) ? prompted[name] : lookup(context, name);
    if (v == null || v === '') {
      if (!unresolved.includes(name)) unresolved.push(name);
      return `{{${name}}}`;
    }
    v = String(v);
    if (!escape) return v;
    return URL_ONLY.test(v) ? `<${v}>` : escapeMarkdown(escapeHtml(v));
  });
  return { text, unresolved };
}

export function toHtml(markdown) {
  return marked.parse(markdown, { async: false, gfm: true, breaks: true });
}

// marked does not sanitize, and this body mixes admin-authored Markdown with
// client-controlled values (a business name, a personal note): escaping &,
// <, > first turns an attempted raw tag into inert text before marked ever
// parses it, and stripping any surviving href/src that isn't http(s) or
// mailto closes the other opening — a markdown [text](javascript:...) link,
// or (rarer) an autolink marked builds out of what was escaped attribute
// text. Unwrapping rather than just dropping the attribute matters for that
// last case: a bare <a> with no href is still "<a" in the output.
const ATTR_VALUE = /\s(?:href|src)="([^"]*)"/i;
const SAFE_SCHEME = /^(?:https?:\/\/|mailto:)[^\s<>"']*$/i;
const decodeEntities = (s) =>
  s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const hasSafeAttr = (openTag) => {
  const m = ATTR_VALUE.exec(openTag);
  return Boolean(m && SAFE_SCHEME.test(decodeEntities(m[1])));
};

export function toSafeHtml(markdown) {
  const escaped = String(markdown).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
  return toHtml(escaped)
    .replace(/<a\b[^>]*>([\s\S]*?)<\/a>/gi, (whole, inner) => (hasSafeAttr(whole) ? whole : inner))
    .replace(/<img\b[^>]*>/gi, (whole) => (hasSafeAttr(whole) ? whole : ''));
}

export function render(template, context, prompted = {}, { keepPrompted = false } = {}) {
  const fields = template.fields ?? [];
  const values = Object.fromEntries(fields.map((f) => [f.key, prompted[f.key] ?? f.default ?? '']));
  // A field with default '' resolves to nothing rather than staying visible:
  // an optional note the admin left blank is not a mistake to flag. The
  // send screen passes keepPrompted so its inline script still has {{key}}
  // in the subject and body to substitute as the admin fills in the field;
  // the html preview isn't user-facing text the admin edits, so it keeps
  // stripping either way.
  const optionalBlank = fields.filter((f) => !f.required && (values[f.key] ?? '') === '').map((f) => f.key);
  const strip = (r) => ({
    text: optionalBlank.reduce((t, k) => t.replace(new RegExp(`\\{\\{\\s*${k}\\s*\\}\\}`, 'g'), ''), r.text),
    unresolved: r.unresolved.filter((n) => !optionalBlank.includes(n)),
  });
  const stripText = keepPrompted ? (r) => r : strip;
  const subject = stripText(fill(template.subject, context, values));
  const text = stripText(fill(template.body, context, values));
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
