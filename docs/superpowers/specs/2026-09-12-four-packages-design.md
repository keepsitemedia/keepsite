# Four packages: site copy, agreements and office — design

Keepsite's three packages (Presence, Search, Search Plus) become four
(Presence, Growth, Agile, Range), with new prices, a new voice, new
payment terms and no public hourly rate. This spec covers the public
site, the four agreements, and the office changes that let the one
pipeline track the meeting cadence each package promises.

The source for names, prices, voice and package content is the internal
packages-and-voice reference, which lives outside the repo (it carries
labor figures; see README "What doesn't belong in this repo"). This
spec restates only what the site and the agreements will say.

## Goals

- Every public page reads in the new voice and describes the four
  packages: what we do, who each one is for, what it costs, what is
  not included, and what happens after launch.
- No public page, agreement, add-on price or FAQ states an hourly rate.
- The four agreements exist as docx in `../legal/` and as generated
  office templates, with the twelve-payment plan and flat add-on prices.
- The office knows the four tiers, offers the four agreements, and
  creates the per-package tasks (kickoffs, check-ins, recurring
  strategy meetings and summaries) so the digest reminds about them.

## Non-goals

- Stripe support for the twelve-payment plan. It is offered in copy and
  agreements and handled by hand in Stripe until it has been used once.
- The two-brands, contacts and own-tasks work in the 2026-09-12 office
  spec. This spec adds task recurrence in the shape that spec expects,
  and nothing else from it.
- Visual redesign. Layouts, components and styles stay. Where a page
  gains a band (payment terms, the package sorter) it uses existing
  patterns.

## The four packages, as the site states them

| | Presence | Growth | Agile | Range |
|---|---|---|---|---|
| id | `presence` | `growth` | `agile` | `range` |
| Build | $1,200 | $1,800 | $2,100 | from $2,100, quoted |
| Monthly | $60 | $160 | $425 | from $350, quoted |
| Headline | A site you never have to think about. | Get found by people who are already searching. | Still figuring it out? We'll build as you go. | More than one business under one roof. |
| Who | Already finds clients in person, by word of mouth, at events, on social. Wants a professional site and no homework. | Wants clients from Google. There is an established way people search for what they offer. | New or unusual offering. Nobody types a tidy search phrase for it yet. | Several businesses under one roof. Many products or services, each with its own customers. |
| Search work | None | Search-result research, site map built from it | Deeper, custom research per page; A/B tests; a site built to have its strategy swapped | Growth-level research for every arm |
| Meetings | None scheduled | Kickoff and a check-in at each stage | Kickoff, a check-in every two weeks during the build, a strategy meeting every month after launch | Kickoff and a check-in at each stage |
| After launch | Hosting, maintenance, one change a month, quarterly summary | Everything in Presence plus search monitoring and updates tied to the search goals | Everything in Growth plus the monthly meeting, ongoing research and tests | Scoped per arm in the quote |

Range is the only package without a fixed price. The site shows the
floor and says it is quoted after one conversation.

**Timeline.** Copy and agreements say most sites launch four to six
weeks after kickoff, mostly depending on how fast the client replies.
The pipeline due dates stay as they are.

**Payment terms.** Half at kickoff, half at launch; or the build spread
over twelve monthly payments of nine percent of the build price. The
monthly fee starts at launch. These appear on the packages page, in the
FAQ, and in Section 2 of every agreement.

**Add-ons, flat.** Extra change request $60. Additional standard page
$150. Additional search page $225 (Growth, Agile, Range). Everything
else — copy from scratch, integrations, reopening a closed stage, a
move to another host, a major expansion — is quoted in writing before
work starts. The restart fee after thirty days of silence stays $150.
No hourly figure appears anywhere the client can read.

## Public site

Every page keeps its Astro layout and its data file. The rewrite lands
in the JSON, plus small edits where a page assumes three tiers.

### Voice rules applied to every file

