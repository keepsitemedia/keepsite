# keepsite-copy — Stage Three first pass

Date: 2026-09-26
Status: design approved in conversation, awaiting spec review

## Purpose

`keepsite-build` ends Stage Two with a site whose copy is seeded lorem and whose
photographs are outlined `ImageArea` regions. `keepsite-copy` produces the first
pass of Stage Three: real copy in the client's voice, real photographs in every
region that has a good match, and one document the owner reviews before anyone
else sees it.

It is a draft for the owner, not a deliverable for the client. Success is a
draft the owner edits rather than rewrites: copy that sounds like the client,
keywords placed where the sitemap assigns them, no invented facts, and every
open question listed in one place.

## Where it lives

`keepsite-skills/skills/keepsite-copy/`, alongside `keepsite-sitemap` and
`keepsite-build`, installed with `npm run install-skills`. Deterministic helpers
go in the shared `keepsite-skills/lib/` with `node --test` coverage.

Runs from the workspace root against `{slug}/`, like `keepsite-build`.

## Preconditions

- `{slug}/` passes `npm run gate` from `keepsite-build`.
- The page set is final. The copy is written against `sitemap.md`; a change
  round after this pass means re-running it for the affected pages.
- `{slug}/intake/copy-sources.md` exists (below).

The skill stops and reports if any of these fail.

## Inputs

### `intake/copy-sources.md`

One file that names every source, so nothing depends on where a line happens to
sit inside another file:

```markdown
# Copy sources

Voice: Voice.txt
Brand guide: intake/BrandGuide.pdf
Instagram: makeupbybrynlie
Photos: instagram
Reviews: https://share.google/85VLOPpkhyaCuFCqH
```

| Field | Required | Values |
|---|---|---|
| Voice | yes | Path to the voice file |
| Brand guide | no | Path to a PDF, Markdown, or image folder |
| Instagram | no | Handle, no `@` |
| Photos | yes | `instagram`, a Google Drive folder URL, a Dropbox share URL, or a local folder path; several allowed, one per line |
| Reviews | no | Google Business Profile link; several allowed |

### Voice file

Blocks of a post URL followed by that post's exact caption, blocks separated by
the next URL. Lines outside that shape (such as a stray `Profile:` line) are
ignored with a warning. The file is the owner's curated sample; when Instagram
is a source, every downloaded caption supplements it.

### Also read

`intake/brief.md`, `intake/sitemap.md`, `intake/keywords.md`, and the site's
`src/data/**/*.json`. The two questionnaire submissions are read for facts
only (prices, policies, years, locations), never to revisit a page-set
decision.

## Pipeline

One run, no mid-point stop. The owner reviews once, at the end.

### 1. Check inputs

Parse `copy-sources.md`, confirm each named file exists, and confirm the
preconditions. Missing required input: stop and say which.

### 2. Gather

Every source is normalized into `intake/photos/`, so everything after this
step is source-agnostic.

| Source | Method |
|---|---|
| Instagram | `instaloader` with the owner's saved session (`~/.config/instaloader/`), `--no-videos --no-video-thumbnails`, posts and captions, rate-limited. Never takes or stores a password; if no session exists, stop and tell the owner to run `! instaloader --login=<account>`. |
| Google Drive | The Drive connector when authenticated; a public folder link otherwise |
| Dropbox | Share link with `dl=1`, unzipped |
| Local folder | Copied |

Output: `intake/photos/manifest.json`, one entry per image:

```json
{
  "id": "ig-DZpxfePFnkD-2",
  "file": "intake/photos/instagram/DZpxfePFnkD_2.jpg",
  "width": 1080, "height": 1350,
  "source": "instagram",
  "sourceUrl": "https://www.instagram.com/p/DZpxfePFnkD/",
  "date": "2026-06-16",
  "caption": "…",
  "credit": "Brynlie Peay | Utah Makeup Artist",
  "creditSource": "caption"
}
```

`credit` is taken from the caption, tagged accounts, or file metadata;
`null` when none is found.

Reviews are gathered to `intake/reviews.json`: verbatim text, reviewer name as
displayed, relative date as displayed, source URL, and a `truncated` flag.
Google renders reviews client-side, so the primary path is the owner pasting
the profile's review list into `intake/reviews.txt`, exactly as copied; the
skill parses that. Claude in Chrome is the alternative when the owner prefers
it. The paste format:

- A review starts at the reviewer's name, followed by a count line
  (`Local Guide·14 reviews·13 photos`, `2 reviews`) and a date line
  (`6 months ago`, `Edited a month ago`, `3 weeks agoNew`).
- Text runs until the next name block. `Photo N in review by …` lines and
  reaction lines (`❤️1`) are dropped.
- A block named `… (Owner)` is her reply and attaches to the review above it;
  replies are voice material, never testimonials.
- Text ending in `… More` is truncated: `truncated: true`. A truncated review
  is quoted only up to a complete sentence, or listed in the deck for the owner
  to expand on Google.
- The paste carries no star ratings, so the site shows none per review.

