import { addDays, addMonths } from './dates.mjs';

const byTime = (a, b) => {
  if (a.time === b.time) return 0;
  if (a.time === null) return -1;
  if (b.time === null) return 1;
  return a.time < b.time ? -1 : 1;
};

const byDue = (a, b) => (a.due === b.due ? byTime(a, b) : a.due < b.due ? -1 : 1);
const asTask = (t, late) => ({ ...t, kind: 'task', time: t.time ?? null, late });

// With `today` given, an open task that is past due follows the owner: it
// shows on today, flagged `late`, ahead of today's own items, and no longer
// on the day it was due. Done tasks and meetings stay where they happened.
// Without `today` the day shows exactly what is dated to it.
export function itemsForDay(tasks, meetings, ymd, today) {
  const moved = (t) => today && !t.done && t.due < today;
  const late = today && ymd === today ? tasks.filter(moved).sort(byDue).map((t) => asTask(t, true)) : [];
  const items = [
    ...tasks.filter((t) => t.due === ymd && !moved(t)).map((t) => asTask(t, false)),
    ...meetings.filter((m) => m.ymd === ymd).map((m) => ({ ...m, kind: 'meeting', time: m.time ?? null })),
  ];
  return [...late, ...items.sort(byTime)];
}

// The days the month grid dots: every meeting, every open task on its due
// day, and today whenever an open task is late, since that is where it shows.
export function markedDays(tasks, meetings, today) {
  const marked = new Set(meetings.map((m) => m.ymd));
  for (const t of tasks) {
    if (t.done) continue;
    marked.add(t.due < today ? today : t.due);
  }
  return marked;
}

const pad = (n) => String(n).padStart(2, '0');
const ymdOf = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
const daysIn = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();

export function monthGrid(ymd, marked, today) {
  const [y, m] = ymd.split('-').map(Number);
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
  return { label, prev: addMonths(ymd, -1), next: addMonths(ymd, 1), weeks };
}

export function dueBucket(task, today) {
  if (task.done) return 'done';
  if (task.due < today) return 'overdue';
  if (task.due === today) return 'today';
  if (task.due <= addDays(today, 3)) return 'soon';
  return 'later';
}
