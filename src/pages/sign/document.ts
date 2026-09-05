export const prerender = false;
import type { APIRoute } from 'astro';
import { store } from '../../../netlify/functions/lib/office/store.mjs';
import { findByToken, renderCurrent, TemplateGone } from '../../../netlify/functions/lib/office/agreements.mjs';

export const GET: APIRoute = async ({ url }) => {
  const s = store();
  const found = await findByToken(s, url.searchParams.get('t') ?? '');
  if (!found) return new Response('not found', { status: 404 });
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
