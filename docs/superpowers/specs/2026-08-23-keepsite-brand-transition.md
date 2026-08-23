# Keepsite Media — Brand & Business-Model Transition Design

**Status:** approved 2026-08-23 — owner decisions folded in (see "Owner decisions", end of doc)
**Repo:** `/mnt/c/Users/Snic9/keepsitemedia/keepsite`
**Stack (fixed):** Astro 5 static → Netlify, DecapCMS at `/admin`, content collections
**Supersedes:** `2026-06-22-keepsite-media-site-design.md`

---

## 0. The core problem

The current site is a well-built argument for the wrong business. Its persuasive weight is concentrated exactly where the new model contradicts it: an entire homepage panel titled "What it costs to keep the site running: $0 a month," a pricing page whose closing sentence is "once the site is built you owe me nothing further," and a footer that promises "nothing to pay each month" on every single page.

This is not a copy-editing pass. Roughly 90% of the site's *words* and 100% of its *argument* are replaced. The layout skeleton (Astro layout, header/footer, container/section/card CSS) survives; almost nothing written on top of it does.

Two consequences shape everything below:

1. **The transition must be complete in one release, not incremental.** A half-migrated site that says "$1,750 + $150/month" on `/packages` and "nothing to pay each month" in the footer is worse than either message alone — it reads as a bait-and-switch, which is fatal for a brand whose third pillar is "Show your work."
2. **The new model owes the visitor an answer the old model didn't.** The old site pre-empted "am I on the hook forever?" by saying no. The new site charges monthly and must answer it honestly and in the new voice — not by echoing the old one. This is the single hardest copy problem in the transition, and Section 5 addresses it directly.

---

## 1. Positioning transition — every old-message surface

### 1.1 The message map

| Old message | New message |
|---|---|
| "I build websites you keep" (ownership) | "We build it. We keep it useful." (stewardship) |
| $0/month, no subscription | $55–$275/month, and here's exactly what it buys |
| Pay once, own outright | Build price + ongoing partnership |
| First person, "work with me directly" | "We" — a small studio, not a freelancer |
| $50/$75 hourly for changes | Included maintenance allowance + a small, fixed add-on menu |
| Tech-forward proof (GitHub, Netlify, free tier) | Outcome-forward proof (found in search, off your to-do list) |
| Keepsite = "you keep the site" | Keepsite = "a site worth keeping / we keep it working" |

The tech-forward → outcome-forward shift is the one most likely to be under-done. The current FAQ has a group literally titled "The tech, in plain English" explaining GitHub repositories to bakery owners. Under the new brand that content violates two guardrails at once ("jargon-heavy" and "does not give clients homework"): the client no longer needs to know what a repository is, because they are no longer being handed one. Complexity belongs behind the curtain.

### 1.2 Surface-by-surface inventory

Every location below contains old-model residue. This list is the acceptance checklist for "no residue anywhere."

**Copy & data**

| File | Old-model residue | Action |
|---|---|---|
| `src/data/site.json` | `footerNote`: "You keep everything: the code, the GitHub repo, and the Netlify account. No lock-in, and nothing to pay each month." | Replace with `tagline` = "Websites for people with other things to do." + service-area/contact fields |
| `src/data/site.json` | `nav`: Portfolio / Pricing / "Get in touch" | Replace: Packages / Work / How it works / FAQ / Start your site |
| `src/data/home.json` | `heroHeadline` "I build websites you keep."; `heroSub` (repo/Netlify ownership); `hourlyLine` ($50/$75); all 4 `valueProps` ("You own it", "No ongoing costs", "Edit it yourself", "Work with me directly"); the entire `runningCosts` object (heading + intro + 4 points, all arguing $0/month); `closingHeadline` "Want a site that's yours to keep?" | Full rewrite to the Section 13 hierarchy. `runningCosts` **deleted, not rewritten** — it is the single most load-bearing old-model artifact |
| `src/data/pricing.json` | `intro` ("no subscription attached"); two tiers `$500`/`$750`; every feature bullet ("$0/month hosting", "Still $0 a month to run", "Code in your GitHub repo"); the whole `hourly` object; `ownership` paragraph | Replaced by new `src/data/packages.json` (Section 6). Old file deleted |
| `src/data/faq.json` | `intro` first person; **group "The tech, in plain English"** — all 3 Q&As (Netlify free tier, "What is GitHub and why is my site there", Decap self-editing); **group "Money"** — all 4 (the $500/$750 answer, "Are there any monthly costs? **No.**", the 10%-for-12-months payment plan, hourly changes); **group "Your domain name"** (mostly salvageable, reframe); **group "Editing and ownership"** — all 3, incl. "Do I really own everything? **Yes**… There's no lock-in"; **group "Is this right for me?"** — reframe, "Head to the contact page and tell me…" | Full rewrite, new group structure (Section 4.5) |
| `src/content/portfolio/*.md` (3 files) | Placeholder projects, `url: https://example.com`, blurbs ending "(Placeholder. Swap in a real project.)"; the nonprofit entry sells the CMS product | Delete all three (Section 4.4) |

**Templates**

| File | Old-model residue | Action |
|---|---|---|
| `src/layouts/BaseLayout.astro` | Default `description` prop: *"Keepsite Media builds fast websites that you own and keep, with no lock-in and no monthly fees."* — this string is the site-wide meta description on **every page that doesn't override it**, i.e. home, pricing, portfolio, contact. It is the highest-leverage single line in the repo | Delete the default entirely; make `description` a **required** typed prop so a page cannot ship without a deliberate one |
| `src/pages/index.astro` | `<BaseLayout title="Keepsite Media | Websites you own and keep">`; the `.costs-panel` markup + scoped CSS; `home.hourlyLine` render | Rebuilt (Section 4.1) |
| `src/pages/pricing.astro` | Title "Pricing \| Keepsite Media"; `.ownership` block | Becomes `src/pages/packages.astro` (Section 5) |
| `src/pages/portfolio.astro` | "A few of the sites I've built. Each one now belongs entirely to the client it was made for." | Becomes `src/pages/work/` (Section 4.4) |
| `src/pages/contact.astro` | H1 "Start your project"; "Tell me what you have in mind and **I'll** reply to you myself. Your message comes straight to me, not to a bot or a sales queue"; **`<select>` options `"Static site ($500)"` and `"Static + DecapCMS ($750)"`** — old prices hard-coded in markup, easy to miss; success copy "Thanks, **I** got your message" | Becomes `src/pages/start.astro` + `/start/thanks/` (Section 4.6) |
| `src/pages/faq.astro` | Meta description: "…how Keepsite Media builds, hosts, and **hands over** your website" | Rewritten |
| `src/components/Footer.astro` | Renders `footerNote` on every page | Restructured (Section 3.6) |
| `src/components/Header.astro` | `item.href === '/contact'` hard-codes which nav item is the CTA | Change to a `cta: true` flag in `site.json` |
| `src/components/NodeNetwork.astro` | Not messaging, but fails the new visual direction | Delete (Section 3.7) |
| `src/components/ProjectCard.astro` | Neutral copy; hover lift conflicts with motion policy | Restyle + new schema fields (Section 4.4) |

**Config, docs, structured data**

