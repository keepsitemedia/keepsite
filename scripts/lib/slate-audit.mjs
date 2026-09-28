// A slate band holds ink text only (spec §4): white, muted and rust all fail
// contrast on slate. This reads the built HTML for one page and names every
// class or anchor inside a band that would break that rule, checks the page
// has the number of bands the spec gives it, and flags a band that touches
// the alt band.
//
// What it cannot see: a color set by a page's own <style> on an element the
// band allows. That is a review item, not a gate. Sections on this site do
// not nest, so a band ends at the first </section> after it opens.
const SECTION = /<section\b([^>]*)>/g;
const classes = (attrs) => (attrs.match(/class="([^"]*)"/) || [, ''])[1].split(/\s+/);

export function slateViolations(html, expected) {
  const out = [];
  const sections = [...html.matchAll(SECTION)].map((m) => classes(m[1]));
  const slate = sections.map((c) => c.includes('section-slate'));
  const count = slate.filter(Boolean).length;
  if (expected === undefined) {
    if (count > 1) out.push(`${count} slate bands, expected at most 1`);
  } else if (count !== expected) {
    out.push(`${count} slate bands, expected ${expected}`);
  }
  slate.forEach((isSlate, i) => {
    if (!isSlate) return;
    for (const j of [i - 1, i + 1]) {
      if (sections[j] && sections[j].includes('section-alt')) out.push('a slate band sits next to a section-alt band');
    }
  });
  const bands = [...html.matchAll(/<section[^>]*class="[^"]*\bsection-slate\b[^"]*"[^>]*>([\s\S]*?)<\/section>/g)];
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
