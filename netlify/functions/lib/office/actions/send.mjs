import { readForm, redirect, problem, field, checkCsrf, CSRF_REFUSED } from '../http.mjs';
import { store as defaultStore, SLUG } from '../store.mjs';
import { loadTemplates, findTemplate, placeholdersIn, toSafeHtml } from '../templates.mjs';
import { sendMail } from '../mail.mjs';

const FORM = /^[a-z]+$/;

// The screen already filled the placeholders; the action's job is to refuse
// an email that still has one, then send exactly the text the admin saw.
export async function send(request, ctx, s = defaultStore(), fetchFn = fetch, now = new Date()) {
  if (request.method !== 'POST') return problem(405, 'POST only');
  const data = await readForm(request);
  if (!data) return problem(400, 'expected a form');
  if (!checkCsrf(ctx, data)) return problem(403, CSRF_REFUSED);

  const slug = field(data, 'slug');
  if (!SLUG.test(slug)) return problem(400, 'bad slug');
  const client = await s.clients.get(slug);
  if (!client) return problem(404, 'no such client');
  const templateId = field(data, 'template');
  const template = findTemplate(await loadTemplates(s), templateId);
  if (!template) return problem(400, 'unknown template');

  const form = field(data, 'form');
  const back = (message) =>
    redirect(`/office/send/${slug}/${templateId}/?${form && FORM.test(form) ? `form=${form}&` : ''}error=${encodeURIComponent(message)}`);

  const subject = field(data, 'subject');
  const body = String(data.get('body') ?? '').trim();
  if (!subject) return back('subject is empty');
  if (!body) return back('body is empty');
  const leftover = placeholdersIn(`${subject}\n${body}`);
  // An optional field left blank renders as {{key}} on the send screen (so
  // the inline script has something to substitute); the admin isn't asked
  // to fill it in, so strip it here rather than refuse. Anything else left
  // over is a field the admin skipped and must go back and fill in.
  const optional = new Set((template.fields ?? []).filter((f) => !f.required).map((f) => f.key));
  const stray = leftover.filter((k) => !optional.has(k));
  if (stray.length) return back(`fill in: ${stray.join(', ')}`);
  const stripOptional = (v) =>
    leftover
      .filter((k) => optional.has(k))
      .reduce((t, k) => t.replace(new RegExp(`\\{\\{\\s*${k}\\s*\\}\\}`, 'g'), ''), v)
      // A textarea posted as multipart/form-data comes back CRLF, not LF.
      .replace(/(?:\r\n|\r|\n){3,}/g, '\n\n')
      .trim();
  const cleanSubject = stripOptional(subject);
  const cleanBody = stripOptional(body);

  const result = await sendMail(
    { slug, to: client.email, subject: cleanSubject, text: cleanBody, html: toSafeHtml(cleanBody), template: templateId, kind: 'template' },
    s, fetchFn, now,
  );
  return redirect(
    result.ok
      ? `/office/clients/${slug}/?tab=emails&sent=1`
      : `/office/clients/${slug}/?tab=emails&error=${encodeURIComponent(result.error ?? 'send failed')}`,
  );
}
