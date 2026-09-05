export const prerender = false;
import type { APIRoute } from 'astro';
import { store, SLUG, DOC_NAME } from '../../../../../../netlify/functions/lib/office/store.mjs';
import { disposition, contentType } from '../../../../../../netlify/functions/lib/office/documents.mjs';

export const GET: APIRoute = async ({ params }) => {
  const slug = params.slug ?? '';
  const name = params.name ?? '';
  if (!SLUG.test(slug) || !DOC_NAME.test(name)) return new Response('not found', { status: 404 });
  // Not cast to Uint8Array: TS's dom lib types Response's body as
  // ArrayBufferView<ArrayBuffer>, which an explicit Uint8Array (generic
  // over ArrayBufferLike) fails to satisfy under astro check.
  const bytes = await store().questionnaires.file(slug, name);
  if (!bytes) return new Response('not found', { status: 404 });
  const type = contentType(name);
  return new Response(bytes, {
    headers: { 'Content-Type': type, 'Content-Disposition': disposition(type, name), 'Cache-Control': 'private, no-store' },
  });
};
