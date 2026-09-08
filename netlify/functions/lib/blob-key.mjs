// Builds the Blobs key an uploaded file is stored under.
//
// `slug` is charset-checked by the caller and `key` comes from a fixed set,
// but the filename is whatever the client's browser sent. The client prefix is
// the only boundary between one client's uploads and another's, so a name
// beginning "../../" must not be able to walk out of it. A valid token is
// needed to get this far, which caps the blast radius at one client reaching
// another's namespace — that is still the boundary the whole design rests on.

const MAX = 80;

// Path separators drop the directory part, then anything outside a
// conservative charset becomes "-". Leading punctuation goes last, so "..",
// "../" and "...foo" cannot survive as a traversal segment or a dotfile, and
// what is left starts with the alphanumeric the office store's own name
// check requires — "_final.pdf" would otherwise be stored under a name the
// store refuses to read back.
//
// The stem and the extension are handled apart: the extension is what the
// office derives a content type from, so it has to survive a stem that
// empties (a name in another script collapses to "-") or one cut to length.
export function safeName(name) {
  const base = String(name ?? '').split(/[\\/]/).pop();
  const dot = base.lastIndexOf('.');
  const ext = dot > 0 ? base.slice(dot + 1).replace(/[^A-Za-z0-9]+/g, '').slice(0, 16) : '';
  const stem = (dot > 0 ? base.slice(0, dot) : base)
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^[._-]+/, '') || 'upload';
  const tail = ext ? `.${ext}` : '';
  return stem.slice(0, MAX - tail.length) + tail;
}

export const fileKey = (slug, key, name) => `${slug}/${key}-${safeName(name)}`;
