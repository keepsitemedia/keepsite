export const prerender = false;
import type { APIRoute } from 'astro';
import { store, SLUG, DOC_NAME } from '../../../../../netlify/functions/lib/office/store.mjs';
import { disposition } from '../../../../../netlify/functions/lib/office/documents.mjs';

export const GET: APIRoute = async ({ params }) => {
  const slug = params.slug ?? '';
  const name = params.name ?? '';
  if (!SLUG.test(slug) || !DOC_NAME.test(name) || name.endsWith('.meta.json')) return new Response('not found', { status: 404 });
  const s = store();
  const meta = (await s.documents.meta(slug, name)) as { type: string } | null;
  // Not cast to Uint8Array: TS's dom lib types Response's body as
  // ArrayBufferView<ArrayBuffer>, which an explicit Uint8Array (generic
  // over ArrayBufferLike) fails to satisfy under astro check.
  const bytes = meta ? await s.documents.get(slug, name) : null;
  if (!meta || !bytes) return new Response('not found', { status: 404 });
  return new Response(bytes, {
    headers: { 'Content-Type': meta.type, 'Content-Disposition': disposition(meta.type, name), 'Cache-Control': 'private, no-store' },
  });
};
