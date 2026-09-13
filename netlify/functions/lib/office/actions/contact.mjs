import { readForm, redirect, problem, field, checkCsrf, CSRF_REFUSED } from '../http.mjs';
import { store as defaultStore } from '../store.mjs';
import { ID } from '../ids.mjs';
import { validateContact, newContact, applyContactEdit, addNote, contactFields } from '../contacts.mjs';

// Errors go back to the form in the query string rather than as a 400 page,
// so the admin keeps what they typed and sees what to fix.
const back = (to, errors) => redirect(`${to}?error=${encodeURIComponent(errors.join('; '))}`);
const page = (id) => `/office/contacts/${id}/`;

export async function contact(request, ctx, s = defaultStore(), now = new Date()) {
  if (request.method !== 'POST') return problem(405, 'POST only');
  const data = await readForm(request);
  if (!data) return problem(400, 'expected a form');
  if (!checkCsrf(ctx, data)) return problem(403, CSRF_REFUSED);

  const op = field(data, 'op');

  if (op === 'create') {
    const fields = contactFields(data);
    const errors = validateContact(fields);
    if (errors.length) return back('/office/contacts/new/', errors);
    const created = newContact(fields, now);
    await s.contacts.put(created.id, created);
    return redirect(page(created.id));
  }

  const id = field(data, 'id');
  if (!ID.test(id)) return problem(400, 'bad id');
  const existing = await s.contacts.get(id);
  if (!existing) return problem(404, 'no such contact');

  if (op === 'edit') {
    const fields = contactFields(data);
    const errors = validateContact(fields);
    if (errors.length) return back(page(id), errors);
    await s.contacts.put(id, applyContactEdit(existing, fields, now));
    return redirect(page(id));
  }
  if (op === 'note') {
    const text = field(data, 'text');
    if (!text) return back(page(id), ['write the note first']);
    await s.contacts.put(id, addNote(existing, text, now));
    return redirect(page(id));
  }
  if (op === 'delete') {
    await s.contacts.remove(id);
    return redirect('/office/contacts/');
  }
  return problem(400, 'unknown op');
}
