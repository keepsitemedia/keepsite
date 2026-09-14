export const prerender = false;
import type { APIRoute } from 'astro';
import { store, SLUG } from '../../../../../netlify/functions/lib/office/store.mjs';
import { renderResearchReport, reportName } from '../../../../../netlify/functions/lib/office/research-report.mjs';

export const GET: APIRoute = async ({ params }) => {
  const slug = params.slug ?? '';
  if (!SLUG.test(slug)) return new Response('not found', { status: 404 });
  const s = store();
  const client = await s.clients.get(slug);
  const study = await s.research.get(slug);
  if (!client || !study) return new Response('not found', { status: 404 });
  const now = new Date();
  const bytes = await renderResearchReport({ client, study, renderedAt: now });
  // The same cast the documents route avoids by not typing its bytes: TS's
  // dom lib wants ArrayBufferView<ArrayBuffer>, and pdf-lib returns the generic.
  return new Response(bytes as unknown as BodyInit, {
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${reportName(now)}"`, 'Cache-Control': 'private, no-store' },
  });
};
