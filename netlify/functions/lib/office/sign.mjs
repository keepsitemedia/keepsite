// The two anonymous posts behind the signing page. A token is the only
// credential; there is no session and no CSRF cookie, so both handlers
// answer only to a valid token and refuse everything else.
import { readForm, redirect, problem, field } from './http.mjs';
import { store as defaultStore } from './store.mjs';
import { signAgreement, declineAgreement } from './agreements.mjs';

const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const clientIp = (request) => request.headers.get('x-nf-client-connection-ip') ?? request.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? null;
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
    ip: clientIp(request), userAgent: request.headers.get('user-agent') ?? null,
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
