// One listing for everything a client has on file: sealed agreements and
// signature images (office store), admin uploads (office store), and the
// files a client attached to a questionnaire (questionnaires store). The
// two stores stay separate because the questionnaire function writes the
// second one without knowing the office exists.
// Under the 6 MB Netlify function body limit, not equal to it: a request at
// the transport limit never reaches this code, so the message below would
// never be seen.
export const UPLOAD_MAX = 4 * 1024 * 1024;

import { DOC_NAME } from './store.mjs';
import { FORMS } from '../intake.mjs';

// The questionnaire store keeps each form's answers as {form}.json beside the
// files the client attached; the listing hides those envelopes, so the route
// that streams an attachment has to refuse them by the same rule. Only the
// three envelopes, by whole name: an upload the client named x.json is theirs.
const ENVELOPES = new Set(FORMS.map((form) => `${form}.json`));
export const isIntakeFile = (name) => {
  const s = String(name);
  return DOC_NAME.test(s) && !ENVELOPES.has(s) && !s.endsWith('.meta.json');
};

const TYPES = {
  __proto__: null,
  pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
  svg: 'image/svg+xml', txt: 'text/plain', csv: 'text/csv', json: 'application/json', md: 'text/markdown',
  doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  zip: 'application/zip',
};
export const contentType = (name) => TYPES[String(name).toLowerCase().split('.').pop()] ?? 'application/octet-stream';

// Inline only for types a browser renders without running anything; SVG can
// carry script, so it downloads like everything else.
const INLINE = new Set(['application/pdf', 'image/png', 'image/jpeg', 'image/gif', 'image/webp']);
export const disposition = (type, name) => `${INLINE.has(type) ? 'inline' : 'attachment'}; filename="${name}"`;

export function formatSize(bytes) {
  if (bytes == null) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function validateUpload(file) {
  if (!(file instanceof File) || !file.size) return 'choose a file';
  if (file.size > UPLOAD_MAX) return 'file is larger than 4 MB';
  return null;
}

export async function listDocuments(slug, s) {
  // A sidecar the store could not read comes back null, and one written by an
  // older shape may have no name; either would render as a dead row.
  const own = (await s.documents.list(slug)).filter((m) => m && typeof m.name === 'string').map((m) => ({
    name: m.name, size: m.size ?? null, type: m.type, source: m.source, uploadedAt: m.uploadedAt ?? null,
    href: `/office/documents/${slug}/${m.name}`, removable: m.source === 'upload',
  }));
  const intake = (await s.questionnaires.files(slug)).map((k) => k.slice(slug.length + 1)).map((name) => ({
    name, size: null, type: contentType(name), source: 'questionnaire', uploadedAt: null,
    href: `/office/documents/${slug}/intake/${name}`, removable: false,
  }));
  return [...own, ...intake].sort((a, b) => {
    if (a.uploadedAt && b.uploadedAt) return b.uploadedAt.localeCompare(a.uploadedAt) || a.name.localeCompare(b.name);
    if (a.uploadedAt || b.uploadedAt) return a.uploadedAt ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}
