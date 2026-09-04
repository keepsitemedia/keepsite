// Netlify runs this on the hour. Everything it does is in reminders.mjs,
// which is what the tests cover; this file only exists to be scheduled.
import { runMeetingReminders } from './lib/office/reminders.mjs';

export default async () => {
  try {
    const result = await runMeetingReminders();
    return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('meeting reminders failed', e);
    return new Response('failed', { status: 500 });
  }
};

export const config = { schedule: '@hourly' };
