# Four Packages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the three packages with Presence, Growth, Agile and Range across the public site, the four agreements and the office, in the new voice, with new prices, the twelve-payment plan, flat add-on prices, no public hourly rate, and per-package recurring tasks.

**Architecture:** Public copy lives in `src/data/*.json` and the Astro pages render it, so the rewrite is mostly data plus small page edits; `scripts/verify.mjs` is the acceptance test for copy. Agreements are docx in `../legal/` converted to office JSON by `scripts/agreement-from-docx.py`; a one-off generator outside the repo writes the four docx from the current Search Plus docx's styles. The office derives tiers from `packages.json`; the pipeline gains per-tier and repeating tasks through two optional task fields and a small recurrence module.

**Tech Stack:** Node 20, Astro 5, `node --test`, python-docx 1.2 (generator and converter), Netlify Blobs behind `store.mjs`.

**Spec:** `docs/superpowers/specs/2026-09-12-four-packages-design.md`

## Global Constraints

- Branch `four-packages`; the first commit on it (`Save CRM work in progress`) is the owner's and is not amended.
- Prices: Presence $1,200 / $60; Growth $1,800 / $160; Agile $2,100 / $425; Range from $2,100 / from $350, quoted. `buildPrice` and `monthlyPrice` in `packages.json` stay single dollar amounts on every tier.
- Add-ons, flat: extra change request $60; additional standard page $150; additional search page $225 (Growth, Agile, Range); everything else "quoted in writing before work starts". Restart fee $150.
- No public page, agreement, FAQ answer or add-on price states an hourly rate. The strings `per hour`, `an hour`, `/hr`, `hourly`, `$90` and `$75` must not appear in any built public page.
- Timeline copy everywhere: most sites launch four to six weeks after kickoff.
- Voice: relief over hype, plain words, name the feeling never shame it, honest about fit, short sentences, active voice. Never: leverage, elevate, unlock, seamless, robust, solutions, empower, digital presence, exclamation points, wedding references, competitor names.
- The packages-and-voice reference (`keepsite-packages-and-voice.*`, gitignored) is the source for voice and package content; never commit it and never quote its hour or rate figures anywhere.
- Office conventions: modules are `.mjs` under `netlify/functions/lib/office/` with tests beside them as `*.test.mjs`; actions are `(request, ctx, s = defaultStore(), now = new Date()) => Response`; day dates are `YYYY-MM-DD`; "today" is Mountain time via `todayIn()`; `store.mjs` alone knows key shapes.
- Never edit `src/data/office/agreements/*.json` by hand; regenerate from the docx.
- Comments explain why, never what. Same term for the same thing throughout a file.
- Commit subjects imperative, under 50 characters; body only when the diff does not explain the reason; every commit ends with:
  ```
  Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01Ti4y7Gzbf2CauEELUE5o46
  ```
- The dev server on `/mnt/c` gets no file-change events under WSL2: restart it after edits. `npm run gate` is slow here (the build alone is minutes); run the unit tests (`node --test`) per task and the full gate at the checkpoints the tasks name.
- Local office harness: `NETLIFY_DEV=1 OFFICE_STORE_DIR=<scratch>/office-data IDENTITY_URL=http://127.0.0.1:9999 KEEPSITE_SESSION_SECRET=local-dev-secret npx astro dev --host 127.0.0.1 --port 4321`, with the fake Identity server from the session scratchpad on 9999. Stop the dev server by pid, never by name.

---

## File map

| File | Responsibility after this plan |
|---|---|
| `src/data/packages.json` | Four tiers with who/feeling/weDo/weDont, payment terms, sorter, four-column comparison, flat add-ons, scope FAQ slugs. |
| `src/pages/packages.astro` | Renders the new tier card, payment band, sorter band, four-column table; structured data for four services. |
| `src/data/home.json`, `src/data/process.json`, `src/data/faq.json` | Rewritten copy. `site.json` is unchanged. |
| `src/pages/how-it-works.astro` | Renders the meetings band and the timeline line. |
| `src/pages/index.astro` | No change (four tier links render from packages.json). |
| `src/pages/start/index.astro` | New lead copy. |
| `src/content.config.ts`, `public/admin/config.yml` | Four tier names; new packages fields in the CMS. |
| `scripts/verify.mjs` | New prices, four services, residue needles, no-hourly-rate check. |
| `netlify/functions/lib/office/clients.mjs` | `validateClient(fields, existing)` accepts an unchanged retired tier. |
| `netlify/functions/lib/office/actions/client.mjs` | Passes the stored client to `validateClient` on update. |
| `src/components/office/ClientFields.astro` | Shows a retired tier as "Search (retired)". |
| `netlify/functions/lib/office/dates.mjs` | Gains `addMonths(ymd, n)`. |
| `netlify/functions/lib/office/recurrence.mjs` (new) | `REPEATS`, `isRepeat`, `nextDue`, `nextTask`, `repeatLabel`. |
| `netlify/functions/lib/office/pipeline.mjs` | Validates `tiers` and `repeat`; `advance()` filters by tier and copies `repeat`. |
| `netlify/functions/lib/office/actions/task.mjs` | `done` on a repeating task creates the next one while the client is in that stage. |
| `src/components/office/TaskRow.astro` | Repeat word in the meta line. |
| `src/data/office/pipelines.json` | The per-tier and repeating tasks. |
| `scripts/agreement-from-docx.py` | Emits `tier`; maps the payment-plan row and the Range arms row to placeholders. |
| `../legal/tools/make-agreements.py` (outside the repo) | Generates the four docx from the Search Plus docx styles and a per-package content spec. |
| `../legal/{presence,growth,agile,range}-agreement.docx` | The legal source. |
| `src/data/office/agreements/{presence,growth,agile,range}.json` | Generated templates. `search.json` and `search-plus.json` stay, retired. |
| `netlify/functions/lib/office/agreement-templates.mjs` | Loads six, exposes four; `RETIRED`; validates `tier`; new placeholders `paymentPlan`, `arms`. |
| `netlify/functions/lib/office/agreements.mjs` | `defaultFields` uses `template.tier`; new fields `paymentPlan`, `arms`. |
| `netlify/functions/lib/office/actions/agreement.mjs` | Reads and validates `paymentPlan` and `arms`. |
| `src/pages/office/clients/[slug].astro` | Picker shows current templates, defaults by tier; plan select and arms textarea. |
| `README.md` | Four packages, retired templates, per-tier tasks, regeneration commands. |

---

### Task 1: packages.json, the packages page and the verifier

**Files:**
- Modify: `src/data/packages.json` (rewrite)
- Modify: `src/pages/packages.astro`
- Modify: `scripts/verify.mjs:131-135`, `:264-276`, `:98-107`
- Modify: `src/content.config.ts:9`
- Modify: `public/admin/config.yml:141-190`, `:320`

**Interfaces:**
- Produces: `packages.tiers[]` objects with `id`, `name`, `line`, `sub`, `who`, `feeling`, `weDo[]`, `weDont[]`, `buildPrice`, `buildPriceNote`, `monthlyPrice`, `monthlyPriceNote`, `quoted`, `monthlySummary[]`, `ctaLabel`. `TIERS` in `clients.mjs` becomes `['Presence', 'Growth', 'Agile', 'Range']` with no code change. `packages.addOns.items[].price` never contains an hourly figure.

- [ ] **Step 1: Make the verifier fail first**

Edit `scripts/verify.mjs`. Replace the price check at lines 131-135 with:

```js
check('prices are the new ones', () => {
  const h = read('packages/index.html');
  for (const p of ['$1,200', '$60', '$1,800', '$160', '$2,100', '$425', '$350']) {
    if (!h.includes(p)) throw new Error('missing price ' + p);
  }
});
```

Replace the needles line in `no old-model residue` (line 99) with:

```js
  const needles = ['no lock-in', '$0 a month', 'nothing to pay', '$500', '$750', 'snic9004', 'search plus', 'search-plus', 'foundational articles', '$1,100', '$1,750', '$2,000'];
```

Add directly after that check:

```js
// The hourly rate is internal. Add-ons are flat prices or "quoted first";
// nothing a visitor reads names a rate.
check('no hourly rate on any page', () => {
  for (const p of PAGES) {
    const hit = read(p).match(/per hour|an hour|\/hr\b|hourly|\$90\b|\$75\b/i);
    if (hit) throw new Error(`"${hit[0]}" in ${p}`);
  }
});
```

Replace the service expectation (lines 264-276) with:

```js
check('Service prices match the rendered prices', () => {
  const services = ld('packages/index.html')[1]['@graph'];
  const expect = { presence: ['1200.00', '60.00'], growth: ['1800.00', '160.00'], agile: ['2100.00', '425.00'], range: ['2100.00', '350.00'] };
  if (services.length !== 4) throw new Error('services: ' + services.length);
  for (const s of services) {
    const id = s['@id'].split('#')[1];
    if (!expect[id]) throw new Error('unknown service id ' + id);
    const [b, m] = expect[id];
    if (s.offers[0].price !== b) throw new Error(id + ' build ' + s.offers[0].price);
    if (s.offers[1].priceSpecification.price !== m) throw new Error(id + ' monthly ' + s.offers[1].priceSpecification.price);
    if (s.provider['@id'] !== 'https://www.keepsitemedia.com/#business') throw new Error(id + ' provider');
  }
});
```

- [ ] **Step 2: Run the verifier against the current dist and see it fail**

Run: `npm run build && npm run verify`
Expected: failures on `prices are the new ones`, `no old-model residue` ("search plus"), `no hourly rate on any page` ("$90"), `Service prices match the rendered prices` (services: 3).

- [ ] **Step 3: Rewrite `src/data/packages.json`**

Write the whole file:

```json
{
  "meta": {
    "title": "Packages | Keepsite Media",
    "description": "Four website packages, each a one-time build plus a monthly fee that keeps the site working. Prices, what's included, what isn't, and how you can pay."
  },
  "intro": "Four packages. Each one is a custom site we build, then keep running. The difference between them is how much search work goes into the build and how often we talk afterward. We'll tell you which one fits, and we'll tell you when the smaller one is enough.",
  "tiers": [
    {
      "id": "presence",
      "name": "Presence",
      "line": "A site you never have to think about.",
      "sub": "For businesses that already find clients in person, by word of mouth, or on social, and want a professional home for them.",
      "who": "You're busy. People already find you through referrals, events, Instagram, or the sign out front. You don't care about Google and don't need to. You just want a site that looks as good as your work does, and you never want to learn a website builder.",
      "feeling": "People find me fine. But when they land on my site, or my Instagram link goes nowhere, it undercuts me. I've meant to fix it for a year.",
      "weDo": [
        "Design and build a custom site around what you do and who walks in the door",
        "Host it, maintain it, and watch it for problems",
        "Make a change when you ask, once a month, from the copy or photo you send",
        "Send a plain-English summary every quarter, so you can see what's working",
        "Keep the tools you already use. We build around them"
      ],
      "weDont": [
        "Search strategy or research into what people type into Google",
        "Advice on what to write or post",
        "A login for you. You send us the change, we make it"
      ],
      "buildPrice": "$1,200",
      "buildPriceNote": "one-time build",
      "monthlyPrice": "$60",
      "monthlyPriceNote": "per month",
      "quoted": false,
      "monthlySummary": [
        "Hosting, maintenance and monitoring",
        "One change a month from the copy or photos you send",
        "A plain-English summary every quarter",
        "Email support"
      ],
      "ctaLabel": "Start with Presence"
    },
    {
      "id": "growth",
      "name": "Growth",
      "line": "Get found by people who are already searching.",
      "sub": "For businesses ready to bring in clients from search. We study the results you want to win and build your site to reach them.",
      "who": "What you're doing works, but it isn't enough. You know people are typing what you do into Google, and you want to be the one they find. You can name the searches you wish you showed up in, and you're ready for calls from strangers.",
      "feeling": "I know people are searching for this. I want to be the one they find.",
      "weDo": [
        "Study the actual search results for the searches you want to win",
        "Build your site's page list from that research, so the structure itself is built to show up",
        "Write the words on your core pages around it, after one call to get your tone right",
        "Host it, maintain it, and watch how it performs in search",
        "Update pages when the numbers point somewhere useful, and send you a summary every quarter",
        "A kickoff call, and a check-in at each stage"
      ],
      "weDont": [
        "Reinvent what you sell or who buys it. Growth assumes you know",
        "Ongoing strategy meetings. The strategy is set at the start and built into the site",
        "Paid advertising"
      ],
      "buildPrice": "$1,800",
      "buildPriceNote": "one-time build",
      "monthlyPrice": "$160",
      "monthlyPriceNote": "per month",
      "quoted": false,
      "monthlySummary": [
        "Everything in Presence",
        "Search monitoring",
        "Updates to pages and structure tied to your search goals",
        "A summary every quarter, tied to those goals"
      ],
      "ctaLabel": "Start with Growth"
    },
    {
      "id": "agile",
      "name": "Agile",
      "line": "Still figuring it out? We'll build as you go.",
      "sub": "For new or evolving offerings where the search strategy has to be invented. We research, meet often, and change the site as you change.",
      "who": "Your offering is new, unusual, or still taking shape. Nobody is typing a tidy phrase for it yet, so there's no playbook to follow. You need someone who'll stay in it with you while the business finds its shape.",
      "feeling": "I know there's demand, but I'm not sure how people would look for me. My business is still changing.",
      "weDo": [
        "Longer discovery about what the business is and where it's going",
        "Research where the obvious data doesn't exist, and a page list built from it",
        "A heavier build: more research shaping each page, tests where there's a real question to answer",
        "A site engineered so the search strategy can be swapped later without breaking what works",
        "A check-in every two weeks during the build, then a strategy meeting every month",
        "Ongoing research, tests, and changes to the site as the strategy and the business evolve"
      ],
      "weDont": [
        "Set it and forget it. Agile is a relationship, not a launch",
        "Make business decisions for you. We bring the research, you decide",
        "Advertising outside of search"
      ],
      "buildPrice": "$2,100",
      "buildPriceNote": "one-time build",
      "monthlyPrice": "$425",
      "monthlyPriceNote": "per month",
      "quoted": false,
      "monthlySummary": [
        "Everything in Growth",
        "A strategy meeting every month",
        "Research that keeps going as the business changes",
        "Tests, and the changes that come out of them"
      ],
      "ctaLabel": "Start with Agile"
    },
    {
      "id": "range",
      "name": "Range",
      "line": "More than one business under one roof.",
      "sub": "For rental companies, multi-service businesses, and anyone with a catalog. Search strategy for every line, pages to match.",
      "who": "You do a lot of things, and your site only tells people about a few. Every division wants its own page and its own customers. You're really several businesses in one, and you want to show up for all of them.",
      "feeling": "We do a lot. Our site only shows a fraction of it.",
      "weDo": [
        "Growth-level search research for every arm of the business",
        "A large, well-organized site with a section for each arm and its own path to customers",
        "A structure that keeps the arms from competing with each other on Google",
        "Host it, maintain it, and watch every arm's search performance",
        "A kickoff call, and a check-in at each stage"
      ],
      "weDont": [
        "Treat you as one business. Range is scoped per arm, and priced the same way",
        "Publish a fixed price. We publish the floor and quote the rest after one conversation"
      ],
      "buildPrice": "$2,100",
      "buildPriceNote": "from, quoted",
      "monthlyPrice": "$350",
      "monthlyPriceNote": "from, quoted",
      "quoted": true,
      "monthlySummary": [
        "Everything in Growth, for every arm",
        "Search monitoring per arm",
        "Updates tied to each arm's search goals",
        "Scoped in your quote"
      ],
      "ctaLabel": "Talk about Range"
    }
  ],
  "payment": {
    "heading": "How you pay.",
    "lead": "The price is rarely the problem. Paying it all at once is. So you don't have to.",
    "options": [
      {
        "title": "Half and half",
        "body": "Half the build at kickoff, half at launch. This is the standard."
      },
      {
        "title": "Twelve payments",
        "body": "Spread the build over twelve monthly payments of nine percent of the build price. Available on every package. If the payments stop, the site goes to a holding page until they catch up."
      }
    ],
    "monthlyStarts": "The monthly fee starts the day your site goes live and is billed automatically.",
    "terms": "Every package runs on a 12-month term from launch and renews a year at a time. You can cancel mid-term with 30 days' notice, but the months left in that term are still due. Your domain and your content are yours either way, and if you ever leave, we'll help you move them."
  },
  "sorter": {
    "heading": "Which one is you?",
    "lead": "Four questions. Answer them and you'll probably know. If not, ask us and we'll say which one, and why not the ones above and below it.",
    "questions": [
      {
        "q": "Where do your clients come from now, and is that enough?",
        "answers": [
          { "a": "Enough.", "package": "Presence" },
          { "a": "Not enough.", "package": "Keep going" }
        ]
      },
      {
        "q": "If someone searched for you on Google, what would they type?",
        "answers": [
          { "a": "You can say it in a few words.", "package": "Growth or Range" },
          { "a": "It depends, or you're not sure.", "package": "Agile" }
        ]
      },
      {
        "q": "How many different things do you sell, to how many kinds of customers?",
        "answers": [
          { "a": "One or two.", "package": "Growth or Agile" },
          { "a": "Many.", "package": "Range" }
        ]
      },
      {
        "q": "How involved do you want to be after launch?",
        "answers": [
          { "a": "As little as possible.", "package": "Presence or Growth" },
          { "a": "I want a partner in it.", "package": "Agile" }
        ]
      }
    ]
  },
  "monthly": {
    "heading": "Keep your site working.",
    "lead": "Every package includes hosting, maintenance, and monitoring, so the site keeps doing its job without becoming yours. From Growth up, the monthly is mostly search work.",
    "headline": "We find out what your customers search for. Then we build the site to be the answer.",
    "closing": "Every Keepsite site also includes an inquiry page, set up to send straight to your email or the tools you already use."
  },
  "comparison": [
    { "group": "Build", "feature": "Custom design and build, mobile-first", "presence": "true", "growth": "true", "agile": "true", "range": "true" },
    { "group": "Build", "feature": "Research into what your customers search for", "presence": "false", "growth": "Search results you want to win", "agile": "Invented where the data doesn't exist", "range": "Per arm" },
    { "group": "Build", "feature": "Page list built from that research", "presence": "false", "growth": "true", "agile": "true", "range": "One section per arm" },
    { "group": "Build", "feature": "Copy for your core pages", "presence": "We edit and place yours", "growth": "We write it around the research", "agile": "We write it, and test it", "range": "We write it, per arm" },
    { "group": "Build", "feature": "A/B tests during the build", "presence": "false", "growth": "false", "agile": "true", "range": "false" },
    { "group": "Build", "feature": "Built so the search strategy can be swapped later", "presence": "false", "growth": "false", "agile": "true", "range": "false" },
    { "group": "Meetings", "feature": "Kickoff call", "presence": "false", "growth": "true", "agile": "true", "range": "true" },
    { "group": "Meetings", "feature": "Check-ins during the build", "presence": "false", "growth": "One per stage", "agile": "Every two weeks", "range": "One per stage" },
    { "group": "Meetings", "feature": "Strategy meetings after launch", "presence": "false", "growth": "false", "agile": "Monthly", "range": "false" },
    { "group": "Monthly", "feature": "Hosting, maintenance, and monitoring", "presence": "true", "growth": "true", "agile": "true", "range": "true" },
    { "group": "Monthly", "feature": "Changes from the copy or photos you send", "presence": "One a month", "growth": "true", "agile": "true", "range": "true" },
    { "group": "Monthly", "feature": "Search monitoring", "presence": "false", "growth": "true", "agile": "true", "range": "Per arm" },
    { "group": "Monthly", "feature": "Updates tied to your search goals", "presence": "false", "growth": "true", "agile": "true", "range": "Per arm" },
    { "group": "Monthly", "feature": "Ongoing research and tests", "presence": "false", "growth": "false", "agile": "true", "range": "false" },
    { "group": "Monthly", "feature": "Plain-English summary", "presence": "Quarterly", "growth": "Quarterly", "agile": "Quarterly", "range": "Quarterly" }
  ],
  "addOns": {
    "heading": "If you need something extra.",
    "items": [
      { "name": "Extra change request", "price": "$60 per request", "note": "Beyond what your monthly covers. You send the copy or the photo, we make the change." },
      { "name": "Additional standard page", "price": "$150 per page", "note": "Uses your existing site style and your copy. No new research." },
      { "name": "Additional search page", "price": "$225 per page", "note": "Growth, Agile and Range. A new research-informed service or location page." },
      { "name": "Copy written from scratch", "price": "Quoted first", "note": "For when there isn't source material to work from. We tell you the price in writing before we start." },
      { "name": "Integrations and custom work", "price": "Quoted first", "note": "Booking platforms, multi-step forms, custom routing, or CRM work beyond a simple embed." },
      { "name": "Major expansion", "price": "Custom quote", "note": "New service lines, large content migrations, or anything that really changes the original scope." }
    ],
    "upgradeRule": "If what you need is more strategy rather than more pages, we'll move you to the package that covers it instead of selling it piece by piece."
  },
  "scopeFaq": {
    "heading": "Questions about scope",
    "topics": [
      "which-package",
      "why-agile-costs-more",
      "why-range-no-price",
      "what-monthly-covers",
      "start-small-move-up"
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

The five `scopeFaq.topics` slugs are defined in Task 2's `faq.json`; the build fails until Task 2 lands, which is why Tasks 1 and 2 share one gate run.

- [ ] **Step 4: Update the page types, the card, and the new bands in `src/pages/packages.astro`**

Replace the `Row` type and the tier card. At the top of the frontmatter:

```ts
type Cell = boolean | string;
type Row = { group: string; feature: string; presence: Cell; growth: Cell; agile: Cell; range: Cell };

