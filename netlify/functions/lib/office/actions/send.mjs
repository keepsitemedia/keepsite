import { readForm, redirect, problem, field, checkCsrf, CSRF_REFUSED } from '../http.mjs';
import { store as defaultStore, SLUG } from '../store.mjs';
import { loadTemplates, findTemplate, placeholdersIn, toHtml } from '../templates.mjs';
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
  if (leftover.length) return back(`fill in: ${leftover.join(', ')}`);

  const result = await sendMail(
    { slug, to: client.email, subject, text: body, html: toHtml(body), template: templateId, kind: 'template' },
    s, fetchFn, now,
  );
  return redirect(
    result.ok
      ? `/office/clients/${slug}/?tab=emails&sent=1`
      : `/office/clients/${slug}/?tab=emails&error=${encodeURIComponent(result.error ?? 'send failed')}`,
  );
}