| File | Old-model residue | Action |
|---|---|---|
| `public/admin/config.yml` | Field labels an editor sees daily: "Hourly billing line", "Ownership note", `pricing.json` file binding, `tiers` shape with a single `price` string | Rewritten (Section 6.3) |
| `README.md` | "**Ownership** — This site is built to be handed over. The GitHub repo and the Netlify account are the client's. There are no monthly fees and no ongoing costs."; "Enabling the inquiry form" references `?success=1` flow | Rewrite the Ownership section into "Repo & access"; keep all Netlify/DNS/CMS runbook content (still accurate and genuinely useful) |
| `docs/superpowers/specs/2026-06-22-keepsite-media-site-design.md` | The old model in full: "The core sales principle is **ownership without lock-in**"; "$400/$750"; "doubles as a live demo of the $750 product"; content pillars "effortless, personal, trustworthy"; first-person voice mandate | Mark **Superseded** at the top with a pointer to the new spec; do not silently edit (it's a dated historical record) |
| `docs/superpowers/plans/2026-06-22-keepsite-media-site.md` | Same | Same treatment |
| `.superpowers/sdd/*` (23 files incl. 10 `.diff` files) | Task briefs, reports, and raw diffs full of old copy | Delete from the working tree and gitignore the directory — stale build scaffolding with zero forward value |
| `netlify.toml` | No redirects for renamed routes; no security headers | Add 301s + headers (Sections 2.2, 7.8) |
| **Structured data** | None exists — so there's nothing to clean, but nothing to inherit either | Build fresh (Section 7.3) |
| `Keepsite_Brand_Strategy.docx`, `Keepsite_Media_Packages_and_SOP.docx` | Repo-root binaries; the SOP contains **Part II internal** (labor budgets, $90/hr cost basis, margin guardrails, staff names) | Section 8 — remove from repo, do not commit |

Two residue traps worth calling out because they're easy to miss in a copy sweep: the `$500`/`$750` strings are **inside `contact.astro`'s `<option>` markup**, not in a JSON data file, so a data-file-only rewrite would leave the old prices live in the inquiry form; and the BaseLayout default description means every un-overridden page currently ships old-model copy into Google's index and every social share card.

**Search-index hygiene.** The old descriptions are already indexed. Beyond rewriting them, ship the 301s in §2.2 (so equity moves rather than 404s) and expect Google to re-crawl over days-to-weeks. Don't add any "we've changed our model!" announcement page — it would be the only page on the site arguing with the old positioning, and would keep it alive.

---

## 2. Information architecture

### 2.1 The six questions

The brand doc's Section 12 gives six things a visitor must never wonder. That's the test for the nav, so the nav is designed directly against it:

| Question | Answered by |
|---|---|
| Where am I? | Header wordmark + `aria-current` on nav + a distinct H1 per page |
| What does Keepsite do? | Home hero + **How it works** |
| Who is this for? | Home problem section + each tier's "Best for" |
| How much does it cost? | **Packages** (in the nav, second position, price visible on the page not buried behind a form) |
| What's the difference between the packages? | **Packages** — three cards *and* a comparison table |
| What do I do next? | **Start your site** — CTA in the header, and a closing CTA band on every page |

**Recommended nav:** `Packages · Work · How it works · FAQ` + `Start your site` (button)

Five items. Reasoning for each decision:

- **"Packages," not "Pricing."** The doc's own hero CTA is "View Packages," the offering is productized, and "Pricing" frames the page as a number rather than a choice between three defined things. Price still appears above the fold on the page — the label changes, the transparency doesn't.
- **Packages sits first (leftmost after the wordmark).** Cost and tier-difference are two of the six questions. Under a subscription model, price anxiety is the primary conversion blocker; burying it signals the opposite of "Clear pricing. Clear work."
- **"How it works," not "Process."** "Process" is agency-speak. "How it works" is what a busy owner would actually type. It's the page that carries the "Keep it simple." pillar and pre-empts the real fear — *how much of my time will this take?*
- **"Work," not "Portfolio."** Shorter, less precious, and honest about the page's job: showing built sites, not curating an art book. Conditionally rendered — see §4.4.
- **FAQ stays in the nav.** Under a subscription model FAQ does load-bearing objection handling (what the monthly covers, whether you're locked in, what happens if you stop). It also owns the `FAQPage` structured data.
- **No About page at launch.** The brand is "we," the proof is the work and the clarity of the offer, and an About page written before there's a real team is filler. If the owner wants founder presence, the right dose is a short signed block at the bottom of **How it works** — a human name attached to the promise — not a separate page.
- **No blog at launch.** Tiers 2 and 3 sell 24 SEO posts a year, so eventually Keepsite should practice what it sells, and a stale three-post blog is worse than none. Scaffold the collection in Phase 7 and ship the section only when three real posts exist.

### 2.2 Route map & redirects

| New route | Source | Old route → 301 |
|---|---|---|
| `/` | `index.astro` (rebuilt) | — |
| `/packages/` | from `pricing.astro` | `/pricing` → `/packages/` |
| `/work/` | from `portfolio.astro`, conditional | `/portfolio` → `/work/` |
| `/how-it-works/` | new | — |
| `/faq/` | rewritten | — |
| `/start/` | from `contact.astro` | `/contact` → `/start/` |
| `/start/thanks/` | new (form success target) | — |
| `/404` | new | — |

301s go in `netlify.toml` (`status = 301`, `force = true`). Preserve equity from the indexed old URLs — `/pricing` and `/contact` are the two most likely to have inbound links.

If `/work/` isn't generated (no entries yet), its 301 target doesn't exist. Point `/portfolio` at `/` in that case, and flip it to `/work/` in the same commit that adds the first real project.

### 2.3 Homepage structure (brand doc §13)

Seven bands. Alternating surface treatment (off-white → warm sand → off-white) provides section separation without cards or dividers.

| # | Section | H-level | Surface |
|---|---|---|---|
| 1 | Hero — tagline, subhead, two CTAs | H1 | bg |
| 2 | Problem — "You don't need another business task." | H2 | bg (continuous with hero, no hard break) |
| 3 | Solution — "We build it. We keep it useful." + 3 beats + serif pull-line | H2 | sand |
| 4 | Packages — three compact tier cards | H2 | bg |
| 5 | Why Keepsite — four pillars | H2 | sand |
| 6 | Work — *conditional*, featured strip | H2 | bg |
| 7 | Closing CTA — "Keep your business moving." | H2 | deep green |

Ordering note: the doc lists Packages before Why Keepsite, and that's correct — price is the question the visitor arrives with, and the pillars read as justification *after* the numbers rather than as throat-clearing before them. Sections 1–4 fit in roughly two screens on desktop, so a visitor gets tagline → problem → promise → three prices without hunting.

---

## 3. Visual system

### 3.1 Typography

**Recommendation: Instrument Sans (variable) + Instrument Serif Italic, self-hosted via Fontsource.**

| Role | Face | Weights |
|---|---|---|
| Headlines, UI, body | **Instrument Sans Variable** | 400 / 500 / 600 |
| "Keep" pull-lines only | **Instrument Serif Italic** | 400 |

Reasoning:

- The doc asks for "confident sans-serif-led… not a startup dashboard and not a highly stylized wedding brand." Inter *is* the startup dashboard; Poppins/Manrope read as 2021 SaaS. Instrument Sans has slightly humanist lowercase and a compact, confident cap height — professional creative business, which is exactly the target.
- **The serif does one job and only one job:** it sets the "keep" phrases — "A website that earns its keep.", "Keep showing up.", "Keep your business moving." This turns the brand's language system into a typographic system. The reader learns that italic serif = the Keepsite voice speaking. That is "personality expressed through typography and copy" rather than decoration, and it keeps the serif from sprawling into a second body face.
- Both are on Google Fonts and both ship as `@fontsource-variable/instrument-sans` / `@fontsource/instrument-serif` — two small npm deps, self-hosted, no third-party origin. That matters for §7.8's CSP and removes a render-blocking cross-origin request.

**Loading strategy (zero CLS):**

1. Self-host. No `fonts.googleapis.com`.
2. Latin-subset `woff2` only; the variable sans is roughly 30–40 KB.
3. `<link rel="preload" as="font" type="font/woff2" crossorigin>` for **the sans only**. Same-origin + preloaded means swap almost never fires.
4. `font-display: swap` on both.
5. A metric-matched `@font-face` fallback (`local(Arial)` + hand-tuned `size-adjust` / `ascent-override` / `descent-override`) declared *before* the real face and set as the second family in `--font-sans`. This is what actually eliminates CLS — measure once against Instrument Sans and hard-code the percentages.
6. **Do not preload the serif.** It never appears above the fold (the hero is sans). It loads with `swap` against a Georgia fallback, and the handful of lines it sets can tolerate a swap.

**Type scale** — 1.25 ratio, fluid via `clamp()`, tokenized as `--step--1` … `--step-5`:

| Token | Size | Use |
|---|---|---|
| `--step-5` | `clamp(2.6rem, 5.5vw, 4rem)` | H1 hero |
| `--step-4` | `clamp(2rem, 4vw, 2.75rem)` | H1 inner pages |
| `--step-3` | `clamp(1.6rem, 3vw, 2.1rem)` | H2 |
| `--step-2` | `clamp(1.25rem, 2vw, 1.4rem)` | H3, lead paragraphs |
| `--step-1` | `1.125rem` | Sub-lead |
| `--step-0` | `1.0625rem` (17px) | Body |
| `--step--1` | `0.9375rem` | Captions, add-on menu, fine print |

Body at 17px, `line-height: 1.65`, measure capped at `68ch` for prose and `56ch` for leads. Headlines `line-height: 1.1`, `letter-spacing: -0.02em`. Prices get `font-variant-numeric: tabular-nums` so the three tier cards align optically.

### 3.2 Color

Evolving the existing warm off-white + calm green rather than replacing it — the foundation is right, but the green fails as text on the background at 4.75:1 (it's currently used for links and the "✓" marks). Darkening it fixes accessibility *and* reads as more grounded and less "eco-brand."

| Token | Hex | Role |
|---|---|---|
| `--color-bg` | `#FBF9F4` | Warm off-white (unchanged) |
| `--color-surface` | `#FFFFFF` | Cards, form fields |
| `--color-surface-alt` | `#F2EEE4` | Warm sand — alternating section bands |
| `--color-ink` | `#1F2421` | Body text (unchanged) |
| `--color-muted` | `#55605B` | Secondary text (darkened from `#5C6661`) |
| `--color-brand` | `#1F5C43` | **Keep Green** — links, primary buttons, active nav |
| `--color-brand-deep` | `#16302A` | Closing CTA band, footer |
| `--color-brand-tint` | `#E6EFE9` | Tier badges, subtle fills |
| `--color-accent` | `#A24A26` | **Clay** — restrained accent, used sparingly |
| `--color-border` | `#E4DFD2` | Hairlines |

**Contrast, measured:**

| Pair | Ratio | Verdict |
|---|---|---|
| Ink on bg | 14.98 | AAA |
| Ink on sand | 13.60 | AAA |
| Muted on bg | 6.22 | AAA body |
| Muted on sand | 5.65 | AA+ |
| **Brand green on bg** | **7.47** | **AAA** (was 4.75 — a genuine fix) |
| Brand green on sand | 6.79 | AAA |
| **White on brand green** | **7.86** | AAA — same color works as link text *and* button fill |
| Brand green on tint | 6.70 | AAA |
| White on brand-deep | 14.09 | AAA |
| Clay on bg | 5.63 | AA |
| Clay on sand | 5.11 | AA |

The decisive property: `#1F5C43` clears AAA both as foreground on light surfaces and as a background under white. One brand color covers every role without exceptions or "large text only" caveats.

**Clay discipline.** One accent, used at most twice per page — the underline on the current nav item, or a small marker on a "most chosen" tier. Never as a second button color. If a page needs three colors to communicate, the copy is doing too little.

### 3.3 Spacing & layout

Keep the existing `--space-*` ladder, add `--space-0: 0.25rem`, and add `--section-y: clamp(4rem, 9vw, 7rem)` for band rhythm. Widths: `--maxw: 1120px`, `--maxw-prose: 68ch`, `--maxw-narrow: 640px` (forms). Radius drops from `14px` to `10px` — 14 is soft enough to read friendly-consumer; 10 reads composed. Grid: a single 12-column grid at ≥900px; tier cards and pillar rows are 3-up desktop / 1-up mobile with no awkward 2-up middle state.

### 3.4 Component language

**Buttons.** Primary = solid `--color-brand`, white label, 10px radius, `0.85rem 1.6rem`, min 44px target. Secondary = **text link with a 2px underline at 0.25em offset**, not an outline button. Reason: the current site pairs a solid and an outline button in the hero, which reads as two equal choices — the doc asks for "obvious calls to action," singular. Outline style is reserved for the one place two actions genuinely tie (the hero's View Packages / Start Your Site).

**Cards, used with restraint.** Today, cards carry four homepage value props, four cost points, the FAQ items, the hourly block, and the portfolio items — cards are the default container, largely because the animated backdrop forced opaque surfaces behind text (see §3.7). Under the new system a card is only for **a discrete, comparable object**: a tier, a work item. Everything else uses whitespace and a hairline rule. The four Why Keepsite pillars become a rule-separated row, not four boxes. This alone removes most of the site's visual clutter.

**Hover.** Color and border-color transitions only, 120ms, `ease`. No lift, no shadow — `ProjectCard`'s `translateY(-3px)` + shadow goes. Work cards get a border darkening plus an underline on the title.

**Motion policy.** Transitions permitted on `color`, `background-color`, `border-color`, `opacity`, `text-decoration-color`; duration ≤150ms. No scroll-triggered reveals, no parallax, no autoplay, no looping animation. Globally:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: .01ms !important; animation-iteration-count: 1 !important;
    transition-duration: .01ms !important; scroll-behavior: auto !important;
  }
}
```

And `scroll-behavior: smooth` moves out of the unconditional `html` rule into `@media (prefers-reduced-motion: no-preference)`. The current global smooth scroll is a real WCAG 2.3.3 problem, not a nitpick.

**Focus.** The current `:focus-visible { outline: 3px solid var(--color-accent) }` is green-on-green when focusing a primary button — effectively invisible, failing 2.4.11 and 1.4.11. Replace with a **two-tone ring** that guarantees contrast against any surface:

```css
:focus-visible {
  outline: 2px solid transparent;          /* forced-colors mode */
  outline-offset: 2px;
  box-shadow: 0 0 0 2px var(--color-bg), 0 0 0 4px var(--color-ink);
}
```

Ink-vs-bg is 14.98 and bg-vs-green is 7.47, so at least one ring is always visible. `outline: transparent` preserves the indicator in Windows High Contrast.

### 3.5 Form styling

Labels above fields, always visible (never placeholder-as-label). 1.5px border `--color-border`, focus → 2px `--color-brand` plus the focus ring. Field text at `--step-0` and ≥16px to prevent iOS zoom-on-focus. Required fields marked in text ("Required"), not by color or asterisk alone. Hint text bound via `aria-describedby`.

### 3.6 Footer

Three-column at ≥720px, stacked below: (1) wordmark + tagline "Websites for people with other things to do."; (2) nav links mirroring the header; (3) contact email + service area. Bottom rule with `© {year} Keepsite Media`. No promises, no guarantee copy — the old `footerNote` put a sales claim on every page, and that's exactly the pattern that made the old positioning so pervasive. Don't rebuild it with new content.

### 3.7 Fate of the node network — **delete it**

`src/components/NodeNetwork.astro` should be removed and unmounted from `BaseLayout`. It is competently written (DPR-aware, viewport-scaled density, visibility pause, live `prefers-reduced-motion` listener) — this is not a quality criticism. It's the wrong object for this brand. Four reasons, in order of weight:

1. **It contradicts the stated visual direction on three counts.** The doc asks for "minimal decorative effects," "low visual clutter," and "restrained motion," and explicitly says personality should come "through typography, copy, icons, and thoughtful motion rather than gimmicks." A perpetual full-viewport particle animation is the definition of a decorative effect that never stops.
2. **It says the wrong thing.** The connected-node motif is the visual cliché of crypto, AI, and enterprise SaaS. This brand sells calm competence to a salon owner. The doc warns against feeling "technical" or "corporate"; this backdrop is both, and it also violates the "not a startup dashboard" typography note in visual form.
3. **It's a technical liability on a site whose entire argument is technical competence.** The link pass is O(n²) over up to 70 nodes — about 2,400 distance checks plus up to that many `stroke()` calls, every frame, forever, on the main thread. That's a standing INP and long-task risk, continuous battery draw on mobile, and it's the *only* JavaScript on most pages. Removing it takes the content pages to effectively zero client JS, which is the cleanest possible road to Lighthouse 100 across the board. A site selling competence should not spend its entire performance budget on a background animation.
4. **It distorts the layout.** Because the canvas sits behind everything, any text over it needs an opaque surface — which is precisely why `index.astro` wraps the costs section in `.costs-panel` with a comment saying so, and why cards are over-used site-wide. Removing the backdrop unlocks the doc's "restrained use of cards and containers."

**Replacement texture:** alternating `--color-bg` / `--color-surface-alt` section bands, plus the `--color-brand-deep` closing CTA band. Structure and warm color do the work that motion was doing, at zero runtime cost. If the owner later wants a signature visual, the right answer per the doc's imagery direction is real client work — screenshots of launched sites — not abstract graphics.

---

## 4. Page-by-page content design

Copy marked **[doc]** is verbatim from the brand strategy and should not be reworded. Copy marked *[draft]* is written to the voice rules and is the owner's to approve.

### 4.1 Home — `/`

**Purpose:** answer all six questions within two screens; route to Packages or Start.
**Meta title:** `Keepsite Media | Websites for people with other things to do`
**Meta description:** *[draft]* "Professional websites for busy business owners. We build it, keep it working, and stay off your to-do list. Packages from $1,100."

**1. Hero**
- H1 — **[doc]** "Websites for people with other things to do."
- Sub — **[doc]** "Professional websites built to look good, work hard, and stay off your to-do list."
- CTAs — **[doc]** primary "View Packages" → `/packages/`; secondary "Start Your Site" → `/start/`.

*Primary is View Packages, not Start.* Price is the arriving question, and it's the lower-commitment step; sending a cold visitor to a form first is the salesy move the brand explicitly rejects. Start stays visible as the header button for anyone already decided.

**2. Problem**
- H2 — **[doc]** "You don't need another business task."
- *[draft]* Two sentences, no fear-selling: "You already have a full list. A website shouldn't be the thing you keep meaning to get to."

That second sentence is the whole problem statement. No statistics, no "did you know 75% of customers judge…" — fear-based selling is a named guardrail violation.

**3. Solution**
- H2 — **[doc]** "We build it. We keep it useful."
- Three beats, one line each *[draft]*: **We build it.** / **We keep it working.** / **We tell you what's working.** — mapping to build, subscription, and the annual recap. Note the third beat: it justifies the monthly fee with a deliverable the client actually receives, which is the "Show your work" pillar doing sales work.
- Serif italic pull-line, per the doc's placement table: **[doc]** *"A website that earns its keep."*

**4. Packages**
- H2 *[draft]* "Three ways to work with us."
- Three compact cards, price + monthly + the doc's one-liners:
  - **Presence** — **[doc]** "Be there when people look." — $1,100 + $55/month
  - **Search** — **[doc]** "Keep showing up." — $1,750 + $150/month
  - **Search Plus** — **[doc]** "Keep growing." — $2,000 + $275/month
- Link: *[draft]* "See what's included →" `/packages/`

Prices appear on the homepage. A visitor should not have to click to learn the cost — question four of six.

**5. Why Keepsite**
- H2 — **[doc]** "Why Keepsite"
- Four pillars, headline verbatim + one sentence each condensed from the pillar text: **[doc]** "Make it useful." / "Keep it simple." / "Show your work." / "Build for real life."
- Rule-separated row, not cards.

**6. Work** — conditional, see §4.4. Renders only when ≥2 published entries exist.

**7. Closing CTA** (deep green band)
- H2 — **[doc]** "Keep your business moving." (serif italic)
- Sub — **[doc]** "We'll take care of the website."
- Button — *[draft]* "Start your site"

**"Keep"-phrase budget for this page:** three — "earns its keep" (§3), "Keep showing up"/"Keep growing" inside tier cards (§4), "Keep your business moving" (§7). The doc warns repetition should create cohesion, not feel gimmicky; three placements across seven bands is the ceiling.

### 4.2 Packages — `/packages/`

Full treatment in Section 5.

### 4.3 How it works — `/how-it-works/`

**Purpose:** answer "how much of *my* time does this take?" — the real objection for this audience. Carries the "Keep it simple." pillar.
**Meta title:** `How it works | Keepsite Media`
**Meta description:** *[draft]* "One form, one call, one round of revisions. Here's exactly what building a site with Keepsite looks like, and what we need from you."

**Sections:**

1. H1 *[draft]* "How it works" — lead: *[draft]* "You've already made the decision to hand this off. From here it's five steps, and most of them are ours."
2. **The five steps** — a numbered list (`<ol>`, real ordered semantics), derived from the SOP's delivery workflow, client-facing only:
   1. *[draft]* "Tell us about your business." — one questionnaire, everything we need in one pass.
   2. *[draft]* "We plan the site." — architecture; on Search and Search Plus, keyword research first.
   3. *[draft]* "We build it." — you don't have to watch.
   4. *[draft]* "One round of changes, then we launch." — consolidated feedback, one round (this states the SOP boundary as a client benefit rather than a restriction).
   5. *[draft]* "We keep it working." — hosting, maintenance, monitoring, and the annual recap.
3. **Serif pull-line** per the doc's table: **[doc]** *"Keep it simple."*
4. **"What we need from you"** — honest and short: accurate business information, your photos and logo if you have them, one call on Search and Search Plus, and a reply when a scheduled article needs a correction. Directly from the SOP's Tier 2 "Client workload" line. This is "Show your work" applied to the client's own obligations, and it protects scope by setting expectations before the contract.
5. **"What you won't have to do"** — no website homework, no ongoing meetings, no logging into anything, no decisions about hosting or plugins. Draws on **[doc]** "No website homework required." Sets up the honest contrast without ever mentioning the old model.
6. Optional signed block — a named human ("— Sam, Keepsite") under the process. Founder presence without an About page.
7. Closing CTA band.

### 4.4 Work — `/work/`

**The placeholder problem, decided.** Three fake projects currently ship with `url: https://example.com` and blurbs that admit they're placeholders. Under a brand whose third pillar is "Show your work" and whose guardrails ban overstated claims, shipping fabricated case studies is the worst available option. The other bad option — a Work page reading "coming soon" — advertises that there is nothing to show.

**Recommendation:** keep the collection and the component, delete the three placeholders, and make the route *conditionally generated*.

Mechanism, static-safe in Astro 5: implement as `src/pages/work/[...path].astro` whose `getStaticPaths()` returns `[{ params: { path: undefined } }]` when the collection is non-empty and `[]` when it's empty. Returning an empty array emits no page at all, so the route simply doesn't exist until there's real work. The header derives the nav item from the same `getCollection('work')` check, and the homepage strip uses the same guard. **Adding the first real project to the CMS makes the page, the nav item, the homepage strip, and the sitemap entry all appear with no code change.** No dead route, no "coming soon," no lie.

**Schema (renaming `portfolio` → `work`):**

| Field | Type | Notes |
|---|---|---|
| `title` | string | Client/business name |
| `url` | string (url) | Live site |
| `tier` | enum | `Presence` / `Search` / `Search Plus` — shows the model in action |
| `job` | string | One line: what this site is *for*. The "Make it useful" pillar per project |
| `scope` | string[] | 2–4 short items |
| `screenshot` | image | 1200×750 |
| `launched` | date | |
| `featured` | boolean | Homepage strip |
| `order` | number | |

Deliberately **no metrics fields** (traffic, rankings, "300% increase"). Overstated claims are a named guardrail, and unverifiable numbers on early clients would undercut the transparency the brand is built on. Add a `result` string field later only when a real, defensible number exists.

**Page content:** H1 *[draft]* "Work"; lead *[draft]* "A few of the sites we've built, and what each one is there to do." Grid of cards showing screenshot, name, tier badge, `job` line, and "Visit site →". Screenshots carry the visual proof, per the doc's imagery direction. Closing CTA band.

### 4.5 FAQ — `/faq/`

**Purpose:** absorb every objection the subscription model creates. Owns the `FAQPage` structured data.
**Meta title:** `FAQ | Keepsite Media`
**Meta description:** *[draft]* "What's included, what the monthly covers, how long it takes, and what we need from you."

Keep the existing `<details>`/`<summary>` accordion — it's keyboard-native, needs no JS, and is genuinely good. Keep the `+`/`−` marker. Restructure the groups entirely:

| Group | Questions *[draft]* |
|---|---|
| **Getting started** | How do we start? · How long does a site take? · What do you need from me? · Do we have to meet? |
| **Packages & pricing** | Which package is right for me? · What's the difference between Search and Search Plus? · Can I change tiers later? · Do you build sites without a monthly plan? |
| **The monthly subscription** | What does the monthly cover? · Is the monthly just hosting? · Am I locked into a contract? · What happens if I stop? |
| **Content & SEO** | Who writes the copy? · What if I don't have copy? · What are the 24 blog posts, exactly? · Do I have to approve every post? |
| **Working with us** | Can I make changes myself? · What if I need a new page? · Who owns my domain? · What kinds of businesses do you work with? |

Four of these deserve comment because they're where honesty is hardest:

- **"Is the monthly just hosting?"** — must be answered head-on. A visitor who has priced Netlify knows hosting is nearly free. The answer is that the monthly buys maintenance, monitoring, minor content updates, and (on Search and Search Plus) the ongoing content and search work — hosting is a line item inside it, not the product. Ducking this reads as the exact "mysterious marketing" the brand disowns.
- **"Do you build sites without a monthly plan?"** — the honest answer under the new model is no, with a plain reason: an unmaintained site stops being useful, and that's the thing Keepsite sells. This must be stated confidently and without apology, because any hedging invites a negotiation the productized model exists to prevent.
- **"Am I locked into a contract?" / "What happens if I stop?"** — answered directly from the approved policy in §5.4: Presence month to month; Search / Search Plus 12-month initial term (the annual content plan), month to month after; domain, content, and published posts are the client's, and Keepsite helps them move.
- **"Who owns my domain?"** — the one genuine ownership answer that survives the transition. The domain is the client's, registered in their name. It's true, it's reassuring, and it's scoped narrowly enough that it doesn't reawaken "you keep the repo."

### 4.6 Start your site — `/start/` + `/start/thanks/`

**Purpose:** convert. Lowest-friction honest inquiry.
**Meta title:** `Start your site | Keepsite Media`
**Meta description:** *[draft]* "Tell us about your business and we'll get back to you with a recommendation. No sales call required."

**Structural change: replace the `?success=1` JS toggle with a real `/start/thanks/` page.** Set `action="/start/thanks/"` on the form; Netlify Forms handles the POST and redirects there. Benefits: deletes the last inline script from the content pages (the site ships effectively zero JS), gives a shareable success URL, works with JS disabled, and makes the confirmation a real page that can carry "here's what happens next" content. Mark it `noindex`.

**Form fields** (Netlify Forms, honeypot retained — the existing implementation is correct):

| Field | Type | Notes |
|---|---|---|
| Your name | text, required | `autocomplete="name"` |
| Email | email, required | `autocomplete="email"` |
| Business name | text, required | |
| Website (if you have one) | url, optional | |
| Which package are you thinking about? | select | Presence / Search / Search Plus / **Not sure yet (default)** |
| What does your business do? | textarea, required | |
| Anything else? | textarea, optional | |

"Not sure yet" is the default and is listed as a legitimate answer, not a fallback — forcing a tier choice at first contact contradicts "does not turn every recommendation into an upsell."

**Tier prefill.** Tier cards link to `/start/?tier=search`. One inline script of ~200 bytes reads the param and preselects the option; without JS the select simply stays on "Not sure yet." This is the one script to keep on a content page — it removes a step for a visitor who has already decided, which is the brand's whole thesis about reducing cognitive load, and it costs nothing measurable.

**Copy:**
- H1 *[draft]* "Start your site"
- Lead *[draft]* "Tell us a bit about your business. We'll reply with a recommendation and what it would cost. No sales call required."
- Above the button *[draft]*: "We usually reply within one business day."
- Thanks page *[draft]*: H1 "Thanks — we've got it." / "We'll reply within one business day, usually sooner. If it's easier, you can also reach us at [email]." / **[doc]** closing serif line "Keep your business moving."

**Netlify Forms note for implementation:** changing the form's field set requires a deploy for Netlify to re-detect the form; confirm the `inquiry` form still appears under Forms and that the email notification to the owner survives the rename. Keep `name="inquiry"` unchanged so existing notification config isn't orphaned.

### 4.7 404

Same layout, `noindex`. *[draft]* H1 "That page isn't here." / "It may have moved. Here's where everything is:" + links to Packages, How it works, FAQ, Start. Light, not cute — "Words to avoid: cutesy."

---

## 5. Pricing page design

The hardest layout problem on the site: three tiers × two prices each × ~20 inclusions × a five-item add-on menu, presented without clutter, for a reader who has other things to do.

### 5.1 Structure

**Progressive disclosure — cards to choose, table to verify.** Cards optimize for the decision; tables optimize for confirming a specific inclusion. Doing both, in that order, serves both readers without either format carrying a load it's bad at.

| # | Band | Surface |
|---|---|---|
| 1 | H1 + one-line intro | bg |
| 2 | **Three tier cards** | bg |
| 3 | **What the monthly covers** — "Keep your site working." | sand |
| 4 | **Full comparison** table | bg |
| 5 | **Add-ons** — secondary treatment | sand |
| 6 | **Scope FAQ** — 5 questions | bg |
| 7 | Closing CTA | deep green |

### 5.2 Tier cards

Each card, in fixed order: tier name → doc one-liner (serif italic) → build price (large, tabular) → `+ $X/month` (secondary weight, same line group) → "Best for" (one sentence from the SOP) → **exactly five** inclusion bullets → "Start with [tier] →".

Five bullets, not twenty. The SOP lists 10–14 inclusions per tier; dumping them makes three dense grey columns nobody reads and destroys the visual hierarchy. The card sells the *shape* of the tier; the table below holds the detail. For Search and Search Plus, bullet one is "Everything in [previous tier]" — carrying the cumulative structure without repetition.

Price presentation: `$1,100` at `--step-4`, then `+ $55/month` at `--step-1` in `--color-muted` directly beneath. Both numbers visible without interaction — no monthly/annual toggle, no "starting at."

**No "Most popular" marker at launch (owner decision, 2026-08-23** — no clients yet, so the claim would be fabricated, which the brand guardrails ban). Revisit once real client data supports it; when added, the treatment is one word in clay, small caps, no ribbon or scale transform.

### 5.3 "What the monthly covers"

The most important band on the page, and the one the old site's shadow makes essential. A visitor who remembers or infers cheap static hosting will assume the monthly is margin. Answer plainly:

- H2 — **[doc]** *"Keep your site working."* (serif)
- *[draft]* Lead: "Every Keepsite site includes hosting, maintenance, and monitoring. On Search and Search Plus, the monthly is mostly content and search work."
- Three short columns, one per tier, naming what each monthly actually delivers — Presence: hosting, maintenance, monitoring, minor content updates, annual recap. Search: all of that plus **24 SEO blog posts a year**, written and published for you, Search Console monitoring, annual keyword refresh. Search Plus: all of that plus active optimization through the year.
- *[draft]* Closing line: "Every Keepsite site also includes an inquiry page, set up to send straight to your email or your existing CRM." (from the SOP's universal inclusion — a good trust detail)

"24 blog posts a year, written and published for you" is the strongest single fact on the page for justifying $150/month. It should be typographically prominent, not a bullet in a list.

### 5.4 The lock-in question — DECIDED

The old site pre-empted "am I trapped?" with "$0/month, no lock-in, you own the repo." That answer is gone, and the new model doesn't get to skip the question — an unanswered subscription commitment is where conversions die, and evasiveness contradicts "Transparent: explain what something costs, what it does, and why it matters."

**Approved policy (owner, 2026-08-23):**

- **Presence:** month to month. Cancel any time with 30 days' notice.
- **Search / Search Plus:** 12-month initial term, month to month after. Rationale: the subscription genuinely is an annual content program (annual keyword plan, 24 posts/year), and batch-produced content work would otherwise be exposed to early cancellation.
- **Exit promise (all tiers):** the domain and the content are the client's; published blog posts go with them; Keepsite helps them move.

**Site copy** for the "What the monthly covers" band:

> "Presence is month to month — cancel any time with 30 days' notice. Search and Search Plus run on an annual content plan, so the first year is a 12-month commitment; after that, month to month. Either way, your domain and your content are yours — if you ever leave, we'll help you move them."

The 12-month term is framed as the shape of the service (an annual plan), never as a penalty. The copy says nothing about repos, Netlify accounts, or "no lock-in," and deliberately does not promise the client keeps the built site or its code.

**Operational note (internal, not site content):** batch the content *planning* annually but draft and edit *quarterly*, so sunk labor at any moment is at most ~6 posts. This caps exposure even in the cases a contract can't (mid-term default, disputes). Belongs in the external SOP, not this repo.

Placement: one line in the "What the monthly covers" band, expanded in the FAQ ("Am I locked into a contract?" / "What happens if I stop?" answer directly from the policy above).

### 5.5 Comparison table

A real `<table>` with `<caption>`, `<th scope="col">` for tiers and `<th scope="row">` for features. Roughly 14 rows grouped by `<tbody>`: Build (7 rows) and Monthly (7 rows). Cells use a check glyph plus **visually-hidden text** ("Included" / "Not included") — never a symbol alone, since a screen reader announcing "✓ ✓ ✓" with no context fails 1.3.1. Sticky first column at ≥900px.

Mobile: horizontal scroll inside a `<div role="region" aria-label="Package comparison" tabindex="0">`. The `tabindex` is required — a scrollable region unreachable by keyboard is a 2.1.1 failure, and it's the detail most implementations miss.

Rows must be authorable in the CMS (§6.2), not hard-coded, so the owner can adjust inclusions without a developer.

### 5.6 Add-ons — deliberately secondary

The SOP is explicit: "Keepsite intentionally keeps add-ons minimal. Clients should not need to assemble their own website package." The design must enforce that.

**Treatment:** no cards, no columns, no pricing emphasis. A `<dl>` on the sand band at `--step--1`, prices in `--color-muted` at body weight, under H2 *[draft]* "If you need something extra." Five items straight from the SOP (additional standard page $180; additional SEO page $270, Search and Search Plus only; full copy development $90/hr; advanced integration $90/hr quoted first; major expansion — custom quote).

Then the upgrade rule, stated as a customer benefit rather than a policy:

> *[draft]* "If what you need is more strategy rather than more pages, we'll move you to the package that covers it instead of selling it piece by piece."

That's the SOP's tier-protection rule turned into a trust signal — it reads as "we won't nickel-and-dime you," which is precisely the brand personality ("Does not turn every recommendation into an upsell").

**Do not put internal tier-protection mechanics on the site.** "Tier 1 clients cannot add keyword research à la carte" is an internal scope control; on a public page it reads as restriction. The one-sentence version above conveys the same boundary as generosity.

### 5.7 Scope FAQ on the packages page

Five questions inline (which package, Search vs Search Plus, what the monthly covers, who writes the copy, can I change tiers), then "More questions →" to `/faq/`.

**Structured-data note:** render these visually on `/packages/` but emit `FAQPage` JSON-LD **only on `/faq/`**. Duplicating FAQPage markup across two URLs sends conflicting canonical signals for the same Q&A set. One canonical home for the schema; the packages page just shows the content.

---

## 6. Data & CMS model

### 6.1 File-level changes

| File | Action |
|---|---|
| `src/data/site.json` | **Restructure** — `brand`, `legalName`, `email`, `phone?`, `areaServed`, `social[]`, `googleBusinessProfileUrl?`, `nav[] {label, href, cta?}`, `tagline`. `footerNote` deleted |
| `src/data/home.json` | **Rewrite** to the seven-band structure; `runningCosts` and `hourlyLine` deleted |
| `src/data/pricing.json` | **Delete** → replaced by `packages.json` |
| `src/data/packages.json` | **New** — see §6.2 |
| `src/data/process.json` | **New** — steps, "what we need," "what you won't have to do" |
| `src/data/faq.json` | **Rewrite** — new groups; each item gains `topic` so the packages page can pull the five scope questions from the same source |
| `src/content/portfolio/` | **Delete** → `src/content/work/` (empty at launch) |
| `src/content.config.ts` | `portfolio` collection → `work` with the §4.4 schema |

### 6.2 `packages.json` shape

```
{
  intro,
  tiers: [{
    id, name, line, bestFor,
    buildPrice, buildPriceNote,
    monthlyPrice, monthlyPriceNote,
    cardIncludes[],        // exactly 5, for the card
    monthlySummary[],      // for the "What the monthly covers" band
    featured, ctaLabel
  }],
  comparison: [{
    group,                 // "Build" | "Monthly"
    feature,
    presence, search, searchPlus   // true | false | string
  }],
  addOns: [{ name, price, note }],
  upgradeRule,
  subscriptionTerms
}
```

Two design points. **`comparison` is a flat array of rows with one value per tier** — this maps directly to a Decap list widget and renders straight to `<tr>`, so the owner can add or reword a comparison row without touching code. Allowing `string` alongside boolean lets a cell read "24/year" or "Search and Search Plus only" instead of forcing everything into a checkmark. And **`cardIncludes` is separate from `comparison`** rather than derived — the five card bullets are a curated sales summary, not the first five table rows, and conflating them would either bloat the cards or gut the table.

### 6.3 DecapCMS configuration

Collections: **Site settings** (site.json), **Home** (home.json), **Packages** (packages.json), **How it works** (process.json), **FAQ** (faq.json), **Work** (folder collection, `create: true`).

Config improvements alongside the rewrite:
- `site_url`, `display_url`, `logo_url` — currently absent; adds an escape hatch back to the live site from the CMS.
- `local_backend: true` for `npx decap-server` development, so CMS changes can be tested without committing to `main`.
- Field-level `hint` text on the pricing fields (format guidance, e.g. `$1,100`) and `pattern` validation on prices — prices are the highest-cost typo on the site.
- `required: true` on every field the templates render unconditionally; a missing value in a JSON singleton is a build failure, not a graceful degradation.
- Keep `git-gateway` / `branch: main`. No editorial workflow — a single editor doesn't need PR review, and it adds friction.

**What the CMS must never manage:** anything from Part II of the SOP. No labor-hour fields, no `$90/hour` cost basis, no margin notes, no internal tier-protection language, no operational metrics. If it can be edited in Decap it can be published to a public site; the internal SOP has no representation in this repo at all (§8).

### 6.4 Blog / notes collection

Not at launch. Define the collection in `content.config.ts` in a later phase and ship the route only when three real posts exist — same conditional-route pattern as `/work/`. A studio selling 24 SEO posts a year should eventually publish its own; a three-month-stale blog with two posts actively argues against the product.

---

## 7. Technical excellence workstream

The acceptance bar: Lighthouse 100/100/100/100 on every route, `astro check` clean, zero console errors, valid structured data.

**7.1 Semantic HTML & landmarks.** One `<h1>` per page, no skipped levels. `<header>` / `<nav aria-label="Primary">` / `<main id="main">` / `<footer>` — note `<main>` currently lives inside each page rather than the layout; move it to `BaseLayout` so it can't be forgotten. Add a skip link (`.skip-link`, visually hidden until focused) as the first focusable element. Numbered process steps use `<ol>`. `aria-current="page"` is already correct in `Header.astro` — keep it. Footer contact in `<address>`.

**7.2 Per-page meta, canonical, Open Graph.** Type `BaseLayout`'s props with an `interface Props { title: string; description: string; ogImage?: string; noindex?: boolean }` and **remove the default description** so TypeScript fails the build on any page that omits it. Canonical via `new URL(Astro.url.pathname, Astro.site)` — `astro.config.mjs` already sets `site` to the www origin, matching the Netlify primary domain. Full OG set (`og:type`, `og:title`, `og:description`, `og:url`, `og:image`, `og:image:alt`, `og:site_name`, `og:locale`) plus `twitter:card=summary_large_image`. `<meta name="robots" content="noindex,follow">` when `noindex` is set (404, thanks page). One statically designed 1200×630 OG image in `public/` — wordmark and tagline on `--color-brand-deep`. No dynamic OG generation; it's a dependency and a build-time cost for a six-page site.

**7.3 Structured data (JSON-LD).** Three pieces, each `<script type="application/ld+json" set:html={JSON.stringify(...)}>`:
- **Site-wide** (in `BaseLayout`): an `@graph` containing `WebSite` and `ProfessionalService`, the latter with a stable `@id` of `{site}/#business`, plus `name`, `url`, `email`, `areaServed`, `sameAs` (Google Business Profile, Instagram), `priceRange`. **Omit `address` unless the owner has a real business address** — a fabricated or partial address is an actual Google policy problem. Without one it won't earn a local rich result, which is fine: the Google Business Profile is the correct home for local signals, and the markup still does its entity-disambiguation job.
- **`/packages/`**: one `Service` per tier, each with `provider: {@id: .../#business}` and two `Offer`s — the build (`price`, `priceCurrency: "USD"`) and the subscription (`UnitPriceSpecification` with `billingDuration: "P1M"`). Generated from `packages.json` so prices can never drift from the visible page.
- **`/faq/` only**: `FAQPage`, generated from `faq.json`.

Validate against Google's Rich Results Test and Schema.org validator before launch.

**7.4 Sitemap & robots.** Add `@astrojs/sitemap` (official, zero-config with `site` set); filter out `/start/thanks/` and `/404`. Hand-write `public/robots.txt` with `Sitemap: https://www.keepsitemedia.com/sitemap-index.xml` and `Disallow: /admin/`. Both are currently missing entirely.

**7.5 WCAG 2.1 AA.** Contrast table in §3.2 — every combination measured, all pass, most at AAA. Focus indicator per §3.4's two-tone ring (fixes the current invisible green-on-green failure). Reduced-motion block plus gating `scroll-behavior: smooth` (fixes the current unconditional smooth scroll). Interactive targets ≥44×44px. Form labels always visible and programmatically associated; hints via `aria-describedby`; rely on native validation rather than custom JS error handling. Table semantics per §5.5, including the keyboard-reachable scroll region. Icons and glyphs paired with visually-hidden text. `<html lang="en">` (already present). Verify with axe DevTools plus a keyboard-only pass through every route and a VoiceOver/NVDA pass on the packages table and the form.

**7.6 Fonts without layout shift.** Per §3.1: self-hosted via Fontsource, latin subset, preload the variable sans only, `font-display: swap`, metric-matched fallback with hand-tuned `size-adjust`. Verify CLS = 0 in Lighthouse *and* by throttling to Slow 3G and watching for reflow.

**7.7 404 page.** `src/pages/404.astro` — Netlify serves it automatically for static sites, no redirect rule needed. Same layout, `noindex`, links to the four main routes.

**7.8 Security headers in `netlify.toml`.** None exist today. Add:

| Header | Value |
|---|---|
| `Content-Security-Policy` | `default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; font-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'self'; object-src 'none'; upgrade-insecure-requests` |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains; preload` |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), interest-cohort=()` |
| `X-Frame-Options` | `DENY` |

Two implementation notes. **`/admin/*` needs its own looser header block** — DecapCMS loads from `unpkg.com` and talks to Netlify Identity, so it needs `script-src https://unpkg.com` and `connect-src https://identity.netlify.com https://api.netlify.com`. Scope that widening to `/admin/*` only; the marketing pages stay locked down. And `'unsafe-inline'` for scripts is needed for Astro's scoped styles and the one tier-prefill script; if the owner wants it removed later, Netlify supports nonce injection via a post-processing plugin — worth noting but not worth blocking launch over. Also add `Cache-Control: public, max-age=31536000, immutable` for `/_astro/*` (content-hashed, safe) and a short max-age for HTML.

**7.9 Zero client JS.** With `NodeNetwork` deleted and the `?success=1` toggle replaced by a real thanks page, the only script left is ~200 bytes of tier prefill on `/start/`. No hydration, no framework, no third-party tags. If analytics is added later, use a cookieless script (Plausible/Fathom) loaded `defer` — and update the CSP `script-src`/`connect-src` in the same commit.

**7.10 `astro check` clean.** Typed `Props` interfaces on `BaseLayout` and `ProjectCard` (currently a bare destructure with no types), `strict: true` in `tsconfig`, and typed content-collection access via `CollectionEntry<'work'>`. Wire `npm run check` into the Netlify build command so a type error fails the deploy rather than shipping.

**7.11 Automated acceptance gate.** Add `@netlify/plugin-lighthouse` to `netlify.toml` with thresholds set to `1.0` on all four categories for the main routes. This makes "Lighthouse 100s" an enforced build gate rather than a one-time manual check — which matters, because the claim being sold is ongoing competence, not launch-day competence. Also run a link check over `dist/` before launch to catch the renamed-route fallout.

---

## 8. Migration & cleanup

### 8.1 The `.docx` files — the security question

`Keepsite_Media_Packages_and_SOP.docx` is at the repo root (currently untracked) and contains Part II: labor-hour budgets per tier, the `$90/hour` internal cost basis, the margin analysis showing Tier 1's labor value at $810–$945 against a $1,100 price, the pricing guardrail ("do not lower package pricing simply because a specific project finishes under budget"), scope-control mechanics, and named staff. Publishing that would be commercially damaging in a specific, obvious way: any prospect could compute the margin on their own quote.

**Recommendation:**

1. **Remove both `.docx` files from the working tree.** They aren't build inputs; nothing imports them. Their content will live in `src/data/*.json` where the site actually needs it.
2. **Add `*.docx` and `/docs/internal/` to `.gitignore`** so neither can be added by accident.
3. **Store the SOP outside this repo entirely** — the owner's Drive, or a separate private `keepsite-ops` repo. Not in the site repo, not in a gitignored subfolder of it. Gitignore is a convenience, not a control; a file sitting in the working directory is one `git add -f` or one "let me just commit everything" away from being public.
4. **Commit a client-facing brand reference at `docs/brand/brand-strategy.md`** — the brand strategy doc has no sensitive content and is genuinely useful to future contributors (it's the source of truth for voice and the "keep" language system). Convert to markdown, drop the binary.
5. **Add a short "What doesn't belong in this repo" section to the README** naming the categories explicitly: internal labor budgets, hourly cost basis, margin guidance, client contracts, and credentials.

**On repo visibility.** This repo should be treated as **private, permanently** — documented as a requirement in the README, not an incidental fact. Netlify deploys from private GitHub repos without issue, and git-gateway/Decap work identically. If the repo must ever go public, audit history first (the .docx files are untracked today, so as long as they are never committed there is nothing to purge — keep it that way).

### 8.2 Delete

| Path | Reason |
|---|---|
| `src/components/NodeNetwork.astro` | §3.7 |
| `src/data/pricing.json` | Superseded by `packages.json` |
| `src/content/portfolio/*.md` (3) | Fabricated projects |
| `.superpowers/sdd/*` (23 files) | Stale scaffolding containing old copy; gitignore the directory |
| `Keepsite_*.docx` (2) | §8.1 |

### 8.3 Rewrite

`src/data/{site,home,faq}.json` · `src/pages/{index,faq}.astro` · `src/components/{Header,Footer,ProjectCard}.astro` · `src/layouts/BaseLayout.astro` · `src/styles/global.css` · `public/admin/config.yml` · `README.md` (Ownership section → "Repo & access"; keep the DNS/Netlify/CMS runbook, it's accurate and valuable) · `netlify.toml` (redirects + headers + Lighthouse plugin) · `src/content.config.ts`

### 8.4 Supersede, don't edit

`docs/superpowers/specs/2026-06-22-keepsite-media-site-design.md` and `docs/superpowers/plans/2026-06-22-keepsite-media-site.md` — add a `> **Superseded** by [new spec]` banner at the top of each. They're dated records of a real decision; rewriting history in them destroys the reasoning trail. Write the new spec alongside them as `docs/superpowers/specs/2026-08-23-keepsite-brand-transition.md`.

---

## 9. Implementation order

Nine phases. Each is independently shippable — the site is deployable and coherent at every phase boundary. **The one hard constraint: Phases 2–6 must land as a single release.** They are individually reviewable and separately committable, but deploying Phase 2 without Phase 5 puts new prices on `/packages` while the homepage still promises $0/month. Merge them to a `brand-transition` branch, deploy the branch to a Netlify preview for review, and promote to production once Phase 6 is done.

| Phase | Scope | Ships |
|---|---|---|
| **0 — Repo hygiene** | Remove `.docx`, gitignore, delete `.superpowers/sdd/`, confirm repo is private, README security note, supersede old specs | No visual change; independently deployable |
| **1 — Foundation** | Design tokens (§3.2/3.3), Fontsource setup + preload + fallback metrics, **delete NodeNetwork**, `<main>` into layout, skip link, typed `Props`, reduced-motion + focus ring fixes, 404, robots.txt, sitemap, security headers, Lighthouse plugin | New shell, old copy. Site is technically sound and measurably faster before any messaging changes. Deployable alone |
| **2 — Content model** | `packages.json`, `process.json`, rewrite `site.json` / `home.json` / `faq.json`, delete `pricing.json`, `portfolio`→`work` schema, delete placeholders | Data layer only |
| **3 — Homepage** | Rebuild to the seven-band structure; delete `.costs-panel` | **The positioning flips here** |
| **4 — Nav & routes** | Rename routes, 301s, header CTA flag, footer restructure | IA complete |
| **5 — Packages** | Tier cards, monthly band, comparison table, add-ons, scope FAQ, `Service`/`Offer` JSON-LD | The commercial core |
| **6 — How it works, FAQ, Start** | New process page, rewritten FAQ + `FAQPage` JSON-LD, `/start/` + `/start/thanks/`, verify Netlify Forms re-detection | **Last phase of the atomic release** |
| **7 — Work** | Conditional route, restyled cards, homepage strip. Ships dormant; activates on first real project | Post-launch |
| **8 — CMS** | `config.yml` rewrite, `local_backend`, validation, end-to-end edit test through Decap | Post-launch, before handing the owner the keys |
| **9 — Verification gate** | Lighthouse 100s all routes, `astro check`, axe + keyboard + screen-reader pass, Rich Results validation, link check, OG preview check, 301 verification, form submission test | Sign-off |

**Sequencing rationale.** Phase 1 before any copy work because tokens, fonts, and the layout shell are what every later phase renders into — doing it after would mean restyling every new page. Phase 2 before 3–6 because all four page phases read from those data files. Phase 7 after launch because it's genuinely blocked on a real client, and the conditional-route design means it can ship inert and activate later without a code change. Phase 8 after the pages are final so the CMS is configured against the real data shapes rather than being rewritten twice.

---

## Owner decisions (2026-08-23)

1. **Cancellation and exit terms** — decided, see §5.4: Presence month to month (30 days' notice); Search / Search Plus 12-month initial term then month to month; domain and content are the client's, published posts go with them, Keepsite helps them move. Internally, content drafting moves to quarterly batches.
2. **Business facts** for JSON-LD (§7.3), footer, and `site.json`:
   - Legal/brand name: **Keepsite Media**
   - Service area (`areaServed`): **Utah**
   - Phone: **(385) 307-8190** — `+13853078190` in structured data
   - Google Business Profile: **in progress** — omit from `sameAs` at launch; add the URL to `site.json` when live (no code change needed).
3. **Business address: omit.** Not eligible for local rich results at launch; the Google Business Profile will carry local signals once live.
4. **"Most popular" marker: omit** (no client data yet). See §5.2.
5. **Contact email: `keepsitemedia@gmail.com`** — replaces `snic9004@gmail.com` everywhere public (`site.json`, footer, `/start/` fallback line, README). Netlify Forms notification recipient should be updated to match.