const rows = packages.comparison as Row[];
const groups = ['Build', 'Meetings', 'Monthly'].map((name) => ({
  name,
  rows: rows.filter((r) => r.group === name),
}));
```

In the structured data, change `description: tier.bestFor` to `description: tier.sub`.

Replace the tier card section (the `<h2 class="visually-hidden">The three packages</h2>` block through the closing `</section>`) with:

```astro
  <section class="section-tight">
    <div class="container">
      <h2 class="visually-hidden">The four packages</h2>
      <div class="grid grid-2 tier-grid">
        {packages.tiers.map((tier) => (
          <div class="card tier" id={tier.id}>
            <h3 class="tier-name">{tier.name}</h3>
            <p class="serif tier-line">{tier.line}</p>
            <p class="tier-sub">{tier.sub}</p>

            <h4 class="tier-h">Who it's for</h4>
            <p class="tier-who">{tier.who}</p>
            <p class="tier-feeling muted">&ldquo;{tier.feeling}&rdquo;</p>

            <h4 class="tier-h">What we do</h4>
            <ul class="tier-includes">
              {tier.weDo.map((line) => <li>{line}</li>)}
            </ul>

            <h4 class="tier-h">What we don't</h4>
            <ul class="tier-excludes muted">
              {tier.weDont.map((line) => <li>{line}</li>)}
            </ul>

            <div class="tier-cost">
              <p class="tier-price price">
                {tier.quoted && <span class="tier-from">from </span>}{tier.buildPrice}
                <span class="tier-price-note muted">{tier.buildPriceNote}</span>
              </p>
              <p class="tier-monthly price muted">
                + {tier.quoted ? 'from ' : ''}{tier.monthlyPrice}/month
              </p>
              {tier.quoted && <p class="tier-quoted muted">Quoted after one conversation.</p>}
            </div>

            <a class="btn tier-cta" href={`/start/?tier=${tier.id}`}>{tier.ctaLabel} &rarr;</a>
          </div>
        ))}
      </div>
    </div>
  </section>

  <section class="section section-alt">
    <div class="container">
      <h2 class="serif">{packages.payment.heading}</h2>
      <p class="lead">{packages.payment.lead}</p>
      <div class="grid grid-2 pay-options">
        {packages.payment.options.map((o) => (
          <div class="card">
            <h3>{o.title}</h3>
            <p>{o.body}</p>
          </div>
        ))}
      </div>
      <p>{packages.payment.monthlyStarts}</p>
      <p class="monthly-terms">{packages.payment.terms}</p>
    </div>
  </section>

  <section class="section">
    <div class="container">
      <h2>{packages.sorter.heading}</h2>
      <p class="lead">{packages.sorter.lead}</p>
      <ol class="sorter">
        {packages.sorter.questions.map((q) => (
          <li>
            <p class="sorter-q">{q.q}</p>
            <ul class="sorter-a">
              {q.answers.map((a) => <li><span>{a.a}</span> <strong>{a.package}</strong></li>)}
            </ul>
          </li>
        ))}
      </ol>
    </div>
  </section>
```

In the monthly section, change `grid grid-3 monthly-cols` to `grid grid-2 monthly-cols`, and replace the three closing paragraphs with:

```astro
      <p class="monthly-headline">{packages.monthly.headline}</p>
      <p class="monthly-closing">{packages.monthly.closing}</p>
```

In the comparison table, change `colspan="4"` to `colspan="5"` and the cell array to `([row.presence, row.growth, row.agile, row.range] as Cell[])`. Update the caption to "Everything included in each package: the build, the meetings, and the monthly."

Add to the `<style>` block (keep every existing rule):

```css
  .tier-grid { align-items: stretch; }
  .tier-sub { margin-bottom: var(--space-3); }
  .tier-h { font-size: var(--step-0); margin: var(--space-3) 0 var(--space-0); }
  .tier-feeling { margin-top: var(--space-1); }
  .tier-excludes li { list-style: none; }
  .tier-excludes li::before { content: "\2014  "; }
  .tier-from, .tier-quoted { font-size: var(--step--1); }
  .pay-options { margin: var(--space-3) 0; }
  .sorter { display: grid; gap: var(--space-3); max-width: var(--maxw-prose); padding-left: 1.25rem; }
  .sorter-q { font-weight: 600; margin-bottom: var(--space-0); }
  .sorter-a { list-style: none; padding: 0; display: grid; gap: var(--space-0); }
  .sorter-a strong { color: var(--color-brand); }
```

- [ ] **Step 5: Four tier names in the work collection and the CMS**

`src/content.config.ts` line 9:

```ts
    tier: z.enum(['Presence', 'Growth', 'Agile', 'Range']),
```

`public/admin/config.yml` line 320:

```yaml
      - { name: "tier", label: "Package", widget: "select", options: ["Presence", "Growth", "Agile", "Range"], required: true }
```

In the Packages Page collection (lines 141-190), replace the `bestFor` and `cardIncludes` fields with:

```yaml
              - { name: "sub", label: "Sub-line", widget: "string", required: true }
              - { name: "who", label: "Who it's for", widget: "text", required: true }
              - { name: "feeling", label: "What they're feeling", widget: "text", required: true, hint: "Rendered in quotes." }
              - { name: "weDo", label: "What we do", widget: "list", field: { name: "line", label: "Line", widget: "string" } }
              - { name: "weDont", label: "What we don't", widget: "list", field: { name: "line", label: "Line", widget: "string" } }
              - { name: "quoted", label: "Quoted package", widget: "boolean", default: false, hint: "Range only. Shows 'from' before the prices." }
```

Change the add-on price hint (line 186) to:

```yaml
                  - { name: "price", label: "Price", widget: "string", hint: "Free text, e.g. $150 per page, Quoted first, or Custom quote. Never an hourly rate." }
```

Add, after the `monthly` object, these two objects, and change the comparison row fields from `presence/search/searchPlus` to `presence/growth/agile/range` (same widget and hint as today, one field per tier id):

```yaml
          - name: "payment"
            label: "How you pay"
            widget: "object"
            fields:
              - { name: "heading", label: "Heading", widget: "string", required: true }
              - { name: "lead", label: "Lead", widget: "text", required: true }
              - name: "options"
                label: "Options"
                widget: "list"
                fields:
                  - { name: "title", label: "Title", widget: "string", required: true }
                  - { name: "body", label: "Body", widget: "text", required: true }
              - { name: "monthlyStarts", label: "When the monthly starts", widget: "string", required: true }
              - { name: "terms", label: "Subscription terms", widget: "text", required: true }
          - name: "sorter"
            label: "Which one is you"
            widget: "object"
            fields:
              - { name: "heading", label: "Heading", widget: "string", required: true }
              - { name: "lead", label: "Lead", widget: "text", required: true }
              - name: "questions"
                label: "Questions"
                widget: "list"
                fields:
                  - { name: "q", label: "Question", widget: "string", required: true }
                  - name: "answers"
                    label: "Answers"
                    widget: "list"
                    fields:
                      - { name: "a", label: "Answer", widget: "string", required: true }
                      - { name: "package", label: "Points to", widget: "string", required: true, hint: "A package name, two names, or 'Keep going'." }
```

Remove the `monthly.subscriptionTerms` field from the CMS (it moved to `payment.terms`).

- [ ] **Step 6: Commit (build is verified together with Task 2)**

```bash
git add src/data/packages.json src/pages/packages.astro scripts/verify.mjs src/content.config.ts public/admin/config.yml
git commit -m "Replace three packages with four on the packages page

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Ti4y7Gzbf2CauEELUE5o46"
```

### Task 2: Home, how-it-works, FAQ and start copy

**Files:**
- Modify: `src/data/home.json` (rewrite), `src/data/process.json` (rewrite), `src/data/faq.json` (rewrite)
- Modify: `src/pages/how-it-works.astro` (meetings band, timeline)
- Modify: `src/pages/start/index.astro:13-16`
- Modify: `README.md:14-37`

**Interfaces:**
- Consumes: `packages.tiers` from Task 1 (the home tier strip and the start select render from it).
- Produces: `faq.json` items with slugs `which-package`, `why-agile-costs-more`, `why-range-no-price`, `what-monthly-covers`, `start-small-move-up` that `packages.json.scopeFaq.topics` names. `process.json` gains `meetings` and `timeline`.

- [ ] **Step 1: Rewrite `src/data/home.json`**

```json
{
  "meta": {
    "title": "Keepsite Media | Websites for people with other things to do",
    "description": "We build your website and run it, so you can run your business. Custom sites for busy business owners, kept working month after month. Packages from $1,200."
  },
  "hero": {
    "headline": "Websites for people with other things to do.",
    "sub": "We build it. We keep it working. It stays off your list.",
    "primaryCta": { "label": "See the packages", "href": "/packages/" },
    "secondaryCta": { "label": "Start your site", "href": "/start/" }
  },
  "problem": {
    "heading": "You've been meaning to fix your website for a year.",
    "body": "The work is good. The business is real. The site is the thing you open at 10pm, look at, and close again. That's not a character flaw. It's a job that shouldn't be yours."
  },
  "solution": {
    "heading": "We build it. We keep it useful.",
    "beats": [
      { "title": "We build it.", "body": "A custom site around what your business does and who you want walking in the door. From Growth up, the whole structure comes from research into what your customers search for." },
      { "title": "We keep it working.", "body": "Hosting, maintenance, monitoring, and the small changes that pile up. You send the new photo or the new hours. We put them in." },
      { "title": "We tell you what's working.", "body": "A plain-English summary every quarter. What the site did, what we changed, what we'd do next. No dashboard to log into." }
    ],
    "pullLine": "A website that earns its keep."
  },
  "packages": {
    "heading": "Four ways to work with us.",
    "linkLabel": "See what's included, and what it costs",
    "linkHref": "/packages/"
  },
  "why": {
    "heading": "Why Keepsite",
    "pillars": [
      { "title": "Make it useful.", "body": "Every site has a job. We find out what yours is, build for that, and leave out the rest." },
      { "title": "Keep it simple.", "body": "Three decisions, one round of changes at each, and no homework in between." },
      { "title": "Show your work.", "body": "Clear prices, clear scope, and a summary every quarter you can read in two minutes." },
      { "title": "Build for real life.", "body": "We run businesses too. We know what it's like to be the only one holding it all together. The site fits around your week, not the other way round." }
    ]
  },
  "work": { "heading": "Recent work", "linkLabel": "See all work", "linkHref": "/work/" },
  "closing": { "heading": "Keep your business moving.", "sub": "We'll take care of the website.", "ctaLabel": "Start your site", "ctaHref": "/start/" }
}
```

- [ ] **Step 2: Rewrite `src/data/process.json`**

```json
{
  "meta": {
    "title": "How it works | Keepsite Media",
    "description": "Three stages, three decisions, one round of changes at each. What building a site with Keepsite looks like, how long it takes, and what we need from you."
  },
  "heading": "How it works",
  "lead": "You've already made the decision to hand this off. What's left is three decisions, and we bring you each one when it's ready.",
  "timeline": "Most sites launch four to six weeks after kickoff. The biggest variable is how quickly you reply at each stage.",
  "steps": [
    { "title": "Tell us about your business.", "body": "Eight questions, most of which you can answer off the top of your head. On Growth, Agile and Range there's a kickoff call too, so we hear it in your words." },
    { "title": "Pick a direction.", "body": "We send you one page with four different home page designs on it. You pick the one that looks like your business, then answer two short questionnaires: one on your brand, one to drive the build. From Growth up, research into what your customers search for runs at the same time and shapes what comes next." },
    { "title": "We lay out every page.", "body": "You see every page the site will have and how each one is put together. The words and photos come later." },
    { "title": "We add the words and photos.", "body": "Your copy on Presence, ours from Growth up. You look it over, send your changes in one go, and we launch." },
    { "title": "We keep it working.", "body": "Hosting, maintenance, monitoring, and a summary every quarter. From Growth up, we keep watching search and adjusting. On Agile, we keep meeting." }
  ],
  "pullLine": "Keep it simple.",
  "meetings": {
    "heading": "How often we talk",
    "lead": "No standing meetings on Presence. The others get exactly the ones the work needs.",
    "items": [
      { "name": "Presence", "body": "None scheduled. Everything runs on the questionnaires and email." },
      { "name": "Growth", "body": "A kickoff call, and a check-in at each stage." },
      { "name": "Agile", "body": "A kickoff, a check-in every two weeks during the build, and a strategy meeting every month after launch." },
      { "name": "Range", "body": "A kickoff call, and a check-in at each stage." }
    ]
  },
  "stages": {
    "heading": "The three stages",
    "lead": "Each stage settles one question before the next one starts.",
    "items": [
      {
        "label": "Stage 1",
        "title": "Style",
        "see": "One page you scroll through, with four different home page designs on it. It's there to show you a look, not a finished site: nothing on it is wired up, and none of it is about your business yet.",
        "decide": "Which one looks like your business.",
        "note": "You're picking a direction, not a final design. From there we fit it to your business, your colors, your photos.",
        "tiers": [
          { "name": "Presence", "body": "Pick a direction and this stage is done." },
          { "name": "Growth", "body": "While you're choosing, we're studying the search results you want to win. By stage two we know which pages you need." },
          { "name": "Agile", "body": "We start with longer discovery about where the business is going, then research where the obvious data doesn't exist. The search strategy gets invented here." },
          { "name": "Range", "body": "The same research as Growth, run for every arm of the business." }
        ],
        "terms": [
          { "term": "search strategy", "body": "The plan for which searches your site should show up for, and which pages will do it. Growth, Agile and Range only." }
        ]
      },
      {
        "label": "Stage 2",
        "title": "Function",
        "see": "A layout for every page the site will have. Image areas are outlined boxes and the text is lorem ipsum, the standard placeholder.",
        "decide": "Whether the site has every page you need.",
        "note": "The placeholder text is on purpose. If we filled it in with real words, you'd read them instead of looking at the page, and they aren't written yet.",
        "tiers": [
          { "name": "Presence", "body": "The pages you asked for, in the order that makes sense for them." },
          { "name": "Growth", "body": "The page list comes out of the research, so there are usually service or location pages you hadn't thought to ask for." },
          { "name": "Agile", "body": "More research shapes each page, and the site is built so the strategy can be swapped later without breaking what works." },
          { "name": "Range", "body": "One section per arm, structured so the arms don't compete with each other on Google." }
        ],
        "terms": [
          { "term": "Layout", "body": "The shape of a page: what goes where, and in what order. The floor plan before the furniture." }
        ]
      },
      {
        "label": "Stage 3",
        "title": "Copy and photos",
        "see": "The finished site, with the words and images in place.",
        "decide": "That it's ready to go live.",
        "note": "Your photos, and your copy if you're on Presence, are due before this stage starts. After that it's one last look, then we launch.",
        "tiers": [
          { "name": "Presence", "body": "You send us your words. We edit them and put them in place." },
          { "name": "Growth", "body": "We write your core pages around the research. There's one call first, so we get your tone right." },
          { "name": "Agile", "body": "The same call and the same writing, plus an A/B test where there's a real question to answer." },
          { "name": "Range", "body": "The same writing, for every arm." }
        ],
        "terms": [
          { "term": "Copy", "body": "The words on your website. Headlines, page text, button labels, all of it. Nothing to do with copying anything." },
          { "term": "A/B test", "body": "Two versions of a page shown to different visitors, so the numbers decide which one stays." }
        ]
      }
    ],
    "end": {
      "cue": "And then it's live",
      "label": "Launch",
      "title": "Your site goes live.",
      "body": "That was the last decision. From here the site is ours to keep running, with hosting, maintenance, and monitoring on every package.",
      "tiers": [
        { "name": "Presence", "body": "Hosting, maintenance, monitoring, one change a month, and a plain-English summary every quarter." },
        { "name": "Growth", "body": "All of that, plus search monitoring and updates tied to your search goals." },
        { "name": "Agile", "body": "All of that, plus a strategy meeting every month, ongoing research, and tests." },
        { "name": "Range", "body": "Growth's after-launch work, for every arm." }
      ],
      "terms": [
        { "term": "Monitoring", "body": "We watch the site for outages, broken pages, and errors, so problems get caught before you notice them." }
      ]
    },
    "tiersLabel": "What changes by package"
  },
  "changes": {
    "heading": "One round of changes at every stage.",
    "body": "Changes cost the least while the site is still rough, so that's where we put them. If none of the four directions works, we show you more. If a page is laid out wrong, we redo it while it's still empty. The last round is for the finished site, once the words and photos are in."
  },
  "needFromYou": {
    "heading": "What we need from you",
    "items": [
      "Accurate information about your business: what you do, where, for whom, your hours, and anything a customer would ask.",
      "A pick from the four directions we show you at stage one.",
      "Your photos and logo, and your copy if you're on Presence, by the start of stage three.",
      "A reply at each stage. On Growth, Agile and Range, the calls listed above."
    ]
  },
  "wontHaveTo": {
    "heading": "What you won't have to do",
    "items": [
      "No web-building homework.",
      "No blank page to stare at.",
      "No logging into anything.",
      "No switching off the tools you already use.",
      "No decisions about hosting, plugins, or platforms."
    ]
  },
  "signature": null,
  "closing": { "heading": "Keep your business moving.", "sub": "We'll take care of the website.", "ctaLabel": "Start your site", "ctaHref": "/start/" }
}
```

- [ ] **Step 3: Render the timeline and the meetings band in `src/pages/how-it-works.astro`**

After `<p class="lead">{process.lead}</p>` (line 84) add:

```astro
      <p class="timeline muted">{process.timeline}</p>
