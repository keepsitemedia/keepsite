import { addDays } from './dates.mjs';

const byTime = (a, b) => {
  if (a.time === b.time) return 0;
  if (a.time === null) return -1;
  if (b.time === null) return 1;
  return a.time < b.time ? -1 : 1;
};

export function itemsForDay(tasks, meetings, ymd) {
  const items = [
    ...tasks.filter((t) => t.due === ymd).map((t) => ({ ...t, kind: 'task', time: t.time ?? null })),
    ...meetings.filter((m) => m.ymd === ymd).map((m) => ({ ...m, kind: 'meeting', time: m.time ?? null })),
  ];
  return items.sort(byTime);
}

const pad = (n) => String(n).padStart(2, '0');
const ymdOf = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
const daysIn = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();

// Same day of month in the neighbouring month, clamped to its last day, so
// paging from the 31st never skips a month.
function shiftMonth(y, m, d, delta) {
  let ny = y;
  let nm = m + delta;
  if (nm < 1) { nm = 12; ny -= 1; }
  if (nm > 12) { nm = 1; ny += 1; }
  return ymdOf(ny, nm, Math.min(d, daysIn(ny, nm)));
}

export function monthGrid(ymd, marked, today) {
  const [y, m, d] = ymd.split('-').map(Number);
  const first = ymdOf(y, m, 1);
  const startOffset = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const total = daysIn(y, m);
  const cells = [];
  for (let i = -startOffset; cells.length < Math.ceil((startOffset + total) / 7) * 7; i += 1) {
    const cell = addDays(first, i);
    cells.push({
      ymd: cell,
      day: Number(cell.slice(8)),
      inMonth: cell.slice(0, 7) === ymd.slice(0, 7),
      marked: marked.has(cell),
      today: cell === today,
    });
  }
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  const label = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'long', year: 'numeric' })
    .format(new Date(Date.UTC(y, m - 1, 1)));
  return { label, prev: shiftMonth(y, m, d, -1), next: shiftMonth(y, m, d, 1), weeks };
}

export function dueBucket(task, today) {
  if (task.done) return 'done';
  if (task.due < today) return 'overdue';
  if (task.due === today) return 'today';
  if (task.due <= addDays(today, 3)) return 'soon';
  return 'later';
}
