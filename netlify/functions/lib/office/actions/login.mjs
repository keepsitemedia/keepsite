import { readForm, redirect, problem, field, safeNext } from '../http.mjs';
import { login as identityLogin, identityUrl } from '../session.mjs';

// The third argument exists for tests; production always uses global fetch.
export async function login(request, _ctx, fetchFn = fetch) {
  if (request.method !== 'POST') return problem(405, 'POST only');
  const data = await readForm(request);
  if (!data) return problem(400, 'expected a form');
  const next = safeNext(field(data, 'next'));
  const cookies = await identityLogin(identityUrl(request), field(data, 'email'), field(data, 'password'), fetchFn);
  if (!cookies) return redirect(`/office/login/?error=1&next=${encodeURIComponent(next)}`);
  const res = redirect(next);
  for (const c of cookies) res.headers.append('Set-Cookie', c);
  return res;
}