```

After the `.changes` div and before the `</div></section>` that closes the stages section, add:

```astro
      <div class="meetings">
        <h3>{process.meetings.heading}</h3>
        <p class="muted">{process.meetings.lead}</p>
        <dl class="tier-list">
          {process.meetings.items.map((m) => (
            <>
              <dt>{m.name}</dt>
              <dd>{m.body}</dd>
            </>
          ))}
        </dl>
      </div>
```

Add to the style block: `.timeline { margin-top: var(--space-1); } .meetings { margin-top: var(--space-5); max-width: var(--maxw-prose); }`.

- [ ] **Step 4: Rewrite `src/data/faq.json`**

```json
{
  "meta": {
    "title": "FAQ | Keepsite Media",
    "description": "Which package, what the monthly covers, how you can pay, how long it takes, and what we need from you."
  },
  "intro": "The questions people ask most, answered straight. If yours isn't here, ask us on the Start page and we'll answer it.",
  "groups": [
    {
      "title": "Getting started",
      "items": [
        { "topic": "how-to-start", "q": "How do we start?", "a": "Fill out the form on the Start page. Tell us what your business does and which package you're leaning toward, or say you're not sure. We reply within one business day with one recommendation and what it would cost." },
        { "topic": "how-long", "q": "How long does a site take?", "a": "Most sites launch four to six weeks after kickoff. The biggest variable is how quickly you reply at each stage. Range depends on how many arms the business has, and the quote says how long." },
        { "topic": "what-we-need", "q": "What do you need from me?", "a": "Accurate information about your business, a pick from the four directions we show you, and your photos and logo. On Presence you also supply the copy. From Growth up, we write it, after one call to get your tone right." },
        { "topic": "do-we-meet", "q": "Do we have to meet?", "a": "Not on Presence. Growth and Range get a kickoff call and a check-in at each stage. Agile gets a check-in every two weeks during the build and a strategy meeting every month after launch. Nothing else is a meeting unless you want it to be." },
        { "topic": "how-build-works", "q": "How does the build actually work?", "a": "Three stages. First we send one page with four different home page designs on it, and you pick the direction that fits your business. Then we lay out every page in placeholder text so you can check the site has everything it needs. Then the words and photos go in, you send your changes in one go, and we launch." },
        { "topic": "placeholder-text", "q": "Why is the text nonsense in the layout stage?", "a": "Because stage two is about the shape of the site, not the wording. If we dropped in stand-in headlines and stock photos, you'd spend the review reacting to words that aren't written yet. Outlined boxes and placeholder text keep the question simple: does the site have every page it needs?" },
        { "topic": "rounds-of-changes", "q": "How many rounds of changes do I get?", "a": "One at each stage, three in total. That covers a style you don't like, a page we laid out wrong, and anything off in the finished site. Reopening a stage after it's closed is quoted in writing before we start." }
      ]
    },
    {
      "title": "Picking a package",
      "items": [
        { "topic": "which-package", "q": "Which package is right for me?", "a": "If people already find you and just need somewhere to land, Presence. If you want customers to find you through Google and can say in a few words what they'd search, Growth. If your offering is new or still taking shape and nobody is searching for it in a tidy phrase yet, Agile. If you're really several businesses under one roof, Range. Tell us on the Start page and we'll say which one, and why not the ones either side of it." },
        { "topic": "why-agile-costs-more", "q": "Why does Agile cost more than Growth?", "a": "It isn't the same build. There's no search playbook for what you do yet, so more research goes into every page, we test where it matters, and we build the site so we can change the strategy later without tearing out what works. Then we stay in it with you, with a meeting every month. The price is more of us, not a penalty for being unusual." },
        { "topic": "why-range-no-price", "q": "Why doesn't Range have a fixed price?", "a": "Because it's several businesses in one, and we price each arm on its own. We publish the floor, from $2,100 to build and from $350 a month, and quote the rest after one conversation." },
        { "topic": "start-small-move-up", "q": "Can I start with Presence and move up later?", "a": "Yes. But moving to Growth means restructuring the site around the research, not adding a page, so it's a real piece of work. If you're likely to want search within a year, start on Growth. Moving down happens at your renewal date." },
        { "topic": "no-monthly", "q": "Do you build sites without a monthly plan?", "a": "No. A site nobody maintains slowly stops being useful, and keeping it useful is the thing we actually sell. Every build comes with the monthly that keeps it running." },
        { "topic": "cheaper-option", "q": "Someone else is much cheaper with nothing up front. What's the difference?", "a": "Usually that's a template from a portfolio, edited to fit you, on a shared platform. Ours is designed for your business from scratch, and from Growth up the whole structure comes from research into the searches you want to win. If a template is all you need, that's a fine option and we'll say so." }
      ]
    },
    {
      "title": "Paying",
      "items": [
        { "topic": "what-monthly-covers", "q": "What does the monthly cover?", "a": "On every package: hosting, maintenance, monitoring, the changes you send us, and a plain-English summary every quarter. Presence includes one change a month. Growth adds search monitoring and updates to pages tied to your search goals. Agile adds a strategy meeting every month, ongoing research, and tests. Range is scoped per arm in the quote." },
        { "topic": "just-hosting", "q": "Is the monthly just hosting?", "a": "No. Hosting is one small line inside it. The rest is maintenance, monitoring, the changes you send, and from Growth up, the search work that keeps the site showing up." },
        { "topic": "pay-over-time", "q": "Can I pay over time?", "a": "Yes. The standard is half the build at kickoff and half at launch. Or spread the build over twelve monthly payments of nine percent of the build price, on any package. The monthly fee starts the day the site goes live." },
        { "topic": "locked-in", "q": "Am I locked into a contract?", "a": "Every package runs on a 12-month term from launch and renews a year at a time unless you tell us otherwise before it ends. You can cancel mid-term with 30 days' notice, but the months left in that term are still due. The 12 months exist because the work is planned as a year, not because we want to hold on to you." },
        { "topic": "if-i-stop", "q": "What happens if I stop?", "a": "Your domain is yours and your content is yours. We'll help you move them wherever you're going. The site itself comes offline at the end of the term, and we hand over the code." }
      ]
    },
    {
      "title": "The work",
      "items": [
        { "topic": "ai-writing", "q": "Is this just an AI writing my site?", "a": "No. From Growth up, before a page is written we study what your ideal customer actually types into Google, look at who shows up for those searches now and why, and plan the site around it. Then we write to that plan, in your tone, after a call with you. Tools help us move faster. The judgment is ours." },
        { "topic": "who-writes-copy", "q": "Who writes the copy?", "a": "On Presence, you provide the words and we edit and place them. From Growth up, we write the copy for your core pages around the research. Either way you see it before it goes live." },
        { "topic": "no-copy", "q": "What if I don't have copy?", "a": "From Growth up that's already covered, because writing the core pages is part of the build. On Presence, if there's nothing to work from, we can write it from scratch and quote that in writing first, or you can move up to Growth." },
        { "topic": "switch-tools", "q": "Do I have to switch off the tools I already use?", "a": "No. We build around what's working: your booking link, your inquiry email, your Instagram, your CRM. Nothing gets ripped out." },
        { "topic": "edit-myself", "q": "Can I update the site myself?", "a": "No, and that's on purpose. You send us the copy or the photo, we make the change. Nothing to learn, nothing to break. Presence includes one change a month; the others cover a few." },
        { "topic": "burned-before", "q": "I've been burned by a web guy before.", "a": "Fair. Tell us what happened. Then we'll tell you exactly what we deliver, at each of the three stages, and when. Everything is written down in the agreement before any money moves, including what isn't included." }
      ]
    },
    {
      "title": "Extras and ownership",
      "items": [
        { "topic": "new-page", "q": "What if I need a new page?", "a": "A standard page is $150. A research-informed search page, on Growth, Agile or Range, is $225. An extra change beyond what your monthly covers is $60. If what you need is more strategy rather than more pages, we'll move you to the package that covers it instead of selling it piece by piece." },
        { "topic": "domain", "q": "Who owns my domain?", "a": "You do. It's registered in your name, on your account, and it stays yours no matter what happens with us. If you don't have one yet, we'll walk you through buying it." },
        { "topic": "business-types", "q": "What kinds of businesses do you work with?", "a": "Local service businesses, trades, salons, studios, clinics, shops, rental companies, and independent professionals, mostly around Utah. If your customers find you in person, we can give them somewhere to land. If they find you on Google, we can make sure they do." }
      ]
    }
  ],
  "closing": { "heading": "Keep your business moving.", "sub": "We'll take care of the website.", "ctaLabel": "Start your site", "ctaHref": "/start/" }
}
```

- [ ] **Step 5: Start page lead and README**

`src/pages/start/index.astro` lines 13-16:

```astro
      <p class="lead">
        Tell us what's eating your time. We'll reply with one recommendation and what it costs.
        No sales call, unless you'd rather talk.
      </p>
```

`README.md` lines 14-37: change "the three tier prices" to "the four tier prices"; replace the two bullets under "Two other files quote prices" with:

- `src/data/home.json` — the meta description mentions the starting price ("Packages from $1,200").
- `src/data/faq.json` — answers quote the add-on prices ($60, $150, $225) and Range's floor ($2,100, $350).

Add a sentence: "Add-on prices are flat or 'Quoted first'. The verifier fails the build if any page states an hourly rate."

- [ ] **Step 6: Build and verify**

Run: `npm run check && npm run build && npm run verify`
Expected: `astro check` clean; verify prints every check ok, including `no hourly rate on any page`, `prices are the new ones`, `every price in the FAQ answers comes from packages.json`, `Service prices match the rendered prices`, `FAQPage lives only on /faq/`.

- [ ] **Step 7: Read every page in the style checklist**

Open `dist/index.html`, `dist/packages/index.html`, `dist/how-it-works/index.html`, `dist/faq/index.html`, `dist/start/index.html` (or the dev server) and check: first-read clarity, each package headline describes a person, relief is obvious, "what's not included" appears per package, none of the avoid-list words, no wedding references, Agile framed as more research and a different build. Fix copy in the JSON, rebuild, re-verify.

- [ ] **Step 8: Commit**

```bash
git add src/data/home.json src/data/process.json src/data/faq.json src/pages/how-it-works.astro src/pages/start/index.astro README.md
git commit -m "Rewrite public copy for the four packages

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Ti4y7Gzbf2CauEELUE5o46"
```

### Task 3: Office tiers and retired tier names

**Files:**
- Modify: `netlify/functions/lib/office/clients.mjs:26-32`
- Modify: `netlify/functions/lib/office/actions/client.mjs:46-52`
- Modify: `src/components/office/ClientFields.astro`
- Modify: `src/pages/office/clients/[slug].astro:539`
- Test: `netlify/functions/lib/office/clients.test.mjs`, `netlify/functions/lib/office/actions/client.test.mjs`, and every test fixture that names a tier

**Interfaces:**
- Consumes: `TIERS` (now the four names) from `clients.mjs`.
- Produces: `validateClient(fields, existing = null)` — a tier not in `TIERS` is accepted only when `existing?.tier` equals it. `isRetiredTier(name)` exported from `clients.mjs`: `Boolean(name) && !TIERS.includes(name)`.

- [ ] **Step 1: Write the failing tests**

In `netlify/functions/lib/office/clients.test.mjs` change `good` to use `tier: 'Growth'`, and replace the `validateClient` test with:

```js
test('validateClient requires name, business and a plausible email', () => {
  assert.deepEqual(validateClient(good), []);
  assert.match(validateClient({ ...good, name: '' }).join(), /name/);
  assert.match(validateClient({ ...good, email: 'nope' }).join(), /email/);
  assert.match(validateClient({ ...good, tier: 'Gold' }).join(), /tier/);
  assert.deepEqual(validateClient({ ...good, tier: '' }), []);
  assert.deepEqual(TIERS, ['Presence', 'Growth', 'Agile', 'Range']);
});