From the reference: relief over hype; plain words; name the feeling,
never shame it; honest about fit; short sentences; active voice; "we
do the work". Avoid: leverage, elevate, unlock, seamless, robust,
solutions, empower, digital presence, exclamation points. No wedding
references. Keep the "keep" lines where they already anchor a band
(pull lines, closing CTA); do not add more.

### `src/data/packages.json`

Tier objects gain fields; the pages render the new ones and drop
`cardIncludes` in favour of the who/feeling/do/don't structure.

```json
{
  "id": "agile",
  "name": "Agile",
  "line": "Still figuring it out? We'll build as you go.",
  "sub": "For new or evolving offerings where the search strategy has to be invented. We research, meet often, and change the site as you change.",
  "who": "...",
  "feeling": "...",
  "weDo": ["...", "..."],
  "weDont": ["...", "..."],
  "buildPrice": "$2,100",
  "buildPriceNote": "one-time build",
  "monthlyPrice": "$425",
  "monthlyPriceNote": "per month",
  "quoted": false,
  "monthlySummary": ["...", "..."],
  "ctaLabel": "Start with Agile"
}
```

Range sets `quoted: true`, `buildPriceNote: "from, quoted"`,
`monthlyPriceNote: "from, quoted"`. `buildPrice` and `monthlyPrice`
stay single dollar amounts on every tier because the office and the
structured data parse them; the note carries the word "from".

New top-level sections:

- `payment`: heading, lead, two options (split, plan), the line that
  the monthly starts at launch, and the subscription terms paragraph
  (twelve-month term, renewal, cancellation) rewritten in the voice.
- `sorter`: heading, lead, the four sorting questions, each with two or
  three answers and the package each answer points to. Rendered as a
  plain list, not an interactive quiz.
- `comparison`: rows keyed `presence`, `growth`, `agile`, `range`.
  Groups: Build (custom design, search research, copy, A/B testing,
  built to restructure), Meetings (kickoff, check-ins, recurring
  strategy), Monthly (hosting and maintenance, change requests, search
  monitoring, updates tied to search goals, ongoing research and tests,
  summaries).
- `addOns`: the flat items above and the "quoted first" items, with the
  upgrade rule (more strategy means the next package, not more pages).
- `scopeFaq.topics`: five slugs from the rewritten FAQ.

### `src/pages/packages.astro`

- Card: name, line, sub, "Who it's for", "What we do", "What we don't",
  price block. Range's price block reads "from $2,100" and "from $350 a
  month" with a "Quoted after one conversation" note.
- Structured data: four `Service` nodes. Range's offers carry the floor
  price; no change to the schema shape.
- New bands in this order after the cards: payment terms, sorter,
  monthly, comparison, add-ons, scope questions, closing.
- The comparison table gets a fourth column and its scroll container
  stays.

### `src/data/home.json`

- Meta description quotes "Packages from $1,200".
- Hero unchanged (tagline, sub, two CTAs).
- Problem band: name the feeling. Heading in the reference's register
  ("You've been meaning to fix your website for a year."), body about
  evenings and the list.
- Solution: "We build it. We keep it useful." Three beats: we build it,
  we keep it working, we tell you what's working (a plain-English
  summary every quarter, not once a year). Pull line stays.
- Packages band: heading "Four ways to work with us." The page renders
  name and line for each tier from packages.json; no copy change
  needed there beyond the heading.
- Why: four pillars rewritten one sentence each.
- Closing unchanged.

### `src/data/process.json`

- Steps: five steps, rewritten. Step two mentions research on Growth,
  Agile and Range and the kickoff call. Step five names the after-launch
  difference per package in one clause each.
- Stages: three stages stay. Each stage's `tiers` list has four
  entries. Stage one: Presence picks and moves on; Growth's research is
  under way; Agile's discovery is under way and the research is being
  invented; Range's research runs per arm. Stage two: page set by
  request; from research; built to change; one section per arm. Stage
  three: client copy edited and placed; written by us after a call; the
  same, and tested; per arm.
