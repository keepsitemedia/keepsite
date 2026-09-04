import { redirect, problem } from '../http.mjs';
import { logout as identityLogout } from '../session.mjs';

// No CSRF check: the worst a forged logout does is log the admin out.
export async function logout(request, _ctx, fetchFn = fetch) {
  if (request.method !== 'POST') return problem(405, 'POST only');
  const res = redirect('/office/login/');
  for (const c of await identityLogout(request, fetchFn)) res.headers.append('Set-Cookie', c);
  return res;
}