`intake/` is already gitignored, so none of this is committed.

### 3. Voice guide

Writes `intake/voice.md` from the brand guide (read as images when it has no
text layer), the voice file, and every downloaded caption. Contents:

- Vocabulary she uses and avoids, with examples
- Sentence rhythm, punctuation, capitalization habits
- How she addresses the reader
- Signature details and phrases, each cited to its post
- Brand-guide rules, quoted
- The site register: what carries over from social and what does not
  (hashtags never; emoji only if the brand guide permits; emphatic caps and
  stretched words sparingly)

### 4. Photo selection

For every `ImageArea` slot in `src/data`, choose one manifest image by:

1. Fit to the slot's caption (the subject named in Stage Two)
2. Fit to the page — a place page only gets photographs from that place
3. Resolution sufficient for the slot at 2× its rendered width
4. Crop to the slot's ratio without losing the subject
5. No image used twice unless the slot is a repeat by design (a gallery)

Slots with no adequate match stay `ImageArea` and are listed in the deck.

Chosen images are copied to `src/assets/photos/{page}-{slot}.{ext}`. The data
entry for the slot gains `src` and `alt` (and `focus` when the crop needs one);
`ImageArea` renders an `astro:assets` `<Picture>` when `src` is set and the
outlined region otherwise. This is a change to the `ImageArea` template in
`keepsite-build`, so Stage Two builds keep working unchanged. Astro produces
AVIF/WebP and responsive sizes at build time; the skill does no format
conversion itself.

### 5. Copy

Replace every lorem slot in `src/data/**/*.json`, page by page, holding to the
slot's length band from `lib/lorem.mjs`.

Rules:

- **No invented facts.** Prices, years, counts, venues, travel fees, and
  policies come from the brief, the questionnaires, or her posts, and the deck
  cites which. Where copy needs a fact no source holds, write around it or
  insert `[confirm: …]`.
- **Testimonials are verbatim** from `reviews.json` or a caption where a client
  thanks her, attributed as displayed. Too few real ones: the remaining slots
  keep lorem and are listed. Never paraphrase or compose a review.
- **Client rules come from `brief.md`** (for example, makeup-first wording and
  hair only alongside makeup). The skill carries no client-specific rules.
- **Keywords** go only where `keywords.md` and `sitemap.md` assign them — title
  tag, H1 or hero lead, meta description, first paragraph — once each, in a
  sentence she would say.
- **Her own phrasing** may be reused where a caption already says the thing
  well; the deck marks reused lines.
- **Structure stays.** Titles, H1s, nav, buttons, section labels, and form
  labels are Stage Two decisions and are not rewritten. A mismatch between a
  structural label and the new copy is listed, not fixed.

`intake/content.mjs`, where present, is the Stage Two generator; the skill
writes the JSON directly and does not edit or re-run it.

### 6. Gate and deck

Run `npm run gate` and fix what fails.

Write `intake/copy-deck.md`:

- Per page: the copy as written, each keyword and where it landed, each photo
  with its reason and credit, reused lines marked
- **Photos with no known credit** — confirm rights with the client before launch
- **Empty image slots** — what the slot needs
- **To confirm** — every `[confirm: …]`, with the page and slot
- **Remaining lorem** — testimonial or other slots left unfilled, and why
- **Structural mismatches** — labels that no longer fit their copy

## Verification

Added to the site's `scripts/verify.mjs` through the `keepsite-build`
template:

- Lorem remaining in a content slot fails the gate unless the slot is listed
  in `copy-deck.md`'s remaining-lorem section; listed slots pass with a
  warning.
- `[confirm: …]` markers pass with a warning. Launch is gated separately.

## Library and tests

In `keepsite-skills/lib/`, each with a `.test.mjs`:

| Module | Job |
|---|---|
| `copy-sources.mjs` | Parse and validate `copy-sources.md` |
| `voice-file.mjs` | Parse the voice file into `{url, caption}` blocks, with warnings for stray lines |
| `photo-manifest.mjs` | Build `manifest.json` from each source's download folder, including credit extraction |
| `reviews.mjs` | Parse `reviews.txt` into `reviews.json` |
| `slots.mjs` | Walk `src/data` and list every lorem slot and `ImageArea` slot with its page and seed |

End-to-end: a fixture client in `keepsite-skills/fixtures/copy/` with a small
voice file, a local photo folder, and a Stage Two data tree; the test confirms
the manifest, the slot list, and the deck skeleton. The writing and photo
judgment are not unit-tested; the deck is where the owner checks them.

## Out of scope

- Publishing, deploying, or sending anything to the client
- Rewriting the page set, navigation, or structural labels
- Journal posts beyond any the sitemap lists as launch pages
- Video
- Editing photographs beyond cropping to the slot ratio

## First client

Makeup by Brynlie. Her `Voice.txt` has a mid-file `Profile:` line pointing at a
post rather than her profile; `copy-sources.md` supersedes it. `BrandGuide.pdf`
has no extractable text in this environment (`pdftotext` is not installed) and
is read as page images.
