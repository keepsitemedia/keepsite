# Stage Two build skills — design

Two user-level skills that take a client from "they filled in the
questionnaires" to "there is a Netlify preview of their site with real
structure, lorem copy, and outlined image regions" — Stage Two as the
Presence, Search, and Search Plus agreements define it.

- `keepsite-sitemap` derives the page set and writes it down.
- `keepsite-build` turns the written page set into an Astro repo.

They are separate because the sitemap is a judgment call that needs a
human veto, and the build is a long mechanical pass that gets re-run
after the client's one round of Stage Two changes. Splitting them means
a change round re-reads an edited sitemap instead of re-deriving
everything from CSV.

Both live in `~/.claude/skills/`, alongside `client-design-proposals`,
because they create sibling repositories and cannot be scoped to one
project.

## What Stage Two is

From Section 4.5–4.7 of the agreements (numbering varies by tier; the
text does not):

> We then design every page your site will have, in structure only:
> a. Real page layout, hierarchy, navigation, and where components sit;
> b. Image areas drawn as outlined regions, not as placeholder
>    photographs; and
> c. All text shown as lorem ipsum or similar placeholder text.

The client's approval "covers the page set, layout, structure, and
functionality only," and approving it "locks the page set for the build
fee." Two consequences drive the design: image regions are never
photographs, and the built page set must match the approved page set
exactly, because a difference is a billing question.

Stage Three places the client's real copy and photographs into these
approved layouts. The Stage Two build is therefore the real site, not a
mockup to be rebuilt.

## Inputs

Two Google Forms feed the process.

**Keepsite Demo Feedback and Brand Questionnaire** — completed after the
client sees their four-direction demo. Supplies: which demo feels
closest (Demo 1–4 or "A mix of several"), per-demo like/change
free-text, sections to keep as-is with the demo they came from, feel
words wanted, feel words refused, how visitors should feel, logo upload
and font/hex fallback, brand guide upload, other fonts and colors, and
photo uploads or a Google Photos link.

**Keepsite Search Package Initial Build Questionnaire** — 39 questions
across six sections. Supplies the business description, top services,
which to grow, which not to promote, service area, target geography,
ideal customers, what matters to them, repeat questions, primary and
secondary calls to action, the pages they know they want, services or
locations that may deserve their own page, homepage sections, features,
existing tools, inspiration sites, content sources, search vocabulary,
competitors, trust signals, review locations, credentials, seasonality,
and the one thing the site should do well.

Every question on the build questionnaire is optional. Skipped answers
are normal and must not fail the skill.

## Directory layout

One directory per brand, named for the slug, sibling to `keepsite/` and
`porter-productions/`. The slug matches the demo directory, which is how
the skill locates the demo.

```
/mnt/c/Users/Snic9/keepsitemedia/
  keepsite/
    public/demo/makeup-by-brynlie/index.html   <- the demo they saw
  makeup-by-brynlie/                            <- the Astro repo
    intake/                                     <- gitignored
      demo-feedback.csv
      build.csv
      keywords.md                               <- optional
      brand/                                    <- optional uploads
      brief.md                                  <- written by sitemap skill
      sitemap.md                                <- written by sitemap skill
      port/                                     <- written by build skill
    src/ public/ astro.config.mjs netlify.toml ...
```

`keepsite-sitemap` runs before the repo exists, so it creates
`{slug}/intake/` itself if the directory is absent. It creates nothing
else: no `git init`, no Astro scaffold. `keepsite-build` scaffolds the
repository around that existing `intake/` directory, and writes
`.gitignore` with `intake/` in it before running `git init`, in the same
block `keepsite/.gitignore` uses for internal business documents.
`intake/` never lives under `public/`, because everything under
`public/` is published by Netlify.

CSV shape is the Google Sheets default export: a header row of full
question text, one row per response. Questions are matched by
normalised header text, not column index, so adding a form question does
not silently shift the mapping. When a client has submitted a form more
than once — the Demo Feedback form explicitly invites it — the row with
the latest `Timestamp` wins and the skill says so in its chat summary.

## Stack

Astro on Netlify is the default for every client, matching `keepsite`
and `porter-productions`. Astro static plus Netlify Forms is the floor.

Decap CMS is omitted. Keepsite hosts the site and manages content and
SEO under the monthly service, so `public/admin` is not scaffolded
unless the brief records that this client will edit their own content.

Some requirements push a client off Astro. A real online shop,
membership or login, or a client portal are recorded as escalations: the
sitemap skill writes them into the brief and stops rather than
scaffolding around them. Escalation is a decision for the human, not a
default the skill picks.

