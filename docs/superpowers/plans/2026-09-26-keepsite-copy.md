# keepsite-copy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a third Keepsite skill, `keepsite-copy`, that turns a Stage Two site (lorem copy, outlined image regions) into a first-pass Stage Three draft with real copy, real photographs, and a review deck for the owner.

**Architecture:** Deterministic work — parsing the sources file, the voice file and pasted Google reviews, building a photo manifest, placing photos, and scanning a site's `src/data` for lorem and image slots — lives in dependency-free modules in `keepsite-skills/lib/`, driven by one CLI, `lib/copy-cli.mjs`. Judgment work — the voice guide, photo choice, the copy itself — is instructions in `skills/keepsite-copy/`. The Astro template's `ImageArea` learns to render a real photograph, and the template's `verify.mjs` gains a Stage Three mode switched on by `src/data/copy-status.json`.

**Tech Stack:** Node 20 ESM (`.mjs`), `node:test`, Astro 5 (`astro:assets`), ImageMagick 6 (`identify`, `convert`), instaloader 4.15.

**Spec:** `keepsite/docs/superpowers/specs/2026-09-26-keepsite-copy-design.md` — read it, including **Amendments made during planning** at the end, which override the body where they differ.

## Global Constraints

- All code is in `/mnt/c/Users/Snic9/keepsitemedia/keepsite-skills/` on `main`. Run `npm test` from there; it must stay green after every task (107 pass, 1 skip at the start).
- `lib/` is dependency-free Node: `node:` built-ins only, no npm packages. ImageMagick and instaloader are system tools called with `execFileSync`.
- Never edit `~/.claude/skills/` directly; `npm run install-skills` copies from this repo.
- `templates/astro/scripts/verify.mjs` ships into client repos and runs on Netlify without `lib/`; anything it needs from `lib/` is duplicated there with a "Duplicated from lib/…" comment.
- Comments explain why, never what. Match the surrounding files' comment density.
- Commit subjects: imperative, under 50 characters. Every commit ends with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- Client files come from Windows (`/mnt/c`); every text parser accepts CRLF and a UTF-8 BOM.
- Never ask for, take, or store an Instagram password. The session file in `~/.config/instaloader/` is the only credential.
- No invented facts, no composed testimonials (spec, "Copy").

## Review Focus

1. **A Stage Two site must still pass the gate.** No `copy-status.json` means every Stage Three check is skipped — tested in Task 7.
2. **CRLF and BOM input.** `Voice.txt` for the first client is CRLF — tested in Tasks 1, 2, 3.
3. **Instagram shortcodes contain underscores** (`DdmKwqxFj_K`), so a carousel's `_1` suffix is ambiguous without the `~` delimiter — tested in Task 4, confirmed against a real download in Task 8.
4. **A review body line that looks like a header** (`2 reviews`, `6 months ago`) must not split a review; a block needs name, count and date lines in sequence — tested in Task 3.
5. **Unreadable or exotic images** (HEIC, a corrupt file, a stray `.txt` in a Drive folder) must produce a manifest warning, not a crash — tested in Task 4.

---

## File Structure

| File | Responsibility |
|---|---|
| `lib/text.mjs` | Shared line splitting (BOM, CRLF) and blank-line trimming |
| `lib/voice-file.mjs` | Voice file → `{ posts: [{ url, caption }], warnings }` |
| `lib/copy-sources.mjs` | `copy-sources.md` → validated sources object; missing-file check |
| `lib/reviews.mjs` | Pasted Google reviews → review objects; quotable text |
| `lib/photo-manifest.mjs` | `intake/photos/**` → manifest entries with size, caption, credit |
| `lib/place-photo.mjs` | Copy one photo into the site, oriented, capped, JPEG |
| `lib/slots.mjs` | Walk `src/data` for lorem copy slots and image slots; compare with `copy-status.json` |
| `lib/lorem.mjs` | (modify) export `WORDS` and `isLorem` |
| `lib/copy-cli.mjs` | `check`, `instagram`, `manifest`, `reviews`, `slots`, `place` subcommands |
| `templates/astro/src/components/ImageArea.astro` | (modify) render a photo when `src` is set |
| `templates/astro/scripts/verify.mjs` | (modify) Stage Three checks and warnings |
| `skills/keepsite-copy/SKILL.md` + `references/*.md` + `templates/*.md` | The skill |
| `skills/keepsite-build/references/productionize.md` | (modify) spread image objects into `ImageArea` |
| `fixtures/copy/` | End-to-end fixture client |

---

### Task 1: Text helpers and the voice file parser

**Files:**
- Create: `lib/text.mjs`, `lib/voice-file.mjs`
- Test: `lib/voice-file.test.mjs`

**Interfaces:**
- Produces: `lines(text: string): string[]` (BOM stripped, split on `\r?\n`, each line `trimEnd`ed); `trimBlank(lines: string[]): string[]` (leading and trailing blank lines removed); `parseVoiceFile(text: string): { posts: {url: string, caption: string}[], warnings: string[] }`.

- [ ] **Step 1: Write the failing test**

`lib/voice-file.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseVoiceFile } from './voice-file.mjs';

test('each URL line starts a post and the lines under it are its caption', () => {
  const { posts, warnings } = parseVoiceFile(
    'https://www.instagram.com/p/AAA/\nFirst line.\n\nSecond paragraph.\nhttps://www.instagram.com/p/BBB/\nOther post.\n',
  );
  assert.deepEqual(posts, [
    { url: 'https://www.instagram.com/p/AAA/', caption: 'First line.\n\nSecond paragraph.' },
    { url: 'https://www.instagram.com/p/BBB/', caption: 'Other post.' },
  ]);
  assert.deepEqual(warnings, []);
});

test('CRLF and a BOM parse the same as LF', () => {
  const { posts } = parseVoiceFile('﻿https://www.instagram.com/p/AAA/\r\nHello 🤍\r\n\r\n#tag\r\n');
  assert.deepEqual(posts, [{ url: 'https://www.instagram.com/p/AAA/', caption: 'Hello 🤍\n\n#tag' }]);
});

test('a labelled link line is ignored with a warning, not taken as caption', () => {
  const { posts, warnings } = parseVoiceFile(
    'https://www.instagram.com/p/AAA/\nCaption.\nProfile: https://www.instagram.com/p/CCC/?img_index=1\nhttps://www.instagram.com/p/CCC/\nMore.',
  );
  assert.equal(posts[0].caption, 'Caption.');
  assert.equal(posts.length, 2);
  assert.match(warnings[0], /line 3.*Profile/);
});

test('text before the first URL is ignored with a warning', () => {
  const { posts, warnings } = parseVoiceFile('Notes to self\nhttps://www.instagram.com/p/AAA/\nCaption.');
  assert.equal(posts.length, 1);
  assert.match(warnings[0], /line 1/);
});

test('a post with no caption is dropped with a warning', () => {
  const { posts, warnings } = parseVoiceFile('https://www.instagram.com/p/AAA/\n\nhttps://www.instagram.com/p/BBB/\nText.');
  assert.deepEqual(posts.map((p) => p.url), ['https://www.instagram.com/p/BBB/']);
  assert.match(warnings[0], /AAA.*no caption/);
});

test('a repeated URL keeps the first caption and warns', () => {
  const { posts, warnings } = parseVoiceFile('https://x.test/p/1/\nOne.\nhttps://x.test/p/1/\nTwo.');
  assert.deepEqual(posts, [{ url: 'https://x.test/p/1/', caption: 'One.' }]);
  assert.match(warnings[0], /repeated/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test lib/voice-file.test.mjs`
Expected: FAIL, `Cannot find module './voice-file.mjs'`.

- [ ] **Step 3: Write the implementation**

`lib/text.mjs`:

```js
// Client files arrive from Windows via /mnt/c, so CRLF and a BOM are normal
// input rather than edge cases.
export const lines = (text) => text.replace(/^﻿/, '').split(/\r?\n/).map((l) => l.trimEnd());

export function trimBlank(ls) {
  let start = 0;
  let end = ls.length;
  while (start < end && !ls[start].trim()) start += 1;
  while (end > start && !ls[end - 1].trim()) end -= 1;
  return ls.slice(start, end);
}
```

`lib/voice-file.mjs`:

```js
// The owner's curated sample of the client's writing: a post URL on its own
// line, then that post's caption exactly as posted. Captions are kept verbatim,
// emoji and hashtags included, because the voice guide is about how she
// actually writes, and the site register is decided later, not here.
import { lines, trimBlank } from './text.mjs';

const URL_LINE = /^https?:\/\/\S+$/;
// "Profile: https://…" and the like: a note to the owner, not caption text.
const LABELLED_LINK = /^[A-Za-z][A-Za-z ]*:\s*https?:\/\//;

export function parseVoiceFile(text) {
  const warnings = [];
  const blocks = [];
  let current = null;

  lines(text).forEach((line, i) => {
    const bare = line.trim();
    if (URL_LINE.test(bare)) {
      current = { url: bare, body: [] };
      blocks.push(current);
    } else if (LABELLED_LINK.test(bare)) {
      warnings.push(`line ${i + 1}: ignored "${bare.slice(0, 60)}"`);
    } else if (!current) {
      if (bare) warnings.push(`line ${i + 1}: text before the first post URL ignored`);
    } else {
      current.body.push(line);
    }
  });

  const seen = new Set();
  const posts = [];
  for (const { url, body } of blocks) {
    const caption = trimBlank(body).join('\n');
    if (seen.has(url)) {
      warnings.push(`${url} repeated; kept the first caption`);
      continue;
    }
    seen.add(url);
    if (!caption) {
      warnings.push(`${url} has no caption`);
      continue;
    }
    posts.push({ url, caption });
  }
  return { posts, warnings };
}
```

- [ ] **Step 4: Run tests**

Run: `node --test lib/voice-file.test.mjs && npm test 2>&1 | grep -E "^# (pass|fail)"`
Expected: all voice-file tests pass; `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add lib/text.mjs lib/voice-file.mjs lib/voice-file.test.mjs
git commit -m "Parse a client's voice file" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Copy sources parser

**Files:**
- Create: `lib/copy-sources.mjs`
- Test: `lib/copy-sources.test.mjs`

**Interfaces:**
- Consumes: `lines` from `lib/text.mjs`.
- Produces: `parseCopySources(text) → { voice: string|null, brandGuide: string|null, instagram: string|null, photos: {kind: 'instagram'|'drive'|'dropbox'|'local', value: string}[], reviews: string[], errors: string[], warnings: string[] }`; `missingFiles(sources, root: string) → string[]` (paths relative to `root` that do not exist).

- [ ] **Step 1: Write the failing test**

`lib/copy-sources.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseCopySources, missingFiles } from './copy-sources.mjs';

const FULL = `# Copy sources

Voice: Voice.txt
Brand guide: intake/BrandGuide.pdf
Instagram: @makeupbybrynlie
Photos: instagram
Photos: https://www.dropbox.com/scl/fo/abc/xyz?dl=0
Photos: https://drive.google.com/drive/folders/123
Photos: photos/wedding-2026
Reviews: https://share.google/85VLOPpkhyaCuFCqH
`;

test('a full sources file parses every field', () => {
  const s = parseCopySources(FULL);
  assert.equal(s.voice, 'Voice.txt');
  assert.equal(s.brandGuide, 'intake/BrandGuide.pdf');
  assert.equal(s.instagram, 'makeupbybrynlie');
  assert.deepEqual(s.photos.map((p) => p.kind), ['instagram', 'dropbox', 'drive', 'local']);
  assert.deepEqual(s.reviews, ['https://share.google/85VLOPpkhyaCuFCqH']);
  assert.deepEqual(s.errors, []);
});

test('field names are case-insensitive and CRLF is fine', () => {
  const s = parseCopySources('VOICE: v.txt\r\nphotos: instagram\r\ninstagram: someone\r\n');
  assert.equal(s.voice, 'v.txt');
  assert.deepEqual(s.errors, []);
});

test('an Instagram profile URL reduces to the handle', () => {
  const s = parseCopySources('Voice: v.txt\nPhotos: instagram\nInstagram: https://www.instagram.com/makeupbybrynlie/');
  assert.equal(s.instagram, 'makeupbybrynlie');
});

