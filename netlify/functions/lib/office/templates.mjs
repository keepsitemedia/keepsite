// Templates are data the admin edits in the office. Two kinds of placeholder:
// auto-filled from the client and the event, and prompted, which the send
// screen asks for. Anything unresolved stays as {{name}} so a half-filled
// email is seen before it is sent, never sent with a blank.
import { marked } from 'marked';
import seed from '../../../../src/data/office/templates.json' with { type: 'json' };

const KEY = /^[a-z][a-zA-Z0-9-]{0,31}$/;
const PLACEHOLDER = /\{\{\s*([a-zA-Z][a-zA-Z0-9_.-]*)\s*\}\}/g;

export const KNOWN_PLACEHOLDERS = [
  'client.name', 'client.firstName', 'client.business', 'client.email',
  'links.intro', 'links.brand', 'links.build', 'links.demo', 'links.sign',
  'site.brand', 'site.url', 'site.email', 'site.phone',
  'admin.email',
  'questionnaire.title', 'questionnaire.link',
  'meeting.title', 'meeting.when', 'meeting.link', 'meeting.minutes', 'meeting.hours',
  'agreement.name', 'agreement.sentAt', 'agreement.completedAt', 'agreement.hash', 'agreement.declineReason',
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
      const keys = new Set();
      t.fields.forEach((f, j) => {
        const fat = `${at}, field ${j + 1}`;
        if (!f || typeof f !== 'object') return errors.push(`${fat}: not an object`);
        if (!KEY.test(String(f.key))) errors.push(`${fat}: key must be a single word`);
        if (keys.has(f.key)) errors.push(`${at}: duplicate field key "${f.key}"`);
        keys.add(f.key);
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

// Substituted values come from clients and must never become Markdown: a
// business name like "[click me](javascript:...)" would otherwise become a
// live link once toHtml runs. Backslash first, so the escapes below are not
// doubled by the ones inserted for backslash itself. A bare "http(s)://" is
// also split with a zero-width space: marked's GFM literal-URL autolinking
// matches that scheme text on its own, outside of any [](...)  syntax, so
// backslash-escaping brackets alone does not stop a malformed value like
// "https://evil.test/x)" from still rendering as a live link. ">" is left
// alone: escaping it here would smuggle a backslash into toSafeHtml's later
// HTML-entity pass, and marked's own backslash handling would then decode
// and mangle it into "&amp;gt;" instead of a clean "&gt;". Plain ">" is not
// a Markdown control character mid-line (only "> " at the start of a line
// opens a blockquote), so leaving it for toSafeHtml to entity-escape is both
// correct and simpler.
// Whitespace runs fold to one space first: a newline inside a value would
// otherwise end the paragraph and let the rest of the value start a list or
// heading, which no inline escape can prevent.
const ZERO_WIDTH_SPACE = '\u200B';
const escapeMarkdown = (s) =>
  String(s)
    .replace(/\s+/g, ' ')
    .replace(/\\/g, '\\\\')
    .replace(/[`*_[\]()#!|~]/g, (c) => `\\${c}`)
    .replace(/(https?:)\/\//gi, `$1${ZERO_WIDTH_SPACE}//`);

// URL values (signing and payment links, mainly) are the one kind that must
// stay live: escapeMarkdown would corrupt an underscore in the path, which
// autolink services put there routinely. The strict pattern excludes
// whitespace, quotes and brackets so nothing in the value can close the
// autolink early or smuggle a second, attacker-chosen scheme into the href.
// The value is left bare (not markdown-autolink-wrapped) because toSafeHtml
// already HTML-escapes the "<"/">" that would otherwise wrap it, and marked's
// GFM autolinking turns a bare URL into a live link on its own.
const URL_ONLY = /^https?:\/\/[^\s<>"'()]+$/;

// For text the admin edited after render() filled it: the values that came
// from the client are escaped again wherever they still appear, so the HTML
// body gets the same protection as an automated send without the admin ever
// seeing a backslash in the textarea. Longest first, so a value that
// contains another is escaped whole. A value the admin reworded is not
// found and stays as typed, which is the admin's own Markdown.
export function escapeValues(text, values) {
  const risky = [...new Set(values.map((v) => (v == null ? '' : String(v))))]
    .filter((v) => v && !URL_ONLY.test(v) && escapeMarkdown(v) !== v)
    .sort((a, b) => b.length - a.length);
  return risky.reduce((t, v) => t.split(v).join(escapeMarkdown(v)), String(text));
}

export function fill(source, context, prompted = {}, { escape = false } = {}) {
  const unresolved = [];
  const text = String(source).replace(PLACEHOLDER, (_, name) => {
    let v = Object.hasOwn(prompted, name) ? prompted[name] : lookup(context, name);
    if (v == null || v === '') {
      if (!unresolved.includes(name)) unresolved.push(name);
      return `{{${name}}}`;
    }
    v = String(v);
    if (!escape) return v;
    return URL_ONLY.test(v) ? v : escapeMarkdown(v);
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
    html: toSafeHtml(htmlSource.text.replace(/\n{3,}/g, '\n\n').trim()),
    unresolved: [...new Set([...subject.unresolved, ...text.unresolved])],
    missing,
  };
}

// Templates the code sends on its own, without a stage naming them: the
// editor can change their words but never remove them.
export const PROTECTED_TEMPLATES = ['meeting-confirmation', 'meeting-reminder', 'meeting-cancelled', 'agreement-completed', 'agreement-declined', 'questionnaire-reminder'];

// A draft from the editor form becomes one template in the list. Fields are
// stored in the same shape the send screen reads; optional keys are dropped
// so a stored template looks like the seed, not like a form.
export function upsertTemplate(templates, draft) {
  const fields = (draft.fields ?? [])
    .filter((f) => String(f.key ?? '').trim() || String(f.label ?? '').trim())
    .map((f) => {
      const out = { key: String(f.key ?? '').trim(), label: String(f.label ?? '').trim() };
      if (f.required) out.required = true;
      else out.default = String(f.default ?? '');
      return out;
    });
  const next = { id: String(draft.id ?? '').trim(), name: String(draft.name ?? '').trim(), subject: String(draft.subject ?? '').trim(), body: String(draft.body ?? '').replace(/\r\n/g, '\n').trim() };
  if (fields.length) next.fields = fields;
  const i = templates.findIndex((t) => t.id === next.id);
  const list = i < 0 ? [...templates, next] : templates.map((t, j) => (j === i ? next : t));
  const errors = validateTemplates(list);
  const prompted = new Set(fields.map((f) => f.key));
  for (const name of placeholdersIn(`${next.subject}\n${next.body}`)) {
    if (!KNOWN_PLACEHOLDERS.includes(name) && !prompted.has(name)) {
      errors.push(`{{${name}}} is not a placeholder the office fills in, and there is no field with that key`);
    }
  }
  return { templates: list, errors };
}

export function removeTemplate(templates, id, pipelines) {
  const errors = [];
  if (!templates.some((t) => t.id === id)) return { templates, errors: [`no such template: ${id}`] };
  if (PROTECTED_TEMPLATES.includes(id)) errors.push(`the office sends it on its own, so "${id}" cannot be removed`);
  for (const p of pipelines) {
    for (const st of p.stages) {
      if (st.email === id) errors.push(`pipeline ${p.id}, stage ${st.id} sends "${id}"`);
    }
  }
  return { templates: errors.length ? templates : templates.filter((t) => t.id !== id), errors };
}
