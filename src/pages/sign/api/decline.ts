export const prerender = false;
import type { APIRoute } from 'astro';
import { decline } from '../../../../netlify/functions/lib/office/sign.mjs';
export const POST: APIRoute = ({ request }) => decline(request);