## `keepsite-sitemap`

Invoked as "sitemap for makeup-by-brynlie". Reads intake, writes
`brief.md` and `sitemap.md`, stops.

### Flow

1. **Read intake.** Both CSVs, latest row per form. Report which
   questions came back empty.
2. **Resolve the direction.** The demo file contains four
   `.direction-divider` banners followed by four `<section>` elements,
   each with its own scoped class prefix. "Demo 2" is the second such
   section, and its prefix identifies the CSS to lift. If the answer is
   "A mix of several," read the four like/change free-texts and the
   section-keeps answer, propose a base direction, and ask the human to
   confirm before writing anything.
3. **Record section keeps.** The keeps answer names sections by content
   and demo ("services section Demo 4"). Each keep resolves to a section
   in a named direction and is recorded in the brief with its source
   prefix, so the build skill knows which CSS to lift from where.
4. **Determine tier.** Presence, Search, or Search Plus, from the signed
   agreement or by asking. Tier decides whether keyword work runs and
   whether copywriting at Stage Three is Keepsite's or the client's.
5. **Derive the page set.** The union of:
   - pages the client checked under "Which pages or areas do you know
     you want";
   - pages implied by checked features (appointment scheduling implies a
     booking page unless booking is a homepage section);
   - services named under "may deserve their own page";
   - locations from the service-area and target-geography answers;
   - for Search and Search Plus, keyword-derived pages.
6. **Keyword pass, Search and Search Plus only.** Seed terms come from
   the questionnaire's search-vocabulary answers — what someone would
   type into Google, the words customers use, industry words customers
   would not use, and what they want to be findable for. Web search
   against the named competitors checks what those competitors cover and
   where they are thin. If `intake/keywords.md` exists, it is read and
   takes precedence over derived terms. Presence gets no keyword pass;
   its page set comes from the questionnaire alone.
7. **Order sections per page.** The homepage order comes from the
   homepage-sections checkbox, sequenced so the primary call to action
   is reachable without scrolling and repeated at the foot. Other pages
   use a default order for their type.
8. **Map features to implementation.** Every checked feature resolves to
   exactly one of `in-house`, `stub`, or `escalate` (see Functionality
   below), and the mapping is written into the brief.
9. **Write the files and stop.** Chat summary states: page count, which
   pages were inferred rather than checked, what escalated, and which
   questions the client left blank.

### `brief.md`

The durable record of what was decided. Sections:

- Client, slug, tier, agreement date.
- Business: what they do, services, which to grow, which not to promote.
- Geography: service area, target areas.
- Audience: ideal customers, what matters to them, repeat questions.
- Actions: primary CTA, secondary CTA.
- Direction: base demo number and class prefix, plus each section keep
  with its source prefix.
- Feel: words wanted, words refused, intended visitor feeling.
- Brand: logo status, fonts and hex values, brand guide status, photo
  status. Records what exists, not what it looks like.
- Features: each checked feature with its `in-house` / `stub` /
  `escalate` resolution and, for stubs, the tool name.
- Trust signals, credentials, review locations.
- Seasonality and upcoming dates.
- Escalations and open questions.

### `sitemap.md`

The page set. For each page: title, path, one line of purpose, section
order top to bottom, and an `inferred` marker when the page did not come
from a client checkbox. A trailing list records pages considered and
rejected, with the reason.

Both files are the human's to edit. `keepsite-build` treats them as the
source of truth and never re-derives from CSV.

## `keepsite-build`

Invoked as "build makeup-by-brynlie". Reads `brief.md` and `sitemap.md`
only.

### Pass one — port

Lift the base direction's markup and CSS from the demo verbatim into
`intake/port/`, plus each named section keep from its own direction.
Untouched, high fidelity, never shipped. This is the reference the
productionize pass works against, and it survives on disk so a change
round does not repeat it.

### Pass two — productionize

Scaffold the repo on `keepsite`'s own shape: `astro.config.mjs` with
`@astrojs/sitemap`, `netlify.toml`, `src/layouts/BaseLayout.astro`,
`src/components/`, `src/data/`, `src/styles/global.css`,
`scripts/verify.mjs`, `package.json` carrying the same `dev`, `build`,
`check`, `verify`, and `gate` scripts. No `public/admin`.

Then rewrite the port to production quality:

- The port's ad-hoc CSS values become tokens in `global.css`. Every
  colour, type size, spacing step, radius, and rule weight is a custom
  property; no literal values survive in component CSS.