- End band: after-launch per package, four entries.
- Add a `meetings` band: heading "How often we talk", one line per
  package, matching the cadence table above.
- Timeline sentence in `stages.lead` or a new `timeline` string:
  four to six weeks after kickoff.
- `needFromYou` and `wontHaveTo` rewritten; "one call on Search and
  Search Plus" becomes the per-package cadence.

### `src/pages/how-it-works.astro`

Renders the four-entry tier lists and the new meetings band. The
`markTerms` glossary keeps working; the term list is updated (drop
"SEO articles", add "search strategy" and "A/B test").

### `src/data/faq.json`

Groups and questions, rewritten in full:

- Getting started: how do we start; how long does it take (four to six
  weeks); what do you need from me; do we have to meet (per package);
  how the build works; why the text is placeholder in stage two; rounds
  of changes.
- Picking a package: which one is right for me (the sorter in prose);
  why Agile costs more than Growth (different build, not a surcharge);
  why Range has no price; can I start with Presence and move up (yes,
  but moving to Growth restructures); do you build without a monthly.
- Paying: what does the monthly cover; is it just hosting; can I pay
  over time (the split and the plan); am I locked in; what happens if
  I stop.
- The work: is this AI writing my site; who writes the copy; what if I
  don't have copy; do I have to switch off the tools I use; can I
  update the site myself (no, on purpose); I've been burned before.
- Extras: what if I need a new page (flat prices); who owns my domain;
  what kinds of businesses.

Every price in an answer must match packages.json; the verifier
already checks that.

### `src/pages/start/index.astro`, `src/data/site.json`

Lead rewritten ("Tell us what's eating your time. We'll reply with one
recommendation and what it costs."). The package select fills from the
four tiers; "Not sure yet" stays selected by default. Tagline and nav
unchanged.

### Other public surfaces

- `src/content.config.ts`: tier enum becomes the four names.
- `src/components/WorkCard.astro`: no change beyond the enum.
- `public/admin/config.yml`: the work collection's package options and
  the packages page fields (add who, feeling, weDo, weDont, sub, quoted,
  payment, sorter) update. The price hint no longer offers "$90 an
  hour" as an example.

### Verifier (`scripts/verify.mjs`)

- Price list becomes `$1,200 $60 $1,800 $160 $2,100 $425 $350`.
- Service expectations: `presence`, `growth`, `agile`, `range` with the
  floor prices for Range.
- Old-model residue gains `Search Plus`, `search-plus`, `foundational
  articles`.
- New check "no hourly rate on any page": every emitted page is free of
  `per hour`, `an hour`, `/hr`, `hourly`, `$90`, `$75`.
- Home description check: lowest build price is now $1,200.

## Agreements

### Files

`../legal/presence-agreement.docx` is replaced; `growth-agreement.docx`,
`agile-agreement.docx` and `range-agreement.docx` are new. The old
three stay in `../legal/backup-2026-09-12/`. The office templates are
regenerated with the existing converter:

```
python3 scripts/agreement-from-docx.py ../legal/presence-agreement.docx presence > src/data/office/agreements/presence.json
```

and the same for `growth`, `agile`, `range`. `search.json` and
`search-plus.json` stay on disk, unchanged, for agreements already
sealed against them (see Office, retired templates).

### How the docx are produced

A one-off generator, kept beside the docx in `../legal/tools/` and not
in the repo, opens the current Search Plus docx for its styles, page
setup, footer and signature block, clears the body, and writes each
package from a per-package content spec: a list of headings,
paragraphs with optional bold lead-ins, lettered lists, and tables.
Section and subsection numbers, and every cross-reference ("see
Section 4.8"), are computed from the spec by symbolic keys, so nothing
is renumbered by hand. The footer reads "Keepsite Media · Growth
Package · Page N".

The converter's row-label mappings (Schedule 1, Exhibit D, the
signature block) are kept verbatim so the office placeholders keep
matching. Two additions to the converter: it records `tier` from the
subtitle ("Growth Package" → `Growth`) and it maps the Range Exhibit A
row "Business arms covered" to `{{arms}}`.

### Content common to all four

Unchanged from today except where listed: the parties, Schedule 1, the
term and renewal, cancellation, code handover, what happens when the
site comes down, three stages with one round of changes each, quiet
client rules, launch, facts, hosting, uptime, backups, security,
ownership, confidentiality, promises, liability, everything else,
signatures, Exhibit D.

Changes to the common text:

- **2.1 The build fee.** Schedule 1 gains a row "Payment plan (Section
  2.1)" with entries "Half and half" (default) or "Twelve monthly
  payments". The clause: half on signing and half on the Launch Date,
  or twelve monthly payments of nine percent of the build fee, the
  first on signing and the rest on the same day of each following
  month. On the plan, if a payment is more than ten days late the site
  reverts to a holding page until the balance is settled, after seven
  days' notice, and the unpaid remainder is due on cancellation.
