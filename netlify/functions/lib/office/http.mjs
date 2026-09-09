// Shared shape for every office action: a form in, a redirect or a plain-text
// problem out. 303 rather than 302 so a browser always follows with GET and
// a refresh on the landing page never re-posts.
import { verifyCsrf } from './session.mjs';

export async function readForm(request) {
  let data;
  try { data = await request.formData(); } catch { return null; }
  // No office form posts a multi-value field, and a duplicated name is how a
  // hidden input silently overrides the button the admin clicked: refuse
  // rather than guess which value was meant.
  for (const name of new Set(data.keys())) {
    if (data.getAll(name).length > 1) return null;
  }
  return data;
}

export const field = (data, name) => {
  const v = data.get(name);
  return typeof v === 'string' ? v.trim() : '';
};

export const redirect = (to) => new Response(null, { status: 303, headers: { Location: to } });

export const problem = (status, text) =>
  new Response(text, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });

// A bad token and an unset secret produce the same false from checkCsrf, and
// only one of them is fixable by reloading; say so rather than sending the
// admin in a reload loop that can never succeed.
export const CSRF_REFUSED =
  'form token did not match; if reloading does not fix it, KEEPSITE_SESSION_SECRET is not set on the server';

export const checkCsrf = (ctx, data) =>
  verifyCsrf(process.env.KEEPSITE_SESSION_SECRET, ctx?.csrf ?? '', field(data, 'csrf'));

// Open redirects are the one thing a login `next` can do wrong. Only an
// office page path, and never the api prefix, which would land on a 405.
export function safeNext(value) {
  const s = String(value ?? '');
  const ok = s.startsWith('/office/') && !s.startsWith('/office/api/') && !/[\\]|\/\//.test(s);
  return ok ? s : '/office/';
}
