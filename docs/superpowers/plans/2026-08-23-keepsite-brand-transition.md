# Keepsite Media Brand Transition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace every surface of the Keepsite Media site that argues the old "pay once, you own it, $0/month" model with the new productized model (three packages, build price plus monthly subscription), on a rebuilt visual and technical foundation.

**Architecture:** The Astro 5 static site keeps its skeleton (layout, header/footer, container/section CSS) and replaces almost everything written on top of it. Phase 0 clears repo hygiene, Phase 1 rebuilds the design tokens, fonts, and technical shell under the *old* copy so it stays deployable, Phases 2–6 swap the entire content model and every page, and Phases 7–9 add the dormant Work route, the CMS, and the verification gate. All page content lives in `src/data/*.json` so DecapCMS can edit it; templates render it and derive JSON-LD from the same data so prices can never drift.

**Tech Stack:** Astro 5.18 (static output), Netlify (hosting, Forms, Identity/git-gateway), DecapCMS 3, Fontsource self-hosted Instrument Sans Variable + Instrument Serif, `@astrojs/sitemap`, `@netlify/plugin-lighthouse`, `sharp` (already an Astro dependency) for the one-off OG image. No client framework, no hydration.

**Spec:** `docs/superpowers/specs/2026-08-23-keepsite-brand-transition.md`

## Release shape

- **Phase 0 and Phase 1 land on `main` and deploy on their own.** Phase 0 changes nothing visible. Phase 1 ships the new shell under the old copy: it is technically sound and measurably faster with the old messaging intact.
- **Phases 2–6 land as one atomic release on a `brand-transition` branch** (spec §9). They are individually reviewable and separately committable, but they must not reach production separately: deploying Phase 2 or 5 alone would put new prices on `/packages/` while the homepage still promises $0/month, which reads as a bait-and-switch. Task 2.1 creates the branch. Task 6.4 is the branch gate. Deploy the branch to a Netlify **deploy preview** for review, then promote to production only after Phase 6 passes.
- **Inside the branch some header links 404 until their phase lands** (for example `/packages/` is not a real route until Phase 4 renames it). That is expected on the branch and is closed out by Task 6.4's link check before the branch is promoted.
- **Phases 7–9 land after the release.** Phase 7 ships the Work route dormant; Phase 8 rewires the CMS against the final data shapes; Phase 9 is the sign-off gate.

## Global Constraints

Every task's requirements implicitly include this section.

**Business facts** (spec, Owner decisions 2026-08-23) — these exact values, nowhere else invented:
- Brand and legal name: `Keepsite Media`
- Service area (`areaServed`): `Utah`
- Phone, display: `(385) 307-8190` · phone, structured data and `tel:` links: `+13853078190`
- Contact email everywhere public: `keepsitemedia@gmail.com`. The old address `snic9004@gmail.com` must not survive anywhere in `src/`, `dist/`, or `README.md`.
- **No business address.** Do not add `address`, `PostalAddress`, or a street/city anywhere. A partial or invented address is a Google policy problem.
- **No Google Business Profile URL yet.** `site.json` carries `googleBusinessProfileUrl: ""`; templates include it in `sameAs` only when non-empty, so the owner can paste the URL in later with no code change.
- **No "Most popular" marker** on any tier. There are no clients yet, so the claim would be fabricated.

**Prices** (spec §4.1, §5.2, SOP Part I) — build price + monthly, both always visible, never "starting at":
- Presence `$1,100` + `$55`/month
- Search `$1,750` + `$150`/month
- Search Plus `$2,000` + `$275`/month
- Add-ons: additional standard page `$180`; additional SEO page `$270` (Search and Search Plus only); full copy development `$90` an hour; advanced integration `$90` an hour, quoted first; major expansion, custom quote.

**Confidentiality:** the add-on rates above come from the SOP's **Part I** (client-facing) and are meant to be public. **Nothing from the SOP's Part II may appear in any file this plan creates or in the CMS** — no labor-hour budgets, no `$90/hour` described as an internal cost basis, no margin figures, no tier-protection mechanics ("Tier 1 clients cannot add keyword research à la carte"), no operational metrics, no staff names. If it can be edited in Decap it can be published.

**Subscription terms** — this paragraph is approved copy (spec §5.4) and is used **verbatim**, no rewording:

> Presence is month to month — cancel any time with 30 days' notice. Search and Search Plus run on an annual content plan, so the first year is a 12-month commitment; after that, month to month. Either way, your domain and your content are yours — if you ever leave, we'll help you move them.