test('voice and photos are required', () => {
  assert.deepEqual(parseCopySources('Brand guide: g.pdf').errors, ['Voice is required', 'Photos is required']);
});

test('instagram photos without a handle is an error', () => {
  assert.match(parseCopySources('Voice: v.txt\nPhotos: instagram').errors[0], /handle/);
});

test('an unrecognised photo link is an error, not a local path', () => {
  assert.match(parseCopySources('Voice: v.txt\nPhotos: https://example.com/album').errors[0], /unrecognised/);
});

test('unknown fields and stray lines warn', () => {
  const s = parseCopySources('Voice: v.txt\nPhotos: p\nColour: red\njust a note');
  assert.equal(s.warnings.length, 2);
});

test('missingFiles lists voice, brand guide and local photo folders that do not exist', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ks-sources-'));
  fs.writeFileSync(path.join(root, 'Voice.txt'), 'x');
  const s = parseCopySources('Voice: Voice.txt\nBrand guide: intake/g.pdf\nPhotos: pics\nPhotos: instagram\nInstagram: a');
  assert.deepEqual(missingFiles(s, root), ['intake/g.pdf', 'pics']);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test lib/copy-sources.test.mjs`
Expected: FAIL, module not found.

- [ ] **Step 3: Write the implementation**

`lib/copy-sources.mjs`:

```js
// One file per client naming every Stage Three source, so nothing depends on
// where a line happens to sit inside another file (the first client's
// Voice.txt carried its "profile" link mid-file, pointing at a post).
import fs from 'node:fs';
import path from 'node:path';
import { lines } from './text.mjs';

export function classifyPhotoSource(value) {
  if (value.toLowerCase() === 'instagram') return { kind: 'instagram', value };
  if (/^https?:\/\/drive\.google\.com\//.test(value)) return { kind: 'drive', value };
  if (/^https?:\/\/(www\.)?dropbox\.com\//.test(value)) return { kind: 'dropbox', value };
  if (/^https?:\/\//.test(value)) return { kind: 'unknown', value };
  return { kind: 'local', value };
}

const handle = (value) =>
  value.replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//, '').replace(/[/?#].*$/, '');

export function parseCopySources(text) {
  const out = { voice: null, brandGuide: null, instagram: null, photos: [], reviews: [], errors: [], warnings: [] };

  lines(text).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith('#')) return;
    const m = line.match(/^([A-Za-z][A-Za-z ]*?)\s*:\s*(.+)$/);
    if (!m || /^https?$/i.test(m[1])) {
      out.warnings.push(`line ${i + 1}: not a "Field: value" line`);
      return;
    }
    const [, key, value] = m;
    switch (key.toLowerCase()) {
      case 'voice': out.voice = value; break;
      case 'brand guide': out.brandGuide = value; break;
      case 'instagram': out.instagram = handle(value); break;
      case 'photos': out.photos.push(classifyPhotoSource(value)); break;
      case 'reviews': out.reviews.push(value); break;
      default: out.warnings.push(`line ${i + 1}: unknown field "${key}"`);
    }
  });

  if (!out.voice) out.errors.push('Voice is required');
  if (!out.photos.length) out.errors.push('Photos is required');
  for (const p of out.photos.filter((p) => p.kind === 'unknown')) {
    out.errors.push(`Photos: unrecognised link ${p.value} (Google Drive, Dropbox, "instagram", or a local folder)`);
  }
  if (out.photos.some((p) => p.kind === 'instagram') && !out.instagram) {
    out.errors.push('Photos: instagram needs an Instagram handle');
  }
  return out;
}

export function missingFiles(sources, root) {
  const paths = [sources.voice, sources.brandGuide, ...sources.photos.filter((p) => p.kind === 'local').map((p) => p.value)];
  return paths.filter(Boolean).filter((p) => !fs.existsSync(path.resolve(root, p)));
}
```

- [ ] **Step 4: Run tests**

Run: `node --test lib/copy-sources.test.mjs && npm test 2>&1 | grep -E "^# (pass|fail)"`
Expected: pass; `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add lib/copy-sources.mjs lib/copy-sources.test.mjs
git commit -m "Parse a client's copy sources file" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Google reviews parser

**Files:**
- Create: `lib/reviews.mjs`
- Test: `lib/reviews.test.mjs`

**Interfaces:**
- Consumes: `lines`, `trimBlank` from `lib/text.mjs`.
- Produces: `parseReviews(text, { source = null } = {}) → { name, date, text, truncated: boolean, reply: string|null, source }[]`; `quotable(review) → string|null` (full text, or up to the last complete sentence when truncated, or `null`).

The paste format is what Google shows when the owner selects the review list and copies it. See `makeup-by-brynlie/intake/reviews.txt` for 52 real examples.

- [ ] **Step 1: Write the failing test**

`lib/reviews.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseReviews, quotable } from './reviews.mjs';

const PASTE = `Source: https://share.google/x
Captured: 2026-09-26

Shelby Harp
4 reviews·4 photos
a month ago
Brynlie could not have been a better pick. She worked with my … More
Photo 1 in review by Shelby Harp
Photo 2 in review by Shelby Harp
Madison
2 reviews
3 weeks agoNew
If I could give more than 5 stars I would.
Victoria Massey
5 reviews
2 months ago
I was so nervous for my bridal makeup!! She heard me every … More
❤️1
Greg (Wulyallstar3)
Local Guide·15 reviews
Edited 3 months ago
Highly recommend!!
Makeupbybrynlie (Owner)
10 months ago
Thank you so much! 🤍
Amanda Allison
6 reviews·2 photos
10 months ago
The stars I am awarding say it all - Makeup is always flawless.

I always feel comfortable sending my brides to Brynlie.
`;

test('every review block is found, with name, date and text', () => {
  const r = parseReviews(PASTE);
  assert.deepEqual(r.map((x) => x.name), ['Shelby Harp', 'Madison', 'Victoria Massey', 'Greg (Wulyallstar3)', 'Amanda Allison']);
  assert.equal(r[1].date, '3 weeks ago');
  assert.equal(r[3].date, 'Edited 3 months ago');
  assert.equal(r[1].text, 'If I could give more than 5 stars I would.');
});

test('photo lines and reaction lines are not review text', () => {
  const r = parseReviews(PASTE);
  assert.doesNotMatch(r[0].text, /Photo 1/);
  assert.doesNotMatch(r[2].text, /❤️/);
});

test('"… More" marks a review truncated and is removed from the text', () => {
  const r = parseReviews(PASTE);
  assert.equal(r[0].truncated, true);
  assert.equal(r[0].text, 'Brynlie could not have been a better pick. She worked with my');
  assert.equal(r[1].truncated, false);
});

test('an owner reply attaches to the review above and is never its own review', () => {
  const r = parseReviews(PASTE);
  assert.equal(r[3].reply, 'Thank you so much! 🤍');
  assert.ok(!r.some((x) => /Owner/.test(x.name)));
});

test('a multi-paragraph review keeps its paragraphs', () => {
  const r = parseReviews(PASTE);
  assert.equal(r[4].text, 'The stars I am awarding say it all - Makeup is always flawless.\n\nI always feel comfortable sending my brides to Brynlie.');
});

test('a body line that looks like a header does not start a review', () => {
  const r = parseReviews('Ann\n2 reviews\na month ago\nShe did 2 brides.\n6 months ago\nstill the same review\n');
  assert.equal(r.length, 1);
  assert.equal(r[0].text, 'She did 2 brides.\n6 months ago\nstill the same review');
});

test('CRLF input parses the same', () => {
  assert.equal(parseReviews(PASTE.replace(/\n/g, '\r\n')).length, 5);
});

test('source is recorded on every review', () => {
  assert.ok(parseReviews(PASTE, { source: 'https://share.google/x' }).every((x) => x.source === 'https://share.google/x'));
});

test('quotable returns full text, the complete sentences of a truncated one, or null', () => {
  const [shelby, madison] = parseReviews(PASTE);
  assert.equal(quotable(madison), 'If I could give more than 5 stars I would.');
  assert.equal(quotable(shelby), 'Brynlie could not have been a better pick.');
  assert.equal(quotable({ text: 'She worked with my', truncated: true }), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test lib/reviews.test.mjs`
Expected: FAIL, module not found.

- [ ] **Step 3: Write the implementation**

`lib/reviews.mjs`:

```js
// Google Business Profile reviews, as pasted by the owner from the profile's
// review list. Google renders these client-side, so a paste is the reliable
// capture. Testimonials on the site are quoted from here verbatim; nothing is
// paraphrased, so the parser keeps text exactly and only strips Google's UI.
import { lines, trimBlank } from './text.mjs';

const COUNT = /^(?:Local Guide·)?\d+ reviews?(?:·\d+ photos?)?$/;
const DATE = /^(?:Edited )?(?:a|an|\d+) (?:minute|hour|day|week|month|year)s? ago(?:New)?$/;
const PHOTO = /^Photo \d+ in review by /;
const REACTION = /^\p{Extended_Pictographic}️?\d+$/u;
const OWNER = /^.+ \(Owner\)$/;
const MORE = /\s*…\s*More$/;

// A block needs its header lines in sequence, so a line inside a review that
// happens to read "2 reviews" or "6 months ago" cannot split it.
function blockStarts(ls) {
  const starts = [];
  for (let i = 0; i < ls.length; i++) {
    if (!ls[i].trim()) continue;
    if (OWNER.test(ls[i]) && DATE.test(ls[i + 1] ?? '')) {
      starts.push({ at: i, owner: true, date: ls[i + 1], body: i + 2 });
    } else if (COUNT.test(ls[i + 1] ?? '') && DATE.test(ls[i + 2] ?? '')) {
      starts.push({ at: i, owner: false, date: ls[i + 2], body: i + 3 });
    }
  }
  return starts;
}

export function parseReviews(text, { source = null } = {}) {
  const ls = lines(text);
  const starts = blockStarts(ls);
  const reviews = [];

  starts.forEach((s, k) => {
    const end = k + 1 < starts.length ? starts[k + 1].at : ls.length;
    const body = ls.slice(s.body, end).filter((l) => !PHOTO.test(l) && !REACTION.test(l.trim()));
    let content = trimBlank(body).join('\n');
    const truncated = MORE.test(content);
    if (truncated) content = content.replace(MORE, '');

    if (s.owner) {
      const above = reviews.at(-1);
      if (above) above.reply = content;
      return;
    }
    reviews.push({
      name: ls[s.at].trim(),
      date: s.date.replace(/New$/, ''),
      text: content,
      truncated,
      reply: null,
      source,
    });
  });
  return reviews;
}

// A truncated review can still be quoted up to its last complete sentence;
// quoting past that would put words in the reviewer's mouth.
export function quotable(review) {
  if (!review.truncated) return review.text;
  const m = review.text.match(/^[\s\S]*[.!?](?=\s|$)/);
  return m ? m[0] : null;
}
```

- [ ] **Step 4: Run tests**

Run: `node --test lib/reviews.test.mjs && npm test 2>&1 | grep -E "^# (pass|fail)"`
Expected: pass; `# fail 0`.

- [ ] **Step 5: Check against the real paste**

Run:
```bash
node -e "
import('/mnt/c/Users/Snic9/keepsitemedia/keepsite-skills/lib/reviews.mjs').then(({parseReviews}) => {
  const r = parseReviews(require('fs').readFileSync('/mnt/c/Users/Snic9/keepsitemedia/makeup-by-brynlie/intake/reviews.txt','utf8'));
  console.log(r.length, 'reviews', r.filter(x=>x.truncated).length, 'truncated', r.filter(x=>x.reply).length, 'with replies');
  console.log(r.filter(x=>!x.text).map(x=>x.name));
});"
```
Expected: `52 reviews 17 truncated 10 with replies` (counted from the file's header lines), and an empty list of names with no text. Count the blocks by eye in the file if the numbers look wrong; a name that appears glued into the previous review's text means a header pattern is missing.

- [ ] **Step 6: Commit**

```bash
git add lib/reviews.mjs lib/reviews.test.mjs
git commit -m "Parse pasted Google reviews" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Photo manifest

**Files:**
- Create: `lib/photo-manifest.mjs`
- Test: `lib/photo-manifest.test.mjs`

**Interfaces:**
- Produces: `buildManifest(root: string) → { photos: Entry[], warnings: string[] }` where `root` is the client directory and photos are read from `root/intake/photos/{instagram,drive,dropbox,local}/`. `Entry = { id, file, width, height, format, source, sourceUrl, date, caption, credit, creditSource }`; `file` is relative to `root`. Also `creditFrom(caption: string|null) → string|null` and `imageSize(file) → {width, height, format}|null`.

Instagram files are named by instaloader with `--filename-pattern={date_utc}_UTC_{shortcode}~`: `2026-06-16_14-30-00_UTC_DZpxfePFnkD~_2.jpg` for a carousel image, `…~.jpg` for a single image, `…~.txt` for the caption.

- [ ] **Step 1: Write the failing test**

`lib/photo-manifest.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildManifest, creditFrom } from './photo-manifest.mjs';

const hasMagick = (() => {
  try { execFileSync('convert', ['-version']); return true; } catch { return false; }
})();

function client(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ks-manifest-'));
  for (const [rel, spec] of Object.entries(files)) {
    const p = path.join(root, 'intake', 'photos', rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    if (typeof spec === 'string') fs.writeFileSync(p, spec);
    else execFileSync('convert', ['-size', `${spec.w}x${spec.h}`, 'xc:#c8a', p]);
  }
  return root;
}

test('credit comes from a camera emoji or "photo by" handle', () => {
  assert.equal(creditFrom('So pretty 🤍\n📸 @jane.doe.photo'), '@jane.doe.photo');
  assert.equal(creditFrom('Photography: @lens_and_lace'), '@lens_and_lace');
  assert.equal(creditFrom('photo by @someone'), '@someone');
  assert.equal(creditFrom('Makeup by @makeupbybrynlie'), null);
  assert.equal(creditFrom(null), null);
});

test('instagram carousel images share the post caption and credit', { skip: !hasMagick }, () => {
  const root = client({
    'instagram/2026-06-16_14-30-00_UTC_DdmKwqxFj_K~_1.jpg': { w: 1080, h: 1350 },
    'instagram/2026-06-16_14-30-00_UTC_DdmKwqxFj_K~_2.jpg': { w: 1080, h: 1080 },
    'instagram/2026-06-16_14-30-00_UTC_DdmKwqxFj_K~.txt': 'Hello! 📸 @jane',
  });
  const { photos, warnings } = buildManifest(root);
  assert.deepEqual(warnings, []);
  assert.deepEqual(photos.map((p) => p.id), ['ig-DdmKwqxFj_K-1', 'ig-DdmKwqxFj_K-2']);
  assert.equal(photos[0].sourceUrl, 'https://www.instagram.com/p/DdmKwqxFj_K/');
  assert.equal(photos[0].date, '2026-06-16');
  assert.equal(photos[0].caption, 'Hello! 📸 @jane');
  assert.equal(photos[1].credit, '@jane');
  assert.equal(photos[1].creditSource, 'caption');
  assert.deepEqual([photos[0].width, photos[0].height], [1080, 1350]);
});

test('a single-image post with no caption file has a null caption', { skip: !hasMagick }, () => {
  const root = client({ 'instagram/2026-01-02_03-04-05_UTC_Abc_12~.jpg': { w: 640, h: 800 } });
  const [p] = buildManifest(root).photos;
  assert.equal(p.id, 'ig-Abc_12-1');
  assert.equal(p.caption, null);
  assert.equal(p.credit, null);
});

test('local, drive and dropbox files get path-based ids and no caption', { skip: !hasMagick }, () => {
  const root = client({
    'local/Smith Wedding/IMG 001.jpg': { w: 3000, h: 2000 },
    'dropbox/a.png': { w: 10, h: 10 },
  });
  const ids = buildManifest(root).photos.map((p) => p.id);
  assert.deepEqual(ids, ['dropbox-a-png', 'local-smith-wedding-img-001-jpg']);
});

test('non-image files are skipped and unreadable images warn', { skip: !hasMagick }, () => {
  const root = client({
    'drive/notes.txt': 'not a photo',
    'drive/broken.jpg': 'not really a jpeg',
    'drive/ok.jpg': { w: 20, h: 20 },
  });
  const { photos, warnings } = buildManifest(root);
  assert.deepEqual(photos.map((p) => p.id), ['drive-broken-jpg', 'drive-ok-jpg']);
  assert.equal(photos[0].width, null);
  assert.match(warnings[0], /broken\.jpg/);
});

test('a missing photos directory is an empty manifest, not a crash', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ks-manifest-'));
  assert.deepEqual(buildManifest(root), { photos: [], warnings: [] });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test lib/photo-manifest.test.mjs`
Expected: FAIL, module not found.

- [ ] **Step 3: Write the implementation**

`lib/photo-manifest.mjs`:

```js
// Every photo source is normalised into intake/photos/{source}/ first, so
// selection works from one list whatever the client handed over. Credit is
// recorded here because most of a makeup artist's best images were taken by a
// wedding photographer, and the owner has to clear those before launch.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const SOURCES = ['instagram', 'drive', 'dropbox', 'local'];
const IMAGE = /\.(jpe?g|png|webp|avif|heic|heif|gif|tiff?)$/i;
// The `~` is written by instaloader's --filename-pattern. Shortcodes contain
// underscores, so without it "Abc_12_1" cannot be split into post and index.
const IG = /^(\d{4}-\d{2}-\d{2})_\d{2}-\d{2}-\d{2}_UTC_(.+)~(?:_(\d+))?\.\w+$/;

const CREDITS = [
  /(?:📸|📷)\s*(?:by|:|-|–|—)?\s*(@[\w.]+)/u,
  /\bphoto(?:s|graphy|grapher)?\s*(?:by|:|-|–|—)\s*(@[\w.]+)/i,
];

export function creditFrom(caption) {
  if (!caption) return null;
  for (const re of CREDITS) {
    const m = caption.match(re);
    if (m) return m[1];
  }
  return null;
}

export function imageSize(file) {
  try {
    const out = execFileSync('identify', ['-format', '%w %h %m', `${file}[0]`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const [w, h, format] = out.trim().split(' ');
    return { width: Number(w), height: Number(h), format: format.toLowerCase() };
  } catch {
    return null;
  }
}

const walk = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    return e.isDirectory() ? walk(full) : [full];
  });

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function describe(source, dir, file) {
  const name = path.basename(file);
  if (source === 'instagram') {
    const m = name.match(IG);
    if (m) {
      const [, date, shortcode, index] = m;
      const txt = path.join(path.dirname(file), name.replace(/(~)(?:_\d+)?\.\w+$/, '$1.txt'));
      const caption = fs.existsSync(txt) ? fs.readFileSync(txt, 'utf8').trim() || null : null;
      return {
        id: `ig-${shortcode}-${index ?? 1}`,
        sourceUrl: `https://www.instagram.com/p/${shortcode}/`,
        date,
        caption,
      };
    }
  }
  return { id: `${source}-${slug(path.relative(dir, file))}`, sourceUrl: null, date: null, caption: null };
}

export function buildManifest(root) {
  const photos = [];
  const warnings = [];
  for (const source of SOURCES) {
    const dir = path.join(root, 'intake', 'photos', source);
    if (!fs.existsSync(dir)) continue;
    for (const file of walk(dir).filter((f) => IMAGE.test(f)).sort()) {
      const info = describe(source, dir, file);
      const size = imageSize(file);
      if (!size) warnings.push(`${path.relative(root, file)}: ImageMagick could not read it`);
      const credit = creditFrom(info.caption);
      photos.push({
        id: info.id,
        file: path.relative(root, file).split(path.sep).join('/'),
        width: size?.width ?? null,
        height: size?.height ?? null,
        format: size?.format ?? null,
        source,
        sourceUrl: info.sourceUrl,
        date: info.date,
        caption: info.caption,
        credit,
        creditSource: credit ? 'caption' : null,
      });
    }
  }
  photos.sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }));
  return { photos, warnings };
}
```

- [ ] **Step 4: Run tests**

Run: `node --test lib/photo-manifest.test.mjs && npm test 2>&1 | grep -E "^# (pass|fail)"`
Expected: pass; `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add lib/photo-manifest.mjs lib/photo-manifest.test.mjs
git commit -m "Build a photo manifest from gathered sources" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Photo placement

