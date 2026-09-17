export const prerender = false;
import type { APIRoute } from 'astro';
import { store, SLUG } from '../../../../../netlify/functions/lib/office/store.mjs';
import { renderResearchReport, reportName } from '../../../../../netlify/functions/lib/office/research-report.mjs';
import { migrateStudy, openRound } from '../../../../../netlify/functions/lib/office/research.mjs';

export const GET: APIRoute = async ({ params }) => {
  const slug = params.slug ?? '';
  if (!SLUG.test(slug)) return new Response('not found', { status: 404 });
  const s = store();
  const client = await s.clients.get(slug);
  const found = await s.research.get(slug);
  const study = found && migrateStudy(found);
  if (!client || !study) return new Response('not found', { status: 404 });
  const round = openRound(study);
  const now = new Date();
  const bytes = await renderResearchReport({ client, round, renderedAt: now });
  // The same cast the documents route avoids by not typing its bytes: TS's
  // dom lib wants ArrayBufferView<ArrayBuffer>, and pdf-lib returns the generic.
  return new Response(bytes as unknown as BodyInit, {
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${reportName(now, round)}"`, 'Cache-Control': 'private, no-store' },
  });
};