(The em dashes in that block are the spec's own approved punctuation and stay as written. They are the **only** em dashes permitted in site copy.)

**Copy rules** (brand strategy §5, §14):
- Warm, concise, plainspoken, assured, lightly witty, transparent.
- No jargon, no fear-based selling, no overstated claims ("revolutionary", "cutting-edge", "unlock"), no cutesy, no bro-y, no aspirational fluff.
- No em dashes anywhere in site copy except the approved subscription-terms block above. Use commas, periods, or a colon.
- "We", never "I". The brand is a small studio.
- No "no lock-in", no "$0 a month", no "nothing to pay", no "you own the repo", no "hand over". The new site never argues with the old positioning; it just does not carry it.
- **"Keep"-phrase budget:** these phrases go only where the spec's placement plan puts them. Homepage: three placements maximum ("A website that earns its keep.", the tier one-liners "Keep showing up." / "Keep growing.", and the closing "Keep your business moving."). Packages page: "Keep your site working." as the monthly-band H2. How it works: "Keep it simple." as the pull-line. Closing CTA band on every page: "Keep your business moving." Do not add others.
- Verbatim brand-doc lines that must not be reworded: the taglines "Websites for people with other things to do." and "A website that earns its keep."; the hero sub "Professional websites built to look good, work hard, and stay off your to-do list."; "You don't need another business task."; "We build it. We keep it useful."; the tier one-liners "Be there when people look." / "Keep showing up." / "Keep growing."; the pillar names "Make it useful." / "Keep it simple." / "Show your work." / "Build for real life."; "Keep your business moving." / "We'll take care of the website."; "Keep your site working."

**Technical floors:**
- `npm run build` and `npx astro check` must both pass with zero errors at the end of every task.
- One `<h1>` per page, no skipped heading levels.
- Every `BaseLayout` usage must pass an explicit `description`. There is no default.
- Motion policy: transitions only on `color`, `background-color`, `border-color`, `opacity`, `text-decoration-color`; duration ≤150ms. No lift, no shadow-on-hover, no scroll reveals, no looping animation.
- Zero client JS on every page except `/start/`, which carries one small inline tier-prefill script.
- Astro 5.18.2, Node 20.

**Commit style:** imperative subject under 50 characters, body only when the reason is not obvious from the diff. Every commit ends with these two trailer lines:

```
Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017DWwHn2MN9zCJYmixdNzCz
```

## File Structure

**Created**

| Path | Responsibility |
|---|---|
| `.gitignore` (extended) | Keep `.docx`, internal docs, and superpowers scaffolding out of the repo |
| `docs/brand/brand-strategy.md` | Committed, client-safe brand reference. Source of truth for voice and the "keep" language system |
| `tsconfig.json` | Strict TypeScript so `astro check` can fail the build |
| `src/env.d.ts` | Astro client types (`*?url` asset imports) |
| `scripts/make-og-image.mjs` | One-off generator for the 1200×630 OG PNG |
| `public/og-default.png` | Site-wide Open Graph image |
| `public/favicon.svg` | Favicon (stops a 404 in the console) |
| `public/robots.txt` | Crawl rules + sitemap pointer |
| `src/pages/404.astro` | Not-found page, `noindex` |
| `src/data/packages.json` | Tiers, monthly band, comparison rows, add-ons, subscription terms |
| `src/data/process.json` | How-it-works steps, "what we need", "what you won't have to do" |
| `src/pages/how-it-works.astro` | The "Keep it simple." page |
| `src/pages/start/index.astro` | Inquiry form (renamed from `contact.astro`) |
| `src/pages/start/thanks.astro` | Real form-success page, `noindex` |
| `src/pages/work/[...path].astro` | Conditionally generated Work index |
| `src/components/ClosingCta.astro` | The deep-green closing band, used by every page |
| `src/components/WorkCard.astro` | Work item card (replaces `ProjectCard.astro`) |
| `src/content/work/` | Work collection folder (empty at launch, `.gitkeep`) |

**Modified**

| Path | Change |
|---|---|
| `package.json` | Add font, sitemap deps; `check` wired into the Netlify build |
| `astro.config.mjs` | Add sitemap integration with a filter |
| `netlify.toml` | Redirects, security headers, cache headers, Lighthouse plugin |
| `README.md` | "What doesn't belong in this repo", "Repo & access", new email |
| `src/styles/global.css` | Full token + base rewrite |
| `src/layouts/BaseLayout.astro` | Typed required props, `<main>`, skip link, meta/canonical/OG, site JSON-LD, fonts |
| `src/components/Header.astro` | `cta` flag from data, conditional Work item |
| `src/components/Footer.astro` | Three-column, `<address>`, no sales claim |
| `src/content.config.ts` | `portfolio` collection → `work` with the new schema |
| `src/data/site.json` | Restructured |
| `src/data/home.json` | Rewritten to the seven-band structure |
| `src/data/faq.json` | Rewritten, new groups, `topic` on every item |
| `src/pages/index.astro` | Rebuilt to seven bands |
| `src/pages/packages.astro` | Renamed from `pricing.astro`, rebuilt |
| `src/pages/faq.astro` | Rewritten + `FAQPage` JSON-LD |
| `public/admin/config.yml` | Rewritten against the final data shapes |

**Deleted**

`Keepsite_Brand_Strategy.docx` · `Keepsite_Media_Packages_and_SOP.docx` · `.superpowers/sdd/` (23 files) · `src/components/NodeNetwork.astro` · `src/components/ProjectCard.astro` · `src/data/pricing.json` · `src/content/portfolio/` (3 placeholder files) · `src/pages/portfolio.astro` · `src/pages/pricing.astro` (renamed) · `src/pages/contact.astro` (renamed)

## Test cycle for this repo

This is a static Astro site with no test framework. Every task's "test cycle" is a concrete verification block instead of unit tests:

```bash
npm run build        # must exit 0
npx astro check      # must report 0 errors, 0 warnings
```

plus task-specific `grep` assertions against `src/` or `dist/`, and `ls` checks for routes that must (or must not) be emitted. Manual checks (Lighthouse, axe, screen reader, Rich Results, CLS on Slow 3G) are collected in Task 9.2. Every task ends with run-verification → commit.

---

# Phase 0 — Repo hygiene

Ships on `main`. No visual change.

### Task 0.1: Remove binaries and stale scaffolding

**Files:**
- Delete: `Keepsite_Brand_Strategy.docx`, `Keepsite_Media_Packages_and_SOP.docx` (both untracked)
- Delete: `.superpowers/sdd/` (23 files including 10 `.diff` files)
- Modify: `.gitignore:1-5`

**Interfaces:**
- Consumes: nothing.
- Produces: a working tree with no `.docx` and no `.superpowers/`. Task 0.2 needs the brand-strategy content, which is embedded in this plan, not read from the deleted binary.

- [ ] **Step 1: Confirm the owner has saved the SOP outside this repo**

`Keepsite_Media_Packages_and_SOP.docx` contains the SOP's Part II: labor-hour budgets, the internal `$90/hour` cost basis, margin figures against the package prices, scope-control mechanics, and staff names. **Deleting it here destroys the only copy in this directory.** Before running Step 2, confirm with the owner that the file is saved somewhere outside this repo (their Drive, or a separate private `keepsite-ops` repo). Gitignore is a convenience, not a control — the file must not live in this working directory at all, not even in a gitignored subfolder.

Do not proceed until that confirmation exists.

- [ ] **Step 2: Verify both `.docx` files are untracked**

```bash
git ls-files --error-unmatch Keepsite_Brand_Strategy.docx Keepsite_Media_Packages_and_SOP.docx
```

Expected: fails with `did not match any file(s) known to git` for both. That means they were never committed, so there is nothing to purge from history. If either **is** tracked, stop and tell the owner: the file is in git history and removing it from the working tree is not enough.

- [ ] **Step 3: Delete the binaries and the scaffolding**

```bash
rm -f Keepsite_Brand_Strategy.docx Keepsite_Media_Packages_and_SOP.docx
rm -rf .superpowers
```

- [ ] **Step 4: Extend `.gitignore`**

Replace the whole file with:

```gitignore
node_modules/
dist/
.astro/
.DS_Store
.env

# Never commit: internal business documents, contracts, credentials.
*.docx
docs/internal/
.superpowers/
```

- [ ] **Step 5: Verify**

```bash
ls *.docx 2>&1                       # expect: No such file or directory
ls -d .superpowers 2>&1              # expect: No such file or directory
git status --porcelain               # expect: only  M .gitignore
npm run build && npx astro check     # expect: build exit 0, check 0 errors
```

- [ ] **Step 6: Commit**

```bash
git add .gitignore
git commit -m "chore: purge internal binaries and sdd scaffolding

The SOP .docx carries internal labor budgets and margin figures that
must never reach a public deploy. Both .docx files and .superpowers/
are now ignored so they cannot be added back by accident.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017DWwHn2MN9zCJYmixdNzCz"
```

---

### Task 0.2: Commit the brand strategy as markdown

**Files:**
- Create: `docs/brand/brand-strategy.md`

**Interfaces:**
- Consumes: nothing.
- Produces: `docs/brand/brand-strategy.md` — the voice reference every later copy task argues from. Its "keep" language table and tagline hierarchy are the source of the verbatim lines listed in Global Constraints.

- [ ] **Step 1: Create the file**

Create `docs/brand/brand-strategy.md` with exactly this content. It contains no pricing, no labor budgets, and no internal mechanics, so it is safe to commit.

````markdown
# Keepsite — Brand Strategy & Website Direction

A clear creative and messaging guide for designing the Keepsite brand experience.

**Brand essence:** calm competence + clear usefulness + human warmth.

> Converted from `Keepsite_Brand_Strategy.docx` on 2026-08-23. The original binary is not kept in this repo.

## 1. Core brand idea

Keepsite makes websites for busy business owners who want their site to look professional, work well, and keep doing its job without becoming another thing to manage.

They know what they're doing, and this is going to be easy.

The brand should feel competent and polished without becoming corporate, technical, over-designed, or overly precious. Every part of the experience should reduce cognitive load for the client.

## 2. Brand keywords

**Primary:** clear, capable, approachable, dependable, useful, intentional, effortless.

**Secondary:** calm, modern, practical, thoughtful, transparent, steady, human, uncomplicated, smart, trustworthy, efficient, low-maintenance, grounded, helpful, professional.

**Words and tones to avoid:** overly quirky or eccentric; cutesy or bubbly; luxury-for-luxury's-sake language; bro-y marketing language; jargon-heavy technical language; fear-based selling; overstated claims such as revolutionary, disruptive, or cutting-edge.

## 3. Brand feel

- **Expert, not intimidating.** Keepsite should clearly know more than the client about websites, SEO, and technical setup without making the client feel behind or uninformed.
- **Warm, not bubbly.** Friendly and easy to talk to without sounding overly casual, performative, or "bestie" branded.
- **Modern, not trendy.** Current and polished enough to feel relevant for years, rather than built around a short-lived visual trend.
- **Simple, not bare.** Clean layouts and straightforward navigation, with enough detail and intention to feel designed rather than stripped down.
- **Strategic, not complicated.** A lot may happen behind the scenes, but the client should not experience that complexity.
- **Confident, not salesy.** Keepsite should not manufacture fear around SEO, bad websites, or lost leads. It should recommend what is useful and be comfortable saying when something is unnecessary.

> Here's what your website needs. We can take care of it.

## 4. Brand personality

- Knows exactly what they are doing, but never makes the client feel stupid for not knowing the same things.
- Explains complicated things in plain language.
- Does not give clients homework unless it is genuinely necessary.
- Does not turn every recommendation into an upsell.
- Notices problems before the client has to.
- Is organized, dependable, and comfortable saying, "You don't need that."
- Cares more about usefulness than sounding impressive.
- Can explain the technical reasoning when the client wants it, but is equally comfortable saying, "We've got it."

## 5. Voice and writing characteristics

- **Warm:** friendly, natural, conversational.
- **Concise:** say what matters and stop.
- **Plainspoken:** use normal language instead of marketing jargon.
- **Assured:** confident without constant hedging or overselling.
- **Lightly witty:** occasional personality, especially around the reality of running a business.
- **Transparent:** explain what something costs, what it does, and why it matters.

**Voice should not be:** overly enthusiastic, cutesy, sarcastic, bro-y, overly polished, jargon-heavy, fear-based, aspirational fluff.

**Voice examples**

| Instead of | Keepsite |
|---|---|
| Unlock the full potential of your digital presence with a strategic SEO solution tailored to elevate your brand. | Your website should be doing more than sitting there looking nice. |
| Our comprehensive SEO services increase visibility and drive organic traffic. | We build your site around what your customers are actually searching for. |
| Take your online presence to the next level. | Keep showing up when the right people search. |

## 6. Brand pillars

### 1. Make it useful

A website should have a job. For one client, that may simply be looking professional when someone clicks over from Instagram. For another, it may be helping new customers discover the business through Google. Keepsite does not add complexity just because it can.

*A site worth keeping. · A website that earns its keep. · Built to do its job. · Useful by design. · Your website should work for your business.*

### 2. Keep it simple

Clients have already made the important decision to outsource their website. Keepsite should respect that by minimizing meetings, decisions, homework, and jargon. The complexity belongs behind the curtain.

*Keep it simple. · Websites for people with other things to do. · Less website work for you. · You run your business. We'll handle the site. · No website homework required.*

### 3. Show your work

Clients should understand what they are paying for, what Keepsite is doing, what is included, and whether the website is working. Transparency should create trust without creating another task for the client.

*No mysterious marketing. · Clear pricing. Clear work. Clear results. · We'll tell you what's working. · Analytics in plain English. · SEO shouldn't feel like magic.*

### 4. Build for real life

Keepsite serves people running real businesses with limited time and attention. The service should be designed around clients who have jobs, customers, employees, families, appointments, inventory, and other responsibilities.

*Websites for people with other things to do. · Your website shouldn't become another job. · Built for busy businesses. · Keep your business moving. · We handle the website so you can handle everything else.*

## 7. The "keep" language system

Use "keep" language as a recurring brand device rather than in every paragraph. Repetition should create cohesion, not feel gimmicky.

*A site worth keeping. · Keep your site working. · Keep showing up. · Keep growing. · Keep it simple. · Keep your business moving. · We build it. We keep it useful.*

**Suggested use across the site**

| Location | Suggested phrase |
|---|---|
| Homepage | A website that earns its keep. |
| Search section | Keep showing up. |
| Maintenance section | Keep your site working. |
| Growth/SEO section | Keep growing. |
| Process section | Keep it simple. |
| Closing CTA | Keep your business moving. |

## 8. Tagline hierarchy

**Primary brand tagline:** *Websites for people with other things to do.* Use this as the broad brand statement. It communicates the audience, philosophy, simplicity, empathy, and positioning without requiring the reader to understand web or SEO terminology.

**Secondary / campaign line:** *A website that earns its keep.* Use this as a homepage headline, campaign line, section headline, social phrase, or proposal language. It ties directly to the Keepsite name while emphasizing usefulness.

## 9. Package language

- **Presence** — *Be there when people look.* For businesses that need a professional home online without turning their website into a marketing project.
- **Search** — *Keep showing up.* For businesses that want their website built around how customers actually search.
- **Search Plus** — *Keep growing.* For businesses that want Keepsite actively watching what is working and improving the site over time.

## 10. Visual direction

Overall direction: clean, editorial, structured, approachable, and modern. The site should feel designed by people with taste, but the design itself should not become the subject.

**Layout:** generous white space; strong visual hierarchy; clear section breaks; uncomplicated navigation; obvious calls to action; restrained use of cards and containers; layouts that feel intentional rather than template-heavy; low visual clutter.

**Typography:** favor a confident sans-serif-led system, potentially paired with a restrained serif for warmth. Headlines can have personality; body copy should prioritize readability. The goal is professional creative business, not a startup dashboard and not a highly stylized wedding brand.

**Color:** use a warm neutral foundation with one confident brand color and one restrained accent. The palette should communicate trust, calm, competence, and friendliness without defaulting to generic corporate software branding.

**UI details:** clean buttons; subtle hover states; restrained motion; minimal decorative effects; simple, clear interaction patterns; personality expressed through typography, copy, icons, and thoughtful motion rather than gimmicks.

## 11. Imagery direction

Avoid generic stock imagery whenever possible. Photography should reinforce real businesses, real work, and real people: real small-business environments, hands at work, thoughtful details, people actively doing their jobs, finished client brands and websites, restrained founder/team portraits when useful.

Client websites themselves can carry much of the visual proof. The work should demonstrate the promise.

## 12. Website experience goals

The Keepsite website itself should demonstrate the "Keep it simple" philosophy. A visitor should never have to wonder:

1. Where am I?
2. What does Keepsite do?
3. Who is this for?
4. How much does it cost?
5. What is the difference between the packages?
6. What do I do next?

Clarity should always win over cleverness.

## 13. Suggested homepage messaging hierarchy

| Band | Copy |
|---|---|
| Hero | Websites for people with other things to do. / Professional websites built to look good, work hard, and stay off your to-do list. / CTAs: View Packages, Start Your Site |
| Problem | You don't need another business task. |
| Solution | We build it. We keep it useful. |
| Packages | Presence — Be there when people look. Search — Keep showing up. Search Plus — Keep growing. |
| Why Keepsite | Make it useful. Keep it simple. Show your work. Build for real life. |
| Closing CTA | Keep your business moving. / We'll take care of the website. |

## 14. Brand guardrails

Before adding anything to the website, ask: does this make Keepsite feel more clear, capable, approachable, or useful? If it only makes the brand feel more clever, trendy, technical, or impressive, leave it out.

For copy, ask: would a busy business owner understand this on the first read? If not, rewrite it.

## 15. One-sentence brand summary

Keepsite is a calm, capable website partner for busy business owners: clear, dependable websites that keep working without becoming another thing to manage.
````

- [ ] **Step 2: Verify no pricing or internal content leaked in**

```bash
grep -nEi '\$[0-9]|per hour|an hour|labor|margin|budget|Sierra|Sam' docs/brand/brand-strategy.md
```

Expected: no output. The brand strategy carries no numbers.

- [ ] **Step 3: Verify the build is unaffected**

```bash
npm run build && npx astro check
```

Expected: build exit 0, check 0 errors.

- [ ] **Step 4: Commit**

```bash
git add docs/brand/brand-strategy.md
git commit -m "docs: add brand strategy as committed markdown

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017DWwHn2MN9zCJYmixdNzCz"
```

---

### Task 0.3: README security section and superseded-spec check

**Files:**
- Modify: `README.md:51-70` (the "Enabling the inquiry form" and "Ownership" sections)
- Check: `docs/superpowers/specs/2026-06-22-keepsite-media-site-design.md:1`
- Check: `docs/superpowers/plans/2026-06-22-keepsite-media-site.md:1`

**Interfaces:**
- Consumes: nothing.
- Produces: a README that names the repo as permanently private and lists what must never be committed. Task 6.4's residue grep includes `README.md`, so the old email must be gone by the end of this task.

- [ ] **Step 1: Update the inquiry-form notification email**

In `README.md`, in the "Enabling the inquiry form" section, replace line 57:

```markdown
3. Send to **snic9004@gmail.com**.
```

with:

```markdown
3. Send to **keepsitemedia@gmail.com**.
```

- [ ] **Step 2: Replace the "Ownership" section**

Delete lines 68-70 (the entire `## Ownership` section, which reads "This site is built to be handed over. The GitHub repo and the Netlify account are the client's. There are no monthly fees and no ongoing costs.") and append this in its place:

```markdown
## Repo & access

This is Keepsite Media's own marketing site. The GitHub repo, the Netlify site, and the domain are Keepsite's.

**This repo is private, permanently.** That is a requirement, not an incidental fact. Netlify deploys from private GitHub repos without issue, and git-gateway and DecapCMS work identically. If the repo ever has to go public, audit the history first.

Access to keep current:
- GitHub: owner account, plus any contributor with push rights.
- Netlify: site owner, Forms notifications, and Identity invites for `/admin`.
- Domain registrar: the account holding `keepsitemedia.com`.

## What doesn't belong in this repo

Never commit, and never put in a DecapCMS field, any of the following. If it can be edited in Decap it can be published to a public site.

- **Internal labor budgets** — hour targets per work category or per tier.
- **Hourly cost basis and margin guidance** — what work costs Keepsite internally, and the gap between that and the package price.
- **Internal scope-control mechanics** — tier-protection rules, revision-absorption policy, operational metrics.
- **Client contracts, proposals, and invoices.**
- **Credentials** — API keys, registrar or Netlify logins, Identity invites, `.env` values.

The operating SOP that contains the first three lives outside this repo entirely, in the owner's Drive or a separate private ops repo. `*.docx` and `docs/internal/` are gitignored so those files cannot be added by accident, but gitignore is a convenience and not a control: do not keep them in this working directory.

Client-facing add-on rates (for example `$180` for an additional standard page) are published on `/packages/` and are fine to have in the repo. The internal cost basis behind them is not.
```

- [ ] **Step 3: Verify the superseded banners are present**

Both old documents should already carry a superseded banner on line 1.

```bash
head -1 docs/superpowers/specs/2026-06-22-keepsite-media-site-design.md
head -1 docs/superpowers/plans/2026-06-22-keepsite-media-site.md
```

Expected, on both:

```
> **Superseded (2026-08-23)** by [docs/superpowers/specs/2026-08-23-keepsite-brand-transition.md](../specs/2026-08-23-keepsite-brand-transition.md) — the business moved from one-time ownership builds to productized subscription tiers. Kept as a historical record.
```

If either line is missing, insert exactly that line as line 1 followed by a blank line. Do not edit anything else in those two files: they are dated records of a real decision, and rewriting them destroys the reasoning trail.

- [ ] **Step 4: Verify**

```bash
grep -n "snic9004" README.md          # expect: no output
grep -n "no monthly fees" README.md   # expect: no output
grep -n "What doesn't belong" README.md
npm run build && npx astro check
```

Expected: first two greps silent, third prints the heading line, build exit 0, check 0 errors.

- [ ] **Step 5: Commit**

```bash
git add README.md docs/superpowers
git commit -m "docs: state repo privacy and off-limits content

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017DWwHn2MN9zCJYmixdNzCz"
```

---

# Phase 1 — Foundation

Ships on `main`. New shell, old copy. The site is technically sound and measurably faster before any messaging changes.

### Task 1.1: Design tokens and base stylesheet

**Files:**
- Modify: `src/styles/global.css:1-81` (full replacement)
- Modify: `src/components/Header.astro:20-28` (scoped `<style>`)
- Modify: `src/components/Footer.astro:14-17`
- Modify: `src/components/ProjectCard.astro:13-20`
- Modify: `src/pages/index.astro:57-79`
- Modify: `src/pages/contact.astro:74-86`
- Modify: `src/pages/faq.astro:39-87`
- Modify: `src/pages/pricing.astro:40-46`

**Interfaces:**
- Consumes: nothing.
- Produces: the token vocabulary every later task uses. Exact names, because later tasks reference them and a mismatch is a silent visual bug:
  - Color: `--color-bg`, `--color-surface`, `--color-surface-alt`, `--color-ink`, `--color-muted`, `--color-brand`, `--color-brand-deep`, `--color-brand-tint`, `--color-accent`, `--color-border`
  - Type: `--font-sans`, `--font-serif`, `--step--1` … `--step-5`
  - Space: `--space-0` … `--space-6`, `--section-y`
  - Shape/width: `--radius`, `--maxw`, `--maxw-prose`, `--maxw-narrow`, `--maxw-lead`
  - Utility classes: `.container`, `.section`, `.section-alt`, `.section-deep`, `.muted`, `.lead`, `.center`, `.prose`, `.narrow`, `.serif`, `.price`, `.btn`, `.btn-outline`, `.link-arrow`, `.card`, `.grid`, `.grid-2`, `.grid-3`, `.grid-4`, `.rule-row`, `.skip-link`, `.visually-hidden`, `.field`, `.field-hint`, `.table-scroll`, `.compare`
- The old names `--color-text` and `--color-accent-ink` are **gone**. `--color-accent` still exists but is now Clay `#A24A26`, not green — every old use of `--color-accent` meant "green" and must become `--color-brand`.

- [ ] **Step 1: Replace `src/styles/global.css` in full**

```css
/* ---------------------------------------------------------------
   Metric-matched fallback for Instrument Sans.

   Declared before the real face so it is in place on first paint.
   Derived from Instrument Sans (upem 1000, hhea ascent 970,
   descent -250, lineGap 0) against Arial (upem 2048, ascent 1854,
   descent -434). size-adjust matches frequency-weighted lowercase
   advance widths: Instrument Sans 508.5/1000em vs Arial 477.4/1000em,
   so 508.5 / 477.4 = 1.065. The ascent and descent overrides are
   expressed against the already-scaled em, so they are the target
   ratios divided by size-adjust: 0.970 / 1.065 = 0.911 and
   0.250 / 1.065 = 0.235.

   Liberation Sans is metrically identical to Arial; Helvetica Neue
   is close enough that the same numbers hold.

   Task 9.2 validates these with a CLS check. If CLS is not 0,
   adjust size-adjust first, then re-derive the two overrides.
   --------------------------------------------------------------- */
@font-face {
  font-family: 'Instrument Sans Fallback';
  src: local('Arial'), local('Helvetica Neue'), local('Liberation Sans');
  size-adjust: 106.5%;
  ascent-override: 91.1%;
  descent-override: 23.5%;
  line-gap-override: 0%;
  font-display: swap;
}

:root {
  /* Color */
  --color-bg: #FBF9F4;           /* warm off-white */
  --color-surface: #FFFFFF;      /* cards, form fields */
  --color-surface-alt: #F2EEE4;  /* warm sand, alternating bands */
  --color-ink: #1F2421;          /* body text */
  --color-muted: #55605B;        /* secondary text */
  --color-brand: #1F5C43;        /* Keep Green: links, buttons, active nav */
  --color-brand-deep: #16302A;   /* closing CTA band, footer */
  --color-brand-tint: #E6EFE9;   /* tier badges, subtle fills */
  --color-accent: #A24A26;       /* Clay. At most twice per page. */
  --color-border: #E4DFD2;

  /* Type */
  --font-sans: 'Instrument Sans Variable', 'Instrument Sans Fallback', Arial, sans-serif;
  --font-serif: 'Instrument Serif', Georgia, 'Times New Roman', serif;
  --step--1: 0.9375rem;
  --step-0: 1.0625rem;
  --step-1: 1.125rem;
  --step-2: clamp(1.25rem, 2vw, 1.4rem);
  --step-3: clamp(1.6rem, 3vw, 2.1rem);
  --step-4: clamp(2rem, 4vw, 2.75rem);
  --step-5: clamp(2.6rem, 5.5vw, 4rem);

  /* Space */
  --space-0: 0.25rem;
  --space-1: 0.5rem;
  --space-2: 1rem;
  --space-3: 1.5rem;
  --space-4: 2.5rem;
  --space-5: 4rem;
  --space-6: 6rem;
  --section-y: clamp(4rem, 9vw, 7rem);

  /* Shape and width */
  --radius: 10px;
  --maxw: 1120px;
  --maxw-prose: 68ch;
  --maxw-lead: 56ch;
  --maxw-narrow: 640px;
}

*, *::before, *::after { box-sizing: border-box; }

html {
  background: var(--color-bg);
  -webkit-text-size-adjust: 100%;
}

/* WCAG 2.3.3: smooth scroll is opt-in, never unconditional. */
@media (prefers-reduced-motion: no-preference) {
  html { scroll-behavior: smooth; }
}

body {
  margin: 0;
  font-family: var(--font-sans);
  font-size: var(--step-0);
  line-height: 1.65;
  color: var(--color-ink);
  background: var(--color-bg);
  -webkit-font-smoothing: antialiased;
}

h1, h2, h3 {
  margin: 0 0 var(--space-2);
  font-weight: 600;
  line-height: 1.1;
  letter-spacing: -0.02em;
  text-wrap: balance;
}
h1 { font-size: var(--step-4); }
h2 { font-size: var(--step-3); }
h3 { font-size: var(--step-2); }
p { margin: 0 0 var(--space-2); max-width: var(--maxw-prose); }
ul, ol { max-width: var(--maxw-prose); }
strong { font-weight: 600; }

a {
  color: var(--color-brand);
  text-underline-offset: 0.2em;
  transition: color 120ms ease, text-decoration-color 120ms ease;
}
a:hover { color: var(--color-brand-deep); }

img { max-width: 100%; height: auto; }

/* Layout ------------------------------------------------------- */

.container { max-width: var(--maxw); margin: 0 auto; padding: 0 var(--space-3); }
.section { padding: var(--section-y) 0; }
.section-tight { padding: var(--space-5) 0; }
.section-alt { background: var(--color-surface-alt); }
.section-deep { background: var(--color-brand-deep); color: var(--color-bg); }
.section-deep h1,
.section-deep h2,
.section-deep h3,
.section-deep p { color: var(--color-bg); }

.prose { max-width: var(--maxw-prose); }
.narrow { max-width: var(--maxw-narrow); }
.center { text-align: center; }
.muted { color: var(--color-muted); }
.lead { font-size: var(--step-2); max-width: var(--maxw-lead); color: var(--color-muted); }
.section-deep .lead { color: var(--color-brand-tint); }

.serif { font-family: var(--font-serif); font-style: italic; font-weight: 400; letter-spacing: 0; }
.price { font-variant-numeric: tabular-nums; }

.grid { display: grid; gap: var(--space-3); }
@media (min-width: 900px) {
  .grid-2 { grid-template-columns: repeat(2, 1fr); }
  .grid-3 { grid-template-columns: repeat(3, 1fr); }
  .grid-4 { grid-template-columns: repeat(4, 1fr); }
}

/* Rule-separated row. Replaces cards where the items are not
   discrete comparable objects (spec 3.4). */
.rule-row { display: grid; gap: var(--space-3); }
.rule-row > * { border-top: 1px solid var(--color-border); padding-top: var(--space-3); }
@media (min-width: 900px) {
  .rule-row { grid-template-columns: repeat(4, 1fr); gap: var(--space-4); }
}

/* Components --------------------------------------------------- */

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  padding: 0.85rem 1.6rem;
  border: 0;
  border-radius: var(--radius);
  background: var(--color-brand);
  color: #FFFFFF;
  font: inherit;
  font-weight: 600;
  text-decoration: none;
  cursor: pointer;
  transition: background-color 120ms ease, color 120ms ease, border-color 120ms ease;
}
.btn:hover { background: var(--color-brand-deep); color: #FFFFFF; }

.btn-outline {
  background: transparent;
  color: var(--color-brand);
  border: 1.5px solid var(--color-brand);
}
.btn-outline:hover {
  background: var(--color-brand-tint);
  color: var(--color-brand-deep);
  border-color: var(--color-brand-deep);
}

.section-deep .btn { background: var(--color-bg); color: var(--color-brand-deep); }
.section-deep .btn:hover { background: #FFFFFF; color: var(--color-brand-deep); }

/* Secondary action: a text link with a thick underline, not an
   outline button. Two solid-looking buttons read as two equal
   choices (spec 3.4). */
.link-arrow {
  display: inline-block;
  color: var(--color-brand);
  font-weight: 600;
  text-decoration: underline;
  text-decoration-thickness: 2px;
  text-underline-offset: 0.25em;
}

/* A card is only for a discrete, comparable object: a tier, a work
   item. Everything else uses whitespace and a hairline rule. */
.card {
  padding: var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  background: var(--color-surface);
  transition: border-color 120ms ease;
}

/* Forms -------------------------------------------------------- */

.field { display: grid; gap: 0.4rem; margin-bottom: var(--space-3); }
.field > span { font-weight: 600; }
.field input,
.field select,
.field textarea {
  width: 100%;
  min-height: 44px;
  padding: 0.7rem 0.8rem;
  border: 1.5px solid var(--color-border);
  border-radius: var(--radius);
  background: var(--color-surface);
  color: var(--color-ink);
  font: inherit;
  font-size: max(16px, var(--step-0));  /* >=16px stops iOS zoom-on-focus */
  transition: border-color 120ms ease;
}
.field input:focus,
.field select:focus,
.field textarea:focus { border-color: var(--color-brand); border-width: 2px; }
.field textarea { resize: vertical; }
.field-hint { font-size: var(--step--1); color: var(--color-muted); font-weight: 400; }

/* Comparison table --------------------------------------------- */

.table-scroll { overflow-x: auto; }
.compare {
  width: 100%;
  min-width: 640px;
  border-collapse: collapse;
  font-size: var(--step-0);
}
.compare caption {
  margin-bottom: var(--space-2);
  color: var(--color-muted);
  font-size: var(--step--1);
  text-align: left;
}
.compare th,
.compare td {
  padding: 0.75rem var(--space-2);
  border-bottom: 1px solid var(--color-border);
  vertical-align: top;
  text-align: center;
}
.compare thead th { border-bottom: 2px solid var(--color-ink); font-weight: 600; }
.compare th[scope="row"] { text-align: left; font-weight: 400; }
.compare th[scope="rowgroup"] {
  text-align: left;
  font-weight: 600;
  padding-top: var(--space-3);
  background: var(--color-surface-alt);
}
@media (min-width: 900px) {
  .compare thead th:first-child,
  .compare th[scope="row"] { position: sticky; left: 0; background: var(--color-bg); }
  .compare th[scope="rowgroup"] { position: sticky; left: 0; }
}

/* Accessibility ------------------------------------------------ */

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  border: 0;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

.skip-link {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
.skip-link:focus {
  position: fixed;
  top: var(--space-2);
  left: var(--space-2);
  z-index: 100;
  width: auto;
  height: auto;
  margin: 0;
  padding: 0.75rem 1rem;
  overflow: visible;
  clip-path: none;
  border-radius: var(--radius);
  background: var(--color-brand-deep);
  color: #FFFFFF;
  font-weight: 600;
  text-decoration: none;
}

/* Two-tone focus ring. Ink on bg is 14.98:1 and bg on green is
   7.47:1, so at least one ring is always visible. The transparent
   outline keeps an indicator in Windows High Contrast. */
:focus-visible {
  outline: 2px solid transparent;
  outline-offset: 2px;
  box-shadow: 0 0 0 2px var(--color-bg), 0 0 0 4px var(--color-ink);
}
.section-alt :focus-visible { box-shadow: 0 0 0 2px var(--color-surface-alt), 0 0 0 4px var(--color-ink); }
.section-deep :focus-visible { box-shadow: 0 0 0 2px var(--color-brand-deep), 0 0 0 4px var(--color-bg); }

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: .01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: .01ms !important;
    scroll-behavior: auto !important;
  }
}
```

- [ ] **Step 2: Sweep the renamed tokens through every scoped style**

Nine references across five files use names that no longer exist, or use `--color-accent` to mean green. Apply each of these exactly.

`src/components/Header.astro`, scoped `<style>`:
- `.brand { … color: var(--color-text); }` → `color: var(--color-ink);`
- `.nav-link { … color: var(--color-text); … }` → `color: var(--color-ink);`
- `.nav-link[aria-current="page"] { color: var(--color-accent); }` → `color: var(--color-brand);`
- `.nav-cta { … background: var(--color-accent); color: var(--color-accent-ink); … }` → `background: var(--color-brand); color: #FFFFFF;`

`src/components/ProjectCard.astro`, scoped `<style>`:
- `.project-card { … color: var(--color-text); transition: transform 0.1s ease, box-shadow 0.15s ease; }` → `color: var(--color-ink); transition: border-color 120ms ease;`
- delete the whole `.project-card:hover { transform: …; box-shadow: …; }` rule and replace with `.project-card:hover { border-color: var(--color-ink); }` (motion policy: no lift, no shadow)
- `.visit { color: var(--color-accent); … }` → `color: var(--color-brand);`

`src/pages/index.astro`, scoped `<style>`:
- `.cost-point h3::before { content: "✓"; color: var(--color-accent); … }` → `color: var(--color-brand);`

`src/pages/contact.astro`, scoped `<style>`:
- `.field input, .field select, .field textarea { … color: var(--color-text); … }` → delete the whole `.field*` block; the new global `.field` styles cover it
- `.success { border-color: var(--color-accent); }` → `border-color: var(--color-brand);`

`src/pages/faq.astro`, scoped `<style>`:
- `.faq-item[open] summary { color: var(--color-accent); }` → `color: var(--color-brand);`

`src/pages/pricing.astro`, scoped `<style>`:
- `.price { … color: var(--color-accent); … }` → `color: var(--color-brand);`

`src/components/Footer.astro` needs no token change in this task.

- [ ] **Step 3: Verify no dead token names survive**

```bash
grep -rn -- "--color-text\|--color-accent-ink" src/
```

Expected: no output.

```bash
grep -rn -- "translateY(-3px)\|box-shadow: 0 10px" src/
```

Expected: no output (the ProjectCard hover lift is gone).

- [ ] **Step 4: Build and check**

```bash
npm run build && npx astro check
```

Expected: build exit 0, check 0 errors 0 warnings.

- [ ] **Step 5: Confirm the tokens reached the output**

```bash
grep -c "\-\-color-brand: #1F5C43" dist/index.html dist/_astro/*.css 2>/dev/null | grep -v ':0'
```

Expected: at least one file reports a non-zero count.

- [ ] **Step 6: Commit**

```bash
git add src/styles/global.css src/components src/pages
git commit -m "style: rebuild design tokens and base styles

Darkens the brand green to #1F5C43 so it clears AAA as text on the
warm background and as a background under white. Replaces the
green-on-green focus outline with a two-tone ring, gates smooth
scroll behind prefers-reduced-motion, and drops the card hover lift.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017DWwHn2MN9zCJYmixdNzCz"
```

---

### Task 1.2: Layout shell, typed props, and per-page meta

**Files:**
- Create: `tsconfig.json`
- Create: `src/env.d.ts`
- Delete: `src/components/NodeNetwork.astro`
- Modify: `src/layouts/BaseLayout.astro:1-22` (full replacement)
- Modify: `src/pages/index.astro:5-6, 54` (BaseLayout call, remove `<main>`)
- Modify: `src/pages/pricing.astro:5-6, 37` (same)
- Modify: `src/pages/portfolio.astro:9-10, 22` (same)
- Modify: `src/pages/faq.astro:5-6, 36` (same)
- Modify: `src/pages/contact.astro:5-6, 63` (same)

**Interfaces:**
- Consumes: `.skip-link`, `.visually-hidden` and the focus ring from Task 1.1.
- Produces: `interface Props { title: string; description: string; ogImage?: string; noindex?: boolean }` on `BaseLayout`. `description` is **required with no default**, so TypeScript fails the build on any page that omits it. Every later page task must pass both `title` and `description`. `BaseLayout` now renders `<main id="main">` around its slot, so **pages must not contain their own `<main>`**.

- [ ] **Step 1: Create `tsconfig.json`**

The repo has no `tsconfig.json` at all today, so `astro check` runs against defaults.

```json
{
  "extends": "astro/tsconfigs/strict",
  "include": [".astro/types.d.ts", "**/*"],
  "exclude": ["dist"]
}
```

- [ ] **Step 2: Create `src/env.d.ts`**

Needed so the `?url` asset import in Task 1.3 type-checks.

```ts
/// <reference types="astro/client" />
```

- [ ] **Step 3: Delete the node network**

```bash
rm src/components/NodeNetwork.astro
```

It is competently written, but it is the wrong object for this brand: a perpetual full-viewport particle animation contradicts "minimal decorative effects" and "restrained motion", the connected-node motif is the visual cliché of crypto and enterprise SaaS, its link pass is O(n²) over up to 70 nodes every frame on the main thread, and because it sits behind everything it forces opaque surfaces behind any text, which is why cards are over-used site-wide.

- [ ] **Step 4: Replace `src/layouts/BaseLayout.astro` in full**

```astro
---
import '../styles/global.css';
import Header from '../components/Header.astro';
import Footer from '../components/Footer.astro';
import site from '../data/site.json';

interface Props {
  title: string;
  description: string;
  ogImage?: string;
  noindex?: boolean;
}

const { title, description, ogImage = '/og-default.png', noindex = false } = Astro.props;

const siteUrl = Astro.site as URL;
const canonical = new URL(Astro.url.pathname, siteUrl).href;
const ogImageUrl = new URL(ogImage, siteUrl).href;
---
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />

    <title>{title}</title>
    <meta name="description" content={description} />
    <link rel="canonical" href={canonical} />
    {noindex && <meta name="robots" content="noindex,follow" />}

    <meta property="og:type" content="website" />
    <meta property="og:site_name" content={site.brand} />
    <meta property="og:locale" content="en_US" />
    <meta property="og:title" content={title} />
    <meta property="og:description" content={description} />
    <meta property="og:url" content={canonical} />
    <meta property="og:image" content={ogImageUrl} />
    <meta property="og:image:alt" content="Keepsite Media. Websites for people with other things to do." />
    <meta name="twitter:card" content="summary_large_image" />

    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
  </head>
  <body>
    <a class="skip-link" href="#main">Skip to content</a>
    <Header />
    <main id="main">
      <slot />
    </main>
    <Footer />
  </body>
</html>
```

The old default description — "Keepsite Media builds fast websites that you own and keep, with no lock-in and no monthly fees." — was the site-wide meta description on every page that did not override it, which is home, pricing, portfolio, and contact. It is deleted, not rewritten.

- [ ] **Step 5: Give every existing page a title, a description, and no `<main>`**

The pages still argue the old model in Phase 1; that is expected. Their descriptions must be true under both models so this task does not create new residue.

`src/pages/index.astro` — replace line 5 and delete the `<main>` wrapper:

```astro
<BaseLayout
  title="Keepsite Media | Websites for people with other things to do"
  description="Keepsite Media builds and looks after websites for small businesses in Utah."
>
```

Delete the opening `<main>` on line 6 and the closing `</main>` on line 54, and outdent the sections by two spaces.

`src/pages/pricing.astro`:

```astro
<BaseLayout
  title="Pricing | Keepsite Media"
  description="What a Keepsite Media website costs, and what is included."
>
```

Delete its `<main>` / `</main>` pair.

`src/pages/portfolio.astro`:

```astro
<BaseLayout
  title="Portfolio | Keepsite Media"
  description="A few of the websites Keepsite Media has built."
>
```

Delete its `<main>` / `</main>` pair.

`src/pages/faq.astro` — it already passes a description; replace it, because the old one says "hands over":

```astro
<BaseLayout
  title="FAQ | Keepsite Media"
  description="Answers to the questions people ask most about working with Keepsite Media."
>
```

Delete its `<main>` / `</main>` pair.

`src/pages/contact.astro`:

```astro
<BaseLayout
  title="Get in touch | Keepsite Media"
  description="Tell Keepsite Media about your business and we will get back to you."
>
```

Delete its `<main>` / `</main>` pair.

- [ ] **Step 6: Verify the required-prop gate actually bites**

Temporarily delete the `description` line from `src/pages/faq.astro`'s `BaseLayout` call, then:

```bash
npx astro check
```

Expected: **1 error**, `Property 'description' is missing in type ... but required in type 'Props'`. Put the line back and re-run; expected 0 errors. This confirms a page can no longer ship without a deliberate description.

- [ ] **Step 7: Verify**

```bash
npm run build && npx astro check
grep -c "<main" dist/index.html                       # expect: 1
grep -c "skip-link" dist/index.html                   # expect: 1
grep -o '<link rel="canonical"[^>]*>' dist/faq/index.html
grep -rn "no lock-in and no monthly fees" dist/ src/  # expect: no output
grep -rn "NodeNetwork\|bg-net" src/                   # expect: no output
grep -c "canvas" dist/index.html                      # expect: 0
```

Expected: build exit 0, check 0 errors, canonical prints `https://www.keepsitemedia.com/faq/`, the two greps silent, no canvas.

- [ ] **Step 8: Commit**

```bash
git add tsconfig.json src/env.d.ts src/layouts src/pages
git rm src/components/NodeNetwork.astro
git commit -m "feat: type the layout and drop the node backdrop

description is now a required prop with no default, so TypeScript
fails the build on any page that omits one. The old default was the
site-wide meta description on four pages.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017DWwHn2MN9zCJYmixdNzCz"
```

---

### Task 1.3: Self-hosted fonts with zero layout shift

**Files:**
- Modify: `package.json:12-15` (dependencies)
- Modify: `src/layouts/BaseLayout.astro:1-5` (imports) and the `<head>` (preload link)

**Interfaces:**
- Consumes: `--font-sans` / `--font-serif` and the `Instrument Sans Fallback` `@font-face` from Task 1.1.
- Produces: the family names other tasks reference in CSS — `'Instrument Sans Variable'` (weights 400-700, normal) and `'Instrument Serif'` (400, **italic only**). Use the serif through the `.serif` utility class, never by naming the family directly.

- [ ] **Step 1: Install the two pinned font packages**

```bash
npm install --save-exact @fontsource-variable/instrument-sans@5.3.0 @fontsource/instrument-serif@5.3.0
```

Pinned exactly: a font update that changes metrics would silently invalidate the `size-adjust` values in `global.css`.

- [ ] **Step 2: Add the imports and the preloaded asset to `BaseLayout.astro`**

Replace the import block at the top of the frontmatter so it reads exactly:

```astro
---
import '../styles/global.css';
import '@fontsource-variable/instrument-sans/wght.css';
import '@fontsource/instrument-serif/latin-400-italic.css';
import sansWoff2 from '@fontsource-variable/instrument-sans/files/instrument-sans-latin-wght-normal.woff2?url';
import Header from '../components/Header.astro';
import Footer from '../components/Footer.astro';
import site from '../data/site.json';
```

Notes an executor needs:
- `global.css` is imported **first** so the metric-matched fallback `@font-face` is declared before the real faces.
- `wght.css` ships two `@font-face` blocks, latin and latin-ext, each with a `unicode-range`. English pages download only the latin file (about 30 KB); latin-ext never fetches. There is no latin-only entry point in the variable package, and adding one by hand would mean vendoring the file.
- `font-display: swap` is already set inside both Fontsource stylesheets. Do not redeclare it.
- The `?url` import and the `url()` inside `wght.css` resolve to the **same** emitted asset, so the preload href matches what the CSS requests. Step 5 verifies that.

- [ ] **Step 3: Add the preload link as the first element after the viewport meta**

In the `<head>`, immediately after `<meta name="viewport" …>` and before `<title>`:

```astro
    <link rel="preload" href={sansWoff2} as="font" type="font/woff2" crossorigin />
```

Preload the sans only. The serif never appears above the fold — every hero is sans — so it loads with `swap` against Georgia, and the handful of lines it sets can tolerate a swap.

- [ ] **Step 4: Build**

```bash
npm run build && npx astro check
```

Expected: build exit 0, check 0 errors.

- [ ] **Step 5: Verify the preload and the stylesheet point at the same file**

```bash
grep -o '/_astro/instrument-sans-latin-wght-normal\.[A-Za-z0-9_-]*\.woff2' dist/index.html | sort | uniq -c
```

Expected: exactly one distinct filename, with a count of **2** (once in the `<link rel="preload">`, once in the inlined `@font-face`). If the two filenames differ, the preload is dead weight and the fix is to stop importing the `?url` asset and instead vendor the woff2 into `public/fonts/` with a hand-written `@font-face`.

```bash
ls dist/_astro/ | grep instrument
```

Expected: `instrument-sans-latin-wght-normal.<hash>.woff2`, `instrument-sans-latin-ext-wght-normal.<hash>.woff2`, `instrument-serif-latin-400-italic.<hash>.woff2` (and possibly a `.woff`).

```bash
grep -c "fonts.googleapis.com\|fonts.gstatic.com" dist/index.html
```

Expected: `0`. No third-party font origin.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/layouts/BaseLayout.astro
git commit -m "feat: self-host Instrument Sans and Instrument Serif

Pinned exactly because the metric-matched fallback in global.css is
derived from these specific font metrics.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017DWwHn2MN9zCJYmixdNzCz"
```

---

### Task 1.4: 404, favicon, OG image, robots, sitemap

**Files:**
- Create: `src/pages/404.astro`
- Create: `public/favicon.svg`
- Create: `public/robots.txt`
- Create: `scripts/make-og-image.mjs`
- Create: `public/og-default.png` (generated)
- Modify: `astro.config.mjs:1-6`
- Modify: `package.json` (scripts, dependencies)

**Interfaces:**
- Consumes: `BaseLayout`'s `noindex` prop from Task 1.2.
- Produces: `/og-default.png` at 1200×630, referenced by `BaseLayout`'s default `ogImage`. Produces `npm run og` as the regeneration command.

- [ ] **Step 1: Install the sitemap integration**

```bash
npm install @astrojs/sitemap@3.7.3
```

- [ ] **Step 2: Replace `astro.config.mjs`**

```js
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://www.keepsitemedia.com',
  output: 'static',
  integrations: [
    sitemap({
      filter: (page) => !page.includes('/start/thanks') && !page.includes('/404'),
    }),
  ],
});
```

- [ ] **Step 3: Create `public/robots.txt`**

```
User-agent: *
Allow: /
Disallow: /admin/

Sitemap: https://www.keepsitemedia.com/sitemap-index.xml
```

- [ ] **Step 4: Create `public/favicon.svg`**

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="7" fill="#1F5C43"/>
  <path d="M11 8v16M11 16.5 20 8M14 15l6.5 9" stroke="#FBF9F4" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
</svg>
```

- [ ] **Step 5: Create `scripts/make-og-image.mjs`**

`sharp` is already installed as a dependency of Astro's image service, so this needs no new package.

```js
// Regenerates public/og-default.png. Run: npm run og
// Uses Arial in the SVG rather than Instrument Sans because the
// rasterizer has no access to the webfont; the OG card is a flat
// image and the difference is not visible at card size.
import sharp from 'sharp';

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#16302A"/>
  <rect x="80" y="150" width="88" height="6" fill="#A24A26"/>
  <text x="80" y="290" font-family="Arial, Helvetica, sans-serif" font-size="82" font-weight="600" fill="#FBF9F4">Keepsite Media</text>
  <text x="80" y="368" font-family="Arial, Helvetica, sans-serif" font-size="38" fill="#E6EFE9">Websites for people with other things to do.</text>
  <text x="80" y="540" font-family="Arial, Helvetica, sans-serif" font-size="28" fill="#8FAF9E">keepsitemedia.com</text>
</svg>`;

await sharp(Buffer.from(svg)).png().toFile('public/og-default.png');
console.log('Wrote public/og-default.png');
```

- [ ] **Step 6: Add the `og` script to `package.json`**

In `"scripts"`, add:

```json
    "og": "node scripts/make-og-image.mjs"
```

- [ ] **Step 7: Generate the image**

```bash
npm run og
```

Expected: `Wrote public/og-default.png`. Open the file and confirm it is 1200×630 with legible white text on deep green.

```bash
node -e "import('sharp').then(async s => console.log(await s.default('public/og-default.png').metadata()))" | grep -E "width|height"
```

Expected: `width: 1200`, `height: 630`.

- [ ] **Step 8: Create `src/pages/404.astro`**

Netlify serves this automatically for static sites, so no redirect rule is needed.

```astro
---
import BaseLayout from '../layouts/BaseLayout.astro';
---
<BaseLayout
  title="Page not found | Keepsite Media"
  description="That page isn't here. Here's where everything is."
  noindex={true}
>
  <section class="section">
    <div class="container">
      <h1>That page isn't here.</h1>
      <p class="lead">It may have moved. Here's where everything is:</p>
      <ul class="not-found-links">
        <li><a href="/packages/">Packages</a></li>
        <li><a href="/how-it-works/">How it works</a></li>
        <li><a href="/faq/">FAQ</a></li>
        <li><a href="/start/">Start your site</a></li>
      </ul>
    </div>
  </section>
</BaseLayout>

