export const prerender = false;
import type { APIRoute } from 'astro';
import { actions } from '../../../../netlify/functions/lib/office/actions.mjs';

export const ALL: APIRoute = async ({ params, request, locals }) => {
  // actions is a plain object from a .mjs import, so TS sees its literal
  // shape rather than a string index signature.
  const handler = (actions as Record<string, any>)[params.action ?? ''];
  if (!handler) return new Response('no such action', { status: 404 });
  return handler(request, { admin: locals.admin, csrf: locals.csrf });
};
