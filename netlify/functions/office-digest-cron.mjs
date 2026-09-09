// 13:00 UTC is 7 a.m. Mountain during daylight time and 6 a.m. in winter.
// Netlify schedules run in UTC; the digest prints its local generation time
// so the drift is visible, and the hour is adjusted by hand twice a year.
import { runDigest } from './lib/office/digest.mjs';

export default async () => {
  try {
    const result = await runDigest();
    return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('digest failed', e);
    return new Response('failed', { status: 500 });
  }
};

export const config = { schedule: '0 13 * * *' };