<style>
  .not-found-links { list-style: none; padding: 0; margin-top: var(--space-3); }
  .not-found-links li { margin-bottom: var(--space-1); font-size: var(--step-1); font-weight: 600; }
</style>
```

Those four routes do not exist yet; they arrive in Phases 4-6. The 404 page is not linked from anywhere, so nothing points at a broken link in the meantime, and Task 6.4's link check confirms all four resolve before the release ships.

- [ ] **Step 9: Verify**

```bash
npm run build && npx astro check
ls dist/404.html                            # expect: exists
ls dist/og-default.png dist/robots.txt dist/favicon.svg
ls dist/sitemap-index.xml dist/sitemap-0.xml
grep -o 'noindex,follow' dist/404.html      # expect: noindex,follow
grep -c "404" dist/sitemap-0.xml            # expect: 0
```

- [ ] **Step 10: Commit**

```bash
git add astro.config.mjs package.json package-lock.json public scripts src/pages/404.astro
git commit -m "feat: add 404, robots, sitemap, favicon, OG image

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017DWwHn2MN9zCJYmixdNzCz"
```

---

### Task 1.5: Netlify headers, caching, and the Lighthouse gate

**Files:**
- Modify: `netlify.toml:1-11` (full replacement)

**Interfaces:**
- Consumes: nothing.
- Produces: the CSP that later tasks must stay inside. `script-src 'self' 'unsafe-inline'` on the marketing pages permits Astro's scoped styles and the one inline tier-prefill script added in Task 6.3. If analytics is ever added, `script-src` and `connect-src` must change in the same commit.

- [ ] **Step 1: Install the Lighthouse plugin**

```bash
npm install --save-dev @netlify/plugin-lighthouse@6.0.4
```

- [ ] **Step 2: Replace `netlify.toml` in full**

The redirects for the renamed routes are **not** added here; they land in Task 4.1 with the renames themselves. The Lighthouse audit paths cover only routes that exist today, and Task 6.4 updates them to the final route set.

```toml
[build]
  command = "npm run check && npm run build"
  publish = "dist"

[build.environment]
  NODE_VERSION = "20"

# Lighthouse runs as a build gate, not a one-time manual check: the
# thing being sold is ongoing competence, not launch-day competence.
[[plugins]]
  package = "@netlify/plugin-lighthouse"

  [plugins.inputs]
    output_path = "reports/lighthouse.html"

  [[plugins.inputs.audits]]
    path = "index.html"
    [plugins.inputs.audits.thresholds]
      performance = 1.0
      accessibility = 1.0
      best-practices = 1.0
      seo = 1.0

  [[plugins.inputs.audits]]
    path = "faq/index.html"
    [plugins.inputs.audits.thresholds]
      performance = 1.0
      accessibility = 1.0
      best-practices = 1.0
      seo = 1.0

[[redirects]]
  from = "/admin"
  to = "/admin/index.html"
  status = 200

[[headers]]
  for = "/*"
  [headers.values]
    Content-Security-Policy = "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; font-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'self'; object-src 'none'; upgrade-insecure-requests"
    Strict-Transport-Security = "max-age=31536000; includeSubDomains; preload"
    X-Content-Type-Options = "nosniff"
    Referrer-Policy = "strict-origin-when-cross-origin"
    Permissions-Policy = "camera=(), microphone=(), geolocation=(), interest-cohort=()"
    X-Frame-Options = "DENY"

# DecapCMS loads from unpkg and talks to Netlify Identity, so /admin
# needs its own looser policy. The widening is scoped here only; the
# marketing pages stay locked down.
[[headers]]
  for = "/admin/*"
  [headers.values]
    Content-Security-Policy = "default-src 'self'; img-src 'self' data: blob: https:; media-src 'self' data: blob:; style-src 'self' 'unsafe-inline' https://unpkg.com; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://unpkg.com; font-src 'self' data: https://unpkg.com; connect-src 'self' https://unpkg.com https://identity.netlify.com https://api.netlify.com https://api.github.com; frame-src https://identity.netlify.com; form-action 'self'; base-uri 'self'"
    X-Frame-Options = "SAMEORIGIN"

# Astro content-hashes everything in /_astro, so it is safe to pin.
[[headers]]
  for = "/_astro/*"
  [headers.values]
    Cache-Control = "public, max-age=31536000, immutable"

[[headers]]
  for = "/*.html"
  [headers.values]
    Cache-Control = "public, max-age=0, must-revalidate"
```

- [ ] **Step 3: Verify the build command still works locally**

```bash
npm run check && npm run build
```

Expected: check reports 0 errors, build exits 0. This is now exactly what Netlify runs, so a type error fails the deploy instead of shipping.

- [ ] **Step 4: Verify the TOML parses**

```bash
node -e "const fs=require('fs');const t=fs.readFileSync('netlify.toml','utf8');['plugin-lighthouse','Content-Security-Policy','/admin/*','/_astro/*'].forEach(s=>{if(!t.includes(s))throw new Error('missing '+s)});console.log('ok')"
```

Expected: `ok`.

- [ ] **Step 5: Deploy and read the plugin's summary**

Push to `main` and watch the Netlify deploy log. The Lighthouse plugin prints a score table per audited path.

If a threshold fails the deploy, read the table before touching the thresholds. The site at this point has no client JavaScript, no third-party requests, a preloaded self-hosted font, and AAA contrast, so a genuine miss almost always names something specific and fixable — most often a missing `width`/`height` on an image or a link with an inaccessible name. **Do not lower a threshold below `1.0` to get a green deploy.** The gate is the point.

- [ ] **Step 6: Commit**

```bash
git add netlify.toml package.json package-lock.json
git commit -m "feat: add security headers and Lighthouse build gate

Wires npm run check into the Netlify build so a type error fails the
deploy. /admin gets its own looser CSP for Decap and Identity.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017DWwHn2MN9zCJYmixdNzCz"
```

**Deploy checkpoint.** Merge Phase 0 and Phase 1 to production. The site looks new and is measurably faster; the words are still the old ones. Everything from here goes on a branch.

---

# Phase 2 — Content model

**Start of the atomic release.** Everything from here to the end of Phase 6 lands on `brand-transition` and is promoted to production together.

### Task 2.1: Branch, restructure `site.json`, add site-wide JSON-LD

**Files:**
- Modify: `src/data/site.json:1-12` (full replacement)
- Modify: `src/components/Footer.astro:1-17` (stop rendering `footerNote`)
- Modify: `src/layouts/BaseLayout.astro` (frontmatter + `<head>`: add the JSON-LD `@graph`)

**Interfaces:**
- Consumes: `BaseLayout`'s `Props` from Task 1.2.
- Produces: the `site.json` shape every later task reads. Exact keys and types:
  - `brand: string`, `legalName: string`, `tagline: string`
  - `email: string`, `phone: string` (display), `phoneE164: string` (`tel:` and JSON-LD)
  - `areaServed: string`, `priceRange: string`
  - `googleBusinessProfileUrl: string` (empty until the profile is live)
  - `social: { name: string; url: string }[]`
  - `nav: { label: string; href: string; cta: boolean }[]` — **every entry carries `cta`**, including the ones set to `false`. If some entries omitted it, TypeScript would infer a union type from the JSON import and `item.cta` would fail `astro check`.
  - `footerNote` is **deleted**.
- Produces: a `ProfessionalService` node with the stable `@id` `https://www.keepsitemedia.com/#business`. Task 5.5's `Service` nodes reference that exact `@id`.

- [ ] **Step 1: Create the branch**

```bash
git checkout -b brand-transition
```

- [ ] **Step 2: Replace `src/data/site.json` in full**

```json
{
  "brand": "Keepsite Media",
  "legalName": "Keepsite Media",
  "tagline": "Websites for people with other things to do.",
  "email": "keepsitemedia@gmail.com",
  "phone": "(385) 307-8190",
  "phoneE164": "+13853078190",
  "areaServed": "Utah",
  "priceRange": "$$",
  "googleBusinessProfileUrl": "",
  "social": [],
  "nav": [
    { "label": "Packages", "href": "/packages/", "cta": false },
    { "label": "How it works", "href": "/how-it-works/", "cta": false },
    { "label": "FAQ", "href": "/faq/", "cta": false },
    { "label": "Start your site", "href": "/start/", "cta": true }
  ]
}
```

The old `footerNote` — "You keep everything: the code, the GitHub repo, and the Netlify account. No lock-in, and nothing to pay each month." — put a sales claim on every page of the site. It is deleted and not replaced. The footer gets the tagline instead, which is a statement of who the work is for, not a promise.

`Work` is deliberately **not** in this list. Task 7.2 injects it from the collection so the nav item appears the moment a real project exists, with no code change.

- [ ] **Step 3: Stop `Footer.astro` rendering the deleted key**

`Footer.astro` currently renders `{site.footerNote}` on line 7 and would now render nothing. Change line 7 from:

```astro
    <p class="footer-note">{site.footerNote}</p>
```

to:

```astro
    <p class="footer-note">{site.tagline}</p>
```

and change the email line to use the new address automatically (it already reads `site.email`, so no edit is needed there). The full three-column restructure comes in Task 4.3; this is the minimum that keeps the build honest.

- [ ] **Step 4: Add the JSON-LD graph to `BaseLayout.astro`**

Append this to the end of the frontmatter, after the `ogImageUrl` line:

```ts
// site.social is an empty array in JSON, which TypeScript infers as
// never[]. Type it so .map() over it compiles once entries exist.
const social = site.social as { name: string; url: string }[];
const sameAs = [site.googleBusinessProfileUrl, ...social.map((s) => s.url)].filter(Boolean);

const siteJsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebSite',
      '@id': `${siteUrl}#website`,
      url: siteUrl.href,
      name: site.brand,
      inLanguage: 'en-US',
      publisher: { '@id': `${siteUrl}#business` },
    },
    {
      '@type': 'ProfessionalService',
      '@id': `${siteUrl}#business`,
      name: site.brand,
      legalName: site.legalName,
      description: site.tagline,
      url: siteUrl.href,
      email: site.email,
      telephone: site.phoneE164,
      areaServed: { '@type': 'State', name: site.areaServed },
      priceRange: site.priceRange,
      ...(sameAs.length ? { sameAs } : {}),
    },
  ],
};
```

Then add this as the last element inside `<head>`, after the favicon link:

```astro
    <script type="application/ld+json" set:html={JSON.stringify(siteJsonLd)} is:inline />
