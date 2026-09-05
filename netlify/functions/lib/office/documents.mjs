// One listing for everything a client has on file: sealed agreements and
// signature images (office store), admin uploads (office store), and the
// files a client attached to a questionnaire (questionnaires store). The
// two stores stay separate because the questionnaire function writes the
// second one without knowing the office exists.
export const UPLOAD_MAX = 6 * 1024 * 1024;

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
  if (!file || typeof file === 'string' || !file.size) return 'choose a file';
  if (file.size > UPLOAD_MAX) return 'file is larger than 6 MB';
  return null;
}

export async function listDocuments(slug, s) {
  const own = (await s.documents.list(slug)).map((m) => ({
    name: m.name, size: m.size ?? null, type: m.type, source: m.source, uploadedAt: m.uploadedAt ?? null,
    href: `/office/documents/${slug}/${m.name}`, removable: m.source === 'upload',
  }));
  const intake = (await s.questionnaires.files(slug)).map((k) => k.slice(slug.length + 1)).map((name) => ({
    name, size: null, type: contentType(name), source: 'questionnaire', uploadedAt: null,
    href: `/office/documents/${slug}/intake/${name}`, removable: false,
  }));
  return [...own, ...intake].sort((a, b) => {
    if (a.uploadedAt && b.uploadedAt) return b.uploadedAt.localeCompare(a.uploadedAt);
    if (a.uploadedAt || b.uploadedAt) return a.uploadedAt ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}