- **2.5 Late payments** references the holding page for plan clients.
- **4.3 How long it takes.** Four to six weeks after kickoff.
- **4.7 / quiet client.** Restart fee stays $150; no other figure.
- **Reopening a closed stage**: quoted in writing, not "at Exhibit C
  rates".
- **5.1 Small content updates.** Presence: one change request a month;
  Growth, Agile, Range: fair use of a few requests a month, no hours.
  Extra requests at the Exhibit C flat price.
- **5.3 Fair use** drops the hours figure.
- **Exhibit C** on every package:

  | Service | Price |
  |---|---|
  | Extra change request | $60 per request |
  | Additional standard page | $150 per page |
  | Additional search page (Growth, Agile, Range) | $225 per page |
  | Copy written from scratch | Quoted in writing first |
  | Advanced integration | Quoted in writing first |
  | Additional round of changes, or reopening a closed stage | Quoted in writing first |
  | Migration to another provider | Quoted in writing first; the code export itself is free under Section 3.8 |
  | Major website expansion | Custom quote |

  Plus the upgrade rule and the changing-packages paragraph.

### Presence

Subtitle: "Website Design, Development, Hosting, and Maintenance".
Build $1,200; monthly $60; default five pages. Section 4 has no
research subsection. Section 7 "Analytics and Reporting": basic
technical setup, analytics, Google Business Profile and social links
connected; a quarterly plain-English summary, no dashboard; what isn't
(search research, strategy, recommendations on what to write). No
scheduled meetings. Exhibit A: the current Presence list with the
quarterly summary. Exhibit B: hosting, maintenance, monitoring, SSL,
backups, one change request a month, email support, quarterly summary.

### Growth

Subtitle: "Website Design, Development, Hosting, Maintenance, and
Search". Build $1,800; monthly $160; default eight pages. Section 4
gains "Search research and site structure" before Stage One: we study
the search results the client wants to win and build the page map from
them; the map sets Stage Two. Section 4 also gains "Meetings": a
kickoff call after signing and a check-in at each stage. Section 7
"Search Monitoring and Updates": Search Console and analytics
monitoring; updates to existing pages, copy and structure when the
data supports them, tied to the search goals set at the start; we may
change page copy, headings, metadata and structure for this purpose
without asking, never pricing, claims, credentials or contact details;
quarterly summary tied to the search goals; yearly recap; no ranking
promise; what we won't do (link schemes etc.). What isn't: ongoing
strategy, A/B testing, research beyond the initial plan. The blog
program and article counts are gone. Exhibit A: everything in Presence,
search-result research, page map from it, copy for core pages written
by Keepsite around the research, full on-page technical setup, Search
Console. Exhibit B: everything in Presence plus search monitoring,
updates tied to search goals, quarterly summary.

### Agile

