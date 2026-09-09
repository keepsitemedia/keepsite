export const prerender = false;
import type { APIRoute } from 'astro';
import { actions } from '../../../../netlify/functions/lib/office/actions.mjs';

type Handler = (
  request: Request,
  ctx: { admin: { email: string } | null; csrf: string },
) => Promise<Response>;

export const ALL: APIRoute = async ({ params, request, locals }) => {
  // actions is a plain object from a .mjs import, so TS sees its literal
  // shape (including the __proto__: null used to make it a bare map)
  // rather than a string index signature; this keeps the call typed.
  const handler = (actions as unknown as Record<string, Handler>)[params.action ?? ''];
  if (!handler) return new Response('no such action', { status: 404 });
  return handler(request, { admin: locals.admin, csrf: locals.csrf });
};
