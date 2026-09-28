# Site refresh: slate band, bigger type, package pages, About — design

**Status:** approved in chat 2026-09-27
**Builds on** `2026-09-13-rebrand-design.md` (palette, type roles, ornament) and `2026-09-12-four-packages-design.md` (package content). Both stay in force; this spec changes how the pages use them and adds five pages.

## 1. Why

The site reads as plain. Not because of the palette, but because every section on every page is the same object: a heading, the 3px rule, a grid of small bold subheads over grey paragraphs. The home page runs it five times. The logo's slate, mustard and copper appear at 24px above each h1 and as 6px tier borders, and nowhere at scale. Headlines top out around 2.1rem. The packages page hides what differs behind four closed panels. There is nothing to look at except the handwritten week.

What stays: the handwritten week, the stripe and rule ornament, the three type roles, the no-cards rule, the copy voice, and the verify gate.

## 2. Goals

- Each of home, packages, the four package pages, how it works and About has one full-width slate moment, and it is the biggest type on the page.
- Headlines carry the personality: one step larger sitewide, measures tight enough that lines break in two or three words.
- The four packages each have a page a reader can land on from search and understand without clicking anything.
- An About page answers "who are these people" and "I've been burned before."
- Every page still passes `npm run gate` and the Netlify Lighthouse accessibility gate at 100.

## 3. Non-goals

- The Work page. Its code exists and switches on at two entries. It waits for the first two client sites to launch.
- Industry and location pages. They wait for the SEO analysis.
- Any new color, typeface or ornament. The token table in the rebrand spec is unchanged.
- The office (`/office/`), the signing page, the questionnaires and the pay pages. They inherit the type tokens and nothing else; they are checked, not redesigned.
- The Lockii page. It inherits tokens and is checked by screenshot, nothing more.
- Copy rewrites beyond what the new pages need. Existing copy is already in the voice.

## 4. Slate band

The slate fill (`--color-slate`, `#628997`) becomes a section background, once per page, for the plain-truth moment: the feeling named, the fit stated, the homework crossed off. The color gets one meaning across the site.

Rules, all of which follow from contrast:

| Pair | Ratio | Allowed |
|---|---|---|
| ink `#111111` on slate | 4.98:1 | yes, any size |
| white on slate | 3.8:1 | no |
| muted `#5A5A5A` on slate | 2.2:1 | no |
| rust `#B8512C` on slate | 1.3:1 | no |

So a slate band holds ink text only. No muted paragraphs, no rust links, no `.serif` accent, no `.link-arrow`. The one control allowed is `.btn` (ink fill, white text). The `h2::before` rule stays ink. Focus ring on slate: `0 0 0 2px var(--color-slate), 0 0 0 4px var(--color-ink)`, added beside the existing `.section-alt` and `.section-deep` rules.

CSS: a `.section-slate` class in `global.css`, `background: var(--color-slate); color: var(--color-ink)`, with `.section-slate p { color: var(--color-ink) }` and `.section-slate .muted { color: var(--color-ink) }` so nothing inside can fall below 4.5:1 by inheriting a token. A slate band never sits directly against `.section-alt`; white on both sides.

The band's statement is a `.statement` element: `font-size: var(--step-5)`, `max-width: 16ch`, `line-height: 1.02`, `letter-spacing: -0.025em`, weight 700. It is the biggest type on its page. On home it is the h2 of the problem section; elsewhere it is whichever heading the section already has.

## 5. Type

Global token changes in `global.css`:

| Element | Now | Becomes |
|---|---|---|
| `h1` | `--step-4` | `--step-5`, `max-width: 14ch` |
| `h2` | `--step-3` | `--step-4`, `max-width: 18ch` |
| `h3` | `--step-2` | unchanged |
| `.statement` | | `--step-5`, `16ch` (section 4) |

Pages that already override `h1` to `--step-5` (home) lose the override. Section h3s inside grids keep their local `--step-1` and `--step-2` sizes. Body, lead, label and serif roles are unchanged. Every `&rarr;` appended to link and button text is removed: `.link-arrow`'s 2px underline and the button fill carry the affordance. Caps labels that name a thing the reader needs (the hero's "Your week", "What you see" / "What you decide") stay; none is added.

Checked after the change: every h1 and h2 still fits at 320px without breaking mid-word (`text-wrap: balance` is already set; `overflow-wrap` covers the rest).

## 6. Home

Section order becomes:

1. Hero: unchanged.
2. Problem: **the slate band.** "You've been meaning to fix your website for a year." as the `.statement`, then the existing body in ink at `--step-2`. Nothing else in the band. It follows the hero directly, so the page opens white, then slate, then white.
3. Solution: the three beats and the serif pull line, on white (was `.section-alt`; the alt band moves to section 4 so slate is not adjacent to it).
4. Packages: the four rule-separated rows, on `.section-alt`. Each row links to its package page (`/packages/presence/`), not to a hash on the overview. The "See what's included, and what it costs" link stays and points to `/packages/`.
5. Work strip: unchanged, still guarded on two entries.
6. Closing: unchanged.

