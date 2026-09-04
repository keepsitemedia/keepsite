// Day-granular dates are plain YYYY-MM-DD strings: they compare with <, they
// survive JSON, and they carry no zone to get wrong. The only place a zone
// matters is deciding what "today" is, and that is always Mountain time.
export const TZ = 'America/Denver';

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export function todayIn(tz = TZ, now = new Date()) {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
}

const parts = (ymd) => ymd.split('-').map(Number);

export function addDays(ymd, n) {
  const [y, m, d] = parts(ymd);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export function isYmd(s) {
  if (typeof s !== 'string' || !YMD.test(s)) return false;
  const [y, m, d] = parts(s);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

export const isHhmm = (s) => typeof s === 'string' && HHMM.test(s);

export function formatYmd(ymd) {
  const [y, m, d] = parts(ymd);
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric',
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

export function formatTime(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const suffix = h < 12 ? 'am' : 'pm';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, '0')} ${suffix}`;
}