**Files:**
- Create: `lib/place-photo.mjs`
- Test: `lib/place-photo.test.mjs`

**Interfaces:**
- Produces: `photoName(pointer: string) → string` (e.g. `'home.json#/hero/image'` → `'home-hero-image.jpg'`); `placePhoto({ from: string, siteDir: string, pointer: string, maxEdge = 2400 }) → string` (the `src` value to write into the data, i.e. the file name under `src/assets/photos/`).

- [ ] **Step 1: Write the failing test**

`lib/place-photo.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { photoName, placePhoto } from './place-photo.mjs';
import { imageSize } from './photo-manifest.mjs';

const hasMagick = (() => {
  try { execFileSync('convert', ['-version']); return true; } catch { return false; }
})();

test('photoName is a stable slug of the slot pointer', () => {
  assert.equal(photoName('home.json#/hero/image'), 'home-hero-image.jpg');
  assert.equal(photoName('services/on-location.json#/gallery/items/2'), 'services-on-location-gallery-items-2.jpg');
});

test('a large PNG lands as a JPEG no wider than maxEdge', { skip: !hasMagick }, () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ks-place-'));
  const from = path.join(tmp, 'big.png');
  execFileSync('convert', ['-size', '4000x3000', 'xc:#a86', from]);
  const src = placePhoto({ from, siteDir: tmp, pointer: 'home.json#/hero/image' });
  assert.equal(src, 'home-hero-image.jpg');
  const size = imageSize(path.join(tmp, 'src', 'assets', 'photos', src));
  assert.deepEqual(size, { width: 2400, height: 1800, format: 'jpeg' });
});

test('a small image is not upscaled', { skip: !hasMagick }, () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ks-place-'));
  const from = path.join(tmp, 'small.jpg');
  execFileSync('convert', ['-size', '800x600', 'xc:#a86', from]);
  const src = placePhoto({ from, siteDir: tmp, pointer: 'about.json#/portrait' });
  assert.equal(imageSize(path.join(tmp, 'src', 'assets', 'photos', src)).width, 800);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test lib/place-photo.test.mjs`
Expected: FAIL, module not found.

- [ ] **Step 3: Write the implementation**

`lib/place-photo.mjs`:

