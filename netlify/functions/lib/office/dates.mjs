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

// The offset of `tz` at `date`, by formatting the instant in that zone and
// reading the wall clock back. Intl has no direct offset API.
function offsetMs(date, tz) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(date);
  const get = (t) => Number(parts.find((p) => p.type === t).value);
  const wall = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return wall - date.getTime();
}

// A Mountain wall time to an instant. Guess as if UTC, then correct by the
// zone's offset at that guess; DST boundaries are the only hour this is
// approximate, and no meeting is booked at 2 a.m.
export function toInstant(ymd, hhmm, tz = TZ) {
  const [y, m, d] = parts(ymd);
  const [hh, mm] = hhmm.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  return new Date(guess - offsetMs(new Date(guess), tz));
}

export const formatWhen = (ymd, hhmm) => `${formatYmd(ymd)} at ${formatTime(hhmm)} Mountain`;

export function formatHours(ms) {
  const minutes = Math.round(ms / 60e3);
  if (minutes < 60) return `${minutes} minutes`;
  const hours = Math.round(minutes / 60);
  return `about ${hours} hour${hours === 1 ? '' : 's'}`;
}