"Why Keepsite" leaves the home page. Its four pillars move to `about.json` (section 9). `home.json` loses the `why` object and the CMS config loses those fields.

## 7. Packages overview (`/packages/`)

The file moves from `src/pages/packages.astro` to `src/pages/packages/index.astro` so the tier pages can live beside it. The URL does not change.

Sections, in order:

1. Heading and intro: unchanged.
2. **Tiers, open.** The `<details>` stack is replaced by four full-width rows, one per tier, no disclosure. Each row:

   ```
   ┌──────────────────────────────────────────────────────────────────┐
   │ ▍Presence                        │ What we do        What we don't │
   │  A site you never have to        │ • …               — …           │
   │  think about.                    │ • …               — …           │
   │  For businesses that already …   │ • …               — …           │
   │                                  │                                 │
   │  $2,400 one-time build           │                                 │
   │  + $85/month                     │                                 │
   │  [ Start with Presence ]  Read more about Presence                 │
   └──────────────────────────────────────────────────────────────────┘
   ```

   Left column: name (h3, `--step-3`), the serif headline, the sub line, the price block, the CTA and a "More about Presence" link to the tier page. Right column: the two lists side by side. The 6px tier bar moves from the card's top edge to a left edge on the row (`border-left`), same four colors. Rows stack single-column under 900px with the lists one above the other. The `id` attributes stay so `/packages/#growth` still lands on Growth; the hash-open script is deleted and the verify script budget for `/packages/` drops by one.

3. How you pay: unchanged in content, moved to white so the slate band that follows does not touch the alt band.
4. **Which one is you: the slate band.** The sorter's heading becomes the `.statement`. The four questions and their answers set in ink. The package name after each answer is bold ink, not rust, and links to that tier page.
5. Keep your site working (the monthly): unchanged in content, on `.section-alt`.
6. Full comparison: unchanged, on white.
7. Add-ons on `.section-alt`, Questions about scope on white: unchanged in content.
8. Closing: unchanged.

JSON-LD is unchanged: the four `Service` nodes stay here with `url` pointing at `/packages/`, so the verify check on service count still holds.

## 8. Package pages (`/packages/<tier>/`)

One route, `src/pages/packages/[tier].astro`, with `getStaticPaths` over `packages.tiers`. Four URLs: `/packages/presence/`, `/packages/growth/`, `/packages/agile/`, `/packages/range/`.

### Content

Each page is built from the tier's existing fields plus a new `page` object per tier in `packages.json`:

```json
"page": {
  "title": "Presence | Keepsite Media",
  "description": "A custom site we build and keep running, for businesses that already find clients in person or on social. $2,400 to build, $85 a month.",
  "notIf": [
    { "tier": "growth", "text": "You want customers who find you on Google. That's Growth." }
  ],
  "faqTopics": ["switch-tools", "edit-myself", "what-monthly-covers"]
}
```

`notIf` holds one entry for each neighbouring tier (Presence has one, Growth and Agile have two, Range has one), written per the voice guide's rule: recommend one package and say in a sentence why not the one above and the one below. `faqTopics` references FAQ items by `topic`, with the same build-time check the overview uses for `scopeFaq`: an unknown topic fails the build.

The per-stage lines for the tier come from `process.json` (`stages.items[].tiers[].name === tier.name`), so the page shows what the three stages look like on this package with no new copy.

### Sections

Backgrounds run white, white, slate, alt, white, alt, then the closing band.

1. Heading: the tier name as h1, the serif headline under it, the sub line as lead. The stripe block above the h1 as on every page. White.
2. Who it's for and the two lists, one white section: `tier.who`, then `tier.feeling` as a quoted line in muted, then What we do / What we don't side by side under a hairline, same component as the overview row.
3. **Not this one if: the slate band.** Heading "Not this one if" as the `.statement`, then one paragraph per `notIf` entry in ink, each ending in a bold ink link to the neighbouring tier page.
4. What the build looks like on Presence: the three stage names with this tier's line under each, as a rule-separated row of three. Links to `/how-it-works/`. `.section-alt`.
5. Price, on white: the price block, the payment split in one sentence, the "Start with Presence" button linking to `/start/?tier=presence`. Range shows the floor and "Quoted after one conversation."
6. Questions about Presence: the `faqTopics` items as the same `details` list the overview uses, plus the "More questions" link to `/faq/`. `.section-alt`.
7. Closing: the shared component.

### Search

Each tier page carries one JSON-LD `Service` node with the same `@id` as its node on the overview (`https://www.keepsitemedia.com/packages/#presence`) and `url` set to the tier page. Same entity, two pages; the offers are copied from the same `amount()` helper so the price cannot drift. No FAQPage node, for the same reason the overview has none.

Canonical, og:image and the meta pair come from `page.title` and `page.description`. The pages are indexed and in the sitemap.

### Script budget

Zero scripts beyond JSON-LD and analytics. The tier preselect on `/start/` already reads `?tier=`.

## 9. About (`/about/`)

