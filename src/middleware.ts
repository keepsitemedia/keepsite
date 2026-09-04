import { defineMiddleware } from 'astro:middleware';
import { requireAdmin } from '../netlify/functions/lib/office/session.mjs';

const OFFICE = /^\/office(\/|$)/;
const PUBLIC = new Set(['/office/login/', '/office/api/login']);

// netlify.toml headers reach static files only, so every rendered office
// response carries its own. The CSP is the "/*" policy from netlify.toml,
// verbatim; keep the two in step.
const HEADERS: Record<string, string> = {
  'X-Robots-Tag': 'noindex, nofollow',
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Content-Security-Policy':
    "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; font-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'self'; object-src 'none'; upgrade-insecure-requests",
};

const withHeaders = (res: Response) => {
  for (const [k, v] of Object.entries(HEADERS)) res.headers.set(k, v);
  return res;
};

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;
  context.locals.admin = null;
  context.locals.csrf = '';
  if (!OFFICE.test(pathname)) return next();
  if (PUBLIC.has(pathname)) return withHeaders(await next());

  const auth = await requireAdmin(context.request);
  if (!auth.ok) {
    const res = pathname.startsWith('/office/api/')
      ? new Response('sign in first', { status: 401 })
      : context.redirect(`/office/login/?next=${encodeURIComponent(pathname)}`, 302);
    for (const c of auth.cookies) res.headers.append('Set-Cookie', c);
    return withHeaders(res);
  }
  // requireAdmin's return type doesn't narrow user to non-optional across the
  // ok check from a plain .mjs import; ok is already true here.
  context.locals.admin = auth.user ?? null;
  context.locals.csrf = auth.csrf;
  const res = withHeaders(await next());
  for (const c of auth.cookies) res.headers.append('Set-Cookie', c);
  return res;
});