Subtitle: "Website Design, Development, Hosting, Maintenance, and
Ongoing Search Strategy". Build $2,100; monthly $425; default eight
pages. Section 4 gains "Discovery and research": longer discovery about
the business and where it is going; research and data-finding where the
obvious data does not exist; a page map from that; the site built so
its search strategy can be replaced later without rebuilding the parts
that work; A/B tests where there is a real question to answer.
"Meetings": kickoff, a check-in every two weeks during the build, a
strategy meeting every month after launch. Section 7 "Ongoing
Strategy": the monthly meeting; research that continues as the business
changes; tests; changes to the site that come out of both; the same
"without asking" boundary as Growth; a summary every quarter; a yearly
recap; not a promise of volume or results; we provide research and
build, we do not make business decisions and do not run advertising.
Exhibit A: everything in Growth, discovery, custom research per page,
A/B testing, a structure built to be restructured. Exhibit B:
everything in Growth plus the monthly strategy meeting, ongoing
research, and tests.

### Range

Subtitle: "Website Design, Development, Hosting, Maintenance, and
Search, for Multi-Line Businesses". Build and monthly are "as stated in
Schedule 1" with the floor ($2,100 and $350) as the blank default;
default sixteen pages. Section 1.1 defines an "arm": a product line or
service line with its own customers, listed in Exhibit A. Section 4:
Growth's research subsection applied per arm, with the site structured
so arms do not compete with each other in search; kickoff and a
check-in at each stage. Section 7: Growth's monitoring and updates per
arm; if Schedule 1 marks an arm as strategy-ongoing, Agile's Section 7
applies to that arm. Exhibit A: a "Business arms covered" row filled
from `{{arms}}`, then Growth's build list per arm. Exhibit B: Growth's
monthly per arm.

## Office

### Tiers

`TIERS` already derives from packages.json, so the client form, list,
inquiry mapping and payments prefill pick up the four names. A stored
client whose tier is not in `TIERS` (Search, Search Plus) renders in
the select as "Search (retired)", selected; `validateClient` accepts an
unchanged retired value and refuses a retired value that differs from
the stored one, so the client keeps working until someone edits them,
and then must move to a current tier.

`tierPrices(name)` is unchanged. For Range it returns the floor, which
the payment and agreement forms already let the admin edit.

### Agreement templates

- Generated JSON carries `tier`. `agreement-templates.mjs` validates
  that `tier` is in `TIERS` unless the template id is in a `RETIRED`
  set (`search`, `search-plus`).
- `TIER_FOR_TEMPLATE` in `agreements.mjs` is replaced by
  `template.tier`.
- The client page's template picker lists only non-retired templates
  and defaults to the one whose tier matches the client's.
- Retired templates still render and seal existing agreements; the
  converter is not run on them again.
- The create form prompts for `arms` (a multi-line text) when the
  template's blocks contain `{{arms}}`; the value renders in the Range
  Exhibit A row. The placeholder is added to the known set.
- Schedule 1's new "Payment plan" row is prefilled "Half and half" and
  editable on the create form like the other Schedule 1 rows; the
  deposit and balance rows are filled from it (fifty percent each, or
  nine percent and the remainder).

### Pipeline: per-tier and recurring tasks

`pipelines.json` task objects gain two optional fields:

- `tiers`: a list of tier names. The task is created only for clients
  whose tier is in the list. Validation requires each name to be in
  `TIERS`. A task without `tiers` is created for every client,
  including one whose tier is not yet decided.
- `repeat`: one of `weekly`, `biweekly`, `monthly`, `quarterly`,
  `yearly`. Validation refuses anything else.

`advance()` filters `stage.tasks` by tier before creating them, and
copies `repeat` (null when absent) onto the task document. Tier changes
after a stage was entered do not create tasks retroactively; the
admin adds those by hand.