// Clients stored before the four packages carry "Search" or "Search Plus".
// They keep working untouched; the first edit has to move them.
test('validateClient keeps a retired tier only while it is unchanged', () => {
  const stored = { ...good, tier: 'Search' };
  assert.deepEqual(validateClient({ ...good, tier: 'Search' }, stored), []);
  assert.match(validateClient({ ...good, tier: 'Search' }, { ...good, tier: 'Growth' }).join(), /tier/);
  assert.match(validateClient({ ...good, tier: 'Search Plus' }, stored).join(), /tier/);
  assert.match(validateClient({ ...good, tier: 'Search' }).join(), /tier/);
  assert.equal(isRetiredTier('Search'), true);
  assert.equal(isRetiredTier('Growth'), false);
  assert.equal(isRetiredTier(''), false);
});
```

Add `isRetiredTier` to the import line.

In `netlify/functions/lib/office/actions/client.test.mjs` change `good` to `tier: 'Growth'` and add:

```js
test('update keeps a stored retired tier but refuses a different retired one', async () => {
  const s = await make();
  await s.clients.put('lova', { slug: 'lova', name: 'Sierra', business: 'Lova', email: 's@example.com', tier: 'Search', pipeline: 'website', stage: 'inquiry', stages: [], dates: {}, createdAt: 'x' });
  let res = await client(post({ csrf, op: 'update', slug: 'lova', name: 'Sierra', business: 'Lova', email: 's@example.com', tier: 'Search' }), ctx(), s);
  assert.equal(res.headers.get('Location'), '/office/clients/lova/');
  res = await client(post({ csrf, op: 'update', slug: 'lova', name: 'Sierra', business: 'Lova', email: 's@example.com', tier: 'Search Plus' }), ctx(), s);
  assert.match(res.headers.get('Location'), /error=.*tier/);
});
```

(`make`, `post`, `ctx` and `csrf` follow the same shape as in `task.test.mjs`; reuse the ones already in `client.test.mjs`.)

Replace every `tier: 'Search'` / `'Search Plus'` / `package: 'Search'` in these fixtures with `'Growth'`: `inquiry.test.mjs` (both lines; the assertion becomes `assert.equal(c.tier, 'Growth')`), `sign.test.mjs`, `stripe-webhook.test.mjs`, `payments.test.mjs` (fixture tier; and the `tierPrices` assertions become `assert.deepEqual(tierPrices('Growth'), { build: 180000, monthly: 16000 }); assert.deepEqual(tierPrices('Presence'), { build: 120000, monthly: 6000 });` and the two `amount: 5500, description: 'Presence monthly'` calls become `amount: 6000`), `actions/agreement.test.mjs`, `actions/document.test.mjs`, `actions/payment.test.mjs`, `agreements.test.mjs`. Leave `template: 'search'` in `agreement.test.mjs` and `pdf.test.mjs` for now; Task 7 changes them.

- [ ] **Step 2: Run the tests and see them fail**

Run: `node --test netlify/functions/lib/office/clients.test.mjs netlify/functions/lib/office/actions/client.test.mjs netlify/functions/lib/office/payments.test.mjs`
Expected: FAIL on `isRetiredTier` not exported, the retired-tier cases, and the new `tierPrices` numbers.

- [ ] **Step 3: Implement**

`clients.mjs`:

```js
export const isRetiredTier = (name) => Boolean(name) && !TIERS.includes(name);

export function validateClient(fields, existing = null) {
  const errors = [];
  if (!fields.name) errors.push('name is required');
  if (!fields.business) errors.push('business is required');
  if (!EMAIL.test(fields.email ?? '')) errors.push('email does not look like an address');
  // A retired tier stays valid only while it is left alone, so old clients
  // keep working and the first edit moves them to a current package.
  const keepsRetired = isRetiredTier(fields.tier) && existing?.tier === fields.tier;
  if (fields.tier && !TIERS.includes(fields.tier) && !keepsRetired) errors.push(`tier must be one of ${TIERS.join(', ')}`);
  return errors;
}
```

`actions/client.mjs` update branch: `const errors = validateClient(fields, existing);`.

`ClientFields.astro`:

```astro
---
import { TIERS, isRetiredTier } from '../../../netlify/functions/lib/office/clients.mjs';
interface Props { client?: Record<string, string> }
const c = Astro.props.client ?? {};
const retired = isRetiredTier(c.tier ?? '');
---
```

and in the select, before the `TIERS.map`:

```astro
      {retired && <option value={c.tier} selected>{c.tier} (retired)</option>}
```

In `[slug].astro` line 539 change `{client.tier || 'Presence'}` to `{client.tier || 'the template'}`.

- [ ] **Step 4: Run the whole office suite**

Run: `node --test`
Expected: PASS everywhere except `agreement-templates.test.mjs` (`['presence','search','search-plus']` still true, so it passes) — all green.

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/lib/office src/components/office/ClientFields.astro "src/pages/office/clients/[slug].astro"
git commit -m "Accept the four tiers and keep retired ones read-only

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Ti4y7Gzbf2CauEELUE5o46"
```

### Task 4: Per-tier and repeating pipeline tasks

**Files:**
- Modify: `netlify/functions/lib/office/dates.mjs`
- Create: `netlify/functions/lib/office/recurrence.mjs`, `netlify/functions/lib/office/recurrence.test.mjs`
- Modify: `netlify/functions/lib/office/pipeline.mjs:9-58`, `:61-105`
- Modify: `netlify/functions/lib/office/actions/task.mjs:40-52`
- Modify: `src/components/office/TaskRow.astro:24-27`
- Modify: `src/data/office/pipelines.json`
- Test: `dates.test.mjs`, `pipeline.test.mjs`, `actions/task.test.mjs`

**Interfaces:**
- Produces:
  - `addMonths(ymd, n)` in `dates.mjs`: same day `n` months later, clamped to that month's last day.
  - `recurrence.mjs`: `REPEATS = ['weekly', 'biweekly', 'monthly', 'quarterly', 'yearly']`; `isRepeat(v)`; `nextDue(ymd, repeat)`; `nextTask(task, now)` returning a new task document (fresh `id` from `newId(now)`, `due: nextDue(task.due, task.repeat)`, `done: false`, `doneAt: null`, `createdAt: now.toISOString()`, everything else copied); `repeatLabel(repeat)` → `'weekly' | 'every two weeks' | 'monthly' | 'quarterly' | 'yearly'`.
  - Pipeline task fields `tiers?: string[]` and `repeat?: string`; task documents carry `repeat: string | null`.

- [ ] **Step 1: Failing test for `addMonths`**

Append to `netlify/functions/lib/office/dates.test.mjs`:

```js
test('addMonths keeps the day and clamps to the end of a short month', () => {
  assert.equal(addMonths('2026-01-31', 1), '2026-02-28');
  assert.equal(addMonths('2026-03-15', 3), '2026-06-15');
  assert.equal(addMonths('2026-11-30', 3), '2027-02-28');
  assert.equal(addMonths('2028-01-31', 1), '2028-02-29');
  assert.equal(addMonths('2026-05-31', 12), '2027-05-31');
});
```

Add `addMonths` to that file's import. Run: `node --test netlify/functions/lib/office/dates.test.mjs` — expected FAIL, not exported.

- [ ] **Step 2: Implement `addMonths` in `dates.mjs`**

```js
export function addMonths(ymd, n) {
  const [y, m, d] = parts(ymd);
  const first = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(d, last))).toISOString().slice(0, 10);
}
```

Run the dates test: PASS.

- [ ] **Step 3: Failing tests for `recurrence.mjs`**

Create `netlify/functions/lib/office/recurrence.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { REPEATS, isRepeat, nextDue, nextTask, repeatLabel } from './recurrence.mjs';

const NOW = new Date('2026-09-20T16:00:00Z');
const task = {
  id: '20260912T020750tuf2fw', slug: 'lova', title: 'Strategy meeting', due: '2026-09-15', time: '10:00',
  done: true, doneAt: '2026-09-20T16:00:00.000Z', source: 'pipeline', stage: 'live',
  questionnaire: null, payment: null, agreement: null, notes: 'bring numbers', repeat: 'monthly', createdAt: '2026-08-15T00:00:00.000Z',
};

test('the repeat vocabulary', () => {
  assert.deepEqual(REPEATS, ['weekly', 'biweekly', 'monthly', 'quarterly', 'yearly']);
  assert.equal(isRepeat('biweekly'), true);
  assert.equal(isRepeat('daily'), false);
  assert.equal(isRepeat(null), false);
});

test('nextDue steps from the due date, not from today', () => {
  assert.equal(nextDue('2026-09-15', 'weekly'), '2026-09-22');
  assert.equal(nextDue('2026-09-15', 'biweekly'), '2026-09-29');
  assert.equal(nextDue('2026-09-15', 'monthly'), '2026-10-15');
  assert.equal(nextDue('2026-01-31', 'monthly'), '2026-02-28');
  assert.equal(nextDue('2026-09-15', 'quarterly'), '2026-12-15');
  assert.equal(nextDue('2026-09-15', 'yearly'), '2027-09-15');
  assert.throws(() => nextDue('2026-09-15', 'daily'), /repeat/);
});

test('nextTask copies the task forward with a fresh id and an open state', () => {
  const n = nextTask(task, NOW);
  assert.notEqual(n.id, task.id);
  assert.equal(n.due, '2026-10-15');
  assert.equal(n.done, false);
  assert.equal(n.doneAt, null);
  assert.equal(n.createdAt, NOW.toISOString());
  assert.equal(n.time, '10:00');
  assert.equal(n.notes, 'bring numbers');
  assert.equal(n.stage, 'live');
  assert.equal(n.repeat, 'monthly');
  assert.equal(n.source, 'pipeline');
});

test('repeatLabel reads like a sentence', () => {
  assert.equal(repeatLabel('biweekly'), 'every two weeks');
  assert.equal(repeatLabel('weekly'), 'weekly');
  assert.equal(repeatLabel('quarterly'), 'quarterly');
});
```

Run: `node --test netlify/functions/lib/office/recurrence.test.mjs` — expected FAIL, module not found.

- [ ] **Step 4: Implement `recurrence.mjs`**

```js
// A repeating task is not a schedule: marking one done creates the next one
// from its own due date, so a late completion does not drift the cadence.
import { addDays, addMonths } from './dates.mjs';
import { newId } from './ids.mjs';

export const REPEATS = ['weekly', 'biweekly', 'monthly', 'quarterly', 'yearly'];
export const isRepeat = (v) => REPEATS.includes(v);

const STEP = {
  weekly: (d) => addDays(d, 7),
  biweekly: (d) => addDays(d, 14),
  monthly: (d) => addMonths(d, 1),
  quarterly: (d) => addMonths(d, 3),
  yearly: (d) => addMonths(d, 12),
};

export function nextDue(ymd, repeat) {
  if (!isRepeat(repeat)) throw new Error(`unknown repeat: ${repeat}`);
  return STEP[repeat](ymd);
}

export function nextTask(task, now = new Date()) {
  return { ...task, id: newId(now), due: nextDue(task.due, task.repeat), done: false, doneAt: null, createdAt: now.toISOString() };
}

const LABEL = { weekly: 'weekly', biweekly: 'every two weeks', monthly: 'monthly', quarterly: 'quarterly', yearly: 'yearly' };
export const repeatLabel = (repeat) => LABEL[repeat] ?? '';
```

Run the recurrence test: PASS.

- [ ] **Step 5: Failing tests for pipeline validation and tier filtering**

In `pipeline.test.mjs` add to `validatePipelines names what is wrong`:

```js
  assert.match(validatePipelines([{ id: 'a', name: 'x', stages: [{ id: 's', name: 'S', tasks: [{ title: 't', due: 1, tiers: ['Gold'] }] }] }]).join(), /tiers/);
  assert.match(validatePipelines([{ id: 'a', name: 'x', stages: [{ id: 's', name: 'S', tasks: [{ title: 't', due: 1, tiers: 'Agile' }] }] }]).join(), /tiers/);
  assert.match(validatePipelines([{ id: 'a', name: 'x', stages: [{ id: 's', name: 'S', tasks: [{ title: 't', due: 1, repeat: 'daily' }] }] }]).join(), /repeat/);
  assert.match(validatePipelines([{ id: 'a', name: 'x', stages: [{ id: 's', name: 'S', tasks: [{ title: 't', due: 1, tiers: ['Agile'], repeat: 'monthly' }] }] }]).join(), /^$/);
```

Add these tests:

```js
test('advancing creates only the tasks whose tiers include the client', () => {
  const pipeline = { id: 'p', name: 'P', stages: [{ id: 's', name: 'S', tasks: [
    { title: 'Everyone', due: 1 },
    { title: 'Agile only', due: 2, tiers: ['Agile'], repeat: 'biweekly' },
    { title: 'Growth and Range', due: 3, tiers: ['Growth', 'Range'] },
  ] }] };
  const agile = advance({ client: { ...fresh(), tier: 'Agile' }, pipeline, stageId: 's', today: '2026-09-04', now: NOW });
  assert.deepEqual(agile.tasks.map((t) => [t.title, t.repeat]), [['Everyone', null], ['Agile only', 'biweekly']]);
  const range = advance({ client: { ...fresh(), tier: 'Range' }, pipeline, stageId: 's', today: '2026-09-04', now: NOW });
  assert.deepEqual(range.tasks.map((t) => t.title), ['Everyone', 'Growth and Range']);
  const undecided = advance({ client: { ...fresh(), tier: '' }, pipeline, stageId: 's', today: '2026-09-04', now: NOW });
  assert.deepEqual(undecided.tasks.map((t) => t.title), ['Everyone']);
});

test('the seed gives each tier the meetings the package promises', () => {
  const p = website();
  const titles = (tier, stage) => advance({ client: { ...fresh(), tier }, pipeline: p, stageId: stage, today: '2026-09-04', now: NOW }).tasks.map((t) => t.title);
  assert.ok(titles('Growth', 'agreement').includes('Kickoff call'));
  assert.ok(!titles('Presence', 'agreement').includes('Kickoff call'));
  assert.ok(titles('Agile', 'intro').includes('Discovery session'));
  assert.ok(titles('Agile', 'layouts').includes('Research check-in'));
  assert.ok(titles('Growth', 'layouts').includes('Stage check-in'));
  assert.deepEqual(titles('Agile', 'live'), ['Strategy meeting', 'Research and test review', 'Search summary to client', 'Annual recap']);
  assert.deepEqual(titles('Presence', 'live'), ['Analytics summary to client', 'Annual recap']);
  assert.deepEqual(titles('Range', 'live'), ['Search summary to client', 'Annual recap']);
});
```

Run: `node --test netlify/functions/lib/office/pipeline.test.mjs` — expected FAIL (no tiers validation; `repeat` undefined; seed lacks the tasks).

- [ ] **Step 6: Implement in `pipeline.mjs`**

Add imports:

```js
import { TIERS } from './clients.mjs';
import { isRepeat } from './recurrence.mjs';
```

In `validatePipelines`, after the `agreement` check inside the task loop:

```js
        if (t.tiers !== undefined) {
          if (!Array.isArray(t.tiers) || t.tiers.length === 0) errors.push(`${tat}: tiers must be a non-empty list`);
          else for (const name of t.tiers) if (!TIERS.includes(name)) errors.push(`${tat}: tiers names unknown tier "${name}"`);
        }
        if (t.repeat !== undefined && !isRepeat(t.repeat)) errors.push(`${tat}: repeat must be weekly, biweekly, monthly, quarterly or yearly`);
```

In `advance`, replace `stage.tasks.map((t) => ({` with

```js
  // A task that names tiers is for those packages only; an undecided tier
  // gets the tasks every package shares and nothing more.
  const forTier = (t) => !t.tiers || t.tiers.includes(client.tier);
  const tasks = first
    ? stage.tasks.filter(forTier).map((t) => ({
```

and add `repeat: t.repeat ?? null,` after `agreement: t.agreement ?? null,`.

- [ ] **Step 7: Add the seeded tasks to `src/data/office/pipelines.json`**

Append to each stage's `tasks` (keep the existing entries first):

- `agreement`: `{ "title": "Kickoff call", "due": 3, "tiers": ["Growth", "Agile", "Range"] }`
- `intro`: `{ "title": "Discovery session", "due": 3, "tiers": ["Agile"] }`
- `demo`: `{ "title": "Research check-in", "due": 7, "tiers": ["Agile"], "repeat": "biweekly" }`
- `post-demo`: `{ "title": "Research check-in", "due": 7, "tiers": ["Agile"], "repeat": "biweekly" }`
- `layouts`: `{ "title": "Stage check-in", "due": 5, "tiers": ["Growth", "Range"] }`, `{ "title": "Research check-in", "due": 7, "tiers": ["Agile"], "repeat": "biweekly" }`
- `copy`: the same two as `layouts`
- `live` (currently `[]`):

```json
        "tasks": [
          { "title": "Strategy meeting", "due": 30, "tiers": ["Agile"], "repeat": "monthly" },
          { "title": "Research and test review", "due": 30, "tiers": ["Agile"], "repeat": "monthly" },
          { "title": "Search summary to client", "due": 90, "tiers": ["Growth", "Agile", "Range"], "repeat": "quarterly" },
          { "title": "Analytics summary to client", "due": 90, "tiers": ["Presence"], "repeat": "quarterly" },
          { "title": "Annual recap", "due": 365, "repeat": "yearly" }
        ]
```

