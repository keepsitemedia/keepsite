// Netlify calls this after every verified form submission on the site. Only
// the inquiry form matters; anything else is acknowledged and ignored. It
// must return 200 whatever happens, or Netlify retries and the log fills.
import { recordInquiry } from './lib/office/inquiry.mjs';

export const handler = async (event) => {
  try {
    const { payload } = JSON.parse(event.body ?? '{}');
    if (payload?.form_name === 'inquiry') await recordInquiry(payload.data ?? {});
  } catch (e) {
    console.error('inquiry hook failed', e);
  }
  return { statusCode: 200, body: '' };
};
