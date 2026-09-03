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
// conservative charset becomes "-". Leading dots go last, so "..", "../" and
// "...foo" cannot survive as a traversal segment or a dotfile.
export function safeName(name) {
  const base = String(name ?? '')
    .split(/[\\/]/)
    .pop()
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^[.-]+/, '')
    .slice(0, MAX);
  return base || 'upload';
}

export const fileKey = (slug, key, name) => `${slug}/${key}-${safeName(name)}`;