```js
// Originals from Drive or a camera run to 6000px and 15MB, and iPhone exports
// are HEIC; neither belongs in a git repo or in front of Astro's image
// pipeline. Placement normalises once: EXIF orientation applied then stripped
// (it also carries GPS), long edge capped, JPEG out. Astro makes the
// responsive AVIF/WebP from this at build time.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export const photoName = (pointer) =>
  `${pointer.replace(/\.json#/, '/').split(/[/]+/).filter(Boolean).join('-').replace(/[^A-Za-z0-9-]+/g, '-').toLowerCase()}.jpg`;

export function placePhoto({ from, siteDir, pointer, maxEdge = 2400 }) {
  const name = photoName(pointer);
  const to = path.join(siteDir, 'src', 'assets', 'photos', name);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  execFileSync('convert', [
    `${from}[0]`, '-auto-orient', '-resize', `${maxEdge}x${maxEdge}>`, '-strip', '-quality', '86', to,
  ]);
  return name;
}
```

- [ ] **Step 4: Run tests**

Run: `node --test lib/place-photo.test.mjs && npm test 2>&1 | grep -E "^# (pass|fail)"`
Expected: pass; `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add lib/place-photo.mjs lib/place-photo.test.mjs
git commit -m "Place a chosen photo into the site" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Slot scanner

**Files:**
- Modify: `lib/lorem.mjs` (export `WORDS`, add `isLorem`)
- Create: `lib/slots.mjs`
- Test: `lib/slots.test.mjs`, `lib/lorem.test.mjs` (add one test)

**Interfaces:**
- Produces: `isLorem(s: string) → boolean` from `lib/lorem.mjs`; `scanData(dataDir: string) → { copy: {pointer, words, text}[], images: {pointer, ratio, caption, src: string|null}[] }`; `readStatus(dataDir) → { remaining: {pointer, reason}[] } | null`; `compareStatus(copy, status) → { unlisted: string[], stale: string[] }`.
- Pointer format: `<file relative to src/data, forward slashes>#<JSON pointer>`, e.g. `home.json#/hero/body`, `services/on-location.json#/faq/items/0/answer`. JSON pointer escaping: `~` → `~0`, `/` → `~1`.

- [ ] **Step 1: Write the failing tests**

Append to `lib/lorem.test.mjs`:

```js
import { isLorem } from './lorem.mjs';

test('isLorem recognises generated lorem of every slot and rejects English', () => {
  for (const slot of Object.keys(SLOTS)) {
    for (let i = 0; i < 20; i++) assert.ok(isLorem(lorem(slot, `${slot}-${i}`)), `${slot} ${i}`);
  }
  for (const s of ['Begin an inquiry', 'Utah bridal hair and makeup artist', 'In', 'Price to be confirmed', '']) {
    assert.equal(isLorem(s), false, s);
  }
});
```

(If `lib/lorem.test.mjs` does not already import `SLOTS` and `lorem`, extend its existing import line from `./lorem.mjs`.)

`lib/slots.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { lorem } from './lorem.mjs';
import { scanData, readStatus, compareStatus } from './slots.mjs';

function data(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ks-slots-'));
  for (const [rel, obj] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), JSON.stringify(obj));
  }
  return dir;
}

const HOME = {
  title: 'Makeup by Brynlie | Utah Bridal Hair and Makeup Artist',
  hero: {
    title: 'Bridal makeup that still looks like you',
    body: lorem('body', 'home-hero-body'),
    cta: { label: 'Begin an inquiry', href: '/inquiry/' },
    image: { ratio: '4/5', caption: 'Bride in the chair' },
  },
  reviews: { items: [{ quote: lorem('quote', 'q1'), attribution: lorem('attribution', 'a1') }] },
};

test('lorem strings are copy slots and English strings are not', () => {
  const { copy } = scanData(data({ 'home.json': HOME }));
  assert.deepEqual(copy.map((c) => c.pointer), [
    'home.json#/hero/body',
    'home.json#/reviews/items/0/quote',
    'home.json#/reviews/items/0/attribution',
  ]);
  assert.ok(copy[0].words >= 40 && copy[0].words <= 60);
});

test('objects with ratio and caption are image slots', () => {
  const dir = data({
    'home.json': HOME,
    'services/on-location.json': { hero: { image: { ratio: '3/2', caption: 'Venue', src: 'x.jpg', alt: 'x' } } },
  });
  assert.deepEqual(scanData(dir).images, [
    { pointer: 'home.json#/hero/image', ratio: '4/5', caption: 'Bride in the chair', src: null },
    { pointer: 'services/on-location.json#/hero/image', ratio: '3/2', caption: 'Venue', src: 'x.jpg' },
  ]);
});

test('pages.json and copy-status.json are not scanned', () => {
  const dir = data({ 'pages.json': [{ title: lorem('headline', 'x') }], 'copy-status.json': { remaining: [] } });
  assert.deepEqual(scanData(dir), { copy: [], images: [] });
});

test('keys with / and ~ are escaped in the pointer', () => {
  const { copy } = scanData(data({ 'a.json': { 'a/b': { 'c~d': lorem('body', 'z') } } }));
  assert.equal(copy[0].pointer, 'a.json#/a~1b/c~0d');
});

test('compareStatus finds unlisted lorem and stale listings', () => {
  const dir = data({
    'home.json': HOME,
    'copy-status.json': {
      remaining: [
        { pointer: 'home.json#/reviews/items/0/quote', reason: 'too few real reviews' },
        { pointer: 'home.json#/hero/title', reason: 'old' },
      ],
    },
  });
  const status = readStatus(dir);
  const { unlisted, stale } = compareStatus(scanData(dir).copy, status);
  assert.deepEqual(unlisted, ['home.json#/hero/body', 'home.json#/reviews/items/0/attribution']);
  assert.deepEqual(stale, ['home.json#/hero/title']);
});

test('readStatus is null for a Stage Two site', () => {
  assert.equal(readStatus(data({ 'home.json': HOME })), null);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test lib/slots.test.mjs lib/lorem.test.mjs`
Expected: FAIL — `isLorem` is not exported; `./slots.mjs` not found.

- [ ] **Step 3: Write the implementation**

In `lib/lorem.mjs`, change `const WORDS = (` to `export const WORDS = (` and append:

```js
// Stage Three has to find the lorem that is left. Matching on a few trigger
// words misses short slots — a two-word attribution like "Aute nostrud" has
// none of them — so a string is lorem when every word in it comes from WORDS.
const VOCAB = new Set(WORDS);

export function isLorem(s) {
  const words = String(s).toLowerCase().match(/[a-z]+/g) ?? [];
  return words.length >= 2 && words.every((w) => VOCAB.has(w));
}
```

`lib/slots.mjs`:

```js
// What Stage Three has to fill, read from the site's own data rather than from
// the generator that wrote it: content.mjs is per-client and not always
// present, and the data is what actually ships.
import fs from 'node:fs';
import path from 'node:path';
import { isLorem } from './lorem.mjs';

const SKIP = new Set(['pages.json', 'copy-status.json']);
const esc = (k) => String(k).replace(/~/g, '~0').replace(/\//g, '~1');

const walkFiles = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    return e.isDirectory() ? walkFiles(full) : e.name.endsWith('.json') ? [full] : [];
  });

export function scanData(dataDir) {
  const copy = [];
  const images = [];
  const files = walkFiles(dataDir)
    .map((f) => path.relative(dataDir, f).split(path.sep).join('/'))
    .filter((rel) => !SKIP.has(rel))
    .sort();

  for (const rel of files) {
    const visit = (node, ptr) => {
      if (typeof node === 'string') {
        if (isLorem(node)) copy.push({ pointer: `${rel}#${ptr}`, words: node.split(/\s+/).length, text: node });
      } else if (Array.isArray(node)) {
        node.forEach((v, i) => visit(v, `${ptr}/${i}`));
      } else if (node && typeof node === 'object') {
        if (typeof node.ratio === 'string' && typeof node.caption === 'string') {
          images.push({ pointer: `${rel}#${ptr}`, ratio: node.ratio, caption: node.caption, src: node.src ?? null });
        }
        for (const [k, v] of Object.entries(node)) visit(v, `${ptr}/${esc(k)}`);
      }
    };
    visit(JSON.parse(fs.readFileSync(path.join(dataDir, rel), 'utf8')), '');
  }
  return { copy, images };
}

export function readStatus(dataDir) {
  const file = path.join(dataDir, 'copy-status.json');
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
}

export function compareStatus(copy, status) {
  const listed = new Set((status?.remaining ?? []).map((r) => r.pointer));
  const lorem = new Set(copy.map((c) => c.pointer));
  return {
    unlisted: copy.map((c) => c.pointer).filter((p) => !listed.has(p)),
    stale: [...listed].filter((p) => !lorem.has(p)),
  };
}
```

- [ ] **Step 4: Run tests**

Run: `node --test lib/slots.test.mjs lib/lorem.test.mjs && npm test 2>&1 | grep -E "^# (pass|fail)"`
Expected: pass; `# fail 0`. If `isLorem` rejects a generated string, the lorem generator produced a one-word string or a word outside `WORDS`; fix the test's understanding, not the vocabulary.

- [ ] **Step 5: Run it against the real client**

Run:
```bash
node -e "import('/mnt/c/Users/Snic9/keepsitemedia/keepsite-skills/lib/slots.mjs').then(({scanData}) => { const r = scanData('/mnt/c/Users/Snic9/keepsitemedia/makeup-by-brynlie/src/data'); console.log(r.copy.length, 'copy slots', r.images.length, 'image slots'); console.log(r.copy.slice(0,3), r.images.slice(0,3)); })"
```
Expected: hundreds of copy slots, dozens of image slots, no English strings in the first three copy slots.

- [ ] **Step 6: Commit**

```bash
git add lib/lorem.mjs lib/lorem.test.mjs lib/slots.mjs lib/slots.test.mjs
git commit -m "Scan site data for copy and image slots" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Stage Three checks in the site verifier

**Files:**
- Modify: `templates/astro/scripts/verify.mjs`
- Test: `lib/verify.test.mjs`

**Interfaces:**
- Consumes: the `copy-status.json` shape from Task 6 (`{ remaining: [{ pointer, reason }] }`) and its pointer format.
- Produces: verifier output lines `  warn  <message>` and a Stage Three check `no unlisted lorem in the site data`.

- [ ] **Step 1: Write the failing tests**

In `lib/verify.test.mjs`, extend `repo()` to take `data = {}` and write each entry to `src/data/<rel>` as JSON. Change its signature line and add the loop after `pages.json` is written:

```js
function repo({ pages = PAGES, files = {}, omit = [], data = {} } = {}) {
  // ...existing body up to writing pages.json...
  for (const [rel, obj] of Object.entries(data)) {
    const p = path.join(dir, 'src', 'data', rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(obj));
  }
  // ...rest unchanged...
}
```

Append tests:

```js
const LOREM_BODY = 'Consequat ipsum aliquip esse sunt consectetur officia culpa occaecat veniam.';
const LOREM_SHORT = 'Aute nostrud';

test('a Stage Two site with lorem in its data still passes', () => {
  const r = run(repo({ data: { 'home.json': { hero: { body: LOREM_BODY } } } }));
  assert.equal(r.code, 0);
  assert.doesNotMatch(r.out, /Stage Three/);
});

