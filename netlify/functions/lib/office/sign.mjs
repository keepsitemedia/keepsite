// The two anonymous posts behind the signing page. A token is the only
// credential; there is no session and no CSRF cookie, so both handlers
// answer only to a valid token and refuse everything else.
import { readForm, redirect, problem, field } from './http.mjs';
import { store as defaultStore, TOKEN } from './store.mjs';
import { signAgreement, declineAgreement } from './agreements.mjs';

export { TOKEN };

const first = (v) => (v ? String(v).split(',')[0].trim() : '');
// Both go into the sealed certificate verbatim (agreements.mjs's audit
// entries, then pdf.mjs), and the request is otherwise unauthenticated, so
// an attacker who controls these headers must not be able to inflate the
// certificate: bound them the same way declineAgreement bounds the reason.
export const clientIp = (request) =>
  (first(request.headers.get('x-nf-client-connection-ip')) || first(request.headers.get('x-forwarded-for'))).slice(0, 45) || null;
export const userAgentOf = (request) => (request.headers.get('user-agent') ?? '').slice(0, 300) || null;

const back = (t, error) => redirect(`/sign/?t=${encodeURIComponent(t)}${error ? `&error=${encodeURIComponent(error)}` : ''}`);

async function parse(request) {
  if (request.method !== 'POST') return { res: problem(405, 'POST only') };
  const data = await readForm(request);
  if (!data) return { res: problem(400, 'expected a form') };
  const t = field(data, 't');
  if (!TOKEN.test(t)) return { res: problem(404, 'not found') };
  return { data, t };
}

export async function submit(request, s = defaultStore(), fetchFn = fetch, now = new Date()) {
  const { res, data, t } = await parse(request);
  if (res) return res;
  const r = await signAgreement({
    token: t,
    signatureDataUrl: String(data.get('signature') ?? ''),
    consentTerms: field(data, 'consentTerms') === 'on',
    consentEsign: field(data, 'consentEsign') === 'on',
    ip: clientIp(request), userAgent: userAgentOf(request),
  }, s, fetchFn, now);
  if (!r.ok && r.error === 'this signing link is not valid') return problem(404, 'not found');
  return r.ok ? back(t) : back(t, r.error);
}

export async function decline(request, s = defaultStore(), fetchFn = fetch, now = new Date()) {
  const { res, data, t } = await parse(request);
  if (res) return res;
  const r = await declineAgreement({ token: t, reason: field(data, 'reason'), ip: clientIp(request) }, s, fetchFn, now);
  if (!r.ok && r.error === 'this signing link is not valid') return problem(404, 'not found');
  return r.ok ? back(t) : back(t, r.error);
}