```

**No `address` and no `PostalAddress`.** The owner has no business address to publish, and a fabricated or partial one is a Google policy problem. Without it the markup will not earn a local rich result, which is fine: the Google Business Profile is the correct home for local signals, and the markup still does its entity-disambiguation job. When the profile goes live, pasting its URL into `googleBusinessProfileUrl` puts it into `sameAs` with no code change.

- [ ] **Step 5: Verify**

```bash
npm run build && npx astro check
grep -rn "footerNote" src/                              # expect: no output
grep -rn "snic9004" src/ dist/                          # expect: no output
grep -o '"@id":"https://www.keepsitemedia.com/#business"' dist/index.html
grep -c "PostalAddress\|streetAddress" dist/index.html  # expect: 0
```

- [ ] **Step 6: Validate the JSON-LD parses**

```bash
node -e "
const fs=require('fs');
const m=fs.readFileSync('dist/index.html','utf8').match(/<script type=\"application\/ld\+json\">([\s\S]*?)<\/script>/);
const g=JSON.parse(m[1]);
const biz=g['@graph'].find(n=>n['@type']==='ProfessionalService');
if(biz.email!=='keepsitemedia@gmail.com')throw new Error('email');
if(biz.telephone!=='+13853078190')throw new Error('phone');
if(biz.areaServed.name!=='Utah')throw new Error('areaServed');
if('address' in biz)throw new Error('address must be omitted');
if('sameAs' in biz)throw new Error('sameAs must be omitted while empty');
console.log('ok');
"
```

Expected: `ok`.

- [ ] **Step 7: Commit**

```bash
git add src/data/site.json src/components/Footer.astro src/layouts/BaseLayout.astro
git commit -m "feat: restructure site data and add business JSON-LD

Drops footerNote, which put a sales claim on every page. Adds a
WebSite + ProfessionalService graph with a stable @id the packages
Service nodes will reference. No address: there isn't one to publish.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017DWwHn2MN9zCJYmixdNzCz"
```

---

### Task 2.2: Rewrite `home.json` to the seven-band structure

**Files:**
- Modify: `src/data/home.json:1-22` (full replacement)

**Interfaces:**
- Consumes: nothing.
- Produces: the shape `src/pages/index.astro` renders in Task 3.1. Keys: `meta {title, description}`, `hero {headline, sub, primaryCta {label, href}, secondaryCta {label, href}}`, `problem {heading, body}`, `solution {heading, beats[] {title, body}, pullLine}`, `packages {heading, linkLabel, linkHref}`, `why {heading, pillars[] {title, body}}`, `work {heading, linkLabel, linkHref}`, `closing {heading, sub, ctaLabel, ctaHref}`.
- The `runningCosts` object is **deleted, not rewritten**. It is the single most load-bearing old-model artifact on the site: a whole homepage panel headed "What it costs to keep the site running: $0 a month." `hourlyLine` and `valueProps` are deleted too.

- [ ] **Step 1: Replace `src/data/home.json` in full**

```json
{
  "meta": {
    "title": "Keepsite Media | Websites for people with other things to do",
    "description": "Professional websites for busy business owners. We build it, keep it working, and stay off your to-do list. Packages from $1,100."
  },
  "hero": {
    "headline": "Websites for people with other things to do.",
    "sub": "Professional websites built to look good, work hard, and stay off your to-do list.",
    "primaryCta": { "label": "View Packages", "href": "/packages/" },
    "secondaryCta": { "label": "Start Your Site", "href": "/start/" }
  },
  "problem": {
    "heading": "You don't need another business task.",
    "body": "You already have a full list. A website shouldn't be the thing you keep meaning to get to."
  },
  "solution": {
    "heading": "We build it. We keep it useful.",
    "beats": [
      {
        "title": "We build it.",
        "body": "A custom site put together around what your business actually does, and who you want walking in the door."
      },
      {
        "title": "We keep it working.",
        "body": "Hosting, maintenance, monitoring, and the small updates that pile up. All handled, none of it yours."
      },
      {
        "title": "We tell you what's working.",
        "body": "Once a year you get a recap in plain English: what people searched, what they clicked, what we'd do next."
      }
    ],
    "pullLine": "A website that earns its keep."
  },
  "packages": {
    "heading": "Three ways to work with us.",
    "linkLabel": "See what's included",
    "linkHref": "/packages/"
  },
  "why": {
    "heading": "Why Keepsite",
    "pillars": [
      {
        "title": "Make it useful.",
        "body": "Every site has a job. We build for that job and leave out the rest."
      },
      {
        "title": "Keep it simple.",
        "body": "One questionnaire, one round of changes, no website homework."
      },
      {
        "title": "Show your work.",
        "body": "Clear pricing, clear scope, and a yearly recap you can actually read."
      },
      {
        "title": "Build for real life.",
        "body": "You have customers, staff, and a schedule. The site fits around all of it."
      }
    ]
  },
  "work": {
    "heading": "Recent work",
    "linkLabel": "See all work",
    "linkHref": "/work/"
  },
  "closing": {
    "heading": "Keep your business moving.",
    "sub": "We'll take care of the website.",
    "ctaLabel": "Start your site",
    "ctaHref": "/start/"
  }
}
```

The hero headline, hero sub, problem heading, solution heading, pull-line, pillar names, closing heading, and closing sub are verbatim brand-doc lines. Do not reword any of them.

**Keep-phrase count on this page: three.** "A website that earns its keep." in the solution band, the tier one-liners inside the package cards (Task 3.1 reads those from `packages.json`), and "Keep your business moving." in the closing band. That is the ceiling for seven bands. Do not add a fourth.

- [ ] **Step 2: Verify the old model is gone from the file**

```bash
grep -n "runningCosts\|hourlyLine\|valueProps\|\$0 a month\|no lock-in\|own it" src/data/home.json
```

Expected: no output.

```bash
node -e "
const h=require('./src/data/home.json');
['meta','hero','problem','solution','packages','why','work','closing'].forEach(k=>{if(!h[k])throw new Error('missing '+k)});
if(h.solution.beats.length!==3)throw new Error('beats');
if(h.why.pillars.length!==4)throw new Error('pillars');
console.log('ok');
"
```

Expected: `ok`.

- [ ] **Step 3: Confirm the build is red, and why**

```bash
npm run build
```

Expected: **FAIL**. `src/pages/index.astro` still reads `home.heroHeadline`, `home.hourlyLine`, `home.valueProps`, and `home.runningCosts`, which no longer exist. This is expected inside the atomic release and is closed by Task 3.1. To keep this task's commit self-contained and green, do Step 4 before committing.

- [ ] **Step 4: Stub `index.astro` so the branch keeps building**

Replace the whole body of `src/pages/index.astro` (everything between `<BaseLayout …>` and `</BaseLayout>`, plus its `<style>` block) with a minimal hero. Task 3.1 replaces this entirely.

```astro
---
import BaseLayout from '../layouts/BaseLayout.astro';
import home from '../data/home.json';
---
<BaseLayout title={home.meta.title} description={home.meta.description}>
  <section class="section">
    <div class="container">
      <h1>{home.hero.headline}</h1>
      <p class="lead">{home.hero.sub}</p>
    </div>
  </section>
</BaseLayout>
```

This also deletes `.costs-panel` and its scoped CSS, which existed only because the node-network backdrop forced an opaque surface behind that text.

- [ ] **Step 5: Verify**

```bash
npm run build && npx astro check
grep -rn "costs-panel\|runningCosts" src/ dist/   # expect: no output
```

Expected: build exit 0, check 0 errors, grep silent.

- [ ] **Step 6: Commit**

```bash
git add src/data/home.json src/pages/index.astro
git commit -m "feat: rewrite home data to the seven-band model

Deletes runningCosts outright rather than rewriting it. index.astro
is stubbed to the hero here and rebuilt in full next.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017DWwHn2MN9zCJYmixdNzCz"
```

---

### Task 2.3: Create `packages.json`

**Files:**
- Create: `src/data/packages.json`

**Interfaces:**
- Consumes: nothing.
- Produces: the single source of truth for every price on the site. Shape:
  - `meta {title, description}`
  - `intro: string`
  - `tiers[]`: `id`, `name`, `line`, `bestFor`, `buildPrice`, `buildPriceNote`, `monthlyPrice`, `monthlyPriceNote`, `cardIncludes[]` (**exactly 5**), `monthlySummary[]`, `ctaLabel`
  - `monthly {heading, lead, closing, subscriptionTerms}`
  - `comparison[]`: `group` (`"Build"` or `"Monthly"`), `feature`, `presence`, `search`, `searchPlus` — each tier value is `true`, `false`, or a `string`
  - `addOns {heading, items[] {name, price, note}, upgradeRule}`
  - `scopeFaq {heading, topics[], moreLabel, moreHref}` — `topics` are `topic` slugs resolved against `faq.json` in Task 5.4
  - `closing {heading, sub, ctaLabel, ctaHref}`
- Prices are stored as display strings. Task 5.5 derives the JSON-LD numbers from these same strings with `Number(s.replace(/[^0-9.]/g, ''))`, so the structured data can never drift from what the page shows.
- `cardIncludes` is deliberately **separate from** `comparison`, not derived from it. The five card bullets are a curated sales summary; the table is the full detail. Conflating them would either bloat the cards or gut the table.

- [ ] **Step 1: Create `src/data/packages.json`**

```json
{
  "meta": {
    "title": "Packages | Keepsite Media",
    "description": "Three website packages, each a one-time build plus a monthly subscription. Prices, what's included, and what the monthly covers."
  },
  "intro": "Three packages. Each one is a one-time build plus a monthly subscription that keeps the site working. Everything the monthly covers is spelled out below.",
  "tiers": [
    {
      "id": "presence",
      "name": "Presence",
      "line": "Be there when people look.",
      "bestFor": "Businesses that get most of their work through Instagram, referrals, and word of mouth, and need a professional place to send people.",
      "buildPrice": "$1,100",
      "buildPriceNote": "one-time build",
      "monthlyPrice": "$55",
      "monthlyPriceNote": "per month",
      "cardIncludes": [
        "A custom website, built mobile-first",
        "Basic technical SEO and analytics setup",
        "Google Business Profile and social links connected",
        "An inquiry page that sends straight to your email",
        "Hosting, maintenance, and monitoring every month"
      ],
      "monthlySummary": [
        "Hosting and routine maintenance",
        "Monitoring, so problems get caught before you notice them",
        "Minor content updates",
        "A plain-English recap once a year"
      ],
      "ctaLabel": "Start with Presence"
    },
    {
      "id": "search",
      "name": "Search",
      "line": "Keep showing up.",
      "bestFor": "Businesses that want the site built around how customers actually search, without it turning into an SEO project.",
      "buildPrice": "$1,750",
      "buildPriceNote": "one-time build",
      "monthlyPrice": "$150",
      "monthlyPriceNote": "per month",
      "cardIncludes": [
        "Everything in Presence",
        "Keyword research and a search-informed site structure",
        "SEO copy written for your core pages",
        "24 SEO blog posts a year, written and published for you",
        "Search Console monitoring and an annual keyword refresh"
      ],
      "monthlySummary": [
        "Everything in the Presence subscription",
        "24 SEO blog posts a year, written and published for you",
        "Search Console and analytics monitoring",
        "An annual keyword refresh and a Google Business Profile check"
      ],
      "ctaLabel": "Start with Search"
    },
    {
      "id": "search-plus",
      "name": "Search Plus",
      "line": "Keep growing.",
      "bestFor": "Businesses that want us watching what is working and improving the site through the year, not just at launch.",
      "buildPrice": "$2,000",
      "buildPriceNote": "one-time build",
      "monthlyPrice": "$275",
      "monthlyPriceNote": "per month",
      "cardIncludes": [
        "Everything in Search",
        "Competitor and search-market analysis",
        "Deeper keyword research based on competitor gaps",
        "Positioning and copy shaped by what competitors miss",
        "Active optimization through the year"
      ],
      "monthlySummary": [
        "Everything in the Search subscription",
        "Active review of search performance through the year",
        "Updates to existing pages when the data points somewhere useful",
        "Strategic supporting pages when they will help"
      ],
      "ctaLabel": "Start with Search Plus"
    }
  ],
  "monthly": {
    "heading": "Keep your site working.",
    "lead": "Every Keepsite site includes hosting, maintenance, and monitoring. On Search and Search Plus, the monthly is mostly content and search work.",
    "closing": "Every Keepsite site also includes an inquiry page, set up to send straight to your email or your existing CRM.",
    "subscriptionTerms": "Presence is month to month — cancel any time with 30 days' notice. Search and Search Plus run on an annual content plan, so the first year is a 12-month commitment; after that, month to month. Either way, your domain and your content are yours — if you ever leave, we'll help you move them."
  },
  "comparison": [
    {
      "group": "Build",
      "feature": "Custom website design and build",
      "presence": true,
      "search": true,
      "searchPlus": true
    },
    {
      "group": "Build",
      "feature": "Mobile optimization",
      "presence": true,
      "search": true,
      "searchPlus": true
    },
    {
      "group": "Build",
      "feature": "Technical SEO setup",
      "presence": "Basic",
      "search": "Full on-page setup",
      "searchPlus": "Full on-page setup"
    },
    {
      "group": "Build",
      "feature": "Google Business Profile and social links connected",
      "presence": true,
      "search": true,
      "searchPlus": true
    },
    {
      "group": "Build",
      "feature": "Keyword research and page mapping",
      "presence": false,
      "search": true,
      "searchPlus": true
    },
    {
      "group": "Build",
      "feature": "Copy for your core pages",
      "presence": "We edit and place yours",
      "search": "We write it around your keywords",
      "searchPlus": "We write it around your keywords and your competitors"
    },
    {
      "group": "Build",
      "feature": "Competitor and search-market analysis",
      "presence": false,
      "search": false,
      "searchPlus": true
    },
    {
      "group": "Monthly",
      "feature": "Hosting, maintenance, and monitoring",
      "presence": true,
      "search": true,
      "searchPlus": true
    },
    {
      "group": "Monthly",
      "feature": "Minor content updates",
      "presence": true,
      "search": true,
      "searchPlus": true
    },
    {
      "group": "Monthly",
      "feature": "SEO blog posts written and published",
      "presence": false,
      "search": "24 a year",
      "searchPlus": "24 a year"
    },
    {
      "group": "Monthly",
      "feature": "Search Console and analytics monitoring",
      "presence": false,
      "search": true,
      "searchPlus": true
    },
    {
      "group": "Monthly",
      "feature": "Annual keyword refresh",
      "presence": false,
      "search": true,
      "searchPlus": true
    },
    {
      "group": "Monthly",
      "feature": "Active optimization through the year",
      "presence": false,
      "search": false,
      "searchPlus": true
    },
    {
      "group": "Monthly",
      "feature": "Annual recap in plain English",
      "presence": true,
      "search": true,
      "searchPlus": true
    }
  ],
  "addOns": {
    "heading": "If you need something extra.",
    "items": [
      {
        "name": "Additional standard page",
        "price": "$180 per page",
        "note": "Uses your existing site style and your copy. No new keyword research."
      },
      {
        "name": "Additional SEO page",
        "price": "$270 per page",
        "note": "Search and Search Plus only. A new search-informed service or location page."
      },
      {
        "name": "Full copy development",
        "price": "$90 an hour",
        "note": "For when there isn't source material to work from and the messaging has to be written from scratch."
      },
      {
        "name": "Advanced integration",
        "price": "$90 an hour, quoted first",
        "note": "Booking platforms, multi-step forms, custom routing, or CRM work beyond a simple embed."
      },
      {
        "name": "Major website expansion",
        "price": "Custom quote",
        "note": "New service lines, large content migrations, or anything that really changes the original scope."
      }
    ],
    "upgradeRule": "If what you need is more strategy rather than more pages, we'll move you to the package that covers it instead of selling it piece by piece."
  },
  "scopeFaq": {
    "heading": "Questions about scope",
    "topics": [
      "which-package",
      "search-vs-search-plus",
      "what-monthly-covers",
      "who-writes-copy",
      "change-tiers"
    ],
    "moreLabel": "More questions",
    "moreHref": "/faq/"
  },
  "closing": {
    "heading": "Keep your business moving.",
    "sub": "We'll take care of the website.",
    "ctaLabel": "Start your site",
    "ctaHref": "/start/"
  }
}
```

Three things an executor must not "improve":
- **No `featured` or "Most popular" field.** There are no clients yet, so the claim would be fabricated.
- **`subscriptionTerms` is approved copy, verbatim.** Its em dashes stay. It is the only place on the site that uses them.
- **The internal tier-protection language stays out.** "Tier 1 clients cannot add keyword research à la carte" is a scope control; on a public page it reads as restriction. `upgradeRule` conveys the same boundary as generosity.

- [ ] **Step 2: Validate the shape and the price/prose invariants**

```bash
node -e "
const p=require('./src/data/packages.json');
if(p.tiers.length!==3)throw new Error('tiers');
p.tiers.forEach(t=>{
  if(t.cardIncludes.length!==5)throw new Error(t.id+' cardIncludes must be exactly 5');
  if(!/^\\\$[0-9,]+\$/.test(t.buildPrice))throw new Error(t.id+' buildPrice format');
  if(!/^\\\$[0-9,]+\$/.test(t.monthlyPrice))throw new Error(t.id+' monthlyPrice format');
  if('featured' in t)throw new Error('no featured marker at launch');
});
const ids=p.tiers.map(t=>t.id).join(',');
if(ids!=='presence,search,search-plus')throw new Error('tier ids: '+ids);
const prices=p.tiers.map(t=>t.buildPrice+'+'+t.monthlyPrice).join(' ');
if(prices!=='\$1,100+\$55 \$1,750+\$150 \$2,000+\$275')throw new Error('prices: '+prices);
if(p.comparison.length!==14)throw new Error('comparison rows: '+p.comparison.length);
const groups=[...new Set(p.comparison.map(r=>r.group))].join(',');
if(groups!=='Build,Monthly')throw new Error('groups: '+groups);
if(p.addOns.items.length!==5)throw new Error('addOns');
if(p.scopeFaq.topics.length!==5)throw new Error('scopeFaq topics');
console.log('ok');
"
```

Expected: `ok`.

- [ ] **Step 3: Verify the approved terms copy is character-exact**

```bash
node -e "
const p=require('./src/data/packages.json');
const want=\"Presence is month to month — cancel any time with 30 days' notice. Search and Search Plus run on an annual content plan, so the first year is a 12-month commitment; after that, month to month. Either way, your domain and your content are yours — if you ever leave, we'll help you move them.\";
if(p.monthly.subscriptionTerms!==want)throw new Error('subscriptionTerms does not match the approved copy');
console.log('ok');
"
```

Expected: `ok`.

- [ ] **Step 4: Verify no Part II content leaked in**

```bash
grep -nEi 'labor|margin|budget|hour target|cost basis|guardrail|tier protection|à la carte|Sierra' src/data/packages.json
```

Expected: no output. (`$90 an hour` appears as a client-facing add-on rate, which is Part I and is meant to be public. The phrase "cost basis" is not.)

- [ ] **Step 5: Build**

```bash
npm run build && npx astro check
```

Expected: build exit 0, check 0 errors. Nothing imports this file yet.

- [ ] **Step 6: Commit**

```bash
git add src/data/packages.json
git commit -m "feat: add packages data with tiers and comparison

Single source of truth for every price on the site. Task 5.5 derives
the Offer JSON-LD from these same strings so the two cannot drift.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017DWwHn2MN9zCJYmixdNzCz"
```

---

### Task 2.4: Create `process.json`

**Files:**
- Create: `src/data/process.json`

**Interfaces:**
- Consumes: nothing.
- Produces: the shape `src/pages/how-it-works.astro` renders in Task 6.1. Keys: `meta {title, description}`, `heading`, `lead`, `steps[] {title, body}` (five, rendered as a real `<ol>`), `pullLine`, `needFromYou {heading, items[]}`, `wontHaveTo {heading, items[]}`, `signature` (`null`, or `{name, role}`), `closing {heading, sub, ctaLabel, ctaHref}`.

- [ ] **Step 1: Create `src/data/process.json`**

```json
{
  "meta": {
    "title": "How it works | Keepsite Media",
    "description": "One form, one call, one round of revisions. Here's exactly what building a site with Keepsite looks like, and what we need from you."
  },
  "heading": "How it works",
  "lead": "You've already made the decision to hand this off. From here it's five steps, and most of them are ours.",
  "steps": [
    {
      "title": "Tell us about your business.",
      "body": "One questionnaire covers it. We ask for everything we need in one pass, so you're not answering questions in dribs and drabs for three weeks."
    },
    {
      "title": "We plan the site.",
      "body": "Which pages you need, how they connect, and what each one is there to do. On Search and Search Plus, keyword research comes first and shapes the plan."
    },
    {
      "title": "We build it.",
      "body": "Design, copy, setup, and testing all happen on our side. You don't have to watch."
    },
    {
      "title": "One round of changes, then we launch.",
      "body": "You look at the finished site and send your feedback in one go. We make the changes, run the final checks, and put it live."
    },
    {
      "title": "We keep it working.",
      "body": "Hosting, maintenance, monitoring, and the annual recap. On Search and Search Plus, the articles keep going out too."
    }
  ],
  "pullLine": "Keep it simple.",
  "needFromYou": {
    "heading": "What we need from you",
    "items": [
      "Accurate information about your business: what you do, where, for whom, your hours, and anything a customer would ask.",
      "Your photos and logo, if you have them.",
      "One call, on Search and Search Plus, so we get your tone right.",
      "A reply when a scheduled article needs a correction, or when something about the business changes."
    ]
  },
  "wontHaveTo": {
    "heading": "What you won't have to do",
    "items": [
      "No website homework.",
      "No standing meetings.",
      "No logging into anything.",
      "No decisions about hosting, plugins, or platforms."
    ]
  },
  "signature": null,
  "closing": {
    "heading": "Keep your business moving.",
    "sub": "We'll take care of the website.",
    "ctaLabel": "Start your site",
    "ctaHref": "/start/"
  }
}
```

**On `signature`.** The spec offers an optional signed block ("— Sam, Keepsite") as founder presence without an About page. It is left `null` because the owner did not name a signer in the 2026-08-23 decisions, and the spec's own repo-hygiene section lists staff names among the content that stays internal. The field and its rendering are built anyway (Task 6.1), so filling it in later is a data edit, not a code change. To turn it on, set:

```json
  "signature": { "name": "Sam", "role": "Keepsite" }
```

- [ ] **Step 2: Validate**

```bash
node -e "
const p=require('./src/data/process.json');
if(p.steps.length!==5)throw new Error('steps');
if(p.needFromYou.items.length!==4)throw new Error('needFromYou');
if(p.wontHaveTo.items.length!==4)throw new Error('wontHaveTo');
if(p.signature!==null)throw new Error('signature must start null');
if(p.pullLine!=='Keep it simple.')throw new Error('pullLine');
console.log('ok');
"
```

Expected: `ok`.

- [ ] **Step 3: Verify no internal SOP language leaked in**

```bash
grep -nEi 'labor|budget|hour|consolidated revision round|scope creep|absorb' src/data/process.json
```

Expected: no output. The SOP's one-revision-round boundary appears on the site only as step 4's client benefit ("You look at the finished site and send your feedback in one go"), never as a restriction.

- [ ] **Step 4: Build**

```bash
npm run build && npx astro check
```

Expected: build exit 0, check 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/data/process.json
git commit -m "feat: add how-it-works process data

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017DWwHn2MN9zCJYmixdNzCz"
```

---

### Task 2.5: Rewrite `faq.json`

**Files:**
- Modify: `src/data/faq.json:1-82` (full replacement)

**Interfaces:**
- Consumes: nothing.
- Produces: `{ meta {title, description}, intro, groups[] { title, items[] { q, a, topic } }, closing {…} }`. **Every item carries a unique `topic` slug.** Task 5.4 pulls five of them onto `/packages/` by slug, and Task 6.2 generates `FAQPage` JSON-LD from the same file.
- The five slugs `packages.json` depends on, which must exist exactly: `which-package`, `search-vs-search-plus`, `what-monthly-covers`, `who-writes-copy`, `change-tiers`.

- [ ] **Step 1: Replace `src/data/faq.json` in full**

Five groups, twenty questions. The whole old file goes: the group "The tech, in plain English" explained GitHub repositories to bakery owners, and the group "Money" answered "Are there any monthly costs? **No.**"

```json
{
  "meta": {
    "title": "FAQ | Keepsite Media",
    "description": "What's included, what the monthly covers, how long it takes, and what we need from you."
  },
  "intro": "The questions people ask most, answered straight. If yours isn't here, ask us on the Start page and we'll answer it.",
  "groups": [
    {
      "title": "Getting started",
      "items": [
        {
          "topic": "how-to-start",
          "q": "How do we start?",
          "a": "Fill out the form on the Start page. Tell us what your business does and which package you're leaning toward, or say you're not sure. We'll reply within one business day with a recommendation and what it would cost."
        },
        {
          "topic": "how-long",
          "q": "How long does a site take?",
          "a": "Most Presence sites launch two to three weeks after we have your questionnaire and your content. Search and Search Plus take a little longer, usually three to five weeks, because the keyword research and the copy come first. The biggest variable is how quickly we get your information back."
        },
        {
          "topic": "what-we-need",
          "q": "What do you need from me?",
          "a": "Accurate information about your business, your photos and logo if you have them, and one round of feedback before launch. On Search and Search Plus there's also one call so we get your tone right. That's the whole list."
        },
        {
          "topic": "do-we-meet",
          "q": "Do we have to meet?",
          "a": "Only on Search and Search Plus, and only once. Everything else runs on one questionnaire and email. If you'd rather talk something through at any point we're happy to, but we won't put a standing meeting on your calendar."
        }
      ]
    },
    {
      "title": "Packages and pricing",
      "items": [
        {
          "topic": "which-package",
          "q": "Which package is right for me?",
          "a": "If people already know about you and just need somewhere to land, Presence is the one. If you want customers to find you through Google, start at Search. Search Plus is for businesses that want us working the site through the year. If you're not sure, tell us what your business does and we'll tell you which one we'd pick."
        },
        {
          "topic": "search-vs-search-plus",
          "q": "What's the difference between Search and Search Plus?",
          "a": "Search builds your site around keyword research and keeps 24 articles a year going out. Search Plus adds competitor analysis up front, and through the year we keep watching the search data and updating pages when there's an opening. Search sets the strategy once. Search Plus keeps adjusting it."
        },
        {
          "topic": "change-tiers",
          "q": "Can I change tiers later?",
          "a": "Yes. Moving up is common and easy: we quote the difference in build work and your monthly moves to the new tier. Moving down is fine too, at the end of your current term."
        },
        {
          "topic": "no-monthly-plan",
          "q": "Do you build sites without a monthly plan?",
          "a": "No. A site nobody maintains slowly stops being useful, and keeping it useful is the thing we actually sell. Every Keepsite build comes with a subscription that keeps it hosted, monitored, and current."
        }
      ]
    },
    {
      "title": "The monthly subscription",
      "items": [
        {
          "topic": "what-monthly-covers",
          "q": "What does the monthly cover?",
          "a": "On every package: hosting, routine maintenance, monitoring, minor content updates, and a plain-English recap once a year. On Search and Search Plus it also covers the content and search work, including 24 SEO blog posts a year that we plan, write, edit, and publish for you."
        },
        {
          "topic": "monthly-just-hosting",
          "q": "Is the monthly just hosting?",
          "a": "No. Hosting is one small line item inside it. The rest is maintenance, monitoring, and the updates that keep the site current, plus the ongoing content and search work on Search and Search Plus. On those two, most of the monthly is 24 articles a year and the search work behind them."
        },
        {
          "topic": "locked-in",
          "q": "Am I locked into a contract?",
          "a": "Presence is month to month, cancel any time with 30 days' notice. Search and Search Plus run on an annual content plan, so the first year is a 12-month commitment, and after that they're month to month too. The 12 months exist because the content is planned as a year, not because we want to hold on to you."
        },
        {
          "topic": "if-i-stop",
          "q": "What happens if I stop?",
          "a": "Your domain is yours and your content is yours, including every blog post we published. We'll help you move them wherever you're going. The site itself comes offline when the subscription ends, so if you're planning a move, tell us and we'll time it so nothing goes dark."
        }
      ]
    },
    {
      "title": "Content and SEO",
      "items": [
        {
          "topic": "who-writes-copy",
          "q": "Who writes the copy?",
          "a": "On Presence, you provide the words and we edit and place them. On Search and Search Plus, we write the copy for your core pages around the keywords we find. Either way you supply the facts: what you do, where, for whom, and what's true about the business."
        },
        {
          "topic": "no-copy",
          "q": "What if I don't have copy?",
          "a": "On Search and Search Plus that's already covered, because writing the core pages is part of the build. On Presence, if there's nothing to work from, we can develop the copy as an add-on at $90 an hour, or you can move up to Search where it's included."
        },
        {
          "topic": "blog-posts",
          "q": "What are the 24 blog posts, exactly?",
          "a": "Two articles a month on topics we plan against your keywords, which means the questions your customers are already searching. We draft, edit, and publish them. About a week before each one goes out you get an email with the article in it."
        },
        {
          "topic": "approve-posts",
          "q": "Do I have to approve every post?",
          "a": "No. You get each article about a week ahead so you can catch anything inaccurate. If we don't hear back, it publishes on schedule. Reading them is optional. Correcting them is the part that matters."
        }
      ]
    },
    {
      "title": "Working with us",
      "items": [
        {
          "topic": "changes-myself",
          "q": "Can I make changes myself?",
          "a": "You can, but you don't have to, and most people don't. Send us what you want changed and it's handled as part of your monthly. If you'd rather edit some sections yourself, we can set that up."
        },
        {
          "topic": "new-page",
          "q": "What if I need a new page?",
          "a": "A standard page is $180. A search-informed page, on Search or Search Plus, is $270. If what you need is more strategy rather than more pages, we'll move you to the package that covers it instead of selling it piece by piece."
        },
        {
          "topic": "domain-owner",
          "q": "Who owns my domain?",
          "a": "You do. It's registered in your name, on your account, and it stays yours no matter what happens with us. If you don't have one yet, we'll walk you through buying it."
        },
        {
          "topic": "business-types",
          "q": "What kinds of businesses do you work with?",
          "a": "Local service businesses, trades, salons, studios, clinics, shops, and independent professionals, mostly around Utah. If your customers find you through Google, Instagram, or a referral, this is built for you."
        }
      ]
    }
  ],
  "closing": {
    "heading": "Keep your business moving.",
    "sub": "We'll take care of the website.",
    "ctaLabel": "Start your site",
    "ctaHref": "/start/"
  }
}
```

Four of these carry most of the weight, and an executor should not soften them:
- **"Is the monthly just hosting?"** A visitor who has priced hosting knows it is nearly free. Ducking this reads as exactly the mysterious marketing the brand disowns.
- **"Do you build sites without a monthly plan?"** The answer is no, stated once, with a plain reason and no apology. Any hedging invites a negotiation the productized model exists to prevent.
- **"Am I locked into a contract?" and "What happens if I stop?"** Both come straight from the approved policy. The 12-month term is framed as the shape of the service, never as a penalty. Neither answer says "no lock-in", mentions repos or Netlify accounts, or promises the client keeps the built site.
- **"Who owns my domain?"** The one genuine ownership answer that survives the transition. Keep it scoped to the domain so it does not reawaken "you keep the repo."

- [ ] **Step 2: Validate structure and slug uniqueness**

```bash
node -e "
const f=require('./src/data/faq.json');
const items=f.groups.flatMap(g=>g.items);
if(f.groups.length!==5)throw new Error('groups: '+f.groups.length);
if(items.length!==20)throw new Error('items: '+items.length);
const slugs=items.map(i=>i.topic);
if(new Set(slugs).size!==slugs.length)throw new Error('duplicate topic slug');
slugs.forEach(s=>{if(!/^[a-z0-9-]+\$/.test(s))throw new Error('bad slug '+s)});
['which-package','search-vs-search-plus','what-monthly-covers','who-writes-copy','change-tiers']
  .forEach(s=>{if(!slugs.includes(s))throw new Error('packages.json depends on missing topic '+s)});
items.forEach(i=>{if(!i.q||!i.a)throw new Error('empty q/a on '+i.topic)});
console.log('ok');
"
```

Expected: `ok`.

- [ ] **Step 3: Verify old-model answers are gone and no em dashes crept in**

```bash
grep -nEi 'lock-in|GitHub|repository|Netlify|free tier|\\\$0|nothing to pay|hand(ed)? over|\\\$500|\\\$750|payment plan|10%' src/data/faq.json
```

Expected: no output.

```bash
grep -n "—" src/data/faq.json
```

Expected: no output. The only permitted em dashes on the site are inside `packages.json`'s `subscriptionTerms`.

```bash
grep -nE '\bI\b|\bmy\b|\bme\b' src/data/faq.json
```

Expected: no output. The voice is "we".

- [ ] **Step 4: Confirm the build is green**

`src/pages/faq.astro` reads `faq.intro` and `faq.groups[].items[].q/.a`, all of which still exist, so it keeps rendering. It does not yet read `meta` or `closing`; Task 6.2 rewires it.

```bash
npm run build && npx astro check
grep -c "What is GitHub" dist/faq/index.html   # expect: 0
grep -c "Is the monthly just hosting" dist/faq/index.html  # expect: 1
```

- [ ] **Step 5: Commit**

```bash
git add src/data/faq.json
git commit -m "feat: rewrite FAQ for the subscription model

Replaces the tech-explainer and 'no monthly costs' groups with the
objections a subscription actually creates, including what the
monthly buys and what happens if you stop.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017DWwHn2MN9zCJYmixdNzCz"
```

---

### Task 2.6: Rename the `portfolio` collection to `work`

**Files:**
- Modify: `src/content.config.ts:1-15` (full replacement)
- Delete: `src/content/portfolio/example-bakery.md`, `example-consultant.md`, `example-nonprofit.md`
- Create: `src/content/work/.gitkeep`
- Delete: `src/pages/portfolio.astro`

**Interfaces:**
- Consumes: nothing.
- Produces: the `work` collection. Later tasks type entries as `CollectionEntry<'work'>`, with `data` fields: `title: string`, `url: string`, `tier: 'Presence' | 'Search' | 'Search Plus'`, `job: string`, `scope: string[]`, `screenshot: string`, `launched: Date`, `featured: boolean`, `order: number`.
- Task 7.1 (`src/pages/work/[...path].astro`) and Task 7.2 (header nav, homepage strip) both call `getCollection('work')`. The collection is empty at launch, so all three surfaces stay dormant.

- [ ] **Step 1: Delete the three placeholder projects**

```bash
rm src/content/portfolio/example-bakery.md \
   src/content/portfolio/example-consultant.md \
   src/content/portfolio/example-nonprofit.md
rmdir src/content/portfolio
mkdir -p src/content/work
touch src/content/work/.gitkeep
```

All three were fabricated, pointed at `url: https://example.com`, and their blurbs literally ended "(Placeholder. Swap in a real project.)". Under a brand whose third pillar is "Show your work", shipping invented case studies is the worst available option.

- [ ] **Step 2: Delete the portfolio page**

```bash
rm src/pages/portfolio.astro
```

Its lead copy — "A few of the sites I've built. Each one now belongs entirely to the client it was made for." — is first person and sells ownership. The route comes back in Task 7.1 as `/work/`, generated only when there is something to show.

- [ ] **Step 3: Replace `src/content.config.ts` in full**

```ts
import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const work = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/work' }),
  schema: z.object({
    title: z.string(),
    url: z.string().url(),
    tier: z.enum(['Presence', 'Search', 'Search Plus']),
    job: z.string(),
    scope: z.array(z.string()).min(2).max(4),
    // A public path such as "/images/acme-salon.png". Not Astro's
    // image() helper: DecapCMS writes public URLs, and image() needs
    // a path relative to the markdown file.
    screenshot: z.string(),
    launched: z.coerce.date(),
    featured: z.boolean().default(false),
    order: z.number().default(0),
  }),
});

export const collections = { work };
```

**No metrics fields.** No traffic, no rankings, no "300% increase". Overstated claims are a named guardrail, and unverifiable numbers on early clients would undercut the transparency the brand is built on. Add a `result` string later, only when a real defensible number exists.

- [ ] **Step 4: Verify**

```bash
npm run build && npx astro check
grep -rn "portfolio" src/ astro.config.mjs   # expect: no output
ls dist/portfolio 2>&1                       # expect: No such file or directory
ls src/content/work/                         # expect: .gitkeep
grep -rn "example.com" src/ dist/            # expect: no output
```

Expected: build exit 0, check 0 errors. The `portfolio` string still appears in `public/admin/config.yml`; that file is rewritten in Task 8.1 and is not part of the build graph, so it does not fail this check. If the grep above flags it, that is expected — confirm the only hit is `public/admin/config.yml` and move on.

- [ ] **Step 5: Commit**

```bash
git add src/content.config.ts src/content
git rm -r --cached src/content/portfolio 2>/dev/null || true
git add -A src/pages
git commit -m "feat: rename portfolio collection to work

Deletes three fabricated placeholder projects and the page that
listed them. The route returns in Phase 7, generated only when real
work exists.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017DWwHn2MN9zCJYmixdNzCz"
```

---

# Phase 3 — Homepage

The positioning flips here.

### Task 3.1: Rebuild the homepage to seven bands

**Files:**
- Create: `src/components/ClosingCta.astro`
- Modify: `src/pages/index.astro` (full replacement of the stub from Task 2.2)

**Interfaces:**
- Consumes: `home.json` (Task 2.2), `packages.json` tiers (Task 2.3), the `.section` / `.section-alt` / `.section-deep` / `.rule-row` / `.serif` / `.link-arrow` utilities (Task 1.1).
- Produces: `ClosingCta.astro`, used by `/`, `/packages/`, `/how-it-works/`, `/faq/`, and `/work/`. Props: `interface Props { heading: string; sub: string; ctaLabel: string; ctaHref: string }`. All four required.

- [ ] **Step 1: Create `src/components/ClosingCta.astro`**

```astro
---
interface Props {
  heading: string;
  sub: string;
  ctaLabel: string;
  ctaHref: string;
}
const { heading, sub, ctaLabel, ctaHref } = Astro.props;
---
<section class="section section-deep center">
  <div class="container">
    <h2 class="serif closing-heading">{heading}</h2>
    <p class="closing-sub">{sub}</p>
    <p><a class="btn" href={ctaHref}>{ctaLabel}</a></p>
  </div>
</section>

<style>
  .closing-heading { font-size: var(--step-4); margin-bottom: var(--space-1); }
  .closing-sub { max-width: none; font-size: var(--step-2); margin-bottom: var(--space-3); }
</style>
```

- [ ] **Step 2: Replace `src/pages/index.astro` in full**

Seven bands, alternating off-white → sand → off-white, with the deep green closing band. Sections 1-4 fit in roughly two desktop screens, so a visitor gets tagline → problem → promise → three prices without hunting.

```astro
---
import BaseLayout from '../layouts/BaseLayout.astro';
import ClosingCta from '../components/ClosingCta.astro';
import home from '../data/home.json';
import packages from '../data/packages.json';
---
<BaseLayout title={home.meta.title} description={home.meta.description}>

  <!-- 1 + 2: hero and problem run continuously, no hard break -->
  <section class="section hero">
    <div class="container">
      <h1>{home.hero.headline}</h1>
      <p class="hero-sub">{home.hero.sub}</p>
      <p class="hero-ctas">
        <a class="btn" href={home.hero.primaryCta.href}>{home.hero.primaryCta.label}</a>
        <a class="btn btn-outline" href={home.hero.secondaryCta.href}>{home.hero.secondaryCta.label}</a>
      </p>

      <div class="problem">
        <h2>{home.problem.heading}</h2>
        <p class="lead">{home.problem.body}</p>
      </div>
    </div>
  </section>

  <!-- 3: solution -->
  <section class="section section-alt">
    <div class="container">
      <h2>{home.solution.heading}</h2>
      <div class="grid grid-3 beats">
        {home.solution.beats.map((beat) => (
          <div class="beat">
            <h3>{beat.title}</h3>
            <p class="muted">{beat.body}</p>
          </div>
        ))}
      </div>
      <p class="serif pull-line">{home.solution.pullLine}</p>
    </div>
  </section>

  <!-- 4: packages -->
  <section class="section">
    <div class="container">
      <h2>{home.packages.heading}</h2>
      <div class="grid grid-3 tier-strip">
        {packages.tiers.map((tier) => (
          <a class="card tier-mini" href={`/packages/#${tier.id}`}>
            <h3>{tier.name}</h3>
            <p class="serif tier-line">{tier.line}</p>
            <p class="tier-price price">
              {tier.buildPrice}
              <span class="tier-monthly muted">+ {tier.monthlyPrice}/month</span>
            </p>
          </a>
        ))}
      </div>
      <p><a class="link-arrow" href={home.packages.linkHref}>{home.packages.linkLabel} &rarr;</a></p>
    </div>
  </section>

  <!-- 5: why keepsite -->
  <section class="section section-alt">
    <div class="container">
      <h2>{home.why.heading}</h2>
      <div class="rule-row pillars">
        {home.why.pillars.map((pillar) => (
          <div>
            <h3>{pillar.title}</h3>
            <p class="muted">{pillar.body}</p>
          </div>
        ))}
      </div>
    </div>
  </section>

  <!-- 6: work. Added in Task 7.2, once there is work to show. -->

  <!-- 7: closing -->
  <ClosingCta
    heading={home.closing.heading}
    sub={home.closing.sub}
    ctaLabel={home.closing.ctaLabel}
    ctaHref={home.closing.ctaHref}
  />

</BaseLayout>

<style>
  .hero h1 { font-size: var(--step-5); max-width: 16ch; }
  .hero-sub { max-width: var(--maxw-lead); font-size: var(--step-2); color: var(--color-muted); }
  .hero-ctas { display: flex; flex-wrap: wrap; gap: var(--space-2); margin-top: var(--space-3); }

  .problem { margin-top: var(--space-6); }
  .problem h2 { max-width: 20ch; }

  .beats { margin-top: var(--space-4); }
  .beat h3 { font-size: var(--step-1); margin-bottom: var(--space-1); }

  .pull-line {
    margin-top: var(--space-5);
    margin-bottom: 0;
    font-size: var(--step-3);
    color: var(--color-brand);
    max-width: none;
  }

  .tier-strip { margin-top: var(--space-4); }
  .tier-mini { display: block; text-decoration: none; color: var(--color-ink); }
  .tier-mini:hover { border-color: var(--color-ink); color: var(--color-ink); }
  .tier-mini h3 { margin-bottom: var(--space-0); }
  .tier-line { color: var(--color-brand); font-size: var(--step-1); margin-bottom: var(--space-2); }
  .tier-price { font-size: var(--step-3); font-weight: 600; margin: 0; }
  .tier-monthly { display: block; font-size: var(--step-0); font-weight: 400; }

  .pillars { margin-top: var(--space-4); }
  .pillars h3 { font-size: var(--step-1); margin-bottom: var(--space-1); }
</style>
```

Two decisions worth not undoing:
- **Primary CTA is "View Packages", not "Start Your Site".** Price is the question the visitor arrives with, and it is the lower-commitment step. Sending a cold visitor to a form first is the salesy move the brand rejects. "Start your site" stays visible as the header button for anyone already decided.
- **Prices appear on the homepage.** A visitor should not have to click to learn the cost. That is question four of the six a visitor must never have to wonder about.
- **The four Why Keepsite pillars are a rule-separated row, not four cards.** A card is only for a discrete, comparable object.

- [ ] **Step 3: Verify structure and copy**

```bash
npm run build && npx astro check
grep -o "<h1" dist/index.html | wc -l                          # expect: 1
grep -o "<h2" dist/index.html | wc -l                          # expect: 5
grep -o "Websites for people with other things to do." dist/index.html | head -1
grep -o "A website that earns its keep." dist/index.html | wc -l   # expect: 1
grep -o "Keep your business moving." dist/index.html | wc -l       # expect: 1
grep -o '\$1,100\|\$1,750\|\$2,000' dist/index.html | sort -u   # expect: all three
```

The five `<h2>` elements are the problem, solution, packages, and Why Keepsite headings plus the closing CTA.

- [ ] **Step 4: Verify the keep-phrase budget**

```bash
node -e "
const h=require('fs').readFileSync('dist/index.html','utf8');
const count=(s)=>h.split(s).length-1;
const total=count('earns its keep')+count('Keep showing up')+count('Keep growing')+count('Keep your business moving');
if(total!==4)throw new Error('expected 4 keep-phrase instances across 3 placements, got '+total);
console.log('ok, keep phrases:',total,'across 3 placements');
"
```

Expected: `ok, keep phrases: 4 across 3 placements` (the packages band contributes two of them, from the Search and Search Plus one-liners; Presence's "Be there when people look." is not a keep phrase).

- [ ] **Step 5: Verify no old-model residue on the homepage**

```bash
grep -rniE 'own it|no lock-in|\\\$0 a month|nothing to pay|hourly|GitHub|Netlify' dist/index.html
```

Expected: no output.

```bash
grep -c "<canvas\|<script" dist/index.html
```

Expected: `1` — the JSON-LD `<script type="application/ld+json">` only. No canvas, no behavioral JS.

- [ ] **Step 6: Commit**

```bash
git add src/pages/index.astro src/components/ClosingCta.astro
git commit -m "feat: rebuild the homepage on the new positioning