Run `node --test netlify/functions/lib/office/pipeline.test.mjs` and `node scripts/check-office.mjs`: PASS, no errors.

- [ ] **Step 8: Failing test for `done` on a repeating task**

Append to `actions/task.test.mjs`:

```js
// A repeating task rolls forward only while the client is still in the
// stage that created it, so build-phase check-ins stop at launch and Live
// tasks run for as long as the client is live.
test('done on a repeating task creates the next one while the stage matches', async () => {
  const s = await make();
  await s.clients.put('lova', { slug: 'lova', business: 'Lova', stage: 'live' });
  const base = { slug: 'lova', title: 'Strategy meeting', due: '2026-09-15', time: null, done: false, doneAt: null, source: 'pipeline', stage: 'live', questionnaire: null, payment: null, agreement: null, notes: '', createdAt: 'x' };
  await s.tasks.put('lova', 'a', { ...base, id: 'a', repeat: 'monthly' });
  await task(post({ csrf, op: 'done', slug: 'lova', id: 'a' }), ctx(), s, new Date('2026-09-16T00:00:00Z'));
  let open = (await s.tasks.list('lova')).filter((t) => !t.done);
  assert.equal(open.length, 1);
  assert.equal(open[0].due, '2026-10-15');
  assert.equal(open[0].repeat, 'monthly');
  // Replayed done: nothing new.
  await task(post({ csrf, op: 'done', slug: 'lova', id: 'a' }), ctx(), s, new Date('2026-09-17T00:00:00Z'));
  assert.equal((await s.tasks.list('lova')).length, 2);
  // Stage moved on: the check-in closes and stops.
  await s.clients.put('lova', { slug: 'lova', business: 'Lova', stage: 'live' });
  await s.tasks.put('lova', 'b', { ...base, id: 'b', title: 'Research check-in', stage: 'copy', repeat: 'biweekly' });
  await task(post({ csrf, op: 'done', slug: 'lova', id: 'b' }), ctx(), s);
  assert.equal((await s.tasks.list('lova')).filter((t) => t.title === 'Research check-in').length, 1);
});
```

The store's `tasks.put` validates ids with `ID` from `ids.mjs`; if `'a'` is refused, use `newId(new Date('2026-09-01T00:00:00Z'))` and `newId(new Date('2026-09-02T00:00:00Z'))` for the two ids.

Run: `node --test netlify/functions/lib/office/actions/task.test.mjs` — expected FAIL (only one task after done).

- [ ] **Step 9: Implement in `actions/task.mjs`**

Change the `slug` lookup to keep the client, and the `done` branch:

```js
  const client = await s.clients.get(slug);
  if (!client) return problem(404, 'no such client');
```

```js
  if (op === 'done') {
    if (!existing.done) {
      await s.tasks.put(slug, id, { ...existing, done: true, doneAt: at });
      if (isRepeat(existing.repeat) && existing.stage === client.stage) {
        const next = nextTask(existing, now);
        await s.tasks.put(slug, next.id, next);
      }
    }
  } else if (op === 'reopen') ...
```

Add `import { isRepeat, nextTask } from '../recurrence.mjs';`. In the `add` branch add `repeat: null,` to the stored document.

Run the task tests: PASS.

- [ ] **Step 10: Show the repeat in `TaskRow.astro`**

Import `repeatLabel` from `../../../netlify/functions/lib/office/recurrence.mjs` and change the meta span to:

```astro
    {(t.source === 'pipeline' && t.stage) || t.repeat ? (
      <span class="meta">
        {t.source === 'pipeline' && t.stage && <> · {stageNames[t.stage] ?? t.stage}</>}
        {t.repeat && <> · {repeatLabel(t.repeat)}</>}
      </span>
    ) : null}
```

- [ ] **Step 11: Full unit run and commit**

Run: `node --test && node scripts/check-office.mjs` — PASS.

```bash
git add netlify/functions/lib/office src/components/office/TaskRow.astro src/data/office/pipelines.json
git commit -m "Add per-tier and repeating pipeline tasks

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Ti4y7Gzbf2CauEELUE5o46"
```

### Task 5: Converter emits the tier and maps the new Schedule 1 and Exhibit A rows

**Files:**
- Modify: `scripts/agreement-from-docx.py`

**Interfaces:**
- Produces: generated JSON gains top-level `tier` (the subtitle minus " Package", e.g. `"Growth"`); Schedule 1 row `Payment plan (Section 2.1)` maps to `{{paymentPlan}}`; an Exhibit A row labelled `Business arms covered` maps to `{{arms}}`.

- [ ] **Step 1: Record the current output as the baseline**

Run: `python3 scripts/agreement-from-docx.py ../legal/backup-2026-09-12/search-agreement.docx search > /tmp/claude-1000/before-search.json && diff <(python3 -c "import json;d=json.load(open('/tmp/claude-1000/before-search.json'));print(d['version'])") <(python3 -c "import json;d=json.load(open('src/data/office/agreements/search.json'));print(d['version'])") && echo same-version`
Expected: `same-version` (the backup is the docx the committed JSON came from).

- [ ] **Step 2: Edit the converter**

Add to `SCHEDULE_TERMS`:

```python
    'Payment plan (Section 2.1)': '{{paymentPlan}}',
```

Add after `EXHIBIT_D_MONTHLY`:

```python
# Range lists the arms of the business in Exhibit A; the office prompts for
# them when the draft is created, like every other Schedule value.
EXHIBIT_A = {
    'Business arms covered': '{{arms}}',
}
```

In `main`, add `exhibit = None` next to `section = None`. In the table branch, before the `elif section == 'discount'` line:

```python
            elif exhibit == 'a':
                rows = map_rows(rows, EXHIBIT_A)
```

In the paragraph branch, right before `if style == 'Heading 1' and text.startswith('EXHIBIT D'):`:

```python
        if style == 'Heading 1':
            exhibit = 'a' if text.startswith('EXHIBIT A') else None
```

In the `out` dict add `'tier': raw[1][2].replace(' Package', '')` after `'name'`. Keep `version` computed from `blocks` only, so the tier field does not move the hash.

- [ ] **Step 3: Check the change is additive**

Run: `python3 scripts/agreement-from-docx.py ../legal/backup-2026-09-12/search-agreement.docx search > /tmp/claude-1000/after-search.json && python3 -c "
import json
a=json.load(open('/tmp/claude-1000/before-search.json')); b=json.load(open('/tmp/claude-1000/after-search.json'))
assert b['tier']=='Search', b.get('tier'); assert a['blocks']==b['blocks']; assert a['version']==b['version']; print('additive')"`
Expected: `additive`.

- [ ] **Step 4: Commit**

```bash
git add scripts/agreement-from-docx.py
git commit -m "Emit tier and map plan and arms rows in converter

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Ti4y7Gzbf2CauEELUE5o46"
```

### Task 6: Generate the four agreement docx and the office templates

**Files:**
- Create: `../legal/tools/make-agreements.py` (outside the repo)
- Create: `../legal/growth-agreement.docx`, `../legal/agile-agreement.docx`, `../legal/range-agreement.docx`; replace `../legal/presence-agreement.docx`
- Create: `src/data/office/agreements/growth.json`, `agile.json`, `range.json`; regenerate `presence.json`
- Modify: `netlify/functions/lib/office/agreement-templates.mjs:4-12`, `:14-18`, `:26-40`
- Test: `netlify/functions/lib/office/agreement-templates.test.mjs`, `pdf.test.mjs`, `actions/agreement.test.mjs`

**Interfaces:**
- Consumes: the converter from Task 5.
- Produces: `loadAgreementTemplates()` returns the four current templates in order `presence, growth, agile, range`; `findAgreementTemplate(id)` also finds `search` and `search-plus`; `RETIRED = new Set(['search', 'search-plus'])`; `PLACEHOLDERS` gains `paymentPlan` and `arms`; `validateAgreementTemplate` requires `tier` in `TIERS` unless retired. Every template's `tier` equals its package name.

- [ ] **Step 1: Write the generator**

Create `../legal/tools/make-agreements.py`. The source docx supplies styles, page setup, footer, intro, signatures and every clause that is common to all four; the package specs below supply everything that differs. Section numbers and cross-references are computed.

