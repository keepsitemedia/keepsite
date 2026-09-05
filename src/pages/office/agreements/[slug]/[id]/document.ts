export const prerender = false;
import type { APIRoute } from 'astro';
import { store, SLUG } from '../../../../../../netlify/functions/lib/office/store.mjs';
import { ID } from '../../../../../../netlify/functions/lib/office/ids.mjs';
import { renderCurrent, TemplateGone } from '../../../../../../netlify/functions/lib/office/agreements.mjs';

export const GET: APIRoute = async ({ params }) => {
  const slug = params.slug ?? '';
  const id = params.id ?? '';
  if (!SLUG.test(slug) || !ID.test(id)) return new Response('not found', { status: 404 });
  const s = store();
  const a = await s.agreements.get(slug, id);
  if (!a) return new Response('not found', { status: 404 });
  let bytes;
  try {
    bytes = await renderCurrent(a, s);
  } catch (e) {
    if (e instanceof TemplateGone) return new Response('template no longer exists', { status: 410 });
    throw e;
  }
  return new Response(bytes, {
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="agreement-${id}.pdf"`, 'Cache-Control': 'private, no-store' },
  });
};
