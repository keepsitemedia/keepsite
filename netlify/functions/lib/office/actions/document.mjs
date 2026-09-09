import { readForm, redirect, problem, field, checkCsrf, CSRF_REFUSED } from '../http.mjs';
import { store as defaultStore, SLUG, DOC_NAME } from '../store.mjs';
import { safeName } from '../../blob-key.mjs';
import { validateUpload, contentType } from '../documents.mjs';

export async function document(request, ctx, s = defaultStore(), now = new Date()) {
  if (request.method !== 'POST') return problem(405, 'POST only');
  const data = await readForm(request);
  if (!data) return problem(400, 'expected a form');
  if (!checkCsrf(ctx, data)) return problem(403, CSRF_REFUSED);

  const slug = field(data, 'slug');
  if (!SLUG.test(slug)) return problem(400, 'bad slug');
  if (!(await s.clients.get(slug))) return problem(404, 'no such client');
  const op = field(data, 'op');
  if (!['upload', 'remove'].includes(op)) return problem(400, 'unknown op');

  const tab = `/office/clients/${slug}/?tab=documents`;
  const back = (message) => redirect(`${tab}&error=${encodeURIComponent(message)}`);

  if (op === 'upload') {
    const file = data.get('file');
    const invalid = validateUpload(file);
    if (invalid) return back(invalid);
    const name = safeName(file.name);
    // The store throws on a name it will not hold, which would leave the admin
    // with a 500 instead of a message; and ".meta.json" is the sidecar's own
    // suffix, so a write under it would clobber another document's metadata.
    if (!DOC_NAME.test(name) || name.endsWith('.meta.json')) return back('that name cannot be used');
    // Sealed PDFs and signature images share the namespace; an upload must
    // never be able to replace the evidence they hold.
    const existing = await s.documents.meta(slug, name);
    if (existing && existing.source !== 'upload') return back('that name belongs to a sealed or signed document');
    const bytes = new Uint8Array(await file.arrayBuffer());
    // The byte route serves the stored type back verbatim, and file.type is
    // whatever the browser (or a crafted request) claimed; the extension is
    // the only thing the office can vouch for.
    await s.documents.put(slug, name, bytes, { type: contentType(name), source: 'upload', uploadedBy: ctx.admin?.email ?? null }, now);
    return redirect(tab);
  }

  const name = field(data, 'name');
  // DOC_NAME rejects names a browser could never have produced (e.g. one
  // starting with '.'); store.meta throws on those rather than returning
  // null, so the lookup is wrapped instead of pre-validating the name here.
  let meta;
  try { meta = await s.documents.meta(slug, name); } catch { return back('no such document'); }
  if (!meta) return back('no such document');
  if (meta.source !== 'upload') return back('only uploads can be removed');
  await s.documents.remove(slug, name);
  return redirect(tab);
}
