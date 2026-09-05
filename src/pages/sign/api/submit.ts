export const prerender = false;
import type { APIRoute } from 'astro';
import { submit } from '../../../../netlify/functions/lib/office/sign.mjs';
export const POST: APIRoute = ({ request }) => submit(request);
