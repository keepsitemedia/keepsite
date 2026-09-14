import { readForm, redirect, problem, field, checkCsrf, CSRF_REFUSED } from '../http.mjs';
import { store as defaultStore, SLUG } from '../store.mjs';
import {
  PAGE_TYPES, READS, SAME, emptyStudy, touch, newKeywordId, normalizeQuery, splitList, draftFromQuestionnaire,
  validateCapture, findCaptureTargets, applyCapture,
} from '../research.mjs';
import { renderResearchReport, reportName } from '../research-report.mjs';

const KEYWORD_ID = /^k[a-z0-9]{8}$/;
const tab = (slug, extra = '') => `/office/clients/${slug}/?tab=research${extra}`;
const back = (slug, message) => redirect(tab(slug, `&error=${encodeURIComponent(message)}`));
const CAPTURE = '/office/research/capture/';

export async function research(request, ctx, s = defaultStore(), now = new Date()) {
  if (request.method !== 'POST') return problem(405, 'POST only');
  const data = await readForm(request);
  if (!data) return problem(400, 'expected a form');
  if (!checkCsrf(ctx, data)) return problem(403, CSRF_REFUSED);
  const op = field(data, 'op');

  // Capture arrives from the bookmarklet's tab, which knows no client yet.
  if (op === 'capture') return capture(data, s, now);

  const slug = field(data, 'slug');
  if (!SLUG.test(slug)) return problem(400, 'bad slug');
  const client = await s.clients.get(slug);
  if (!client) return problem(404, 'no such client');
  const study = (await s.research.get(slug)) ?? emptyStudy(slug, now);
  const save = async (next, extra = '') => { await s.research.put(slug, touch(next, now)); return redirect(tab(slug, extra)); };
  const text = (name) => field(data, name).trim();

  if (op === 'draft') {
    const drafted = draftFromQuestionnaire(await s.questionnaires.get(slug, 'build'));
    if (!drafted.keywords.length && !drafted.areas.length) return back(slug, 'no build questionnaire on file yet, so nothing to draft from');
    const have = new Set(study.keywords.map((k) => normalizeQuery(k.text)));
    const keywords = drafted.keywords.filter((k) => !have.has(normalizeQuery(k.text)));
    return save({ ...study, keywords: [...study.keywords, ...keywords], areas: study.areas.length ? study.areas : drafted.areas });
  }
  if (op === 'add' || op === 'edit') {
    const kw = text('text');
    if (!kw) return back(slug, 'the keyword is empty');
    const id = op === 'add' ? newKeywordId() : field(data, 'id');
    if (study.keywords.some((k) => k.id !== id && normalizeQuery(k.text) === normalizeQuery(kw))) return back(slug, `"${kw}" is already in the list`);
    const row = { id, text: kw, cluster: text('cluster') || 'General', arm: text('arm'), source: op === 'add' ? 'manual' : undefined };
    if (op === 'add') return save({ ...study, keywords: [...study.keywords, row] });
    const i = study.keywords.findIndex((k) => k.id === id);
    if (i < 0) return back(slug, 'no such keyword');
    const keywords = study.keywords.map((k, j) => (j === i ? { ...k, text: row.text, cluster: row.cluster, arm: row.arm } : k));
    return save({ ...study, keywords });
  }
  if (op === 'remove') {
    const id = field(data, 'id');
    const serps = { ...study.serps }; delete serps[id];
    const reads = Object.fromEntries(Object.entries(study.reads).filter(([k]) => !k.split('|').includes(id)));
    const pages = study.pages.map((p) => ({ ...p, keywords: p.keywords.filter((k) => k !== id) })).filter((p) => p.keywords.length);
    return save({ ...study, keywords: study.keywords.filter((k) => k.id !== id), serps, reads, pages });
  }
  if (op === 'areas') return save({ ...study, areas: splitList(data.get('areas')) });
  if (op === 'read') {
    const key = field(data, 'key');
    const [a, b] = key.split('|');
    if (!a || !b || !study.keywords.some((k) => k.id === a) || !study.keywords.some((k) => k.id === b)) return back(slug, 'no such pair');
    const human = field(data, 'human'); const sameCluster = field(data, 'sameCluster');
    if (!READS.includes(human) || !SAME.includes(sameCluster)) return back(slug, 'pick a read from the list');
    return save({ ...study, reads: { ...study.reads, [key]: { human, sameCluster, notes: text('notes') } } });
  }
  if (op === 'page') {
    const id = field(data, 'id');
    const type = field(data, 'type');
    if (!PAGE_TYPES.includes(type) && type !== 'Tie / review') return back(slug, 'pick a page type');
    const keywords = field(data, 'keywords').split(',').map((x) => x.trim()).filter((x) => study.keywords.some((k) => k.id === x));
    if (!keywords.length) return back(slug, 'a page needs at least one keyword');
    const title = text('title');
    if (!title) return back(slug, 'the page needs a title');
    const row = { id, title, type, keywords, note: text('note'), auto: false };
    // Claiming a keyword takes it away from any other edited row.
    const others = study.pages.filter((p) => p.id !== id && p.auto === false).map((p) => ({ ...p, keywords: p.keywords.filter((k) => !keywords.includes(k)) })).filter((p) => p.keywords.length);
    return save({ ...study, pages: [...others, row] });
  }
  if (op === 'reset') {
    const id = field(data, 'id');
    return save({ ...study, pages: study.pages.filter((p) => p.id !== id) });
  }
  if (op === 'type') {
    const keyword = field(data, 'keyword'); const rank = Number(field(data, 'rank')); const pageType = field(data, 'pageType');
    const serp = study.serps[keyword];
    if (!serp || !serp.results.some((r) => r.rank === rank)) return back(slug, 'no such result');
    if (!PAGE_TYPES.includes(pageType)) return back(slug, 'pick a page type');
    const results = serp.results.map((r) => (r.rank === rank ? { ...r, pageType, typeSource: 'manual' } : r));
    return save({ ...study, serps: { ...study.serps, [keyword]: { ...serp, results } } });
  }
  if (op === 'report') {
    const bytes = await renderResearchReport({ client, study, renderedAt: now });
    const name = reportName(now);
    await s.documents.put(slug, name, new Uint8Array(bytes), { type: 'application/pdf', source: 'research', createdBy: ctx.admin?.email ?? null }, now);
    await s.research.put(slug, { ...study, reportedAt: now.toISOString() });
    return redirect(`/office/clients/${slug}/?tab=documents`);
  }
  return problem(400, 'unknown op');
}

async function capture(data, s, now) {
  const payload = String(data.get('payload') ?? '');
  const { value, errors } = validateCapture(payload);
  if (errors.length) return redirect(`${CAPTURE}?error=${encodeURIComponent(errors.join('; '))}`);
  const slug = field(data, 'slug');
  const keyword = field(data, 'keyword');
  let target;
  if (slug || keyword) {
    if (!SLUG.test(slug) || !KEYWORD_ID.test(keyword)) return redirect(`${CAPTURE}?error=${encodeURIComponent('pick a client and a keyword')}`);
    target = { slug, keywordId: keyword };
  } else {
    const matches = findCaptureTargets(await s.research.listAll(), value.q);
    if (matches.length !== 1) return redirect(`${CAPTURE}?pick=1`);
    [target] = matches;
  }
  const study = await s.research.get(target.slug);
  if (!study || !study.keywords.some((k) => k.id === target.keywordId)) return redirect(`${CAPTURE}?error=${encodeURIComponent('that keyword is gone')}`);
  await s.research.put(target.slug, applyCapture(study, target.keywordId, value, now));
  return redirect(tab(target.slug, `&captured=${target.keywordId}`));
}