```python
#!/usr/bin/env python3
"""Write the four Keepsite agreement docx from the Search Plus docx.

Usage, from this directory:
  python3 make-agreements.py            # writes ../{presence,growth,agile,range}-agreement.docx

The Search Plus docx (../backup-2026-09-12/) carries the styles, footer,
intro, signature block, Exhibit D and every clause shared by all packages.
Each package below is an outline: a clause is either copied from a numbered
source section ('src', with optional paragraph replacements) or written
here. Numbering and every "Section N.M" cross-reference are computed, so a
clause moved or removed can never leave a stale reference behind: the
script refuses to write a document with a reference it cannot map.
"""
import copy, re, sys
from pathlib import Path
import docx
from docx.table import Table
from docx.text.paragraph import Paragraph

HERE = Path(__file__).resolve().parent
SRC = HERE.parent / 'backup-2026-09-12' / 'search-plus-agreement.docx'
OUT = HERE.parent

# ---------------------------------------------------------------- source

def load_source():
    d = docx.Document(SRC)
    items = []
    for child in d.element.body.iterchildren():
        tag = child.tag.split('}')[1]
        if tag == 'p':
            p = Paragraph(child, d)
            items.append({'kind': 'p', 'el': child, 'style': p.style.name if p.style else 'Normal', 'text': p.text.strip()})
        elif tag == 'tbl':
            items.append({'kind': 't', 'el': child, 'text': ''})
    return d, items

HEAD = re.compile(r'^(\d+)(?:\.(\d+))?\s')

def index_source(items):
    """Map '4.7' -> the items of that subsection (heading excluded), 'sig' -> the
    signature block, 'exD' -> Exhibit D, and 'intro' -> paragraphs before Schedule 1."""
    idx, key = {}, None
    for i, it in enumerate(items):
        st = it.get('style', '')
        if it['kind'] == 'p' and st == 'Heading 3':
            key = HEAD.match(it['text']).group(0).strip(); idx[key] = []; continue
        if it['kind'] == 'p' and st in ('Heading 2', 'Heading 1'):
            if it['text'] == 'Signatures': key = 'sig'; idx[key] = []; continue
            if it['text'].startswith('EXHIBIT D'): key = 'exD'; idx[key] = []; continue
            key = None; continue
        if key: idx[key].append(it)
    idx['intro'] = items[:8]          # title, two subtitles, five preamble paragraphs
    idx['schedule'] = items[8:15]     # Schedule 1 heading through "Do not enter a date"
    return idx

# ---------------------------------------------------------------- outline

class Sub:
    def __init__(self, key, title, body, replace=None):
        self.key, self.title, self.body, self.replace = key, title, body, replace or {}

def major(key, title, subs): return ('major', key, title, subs)

def P(text): return ('p', text)
def B(lead, rest): return ('b', lead, rest)
def T(rows, kind): return ('t', rows, kind)   # kind: 'inc' (#/Included), 'rate' (Service/Rate), 'arms'

MONEY_WORDS = {
    1200: 'one thousand two hundred dollars ($1,200)', 60: 'sixty dollars ($60)',
    1800: 'one thousand eight hundred dollars ($1,800)', 160: 'one hundred sixty dollars ($160)',
    2100: 'two thousand one hundred dollars ($2,100)', 425: 'four hundred twenty-five dollars ($425)',
    350: 'three hundred fifty dollars ($350)',
}

SMALL = 'text edits, swapping an image, changing hours or contact details, adding or removing a staff member or a service line, and similar changes that don\'t need a new page template, new design work, or a whole new page'

NO_ASK = ('We can change existing page copy, headings, metadata, and structure without checking with you first, when it\'s work under this Section. '
          'We won\'t change your pricing, service descriptions, claims, credentials, or contact details without your written approval. '
          'We\'ll summarize any meaningful page changes in the reporting under Section {reporting}.')
QUARTERLY = ('Every three (3) months you\'re subscribed, we send you a plain-English summary of how the site performed{against} and what we changed. '
             'Once every twelve (12) months it also covers the maintenance we did that year. There\'s no dashboard and nothing for you to log into.')

def build_fee_clause(pkg):
    fee = ('the Build Fee stated in Schedule 1, which is never less than ' + MONEY_WORDS[2100] if pkg['id'] == 'range' else MONEY_WORDS[pkg['build']])
    return [
        P(f'The build costs {fee}, less any discount in Exhibit D. Schedule 1 says how you\'re paying it:'),
        B('a. Half and half.', ' Half on signing and half on the Launch Date. This is what applies if the payment plan row in Schedule 1 is blank.'),
        B('b. Twelve monthly payments.', ' Nine percent (9%) of the build fee on signing, then the same amount on the same day of each of the next eleven (11) months. That adds up to one hundred eight percent (108%) of the build fee; the extra is the cost of spreading it. The build fee is still owed in full whatever happens to this agreement, and Section {cancel_pre} says what you owe if you cancel before launch.'),
        P('We start work once the first payment clears. Your first payment is non-refundable once we\'ve started, except as described in Section {cancel_pre}.'),
        B('Holding page.', ' On the twelve-payment plan, if a payment is more than ten (10) days late we can replace your live site with a holding page, after giving you seven (7) days\' written notice and a chance to pay. The site comes back when the missed payments are made. The monthly fee keeps running while the holding page is up.'),
    ]

def monthly_fee_first(pkg):
    fee = ('the Monthly Fee stated in Schedule 1, which is never less than ' + MONEY_WORDS[350] if pkg['id'] == 'range' else MONEY_WORDS[pkg['monthly']])
    return f'The subscription costs {fee} per month, less any discount in Exhibit D. The first payment is due on the Launch Date and every payment after that on the same day of the month.'

def outline(pkg):
    i = pkg['id']
    presence, growth, agile, rng = (i == 'presence'), (i == 'growth'), (i == 'agile'), (i == 'range')
    handled = {
        'presence': 'hosting, maintenance, monitoring, and one content change a month',
        'growth': 'hosting, maintenance, monitoring, content updates, search monitoring, and updates tied to your search goals',
        'agile': 'hosting, maintenance, monitoring, content updates, and the ongoing strategy program',
        'range': 'hosting, maintenance, monitoring, content updates, and search monitoring and updates for every arm',
    }[i]
    pre_launch_work = {'presence': 'design and copy work', 'growth': 'search research and copywriting', 'agile': 'discovery, research, and copywriting', 'range': 'search research for every arm and copywriting'}[i]
    handover_b = {
        'presence': 'b. Your site\'s text and images, your customer inquiry data (Section {cust_data}), and everything listed in Section {you_own}, all in ordinary portable formats; and',
        'growth': 'b. Your site\'s text and images, the search research, your customer inquiry data (Section {cust_data}), and everything listed in Section {you_own}, all in ordinary portable formats; and',
        'agile': 'b. Your site\'s text and images, the research and test results, your customer inquiry data (Section {cust_data}), and everything listed in Section {you_own}, all in ordinary portable formats; and',
        'range': 'b. Your site\'s text and images, the search research for every arm, your customer inquiry data (Section {cust_data}), and everything listed in Section {you_own}, all in ordinary portable formats; and',
    }[i]
    ends = {'presence': 'your access to the monthly services stops', 'growth': 'your access to the monthly services stops and the search work ends', 'agile': 'your access to the monthly services stops and the strategy program ends', 'range': 'your access to the monthly services stops and the search work ends'}[i]
    need_d = ('d. All the written copy for the site, delivered by the content lock date in Section {stage3}. On Presence, you supply the words and we edit and place them. If you don\'t have source material, we can write it under Exhibit C or you can move up to the Growth package;'
              if presence else
              'd. Source material and business facts for the pages we\'re writing' + (', for every arm' if rng else '') + ', delivered by the content lock date in Section {stage3}. On this package we write your core page copy; we still need the facts from you;')
    deliverables = {
        'presence': 'the website source code, the finished page designs, the page structure, and the written content',
        'growth': 'the website source code, the finished page designs, the page structure, the written page copy, the search research, and the written content',
        'agile': 'the website source code, the finished page designs, the page structure, the written page copy, the research and test results, and the written content',
        'range': 'the website source code, the finished page designs, the page structure, the written page copy, the search research for every arm, and the written content',
    }[i]

    build_subs = [
        Sub('stages', None, 'src:4.1'),
        Sub('need', None, 'src:4.2', replace={'d. Source material': need_d}),
        Sub('howlong', '4.3 How long it takes', [P('We aim to launch four (4) to six (6) weeks after kickoff. That\'s an estimate, not a promise. How fast you respond at each stage is the biggest variable — delays on your side push the schedule out without changing what you pay.' + (' For Range, the quote in Schedule 1 may set a longer schedule, depending on how many arms the site covers.' if rng else ''))]),
    ]
    if growth:
        build_subs += [
            Sub('research', 'Search research and site structure', [P('Alongside Stage One, we study the actual search results for the searches you want to win: what shows up now, why, and what it would take to be there. We use that to shape your site\'s structure and page map. The page map that comes out of this sets what we build in Stage Two.')]),
            Sub('meetings', 'Meetings', [P('We hold a kickoff call after signing and a check-in at each of the three stages. There are no other standing meetings; everything else runs on the questionnaires and email.')]),
        ]
    if agile:
        build_subs += [
            Sub('discovery', 'Discovery', [P('Before Stage One, we spend longer than usual finding out what the business is, where it\'s going, and who it\'s for. That\'s a conversation, not a form.')]),
            Sub('research', 'Research where the data doesn\'t exist', [P('There\'s no established way people search for what you do yet, so we don\'t follow a playbook. We look for the searches near yours, the questions your customers ask, and the phrases that are starting to appear, and we build a page map from what we find. The page map sets what we build in Stage Two. More research goes into each page than on Growth, and the page map says where.')]),
            Sub('built', 'Built to be changed', [P('We build the site so its search strategy can be replaced later without rebuilding the parts that work: page structure, navigation, and content are organized so a page can be re-aimed or swapped without touching the rest. Where there\'s a real question to answer, we run an A/B test — two versions of a page shown to different visitors — and let the numbers decide.')]),
            Sub('meetings', 'Meetings', [P('We hold a kickoff call after signing and a check-in every two (2) weeks during the build. After launch, we meet every month under Section {ongoing}.')]),
        ]
    if rng:
        build_subs += [
            Sub('arms', 'Arms', [P('An "arm" is a product line or service line with its own customers. Exhibit A lists the arms this agreement covers. Everything in this Section that we do for the site, we do for each arm.')]),
            Sub('research', 'Search research and site structure, per arm', [P('Alongside Stage One, for each arm we study the actual search results for the searches you want to win: what shows up now, why, and what it would take to be there. We use that to shape the site\'s structure and page map, and we structure the site so the arms don\'t compete with each other in search: each has its own section and its own path to its customers. The page map that comes out of this sets what we build in Stage Two.')]),
            Sub('meetings', 'Meetings', [P('We hold a kickoff call after signing and a check-in at each of the three stages. There are no other standing meetings; everything else runs on the questionnaires and email.')]),
        ]
    build_subs += [
        Sub('stage1', None, 'src:4.6'),
        Sub('stage2', None, 'src:4.7'),
        Sub('stage3', None, 'src:4.8'),
        Sub('quiet', None, 'src:4.9'),
        Sub('reopen', 'Reopening a closed stage', [P('You can ask to reopen a closed stage any time before launch. We\'ll quote the work in writing first and won\'t start until you approve the quote. Reopening resets the schedule for that stage and every stage after it.')]),
        Sub('launch', None, 'src:4.11'),
        Sub('facts', None, 'src:4.12'),
    ]

    updates_subs = [
        Sub('small', 'Small content updates', [P(('Your monthly fee covers one (1) change request a month: ' + SMALL + '. Email us the request; there\'s no login for you to learn. Requests past the one included are billed at the Exhibit C price.') if presence else ('Your monthly fee covers small content updates — ' + SMALL + '. Email us the request; there\'s no login for you to learn.'))]),
        Sub('respond', None, 'src:5.2'),
        Sub('fair', 'Fair use', [P('One included request a month is the plan. If a single request is really several changes, we\'ll say so and count it accordingly, or bill the extras at the Exhibit C price.' if presence else 'Small updates are offered on a fair-use basis. If your requests regularly run past four (4) a month, we\'ll tell you, and we\'ll either bill the extras at the Exhibit C price or move you to a package that covers the volume.')]),
        Sub('broken', None, 'src:5.4'),
    ]

    if presence:
        search_major = major('search', 'Analytics and Reporting', [
            Sub('included', 'What\'s included', [P('Presence includes basic technical setup — title tags, meta descriptions, sitemap, indexability, mobile responsiveness, and page speed fundamentals — plus analytics installation and hooking up your Google Business Profile and social links.')]),
            Sub('reporting', 'Quarterly summary', [P(QUARTERLY.format(against=''))]),
            Sub('notincl', 'What isn\'t', [P('Search research, search strategy, advice on what to write or post, Search Console monitoring, and ongoing search work aren\'t part of Presence. They\'re in the Growth, Agile, and Range packages.')]),
            Sub('norank', None, 'src:9.3'),
        ])
    elif growth:
        search_major = major('search', 'Search Monitoring and Updates', [
            Sub('included', 'What\'s included', [P('Growth includes full on-page technical setup, analytics installation, Google Search Console setup and ongoing monitoring, Google Business Profile connection, and a yearly refresh of the search research.')]),
            Sub('updates', 'Updates tied to your goals', [P('Through the Term we watch how the site performs for the searches we built it around, and we update existing pages — copy, headings, metadata, internal linking, structure — when the data points somewhere useful. The goals are the ones set in Section {research}; we don\'t reinvent the strategy through the year.')]),
            Sub('noask', 'Changing pages without asking first', [P(NO_ASK)]),
            Sub('reporting', 'Reporting', [P(QUARTERLY.format(against=' against its search goals'))]),
            Sub('notincl', 'What isn\'t included', [P('Ongoing strategy meetings, research beyond the plan set at the start, A/B testing, and pages you ask for aren\'t part of Growth. Ongoing strategy is the Agile package; pages you ask for are priced in Exhibit C.')]),
            Sub('norank', None, 'src:9.3'),
            Sub('wont', None, 'src:9.4'),
        ])
    elif agile:
        search_major = major('ongoing', 'Ongoing Strategy', [
            Sub('meeting', 'The monthly meeting', [P('After launch we meet every month, for as long as this agreement runs. We bring what the data says, what we\'ve changed, and what we\'d try next. You bring what\'s changed in the business. Meetings are online unless we agree otherwise, and we set the schedule together.')]),
            Sub('keepgoing', 'Research that keeps going', [P('The research from Section {research} doesn\'t stop at launch. As the business changes, we keep looking for the searches worth building toward, and we adjust the page map when the evidence supports it.')]),
            Sub('tests', 'Tests', [P('Where there\'s a real question to answer, we run an A/B test and let the numbers decide. We decide what to test and when; we tell you what we\'re testing and what we found.')]),
            Sub('changes', 'Changes we make', [P('What comes out of the meetings, the research, and the tests is changes to the site: updated pages, new supporting pages, re-aimed sections. Because the site is built to be changed (Section {built}), that work doesn\'t mean a rebuild. Pages we start on our own are included; pages you ask for are priced in Exhibit C.')]),
            Sub('noask', 'Changing pages without asking first', [P(NO_ASK)]),
            Sub('reporting', 'Reporting', [P(QUARTERLY.format(against=' against its search goals'))]),
            Sub('novolume', 'Not a promise of volume', [P('This program is a commitment to attention and judgment, not to a set number of pages, tests, rankings, or results.')]),
            Sub('notdo', 'What we don\'t do', [P('We bring research and build; we don\'t make business decisions for you. We don\'t run advertising. And Agile isn\'t something to set and forget: if the meetings stop happening on your side, we\'ll tell you the package no longer fits.')]),
            Sub('norank', None, 'src:9.3'),
            Sub('wont', None, 'src:9.4'),
            Sub('competitors', None, 'src:9.5'),
        ])
    else:
        search_major = major('search', 'Search Monitoring and Updates, per Arm', [
            Sub('each', 'Each arm', [P('Everything in this Section applies to each arm listed in Exhibit A on its own: its own search goals, its own monitoring, its own updates.')]),
            Sub('included', 'What\'s included', [P('Range includes, for every arm, full on-page technical setup, analytics installation, Google Search Console setup and ongoing monitoring, Google Business Profile connection, and a yearly refresh of the search research.')]),
            Sub('updates', 'Updates tied to each arm\'s goals', [P('Through the Term we watch how each arm performs for the searches we built it around, and we update existing pages — copy, headings, metadata, internal linking, structure — when the data points somewhere useful. The goals are the ones set in Section {research}; we don\'t reinvent the strategy through the year.')]),
            Sub('noask', 'Changing pages without asking first', [P(NO_ASK)]),
            Sub('reporting', 'Reporting', [P(QUARTERLY.format(against=' against each arm\'s search goals'))]),
            Sub('ongoingarm', 'An arm with ongoing strategy', [P('If Exhibit A marks an arm as having ongoing strategy, that arm gets a monthly meeting, continuing research, and tests, at the price the quote sets, and this Section reads accordingly for that arm.')]),
            Sub('notincl', 'What isn\'t included', [P('Ongoing strategy for an arm not marked in Exhibit A, and pages you ask for, aren\'t part of Range. Pages you ask for are priced in Exhibit C.')]),
            Sub('norank', None, 'src:9.3'),
            Sub('wont', None, 'src:9.4'),
            Sub('competitors', None, 'src:9.5'),
        ])

    majors = [
        major('what', None, [
            Sub('build', None, 'src:1.1'),
            Sub('monthly', 'The monthly service', [P(f'Starting on the Launch Date, we handle {handled} for your site. Exhibit B lists exactly what that covers. We keep doing it for as long as this agreement is running and your account is current.')]),
            Sub('together', None, 'src:1.3'),
            Sub('else', None, 'src:1.4'),
        ]),
        major('costs', None, [
            Sub('buildfee', 'The build fee', build_fee_clause(pkg)),
            Sub('monthlyfee', None, 'src:2.2', replace={'The subscription costs': monthly_fee_first(pkg)}),
            Sub('pay', None, 'src:2.3'), Sub('taxes', None, 'src:2.4'), Sub('late', None, 'src:2.5'),
            Sub('pricechange', None, 'src:2.6'), Sub('passthrough', None, 'src:2.7'), Sub('discounts', None, 'src:2.8'),
        ]),
        major('term', None, [
            Sub('theterm', None, 'src:3.1'), Sub('renewal', None, 'src:3.2'), Sub('change', None, 'src:3.3'),
            Sub('cancel_mid', None, 'src:3.4'), Sub('cancel_breach', None, 'src:3.5'), Sub('notice', None, 'src:3.6'),
            Sub('cancel_pre', None, 'src:3.7', replace={'If you cancel before the Launch Date': f'If you cancel before the Launch Date, you owe your deposit or first payment plus a fair share of the rest of the build fee covering the work already done, including {pre_launch_work}. If we cancel before launch for any reason other than you breaking the agreement, we refund what you\'ve paid minus the value of the work we\'ve done.'}),
            Sub('code', None, 'src:3.8', replace={'b. Your site': handover_b}),
            Sub('down', None, 'src:3.9'),
            Sub('owe', None, 'src:3.10', replace={'On the day cancellation takes effect': f'On the day cancellation takes effect, everything you\'ve accrued is immediately due, including any early cancellation fee under Section {{cancel_mid}} and any discount added back under Section {{discounts}}. Also, {ends}, and fees you\'ve already paid aren\'t refunded or prorated.'}),
        ]),
        major('building', None, build_subs),
        major('updates', None, updates_subs),
        major('hosting', None, [Sub('host', None, 'src:6.1'), Sub('monitor', None, 'src:6.2'), Sub('uptime', None, 'src:6.3'), Sub('backups', None, 'src:6.4'), Sub('security', None, 'src:6.5')]),
        search_major,
        major('own', None, [
            Sub('materials', None, 'src:10.1'),
            Sub('you_own', 'What you own', [P(f'Once you\'ve paid the build fee and anything else due, you own everything we made for you: {deliverables}. We call all of that the "Deliverables." You own it outright — there\'s no license to maintain and no restriction on what you do with it. It stays yours after this agreement ends, and Section {{code}} covers how we hand it over.')]),
            Sub('we_keep', None, 'src:10.3'), Sub('third', None, 'src:10.4'), Sub('domain', None, 'src:10.5'), Sub('showing', None, 'src:10.6'), Sub('accounts', None, 'src:10.7'),
        ]),
        major('conf', None, [Sub('confidential', None, 'src:11.1'), Sub('cust_data', None, 'src:11.2')]),
        major('promises', None, [
            Sub('both', None, 'src:12.1'), Sub('you_promise', None, 'src:12.2'), Sub('we_promise', None, 'src:12.3'), Sub('disclaimer', None, 'src:12.4'), Sub('limit', None, 'src:12.5'),
            Sub('indemnity', 'Covering each other\'s claims', [P('Client will defend, indemnify, and hold Keepsite harmless from any third-party claim arising out of Client Materials, Client\'s business, Client\'s products or services, or Client\'s breach of Section {you_promise}. Keepsite will defend, indemnify, and hold Client harmless from any third-party claim that the Deliverables, excluding Client Materials, infringe that third party\'s intellectual property rights.')]),
        ]),
        major('everything', None, [
            Sub('contractor', None, 'src:13.1'), Sub('subs', None, 'src:13.2'), Sub('nohire', None, 'src:13.3'), Sub('force', None, 'src:13.4'), Sub('assign', None, 'src:13.5'),
            Sub('notices', None, 'src:13.6'), Sub('law', None, 'src:13.7'), Sub('workout', None, 'src:13.8'), Sub('fees', None, 'src:13.9'), Sub('sever', None, 'src:13.10'),
            Sub('waiver', None, 'src:13.11'), Sub('entire', None, 'src:13.12'),
            Sub('survive', 'What outlives the agreement', [P('Sections {costs} (for amounts owed), {cancel_mid}, {code}, {down}, {owe}, {own}, {conf}, {promises}, and {everything} keep applying after this agreement ends.')]),
            Sub('signing', None, 'src:13.14'),
        ]),
    ]
    return majors

# Major titles come from the source headings, by key order.
MAJOR_TITLES = {
    'what': '1. What We Do', 'costs': '2. What It Costs', 'term': '3. How Long This Lasts, and How It Ends',
    'building': '4. Building It: How It Goes and What We Need From You', 'updates': '5. Updates and Support',
    'hosting': '6. Hosting, Uptime, and Backups', 'own': '10. Who Owns What', 'conf': '11. Confidentiality and Your Customers\' Data',
    'promises': '12. Promises, Disclaimers, and Liability', 'everything': '13. Everything Else',
}

# ---------------------------------------------------------------- exhibits

INC_NOT_BUILD = 'e-commerce, booking systems, membership or login areas, multi-step or conditional forms, custom CRM integrations, logo or brand identity design, photography, videography, paid advertising management, and pages beyond the approved page map'

def exhibits(pkg):
    i = pkg['id']
    price_build = 'as stated in Schedule 1 (from $2,100)' if i == 'range' else f'${pkg["build"]:,}'
    price_month = 'as stated in Schedule 1 (from $350 per month)' if i == 'range' else f'${pkg["monthly"]:,} per month'
    A = {
        'presence': ([
            'Custom website design and build, mobile-first',
            'The number of pages stated in Schedule 1 (default five; standard configuration: Home, About, Services, Contact, plus one; the page set is fixed on approval at Stage Two)',
            'Basic technical SEO setup — title tags, meta descriptions, sitemap, indexability, mobile responsiveness, page speed fundamentals',
            'Analytics installation and configuration',
            'Google Business Profile connection and social profile links',
            'Inquiry page and form routed to Client\'s email address or existing CRM (simple embed)',
            'Editing and placement of copy supplied by Client',
            'SSL certificate and DNS configuration',
            'Pre-launch testing across current major browsers and mobile devices',
            'Selection from four (4) house design directions at Stage One',
            'One (1) round of changes at each of the three stages',
        ], 'Not included in the build: search research, SEO copywriting, copy written from scratch, competitor analysis, ' + INC_NOT_BUILD + '.'),
        'growth': ([
            'Everything in the Presence build',
            'Search-result research for the searches Client wants to win (Section {research})',
            'A page map built from that research; the number of pages stated in Schedule 1 (default eight; the page set is fixed on approval at Stage Two)',
            'Copy for the core pages written by Keepsite around the research, after one call to set tone',
            'Full on-page technical SEO setup — title tags, meta descriptions, headings, schema, internal linking, sitemap, indexability',
            'Google Search Console setup',
            'A kickoff call and a check-in at each stage (Section {meetings})',
        ], 'Not included in the build: ongoing strategy, A/B testing, ' + INC_NOT_BUILD + '.'),
        'agile': ([
            'Everything in the Growth build',
            'Extended discovery (Section {discovery})',
            'Research where established search data doesn\'t exist, with more research per page (Section {research})',
            'A page map built from that research; the number of pages stated in Schedule 1 (default eight; the page set is fixed on approval at Stage Two)',
            'A/B tests where there is a real question to answer (Section {built})',
            'A site structure built so the search strategy can be replaced without rebuilding what works (Section {built})',
            'Copy for the core pages written by Keepsite, after one call to set tone',
            'Full on-page technical SEO setup — title tags, meta descriptions, headings, schema, internal linking, sitemap, indexability',
            'Google Search Console setup',
            'A kickoff call and a check-in every two (2) weeks during the build (Section {meetings})',
        ], 'Not included in the build: business decisions, ' + INC_NOT_BUILD + '.'),
        'range': ([
            'Everything in the Growth build, for every arm listed above',
            'Search-result research per arm (Section {research})',
            'A page map with a section per arm; the number of pages stated in Schedule 1 (default sixteen; the page set is fixed on approval at Stage Two)',
            'Copy for the core pages of every arm written by Keepsite, after one call to set tone',
            'Full on-page technical SEO setup — title tags, meta descriptions, headings, schema, internal linking, sitemap, indexability',
            'Google Search Console setup',
            'A kickoff call and a check-in at each stage (Section {meetings})',
        ], 'Not included in the build: ongoing strategy for an arm not marked above, A/B testing, ' + INC_NOT_BUILD + '.'),
    }[i]
    B_ = {
        'presence': ([
            'Website hosting', 'Routine maintenance — platform, dependency, and security updates',
            'Uptime and error monitoring, so problems are caught before Client notices them',
            'One (1) change request a month as defined in Section {small}', 'SSL certificate renewal and management',
            'Backups per Section {backups}', 'Email support with the response times in Section {respond}',
            'A plain-English summary every three (3) months (Section {reporting})',
        ], 'Not included in the monthly: new pages, redesigns, search research, Search Console monitoring, ongoing search work, and any work listed in Exhibit C.'),
        'growth': ([
            'Everything in the Presence subscription', 'Small content updates on a fair-use basis (Section {small})',
            'Google Search Console and analytics monitoring', 'Updates to existing pages tied to the search goals (Section {updates})',
            'A plain-English summary every three (3) months against the search goals (Section {reporting})',
            'A yearly refresh of the search research', 'A yearly Google Business Profile check',
        ], 'Not included in the monthly: ongoing strategy meetings, research beyond the plan set at the start, A/B tests, pages Client asks for, redesigns, paid advertising management, and any work listed in Exhibit C.'),
        'agile': ([
            'Everything in the Growth subscription', 'A strategy meeting every month (Section {meeting})',
            'Research that continues as the business changes (Section {keepgoing})', 'A/B tests (Section {tests})',
            'The changes and supporting pages that come out of the meetings, the research, and the tests (Section {changes})',
        ], 'Not included in the monthly: pages Client asks for, redesigns, paid advertising management, and any work listed in Exhibit C.'),
        'range': ([
            'Everything in the Growth subscription, for every arm', 'Google Search Console and analytics monitoring per arm',
            'Updates to existing pages tied to each arm\'s search goals (Section {updates})',
            'A plain-English summary every three (3) months covering each arm (Section {reporting})',
            'A yearly refresh of the search research for every arm', 'A yearly Google Business Profile check',
            'For an arm marked in Exhibit A as having ongoing strategy: a monthly meeting, continuing research, and tests (Section {ongoingarm})',
        ], 'Not included in the monthly: ongoing strategy for an arm not marked in Exhibit A, pages Client asks for, redesigns, paid advertising management, and any work listed in Exhibit C.'),
    }[i]
    C_rows = [['Service', 'Price'],
        ['Extra change request', '$60 per request — beyond what the monthly covers; Client sends the copy or the photo, Keepsite makes the change'],
        ['Additional standard page', '$150 per page — uses the existing site style and Client-supplied copy; no new research'],
        ['Additional search page', '$225 per page — Growth, Agile, and Range only; a new research-informed service or location page'],
        ['Copy written from scratch', 'Quoted in writing before work starts — for when there is no source material to work from'],
        ['Advanced integration', 'Quoted in writing before work starts — booking platforms, multi-step forms, custom routing, or CRM work beyond a simple embed'],
        ['Additional round of changes, or reopening a closed stage', 'Quoted in writing before work starts (Section {reopen})'],
        ['Migration to another provider', 'Quoted in writing before work starts — for Keepsite to configure a new host, move DNS, and test. The source code export itself is free under Section {code}.'],
        ['Major website expansion', 'Custom quote — new service lines, large content migrations, or anything that materially changes the original scope'],
    ]
    out = [('h1', f'EXHIBIT A — {pkg["name"]} Build Scope'), P(f'One-time build fee: {price_build}')]
    if i == 'range':
        out += [P('Arms'), T([['Business arms covered', 'Filled in from the quote, one arm per line. Mark an arm "ongoing strategy" where the quote includes it.']], 'arms'), P('Included, for every arm')]
    out += [T([['#', 'Included']] + [[str(n + 1), row] for n, row in enumerate(A[0])], 'inc'), P(A[1])]
    out += [('h1', f'EXHIBIT B — {pkg["name"]} Monthly Services'), P(f'Monthly subscription fee: {price_month}'),
            T([['#', 'Included every month']] + [[str(n + 1), row] for n, row in enumerate(B_[0])], 'inc'), P(B_[1])]
    out += [('h1', 'EXHIBIT C — Add-On Services'), T(C_rows, 'rate'),
            B('Upgrade rule.', ' If what Client needs is more strategy rather than more pages, Keepsite will recommend moving Client to the package that covers it rather than selling it piece by piece. Additional search pages are available on the Growth, Agile, and Range packages only.'),
            B('Changing packages.', ' Moving up happens whenever you want: we quote the difference in build work, and your monthly fee changes to the new rate on your next billing date. Moving down happens at renewal, using the notice in Section {renewal}. See Section {change}.'),
            P('All add-on work requires written approval before it begins. Add-on fees are invoiced on completion and due on receipt unless stated otherwise.')]
    return out

# ---------------------------------------------------------------- numbering and references

REF_TOKEN = re.compile(r'\b(\d{1,2})\.(\d{1,2})\b(?!%)')
REF_MAJOR = re.compile(r'(?<=Section )(\d{1,2})(?![.\d])')
REF_LIST = re.compile(r'Sections\s+([\d.,()\sa-z]+?)(?=\.\s|\.$|;|$)')

def number(majors):
    """Assign 'N' to majors and 'N.M' to subs. Returns (keymap, oldmap): keymap by
    outline key, oldmap by the source number a copied sub came from."""
    keymap, oldmap = {}, {}
    for n, (_, mkey, _, subs) in enumerate(majors, 1):
        keymap[mkey] = str(n)
        for m, sub in enumerate(subs, 1):
            keymap[sub.key] = f'{n}.{m}'
            if isinstance(sub.body, str) and sub.body.startswith('src:'):
                oldmap[sub.body[4:]] = f'{n}.{m}'
    # Majors copied whole keep their old number -> new number too.
    for old, new in {'1': 'what', '2': 'costs', '3': 'term', '4': 'building', '5': 'updates', '6': 'hosting', '10': 'own', '11': 'conf', '12': 'promises', '13': 'everything'}.items():
        oldmap[old] = keymap[new]
    # Clauses rewritten here that a copied clause still points at by its old
    # number: the fee, the timeline, reopening, updates, ownership, indemnity.
    for old, new in {'1.2': 'monthly', '2.1': 'buildfee', '4.3': 'howlong', '4.10': 'reopen', '5.1': 'small', '5.3': 'fair', '10.2': 'you_own', '12.6': 'indemnity', '13.13': 'survive'}.items():
        if new in keymap: oldmap.setdefault(old, keymap[new])
    return keymap, oldmap

class Unmapped(Exception): pass

def remap_refs(text, oldmap):
    """Rewrite source-numbered references to the new numbering. Anything that
    looks like a reference and has no mapping raises, so a removed clause can
    never leave a dangling 'Section 7.4' behind."""
    if 'Section' not in text:
        return text
    def sub(m):
        key = f'{m.group(1)}.{m.group(2)}'
        if key not in oldmap: raise Unmapped(f'{key} in: {text[:90]}')
        return oldmap[key]
    text = REF_TOKEN.sub(sub, text)
    def maj(m):
        if m.group(1) not in oldmap: raise Unmapped(f'Section {m.group(1)} in: {text[:90]}')
        return oldmap[m.group(1)]
    return REF_MAJOR.sub(maj, text)

def fill_keys(text, keymap):
    def sub(m):
        if m.group(1) not in keymap: raise Unmapped(f'{{{m.group(1)}}} in: {text[:90]}')
        return keymap[m.group(1)]
    return re.sub(r'\{([a-z_0-9]+)\}', sub, text)

# ---------------------------------------------------------------- writing

def clone_paragraph(template_el, doc, runs):
    """A new paragraph in the template's style, with the given (text, bold) runs."""
    el = copy.deepcopy(template_el)
    for r in list(el.findall('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}r')):
        el.remove(r)
    p = Paragraph(el, doc)
    for text, bold in runs:
        run = p.add_run(text)
        if bold: run.bold = True
    return el

def copied_paragraph(src_el, doc, oldmap):
    el = copy.deepcopy(src_el)
    p = Paragraph(el, doc)
    for r in p.runs:
        r.text = remap_refs(r.text, oldmap)
    remap_refs(p.text, oldmap)   # a reference split across runs would slip past the per-run pass
    return el

def table_from(template_el, doc, rows, keymap):
    el = copy.deepcopy(template_el)
    t = Table(el, doc)
    while len(t.rows) > 1:
        tr = t.rows[-1]._tr; tr.getparent().remove(tr)
    for c, text in zip(t.rows[0].cells, rows[0]): c.text = text
    for row in rows[1:]:
        cells = t.add_row().cells
        for c, text in zip(cells, row): c.text = fill_keys(text, keymap)
    return el

def write(pkg, doc, items, idx):
    majors = outline(pkg)
    keymap, oldmap = number(majors)
    templates = {
        'Normal': next(it['el'] for it in items if it['kind'] == 'p' and it['style'] == 'Normal' and it['text'].startswith('We design')),
        'Heading 1': next(it['el'] for it in items if it['kind'] == 'p' and it['style'] == 'Heading 1'),
        'Heading 2': next(it['el'] for it in items if it['kind'] == 'p' and it['style'] == 'Heading 2'),
        'Heading 3': next(it['el'] for it in items if it['kind'] == 'p' and it['style'] == 'Heading 3'),
        'inc': idx['exA_table'], 'rate': idx['exC_table'], 'arms': idx['exC_table'],
    }
    body = doc.element.body
    sect = body[-1]
    for child in list(body):
        if child is not sect: body.remove(child)

    def add_spec(spec):
        kind = spec[0]
        if kind == 'p': body.insert(len(body) - 1, clone_paragraph(templates['Normal'], doc, [(fill_keys(spec[1], keymap), False)]))
        elif kind == 'b': body.insert(len(body) - 1, clone_paragraph(templates['Normal'], doc, [(spec[1], True), (fill_keys(spec[2], keymap), False)]))
        elif kind == 't': body.insert(len(body) - 1, table_from(templates[spec[2]], doc, spec[1], keymap))
        elif kind == 'h1': body.insert(len(body) - 1, clone_paragraph(templates['Heading 1'], doc, [(spec[1], False)]))

    def add_copied(src_items, replace=None):
        for it in src_items:
            if it['kind'] == 't':
                body.insert(len(body) - 1, copy.deepcopy(it['el'])); continue
            new_text = next((v for k, v in (replace or {}).items() if it['text'].startswith(k)), None)
            if new_text is None:
                body.insert(len(body) - 1, copied_paragraph(it['el'], doc, oldmap))
            else:
                lead = it['el']
                p = Paragraph(lead, doc)
                bold_lead = p.runs[0].text if p.runs and p.runs[0].bold and new_text.startswith(p.runs[0].text) else ''
                runs = [(bold_lead, True), (fill_keys(new_text[len(bold_lead):], keymap), False)] if bold_lead else [(fill_keys(new_text, keymap), False)]
                body.insert(len(body) - 1, clone_paragraph(templates['Normal'], doc, runs))

    # Intro: title, subtitles, preamble.
    for n, it in enumerate(idx['intro']):
        el = copy.deepcopy(it['el']); p = Paragraph(el, doc)
        if n == 1: p.runs[0].text = f'{pkg["name"]} Package'
        if n == 2: p.runs[1].text = ' — ' + pkg['subtitle']
        for r in p.runs: r.text = remap_refs(r.text, oldmap)
        body.insert(len(body) - 1, el)
    # Schedule 1, with the package's prices and the payment plan row.
    for it in idx['schedule']:
        el = copy.deepcopy(it['el'])
        if it['kind'] == 't':
            t = Table(el, doc)
            if t.rows[0].cells[0].text == 'Field' and len(t.columns) == 3:
                for r in t.rows:
                    label = r.cells[0].text
                    if label.startswith('Build Fee'): r.cells[1].text = ('$2,100' if pkg['id'] == 'range' else f'${pkg["build"]:,}')
                    if label.startswith('Monthly Fee'): r.cells[1].text = ('$350 per month' if pkg['id'] == 'range' else f'${pkg["monthly"]:,} per month')
                    if label.startswith('Pages'): r.cells[2].text = f'{pkg["pages"]} pages'
                plan = t.add_row().cells
                plan[0].text, plan[1].text, plan[2].text = 'Payment plan (Section 2.1)', '☐ Half and half  ☐ Twelve monthly payments', 'Half and half'
                # Move the new row under Monthly Fee.
                tr = t.rows[-1]._tr; tr.getparent().remove(tr); t.rows[2]._tr.addnext(tr)
        body.insert(len(body) - 1, el)
    # Numbered sections.
    for n, (_, mkey, title, subs) in enumerate(majors, 1):
        heading = title or MAJOR_TITLES[mkey].split(' ', 1)[1]
        body.insert(len(body) - 1, clone_paragraph(templates['Heading 2'], doc, [(f'{n}. {heading}', False)]))
        for m, sub in enumerate(subs, 1):
            if isinstance(sub.body, str):
                old = sub.body[4:]
                src_title = next(it['text'] for it in items if it['kind'] == 'p' and it['style'] == 'Heading 3' and it['text'].startswith(old + ' ')).split(' ', 1)[1]
                body.insert(len(body) - 1, clone_paragraph(templates['Heading 3'], doc, [(f'{n}.{m} {sub.title or src_title}', False)]))
                add_copied(idx[old], sub.replace)
            else:
                title_text = sub.title if not HEAD.match(sub.title or '') else sub.title.split(' ', 1)[1]
                body.insert(len(body) - 1, clone_paragraph(templates['Heading 3'], doc, [(f'{n}.{m} {title_text}', False)]))
                for spec in sub.body: add_spec(spec)
    # Signatures, exhibits A-C, Exhibit D.
    body.insert(len(body) - 1, clone_paragraph(templates['Heading 2'], doc, [('Signatures', False)]))
    add_copied(idx['sig'])
    for spec in exhibits(pkg): add_spec(spec)
    body.insert(len(body) - 1, clone_paragraph(templates['Heading 1'], doc, [('EXHIBIT D — Discount Schedule', False)]))
    for it in idx['exD']:
        el = copy.deepcopy(it['el'])
        if it['kind'] == 't':
            for r in Table(el, doc).rows:
                if r.cells[1].text == '$2,000': r.cells[1].text = ('as stated in Schedule 1' if pkg['id'] == 'range' else f'${pkg["build"]:,}')
                if r.cells[1].text == '$275 per month': r.cells[1].text = ('as stated in Schedule 1' if pkg['id'] == 'range' else f'${pkg["monthly"]:,} per month')
        else:
            el = copied_paragraph(it['el'], doc, oldmap)
        body.insert(len(body) - 1, el)
    # Footer.
    for p in doc.sections[0].footer.paragraphs:
        for r in p.runs:
            r.text = r.text.replace('Search Plus Package', f'{pkg["name"]} Package')
    # Every reference must point at a section that exists.
    numbers = set(keymap.values())
    for p in doc.paragraphs:
        for m in re.finditer(r'Section (\d{1,2}(?:\.\d{1,2})?)', p.text):
            if m.group(1) not in numbers: raise Unmapped(f'dangling Section {m.group(1)} in: {p.text[:90]}')
    return doc

PACKAGES = [
    {'id': 'presence', 'name': 'Presence', 'build': 1200, 'monthly': 60, 'pages': 5, 'subtitle': 'Website Design, Development, Hosting, and Maintenance'},
    {'id': 'growth', 'name': 'Growth', 'build': 1800, 'monthly': 160, 'pages': 8, 'subtitle': 'Website Design, Development, Hosting, Maintenance, and Search'},
    {'id': 'agile', 'name': 'Agile', 'build': 2100, 'monthly': 425, 'pages': 8, 'subtitle': 'Website Design, Development, Hosting, Maintenance, and Ongoing Search Strategy'},
    {'id': 'range', 'name': 'Range', 'build': 2100, 'monthly': 350, 'pages': 16, 'subtitle': 'Website Design, Development, Hosting, Maintenance, and Search, for Multi-Line Businesses'},
]

def main():
    for pkg in PACKAGES:
        doc, items = load_source()
        idx = index_source(items)
        tables = [it['el'] for it in items if it['kind'] == 't']
        idx['exA_table'], idx['exC_table'] = tables[3], tables[6]   # '#/Included' and 'Service/Rate' in the source
        write(pkg, doc, items, idx).save(OUT / f'{pkg["id"]}-agreement.docx')
        print('wrote', pkg['id'])

if __name__ == '__main__':
    main()
```

