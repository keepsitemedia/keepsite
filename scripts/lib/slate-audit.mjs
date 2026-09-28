// A slate band holds ink text only (spec §4): white, muted and rust all fail
// contrast on slate. This reads the built HTML for one page and names every
// class or anchor inside a band that would break that rule, and complains if
// a page has more than one band.
export function slateViolations(html) {
  const out = [];
  const bands = [...html.matchAll(/<section[^>]*class="[^"]*\bsection-slate\b[^"]*"[^>]*>([\s\S]*?)<\/section>/g)];
  if (bands.length > 1) out.push(`${bands.length} slate bands, expected at most 1`);
  for (const [, inner] of bands) {
    for (const m of inner.matchAll(/class="([^"]*)"/g)) {
      for (const cls of ['muted', 'serif', 'link-arrow']) {
        if (new RegExp(`\\b${cls}\\b`).test(m[1])) out.push(`.${cls} inside a slate band`);
      }
    }
    for (const m of inner.matchAll(/<a\b([^>]*)>/g)) {
      if (!/class="[^"]*\b(btn|slate-link)\b/.test(m[1])) out.push(`unstyled link inside a slate band: <a${m[1]}>`);
    }
  }
  return out;
}