New module `recurrence.mjs`: `REPEATS`, `isRepeat`, `nextDue(ymd,
repeat)` (seven, fourteen days; one, three, twelve months, clamped to
the month's end via a new `addMonths` in `dates.mjs`), and
`nextTask(task, now)` which copies title, slug, stage, notes, time and
repeat with a fresh id and the next due date. These are the names and
shapes the own-tasks plan expects, so it can reuse them.

The task action's `done` creates the next task when the task has
`repeat` and the client is still in `task.stage`. A repeating task
whose client has moved on is simply closed, which is how build-phase
check-ins stop at launch and Live-stage tasks run indefinitely. A
replayed `done` on an already-done task creates nothing.

`TaskRow` shows the repeat word in the task's meta line ("every two
weeks", "monthly"). The Move sheet is unchanged in this spec.

### The seeded pipeline

The existing stages and tasks stay. Added tasks:

| Stage | Task | tiers | due | repeat |
|---|---|---|---|---|
| agreement | Kickoff call | Growth, Agile, Range | 3 | — |
| intro | Discovery session | Agile | 3 | — |
| demo | Research check-in | Agile | 7 | biweekly |
| post-demo | Research check-in | Agile | 7 | biweekly |
| layouts | Stage check-in | Growth, Range | 5 | — |
| layouts | Research check-in | Agile | 7 | biweekly |
| copy | Stage check-in | Growth, Range | 5 | — |
| copy | Research check-in | Agile | 7 | biweekly |
| live | Strategy meeting | Agile | 30 | monthly |
| live | Research and test review | Agile | 30 | monthly |
| live | Search summary to client | Growth, Agile, Range | 90 | quarterly |
| live | Analytics summary to client | Presence | 90 | quarterly |
| live | Annual recap | — | 365 | yearly |

The Live stage's "Annual recap" replaces nothing; today Live has no
tasks. The digest already lists open tasks by due date, so these
become the reminders without any change to the digest.

### Email templates

Wording touched where it names the old model: the agreement email's
"the build, the monthly fee, and what happens at each stage" stays;
the launch email's "the monthly starts on launch day" stays. No new
templates. Meeting invitations for kickoffs, check-ins and strategy
meetings use the existing meeting flow.

### README and checks

- README: "Editing content" gains the packages.json fields; "Agreements"
  names four templates and the retired two; "Office" mentions per-tier
  tasks and recurrence; the regeneration commands list four packages.
- `check-office.mjs` picks up the new pipeline validation through
  `validatePipelines`.
- Tests updated to the four names wherever a fixture names a tier, plus
  new tests for `recurrence.mjs`, tier filtering in `advance()`, the
  `done` rule, retired-tier validation, the `arms` prompt, the payment
  plan prefill, and the verifier's new checks are exercised by
  `npm run verify` on the built site.

## Migration

- No store rewrite. Clients keep their stored tier; the retired label
  handles the two old names.
- Agreements sealed against `search` or `search-plus` keep rendering.
  There are no sent-but-unsigned agreements at the time of writing.
  Any Presence draft created before deploy is on the old version and
  must be voided and re-created.
- Stored pipeline settings (if the admin saved one) lack the new
  tasks; the settings page shows the seed diff as it does today and
  the admin re-saves.

## Testing

- `npm run gate` passes: unit tests, `astro check`, questionnaire and
  office checks, build, verifier.
- Manual: on the local harness, create one client per tier, advance
  each through every stage, confirm the task list per tier matches the
  table above, mark a biweekly check-in done twice (second copy is
  created, third is not after advancing), mark the Live strategy
  meeting done (next month's is created). Create a Range agreement,
  fill arms, check the Exhibit A row and the plan row render, sign as
  Keepsite, open the signing page.
- Read every public page once through in the reference's style
  checklist: first-read clarity, package headlines describe a person,
  relief obvious, what's not included stated, no hype words, no wedding
  references, Agile framed as more research and a different build.

## Sequence

1. Verifier and data schema (packages.json fields, four tiers, prices)
   with the public copy, page by page.
2. Office tier handling, agreement template `tier`, retired templates.
3. Pipeline `tiers` and `repeat`, recurrence, seeded tasks, TaskRow.
4. Docx generator and the four docx; owner reviews in Word.
5. Converter additions; regenerate JSON; `arms` and payment-plan rows in
   the create form.
6. README, tests, gate, manual pass on the harness.