Notes for the implementer:

- `Sub.title` is `None` for copied clauses: the heading text comes from the source heading minus its old number. A written clause names its own title; the `'4.3 How long it takes'` form is also accepted and stripped.
- `{key}` in written text and table cells resolves through `keymap`; source-numbered references in copied text resolve through `oldmap`. Both raise `Unmapped` on a miss, and the final pass raises on any `Section N` that does not exist in the new document. Run until it writes all four without raising.
- `python-docx` `add_row()` copies the table's last row shape; header cell text is set explicitly.
- If a source paragraph's reference spans two runs (the per-run pass leaves it, the whole-text pass raises), edit that clause with a `replace` entry rather than patching the source docx.

- [ ] **Step 2: Run the generator**

Run: `cd ../legal/tools && python3 make-agreements.py && cd -`
Expected: `wrote presence`, `wrote growth`, `wrote agile`, `wrote range`, no traceback. Fix any `Unmapped` it reports by correcting the outline (a wrong `src:` number or a missing `{key}`), never by hand-editing output.

- [ ] **Step 3: Regenerate the office JSON**

```bash
for p in presence growth agile range; do
  python3 scripts/agreement-from-docx.py ../legal/$p-agreement.docx $p > src/data/office/agreements/$p.json
done
python3 -c "
import json
for p in ['presence','growth','agile','range']:
    d=json.load(open(f'src/data/office/agreements/{p}.json'))
    print(p, d['tier'], d['defaults'], sum(1 for b in d['blocks'] if b['type']=='h3'))
"
```