`src/pages/about.astro`, data in `src/data/about.json`, editable in the CMS as "About Page" under Site Settings.

Voice guide constraints that shape it: we run businesses too and that is why we understand the client; we are experts but don't perform it; wedding work is why we understand the client and is never the subject, so no wedding examples, imagery or industry language. The verify gate rejects the persona name "Sam" on any page, so the page speaks as "we" throughout and names nobody.

Sections:

Backgrounds run white, slate, white, alt, then the closing band.

1. Heading: "Who we are" as h1, lead: what Keepsite is in one sentence.
2. **We run businesses too: the slate band.** The `.statement` is "We run businesses too." followed by two short paragraphs in ink: the 10pm emails, the week lost to a one-hour job, the reason Keepsite exists.
3. How we work, on white: the four pillars from the home page, as a rule-separated row of four. Same copy, moved.
4. One photo slot in the same section, following the Lockii hero pattern: `image.src` empty renders nothing at all, not a placeholder. When a photo of the two of you at work exists it goes here. No stock.
5. What we say no to, on `.section-alt`: three short lines in the voice guide's "honest about fit" register (we tell you when the smaller package is enough; we don't sell pages one at a time; we don't give you a login, on purpose). Plain list, no cards.
6. Closing: the shared component, heading "Keep your business moving."

Navigation: "About" is added to `site.nav` after "How it works". The header and footer derive from `site.nav`, so both pick it up; the 404 page's link list gets it by hand. At 800px the header holds four links plus the button; that fits, and Work will make five when it arrives, which the row-cta and menu breakpoints already handle.

## 10. How it works

- Heading and lead: type scale only.
- The five steps: unchanged. They are a real sequence, so the numbers stay.
- The three stages rail: unchanged.
- Meetings and the changes note: unchanged, still inside the stages section on `.section-alt`.
- "What we need from you": leaves the two-column section and becomes a plain list in its own white section after the stages, so the things they do have to do are not in the same visual breath as the list they don't.
- **What you won't have to do: the slate band**, last before the closing, so the page ends on the relief. "What you won't have to do." as the `.statement` on the left and the five items as the handwritten crossed-out list on the right, the hero's device reprised once. Caveat is imported on this page as it is on home. Strokes and box edges in ink, not rust: rust on slate fails contrast and the band holds ink only. The struck text stays ink at full opacity, since muted fails on slate; the stroke does the work.
- The signature moves with the need-from-you list; the closing is unchanged.

## 11. FAQ

- Type scale only on the heading.
- From 900px the page becomes two columns: a sticky index of the five group titles on the left (a plain `nav` with anchor links to each group's `id`), the groups on the right at the existing 68ch measure. Under 900px the index is a row of links under the lead. No script.
- No slate band. The page has no single true thing to say; it has thirty.

## 12. Start and 404

Type scale only. Start keeps its narrow form. 404 adds the About link.

## 13. Files

| File | Change |
|---|---|
| `src/styles/global.css` | `h1`/`h2` sizes and measures, `.section-slate`, `.statement`, slate focus ring |
| `src/pages/index.astro` | problem band, section backgrounds, why section removed, tier links to tier pages, arrows removed |
| `src/pages/packages/index.astro` | moved from `packages.astro`; open tier rows, slate sorter, hash script removed |
| `src/pages/packages/[tier].astro` | new |
| `src/pages/about.astro` | new |
| `src/pages/how-it-works.astro` | slate band with the crossed-out list, need-from-you list below |
| `src/pages/faq.astro` | index column |
| `src/pages/404.astro` | About link |
| `src/components/WorkCard.astro` | arrow removed |
| `src/components/TierLists.astro` | new: the what-we-do / what-we-don't pair, used by the overview rows and the tier pages |
| `src/components/Checklist.astro` | new: the handwritten list extracted from the home hero so how-it-works can reuse it; takes items, a caption, and a `tone` of `rust` (hero) or `ink` (slate) |
| `src/data/packages.json` | `page` object per tier |
| `src/data/home.json` | `why` removed |
| `src/data/about.json` | new |
| `src/data/site.json` | About in `nav` |
| `public/admin/config.yml` | About Page file, tier `page` fields, home `why` fields removed |
| `scripts/verify.mjs` | five new pages in the public page list; `/packages/` script budget minus one; the persona and hourly checks already cover the new pages once listed |
| `README.md` | six page files, not five; About and the tier pages in the editing paragraph |

## 14. Verification

- `npm run gate` passes.
- Every public page, including the five new ones and Lockii, screenshotted at 1280 and 400 and checked by eye for: one slate band, ink-only text inside it, the statement as the largest type, no arrows, headings unbroken at 320px.
- Contrast: every text color pair inside `.section-slate` is ink on slate. Checked by grepping the built HTML for `muted`, `serif`, `link-arrow` or `href` inside any `section-slate` element and finding only the allowed `.btn` and bold ink links.
- Lighthouse accessibility 100 on the Netlify build for every page.
- The four tier pages and About appear in `sitemap-0.xml`; `/packages/#growth` still scrolls to the Growth row.
