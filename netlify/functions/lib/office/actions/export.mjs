import { problem } from '../http.mjs';
import { store as defaultStore, TYPES } from '../store.mjs';
import { toCsv } from '../csv.mjs';
import { todayIn } from '../dates.mjs';

const FORMATS = {
  __proto__: null,
  json: { type: 'application/json', body: (rows) => JSON.stringify(rows, null, 2) },
  csv: { type: 'text/csv; charset=utf-8', body: toCsv },
};

// A GET behind the guard; nothing is written, so no CSRF token is needed.
export async function exportData(request, _ctx, s = defaultStore(), now = new Date()) {
  if (request.method !== 'GET') return problem(405, 'GET only');
  const url = new URL(request.url);
  const type = url.searchParams.get('type') ?? '';
  const format = FORMATS[url.searchParams.get('format') ?? ''];
  if (!format || !(type === 'clients' || TYPES.includes(type))) return problem(400, 'unknown type or format');
  const rows = type === 'clients' ? await s.clients.list() : await s[type].listAll();
  const name = `${type}-${todayIn(undefined, now)}.${url.searchParams.get('format')}`;
  return new Response(format.body(rows), {
    status: 200,
    headers: {
      'Content-Type': format.type,
      'Content-Disposition': `attachment; filename="${name}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
