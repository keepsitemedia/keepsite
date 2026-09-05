export const prerender = false;
import type { APIRoute } from 'astro';
import { store } from '../../../netlify/functions/lib/office/store.mjs';
import { findByToken, renderCurrent, TemplateGone, DOWNLOADABLE } from '../../../netlify/functions/lib/office/agreements.mjs';
import { TOKEN } from '../../../netlify/functions/lib/office/sign.mjs';

export const GET: APIRoute = async ({ url }) => {
  const t = url.searchParams.get('t') ?? '';
  if (!TOKEN.test(t)) return new Response('not found', { status: 404 });
  const s = store();
  const found = await findByToken(s, t);
  // A draft's client token exists before the agreement is sent, and a
  // declined, expired or voided one keeps working; the sign page offers no
  // download in any of those states, so the PDF must match.
  if (!found || !DOWNLOADABLE.includes(found.agreement.status)) return new Response('not found', { status: 404 });
  let bytes;
  try {
    bytes = await renderCurrent(found.agreement, s);
  } catch (e) {
    if (e instanceof TemplateGone) return new Response('template no longer exists', { status: 410 });
    throw e;
  }
  return new Response(bytes, {
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="agreement-${found.agreement.id}.pdf"`, 'Cache-Control': 'private, no-store' },
  });
};