Seven bands, alternating surfaces instead of the deleted node
backdrop. Prices are visible above the fold plus one scroll.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017DWwHn2MN9zCJYmixdNzCz"
```

---

# Phase 4 — Nav and routes

IA complete. The pages renamed here still carry old copy; Phases 5 and 6 rewrite them.

### Task 4.1: Rename the routes and add the 301s

**Files:**
- Rename: `src/pages/pricing.astro` → `src/pages/packages.astro`
- Rename: `src/pages/contact.astro` → `src/pages/start/index.astro`
- Modify: `netlify.toml` (add three redirect blocks after the `/admin` block)

**Interfaces:**
- Consumes: nothing.
- Produces: the final route map. `/`, `/packages/`, `/how-it-works/`, `/faq/`, `/start/`, `/start/thanks/`, `/work/` (conditional), `/404`.

- [ ] **Step 1: Move the two pages**

```bash
git mv src/pages/pricing.astro src/pages/packages.astro
mkdir -p src/pages/start
git mv src/pages/contact.astro src/pages/start/index.astro
```

- [ ] **Step 2: Fix the internal links inside the moved files**

In `src/pages/packages.astro`, change the CTA on the last content line from `href="/contact"` to `href="/start/"`.

In `src/pages/start/index.astro`, change the form's `action="/contact?success=1"` to `action="/start/?success=1"`. This is a stopgap: Task 6.3 replaces the query-string toggle with a real `/start/thanks/` page.

- [ ] **Step 3: Fix the remaining `/contact` and `/pricing` links across the site**

```bash
grep -rn '"/contact"\|"/pricing"\|"/portfolio"' src/
```

Expected hits and their replacements:
- `src/pages/faq.astro` — `<a class="btn" href="/contact">Get in touch</a>` → `<a class="btn" href="/start/">Start your site</a>`

Apply that change, then re-run the grep. Expected the second time: no output.

- [ ] **Step 4: Add the 301s to `netlify.toml`**

Insert these three blocks immediately after the existing `[[redirects]]` block for `/admin`:

```toml
[[redirects]]
  from = "/pricing"
  to = "/packages/"
  status = 301
  force = true

[[redirects]]
  from = "/contact"
  to = "/start/"
  status = 301
  force = true

# /work/ is not generated until the collection has entries, so this
# points at the homepage for now. Task 7.1 flips the target to
# "/work/" in the same commit that adds the first real project.
[[redirects]]
  from = "/portfolio"
  to = "/"
  status = 301
  force = true
```

`/pricing` and `/contact` are the two old URLs most likely to have inbound links, so these carry the equity rather than 404ing. Netlify normalizes trailing slashes, so `from = "/pricing"` also matches `/pricing/`.

Do **not** add an announcement page saying the model changed. It would be the only page on the site arguing with the old positioning, and it would keep that positioning alive. Google will re-crawl the rewritten descriptions over days to weeks on its own.

- [ ] **Step 5: Verify**

```bash
npm run build && npx astro check
ls dist/packages/index.html dist/start/index.html
ls dist/pricing 2>&1     # expect: No such file or directory
ls dist/contact 2>&1     # expect: No such file or directory
grep -rn '/contact\|/pricing\|/portfolio' src/   # expect: no output
grep -c 'from = "/pricing"' netlify.toml         # expect: 1
```

- [ ] **Step 6: Commit**

```bash
git add -A src/pages netlify.toml
git commit -m "feat: rename routes to packages and start

Adds 301s from /pricing, /contact, and /portfolio so the indexed old
URLs carry their equity instead of 404ing.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017DWwHn2MN9zCJYmixdNzCz"
```

---

### Task 4.2: Header reads the CTA flag from data

**Files:**
- Modify: `src/components/Header.astro:1-28` (full replacement)

**Interfaces:**
- Consumes: `site.nav[] {label, href, cta}` from Task 2.1.
- Produces: a header that no longer hard-codes which nav item is the button. Task 7.2 extends the same component to inject the Work item.

- [ ] **Step 1: Replace `src/components/Header.astro` in full**

```astro
---
import site from '../data/site.json';

const path = Astro.url.pathname;
// Match with or without a trailing slash so /packages and /packages/
// both mark the item current.
const isCurrent = (href: string) =>
  path === href || path.replace(/\/$/, '') === href.replace(/\/$/, '');
---
<header class="site-header">
  <div class="container header-inner">
    <a class="brand" href="/">{site.brand}</a>
    <nav aria-label="Primary">
      {site.nav.map((item) => (
        <a
          href={item.href}
          class={item.cta ? 'nav-cta' : 'nav-link'}
          aria-current={isCurrent(item.href) ? 'page' : undefined}
        >{item.label}</a>
      ))}
    </nav>
  </div>
</header>

<style>
  .site-header {
    position: sticky;
    top: 0;
    z-index: 10;
    background: var(--color-bg);
    border-bottom: 1px solid var(--color-border);
  }
  .header-inner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    flex-wrap: wrap;
    padding-top: var(--space-2);
    padding-bottom: var(--space-2);
  }
  .brand {
    font-weight: 600;
    font-size: var(--step-1);
    letter-spacing: -0.02em;
    text-decoration: none;
    color: var(--color-ink);
  }
  nav { display: flex; align-items: center; gap: var(--space-3); flex-wrap: wrap; }
  .nav-link {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    color: var(--color-ink);
    font-weight: 500;
    text-decoration: none;
    transition: color 120ms ease;
  }
  .nav-link:hover { color: var(--color-brand); }
  /* Clay, use one: the underline on the current nav item. */
  .nav-link[aria-current="page"] {
    color: var(--color-brand);
    text-decoration: underline;
    text-decoration-color: var(--color-accent);
    text-decoration-thickness: 2px;
    text-underline-offset: 0.35em;
  }
  .nav-cta {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    padding: 0.5rem 1.1rem;
    border-radius: var(--radius);
    background: var(--color-brand);
    color: #FFFFFF;
    font-weight: 600;
    text-decoration: none;
    transition: background-color 120ms ease;
  }
  .nav-cta:hover { background: var(--color-brand-deep); color: #FFFFFF; }
</style>
```

The old code hard-coded `item.href === '/contact'` to decide which item was the button. Now the flag lives in the data, so the owner can move the CTA from the CMS.

- [ ] **Step 2: Verify**

```bash
npm run build && npx astro check
grep -rn "'/contact'" src/components/Header.astro   # expect: no output
grep -o 'aria-current="page"' dist/faq/index.html   # expect: one hit
grep -o 'class="nav-cta"' dist/index.html           # expect: one hit
grep -c 'Portfolio\|Pricing\|Get in touch' dist/index.html  # expect: 0
```

- [ ] **Step 3: Commit**

```bash
git add src/components/Header.astro
git commit -m "feat: drive the header CTA from nav data

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017DWwHn2MN9zCJYmixdNzCz"
```

---

### Task 4.3: Restructure the footer

**Files:**
- Modify: `src/components/Footer.astro:1-17` (full replacement)

**Interfaces:**
- Consumes: `site.tagline`, `site.nav`, `site.email`, `site.phone`, `site.phoneE164`, `site.areaServed` from Task 2.1.
- Produces: a footer with **no promises and no guarantee copy**. The old `footerNote` put a sales claim on every page, and that is exactly the pattern that made the old positioning so pervasive. Do not rebuild it with new content.

- [ ] **Step 1: Replace `src/components/Footer.astro` in full**

```astro
---
import site from '../data/site.json';
const year = new Date().getFullYear();
---
<footer class="site-footer">
  <div class="container">
    <div class="footer-grid">
      <div>
        <a class="footer-brand" href="/">{site.brand}</a>
        <p class="footer-tagline">{site.tagline}</p>
      </div>

      <nav aria-label="Footer">
        <ul class="footer-nav">
          {site.nav.map((item) => (
            <li><a href={item.href}>{item.label}</a></li>
          ))}
        </ul>
      </nav>

      <address class="footer-contact">
        <a href={`mailto:${site.email}`}>{site.email}</a>
        <a href={`tel:${site.phoneE164}`}>{site.phone}</a>
        <span class="muted">Serving {site.areaServed}</span>
      </address>
    </div>

    <p class="footer-bottom muted">&copy; {year} {site.brand}</p>
  </div>
</footer>

<style>
  .site-footer {
    margin-top: 0;
    padding: var(--space-5) 0 var(--space-4);
    border-top: 1px solid var(--color-border);
    background: var(--color-bg);
  }
  .footer-grid { display: grid; gap: var(--space-4); }
  @media (min-width: 720px) {
    .footer-grid { grid-template-columns: 2fr 1fr 1fr; gap: var(--space-5); }
  }

  .footer-brand {
    font-weight: 600;
    font-size: var(--step-1);
    letter-spacing: -0.02em;
    text-decoration: none;
    color: var(--color-ink);
  }
  .footer-tagline { margin: var(--space-1) 0 0; max-width: 30ch; color: var(--color-muted); }

  .footer-nav { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--space-1); }
  .footer-nav a,
  .footer-contact a {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    text-decoration: none;
  }
  .footer-nav a:hover,
  .footer-contact a:hover { text-decoration: underline; }

  .footer-contact { display: grid; font-style: normal; }

  .footer-bottom {
    margin: var(--space-4) 0 0;
    padding-top: var(--space-3);
    border-top: 1px solid var(--color-border);
    font-size: var(--step--1);
  }
</style>
```

`<address>` with `font-style: normal` is the correct landmark for contact details and stops the browser italicizing them.

- [ ] **Step 2: Verify**

```bash
npm run build && npx astro check
grep -c "You keep everything\|No lock-in\|nothing to pay" dist/index.html  # expect: 0
grep -o "keepsitemedia@gmail.com" dist/index.html | head -1
grep -o 'href="tel:+13853078190"' dist/index.html | head -1
grep -o "Serving Utah" dist/index.html | head -1
grep -c "<address" dist/index.html   # expect: 1
```

- [ ] **Step 3: Commit**

```bash
git add src/components/Footer.astro
git commit -m "feat: rebuild the footer in three columns

Drops the site-wide sales claim. Contact details move into an
<address> landmark with the new email, phone, and service area.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017DWwHn2MN9zCJYmixdNzCz"
```

---

# Phase 5 — Packages

The commercial core, and the hardest layout problem on the site: three tiers × two prices each × about twenty inclusions × a five-item add-on menu, presented without clutter, for a reader who has other things to do. The answer is progressive disclosure: **cards to choose, table to verify.**

### Task 5.1: Packages page shell and tier cards

**Files:**
- Modify: `src/pages/packages.astro` (full replacement)
- Delete: `src/data/pricing.json`

**Interfaces:**
- Consumes: `packages.json` (Task 2.3), `ClosingCta` (Task 3.1).
- Produces: the page skeleton that Tasks 5.2-5.5 fill in. The band order is fixed: (1) H1 + intro, (2) tier cards, (3) monthly, sand, (4) comparison, (5) add-ons, sand, (6) scope FAQ, (7) closing CTA, deep green. Each tier card gets `id={tier.id}` so `/packages/#search` works from the homepage strip.

- [ ] **Step 1: Delete the old pricing data**

```bash
git rm src/data/pricing.json
```

Everything in it argued the old model: an intro promising "no subscription attached", tiers at `$500` and `$750`, feature bullets reading "$0/month hosting" and "Code in your GitHub repo", an `hourly` block, and a closing `ownership` paragraph ending "once the site is built you owe me nothing further."

- [ ] **Step 2: Replace `src/pages/packages.astro` with the shell plus tier cards**

Bands 3 through 6 are added in the next three tasks; the comments mark where.

```astro
---
import BaseLayout from '../layouts/BaseLayout.astro';
import ClosingCta from '../components/ClosingCta.astro';
import packages from '../data/packages.json';
---
<BaseLayout title={packages.meta.title} description={packages.meta.description}>

  <section class="section-tight">
    <div class="container">
      <h1>Packages</h1>
      <p class="lead">{packages.intro}</p>
    </div>
  </section>

  <section class="section-tight">
    <div class="container">
      <h2 class="visually-hidden">The three packages</h2>
      <div class="grid grid-3">
        {packages.tiers.map((tier) => (
          <div class="card tier" id={tier.id}>
            <h3 class="tier-name">{tier.name}</h3>
            <p class="serif tier-line">{tier.line}</p>

            <p class="tier-price price">
              {tier.buildPrice}
              <span class="tier-price-note muted">{tier.buildPriceNote}</span>
            </p>
            <p class="tier-monthly price muted">
              + {tier.monthlyPrice}/month
              <span class="visually-hidden">{tier.monthlyPriceNote}</span>
            </p>

            <p class="tier-bestfor"><strong>Best for:</strong> {tier.bestFor}</p>

            <ul class="tier-includes">
              {tier.cardIncludes.map((line) => <li>{line}</li>)}
            </ul>

            <a class="btn tier-cta" href={`/start/?tier=${tier.id}`}>{tier.ctaLabel} &rarr;</a>
          </div>
        ))}
      </div>
    </div>
  </section>

  <!-- Band 3: what the monthly covers. Task 5.2. -->
  <!-- Band 4: comparison table. Task 5.3. -->
  <!-- Bands 5 and 6: add-ons and scope FAQ. Task 5.4. -->

  <ClosingCta
    heading={packages.closing.heading}
    sub={packages.closing.sub}
    ctaLabel={packages.closing.ctaLabel}
    ctaHref={packages.closing.ctaHref}
  />

</BaseLayout>

<style>
  .tier { display: flex; flex-direction: column; scroll-margin-top: 6rem; }
  .tier-name { font-size: var(--step-2); margin-bottom: var(--space-0); }
  .tier-line { color: var(--color-brand); font-size: var(--step-1); margin-bottom: var(--space-3); }

  .tier-price {
    font-size: var(--step-4);
    font-weight: 600;
    line-height: 1.05;
    letter-spacing: -0.02em;
    margin: 0;
  }
  .tier-price-note { display: block; font-size: var(--step--1); font-weight: 400; letter-spacing: 0; }
  .tier-monthly { font-size: var(--step-1); margin: var(--space-0) 0 var(--space-3); }

  .tier-bestfor { font-size: var(--step--1); margin-bottom: var(--space-3); }

  .tier-includes {
    list-style: none;
    padding: 0;
    margin: 0 0 var(--space-3);
    display: grid;
    gap: var(--space-1);
  }
  .tier-includes li { padding-left: 1.5rem; position: relative; }
  .tier-includes li::before {
    content: "";
    position: absolute;
    left: 0;
    top: 0.62em;
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 50%;
    background: var(--color-brand);
  }

  .tier-cta { margin-top: auto; align-self: flex-start; }
</style>
```

Four things not to change:
- **Exactly five bullets per card.** The SOP lists ten to fourteen inclusions per tier; dumping them makes three dense grey columns nobody reads. The card sells the *shape* of the tier, the table below holds the detail. For Search and Search Plus, bullet one is "Everything in [previous tier]", which carries the cumulative structure without repetition.
- **Both numbers visible, always.** No monthly/annual toggle, no "starting at", no price behind a form.
- **No "Most popular" ribbon, badge, or scale transform on any card.** There is no client data to support the claim.
- **The bullet marker is a dot, not a check glyph.** A check implies a comparison against something absent; that job belongs to the table, where the cells carry visually-hidden text.

- [ ] **Step 3: Verify**

```bash
npm run build && npx astro check
grep -o 'id="presence"\|id="search"\|id="search-plus"' dist/packages/index.html
grep -o '\$1,100\|\$55\|\$1,750\|\$150\|\$2,000\|\$275' dist/packages/index.html | sort -u | wc -l   # expect: 6
grep -rn "pricing.json" src/                    # expect: no output
grep -c 'Most popular\|most chosen' dist/packages/index.html   # expect: 0
grep -riE '\\\$500|\\\$750|no subscription|owe me nothing|GitHub' dist/packages/index.html  # expect: no output
```

- [ ] **Step 4: Verify each card carries exactly five bullets**

```bash
node -e "
const fs=require('fs');
const h=fs.readFileSync('dist/packages/index.html','utf8');
const lists=h.match(/<ul class=\"tier-includes\">[\s\S]*?<\/ul>/g)||[];
if(lists.length!==3)throw new Error('tier lists: '+lists.length);
lists.forEach((l,i)=>{
  const n=(l.match(/<li>/g)||[]).length;
  if(n!==5)throw new Error('card '+i+' has '+n+' bullets, expected 5');
});
console.log('ok');
"
```

Expected: `ok`.

- [ ] **Step 5: Commit**

```bash
git add src/pages/packages.astro
git rm src/data/pricing.json
git commit -m "feat: rebuild packages page with tier cards

Cards to choose, table to verify. Five curated bullets per card so
the visual hierarchy survives; the full detail goes in the table.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017DWwHn2MN9zCJYmixdNzCz"
```

---

### Task 5.2: "What the monthly covers" band

**Files:**
- Modify: `src/pages/packages.astro` (replace the `<!-- Band 3 -->` comment)

**Interfaces:**
- Consumes: `packages.monthly {heading, lead, closing, subscriptionTerms}` and `packages.tiers[].monthlySummary[]` from Task 2.3.
- Produces: nothing later tasks depend on.

This is the most important band on the page. A visitor who has priced static hosting will assume the monthly is margin, so the answer has to be plain and specific.

- [ ] **Step 1: Replace the `<!-- Band 3 … -->` comment with the band**

```astro
  <section class="section section-alt">
    <div class="container">
      <h2 class="serif monthly-heading">{packages.monthly.heading}</h2>
      <p class="lead monthly-lead">{packages.monthly.lead}</p>

      <div class="grid grid-3 monthly-cols">
        {packages.tiers.map((tier) => (
          <div class="monthly-col">
            <h3>{tier.name}</h3>
            <p class="monthly-price price muted">{tier.monthlyPrice}/month</p>
            <ul>
              {tier.monthlySummary.map((line) => <li>{line}</li>)}
            </ul>
          </div>
        ))}
      </div>

      <p class="monthly-headline">24 SEO blog posts a year, written and published for you.</p>

      <p class="monthly-closing">{packages.monthly.closing}</p>
      <p class="monthly-terms">{packages.monthly.subscriptionTerms}</p>
    </div>
  </section>
```

- [ ] **Step 2: Add the band's scoped styles**

Append to the page's `<style>` block:

```css
  .monthly-heading { font-size: var(--step-3); color: var(--color-brand); }
  .monthly-lead { max-width: var(--maxw-prose); }
  .monthly-cols { margin-top: var(--space-4); }
  .monthly-col h3 { font-size: var(--step-1); margin-bottom: var(--space-0); }
  .monthly-price { margin: 0 0 var(--space-2); font-weight: 600; }
  .monthly-col ul { padding-left: 1.1rem; margin: 0; }
  .monthly-col li { margin-bottom: var(--space-1); color: var(--color-muted); }

  /* The strongest single fact on the page for justifying $150/month,
     so it is not a bullet in a list. */
  .monthly-headline {
    margin: var(--space-5) 0 var(--space-4);
    padding-top: var(--space-3);
    border-top: 1px solid var(--color-border);
    max-width: 24ch;
    font-size: var(--step-3);
    font-weight: 600;
    letter-spacing: -0.02em;
    line-height: 1.15;
  }

  .monthly-closing { max-width: var(--maxw-prose); }
  .monthly-terms { max-width: var(--maxw-prose); font-size: var(--step--1); color: var(--color-muted); }
```

- [ ] **Step 3: Verify the approved terms copy survived to the page, character-exact**

```bash
npm run build && npx astro check
node -e "
const fs=require('fs');
const h=fs.readFileSync('dist/packages/index.html','utf8');
const want='Presence is month to month — cancel any time with 30 days&#39; notice. Search and Search Plus run on an annual content plan, so the first year is a 12-month commitment; after that, month to month. Either way, your domain and your content are yours — if you ever leave, we&#39;ll help you move them.';
if(!h.includes(want))throw new Error('subscription terms missing or altered on the page');
console.log('ok');
"
```

Expected: `ok`. (Astro escapes the apostrophes as `&#39;`; the em dashes pass through as-is.)

- [ ] **Step 4: Verify the band's content**

```bash
grep -c "Keep your site working." dist/packages/index.html          # expect: 1
grep -c "24 SEO blog posts a year, written and published for you." dist/packages/index.html
grep -o "inquiry page, set up to send straight to your email" dist/packages/index.html | head -1
grep -riE 'lock-in|repo|Netlify account' dist/packages/index.html   # expect: no output
```

The third grep confirms the trust detail from the SOP's universal inclusion is on the page.

- [ ] **Step 5: Commit**

```bash
git add src/pages/packages.astro
git commit -m "feat: add the what-the-monthly-covers band

Answers 'is this just hosting' head on, per tier, and states the
approved subscription terms once, in the band the reader is already in.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017DWwHn2MN9zCJYmixdNzCz"
```

---

### Task 5.3: Comparison table

**Files:**
- Modify: `src/pages/packages.astro` (replace the `<!-- Band 4 -->` comment)

**Interfaces:**
- Consumes: `packages.comparison[] {group, feature, presence, search, searchPlus}` from Task 2.3, and `.table-scroll` / `.compare` from Task 1.1.
- Produces: nothing later tasks depend on.

- [ ] **Step 1: Add the grouping helper to the page frontmatter**

Append to `packages.astro`'s frontmatter, after the imports:

```ts
type Cell = boolean | string;
type Row = { group: string; feature: string; presence: Cell; search: Cell; searchPlus: Cell };

const rows = packages.comparison as Row[];
const groups = ['Build', 'Monthly'].map((name) => ({
  name,
  rows: rows.filter((r) => r.group === name),
}));

// DecapCMS writes every list field as a string, so a row edited in
// the CMS arrives as "true"/"false" rather than a JSON boolean.
// Normalize both forms to one shape.
const normalize = (cell: Cell): boolean | string => {
  if (cell === true || cell === 'true') return true;
  if (cell === false || cell === 'false') return false;
  return String(cell);
};
```

- [ ] **Step 2: Replace the `<!-- Band 4 … -->` comment with the table**

```astro
  <section class="section">
    <div class="container">
      <h2>Full comparison</h2>

      <div class="table-scroll" role="region" aria-label="Package comparison" tabindex="0">
        <table class="compare">
          <caption>Everything included in each package, by build and by monthly subscription.</caption>
          <thead>
            <tr>
              <th scope="col">Feature</th>
              {packages.tiers.map((tier) => <th scope="col">{tier.name}</th>)}
            </tr>
          </thead>
          {groups.map((group) => (
            <tbody>
              <tr>
                <th scope="rowgroup" colspan="4">{group.name}</th>
              </tr>
              {group.rows.map((row) => (
                <tr>
                  <th scope="row">{row.feature}</th>
                  {([row.presence, row.search, row.searchPlus] as Cell[]).map((raw) => {
                    const cell = normalize(raw);
                    return (
                      <td>
                        {cell === true && (
                          <>
                            <span aria-hidden="true">&#10003;</span>
                            <span class="visually-hidden">Included</span>
                          </>
                        )}
                        {cell === false && (
                          <>
                            <span aria-hidden="true">&#8212;</span>
                            <span class="visually-hidden">Not included</span>
                          </>
                        )}
                        {typeof cell === 'string' && cell}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>
    </div>
  </section>
```

Three accessibility details that are easy to get wrong:
- **Cells never carry a symbol alone.** A screen reader announcing "✓ ✓ ✓" with no context fails 1.3.1, so every glyph is `aria-hidden` and paired with visually-hidden text.
- **`tabindex="0"` on the scroll region is required, not optional.** A horizontally scrollable region that keyboard users cannot reach is a 2.1.1 failure, and it is the detail most implementations miss. `role="region"` plus `aria-label` is what makes the focusable div announce itself.
- **`<th scope="rowgroup">` for the Build and Monthly headers, `<th scope="row">` for features, `<th scope="col">` for tiers.** The `<caption>` is real, not a visually-hidden heading.

- [ ] **Step 3: Verify the semantics reached the output**

```bash
npm run build && npx astro check
node -e "
const fs=require('fs');
const h=fs.readFileSync('dist/packages/index.html','utf8');
const need={
  'caption':1,
  'scope=\"rowgroup\"':2,
  'role=\"region\"':1,
  'aria-label=\"Package comparison\"':1,
  'tabindex=\"0\"':1
};
for(const [s,n] of Object.entries(need)){
  const c=(h.split(s).length-1);
  if(c<n)throw new Error(s+' appears '+c+' times, expected at least '+n);
}
const rows=(h.match(/<th scope=\"row\">/g)||[]).length;
if(rows!==14)throw new Error('feature rows: '+rows+', expected 14');
const inc=(h.match(/Included</g)||[]).length;
if(inc<1)throw new Error('no visually-hidden Included text');
console.log('ok, feature rows:',rows);
"
```

Expected: `ok, feature rows: 14`.

- [ ] **Step 4: Keyboard-check the scroll region**

Run `npm run preview`, open `/packages/`, narrow the window until the table overflows, and press Tab until focus lands on the table container. Expected: the focus ring appears around the scroll region and the left/right arrow keys scroll it.

- [ ] **Step 5: Commit**

```bash
git add src/pages/packages.astro
git commit -m "feat: add the package comparison table

Real table semantics, visually-hidden Included/Not included text, and
a keyboard-reachable scroll region on narrow screens.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017DWwHn2MN9zCJYmixdNzCz"
```

---

### Task 5.4: Add-ons and the scope FAQ

**Files:**
- Modify: `src/pages/packages.astro` (replace the `<!-- Bands 5 and 6 -->` comment)

**Interfaces:**
- Consumes: `packages.addOns {heading, items[], upgradeRule}`, `packages.scopeFaq {heading, topics[], moreLabel, moreHref}` (Task 2.3), and `faq.json`'s `topic` slugs (Task 2.5).
- Produces: nothing later tasks depend on. **These five questions render visually here but emit no `FAQPage` JSON-LD.** Duplicating `FAQPage` markup across two URLs sends conflicting canonical signals for the same Q&A set. `/faq/` is the one canonical home for that schema (Task 6.2).

- [ ] **Step 1: Add the FAQ lookup to the page frontmatter**

Append to `packages.astro`'s frontmatter:

```ts
import faq from '../data/faq.json';

const allFaqItems = faq.groups.flatMap((g) => g.items);
const scopeItems = packages.scopeFaq.topics.map((topic) => {
  const item = allFaqItems.find((i) => i.topic === topic);
  if (!item) throw new Error(`packages.json scopeFaq references unknown FAQ topic: ${topic}`);
  return item;
});
```

The thrown error is deliberate: a broken slug fails the build loudly instead of silently rendering four questions where five were intended.

- [ ] **Step 2: Replace the `<!-- Bands 5 and 6 … -->` comment**

```astro
  <section class="section section-alt">
    <div class="container">
      <h2>{packages.addOns.heading}</h2>
      <dl class="add-ons">
        {packages.addOns.items.map((item) => (
          <div class="add-on">
            <dt>
              {item.name}
              <span class="add-on-price muted price">{item.price}</span>
            </dt>
            <dd class="muted">{item.note}</dd>
          </div>
        ))}
      </dl>
      <p class="upgrade-rule">{packages.addOns.upgradeRule}</p>
    </div>
  </section>

  <section class="section">
    <div class="container">
      <h2>{packages.scopeFaq.heading}</h2>
      <div class="scope-faq">
        {scopeItems.map((item) => (
          <details class="faq-item">
            <summary>
              <span>{item.q}</span>
              <span class="marker" aria-hidden="true"></span>
            </summary>
            <p class="answer muted">{item.a}</p>
          </details>
        ))}
      </div>
      <p>
        <a class="link-arrow" href={packages.scopeFaq.moreHref}>{packages.scopeFaq.moreLabel} &rarr;</a>
      </p>
    </div>
  </section>
```

- [ ] **Step 3: Add the scoped styles**

Append to the page's `<style>` block. The add-ons are **deliberately secondary**: no cards, no columns, no pricing emphasis. Clients should not need to assemble their own website package.