Expected: tiers `Presence`, `Growth`, `Agile`, `Range`; defaults `{'buildFee': '$1,200', 'monthlyFee': '$60', 'pages': 5}`, `{'$1,800', '$160', 8}`, `{'$2,100', '$425', 8}`, `{'$2,100', '$350', 16}`.

- [ ] **Step 4: Read every docx once in Word (owner) and once as text (implementer)**

Implementer: `python3 -c "import docx,sys; [print(p.text) for p in docx.Document('../legal/growth-agreement.docx').paragraphs]" | less` for each package. Check: numbering is contiguous, every "Section N.M" names a clause that exists and says what the reference implies, no "$90", "per hour", "Search Plus", "blog", "article" anywhere (`grep -c` over the printed text is enough), the payment plan row is under Monthly Fee, Range's Exhibit A has the arms row. Owner reviews the four docx in Word before Task 8's gate; changes go into `make-agreements.py`, then Steps 2 and 3 run again.

- [ ] **Step 5: Failing tests for the template module**

Rewrite the first test in `agreement-templates.test.mjs`:

```js
test('the four current templates load, validate and carry their tier; the retired two still resolve', () => {
  const all = loadAgreementTemplates();
  assert.deepEqual(all.map((t) => t.id), ['presence', 'growth', 'agile', 'range']);
  assert.deepEqual(all.map((t) => t.tier), ['Presence', 'Growth', 'Agile', 'Range']);
  for (const t of all) assert.deepEqual(validateAgreementTemplate(t), [], t.id);
  assert.deepEqual(findAgreementTemplate('growth').defaults, { buildFee: '$1,800', monthlyFee: '$160', pages: 8 });
  assert.deepEqual(findAgreementTemplate('range').defaults, { buildFee: '$2,100', monthlyFee: '$350', pages: 16 });
  assert.equal(findAgreementTemplate('search').id, 'search');
  assert.equal(findAgreementTemplate('search-plus').id, 'search-plus');
  assert.ok(RETIRED.has('search') && RETIRED.has('search-plus'));
  assert.equal(findAgreementTemplate('nope'), undefined);
});

test('validateAgreementTemplate requires a current tier unless the template is retired', () => {
  const base = { name: 'X', version: 'v', defaults: {}, blocks: [{ type: 'signatures', intro: '', parties: [], note: '' }] };
  assert.match(validateAgreementTemplate({ ...base, id: 'x' }).join(), /tier/);
  assert.match(validateAgreementTemplate({ ...base, id: 'x', tier: 'Search' }).join(), /tier/);
  assert.deepEqual(validateAgreementTemplate({ ...base, id: 'x', tier: 'Agile' }), []);
  assert.deepEqual(validateAgreementTemplate({ ...base, id: 'search' }), []);
});
```

Add `RETIRED` to the import. Change `fields` in that file to `buildFee: 180000, monthlyFee: 16000, deposit: 90000, balance: 90000, pages: 8` and add `paymentPlan: 'Half and half', arms: ''`; the `fieldValues` assertions become `'$1,800'`, `'$900'`. Change `findAgreementTemplate('search')` in the fillBlocks test to `'growth'`. In `pdf.test.mjs` line 65 change `'search-plus'` to `'agile'`. In `actions/agreement.test.mjs` change `template: 'search'` to `'growth'`, `buildFee` expectations to `180000` / `90000`, and check the discount test's numbers still add up (`deposit: '700', balance: '700', discount_adjustedBuildFee: '1400'` is fine).

Also add to the placeholders test file a case: `assert.ok(PLACEHOLDERS.includes('paymentPlan') && PLACEHOLDERS.includes('arms'))`.

Run: `node --test netlify/functions/lib/office/agreement-templates.test.mjs` — FAIL (three ids; no tier; unknown placeholders `paymentPlan`, `arms`).

- [ ] **Step 6: Implement in `agreement-templates.mjs`**

```js
import presence from '../../../../src/data/office/agreements/presence.json' with { type: 'json' };
import growth from '../../../../src/data/office/agreements/growth.json' with { type: 'json' };
import agile from '../../../../src/data/office/agreements/agile.json' with { type: 'json' };
import range from '../../../../src/data/office/agreements/range.json' with { type: 'json' };
import search from '../../../../src/data/office/agreements/search.json' with { type: 'json' };
import searchPlus from '../../../../src/data/office/agreements/search-plus.json' with { type: 'json' };
import { TIERS } from './clients.mjs';

// Retired templates render and seal the agreements already created against
// them; they are never offered for a new draft and never regenerated.
export const RETIRED = new Set(['search', 'search-plus']);
const CURRENT = [presence, growth, agile, range];
const ALL = [...CURRENT, search, searchPlus];
```

```js
export const PLACEHOLDERS = [
  'legalName', 'entityType', 'address', 'signerName', 'signerTitle', 'email', 'phone',
  'buildFee', 'monthlyFee', 'paymentPlan', 'deposit', 'depositPercent', 'balance', 'balancePercent', 'pages', 'discountApplied', 'arms',
  'discount.name', 'discount.type', 'discount.amount', 'discount.adjustedBuildFee',
  'discount.monthlyType', 'discount.monthlyAmount', 'discount.discountedMonthlyFee', 'discount.months', 'discount.conditions',
];

export const loadAgreementTemplates = () => CURRENT;
export const findAgreementTemplate = (id) => ALL.find((t) => t.id === id);
```

In `validateAgreementTemplate`, after the `id/name/version` loop:

```js
  if (!RETIRED.has(t.id) && !TIERS.includes(t.tier)) errors.push(`tier must be one of ${TIERS.join(', ')}`);
```

In `fieldValues` add `paymentPlan: text(fields.paymentPlan), arms: text(fields.arms),`.

Run: `node --test` — PASS across the suite (the agreement action tests still post `paymentPlan`-less forms; `fieldsFromForm` ignores unknown fields until Task 7).

- [ ] **Step 7: Commit**

```bash
git add src/data/office/agreements netlify/functions/lib/office
git commit -m "Add the four agreement templates, retire two

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Ti4y7Gzbf2CauEELUE5o46"
```

The docx and the generator live outside the repo and are not committed.

### Task 7: Office drafts with the payment plan and the Range arms

**Files:**
- Modify: `netlify/functions/lib/office/agreements.mjs:14-29`
- Modify: `netlify/functions/lib/office/actions/agreement.mjs:10-49`
- Modify: `src/pages/office/clients/[slug].astro:114-116`, `:536-560`
- Test: `netlify/functions/lib/office/agreements.test.mjs`, `netlify/functions/lib/office/actions/agreement.test.mjs`

**Interfaces:**
- Consumes: `template.tier`, `RETIRED`, `loadAgreementTemplates()` (current only) from Task 6.
- Produces: `defaultFields(client, template)` returns `paymentPlan: 'Half and half'` and `arms: ''`, and prefills prices whenever `client.tier === template.tier`. `fieldsFromForm` reads `paymentPlan` (one of `PLANS = ['Half and half', 'Twelve monthly payments']`, default the first) and `arms` (free text, newlines kept). Agreement `fields` documents carry both.

- [ ] **Step 1: Failing tests**

In `agreements.test.mjs` add:

```js
test('defaultFields prefills from the tier when it matches the template, and carries the plan and arms', () => {
  const growthClient = { ...client, tier: 'Growth' };
  const f = defaultFields(growthClient, findAgreementTemplate('growth'));
  assert.equal(f.buildFee, 180000);
  assert.equal(f.monthlyFee, 16000);
  assert.equal(f.paymentPlan, 'Half and half');
  assert.equal(f.arms, '');
  const r = defaultFields({ ...client, tier: 'Range' }, findAgreementTemplate('range'));
  assert.equal(r.buildFee, 210000);
  assert.equal(r.pages, 16);
  const mismatch = defaultFields({ ...client, tier: 'Presence' }, findAgreementTemplate('growth'));
  assert.equal(mismatch.buildFee, 180000);
});
```

(import `defaultFields` and `findAgreementTemplate` if the file does not already.)

In `actions/agreement.test.mjs` add:

```js
test('create stores the payment plan and the arms, and refuses an unknown plan', async () => {
  const s = await make();
  await agreement(post({ ...createFields, template: 'range', paymentPlan: 'Twelve monthly payments', arms: 'Tents\nTables (ongoing strategy)', buildFee: '3000', deposit: '270', balance: '2730', pages: '16' }), ctx(), s, mail, NOW);
  const [a] = await s.agreements.list('lova');
  assert.equal(a.fields.paymentPlan, 'Twelve monthly payments');
  assert.equal(a.fields.arms, 'Tents\nTables (ongoing strategy)');
  assert.equal(a.fields.deposit, 27000);
  const s2 = await make();
  assert.match(loc(await agreement(post({ ...createFields, paymentPlan: 'Yearly' }), ctx(), s2, mail, NOW)), /error=payment plan/);
  await agreement(post(createFields), ctx(), s2, mail, NOW);
  const [b] = await s2.agreements.list('lova');
  assert.equal(b.fields.paymentPlan, 'Half and half');
  assert.equal(b.fields.arms, '');
});
```

Run: `node --test netlify/functions/lib/office/agreements.test.mjs netlify/functions/lib/office/actions/agreement.test.mjs` — FAIL (`paymentPlan` undefined).

- [ ] **Step 2: Implement `defaultFields`**

In `agreements.mjs` delete `TIER_FOR_TEMPLATE` and write:

```js
export const PLANS = ['Half and half', 'Twelve monthly payments'];

export function defaultFields(client, template) {
  const prices = client.tier === template.tier ? tierPrices(client.tier) : null;
  const buildFee = prices?.build ?? money(template.defaults.buildFee);
  const monthlyFee = prices?.monthly ?? money(template.defaults.monthlyFee);
  return {
    legalName: client.business ?? '', entityType: '', address: client.address ?? '',
    signerName: client.name ?? '', signerTitle: '', email: client.email ?? '', phone: client.phone ?? '',
    buildFee, monthlyFee, paymentPlan: PLANS[0], deposit: Math.round(buildFee / 2), balance: buildFee - Math.round(buildFee / 2),
    pages: template.defaults.pages ?? null, arms: '', discountApplied: false,
    discount: { name: '', type: '', amount: '', adjustedBuildFee: null, monthlyType: '', monthlyAmount: '', discountedMonthlyFee: null, months: null, conditions: '' },
  };
}
```

- [ ] **Step 3: Implement `fieldsFromForm`**

In `actions/agreement.mjs` import `PLANS` from `../agreements.mjs`, and after the `TEXT` fields:

```js
  // The plan is a Schedule 1 choice; the deposit and balance rows still have
  // to add up, so the admin types the first payment and the remainder.
  f.paymentPlan = field(data, 'paymentPlan') || PLANS[0];
  if (!PLANS.includes(f.paymentPlan)) errors.push(`payment plan must be ${PLANS.join(' or ')}`);
  f.arms = String(data.get('arms') ?? '').replace(/\r\n/g, '\n').trim();
```

(`field()` trims and collapses; `arms` keeps its line breaks so one arm per line survives to the PDF.)

Run the two test files: PASS.

- [ ] **Step 4: The create form and the picker**

In `[slug].astro` replace line 115 with:

```ts
const defaultTemplateId = agreementTemplates.find((t) => t.tier === client.tier)?.id ?? 'presence';
```

and widen the `agreementTemplates` type to `{ id: string; name: string; tier: string }[]`.

In the "Commercial terms, USD" row, after the Monthly fee input add:

```astro
              <label class="field"><span>Payment plan</span>
                <select name="paymentPlan">
                  {PLANS.map((p) => <option value={p} selected={p === (posted('paymentPlan') ?? draftFields.paymentPlan)}>{p}</option>)}
                </select>
              </label>
```

and after the Pages input, outside the `.row`:

```astro
            <p class="field-hint">On the twelve-payment plan the deposit is the first payment, nine percent of the build fee, and the balance is the remaining eleven.</p>
            <label class="field"><span>Business arms covered (Range only)</span><textarea name="arms" rows="4" placeholder="One arm per line. Add (ongoing strategy) after an arm the quote includes it for.">{posted('arms') ?? draftFields.arms}</textarea></label>
```

Import `PLANS` from `../../../../netlify/functions/lib/office/agreements.mjs`.

- [ ] **Step 5: Check on the harness**

Start the harness (Global Constraints), log in, open a client, set the tier to Range, go to Agreements: the picker offers the four current templates with Range selected, prices prefill $2,100 and $350, the plan select and arms textarea render. Create a draft with two arms; open the signing page and confirm Exhibit A shows the arms and Schedule 1 shows the plan. `astro check` clean: `npm run check`.

- [ ] **Step 6: Commit**

```bash
git add netlify/functions/lib/office "src/pages/office/clients/[slug].astro"
git commit -m "Draft agreements with a payment plan and Range arms

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Ti4y7Gzbf2CauEELUE5o46"
```

### Task 8: README, the gate, and the manual pass

**Files:**
- Modify: `README.md:368-407` (Agreements), `:180-195` (office intro), the regeneration paragraph under "What doesn't belong in this repo"

- [ ] **Step 1: README**

In "Agreements": "The three package agreements" becomes "The four package agreements (Presence, Growth, Agile, Range)"; add after the first paragraph:

> `search.json` and `search-plus.json` are retired: they still render and seal agreements created against them, never appear in the template picker, and are never regenerated. Schedule 1 carries a payment plan (half and half, or twelve monthly payments; the deposit and balance rows must still add up) and, on Range, the list of business arms, which the create form prompts for.

In the office intro, after the "On you" sentence add:

> Pipeline tasks can name the packages they apply to and a repeat (weekly, every two weeks, monthly, quarterly, yearly). Advancing a client creates only the tasks for their tier; marking a repeating task done creates the next one while the client is still in that task's stage, which is how Agile's check-ins stop at launch and its monthly strategy meeting keeps going.

Replace the regeneration paragraph's example command list with the four packages:

```
python3 scripts/agreement-from-docx.py ../legal/presence-agreement.docx presence > src/data/office/agreements/presence.json
```

"and the same for `growth`, `agile` and `range`. The docx are written by `../legal/tools/make-agreements.py` from the Search Plus docx in `../legal/backup-2026-09-12/`; edit that script, not the docx, then regenerate."

- [ ] **Step 2: The gate**

Run: `npm run gate`
Expected: tests pass, `astro check` clean, questionnaire and office checks clean, build succeeds, verify prints every check ok. Fix and re-run until green.

- [ ] **Step 3: Manual pass on the harness**

With the harness running and a fresh scratch store: create one client per tier and advance each through every stage. Confirm per tier:

| Tier | Agreement | Intro | Layouts | Live |
|---|---|---|---|---|
| Presence | no kickoff | — | no check-in | Analytics summary, Annual recap |
| Growth | Kickoff call | — | Stage check-in | Search summary, Annual recap |
| Agile | Kickoff call | Discovery session | Research check-in (every two weeks) | Strategy meeting, Research and test review, Search summary, Annual recap |
| Range | Kickoff call | — | Stage check-in | Search summary, Annual recap |

Mark Agile's Research check-in done twice in Layouts (a second and third appear), advance to Copy, mark the Layouts one done (nothing new). In Live, mark Strategy meeting done: next month's appears. Today's page shows the repeat word in the meta line. Create a Range agreement with arms and the twelve-payment plan, sign as Keepsite, open `/sign/?t=…` in a private window and read Schedule 1, Section 2.1 and Exhibit A.

- [ ] **Step 4: Commit and hand over**

```bash
git add README.md
git commit -m "Document the four packages and retired templates

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Ti4y7Gzbf2CauEELUE5o46"
```

Then use the finishing-a-development-branch skill: the owner reviews the four docx in Word before this branch merges; any agreement draft created before deploy on the old Presence version must be voided and re-created after.
