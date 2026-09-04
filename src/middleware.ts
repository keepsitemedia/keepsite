import { defineMiddleware } from 'astro:middleware';
import { requireAdmin } from '../netlify/functions/lib/office/session.mjs';
import { isOffice, isPublic, decide, applyHeaders } from '../netlify/functions/lib/office/guard.mjs';

// decide() can also return 'skip' and 'public', but the isOffice/isPublic
// checks below already rule those out before decide() is ever called; this
// narrower type is what TS's own inference from the .mjs source cannot
// express at this call site.
type PrivateDecision =
  | { kind: 'refuse'; status: 401 }
  | { kind: 'refuse'; status: 302; location: string }
  | { kind: 'pass'; admin: { email: string } | null; csrf: string };

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;
  context.locals.admin = null;
  context.locals.csrf = '';

  if (!isOffice(pathname)) return next();
  if (isPublic(pathname)) return applyHeaders(await next());

  // requireAdmin talks to Identity, so it only runs for the office paths
  // that need it; skip and public both return above without calling it.
  const auth = await requireAdmin(context.request);
  const decision = decide(pathname, auth) as PrivateDecision;

  if (decision.kind === 'refuse') {
    const res =
      decision.status === 401
        ? new Response('sign in first', { status: 401 })
        : context.redirect(decision.location, 302);
    for (const c of auth.cookies) res.headers.append('Set-Cookie', c);
    return applyHeaders(res);
  }

  // decision.kind === 'pass'
  context.locals.admin = decision.admin;
  context.locals.csrf = decision.csrf;
  const res = applyHeaders(await next());
  for (const c of auth.cookies) res.headers.append('Set-Cookie', c);
  return res;
});