```css
  .add-ons { margin: var(--space-3) 0 0; max-width: var(--maxw-prose); }
  .add-on { padding: var(--space-2) 0; border-bottom: 1px solid var(--color-border); }
  .add-on dt { font-size: var(--step--1); font-weight: 600; display: flex; flex-wrap: wrap; gap: var(--space-2); justify-content: space-between; }
  .add-on-price { font-weight: 400; }
  .add-on dd { margin: var(--space-0) 0 0; font-size: var(--step--1); }

  .upgrade-rule { margin-top: var(--space-4); max-width: var(--maxw-lead); font-size: var(--step-1); }

  .scope-faq { display: grid; gap: var(--space-2); margin: var(--space-3) 0 var(--space-3); max-width: var(--maxw-prose); }
  .faq-item { border-bottom: 1px solid var(--color-border); }
  .faq-item summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    padding: var(--space-3) 0;
    min-height: 44px;
    font-weight: 600;
    cursor: pointer;
    list-style: none;
  }
  .faq-item summary::-webkit-details-marker { display: none; }
  .faq-item[open] summary { color: var(--color-brand); }
  .marker { position: relative; flex: 0 0 auto; width: 14px; height: 14px; }
  .marker::before,
  .marker::after { content: ""; position: absolute; background: currentColor; transition: opacity 120ms ease; }
  .marker::before { top: 6px; left: 0; width: 14px; height: 2px; }
  .marker::after { top: 0; left: 6px; width: 2px; height: 14px; }
  .faq-item[open] .marker::after { opacity: 0; }
  .answer { margin: 0; padding-bottom: var(--space-3); }
```

`upgradeRule` is the SOP's tier-protection rule turned into a trust signal. **Do not put the internal version on the site.** "Tier 1 clients cannot add keyword research à la carte" is a scope control; on a public page it reads as restriction, and the one-sentence version conveys the same boundary as generosity.

- [ ] **Step 4: Verify**

```bash
npm run build && npx astro check
node -e "
const fs=require('fs');
const h=fs.readFileSync('dist/packages/index.html','utf8');
const addons=(h.match(/<div class=\"add-on\">/g)||[]).length;
if(addons!==5)throw new Error('add-ons: '+addons);
const q=(h.match(/<details class=\"faq-item\">/g)||[]).length;
if(q!==5)throw new Error('scope FAQ items: '+q);
if(h.includes('FAQPage'))throw new Error('FAQPage schema must live only on /faq/');
console.log('ok');
"
grep -o '\$180 per page\|\$270 per page\|\$90 an hour\|Custom quote' dist/packages/index.html | sort -u
grep -riE 'à la carte|tier protection|cannot add|not sold as' dist/packages/index.html   # expect: no output
```

Expected: `ok`, all four price strings present, last grep silent.

- [ ] **Step 5: Commit**

```bash
git add src/pages/packages.astro
git commit -m "feat: add the add-on menu and scope FAQ

Add-ons render as a plain definition list on the sand band, never as
cards. The five scope questions come from faq.json by topic slug, so
there is one copy of each answer.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017DWwHn2MN9zCJYmixdNzCz"
```

---

### Task 5.5: `Service` and `Offer` structured data

**Files:**
- Modify: `src/layouts/BaseLayout.astro` (add an optional `jsonLd` prop)
- Modify: `src/pages/packages.astro` (build and pass the graph)

**Interfaces:**
- Consumes: the `ProfessionalService` `@id` `https://www.keepsitemedia.com/#business` from Task 2.1.
- Produces: `BaseLayout`'s `Props` gains `jsonLd?: unknown` — an optional page-level graph rendered as a second `<script type="application/ld+json">` after the site-wide one. Task 6.2 uses the same prop for `FAQPage`.

- [ ] **Step 1: Add the `jsonLd` prop to `BaseLayout.astro`**

Extend the interface:

```ts
interface Props {
  title: string;
  description: string;
  ogImage?: string;
  noindex?: boolean;
  jsonLd?: unknown;
}
```

Extend the destructure:

```ts
const { title, description, ogImage = '/og-default.png', noindex = false, jsonLd } = Astro.props;
```

And add this immediately after the existing site-wide JSON-LD script in `<head>`:

```astro
    {jsonLd && <script type="application/ld+json" set:html={JSON.stringify(jsonLd)} is:inline />}
```

- [ ] **Step 2: Build the graph in `packages.astro`'s frontmatter**

Append after the `scopeItems` block:

```ts
const siteUrl = Astro.site as URL;
const businessId = `${siteUrl}#business`;
const packagesUrl = new URL('/packages/', siteUrl).href;

// Derived from the same strings the page renders, so the structured
// data can never drift from the visible price.
const amount = (display: string) => Number(display.replace(/[^0-9.]/g, '')).toFixed(2);

const packagesJsonLd = {
  '@context': 'https://schema.org',
  '@graph': packages.tiers.map((tier) => ({
    '@type': 'Service',
    '@id': `${packagesUrl}#${tier.id}`,
    name: `${tier.name} website package`,
    description: tier.bestFor,
    serviceType: 'Website design and maintenance',
    url: packagesUrl,
    provider: { '@id': businessId },
    offers: [
      {
        '@type': 'Offer',
        name: `${tier.name} build`,
        category: 'One-time build',
        price: amount(tier.buildPrice),
        priceCurrency: 'USD',
        url: packagesUrl,
      },
      {
        '@type': 'Offer',
        name: `${tier.name} subscription`,
        category: 'Subscription',
        priceCurrency: 'USD',
        url: packagesUrl,
        priceSpecification: {
          '@type': 'UnitPriceSpecification',
          price: amount(tier.monthlyPrice),
          priceCurrency: 'USD',
          billingDuration: 'P1M',
          billingIncrement: 1,
        },
      },
    ],
  })),
};
```

- [ ] **Step 3: Pass it to the layout**

Change the `<BaseLayout …>` opening tag on `packages.astro` to:

```astro
<BaseLayout
  title={packages.meta.title}
  description={packages.meta.description}
  jsonLd={packagesJsonLd}
