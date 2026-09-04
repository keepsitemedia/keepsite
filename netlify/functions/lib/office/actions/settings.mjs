import { readForm, redirect, problem, field, checkCsrf } from '../http.mjs';
import { store as defaultStore } from '../store.mjs';
import { validatePipelines } from '../pipeline.mjs';

// One validator per setting name. Phase 2 adds templates here.
const VALIDATORS = { __proto__: null, pipelines: validatePipelines };

const back = (errors) => redirect(`/office/settings/?error=${encodeURIComponent(errors.join('; '))}`);

export async function settings(request, ctx, s = defaultStore()) {
  if (request.method !== 'POST') return problem(405, 'POST only');
  const data = await readForm(request);
  if (!data) return problem(400, 'expected a form');
  if (!checkCsrf(ctx, data)) return problem(403, 'stale form, reload and try again');

  const name = field(data, 'name');
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