- Each ported section becomes an Astro component taking props, not a
  hard-coded block.
- Pages assemble from `sitemap.md`'s section order.
- Fonts move from Google Fonts CDN links to `@fontsource` packages,
  matching `keepsite`'s dependency style.
- Per-page content lives in `src/data/*.json`, so Stage Three replaces
  copy without touching components.

Re-running the build after a change round re-reads the edited
`sitemap.md` and rebuilds against the existing port reference.

## Placeholder system

### Lorem, scoped

Real English, because it is the structure being approved:

- navigation labels
- page `<title>` and `<h1>` page titles
- section labels
- button and link text
- form field labels and input types
- footer contact scaffolding — the labels, not the values
- `alt` text naming what the region is for

Lorem:

- headlines and subheads
- body copy
- testimonial quotes and attributions
- FAQ questions and answers
- card blurbs
- meta descriptions

FAQ questions are lorem because they are content: the client is
approving that an FAQ block exists with a given number of items, not the
wording of the questions.

Lorem is generated to a target length per slot rather than dumped
uniformly. Hero headline 4–7 words; subhead 12–18; body paragraph 40–60;
card blurb 15–25; testimonial quote 20–35. Uniform filler makes every
section read the same height, which defeats the judgement Stage Two
exists to support.

### Image regions

One component, `ImageArea`, taking an aspect ratio and a role. It is the
only way a photograph is represented anywhere in the build.

- Renders a box at the aspect ratio the final photograph will occupy, so
  nothing reflows when Stage Three replaces it.
- Border drawn from the site's own rule token; fill from its own surface
  token. It inherits the direction's palette and reads as part of the
  design.
- A role label in the site's own caption style: "Hero photo", "Owner
  portrait", "Gallery 3 of 6".
- No grey fill, no diagonal hatching, no icons, no dimension text.
- Never an `<img>` with a remote source. Stock photography belongs to the
  demo phase; clause (b) of Stage Two draws the line here.

### Stubbed embeds

`EmbedArea`, taking a service name, renders at the embed's real
footprint and is labelled with the tool name from the questionnaire's
existing-tools answer. Visually distinct from an `ImageArea` so nobody
expects a photograph in that space.

## Functionality

Anything Astro and Netlify can do in-house is live and clickable at
Stage Two. Third-party embeds are stubbed until the client's accounts
exist, and are replaced at Stage Three.

| Resolution | Covers |
|---|---|
| `in-house` | Netlify Forms (contact, inquiry, quote request, newsletter signup), navigation, FAQ accordion, photo gallery and lightbox, before-and-after gallery, team profiles, downloadable guide, static map link, blog |
| `stub` | Appointment scheduling, online booking, calendar, online payments, review feeds, Instagram feed, embedded map, event registration, video hosting |
| `escalate` | Online shop, membership or login, client portal, searchable resources at scale |

In-house features work against real Netlify Forms so the client can
submit and see the thanks page. This is what makes the agreement's "a
tool doesn't do what you need" a testable claim at Stage Two.

## Verification

`scripts/verify.mjs`, extended from keepsite's, fails the build on:

- any `http` or `https` image source in `dist/`, in `<img>` or in a CSS
  `background-image`
- lorem text appearing in navigation, `<title>`, button text, or form
  labels
- a page listed in `sitemap.md` that is missing from `dist/`
- a page in `dist/` that is not listed in `sitemap.md`
- any internal link that does not resolve
- a missing `<meta name="robots" content="noindex,nofollow">`

The page-set checks run in both directions because approving Stage Two
locks the page count for the build fee; drift either way is a billing
problem.

`noindex,nofollow` stays on every page for the whole of Stage Two and
Stage Three and is removed only at launch. An indexed lorem site is a
live search liability for a client buying search work.

The full gate is `npm run check && npm run build && npm run verify`,
plus the Lighthouse thresholds in `netlify.toml`, matching keepsite's.

## Handoff

The build skill ends by reporting the Netlify preview URL and a written
note for the client listing what is intentionally absent: outlined image
regions instead of photographs, lorem in place of copy, stubbed embeds
named by tool. The note is phrased against the agreement's
acknowledgement language so that the written approval it invites is an
informed one.

## Out of scope

- Stage One. The four-direction demo is produced by
  `client-design-proposals` and is an input here.
- Stage Three. Placing real copy and photographs into the approved
  layouts is a separate pass against a site this design produces.
- Keyword research tooling beyond questionnaire derivation and web
  search. A richer process writes `intake/keywords.md`, which the sitemap
  skill reads.
- Domain transfer, DNS, and launch.