test('Stage Three: unlisted lorem in the data fails, naming the pointer', () => {
  const r = run(repo({ data: { 'home.json': { hero: { body: LOREM_BODY } }, 'copy-status.json': { remaining: [] } } }));
  assert.equal(r.code, 1);
  assert.match(r.out, /home\.json#\/hero\/body/);
});

test('Stage Three: short lorem is caught too', () => {
  const r = run(repo({ data: { 'home.json': { r: [{ attribution: LOREM_SHORT }] }, 'copy-status.json': { remaining: [] } } }));
  assert.equal(r.code, 1);
  assert.match(r.out, /home\.json#\/r\/0\/attribution/);
});

test('Stage Three: listed lorem passes with a warning', () => {
  const r = run(repo({
    data: {
      'home.json': { hero: { body: LOREM_BODY } },
      'copy-status.json': { remaining: [{ pointer: 'home.json#/hero/body', reason: 'awaiting reviews' }] },
    },
  }));
  assert.equal(r.code, 0);
  assert.match(r.out, /warn.*home\.json#\/hero\/body.*awaiting reviews/);
});

test('Stage Three: a stale listing warns', () => {
  const r = run(repo({
    data: {
      'home.json': { hero: { body: 'Real copy now.' } },
      'copy-status.json': { remaining: [{ pointer: 'home.json#/hero/body', reason: 'x' }] },
    },
  }));
  assert.equal(r.code, 0);
  assert.match(r.out, /warn.*no longer lorem/);
});

test('Stage Three: a [confirm: …] marker in a page warns, naming the page', () => {
  const r = run(repo({
    data: { 'copy-status.json': { remaining: [] } },
    files: { 'index.html': page('<h1>Home</h1><p>Trials are [confirm: trial price].</p>') },
  }));
  assert.equal(r.code, 0);
  assert.match(r.out, /warn.*\[confirm: trial price\].*index\.html/);
});

test('Stage Three: a malformed copy-status.json fails as a check', () => {
  const dir = repo();
  fs.writeFileSync(path.join(dir, 'src', 'data', 'copy-status.json'), '{ nope');
  const r = run(dir);
  assert.equal(r.code, 1);
  assert.match(r.out, /copy-status\.json/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test lib/verify.test.mjs`
Expected: the new Stage Three tests FAIL (exit 0 with lorem, no warnings); the Stage Two test passes already.

- [ ] **Step 3: Write the implementation**

In `templates/astro/scripts/verify.mjs`:

1. After `const results = [];` add `const warnings = [];` and `const warn = (msg) => warnings.push(msg);`.
2. Before the final `console.log(results.join('\n'));`, insert:

```js
// Stage Three. src/data/copy-status.json is written by the copy pass, and its
// presence is what turns these checks on: a Stage Two site is lorem by design
// and must keep passing. It lives in src/data rather than intake/ because
// intake/ is gitignored and absent from a Netlify build.
const statusFile = path.join('src', 'data', 'copy-status.json');
if (fs.existsSync(statusFile)) {
  // Duplicated from lib/lorem.mjs (WORDS, isLorem) and lib/slots.mjs (the
  // walk): this file runs on Netlify, where lib/ does not exist.
  const VOCAB = new Set((
    'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor ' +
    'incididunt ut labore et dolore magna aliqua enim ad minim veniam quis nostrud ' +
    'exercitation ullamco laboris nisi aliquip ex ea commodo consequat duis aute ' +
    'irure in reprehenderit voluptate velit esse cillum eu fugiat nulla pariatur ' +
    'excepteur sint occaecat cupidatat non proident sunt culpa qui officia deserunt ' +
    'mollit anim id est laborum'
  ).split(' '));
  const isLorem = (s) => {
    const words = String(s).toLowerCase().match(/[a-z]+/g) ?? [];
    return words.length >= 2 && words.every((w) => VOCAB.has(w));
  };
  const esc = (k) => String(k).replace(/~/g, '~0').replace(/\//g, '~1');

  let status = null;
  check('the Stage Three copy status loads', () => {
    try {
      status = JSON.parse(fs.readFileSync(statusFile, 'utf8'));
    } catch (e) {
      throw new Error(`${statusFile} is not valid JSON: ${e.message}`);
    }
    if (!Array.isArray(status?.remaining)) throw new Error(`${statusFile} needs a "remaining" array`);
  });

  if (status) {
    const dataDir = path.join('src', 'data');
    const lorem = [];
    for (const full of walk(dataDir).filter((f) => f.endsWith('.json'))) {
      const rel = path.relative(dataDir, full).split(path.sep).join('/');
      if (rel === 'pages.json' || rel === 'copy-status.json') continue;
      const visit = (node, ptr) => {
        if (typeof node === 'string') {
          if (isLorem(node)) lorem.push(`${rel}#${ptr}`);
        } else if (Array.isArray(node)) {
          node.forEach((v, i) => visit(v, `${ptr}/${i}`));
        } else if (node && typeof node === 'object') {
          for (const [k, v] of Object.entries(node)) visit(v, `${ptr}/${esc(k)}`);
        }
      };
      visit(JSON.parse(fs.readFileSync(full, 'utf8')), '');
    }

    const listed = new Map(status.remaining.map((r) => [r.pointer, r.reason]));
    check('no unlisted lorem in the site data', () => {
      const unlisted = lorem.filter((p) => !listed.has(p));
      if (unlisted.length) {
        throw new Error(`lorem not listed in ${statusFile}: ${unlisted.join(', ')}`);
      }
    });
    for (const [p, reason] of listed) {
      if (lorem.includes(p)) warn(`lorem left at ${p} (${reason})`);
      else warn(`${p} is listed in ${statusFile} but is no longer lorem`);
    }
    for (const { file, body } of html) {
      for (const m of body.matchAll(/\[confirm:[^\]]*\]/g)) warn(`${m[0]} on ${file}`);
    }
  }
}
```

3. Change the output block at the end so warnings print before the verdict:

```js
console.log(results.join('\n'));
if (warnings.length) console.log(`\n${warnings.map((w) => `  warn  ${w}`).join('\n')}`);
```

(leave the failure/success lines that follow unchanged).

- [ ] **Step 4: Run tests**

Run: `node --test lib/verify.test.mjs && npm test 2>&1 | grep -E "^# (pass|fail)"`
Expected: all verify tests pass, including every pre-existing one; `# fail 0`.

- [ ] **Step 5: Confirm the duplicate vocabulary matches**

Run:
```bash
node -e "import('/mnt/c/Users/Snic9/keepsitemedia/keepsite-skills/lib/lorem.mjs').then(({WORDS}) => { const v = require('fs').readFileSync('/mnt/c/Users/Snic9/keepsitemedia/keepsite-skills/templates/astro/scripts/verify.mjs','utf8'); const m = v.match(/const VOCAB = new Set\(\(([\s\S]*?)\)\.split/); const words = eval(m[1]).split(' '); console.log(JSON.stringify(words) === JSON.stringify(WORDS) ? 'same' : 'DIFFERENT'); })"
```
Expected: `same`. Then add that comparison as a test at the end of `lib/verify.test.mjs` so drift fails `npm test`:

```js
test('the verifier lorem vocabulary matches lib/lorem.mjs', async () => {
  const { WORDS } = await import('./lorem.mjs');
  const src = fs.readFileSync(verifier, 'utf8');
  const m = src.match(/const VOCAB = new Set\(\(([\s\S]*?)\)\.split/);
  const words = m[1].match(/'([^']*)'/g).map((s) => s.slice(1, -1)).join('').split(' ');
  assert.deepEqual(words, WORDS);
});
```

- [ ] **Step 6: Commit**

```bash
git add templates/astro/scripts/verify.mjs lib/verify.test.mjs
git commit -m "Add Stage Three checks to the site verifier" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: ImageArea renders a photograph

**Files:**
- Modify: `templates/astro/src/components/ImageArea.astro`
- Modify: `skills/keepsite-build/references/productionize.md` (the Accessibility and performance section, and wherever `ImageArea` call sites are shown)
- Test: `lib/placeholders.test.mjs`

**Interfaces:**
- Produces: `ImageArea` props `{ ratio: string; caption: string; src?: string; alt?: string; focus?: string; eager?: boolean }`. `src` is a file name under `src/assets/photos/`. Call sites spread the data object: `<ImageArea {...image} />`.

- [ ] **Step 1: Write the failing test**

Append to `lib/placeholders.test.mjs`:

```js
test('ImageArea renders a local photo through astro:assets when src is set', () => {
  const body = comp('ImageArea.astro');
  assert.match(body, /from 'astro:assets'/);
  assert.match(body, /import\.meta\.glob[^;]*\/src\/assets\/photos\//);
  assert.match(body, /<Picture\b/);
  // A photo without alt text is an accessibility failure the Netlify gate would
  // cancel the deploy for; failing the build names the slot instead.
  assert.match(body, /throw new Error\([^)]*alt/);
  assert.match(body, /throw new Error\([^)]*not found/);
});

test('ImageArea still draws the outlined region when src is absent', () => {
  const body = comp('ImageArea.astro');
  assert.match(body, /class="image-area"/);
  assert.match(body, /visually-hidden">Image area: /);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test lib/placeholders.test.mjs`
Expected: the first new test FAILS; the second passes.

- [ ] **Step 3: Write the implementation**

Replace `templates/astro/src/components/ImageArea.astro` with:

```astro
---
// The only way a photograph is represented, before and after Stage Three.
//
// Clause (b) of Stage Two: "Image areas drawn as outlined regions, not as
// placeholder photographs." Without `src` this is that region, holding the
// aspect ratio the real photograph will occupy so nothing reflows when Stage
// Three fills it. Border and fill come from the site's own tokens.
//
// With `src`, Stage Three has placed a real photograph in src/assets/photos/.
// Data files cannot import an image, so the file is looked up by name; Astro
// then produces AVIF/WebP at several widths. `focus` is an object-position for
// the crop, because the slot's ratio rarely matches the original's.
import { Picture } from 'astro:assets';
import type { ImageMetadata } from 'astro';

interface Props {
  ratio: string;
  caption: string;
  src?: string;
  alt?: string;
  focus?: string;
  eager?: boolean;
}

const { ratio, caption, src, alt, focus = 'center', eager = false } = Astro.props;

const photos = import.meta.glob<{ default: ImageMetadata }>(
  '/src/assets/photos/*.{jpg,jpeg,png,webp,avif}',
  { eager: true },
);
const photo = src ? photos[`/src/assets/photos/${src}`]?.default : undefined;
if (src && !photo) throw new Error(`ImageArea "${caption}": src/assets/photos/${src} not found`);
if (photo && !alt) throw new Error(`ImageArea "${caption}": ${src} has no alt text`);
---
{photo ? (
  <Picture
    src={photo}
    alt={alt!}
    formats={['avif', 'webp']}
    widths={[480, 800, 1200, 1600, 2000]}
    sizes="(min-width: 64rem) 50vw, 100vw"
    loading={eager ? 'eager' : 'lazy'}
    fetchpriority={eager ? 'high' : 'auto'}
    class="image-area-photo"
    style={`aspect-ratio: ${ratio}; object-position: ${focus};`}
  />
) : (
  <div class="image-area" style={`aspect-ratio: ${ratio};`}>
    <span class="image-area-caption"><span class="visually-hidden">Image area: </span>{caption}</span>
  </div>
)}

<style>
  .image-area {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    border: 1px solid var(--placeholder-border);
    background: var(--placeholder-fill);
  }

  /* Quiet, but a real colour rather than a dimmed one: small text under
     opacity lands below the 4.5:1 that axe's color-contrast rule enforces. */
  .image-area-caption {
    font-size: 0.75rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--placeholder-ink);
    padding: 0 1rem;
    text-align: center;
  }

  .image-area-photo {
    display: block;
    width: 100%;
    height: auto;
    object-fit: cover;
  }
</style>
```

Note: Astro scopes `<style>` to elements in this component; `class="image-area-photo"` on `<Picture>` lands on the rendered `<img>`, which Astro marks with the component's scope attribute. If Step 5 shows the style is not applied, change the selector to `:global(.image-area-photo)`.

In `skills/keepsite-build/references/productionize.md`, add to the end of the Accessibility and performance section:

```markdown
Pass each image object whole: `<ImageArea {...image} />`, not
`<ImageArea ratio={image.ratio} caption={image.caption} />`. Stage Three adds
`src`, `alt` and `focus` to the same object in the data, and a spread picks
them up with no component edits. The first image on a page that sits above
the fold takes `eager: true` in the data, or Lighthouse flags the LCP image
as lazy-loaded.
```

- [ ] **Step 4: Run tests**

Run: `node --test lib/placeholders.test.mjs && npm test 2>&1 | grep -E "^# (pass|fail)"`
Expected: pass; `# fail 0`.

- [ ] **Step 5: Build a real site with one photo**

This is the only step that proves the component compiles; unit tests read its source.

```bash
cd /mnt/c/Users/Snic9/keepsitemedia/keepsite-skills
TMP=$(mktemp -d)
node -e "
import('./lib/scaffold.mjs').then(({ scaffoldRepo }) => scaffoldRepo({
  dest: '$TMP/site',
  vars: { BRAND: 'Example', SLUG: 'example', DESCRIPTION: 'Example.', DOMAIN: 'https://example.test',
          FONT_IMPORTS: '', FONT_PACKAGES: '', TOKENS: '  --bg: #fff;\n  --ink: #111;\n  --rule: #ddd;\n  --surface: #f7f7f7;' },
  pages: [{ title: 'Home', path: '/', purpose: 'Home.' }],
}));"
mkdir -p $TMP/site/src/assets/photos
convert -size 1600x2000 xc:#c8a $TMP/site/src/assets/photos/home-hero-image.jpg
grep -rn "ImageArea" $TMP/site/src/pages/index.astro
```

Edit `$TMP/site/src/pages/index.astro` so it renders both
`<ImageArea ratio="4/5" caption="Hero" src="home-hero-image.jpg" alt="A bride in soft glam makeup" eager />`
and `<ImageArea ratio="1/1" caption="Portrait" />` (import the component from `../components/ImageArea.astro` if the page does not already). Then:

```bash
cd $TMP/site && npm install && npm run build && grep -o '<picture>.*</picture>' dist/index.html | head -c 600; echo; grep -c 'image-area-caption' dist/index.html
```
Expected: the build succeeds; a `<picture>` with `avif` and `webp` sources and an `<img ... alt="A bride in soft glam makeup" loading="eager"`; one `image-area-caption`. Then set `src="missing.jpg"` and confirm `npm run build` fails with `not found`, and remove `alt` and confirm it fails with `no alt text`. Delete `$TMP` afterwards.

- [ ] **Step 6: Commit**

```bash
git add templates/astro/src/components/ImageArea.astro lib/placeholders.test.mjs skills/keepsite-build/references/productionize.md
git commit -m "Let ImageArea render a placed photograph" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: The copy CLI

**Files:**
- Create: `lib/copy-cli.mjs`
- Test: `lib/copy-cli.test.mjs`

**Interfaces:**
- Consumes: every module from Tasks 1–6.
- Produces the command the skill documents, run from the workspace root:

```
node $SKILL_DIR/lib/copy-cli.mjs check     <slug>   # validate copy-sources.md and preconditions; exit 1 on errors
node $SKILL_DIR/lib/copy-cli.mjs instagram <slug>   # print (not run) the instaloader command
node $SKILL_DIR/lib/copy-cli.mjs voice     <slug>   # write intake/voice-posts.json from the voice file
node $SKILL_DIR/lib/copy-cli.mjs reviews   <slug>   # intake/reviews.txt → intake/reviews.json
node $SKILL_DIR/lib/copy-cli.mjs manifest  <slug>   # write intake/photos/manifest.json
node $SKILL_DIR/lib/copy-cli.mjs slots     <slug>   # print copy/image slot counts, unlisted and stale lorem as JSON
node $SKILL_DIR/lib/copy-cli.mjs place     <slug> <manifest-id> <pointer>   # place one photo, print its src
```

Also exports `run(argv: string[], { cwd = process.cwd() } = {}) → { code: number, out: string }` so tests call it in-process.

`instagram` prints rather than runs because the download takes minutes and is rate-limited; the agent runs the printed command with `run_in_background`. The command:

```
instaloader --login=<account> --no-videos --no-video-thumbnails --no-metadata-json --no-compress-json --no-profile-pic --fast-update --dirname-pattern=<slug>/intake/photos/instagram "--filename-pattern={date_utc}_UTC_{shortcode}~" <handle>
```

`<account>` is the session file's name: the single `~/.config/instaloader/session-*` file with `session-` stripped. No session file: exit 1 with `No instaloader session. Ask the owner to run: ! instaloader --login=<account>`.

- [ ] **Step 1: Write the failing test**

`lib/copy-cli.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { run } from './copy-cli.mjs';
import { lorem } from './lorem.mjs';

function workspace({ sources, voice = 'https://x.test/p/1/\nHi.', reviews, withSite = true } = {}) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'ks-cli-'));
  const c = path.join(cwd, 'client');
  fs.mkdirSync(path.join(c, 'intake'), { recursive: true });
  if (sources !== null) fs.writeFileSync(path.join(c, 'intake', 'copy-sources.md'), sources ?? 'Voice: Voice.txt\nPhotos: photos\n');
  fs.writeFileSync(path.join(c, 'Voice.txt'), voice);
  fs.mkdirSync(path.join(c, 'photos'));
  for (const f of ['sitemap.md', 'keywords.md', 'brief.md']) fs.writeFileSync(path.join(c, 'intake', f), '#');
  if (reviews) fs.writeFileSync(path.join(c, 'intake', 'reviews.txt'), reviews);
  if (withSite) {
    fs.mkdirSync(path.join(c, 'src', 'data'), { recursive: true });
    fs.writeFileSync(path.join(c, 'src', 'data', 'home.json'), JSON.stringify({ hero: { body: lorem('body', 'b'), image: { ratio: '4/5', caption: 'Hero' } } }));
  }
  return cwd;
}

test('check passes for a complete client', () => {
  const r = run(['check', 'client'], { cwd: workspace() });
  assert.equal(r.code, 0, r.out);
});

test('check fails without copy-sources.md, naming the file', () => {
  const r = run(['check', 'client'], { cwd: workspace({ sources: null }) });
  assert.equal(r.code, 1);
  assert.match(r.out, /copy-sources\.md/);
});

test('check fails on a missing voice file and on a missing site', () => {
  const r = run(['check', 'client'], { cwd: workspace({ sources: 'Voice: Nope.txt\nPhotos: photos\n', withSite: false }) });
  assert.equal(r.code, 1);
  assert.match(r.out, /Nope\.txt/);
  assert.match(r.out, /src\/data/);
});

test('voice writes the parsed posts and reports warnings', () => {
  const cwd = workspace({ voice: 'Profile: https://x.test/\nhttps://x.test/p/1/\nHi.' });
  const r = run(['voice', 'client'], { cwd });
  assert.equal(r.code, 0);
  assert.match(r.out, /1 post/);
  assert.match(r.out, /ignored/);
  const posts = JSON.parse(fs.readFileSync(path.join(cwd, 'client', 'intake', 'voice-posts.json'), 'utf8'));
  assert.deepEqual(posts, [{ url: 'https://x.test/p/1/', caption: 'Hi.' }]);
});

test('reviews writes reviews.json with the source link', () => {
  const cwd = workspace({
    sources: 'Voice: Voice.txt\nPhotos: photos\nReviews: https://share.google/abc\n',
    reviews: 'Ann\n2 reviews\na month ago\nLovely.\n',
  });
  const r = run(['reviews', 'client'], { cwd });
  assert.equal(r.code, 0, r.out);
  const out = JSON.parse(fs.readFileSync(path.join(cwd, 'client', 'intake', 'reviews.json'), 'utf8'));
  assert.equal(out.reviews[0].source, 'https://share.google/abc');
  assert.equal(out.reviews[0].text, 'Lovely.');
});

test('slots reports lorem and image slots, with unlisted lorem', () => {
  const r = run(['slots', 'client'], { cwd: workspace() });
  const out = JSON.parse(r.out);
  assert.equal(out.copy, 1);
  assert.equal(out.images.empty, 1);
  assert.deepEqual(out.unlisted, ['home.json#/hero/body']);
});

test('an unknown command prints usage and exits 1', () => {
  const r = run(['nope']);
  assert.equal(r.code, 1);
  assert.match(r.out, /usage/i);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test lib/copy-cli.test.mjs`
Expected: FAIL, module not found.

- [ ] **Step 3: Write the implementation**

`lib/copy-cli.mjs`:

```js
#!/usr/bin/env node
// The deterministic half of keepsite-copy. Every command reads and writes files
// under <slug>/ relative to the workspace root; the judgement half (voice
// guide, photo choice, copy) is the skill's instructions.
//
//   node lib/copy-cli.mjs <check|instagram|voice|reviews|manifest|slots|place> <slug> [...]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseCopySources, missingFiles } from './copy-sources.mjs';
import { parseVoiceFile } from './voice-file.mjs';
import { parseReviews } from './reviews.mjs';
import { buildManifest } from './photo-manifest.mjs';
import { placePhoto } from './place-photo.mjs';
import { scanData, readStatus, compareStatus } from './slots.mjs';

const USAGE = 'usage: copy-cli.mjs <check|instagram|voice|reviews|manifest|slots|place> <slug> [manifest-id pointer]';

function loadSources(root) {
  const file = path.join(root, 'intake', 'copy-sources.md');
  if (!fs.existsSync(file)) return { error: `${path.relative(path.dirname(root), file)} is missing` };
  return { sources: parseCopySources(fs.readFileSync(file, 'utf8')) };
}

const writeJson = (file, obj) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(obj, null, 2)}\n`);
};

const commands = {
  check(root, slug) {
    const problems = [];
    const { sources, error } = loadSources(root);
    if (error) problems.push(error);
    if (sources) {
      problems.push(...sources.errors);
      problems.push(...missingFiles(sources, root).map((p) => `${slug}/${p} does not exist`));
    }
    for (const f of ['brief.md', 'sitemap.md', 'keywords.md']) {
      if (!fs.existsSync(path.join(root, 'intake', f))) problems.push(`${slug}/intake/${f} is missing`);
    }
    if (!fs.existsSync(path.join(root, 'src', 'data'))) problems.push(`${slug}/src/data is missing; run keepsite-build first`);
    const warnings = sources?.warnings ?? [];
    const out = [...problems.map((p) => `error: ${p}`), ...warnings.map((w) => `warning: ${w}`)];
    return { code: problems.length ? 1 : 0, out: out.length ? out.join('\n') : 'ok' };
  },

  instagram(root, slug) {
    const { sources, error } = loadSources(root);
    if (error) return { code: 1, out: error };
    if (!sources.instagram) return { code: 1, out: 'copy-sources.md names no Instagram handle' };
    const dir = path.join(os.homedir(), '.config', 'instaloader');
    const sessions = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.startsWith('session-')) : [];
    if (sessions.length !== 1) {
      return { code: 1, out: 'No instaloader session. Ask the owner to run: ! instaloader --login=<account>' };
    }
    const account = sessions[0].slice('session-'.length);
    return {
      code: 0,
      out: [
        'instaloader', `--login=${account}`, '--no-videos', '--no-video-thumbnails', '--no-metadata-json',
        '--no-compress-json', '--no-profile-pic', '--fast-update',
        `--dirname-pattern=${slug}/intake/photos/instagram`, '"--filename-pattern={date_utc}_UTC_{shortcode}~"',
        sources.instagram,
      ].join(' '),
    };
  },

  voice(root) {
    const { sources, error } = loadSources(root);
    if (error) return { code: 1, out: error };
    const { posts, warnings } = parseVoiceFile(fs.readFileSync(path.join(root, sources.voice), 'utf8'));
    writeJson(path.join(root, 'intake', 'voice-posts.json'), posts);
    return { code: 0, out: [`${posts.length} post(s)`, ...warnings.map((w) => `warning: ${w}`)].join('\n') };
  },

  reviews(root) {
    const file = path.join(root, 'intake', 'reviews.txt');
    if (!fs.existsSync(file)) return { code: 1, out: 'intake/reviews.txt is missing; ask the owner to paste the Google reviews into it' };
    const { sources } = loadSources(root);
    const source = sources?.reviews[0] ?? null;
    const reviews = parseReviews(fs.readFileSync(file, 'utf8'), { source });
    writeJson(path.join(root, 'intake', 'reviews.json'), { source, reviews });
    const truncated = reviews.filter((r) => r.truncated).length;
    return { code: 0, out: `${reviews.length} review(s), ${truncated} truncated` };
  },

  manifest(root) {
    const { photos, warnings } = buildManifest(root);
    writeJson(path.join(root, 'intake', 'photos', 'manifest.json'), photos);
    const uncredited = photos.filter((p) => !p.credit).length;
    return { code: 0, out: [`${photos.length} photo(s), ${uncredited} with no credit`, ...warnings.map((w) => `warning: ${w}`)].join('\n') };
  },

  slots(root) {
    const dataDir = path.join(root, 'src', 'data');
    const { copy, images } = scanData(dataDir);
    const { unlisted, stale } = compareStatus(copy, readStatus(dataDir));
    return {
      code: 0,
      out: JSON.stringify({
        copy: copy.length,
        images: { total: images.length, empty: images.filter((i) => !i.src).length },
        unlisted,
        stale,
      }, null, 2),
    };
  },

  place(root, slug, id, pointer) {
    if (!id || !pointer) return { code: 1, out: USAGE };
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'intake', 'photos', 'manifest.json'), 'utf8'));
    const entry = manifest.find((p) => p.id === id);
    if (!entry) return { code: 1, out: `no photo ${id} in the manifest` };
    return { code: 0, out: placePhoto({ from: path.join(root, entry.file), siteDir: root, pointer }) };
  },
};

export function run(argv, { cwd = process.cwd() } = {}) {
  const [cmd, slug, ...rest] = argv;
  if (!commands[cmd] || !slug) return { code: 1, out: USAGE };
  return commands[cmd](path.resolve(cwd, slug), slug, ...rest);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { code, out } = run(process.argv.slice(2));
  (code ? console.error : console.log)(out);
  process.exit(code);
}
```

- [ ] **Step 4: Run tests**

Run: `node --test lib/copy-cli.test.mjs && npm test 2>&1 | grep -E "^# (pass|fail)"`
Expected: pass; `# fail 0`.

- [ ] **Step 5: Confirm instaloader's file names against one real post**

The `~` delimiter and the `_N` suffix are assumptions about instaloader until seen:

```bash
cd /mnt/c/Users/Snic9/keepsitemedia
export PATH="$HOME/.local/bin:$PATH"
T=$(mktemp -d)
ACCOUNT=$(ls ~/.config/instaloader | sed -n 's/^session-//p')
instaloader --login=$ACCOUNT --no-videos --no-video-thumbnails --no-metadata-json --no-compress-json \
  --dirname-pattern=$T "--filename-pattern={date_utc}_UTC_{shortcode}~" -- -DZpxfePFnkD
ls $T
```
Expected: files like `2026-06-16_…_UTC_DZpxfePFnkD~_1.jpg`, `…~_2.jpg`, and `…~.txt`. If the names differ, change the `IG` regex in `lib/photo-manifest.mjs` and its tests to match what instaloader actually writes, then re-run Task 4's tests. Run `mkdir -p $T/intake/photos && mv $T/*~* $T/intake/photos/ 2>/dev/null; mkdir -p $T/x/intake/photos/instagram && cp $T/intake/photos/* $T/x/intake/photos/instagram/ && node -e "import('/mnt/c/Users/Snic9/keepsitemedia/keepsite-skills/lib/photo-manifest.mjs').then(m=>console.log(JSON.stringify(m.buildManifest('$T/x'),null,1)))"` and confirm each image has the post's caption. Delete `$T`.

- [ ] **Step 6: Commit**

```bash
git add lib/copy-cli.mjs lib/copy-cli.test.mjs
git commit -m "Add the copy CLI" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: The skill

**Files:**
- Create: `skills/keepsite-copy/SKILL.md`
- Create: `skills/keepsite-copy/references/gather.md`, `references/voice.md`, `references/photos.md`, `references/copy.md`
- Create: `skills/keepsite-copy/templates/copy-sources.md`, `templates/copy-deck.md`
- Modify: `skills/skills.test.mjs` (expected skills), `README.md`

**Interfaces:**
- Consumes: the CLI commands from Task 9, `ImageArea` props from Task 8, `copy-status.json` from Task 7.

- [ ] **Step 1: Write the failing test**

In `skills/skills.test.mjs`, add to the `the expected skills exist` test:

```js
  assert.ok(skills.includes('keepsite-copy'));
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test skills/skills.test.mjs`
Expected: FAIL on `keepsite-copy`.

- [ ] **Step 3: Write the skill**

`skills/keepsite-copy/SKILL.md`:

````markdown
---
name: keepsite-copy
description: Use when writing the first pass of a Keepsite client's Stage Three copy and photographs into their built site. Triggers include "write copy for [client]", "stage three for [client]", "fill the site for [client]", or a request to replace a client's lorem and image areas with real copy and photos. Needs a Stage Two site from keepsite-build, intake/sitemap.md and keywords.md, and intake/copy-sources.md naming the voice file, brand guide, photo sources and reviews.
---

# Keepsite Copy

## What this produces

A first draft for the owner, not a deliverable for the client:

- Real copy in `{slug}/src/data/**/*.json`, in the client's voice, with each
  page's keywords where the sitemap assigns them.
- Real photographs in `{slug}/src/assets/photos/`, wired into the image slots
  they fit. Slots with no good match stay outlined.
- `{slug}/src/data/copy-status.json`, listing lorem left on purpose.
- `{slug}/intake/voice.md`, the voice guide.
- `{slug}/intake/copy-deck.md`, the one document the owner reviews.

The owner reviews the deck and the preview together. Nothing is sent to the
client and nothing is deployed.

## Before you start

Work from the workspace root, `/mnt/c/Users/Snic9/keepsitemedia/`.
`$SKILL_DIR` is this skill's own directory. Every command below runs from the
workspace root.

If `{slug}/intake/copy-sources.md` does not exist, copy
`templates/copy-sources.md` there, fill in what you can find (a `Voice.txt`
at the client root, a brand guide in `intake/`, the Instagram handle from the
brief), and ask the owner to confirm it before going on.

```bash
node $SKILL_DIR/lib/copy-cli.mjs check {slug}
```

Stop on any error. `check` also confirms `brief.md`, `sitemap.md`,
`keywords.md` and `src/data/` exist. The page set must be final: if the brief
or the owner says a page-set decision is still open, stop and say so, because
copy written for a page that is then merged is wasted.

Work on a branch in the client repo: `cd {slug} && git switch -c stage-three-copy`.

## Step 1 — gather

Follow `references/gather.md`. It normalises every photo source into
`{slug}/intake/photos/`, parses the voice file and the reviews, and builds the
photo manifest.

## Step 2 — voice guide

Follow `references/voice.md`. Write `{slug}/intake/voice.md` before any copy.

## Step 3 — photos

Follow `references/photos.md`. Bring the site's `ImageArea` and verifier up to
the current template first; that reference says how.

## Step 4 — copy

Follow `references/copy.md`, page by page, in `sitemap.md` order.

## Step 5 — gate

```bash
cd {slug} && npm run gate
```

Fix what fails. Lorem left on purpose goes in `src/data/copy-status.json`
with a reason; the gate fails on lorem that is not listed there and warns on
lorem that is. Do not list lorem to get a green build; list it only when the
deck explains why it is still lorem.

## Step 6 — deck and hand-off

Copy `templates/copy-deck.md` to `{slug}/intake/copy-deck.md` and fill every
section. Commit on the branch. Report to the owner: the preview command
(`cd {slug} && npm run preview`), the deck path, and the counts from each
list at the end of the deck. Do not push or deploy.

## Rules that do not bend

| Rule | Why |
|---|---|
| No invented facts: prices, years, counts, venues, fees, policies | A wrong price on a live site is a promise; write around it or insert `[confirm: …]` |
| Testimonials are verbatim from `reviews.json` or a client's own words in a caption | A composed review is deceptive, and it is the one thing on the site that could hurt her |
| Client rules come from `brief.md` and apply to every line | This skill holds no client-specific rules; the brief does |
| Structural text stays: titles, H1s, nav, buttons, section labels, form labels | Those were approved at Stage Two; a mismatch is listed in the deck, not fixed |
| Never ask for or store an Instagram password | The owner's saved instaloader session is the only credential |
| Do not edit or re-run `intake/content.mjs` | It is the Stage Two generator; this pass writes the JSON directly |

## Common mistakes

| Mistake | Fix |
|---|---|
| Writing copy before `voice.md` exists | The guide is what makes page 12 sound like page 1 |
| Keyword in every paragraph | Once each, where `keywords.md` places it, in a sentence she would say |
| Emoji and hashtags copied from captions onto the site | The guide decides the site register; hashtags never |
| A place page with photos from somewhere else | Leave the slot outlined and list it |
| Quoting past a review's "… More" | Use `quotable` text only; list the review for the owner to expand |
| Listing lorem in `copy-status.json` to pass the gate | Fill it, or explain it in the deck |
````

`skills/keepsite-copy/references/gather.md`:

````markdown
# Gather

Everything lands in `{slug}/intake/`, which is gitignored.

## Photos

For each `Photos:` line in `copy-sources.md`:

**instagram**

```bash
node $SKILL_DIR/lib/copy-cli.mjs instagram {slug}
```

prints the instaloader command. Run it in the background (it is rate-limited
and takes minutes for a few hundred posts), with `$HOME/.local/bin` on `PATH`.
If `copy-cli` reports no session, stop and ask the owner to run
`! instaloader --login=<their throwaway account>` in the prompt. Never ask for
the password.

If instaloader reports a login or checkpoint error, stop and tell the owner;
retrying hammers the account. `--fast-update` makes a re-run fetch only new
posts.

**Google Drive folder link**

```bash
pip3 install --user gdown   # once
gdown --folder "<link>" -O {slug}/intake/photos/drive/
```

This works for folders shared as "Anyone with the link". If it fails, ask the
owner to download the folder from Drive, unzip it into
`{slug}/intake/photos/drive/`, and carry on.

**Dropbox share link**

```bash
curl -L "<link with dl=0 changed to dl=1>" -o /tmp/dropbox.zip
unzip -o /tmp/dropbox.zip -d {slug}/intake/photos/dropbox/
```

**Local folder**

```bash
cp -r "{slug}/<path>" {slug}/intake/photos/local/
```

Then:

```bash
node $SKILL_DIR/lib/copy-cli.mjs manifest {slug}
```

writes `intake/photos/manifest.json` and prints the photo count, how many
have no credit, and any file ImageMagick could not read.

## Voice and reviews

```bash
node $SKILL_DIR/lib/copy-cli.mjs voice {slug}
node $SKILL_DIR/lib/copy-cli.mjs reviews {slug}
```

`voice` writes `intake/voice-posts.json`; read its warnings, since a stray
line in the voice file is usually a note the owner meant for you.

`reviews` needs `intake/reviews.txt`. If it is missing and `copy-sources.md`
names a reviews link, ask the owner to open the link, select the whole review
list, and paste it into that file. Google renders reviews in the browser, so a
plain fetch returns nothing. If Claude in Chrome is connected and the owner
prefers it, read the review list through it instead and write the same paste
format to `reviews.txt`.
````

`skills/keepsite-copy/references/voice.md`:

````markdown
# Voice guide

Write `{slug}/intake/voice.md` from, in order of authority:

1. The brand guide named in `copy-sources.md`. If it is a PDF with no text
   layer, read it as page images. Its rules are quoted, not paraphrased.
2. `intake/voice-posts.json`: the owner's curated sample, the strongest
   evidence of how she wants to sound.
3. Every caption in `intake/photos/manifest.json` (Instagram sources): volume,
   for vocabulary and habits.
4. Her replies in `intake/reviews.json` (`reply` fields): how she talks to a
   client one to one.

## Sections

- **In one paragraph**: who is speaking and to whom.
- **Words she uses**: with a quoted example and its post URL for each.
- **Words she avoids or never uses**: from the brand guide, or conspicuous by
  absence across the captions (say which).
- **Rhythm and punctuation**: sentence length, fragments, lists, capitals
  for emphasis, stretched words ("okayyyy"), ellipses, emoji.
- **How she addresses the reader**: "you", "future brides", "babe", …
- **Signature details**: facts and phrases only she would say, each cited.
  These are the raw material for the About page.
- **Brand-guide rules**: quoted.
- **Site register**: what carries over from social and what does not.
  Hashtags never. Emoji only if the brand guide shows them in brand copy;
  otherwise none. Emphatic capitals and stretched words: at most one per page,
  in a heading or pull line, never in body text. Warmth and direct address
  carry over everywhere.
- **Lines worth reusing**: captions that already say something the site needs
  to say, quoted, with where they could go.

Cite everything. A guide that says "warm and friendly" without an example
from her is not evidence of anything.
````

`skills/keepsite-copy/references/photos.md`:

````markdown
# Photos

## Bring the site up to the current template

Sites built before Stage Three support need two files from the template:

```bash
diff $SKILL_DIR/templates/astro/src/components/ImageArea.astro {slug}/src/components/ImageArea.astro
diff $SKILL_DIR/templates/astro/scripts/verify.mjs {slug}/scripts/verify.mjs
```

If the site's copies differ only by being older, copy the template's over.
If the site has its own changes, merge by hand and keep them.

Then make every call site pass the whole image object:

```bash
grep -rn "<ImageArea" {slug}/src
```

`<ImageArea ratio={image.ratio} caption={image.caption} />` becomes
`<ImageArea {...image} />`. Leave call sites that pass strings rather than an
object (before/after pairs) as they are; list their slots in the deck.

## Choose

```bash
node $SKILL_DIR/lib/copy-cli.mjs slots {slug}
```

For each image slot (`scanData`'s `images`; read the `pointer`, `ratio` and
`caption`), look at the candidate photos: open them with the Read tool, which
shows images. Do not choose from captions or file names alone.

In order:

1. **Subject**: the slot's caption names what Stage Two promised to show.
2. **Place**: an area or venue page only gets photographs from that place
   (caption, location, or the owner's folder name says so). Otherwise leave
   the slot outlined.
3. **Resolution**: the long edge covers the slot at 2× its rendered width;
   1600px is enough for a full-width hero, 800px for a card.
4. **Crop**: the subject survives the slot's ratio. Set `focus` (an
   `object-position`, e.g. `"50% 30%"`) when the face is off-centre.
5. **Once**: no photo in two slots, except a gallery built to repeat.
6. **Credit**: prefer credited photos; an uncredited pick goes on the deck's
   rights list.

## Place

```bash
node $SKILL_DIR/lib/copy-cli.mjs place {slug} <manifest-id> '<pointer>'
```

prints the `src` name. In the data object at that pointer, add:

- `"src"`: the printed name
- `"alt"`: what is in the photo, for someone who cannot see it: who, what,
  where; not "image of", not the keyword
- `"focus"`: only when the crop needs it
- `"eager": true`: only on the first image of a page when it is above the fold

Keep `ratio` and `caption`; the caption still names the slot for review.

Record each pick for the deck: pointer, manifest id, source URL, credit, and
one line on why.
````

`skills/keepsite-copy/references/copy.md`:

````markdown
# Copy

Read first: `intake/voice.md`, `intake/brief.md` (client rules and facts),
`intake/sitemap.md` (each page's job and section order), `intake/keywords.md`
(which keywords go on which page).

```bash
node $SKILL_DIR/lib/copy-cli.mjs slots {slug}
```

lists every lorem string as a pointer with its word count. Fill them page by
page in sitemap order, editing the JSON directly.

## Length

Stay within ±25% of the lorem's word count. The layout was approved with
that length; a 40-word slot holding 120 words breaks the design the client
signed off.

## Keywords

Each page's keywords go where `keywords.md` and `sitemap.md` put them:
the title tag and H1 are structural and already set, so in practice the hero
lead, the meta description (`description`), and the first body paragraph.
Once each, reading as a sentence she would say. Record where each landed for
the deck.

## Facts

Every fact comes from the brief, the questionnaire submissions in `intake/`
(for facts only, never to reopen a decision), a caption, or a review. Note
the source for the deck. A fact no source holds: write around it, or put
`[confirm: what is needed]` in the text. The gate warns on every marker.

## Testimonials

Only from `intake/reviews.json`, using the `quotable` text (full text, or up
to the last complete sentence of a truncated review), attributed by the name
as displayed, first name and last initial unless the brief says otherwise.
Or a client's own words quoted in one of her captions. Choose reviews that
match the page: bridal reviews on bridal pages, wedding-party reviews on the
wedding-party page. Never edit a review's wording, spelling included. When
there are not enough, leave the slot lorem and list it in
`src/data/copy-status.json` with the reason.

## Her words

Where a caption already says what a section needs, reuse the line, adapted
to the site register from the voice guide. Mark each reused line for the
deck.

## Structure

Titles, H1s, nav labels, buttons, section eyebrows and form labels are not
rewritten. If one no longer fits the copy beneath it, list it in the deck.

## After each page

```bash
node $SKILL_DIR/lib/copy-cli.mjs slots {slug}
```

The page's pointers should be gone from `unlisted`.
````

`skills/keepsite-copy/templates/copy-sources.md`:

```markdown
# Copy sources

Voice: Voice.txt
Brand guide: intake/BrandGuide.pdf
Instagram: handle-without-at
Photos: instagram
Reviews: https://share.google/…
```

`skills/keepsite-copy/templates/copy-deck.md`:

```markdown
# {Brand} — Stage Three copy deck

First pass, {date}. Branch `stage-three-copy`. Preview: `cd {slug} && npm run preview`.

Sources: voice file ({n} posts), {n} Instagram captions, brand guide
{yes/no}, {n} Google reviews ({n} truncated), {n} photos ({n} uncredited).

---

## {Page title} — `{path}`

**Keywords:** `{keyword}` → {where it landed} · …

**Copy**

{each filled slot: section label, then the text; reused lines marked ↺ with the post URL}

**Photos**

| Slot | Photo | Why | Credit |
|---|---|---|---|

**Facts used:** {fact} — {source} · …

---

(repeat per page, in sitemap order)

## For the owner

### Photos with no known credit

Confirm usage rights with the client before launch.

| Page | Slot | Photo | Source URL |
|---|---|---|---|

### Image slots left empty

| Page | Slot | What it needs |
|---|---|---|

### To confirm

| Page | Pointer | Marker |
|---|---|---|

### Lorem left on purpose

Mirrors `src/data/copy-status.json`.

| Pointer | Reason |
|---|---|

### Reviews to expand on Google

Truncated reviews worth quoting in full.

### Structural labels that no longer fit

| Page | Label | Suggested change |
|---|---|---|
```

Add to `README.md`, in the skills list:

```markdown
- `skills/keepsite-copy` — Stage Three first pass: reads the client's voice
  file, brand guide, reviews and photos, and writes real copy and photographs
  into the built site, with a review deck for the owner.
```

and the design spec line:

```markdown
Stage Three spec: `../keepsite/docs/superpowers/specs/2026-09-26-keepsite-copy-design.md`
```

Also change the opening sentence "Source of truth for two Claude Code skills that implement Stage Two" to "Source of truth for the Claude Code skills that implement Stages Two and Three", and update the `description` in `package.json` to name all three skills.

- [ ] **Step 4: Run tests**

Run: `npm test 2>&1 | grep -E "^# (pass|fail)|^not ok"`
Expected: `# fail 0`. `skills.test.mjs` checks the frontmatter, that every `references/…` and `templates/…` path named in SKILL.md exists, and that every `lib/….mjs` path in any of the skill's documents resolves after install.

- [ ] **Step 5: Commit**

```bash
git add skills/keepsite-copy skills/skills.test.mjs README.md package.json
git commit -m "Add the keepsite-copy skill" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: End-to-end fixture

**Files:**
- Create: `fixtures/copy/client/` (fixture tree below), `lib/copy-e2e.test.mjs`

**Interfaces:**
- Consumes: `run` from `lib/copy-cli.mjs`.

- [ ] **Step 1: Create the fixture**

```bash
cd /mnt/c/Users/Snic9/keepsitemedia/keepsite-skills
F=fixtures/copy/client
mkdir -p $F/intake $F/photos $F/src/data/services
printf 'Voice: Voice.txt\r\nBrand guide: intake/guide.md\r\nPhotos: photos\r\nReviews: https://share.google/fixture\r\n' > $F/intake/copy-sources.md
printf 'https://www.instagram.com/p/AAA/\r\nHello, beautiful! 🤍\r\n\r\nSoft glam is my favourite.\r\nProfile: https://www.instagram.com/p/BBB/\r\nhttps://www.instagram.com/p/BBB/\r\nGreen flags > cheap prices.\r\n' > $F/Voice.txt
printf '# Guide\n\nWarm, never salesy.\n' > $F/intake/guide.md
printf '# Brief\n' > $F/intake/brief.md
printf '# Sitemap\n' > $F/intake/sitemap.md
printf '# Keywords\n' > $F/intake/keywords.md
printf 'Ann Lee\n2 reviews\na month ago\nShe was wonderful. She also … More\nMakeupbyfixture (Owner)\na month ago\nThank you!\nBea\nLocal Guide·3 reviews·1 photo\n2 months ago\nBest day ever!\nPhoto 1 in review by Bea\n' > $F/intake/reviews.txt
convert -size 1200x1500 xc:#c8a $F/photos/bride.jpg
convert -size 900x900 xc:#a86 $F/photos/detail.png
```

Write `$F/src/data/home.json` with a node one-liner so the lorem is real:

```bash
node -e "
import('./lib/lorem.mjs').then(({ lorem }) => {
  const fs = require('fs');
  fs.writeFileSync('$F/src/data/home.json', JSON.stringify({
    title: 'Fixture | Utah Bridal Makeup',
    description: lorem('meta-description', 'home-meta'),
    hero: { title: 'Bridal makeup', body: lorem('body', 'home-hero'), image: { ratio: '4/5', caption: 'Bride' } },
    reviews: { items: [{ quote: lorem('quote', 'q'), attribution: lorem('attribution', 'a') }] },
  }, null, 2));
  fs.writeFileSync('$F/src/data/services/bridal.json', JSON.stringify({
    hero: { body: lorem('body', 'svc'), image: { ratio: '3/2', caption: 'Detail' } },
  }, null, 2));
});"
```

`fixtures/copy/client/intake/` must not be gitignored in this repo; confirm with `git check-ignore -v fixtures/copy/client/intake/copy-sources.md` (no output means it is tracked).

- [ ] **Step 2: Write the test**

`lib/copy-e2e.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { run } from './copy-cli.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = path.join(here, '..', 'fixtures', 'copy', 'client');
const hasMagick = (() => {
  try { execFileSync('convert', ['-version']); return true; } catch { return false; }
})();

function workspace() {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'ks-copy-e2e-'));
  fs.cpSync(fixture, path.join(cwd, 'client'), { recursive: true });
  return cwd;
}

test('the fixture client runs through the deterministic chain', { skip: !hasMagick }, () => {
  const cwd = workspace();
  const root = path.join(cwd, 'client');
  const ok = (args) => {
    const r = run(args, { cwd });
    assert.equal(r.code, 0, `${args.join(' ')}: ${r.out}`);
    return r.out;
  };

  assert.match(ok(['check', 'client']), /^ok$|warning/);

  assert.match(ok(['voice', 'client']), /2 post\(s\)[\s\S]*ignored/);
  const posts = JSON.parse(fs.readFileSync(path.join(root, 'intake', 'voice-posts.json'), 'utf8'));
  assert.equal(posts[0].caption, 'Hello, beautiful! 🤍\n\nSoft glam is my favourite.');

  assert.match(ok(['reviews', 'client']), /2 review\(s\), 1 truncated/);
  const { reviews } = JSON.parse(fs.readFileSync(path.join(root, 'intake', 'reviews.json'), 'utf8'));
  assert.equal(reviews[0].reply, 'Thank you!');

  fs.mkdirSync(path.join(root, 'intake', 'photos', 'local'), { recursive: true });
  fs.cpSync(path.join(root, 'photos'), path.join(root, 'intake', 'photos', 'local'), { recursive: true });
  assert.match(ok(['manifest', 'client']), /2 photo\(s\), 2 with no credit/);

  const before = JSON.parse(ok(['slots', 'client']));
  assert.deepEqual(before.images, { total: 2, empty: 2 });
  assert.equal(before.unlisted.length, before.copy);

  const src = ok(['place', 'client', 'local-bride-jpg', 'home.json#/hero/image']);
  assert.equal(src, 'home-hero-image.jpg');
  assert.ok(fs.existsSync(path.join(root, 'src', 'assets', 'photos', src)));
});
```

- [ ] **Step 3: Run it**

Run: `node --test lib/copy-e2e.test.mjs && npm test 2>&1 | grep -E "^# (pass|fail)"`
Expected: pass; `# fail 0`. A failure here is a mismatch between two tasks' interfaces; fix the module that departs from its task's **Interfaces** block.

- [ ] **Step 4: Commit**

```bash
git add fixtures/copy lib/copy-e2e.test.mjs
git commit -m "Cover keepsite-copy end to end" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: Install and dry-run on the first client

**Files:**
- Create: `makeup-by-brynlie/intake/copy-sources.md` (gitignored in the client repo; not committed anywhere)

- [ ] **Step 1: Install**

```bash
cd /mnt/c/Users/Snic9/keepsitemedia/keepsite-skills && npm test 2>&1 | grep -E "^# (pass|fail)" && npm run install-skills
```
Expected: `# fail 0`, then `installed …/keepsite-copy` among the lines.

- [ ] **Step 2: Write Brynlie's sources file**

`makeup-by-brynlie/intake/copy-sources.md`:

```markdown
# Copy sources

Voice: Voice.txt
Brand guide: intake/BrandGuide.pdf
Instagram: makeupbybrynlie
Photos: instagram
Reviews: https://share.google/85VLOPpkhyaCuFCqH
```

- [ ] **Step 3: Dry-run the read-only commands**

```bash
cd /mnt/c/Users/Snic9/keepsitemedia
S=~/.claude/skills/keepsite-copy/lib/copy-cli.mjs
node $S check makeup-by-brynlie
node $S instagram makeup-by-brynlie
node $S voice makeup-by-brynlie
node $S reviews makeup-by-brynlie
node $S slots makeup-by-brynlie | head -20
```
Expected: `check` passes with one warning at most; `instagram` prints a command naming `makeupbybrynlie`; `voice` reports 8 posts and one ignored `Profile:` line; `reviews` reports the count from Task 3 Step 5; `slots` reports copy and image counts and every copy slot unlisted.

Do not run the instaloader download or write any copy: that is the skill's first real run, which the owner starts.

- [ ] **Step 4: Report**

Tell the owner the skill is installed, what the dry run printed, and that the first real run is `keepsite-copy` on `makeup-by-brynlie` once the page-set consolidation noted in the brief is settled.