>
```

- [ ] **Step 4: Verify both graphs parse and the prices match the page**

```bash
npm run build && npx astro check
node -e "
const fs=require('fs');
const h=fs.readFileSync('dist/packages/index.html','utf8');
const blocks=[...h.matchAll(/<script type=\"application\/ld\+json\">([\s\S]*?)<\/script>/g)].map(m=>JSON.parse(m[1]));
if(blocks.length!==2)throw new Error('expected 2 JSON-LD blocks, got '+blocks.length);
const services=blocks[1]['@graph'];
if(services.length!==3)throw new Error('services: '+services.length);
const expect={'presence':['1100.00','55.00'],'search':['1750.00','150.00'],'search-plus':['2000.00','275.00']};
services.forEach(s=>{
  const id=s['@id'].split('#')[1];
  const [b,m]=expect[id];
  if(s.offers[0].price!==b)throw new Error(id+' build price '+s.offers[0].price);
  if(s.offers[1].priceSpecification.price!==m)throw new Error(id+' monthly price '+s.offers[1].priceSpecification.price);
  if(s.provider['@id']!=='https://www.keepsitemedia.com/#business')throw new Error(id+' provider @id');
  if(s.offers[1].priceSpecification.billingDuration!=='P1M')throw new Error(id+' billingDuration');
});
console.log('ok, 3 Service nodes with matching prices');
"
```

Expected: `ok, 3 Service nodes with matching prices`.

```bash
grep -c "FAQPage" dist/packages/index.html   # expect: 0
```

- [ ] **Step 5: Verify no other page picked up a second block**

```bash
node -e "
const fs=require('fs');
for(const p of ['dist/index.html','dist/faq/index.html','dist/start/index.html','dist/404.html']){
  const n=(fs.readFileSync(p,'utf8').match(/application\/ld\+json/g)||[]).length;
  if(n!==1)throw new Error(p+' has '+n+' JSON-LD blocks, expected 1');
}
console.log('ok');
"
```

Expected: `ok`.

- [ ] **Step 6: Commit**

```bash
git add src/layouts/BaseLayout.astro src/pages/packages.astro
git commit -m "feat: emit Service and Offer schema for the packages

Prices are derived from the same strings the page renders, so the
markup cannot drift from what a visitor sees.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017DWwHn2MN9zCJYmixdNzCz"
```

---

# Phase 6 — How it works, FAQ, Start

Last phase of the atomic release.

### Task 6.1: How it works page

**Files:**
- Create: `src/pages/how-it-works.astro`

**Interfaces:**
- Consumes: `process.json` (Task 2.4), `ClosingCta` (Task 3.1).
- Produces: the `/how-it-works/` route, already referenced by `site.json`'s nav and by `404.astro`.

- [ ] **Step 1: Create `src/pages/how-it-works.astro`**

The page's real job is answering "how much of *my* time does this take?", which is the actual objection for this audience.

```astro
---
import BaseLayout from '../layouts/BaseLayout.astro';
import ClosingCta from '../components/ClosingCta.astro';
import process from '../data/process.json';

const signature = process.signature as { name: string; role: string } | null;
---
<BaseLayout title={process.meta.title} description={process.meta.description}>

  <section class="section-tight">
    <div class="container">
      <h1>{process.heading}</h1>
      <p class="lead">{process.lead}</p>
    </div>
  </section>

  <section class="section-tight">
    <div class="container">
      <h2 class="visually-hidden">The five steps</h2>
      <ol class="steps">
        {process.steps.map((step) => (
          <li>
            <h3>{step.title}</h3>
            <p class="muted">{step.body}</p>
          </li>
        ))}
      </ol>
      <p class="serif pull-line">{process.pullLine}</p>
    </div>
  </section>

  <section class="section section-alt">
    <div class="container">
      <div class="grid grid-2 expectations">
        <div>
          <h2>{process.needFromYou.heading}</h2>
          <ul>
            {process.needFromYou.items.map((item) => <li>{item}</li>)}
          </ul>
        </div>
        <div>
          <h2>{process.wontHaveTo.heading}</h2>
          <ul>
            {process.wontHaveTo.items.map((item) => <li>{item}</li>)}
          </ul>
        </div>
      </div>

      {signature && (
        <p class="signature">&mdash; {signature.name}, {signature.role}</p>
      )}
    </div>
  </section>

  <ClosingCta
    heading={process.closing.heading}
    sub={process.closing.sub}
    ctaLabel={process.closing.ctaLabel}
    ctaHref={process.closing.ctaHref}
  />

</BaseLayout>

<style>
  .steps { list-style: none; counter-reset: step; padding: 0; margin: 0; max-width: var(--maxw-prose); }
  .steps li {
    counter-increment: step;
    position: relative;
    padding: var(--space-3) 0 var(--space-3) 3.25rem;
    border-top: 1px solid var(--color-border);
  }
  .steps li::before {
    content: counter(step);
    position: absolute;
    left: 0;
    top: var(--space-3);
    width: 2.25rem;
    height: 2.25rem;
    display: grid;
    place-items: center;
    border-radius: 50%;
    background: var(--color-brand-tint);
    color: var(--color-brand);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  .steps h3 { font-size: var(--step-1); margin-bottom: var(--space-0); }
  .steps p { margin: 0; }

  .pull-line {
    margin-top: var(--space-5);
    margin-bottom: 0;
    font-size: var(--step-3);
    color: var(--color-brand);
    max-width: none;
  }

  .expectations ul { padding-left: 1.1rem; margin: 0; }
  .expectations li { margin-bottom: var(--space-2); color: var(--color-muted); }

  .signature { margin-top: var(--space-4); font-size: var(--step-1); font-weight: 600; }
</style>
```

Notes for the executor:
- **`<ol>` with a `counter`, not styled `<div>`s.** The steps are genuinely ordered and screen readers should say so. `list-style: none` on an `<ol>` can drop list semantics in Safari + VoiceOver; the `role="list"` fix is unnecessary here because each `<li>` still carries content, but Task 9.2's screen-reader pass confirms it announces "list, 5 items".
- **`signature` is `null` today**, so the block does not render. The rendering is built anyway, so turning on founder presence later is a data edit.
- **"What you won't have to do" never mentions the old model.** It draws on the brand doc's "No website homework required." and sets up the contrast without arguing with anything.

- [ ] **Step 2: Verify**

```bash
npm run build && npx astro check
ls dist/how-it-works/index.html
node -e "
const fs=require('fs');
const h=fs.readFileSync('dist/how-it-works/index.html','utf8');
const li=(h.match(/<li>\s*<h3>/g)||[]).length;
if(li!==5)throw new Error('steps: '+li);
if(!h.includes('<ol class=\"steps\">'))throw new Error('steps must be an ordered list');
if(h.includes('signature'))throw new Error('signature block should not render while null');
console.log('ok');
"
grep -c "Keep it simple." dist/how-it-works/index.html   # expect: 1
grep -riE '\bI\b |\bmy \b|hourly|GitHub|lock-in' dist/how-it-works/index.html  # expect: no output
```

- [ ] **Step 3: Commit**

```bash
git add src/pages/how-it-works.astro
git commit -m "feat: add the how-it-works page

Answers the real objection for this audience: how much of my time
does this take. Five steps, and most of them are ours.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017DWwHn2MN9zCJYmixdNzCz"
```

---

### Task 6.2: Rewrite the FAQ page and emit `FAQPage`

**Files:**
- Modify: `src/pages/faq.astro` (full replacement)

**Interfaces:**
- Consumes: `faq.json` (Task 2.5), `BaseLayout`'s `jsonLd` prop (Task 5.5), `ClosingCta` (Task 3.1).
- Produces: the **only** `FAQPage` graph on the site.

- [ ] **Step 1: Replace `src/pages/faq.astro` in full**

The `<details>`/`<summary>` accordion stays: it is keyboard-native, needs no JavaScript, and is genuinely good. The `+`/`−` marker stays too. Only the groups, the copy, and the chrome change.

```astro
---
import BaseLayout from '../layouts/BaseLayout.astro';
import ClosingCta from '../components/ClosingCta.astro';
import faq from '../data/faq.json';

const siteUrl = Astro.site as URL;
const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  '@id': `${new URL('/faq/', siteUrl).href}#faq`,
  mainEntity: faq.groups.flatMap((group) =>
    group.items.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: item.a },
    })),
  ),
};
---
<BaseLayout title={faq.meta.title} description={faq.meta.description} jsonLd={faqJsonLd}>

  <section class="section-tight">
    <div class="container">
      <h1>Frequently asked questions</h1>
      <p class="lead">{faq.intro}</p>
    </div>
  </section>

  <section class="section-tight">
    <div class="container">
      <div class="faq-groups">
        {faq.groups.map((group) => (
          <div class="faq-group">
            <h2>{group.title}</h2>
            <div class="faq-list">
              {group.items.map((item) => (
                <details class="faq-item" id={item.topic}>
                  <summary>
                    <span>{item.q}</span>
                    <span class="marker" aria-hidden="true"></span>
                  </summary>
                  <p class="answer muted">{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  </section>

  <ClosingCta
    heading={faq.closing.heading}
    sub={faq.closing.sub}
    ctaLabel={faq.closing.ctaLabel}
    ctaHref={faq.closing.ctaHref}
  />

</BaseLayout>

<style>
  .faq-groups { display: grid; gap: var(--space-5); max-width: var(--maxw-prose); }
  .faq-group h2 { margin-bottom: var(--space-2); }
  .faq-list { display: grid; }

  .faq-item { border-bottom: 1px solid var(--color-border); scroll-margin-top: 6rem; }
  .faq-item:first-child { border-top: 1px solid var(--color-border); }
  .faq-item summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    padding: var(--space-3) 0;
    min-height: 44px;
    font-weight: 600;
    cursor: pointer;
    list-style: none;
    transition: color 120ms ease;
  }
  .faq-item summary::-webkit-details-marker { display: none; }
  .faq-item summary:hover { color: var(--color-brand); }
  .faq-item[open] summary { color: var(--color-brand); }

  .marker { position: relative; flex: 0 0 auto; width: 14px; height: 14px; }
  .marker::before,
  .marker::after { content: ""; position: absolute; background: currentColor; transition: opacity 120ms ease; }
  .marker::before { top: 6px; left: 0; width: 14px; height: 2px; }
  .marker::after { top: 0; left: 6px; width: 2px; height: 14px; }
  .faq-item[open] .marker::after { opacity: 0; }

  .answer { margin: 0; padding-bottom: var(--space-3); }
</style>
```

The `id={item.topic}` on each `<details>` gives every answer a linkable anchor, which is useful when replying to an inquiry.

- [ ] **Step 2: Verify the schema**

```bash
npm run build && npx astro check
node -e "
const fs=require('fs');
const h=fs.readFileSync('dist/faq/index.html','utf8');
const blocks=[...h.matchAll(/<script type=\"application\/ld\+json\">([\s\S]*?)<\/script>/g)].map(m=>JSON.parse(m[1]));
if(blocks.length!==2)throw new Error('JSON-LD blocks: '+blocks.length);
const f=blocks[1];
if(f['@type']!=='FAQPage')throw new Error('type: '+f['@type']);
if(f.mainEntity.length!==20)throw new Error('questions: '+f.mainEntity.length);
f.mainEntity.forEach(q=>{
  if(!q.name||!q.acceptedAnswer.text)throw new Error('empty question or answer');
});
console.log('ok, 20 questions in FAQPage');
"
```

Expected: `ok, 20 questions in FAQPage`.

- [ ] **Step 3: Verify the page content and anchors**

```bash
grep -o 'id="what-monthly-covers"\|id="locked-in"\|id="domain-owner"' dist/faq/index.html
grep -o "<h2" dist/faq/index.html | wc -l   # expect: 6 (5 group headings + the closing CTA)
grep -o "<details" dist/faq/index.html | wc -l   # expect: 20
grep -riE 'no lock-in|\\\$0|nothing to pay|GitHub|repository|hand(ed)? over|\\\$500|\\\$750' dist/faq/index.html
```

Expected: three anchors printed, last grep silent.

- [ ] **Step 4: Confirm the accordion still works without JavaScript**

Run `npm run preview`, open `/faq/` with JavaScript disabled in the browser, and click a question. Expected: it expands. `<details>` is native, so nothing here depends on script.

```bash
grep -c 'application/ld+json' dist/faq/index.html   # expect: 2
grep -c '<script' dist/faq/index.html               # expect: 2
```

Expected: `2` and `2` — both are JSON-LD. No behavioral JavaScript on the page.

- [ ] **Step 5: Commit**

```bash
git add src/pages/faq.astro
git commit -m "feat: rebuild the FAQ page and add FAQPage schema

One canonical home for the Q&A schema. The packages page shows five
of the same answers but emits no duplicate markup.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017DWwHn2MN9zCJYmixdNzCz"
```

---

### Task 6.3: Start page and the real thanks page

**Files:**
- Modify: `src/pages/start/index.astro` (full replacement)
- Create: `src/pages/start/thanks.astro`

**Interfaces:**
- Consumes: `site.json` (email), `packages.json` (tier ids and names), `.field` / `.field-hint` from Task 1.1.
- Produces: `/start/` and `/start/thanks/`. The Netlify form keeps `name="inquiry"` so existing notification config is not orphaned. The tier-prefill links `/start/?tier=<id>` are already emitted by Task 5.1's tier cards; the ids are `presence`, `search`, `search-plus`.

- [ ] **Step 1: Replace `src/pages/start/index.astro` in full**

```astro
---
import BaseLayout from '../../layouts/BaseLayout.astro';
import site from '../../data/site.json';
import packages from '../../data/packages.json';
---
<BaseLayout
  title="Start your site | Keepsite Media"
  description="Tell us about your business and we'll get back to you with a recommendation. No sales call required."
>
  <section class="section">
    <div class="container narrow">
      <h1>Start your site</h1>
      <p class="lead">
        Tell us a bit about your business. We'll reply with a recommendation and what it would cost.
        No sales call required.
      </p>
      <p class="required-note muted">Fields marked Required have to be filled in.</p>

      <form
        name="inquiry"
        method="POST"
        data-netlify="true"
        data-netlify-honeypot="bot-field"
        action="/start/thanks/"
        class="inquiry-form"
      >
        <input type="hidden" name="form-name" value="inquiry" />
        <p class="hidden-field">
          <label>Don't fill this out: <input name="bot-field" /></label>
        </p>

        <label class="field">
          <span>Your name <span class="field-hint">Required</span></span>
          <input type="text" name="name" required autocomplete="name" />
        </label>

        <label class="field">
          <span>Email <span class="field-hint">Required</span></span>
          <input type="email" name="email" required autocomplete="email" />
        </label>

        <label class="field">
          <span>Business name <span class="field-hint">Required</span></span>
          <input type="text" name="business" required autocomplete="organization" />
        </label>

        <label class="field">
          <span>Website, if you have one</span>
          <input type="url" name="website" autocomplete="url" placeholder="https://" />
        </label>

        <label class="field">
          <span>Which package are you thinking about?</span>
          <select name="package">
            <option value="Not sure yet" selected>Not sure yet</option>
            {packages.tiers.map((tier) => <option value={tier.name}>{tier.name}</option>)}
          </select>
        </label>

        <label class="field">
          <span>What does your business do? <span class="field-hint">Required</span></span>
          <textarea name="about" rows="4" required aria-describedby="about-hint"></textarea>
          <span class="field-hint" id="about-hint">What you do, who you do it for, and roughly where.</span>
        </label>

        <label class="field">
          <span>Anything else?</span>
          <textarea name="notes" rows="3"></textarea>
        </label>

        <p class="reply-time muted">We usually reply within one business day.</p>
        <button type="submit" class="btn">Send</button>
      </form>

      <p class="fallback muted">
        Would rather email? <a href={`mailto:${site.email}`}>{site.email}</a>
      </p>
    </div>
  </section>
</BaseLayout>

<script is:inline>
  // Preselects the tier when a package card links here with ?tier=.
  // Without JS the select simply stays on "Not sure yet".
  (function () {
    var wanted = new URLSearchParams(window.location.search).get('tier');
    if (!wanted) return;
    var select = document.querySelector('select[name="package"]');
    if (!select) return;
    for (var i = 0; i < select.options.length; i++) {
      var slug = select.options[i].value.toLowerCase().replace(/\s+/g, '-');
      if (slug === wanted.toLowerCase()) { select.selectedIndex = i; return; }
    }
  })();
</script>

<style>
  .required-note { font-size: var(--step--1); }
  .inquiry-form { margin-top: var(--space-4); }
  .hidden-field { display: none; }
  .reply-time { margin-bottom: var(--space-2); font-size: var(--step--1); }
  .fallback { margin-top: var(--space-4); font-size: var(--step--1); }
</style>
```

What changed and why:
- **The old `<select>` had `"Static site ($500)"` and `"Static + DecapCMS ($750)"` hard-coded in the markup**, not in a data file. A data-file-only rewrite would have left the old prices live in the inquiry form. The options now come from `packages.json`.
- **"Not sure yet" is the default and is listed first as a legitimate answer**, not a fallback. Forcing a tier choice at first contact contradicts "does not turn every recommendation into an upsell".
- **`action="/start/thanks/"` replaces the `?success=1` toggle.** Netlify Forms handles the POST and redirects there. That deletes the page's only behavioral script, gives a shareable success URL, works with JavaScript disabled, and makes the confirmation a real page.
- **The tier-prefill script is the one script kept on a content page.** It is about 300 bytes and removes a step for a visitor who has already decided.
- **`name="inquiry"` is unchanged**, so existing Netlify notification config is not orphaned.
- Voice: "Tell us", "we'll reply". The old page said "Tell me what you have in mind and I'll reply to you myself."

- [ ] **Step 2: Create `src/pages/start/thanks.astro`**

```astro
---
import BaseLayout from '../../layouts/BaseLayout.astro';
import site from '../../data/site.json';
---
<BaseLayout
  title="Thanks | Keepsite Media"
  description="We got your message and we'll reply within one business day."
  noindex={true}
>
  <section class="section">
    <div class="container narrow">
      <h1>Thanks, we've got it.</h1>
      <p class="lead">
        We'll reply within one business day, usually sooner. If it's easier, you can also reach us at
        <a href={`mailto:${site.email}`}>{site.email}</a>.
      </p>
      <p class="serif pull-line">Keep your business moving.</p>
      <p><a class="link-arrow" href="/">Back to the homepage &rarr;</a></p>
    </div>
  </section>
</BaseLayout>

<style>
  .pull-line { margin: var(--space-5) 0 var(--space-4); font-size: var(--step-3); color: var(--color-brand); }
</style>
```

- [ ] **Step 3: Verify**

```bash
npm run build && npx astro check
ls dist/start/index.html dist/start/thanks/index.html
grep -o 'action="/start/thanks/"' dist/start/index.html
grep -o 'name="inquiry"' dist/start/index.html | head -1
grep -o 'noindex,follow' dist/start/thanks/index.html
grep -riE '\\\$500|\\\$750|success=1|Thanks, I got|I.ll reply' dist/start/  # expect: no output
grep -c "keepsitemedia@gmail.com" dist/start/index.html   # expect: at least 1
```

- [ ] **Step 4: Verify the select options and the honeypot**

```bash
node -e "
const fs=require('fs');
const h=fs.readFileSync('dist/start/index.html','utf8');
const opts=[...h.matchAll(/<option value=\"([^\"]+)\"/g)].map(m=>m[1]);
if(opts.join('|')!=='Not sure yet|Presence|Search|Search Plus')throw new Error('options: '+opts.join('|'));
if(!h.includes('data-netlify-honeypot=\"bot-field\"'))throw new Error('honeypot missing');
if(!h.includes('aria-describedby=\"about-hint\"'))throw new Error('hint not bound');
const scripts=(h.match(/<script/g)||[]).length;
if(scripts!==2)throw new Error('scripts: '+scripts+' (expected JSON-LD + tier prefill)');
console.log('ok');
"
```

Expected: `ok`.

- [ ] **Step 5: Test the tier prefill by hand**

```bash
npm run preview
```

Open `http://localhost:4321/start/?tier=search-plus`. Expected: the package select shows **Search Plus**. Open `/start/` with no query. Expected: **Not sure yet**. Disable JavaScript and reload `/start/?tier=search`. Expected: **Not sure yet**, and the form still submits.

- [ ] **Step 6: Note the Netlify Forms re-detection requirement**

The form's field set changed (`project-type` and `message` are gone; `business`, `website`, `package`, `about`, `notes` are new). Netlify re-detects forms from the deployed static HTML at deploy time, so after the branch deploy:

1. Confirm the `inquiry` form still appears under **Netlify → Forms**.
2. Confirm the email notification survived, and that its recipient is **keepsitemedia@gmail.com**, not the old address.
3. Submit a real test from the deploy preview and confirm it lands in Forms and in the inbox.

Task 9.2 repeats this against production. Do not skip it: a silently orphaned notification means inquiries go nowhere.

- [ ] **Step 7: Commit**

```bash
git add src/pages/start
git commit -m "feat: rebuild the inquiry form and add a thanks page

Replaces the ?success=1 JS toggle with a real /start/thanks/ page and
pulls the package options from packages.json, so the old $500/$750
strings can't survive in the form markup.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017DWwHn2MN9zCJYmixdNzCz"
```

---

### Task 6.4: Residue sweep and the branch gate

**Files:**
- Modify: `netlify.toml` (extend the Lighthouse audit paths to the final route set)

**Interfaces:**
- Consumes: everything from Phases 2-6.
- Produces: the go/no-go for promoting `brand-transition` to production.

- [ ] **Step 1: Extend the Lighthouse audit paths**

Replace the two `[[plugins.inputs.audits]]` blocks in `netlify.toml` with five, covering the final routes:

```toml
  [[plugins.inputs.audits]]
    path = "index.html"
    [plugins.inputs.audits.thresholds]
      performance = 1.0
      accessibility = 1.0
      best-practices = 1.0
      seo = 1.0

  [[plugins.inputs.audits]]
    path = "packages/index.html"
    [plugins.inputs.audits.thresholds]
      performance = 1.0
      accessibility = 1.0
      best-practices = 1.0
      seo = 1.0

  [[plugins.inputs.audits]]
    path = "how-it-works/index.html"
    [plugins.inputs.audits.thresholds]
      performance = 1.0
      accessibility = 1.0
      best-practices = 1.0
      seo = 1.0

  [[plugins.inputs.audits]]
    path = "faq/index.html"
    [plugins.inputs.audits.thresholds]
      performance = 1.0
      accessibility = 1.0
      best-practices = 1.0
      seo = 1.0

  [[plugins.inputs.audits]]
    path = "start/index.html"
    [plugins.inputs.audits.thresholds]
      performance = 1.0
      accessibility = 1.0
      best-practices = 1.0
      seo = 1.0
```

- [ ] **Step 2: Clean build**

```bash
rm -rf dist
npm run check && npm run build
```

Expected: check 0 errors 0 warnings, build exit 0.

- [ ] **Step 3: Run the residue sweep**

This is the acceptance test for "no old-model residue anywhere".

```bash
grep -ri "no lock-in\|\$0 a month\|nothing to pay\|\$500\|\$750\|snic9004" src/ dist/ README.md
```

Expected: **no output**. If anything matches, it must be fixed before this task is complete. There is no acceptable exception.

- [ ] **Step 4: Run the wider residue sweep**

```bash
grep -riE 'you own|own(ership)? of the (code|site)|hand(ed|s)? over|GitHub repo|Netlify account|free tier|per hour|hourly|Portfolio|Get in touch|Static \+ DecapCMS' src/ dist/
```

Expected: no output. Two known false-positive sources to check if this fires: `README.md` is not in this grep, and `public/admin/config.yml` is rewritten in Task 8.1. If the only hits are in `public/admin/config.yml` or `dist/admin/config.yml`, note them and continue; anything else is a real leak.

- [ ] **Step 5: Verify the route set**

```bash
for p in index.html packages/index.html how-it-works/index.html faq/index.html start/index.html start/thanks/index.html 404.html robots.txt sitemap-index.xml og-default.png; do
  test -f "dist/$p" && echo "ok   $p" || echo "MISS $p"
done
for p in pricing contact portfolio work; do
  test -e "dist/$p" && echo "UNEXPECTED $p" || echo "ok   no $p"
done
```

Expected: every line starts `ok`. `/work/` correctly does not exist, because the collection is empty.

- [ ] **Step 6: Verify one `<h1>` per page and no skipped levels**

```bash
node -e "
const fs=require('fs');
const pages=['index.html','packages/index.html','how-it-works/index.html','faq/index.html','start/index.html','start/thanks/index.html','404.html'];
for(const p of pages){
  const h=fs.readFileSync('dist/'+p,'utf8');
  const h1=(h.match(/<h1[ >]/g)||[]).length;
  if(h1!==1)throw new Error(p+' has '+h1+' h1 elements');
  const levels=[...h.matchAll(/<h([1-6])[ >]/g)].map(m=>Number(m[1]));
  for(let i=1;i<levels.length;i++){
    if(levels[i]>levels[i-1]+1)throw new Error(p+' skips from h'+levels[i-1]+' to h'+levels[i]);
  }
  if(!h.includes('id=\"main\"'))throw new Error(p+' missing main landmark');
  if(!h.includes('rel=\"canonical\"'))throw new Error(p+' missing canonical');
}
console.log('ok, '+pages.length+' pages');
"
```

Expected: `ok, 7 pages`.

- [ ] **Step 7: Check every internal link resolves**

```bash
node -e "
const fs=require('fs'),path=require('path');
const files=[];
(function walk(d){for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name);e.isDirectory()?walk(p):e.name.endsWith('.html')&&files.push(p);}})('dist');
const bad=[];
for(const f of files){
  const html=fs.readFileSync(f,'utf8');
  for(const m of html.matchAll(/href=\"(\/[^\"#?]*)/g)){
    const href=m[1];
    if(href.startsWith('/_astro/'))continue;
    const candidates=[path.join('dist',href),path.join('dist',href,'index.html'),path.join('dist',href.replace(/\/\$/,'')+'.html')];
    if(!candidates.some(c=>fs.existsSync(c)))bad.push(f+' -> '+href);
  }
}
if(bad.length)throw new Error('broken internal links:\n'+bad.join('\n'));
console.log('ok, '+files.length+' pages, no broken internal links');
"
```

Expected: `ok, 7 pages, no broken internal links`. Every `/packages/`, `/how-it-works/`, `/faq/`, `/start/` link in the nav, the 404 page, and every closing CTA now resolves.

- [ ] **Step 8: Verify zero behavioral JavaScript**

```bash
node -e "
const fs=require('fs');
const expect={'index.html':1,'packages/index.html':2,'how-it-works/index.html':1,'faq/index.html':2,'start/index.html':2,'start/thanks/index.html':1,'404.html':1};
for(const [p,n] of Object.entries(expect)){
  const c=(fs.readFileSync('dist/'+p,'utf8').match(/<script/g)||[]).length;
  if(c!==n)throw new Error(p+' has '+c+' script tags, expected '+n);
}
console.log('ok');
"
```

Expected: `ok`. Every count is JSON-LD except the one tier-prefill script on `/start/`.

- [ ] **Step 9: Commit and open the deploy preview**

```bash
git add netlify.toml
git commit -m "chore: audit the final route set with Lighthouse

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017DWwHn2MN9zCJYmixdNzCz"
git push -u origin brand-transition
```

Open a pull request from `brand-transition` to `main`. Netlify builds a deploy preview. **Do not merge yet.** Walk the preview in a browser end to end, then run the Netlify Forms checks from Task 6.3 Step 6 against the preview. When both pass, merge and deploy to production.

**Release checkpoint.** Phases 2-6 go live together. The positioning is now fully replaced and there is no half-migrated state.

---

# Phase 7 — Work

Post-launch, on `main`. Ships dormant and activates on the first real project with no code change.

### Task 7.1: Work card and the conditional route

**Files:**
- Create: `src/components/WorkCard.astro`
- Create: `src/pages/work/[...path].astro`
- Delete: `src/components/ProjectCard.astro`

**Interfaces:**
- Consumes: the `work` collection from Task 2.6, `ClosingCta` from Task 3.1.
- Produces: `WorkCard.astro` with `interface Props { entry: CollectionEntry<'work'> }`. Task 7.2's homepage strip uses the same component with the same prop.
- Produces: `/work/`, generated **only** when the collection is non-empty. `getStaticPaths()` returning `[]` emits no page at all, so the route simply does not exist until there is real work. No dead route, no "coming soon", no lie.

- [ ] **Step 1: Delete the old card**

```bash
git rm src/components/ProjectCard.astro
```

- [ ] **Step 2: Create `src/components/WorkCard.astro`**

```astro
---
import type { CollectionEntry } from 'astro:content';

interface Props {
  entry: CollectionEntry<'work'>;
}
const { entry } = Astro.props;
const { title, url, tier, job, screenshot } = entry.data;
---
<a class="work-card card" href={url} target="_blank" rel="noopener noreferrer">
  <img
    class="work-shot"
    src={screenshot}
    alt={`The ${title} website`}
    width="1200"
    height="750"
    loading="lazy"
    decoding="async"
  />
  <p class="work-tier">{tier}</p>
  <h3 class="work-title">{title}</h3>
  <p class="work-job muted">{job}</p>
  <span class="work-visit">Visit site &rarr;</span>
</a>

<style>
  .work-card { display: block; text-decoration: none; color: var(--color-ink); }
  .work-card:hover { border-color: var(--color-ink); color: var(--color-ink); }
  .work-card:hover .work-title { text-decoration: underline; text-underline-offset: 0.2em; }

  .work-shot {
    display: block;
    width: 100%;
    aspect-ratio: 1200 / 750;
    object-fit: cover;
    border: 1px solid var(--color-border);
    border-radius: calc(var(--radius) - 3px);
    margin-bottom: var(--space-2);
    background: var(--color-surface-alt);
  }

  .work-tier {
    display: inline-block;
    margin: 0 0 var(--space-1);
    padding: 0.15rem 0.55rem;
    border-radius: 999px;
    background: var(--color-brand-tint);
    color: var(--color-brand);
    font-size: var(--step--1);
    font-weight: 600;
  }
  .work-title { font-size: var(--step-1); margin-bottom: var(--space-0); }
  .work-job { margin-bottom: var(--space-2); }
  .work-visit { color: var(--color-brand); font-weight: 600; }
</style>
```

The old `ProjectCard` lifted 3px and grew a shadow on hover. Under the motion policy the card darkens its border and underlines the title instead.

Explicit `width` and `height` plus `aspect-ratio` mean the image reserves its space before it loads, so adding real work does not reintroduce layout shift.

- [ ] **Step 3: Create `src/pages/work/[...path].astro`**

```astro
---
import type { GetStaticPaths } from 'astro';
import { getCollection } from 'astro:content';
import BaseLayout from '../../layouts/BaseLayout.astro';
import ClosingCta from '../../components/ClosingCta.astro';
import WorkCard from '../../components/WorkCard.astro';
import home from '../../data/home.json';

// Returning an empty array emits no page at all, so /work/ does not
// exist until the collection has entries. Adding the first project
// in the CMS makes the page, the nav item, the homepage strip, and
// the sitemap entry appear with no code change.
export const getStaticPaths: GetStaticPaths = async () => {
  const entries = await getCollection('work');
  return entries.length ? [{ params: { path: undefined } }] : [];
};

const entries = (await getCollection('work')).sort((a, b) => a.data.order - b.data.order);
---
<BaseLayout
  title="Work | Keepsite Media"
  description="A few of the sites we've built, and what each one is there to do."
>
  <section class="section-tight">
    <div class="container">
      <h1>Work</h1>
      <p class="lead">A few of the sites we've built, and what each one is there to do.</p>
    </div>
  </section>

  <section class="section-tight">
    <div class="container">
      <h2 class="visually-hidden">Built sites</h2>
      <div class="grid grid-3">
        {entries.map((entry) => <WorkCard entry={entry} />)}
      </div>
    </div>
  </section>

  <ClosingCta
    heading={home.closing.heading}
    sub={home.closing.sub}
    ctaLabel={home.closing.ctaLabel}
    ctaHref={home.closing.ctaHref}
  />
</BaseLayout>
```

- [ ] **Step 4: Verify the route stays dormant with an empty collection**

```bash
npm run build && npx astro check
ls dist/work 2>&1                      # expect: No such file or directory
grep -c "/work/" dist/sitemap-0.xml    # expect: 0
grep -rn "ProjectCard" src/            # expect: no output
```

- [ ] **Step 5: Verify the route activates, then undo**

Create a throwaway entry:

```bash
mkdir -p src/content/work && cat > src/content/work/tmp-check.md <<'MD'
---
title: "Temp Check"
url: "https://example.org"
tier: "Search"
job: "Temporary entry used to prove the conditional route works."
scope: ["One", "Two"]
screenshot: "/images/placeholder.png"
launched: 2026-08-23
featured: true
order: 1
---
MD
npm run build
ls dist/work/index.html          # expect: exists
grep -c "Temp Check" dist/work/index.html   # expect: 1
grep -c "/work/" dist/sitemap-0.xml         # expect: 1
rm src/content/work/tmp-check.md
npm run build
ls dist/work 2>&1                # expect: No such file or directory
```

Expected: the route appears with the entry and disappears without it. Confirm `src/content/work/` contains only `.gitkeep` before committing.

- [ ] **Step 6: Commit**

```bash
git add src/components/WorkCard.astro src/pages/work
git rm src/components/ProjectCard.astro
git commit -m "feat: add the conditional work route

getStaticPaths returns [] while the collection is empty, so /work/
does not exist until there is real work to show.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017DWwHn2MN9zCJYmixdNzCz"
```

---

### Task 7.2: Conditional nav item and homepage strip

**Files:**
- Modify: `src/components/Header.astro` (frontmatter + nav loop)
- Modify: `src/pages/index.astro` (band 6)
- Modify: `README.md` (activation checklist)

**Interfaces:**
- Consumes: `getCollection('work')`, `WorkCard` (Task 7.1), `home.work {heading, linkLabel, linkHref}` (Task 2.2).
- Produces: nothing later tasks depend on.

- [ ] **Step 1: Inject the Work nav item in `Header.astro`**

Replace the frontmatter with:

```ts
import { getCollection } from 'astro:content';
import site from '../data/site.json';

const path = Astro.url.pathname;
const isCurrent = (href: string) =>
  path === href || path.replace(/\/$/, '') === href.replace(/\/$/, '');

// The nav item appears the moment the collection has an entry, which
// is the same guard that generates the route. No code change needed
// to turn it on.
const hasWork = (await getCollection('work')).length > 0;
const navItems = hasWork
  ? [site.nav[0], { label: 'Work', href: '/work/', cta: false }, ...site.nav.slice(1)]
  : site.nav;
```

Then change the loop from `site.nav.map(` to `navItems.map(`. Nothing else in the component changes.

`Work` lands second, right after `Packages`, matching the recommended nav order `Packages · Work · How it works · FAQ` plus the `Start your site` button.

- [ ] **Step 2: Add band 6 to the homepage**

Replace the `<!-- 6: work … -->` comment in `src/pages/index.astro` with:

```astro
  {featuredWork.length >= 2 && (
    <section class="section">
      <div class="container">
        <h2>{home.work.heading}</h2>
        <div class="grid grid-3 work-strip">
          {featuredWork.map((entry) => <WorkCard entry={entry} />)}
        </div>
        <p><a class="link-arrow" href={home.work.linkHref}>{home.work.linkLabel} &rarr;</a></p>
      </div>
    </section>
  )}
```

Add to the page frontmatter:

```ts
import { getCollection } from 'astro:content';
import WorkCard from '../components/WorkCard.astro';

const featuredWork = (await getCollection('work'))
  .filter((entry) => entry.data.featured)
  .sort((a, b) => a.data.order - b.data.order)
  .slice(0, 3);
```

Add to the page's `<style>`:

```css
  .work-strip { margin-top: var(--space-4); }
```

The strip renders only at **two or more** featured entries. One card alone in a three-column band reads as an accident rather than a portfolio.

- [ ] **Step 3: Add the activation checklist to `README.md`**

Append this section, after "Editing content":

```markdown
## Turning on the Work page

`/work/`, its nav item, the homepage strip, and the sitemap entry are all generated from the `work` content collection, which is empty at launch. They appear on the next deploy after the first entry exists. Nothing needs a code change.

Adding the first real project:

1. In `/admin` → **Work** → **New Work**, fill in every field. `Screenshot` wants a 1200×750 image; anything else is cropped to that ratio.
2. Set **Featured** on the first two or three, so the homepage strip has enough cards to look deliberate. The strip renders only at two or more.
3. In `netlify.toml`, change the `/portfolio` redirect target from `to = "/"` to `to = "/work/"` in the same commit. Until `/work/` exists, that redirect has to point at the homepage.
4. Deploy, then confirm `/work/` resolves, the nav shows **Work** second, and `/portfolio` lands on `/work/`.

Never add a project you have not actually built, and never add traffic or ranking numbers to an entry. The schema has no field for them on purpose.
```

- [ ] **Step 4: Verify the dormant state is unchanged**

```bash
npm run build && npx astro check
grep -c ">Work<" dist/index.html      # expect: 0
ls dist/work 2>&1                     # expect: No such file or directory
grep -c "work-strip" dist/index.html  # expect: 0
```

- [ ] **Step 5: Verify the active state, then undo**

```bash
mkdir -p src/content/work
for n in one two; do cat > src/content/work/tmp-$n.md <<MD
---
title: "Temp $n"
url: "https://example.org"
tier: "Presence"
job: "Temporary entry used to prove the nav and strip activate."
scope: ["One", "Two"]
screenshot: "/images/placeholder.png"
launched: 2026-08-23
featured: true
order: 1
---
MD
done
npm run build
grep -c 'href="/work/"' dist/index.html   # expect: at least 2 (nav + strip link)
grep -c "work-strip" dist/index.html      # expect: 1
ls dist/work/index.html                   # expect: exists
rm src/content/work/tmp-one.md src/content/work/tmp-two.md
npm run build
grep -c "work-strip" dist/index.html      # expect: 0
```

Confirm `src/content/work/` contains only `.gitkeep` before committing.

- [ ] **Step 6: Commit**

```bash
git add src/components/Header.astro src/pages/index.astro README.md
git commit -m "feat: activate work nav and strip from the collection

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017DWwHn2MN9zCJYmixdNzCz"
```

---

# Phase 8 — CMS

Post-launch, before handing the owner the keys. Configured against the final data shapes so it is not rewritten twice.

### Task 8.1: Rewrite `public/admin/config.yml`

**Files:**
- Modify: `public/admin/config.yml:1-75` (full replacement)

**Interfaces:**
- Consumes: the final shapes of `site.json`, `home.json`, `packages.json`, `process.json`, `faq.json`, and the `work` collection.
- Produces: an editor UI whose field labels and file bindings match reality. The old config bound `pricing.json` (deleted), and showed an editor labels like "Hourly billing line" and "Ownership note" every day.

- [ ] **Step 1: Replace `public/admin/config.yml` in full**

```yaml
backend:
  name: git-gateway
  branch: main

# Lets `npx decap-server` drive the CMS against the working tree, so
# config changes can be tested without committing to main.
local_backend: true

site_url: https://www.keepsitemedia.com
display_url: https://www.keepsitemedia.com
logo_url: https://www.keepsitemedia.com/og-default.png

media_folder: "public/images"
public_folder: "/images"

collections:
  - name: "settings"
    label: "Site Settings"
    files:
      - name: "site"
        label: "Site & Navigation"
        file: "src/data/site.json"
        fields:
          - { name: "brand", label: "Brand name", widget: "string", required: true }
          - { name: "legalName", label: "Legal name", widget: "string", required: true }
          - { name: "tagline", label: "Tagline", widget: "string", required: true, hint: "Shown in the footer. Currently: Websites for people with other things to do." }
          - { name: "email", label: "Contact email", widget: "string", required: true }
          - { name: "phone", label: "Phone, as displayed", widget: "string", required: true, hint: "Format: (385) 307-8190" }
          - { name: "phoneE164", label: "Phone, for links and search engines", widget: "string", required: true, pattern: ['^\+1[0-9]{10}$', "Must look like +13853078190"] }
          - { name: "areaServed", label: "Service area", widget: "string", required: true }
          - { name: "priceRange", label: "Price range", widget: "string", required: true, hint: "Search engines only. Dollar signs, e.g. $$" }
          - { name: "googleBusinessProfileUrl", label: "Google Business Profile URL", widget: "string", required: false, hint: "Leave empty until the profile is live. Adding it here puts it in the site's structured data." }
          - name: "social"
            label: "Social profiles"
            widget: "list"
            required: false
            fields:
              - { name: "name", label: "Network", widget: "string" }
              - { name: "url", label: "Profile URL", widget: "string" }
          - name: "nav"
            label: "Navigation"
            widget: "list"
            required: true
            fields:
              - { name: "label", label: "Label", widget: "string" }
              - { name: "href", label: "Link", widget: "string", hint: "Include both slashes, e.g. /packages/" }
              - { name: "cta", label: "Show as a button", widget: "boolean", default: false }

      - name: "home"
        label: "Home Page"
        file: "src/data/home.json"
        fields:
          - name: "meta"
            label: "Search listing"
            widget: "object"
            fields:
              - { name: "title", label: "Page title", widget: "string", required: true }
              - { name: "description", label: "Meta description", widget: "text", required: true, hint: "Aim for 150 to 160 characters." }
          - name: "hero"
            label: "Hero"
            widget: "object"
            fields:
              - { name: "headline", label: "Headline", widget: "string", required: true }
              - { name: "sub", label: "Subhead", widget: "text", required: true }
              - name: "primaryCta"
                label: "Primary button"
                widget: "object"
                fields:
                  - { name: "label", label: "Label", widget: "string" }
                  - { name: "href", label: "Link", widget: "string" }
              - name: "secondaryCta"
                label: "Secondary button"
                widget: "object"
                fields:
                  - { name: "label", label: "Label", widget: "string" }
                  - { name: "href", label: "Link", widget: "string" }
          - name: "problem"
            label: "Problem"
            widget: "object"
            fields:
              - { name: "heading", label: "Heading", widget: "string", required: true }
              - { name: "body", label: "Body", widget: "text", required: true }
          - name: "solution"
            label: "Solution"
            widget: "object"
            fields:
              - { name: "heading", label: "Heading", widget: "string", required: true }
              - name: "beats"
                label: "Three beats"
                widget: "list"
                fields:
                  - { name: "title", label: "Title", widget: "string" }
                  - { name: "body", label: "Body", widget: "text" }
              - { name: "pullLine", label: "Serif pull-line", widget: "string", required: true }
          - name: "packages"
            label: "Packages band"
            widget: "object"
            fields:
              - { name: "heading", label: "Heading", widget: "string", required: true }
              - { name: "linkLabel", label: "Link label", widget: "string", required: true }
              - { name: "linkHref", label: "Link", widget: "string", required: true }
          - name: "why"
            label: "Why Keepsite"
            widget: "object"
            fields:
              - { name: "heading", label: "Heading", widget: "string", required: true }
              - name: "pillars"
                label: "Pillars"
                widget: "list"
                fields:
                  - { name: "title", label: "Title", widget: "string" }
                  - { name: "body", label: "Body", widget: "text" }
          - name: "work"
            label: "Work band"
            widget: "object"
            fields:
              - { name: "heading", label: "Heading", widget: "string", required: true }
              - { name: "linkLabel", label: "Link label", widget: "string", required: true }
              - { name: "linkHref", label: "Link", widget: "string", required: true }
          - name: "closing"
            label: "Closing CTA"
            widget: "object"
            fields:
              - { name: "heading", label: "Heading", widget: "string", required: true }
              - { name: "sub", label: "Subhead", widget: "string", required: true }
              - { name: "ctaLabel", label: "Button label", widget: "string", required: true }
              - { name: "ctaHref", label: "Button link", widget: "string", required: true }

      - name: "packages"
        label: "Packages Page"
        file: "src/data/packages.json"
        fields:
          - name: "meta"
            label: "Search listing"
            widget: "object"
            fields:
              - { name: "title", label: "Page title", widget: "string", required: true }
              - { name: "description", label: "Meta description", widget: "text", required: true }
          - { name: "intro", label: "Intro", widget: "text", required: true }
          - name: "tiers"
            label: "Tiers"
            widget: "list"
            required: true
            fields:
              - { name: "id", label: "ID", widget: "string", required: true, pattern: ['^[a-z0-9-]+$', "Lowercase letters, numbers, and hyphens only"], hint: "Used in links like /start/?tier=search. Changing it breaks existing links." }
              - { name: "name", label: "Name", widget: "string", required: true }
              - { name: "line", label: "One-liner", widget: "string", required: true }
              - { name: "bestFor", label: "Best for", widget: "text", required: true }
              - { name: "buildPrice", label: "Build price", widget: "string", required: true, pattern: ['^\$[0-9,]+$', "Format: $1,100"] }
              - { name: "buildPriceNote", label: "Build price note", widget: "string", required: true }
              - { name: "monthlyPrice", label: "Monthly price", widget: "string", required: true, pattern: ['^\$[0-9,]+$', "Format: $55"] }
              - { name: "monthlyPriceNote", label: "Monthly price note", widget: "string", required: true }
              - { name: "cardIncludes", label: "Card bullets (exactly 5)", widget: "list", required: true, field: { name: "line", label: "Bullet", widget: "string" }, hint: "Five, no more. The table below the cards carries the full detail." }
              - { name: "monthlySummary", label: "What this monthly covers", widget: "list", required: true, field: { name: "line", label: "Line", widget: "string" } }
              - { name: "ctaLabel", label: "Button label", widget: "string", required: true }
          - name: "monthly"
            label: "What the monthly covers"
            widget: "object"
            fields:
              - { name: "heading", label: "Heading", widget: "string", required: true }
              - { name: "lead", label: "Lead", widget: "text", required: true }
              - { name: "closing", label: "Closing line", widget: "text", required: true }
              - { name: "subscriptionTerms", label: "Subscription terms", widget: "text", required: true, hint: "Approved copy. Do not reword without checking the terms actually offered." }
          - name: "comparison"
            label: "Comparison rows"
            widget: "list"
            required: true
            fields:
              - { name: "group", label: "Group", widget: "select", options: ["Build", "Monthly"] }
              - { name: "feature", label: "Feature", widget: "string" }
              - { name: "presence", label: "Presence", widget: "string", hint: "Type true for a check, false for a dash, or free text such as 24 a year." }
              - { name: "search", label: "Search", widget: "string", hint: "Type true for a check, false for a dash, or free text such as 24 a year." }
              - { name: "searchPlus", label: "Search Plus", widget: "string", hint: "Type true for a check, false for a dash, or free text such as 24 a year." }
          - name: "addOns"
            label: "Add-ons"
            widget: "object"
            fields:
              - { name: "heading", label: "Heading", widget: "string", required: true }
              - name: "items"
                label: "Add-ons"
                widget: "list"
                fields:
                  - { name: "name", label: "Name", widget: "string" }
                  - { name: "price", label: "Price", widget: "string", hint: "Format: $180 per page" }
                  - { name: "note", label: "What it covers", widget: "text" }
              - { name: "upgradeRule", label: "Upgrade rule", widget: "text", required: true }
          - name: "scopeFaq"
            label: "Scope FAQ"
            widget: "object"
            fields:
              - { name: "heading", label: "Heading", widget: "string", required: true }
              - { name: "topics", label: "FAQ topic slugs", widget: "list", required: true, field: { name: "topic", label: "Topic", widget: "string" }, hint: "Must match a topic on the FAQ page. A slug that doesn't match fails the build." }
              - { name: "moreLabel", label: "Link label", widget: "string", required: true }
              - { name: "moreHref", label: "Link", widget: "string", required: true }
          - name: "closing"
            label: "Closing CTA"
            widget: "object"
            fields:
              - { name: "heading", label: "Heading", widget: "string", required: true }
              - { name: "sub", label: "Subhead", widget: "string", required: true }
              - { name: "ctaLabel", label: "Button label", widget: "string", required: true }
              - { name: "ctaHref", label: "Button link", widget: "string", required: true }

      - name: "process"
        label: "How It Works"
        file: "src/data/process.json"
        fields:
          - name: "meta"
            label: "Search listing"
            widget: "object"
            fields:
              - { name: "title", label: "Page title", widget: "string", required: true }
              - { name: "description", label: "Meta description", widget: "text", required: true }
          - { name: "heading", label: "Heading", widget: "string", required: true }
          - { name: "lead", label: "Lead", widget: "text", required: true }
          - name: "steps"
            label: "Steps"
            widget: "list"
            required: true
            fields:
              - { name: "title", label: "Title", widget: "string" }
              - { name: "body", label: "Body", widget: "text" }
          - { name: "pullLine", label: "Serif pull-line", widget: "string", required: true }
          - name: "needFromYou"
            label: "What we need from you"
            widget: "object"
            fields:
              - { name: "heading", label: "Heading", widget: "string" }
              - { name: "items", label: "Items", widget: "list", field: { name: "item", label: "Item", widget: "text" } }
          - name: "wontHaveTo"
            label: "What you won't have to do"
            widget: "object"
            fields:
              - { name: "heading", label: "Heading", widget: "string" }
              - { name: "items", label: "Items", widget: "list", field: { name: "item", label: "Item", widget: "text" } }
          - name: "signature"
            label: "Signed block"
            widget: "object"
            required: false
            hint: "Leave empty to hide it. Filling it in adds a signed line under the process."
            fields:
              - { name: "name", label: "Name", widget: "string", required: false }
              - { name: "role", label: "Role", widget: "string", required: false }
          - name: "closing"
            label: "Closing CTA"
            widget: "object"
            fields:
              - { name: "heading", label: "Heading", widget: "string", required: true }
              - { name: "sub", label: "Subhead", widget: "string", required: true }
              - { name: "ctaLabel", label: "Button label", widget: "string", required: true }
              - { name: "ctaHref", label: "Button link", widget: "string", required: true }

      - name: "faq"
        label: "FAQ"
        file: "src/data/faq.json"
        fields:
          - name: "meta"
            label: "Search listing"
            widget: "object"
            fields:
              - { name: "title", label: "Page title", widget: "string", required: true }
              - { name: "description", label: "Meta description", widget: "text", required: true }
          - { name: "intro", label: "Intro", widget: "text", required: true }
          - name: "groups"
            label: "Groups"
            widget: "list"
            required: true
            fields:
              - { name: "title", label: "Group title", widget: "string" }
              - name: "items"
                label: "Questions"
                widget: "list"
                fields:
                  - { name: "topic", label: "Topic slug", widget: "string", pattern: ['^[a-z0-9-]+$', "Lowercase letters, numbers, and hyphens only"], hint: "Unique. The packages page pulls five answers by slug." }
                  - { name: "q", label: "Question", widget: "string" }
                  - { name: "a", label: "Answer", widget: "text" }
          - name: "closing"
            label: "Closing CTA"
            widget: "object"
            fields:
              - { name: "heading", label: "Heading", widget: "string", required: true }
              - { name: "sub", label: "Subhead", widget: "string", required: true }
              - { name: "ctaLabel", label: "Button label", widget: "string", required: true }
              - { name: "ctaHref", label: "Button link", widget: "string", required: true }

  - name: "work"
    label: "Work"
    folder: "src/content/work"
    create: true
    extension: "md"
    format: "frontmatter"
    slug: "{{slug}}"
    summary: "{{title}} ({{tier}})"
    fields:
      - { name: "title", label: "Business name", widget: "string", required: true }
      - { name: "url", label: "Live site URL", widget: "string", required: true, hint: "Must start with https://" }
      - { name: "tier", label: "Package", widget: "select", options: ["Presence", "Search", "Search Plus"], required: true }
      - { name: "job", label: "What this site is for", widget: "string", required: true, hint: "One line. What job does this site do for the business?" }
      - { name: "scope", label: "Scope (2 to 4 items)", widget: "list", required: true, field: { name: "item", label: "Item", widget: "string" } }
      - { name: "screenshot", label: "Screenshot", widget: "image", required: true, hint: "1200 x 750. Anything else is cropped to that ratio." }
      - { name: "launched", label: "Launched", widget: "date", format: "YYYY-MM-DD", required: true }
      - { name: "featured", label: "Show on the homepage", widget: "boolean", default: false, required: false }
      - { name: "order", label: "Sort order", widget: "number", default: 0, required: true, value_type: "int" }
      - { name: "body", label: "Notes (optional)", widget: "markdown", required: false }
```

Two rules for whoever maintains this file:
- **`required: true` on every field the templates render unconditionally.** A missing value in a JSON singleton is a build failure, not a graceful degradation.
- **Nothing from the SOP's Part II gets a field.** No labor hours, no `$90/hour` cost basis, no margin notes, no tier-protection language, no operational metrics. If it can be edited in Decap it can be published.

There is deliberately **no editorial workflow**. A single editor does not need PR review and it only adds friction.

- [ ] **Step 2: Verify the config parses and binds to files that exist**

```bash
node -e "
const fs=require('fs');
const y=fs.readFileSync('public/admin/config.yml','utf8');
const files=[...y.matchAll(/file: \"([^\"]+)\"/g)].map(m=>m[1]);
files.forEach(f=>{if(!fs.existsSync(f))throw new Error('config binds a missing file: '+f)});
const folders=[...y.matchAll(/folder: \"([^\"]+)\"/g)].map(m=>m[1]);
folders.forEach(f=>{if(!fs.existsSync(f))throw new Error('config binds a missing folder: '+f)});
if(y.includes('pricing.json'))throw new Error('still binds the deleted pricing.json');
if(y.includes('portfolio'))throw new Error('still references portfolio');
['Hourly billing line','Ownership note','footerNote'].forEach(s=>{if(y.includes(s))throw new Error('old label survives: '+s)});
console.log('ok, bound files:',files.join(', '));
"
```

Expected: `ok, bound files: src/data/site.json, src/data/home.json, src/data/packages.json, src/data/process.json, src/data/faq.json`.

- [ ] **Step 3: Verify no internal content has a field**

```bash
grep -nEi 'labor|margin|hour budget|cost basis|guardrail|tier protection|metric' public/admin/config.yml
```

Expected: no output.

- [ ] **Step 4: Build**

```bash
npm run build && npx astro check
ls dist/admin/config.yml
```

- [ ] **Step 5: Commit**

```bash
git add public/admin/config.yml
git commit -m "feat: rewrite the CMS config for the new data model

Binds the five current JSON files, adds price format validation, and
drops the pricing.json binding and its old field labels.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017DWwHn2MN9zCJYmixdNzCz"
```

---

### Task 8.2: End-to-end CMS edit test

**Files:**
- Modify: `package.json` (add a `cms` script)
- Modify: `README.md` ("Editing content" section)

**Interfaces:**
- Consumes: the config from Task 8.1.
- Produces: `npm run cms` for local CMS work. No template changes.

- [ ] **Step 1: Add the local CMS script**

In `package.json` `"scripts"`, add:

```json
    "cms": "npx decap-server"
```

- [ ] **Step 2: Update the README "Editing content" section**

Replace the whole section (currently "Page copy and settings live in `src/data/*.json`. Portfolio entries are markdown files in `src/content/portfolio/`…") with:

````markdown
## Editing content

Page copy lives in `src/data/*.json`, one file per page: `site.json`, `home.json`, `packages.json`, `process.json`, `faq.json`. Work entries are markdown files in `src/content/work/`. All of it is editable in the browser at `/admin` (DecapCMS) once Identity and Git Gateway are enabled.

**Testing CMS changes locally**, without committing to `main`:

```bash
npm run cms    # terminal 1: starts decap-server on :8081
npm run dev    # terminal 2: starts Astro on :4321
```

Then open `http://localhost:4321/admin/`. `local_backend: true` in `public/admin/config.yml` makes the CMS read and write your working tree instead of the repo, so you can try an edit, see it in `npm run dev`, and throw it away with `git checkout .`.

**Prices live in one place.** `src/data/packages.json` is the only source for every price on the site, including the structured data search engines read. Editing a price there updates the cards, the comparison table, and the schema together.
````

- [ ] **Step 3: Run the local edit test**

```bash
npm run cms      # terminal 1
npm run dev      # terminal 2
```

At `http://localhost:4321/admin/`, work through this list and confirm each one:

1. **Site Settings → Site & Navigation** opens with every field populated, and `Phone, for links and search engines` rejects `385-307-8190` with the message "Must look like +13853078190".
2. **Packages Page → Tiers → Presence → Build price** rejects `1100` and accepts `$1,100`.
3. Change the Presence build price to `$1,150`, save, and confirm `src/data/packages.json` changed on disk. Reload `http://localhost:4321/packages/` and confirm the card, the JSON-LD `Offer`, and nothing else moved.
4. **How It Works → Signed block** is empty and optional, and saving with it empty does not error.
5. **FAQ → Groups** opens all five groups, and each question shows a Topic slug.
6. **Work → New Work** offers Presence / Search / Search Plus in the Package dropdown. Do not save one.
7. Revert everything: `git checkout src/data/`.

- [ ] **Step 4: Verify the tree is clean and the build still passes**

```bash
git status --porcelain src/data/    # expect: no output
npm run build && npx astro check
```

- [ ] **Step 5: Commit**

```bash
git add package.json README.md
git commit -m "chore: document local CMS testing

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017DWwHn2MN9zCJYmixdNzCz"
```

---

# Phase 9 — Verification gate

Sign-off. Nothing new is built here; everything is proven.

### Task 9.1: Automated acceptance gate

**Files:**
- Create: `scripts/verify.mjs`
- Modify: `package.json` (add a `verify` script)

**Interfaces:**
- Consumes: `dist/` from a clean production build.
- Produces: `npm run verify`, a single command that re-runs every structural assertion this plan made, so a future change that breaks one fails loudly.

- [ ] **Step 1: Create `scripts/verify.mjs`**

```js
// Structural acceptance checks against dist/. Run: npm run build && npm run verify
import fs from 'node:fs';
import path from 'node:path';

const fail = [];
const check = (label, fn) => {
  try { fn(); console.log('  ok   ' + label); }
  catch (e) { fail.push(label + ': ' + e.message); console.log('  FAIL ' + label + ': ' + e.message); }
};
const read = (p) => fs.readFileSync(path.join('dist', p), 'utf8');

const PAGES = [
  'index.html',
  'packages/index.html',
  'how-it-works/index.html',
  'faq/index.html',
  'start/index.html',
  'start/thanks/index.html',
  '404.html',
];

console.log('Routes');
check('every expected route is emitted', () => {
  for (const p of [...PAGES, 'robots.txt', 'sitemap-index.xml', 'og-default.png', 'favicon.svg']) {
    if (!fs.existsSync(path.join('dist', p))) throw new Error('missing ' + p);
  }
});
check('renamed routes are gone', () => {
  for (const p of ['pricing', 'contact', 'portfolio']) {
    if (fs.existsSync(path.join('dist', p))) throw new Error('still emitted: ' + p);
  }
});
check('noindex pages are out of the sitemap', () => {
  const s = read('sitemap-0.xml');
  if (s.includes('/start/thanks') || s.includes('/404')) throw new Error('noindex page in sitemap');
});

console.log('Copy residue');
check('no old-model residue', () => {
  const needles = ['no lock-in', '$0 a month', 'nothing to pay', '$500', '$750', 'snic9004'];
  for (const p of PAGES) {
    const h = read(p).toLowerCase();
    for (const n of needles) {
      if (h.includes(n.toLowerCase())) throw new Error(`"${n}" found in ${p}`);
    }
  }
});
check('prices are the new ones', () => {
  const h = read('packages/index.html');
  for (const p of ['$1,100', '$55', '$1,750', '$150', '$2,000', '$275']) {
    if (!h.includes(p)) throw new Error('missing price ' + p);
  }
});
check('no "Most popular" marker', () => {
  const h = read('packages/index.html').toLowerCase();
  if (h.includes('most popular') || h.includes('most chosen')) throw new Error('fabricated popularity claim');
});
check('contact details are correct everywhere', () => {
  const h = read('index.html');
  if (!h.includes('keepsitemedia@gmail.com')) throw new Error('email missing from the footer');
  if (!h.includes('+13853078190')) throw new Error('tel link missing');
  if (!h.includes('Serving Utah')) throw new Error('service area missing');
});

console.log('Structure');
check('one h1 per page, no skipped levels, main and canonical present', () => {
  for (const p of PAGES) {
    const h = read(p);
    const h1 = (h.match(/<h1[ >]/g) || []).length;
    if (h1 !== 1) throw new Error(`${p} has ${h1} h1 elements`);
    const levels = [...h.matchAll(/<h([1-6])[ >]/g)].map((m) => Number(m[1]));
    for (let i = 1; i < levels.length; i++) {
      if (levels[i] > levels[i - 1] + 1) throw new Error(`${p} skips h${levels[i - 1]} to h${levels[i]}`);
    }
    if (!h.includes('id="main"')) throw new Error(p + ' has no main landmark');
    if (!h.includes('rel="canonical"')) throw new Error(p + ' has no canonical');
    if (!h.includes('class="skip-link"')) throw new Error(p + ' has no skip link');
    if (!h.includes('og:image')) throw new Error(p + ' has no og:image');
  }
});
check('noindex only on 404 and thanks', () => {
  for (const p of PAGES) {
    const has = read(p).includes('noindex,follow');
    const should = p === '404.html' || p === 'start/thanks/index.html';
    if (has !== should) throw new Error(`${p} noindex=${has}, expected ${should}`);
  }
});
check('no broken internal links', () => {
  const bad = [];
  for (const p of PAGES) {
    for (const m of read(p).matchAll(/href="(\/[^"#?]*)/g)) {
      const href = m[1];
      if (href.startsWith('/_astro/')) continue;
      const tries = [
        path.join('dist', href),
        path.join('dist', href, 'index.html'),
        path.join('dist', href.replace(/\/$/, '') + '.html'),
      ];
      if (!tries.some((t) => fs.existsSync(t))) bad.push(`${p} -> ${href}`);
    }
  }
  if (bad.length) throw new Error(bad.join(', '));
});

console.log('JavaScript budget');
check('only JSON-LD, plus one tier-prefill script on /start/', () => {
  const expect = {
    'index.html': 1,
    'packages/index.html': 2,
    'how-it-works/index.html': 1,
    'faq/index.html': 2,
    'start/index.html': 2,
    'start/thanks/index.html': 1,
    '404.html': 1,
  };
  for (const [p, n] of Object.entries(expect)) {
    const c = (read(p).match(/<script/g) || []).length;
    if (c !== n) throw new Error(`${p} has ${c} scripts, expected ${n}`);
  }
});

console.log('Structured data');
const ld = (p) =>
  [...read(p).matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));

check('business node is complete and address-free', () => {
  const biz = ld('index.html')[0]['@graph'].find((n) => n['@type'] === 'ProfessionalService');
  if (biz['@id'] !== 'https://www.keepsitemedia.com/#business') throw new Error('@id');
  if (biz.email !== 'keepsitemedia@gmail.com') throw new Error('email');
  if (biz.telephone !== '+13853078190') throw new Error('telephone');
  if (biz.areaServed.name !== 'Utah') throw new Error('areaServed');
  if ('address' in biz) throw new Error('address must be omitted');
});
check('Service prices match the rendered prices', () => {
  const services = ld('packages/index.html')[1]['@graph'];
  const expect = { presence: ['1100.00', '55.00'], search: ['1750.00', '150.00'], 'search-plus': ['2000.00', '275.00'] };
  if (services.length !== 3) throw new Error('services: ' + services.length);
  for (const s of services) {
    const id = s['@id'].split('#')[1];
    const [b, m] = expect[id];
    if (s.offers[0].price !== b) throw new Error(id + ' build ' + s.offers[0].price);
    if (s.offers[1].priceSpecification.price !== m) throw new Error(id + ' monthly ' + s.offers[1].priceSpecification.price);
    if (s.provider['@id'] !== 'https://www.keepsitemedia.com/#business') throw new Error(id + ' provider');
  }
});
check('FAQPage lives only on /faq/', () => {
  const f = ld('faq/index.html')[1];
  if (f['@type'] !== 'FAQPage') throw new Error('faq page type');
  if (f.mainEntity.length !== 20) throw new Error('questions: ' + f.mainEntity.length);
  if (read('packages/index.html').includes('FAQPage')) throw new Error('duplicate FAQPage on /packages/');
});

console.log('Fonts');
check('the preload and the stylesheet request the same file', () => {
  const hits = [...new Set(read('index.html').match(/\/_astro\/instrument-sans-latin-wght-normal\.[A-Za-z0-9_-]+\.woff2/g) || [])];
  if (hits.length !== 1) throw new Error('expected one sans asset URL, got ' + hits.length);
  if (read('index.html').includes('fonts.googleapis.com')) throw new Error('third-party font origin');
});

console.log('');
if (fail.length) {
  console.error(fail.length + ' check(s) failed');
  process.exit(1);
}
console.log('All checks passed.');
```

- [ ] **Step 2: Add the script to `package.json`**

In `"scripts"`, add:

```json
    "verify": "node scripts/verify.mjs"
```

- [ ] **Step 3: Run it against a clean build**

```bash
rm -rf dist
npm run check && npm run build && npm run verify
```

Expected: every line prints `ok`, and the last line is `All checks passed.` Fix anything that fails before continuing; the plan's own tasks already asserted each of these individually, so a failure here means a later task regressed an earlier one.

- [ ] **Step 4: Commit**

```bash
git add scripts/verify.mjs package.json
git commit -m "test: add the structural acceptance check

Re-runs every assertion the transition made, in one command, so a
future change that regresses one fails loudly.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017DWwHn2MN9zCJYmixdNzCz"
```

---

### Task 9.2: Manual acceptance gate

**Files:** none. This task produces a signed-off checklist, not a diff.

**Interfaces:**
- Consumes: the production deploy.
- Produces: the go/no-go on the whole transition.

Work through every item against the **production** URL, not localhost. Record the result of each. Anything that fails goes back to the task that owns it.

- [ ] **Step 1: Lighthouse, all four categories, every route**

In Chrome DevTools → Lighthouse, mobile preset, run against `/`, `/packages/`, `/how-it-works/`, `/faq/`, `/start/`.

Target: **100 / 100 / 100 / 100** on all five. The Netlify Lighthouse plugin enforces this on every deploy, so a failure here means the plugin thresholds are not actually being applied — check the deploy log for the plugin's summary table.

- [ ] **Step 2: Cumulative Layout Shift, and validating the font metrics**

Still in DevTools, Network tab → throttle to **Slow 3G**, disable cache, reload `/`. Watch the hero.

Expected: **CLS = 0** and no visible reflow when Instrument Sans swaps in over the Arial fallback.

If text visibly jumps, the `size-adjust: 106.5%` / `ascent-override: 91.1%` / `descent-override: 23.5%` values in `src/styles/global.css` need adjusting. Method: reload with the fallback forced (block `/_astro/*.woff2` in the Network tab), screenshot the hero, unblock and reload, screenshot again, and compare the line widths. Widen or narrow `size-adjust` until they match, then re-derive the two overrides as `0.970 / size-adjust` and `0.250 / size-adjust`.

- [ ] **Step 3: axe DevTools, every route**

Run the axe DevTools extension on all seven routes including `/start/thanks/` and `/404`.

Expected: **zero violations**. Pay particular attention to the comparison table on `/packages/` (cell headers, the scroll region's accessible name) and to the form on `/start/` (label association, the `aria-describedby` hint).

- [ ] **Step 4: Keyboard-only pass**

With the mouse untouched, on every route:

1. Tab once from page load. Expected: the **Skip to content** link appears with the two-tone focus ring.
2. Activate it. Expected: focus moves into `<main>`.
3. Tab through the header. Expected: every nav item and the CTA button take focus, the ring is clearly visible on both the off-white header and the green button (this is the failure the old green-on-green outline had), and the current page shows the clay underline.
4. On `/faq/` and `/packages/`, open and close accordions with Enter and Space.
5. On `/packages/` at a narrow width, Tab to the comparison table and scroll it with the arrow keys.
6. On `/start/`, complete and submit the whole form from the keyboard.
7. In the deep green closing band, confirm the focus ring inverts and stays visible.

- [ ] **Step 5: Screen reader pass**

With VoiceOver (macOS) or NVDA (Windows):

1. `/packages/` comparison table: navigate by cell. Expected: each cell announces its row and column headers, and included/not-included cells announce "Included" or "Not included", never a bare glyph.
2. `/how-it-works/`: the steps announce as a list of 5 items in order.
3. `/start/`: every field announces its label, required state, and the hint on "What does your business do?".
4. Every page: the landmarks announce as banner, navigation, main, contentinfo.

- [ ] **Step 6: Rich Results and Schema.org validation**

Run all three through [Google's Rich Results Test](https://search.google.com/test/rich-results) and the [Schema.org validator](https://validator.schema.org/):

- `/` — expect `WebSite` and `ProfessionalService` detected, zero errors. No local-business rich result is expected, since there is no address.
- `/packages/` — expect three `Service` items with two `Offer`s each, zero errors.
- `/faq/` — expect `FAQPage` with 20 questions, zero errors.

- [ ] **Step 7: Redirect verification**

```bash
for u in /pricing /pricing/ /contact /contact/ /portfolio; do
  printf '%s -> ' "$u"
  curl -sI "https://www.keepsitemedia.com$u" | awk '/^HTTP|^location/i {printf "%s ", $0}'
  echo
done
```

Expected: `301` on each, with `location: /packages/`, `/packages/`, `/start/`, `/start/`, `/` respectively.

- [ ] **Step 8: Security headers on production**

```bash
curl -sI https://www.keepsitemedia.com/ | grep -iE 'content-security-policy|strict-transport|x-content-type|referrer-policy|permissions-policy|x-frame'
curl -sI https://www.keepsitemedia.com/admin/ | grep -i 'content-security-policy'
```

Expected: all six headers on `/`, and the `/admin/` policy visibly wider (it names `unpkg.com` and `identity.netlify.com`). Then open `/admin/` in a browser and confirm the CMS loads with **zero CSP violations** in the console.

- [ ] **Step 9: Open Graph preview**

Paste the production URLs for `/`, `/packages/`, and `/faq/` into a share-card debugger (LinkedIn Post Inspector or the equivalent).

Expected: the deep green 1200×630 card renders, and the title and description are the page's own, not the old "websites that you own and keep" line. If a stale card shows, force a re-scrape.

- [ ] **Step 10: Live form submission**

1. Submit the real form at `https://www.keepsitemedia.com/start/`.
2. Expected: the browser lands on `/start/thanks/`.
3. Confirm the submission appears under **Netlify → Forms → inquiry** with all seven fields.
4. Confirm the notification email arrived at **keepsitemedia@gmail.com**.
5. Repeat once from `/start/?tier=search` and confirm the stored `package` value is `Search`.

If the form does not appear under Forms, it was not re-detected: redeploy and check that `name="inquiry"` and `data-netlify="true"` are both in the deployed HTML.

- [ ] **Step 11: Final residue sweep against production HTML**

```bash
for u in / /packages/ /how-it-works/ /faq/ /start/ /start/thanks/ /404; do
  curl -s "https://www.keepsitemedia.com$u" \
    | grep -io "no lock-in\|\$0 a month\|nothing to pay\|\$500\|\$750\|snic9004" \
    && echo "RESIDUE at $u"
done
echo "sweep complete"
```

Expected: only `sweep complete`. No `RESIDUE` line.

- [ ] **Step 12: Record the sign-off**

Append the results to the pull request or the deploy notes: Lighthouse scores per route, CLS, axe violation count, the three Rich Results verdicts, the redirect table, and the form test. That record is what makes "Lighthouse 100s" a fact rather than a claim, which matters for a business whose pitch is ongoing competence.

---

# Self-review

Run after the plan is written, before execution. Recorded here so an executor can see what was and was not checked.

**1. Spec coverage.** Every spec section maps to at least one task:

| Spec section | Task(s) |
|---|---|
| §1.2 copy & data inventory | 2.1, 2.2, 2.3, 2.5, 2.6 |
| §1.2 templates inventory | 1.2, 3.1, 4.1, 4.2, 4.3, 5.1, 6.2, 6.3, 7.1 |
| §1.2 config/docs/schema | 0.3, 1.4, 1.5, 4.1, 5.5, 6.2, 8.1 |
| §1.2 search-index hygiene (301s, no announcement page) | 4.1 |
| §2.1 nav design | 2.1, 4.2, 7.2 |
| §2.2 route map and redirects | 4.1, 6.4, 7.2 |
| §2.3 homepage structure | 3.1 |
| §3.1 typography and font loading | 1.1, 1.3, 9.2 |
| §3.2 color and contrast | 1.1 |
| §3.3 spacing and layout | 1.1 |
| §3.4 component language, motion, focus | 1.1, 4.2, 7.1 |
| §3.5 form styling | 1.1, 6.3 |
| §3.6 footer | 4.3 |
| §3.7 delete NodeNetwork | 1.2 |
| §4.1 home content | 2.2, 3.1 |
| §4.3 how it works | 2.4, 6.1 |
| §4.4 work, conditional route, schema | 2.6, 7.1, 7.2 |
| §4.5 FAQ | 2.5, 6.2 |
| §4.6 start + thanks + tier prefill | 6.3 |
| §4.7 404 | 1.4 |
| §5.1-5.7 packages page | 5.1, 5.2, 5.3, 5.4, 5.5 |
| §6.1-6.3 data and CMS model | 2.1-2.6, 8.1, 8.2 |
| §6.4 blog: not at launch | Deliberately unimplemented. See "Deferred" below. |
| §7.1 semantics and landmarks | 1.1, 1.2, 5.3, 6.1 |
| §7.2 meta, canonical, OG | 1.2, 1.4 |
| §7.3 structured data | 2.1, 5.5, 6.2 |
| §7.4 sitemap and robots | 1.4 |
| §7.5 WCAG 2.1 AA | 1.1, 5.3, 6.3, 9.2 |
| §7.6 fonts without shift | 1.3, 9.2 |
| §7.7 404 | 1.4 |
| §7.8 security headers | 1.5, 9.2 |
| §7.9 zero client JS | 1.2, 6.3, 6.4, 9.1 |
| §7.10 astro check clean | 1.2, 1.5 |
| §7.11 Lighthouse gate and link check | 1.5, 6.4, 9.1, 9.2 |
| §8.1 .docx handling and repo privacy | 0.1, 0.3 |
| §8.2 deletions | 0.1, 1.2, 2.6, 5.1, 7.1 |
| §8.3 rewrites | Phases 1-8 |
| §8.4 supersede old specs | 0.3 |
| §9 phase order and the atomic release | Release shape, 2.1, 6.4 |
| Owner decisions 1-5 | Global Constraints, 2.1, 2.3, 5.1, 0.3 |

**Deferred, with reasons:**
- **Blog / notes collection (§6.4).** The spec says explicitly "Not at launch. Define the collection in `content.config.ts` in a later phase and ship the route only when three real posts exist." Nothing in Phases 0-9 requires it, and scaffolding an empty collection now would be YAGNI. When it is wanted, it is the same conditional-route pattern as Task 7.1.
- **The signed block on How it works (§4.3 item 6).** The spec marks it optional, and the owner named no signer. Task 2.4 ships the field and Task 6.1 ships the rendering, so turning it on is a one-line data edit.
- **Google Business Profile URL.** Owner decision 2: in progress, omit at launch. `site.json` and the JSON-LD are structured so pasting the URL in is a data edit.
- **"Most popular" marker (§5.2).** Owner decision 4: omit. Task 5.1 verifies it is absent.

**2. Placeholder scan.** Searched the plan for "TBD", "TODO", "implement later", "fill in details", "add appropriate error handling", "handle edge cases", "similar to Task N", and code steps with no code block. None found. Every JSON file, CSS block, `.astro` component, `netlify.toml` section, and `config.yml` appears in full at the point of use rather than by reference. The only cross-task references are to *names and shapes* declared in an Interfaces block, which is what those blocks are for.

**3. Type and name consistency.** Checked across tasks:
- `--color-ink` / `--color-brand` are used everywhere after Task 1.1; `--color-text` and `--color-accent-ink` appear only in the Task 1.1 sweep list that removes them.
- `BaseLayout` `Props` is declared once (Task 1.2) and extended once (Task 5.5, adding `jsonLd?: unknown`). Every page task passes `title` and `description`; only `packages.astro` and `faq.astro` pass `jsonLd`.
- `ClosingCta` takes `heading`, `sub`, `ctaLabel`, `ctaHref` in Task 3.1 and is called with exactly those four in Tasks 3.1, 5.1, 6.1, 6.2, 7.1.
- `WorkCard` takes a single `entry: CollectionEntry<'work'>` in Task 7.1 and is called that way in Tasks 7.1 and 7.2.
- Tier ids `presence` / `search` / `search-plus` are fixed in Task 2.3 and consumed identically by the homepage anchors (3.1), the card anchors and `/start/?tier=` links (5.1), the JSON-LD `@id`s (5.5), and the prefill script's slug comparison (6.3).
- The five `scopeFaq.topics` slugs in Task 2.3 all exist in Task 2.5's `faq.json`, and Task 5.4 throws at build time if one does not.
- `site.json`'s `nav` entries all carry `cta`, which is what lets `Header.astro` (4.2) read `item.cta` under strict TypeScript, and what lets Task 7.2 splice in a `{label, href, cta}` object without a type error.
- Comparison cells: Task 2.3 writes booleans, DecapCMS (8.1) writes strings, and Task 5.3's `normalize()` accepts both.
- The `work` collection's `screenshot` is `z.string()` in Task 2.6 and rendered as a plain `<img src>` in Task 7.1, matching what Decap's image widget writes (`/images/...`). Astro's `image()` helper is deliberately not used, because it needs a path relative to the markdown file.

**4. Green-build check.** Every task ends with a working tree that builds. The two places where a data change would otherwise break its consumer are handled inside the same task: Task 2.2 stubs `index.astro`, and Task 5.1 deletes `pricing.json` in the same commit that stops reading it.

---

# Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-08-23-keepsite-brand-transition.md`. Two execution options:

**1. Subagent-Driven (recommended)** — a fresh subagent per task, review between tasks, fast iteration. REQUIRED SUB-SKILL: `superpowers:subagent-driven-development`.

**2. Inline Execution** — execute tasks in this session with checkpoints for review. REQUIRED SUB-SKILL: `superpowers:executing-plans`.

Whichever is chosen, three hard stops:

1. **Task 0.1 Step 1** does not proceed until the owner confirms the SOP is saved outside this repo. Deleting it is destructive.
2. **Phases 0 and 1 deploy to production; Phases 2-6 do not deploy separately.** They land on `brand-transition` and go live together at Task 6.4.
3. **Task 6.4 Step 3's residue sweep has no acceptable exception.** If it returns anything, the release does not ship.

Which approach?
