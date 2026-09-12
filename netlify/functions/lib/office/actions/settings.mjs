import { readForm, redirect, problem, field, checkCsrf, CSRF_REFUSED } from '../http.mjs';
import { store as defaultStore } from '../store.mjs';
import { validatePipelines, loadPipelines } from '../pipeline.mjs';
import { validateTemplates, loadTemplates, upsertTemplate, removeTemplate } from '../templates.mjs';

// One validator per JSON setting name. Templates are also edited one at a
// time through the `template` form below, which is the everyday path.
const VALIDATORS = { __proto__: null, pipelines: validatePipelines, templates: validateTemplates };

const back = (errors, id = "") => redirect(`/office/settings/?error=${encodeURIComponent(errors.join("; "))}${id ? `&template=${encodeURIComponent(id)}#template-${encodeURIComponent(id)}` : ""}`);

// The editor posts fields as field_key_0, field_label_0 and so on, one
// numbered set per row, with a blank row at the end for adding one.
function fieldsFrom(data) {
  const out = [];
  for (let i = 0; data.has(`field_key_${i}`) || data.has(`field_label_${i}`); i += 1) {
    out.push({ key: field(data, `field_key_${i}`), label: field(data, `field_label_${i}`), required: data.get(`field_required_${i}`) === 'on', default: field(data, `field_default_${i}`) });
  }
  return out;
}

export async function settings(request, ctx, s = defaultStore()) {
  if (request.method !== 'POST') return problem(405, 'POST only');
  const data = await readForm(request);
  if (!data) return problem(400, 'expected a form');
  if (!checkCsrf(ctx, data)) return problem(403, CSRF_REFUSED);

  const name = field(data, 'name');

  if (name === 'template') {
    const op = field(data, 'op');
    const id = field(data, 'id');
    const templates = await loadTemplates(s);
    if (op === 'save') {
      const draft = { id, name: field(data, 'templateName'), subject: field(data, 'subject'), body: String(data.get('body') ?? ''), fields: fieldsFrom(data) };
      const out = upsertTemplate(templates, draft);
      if (out.errors.length) return back(out.errors, id || 'new');
      await s.settings.put('templates', out.templates);
      return redirect(`/office/settings/?saved=${encodeURIComponent(id)}#template-${id}`);
    }
    if (op === 'delete') {
      const out = removeTemplate(templates, id, await loadPipelines(s));
      if (out.errors.length) return back(out.errors, id);
      await s.settings.put('templates', out.templates);
      return redirect('/office/settings/?saved=1');
    }
    return problem(400, 'unknown op');
  }

  const validate = VALIDATORS[name];
  if (!validate) return problem(400, 'unknown setting');

  let value;
  try {
    value = JSON.parse(field(data, 'value'));
  } catch (e) {
    return back([`not valid JSON: ${e.message}`]);
  }
  const errors = validate(value);
  if (errors.length) return back(errors);
  await s.settings.put(name, value);
  return redirect('/office/settings/?saved=1');
}
