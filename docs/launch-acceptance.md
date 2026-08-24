# Launch acceptance checklist

The go/no-go on the brand transition. Three parts, by what can prove them:

- **Part A** is already proven. Run headlessly on 2026-08-23 against the `dist/`
  that `npm run build` produces at commit `4bf8017`. Evidence is recorded inline.
  A few items have a production counterpart in Part C; those say so.
- **Part B** needs the deploy preview. Push `brand-transition`, open the PR,
  wait for the preview URL, then work through it.
- **Part C** needs production. Do it after merge and after the domain flip in C1.

Anything that fails goes back to the task that owns it. The task numbers are in
`.superpowers/sdd/2026-08-23-keepsite-brand-transition/`.

Two findings block launch: **C1**, at the top of Part C, and **D1**, in Part D.
Read those two first.

---

## Part A: proven

Method: `dist/` served by a local static server that reproduces `netlify.toml`
(clean URLs, the three 301s, the `/admin` 200 rewrite, all four header blocks),
driven by the Chromium and Lighthouse that `@netlify/plugin-lighthouse` already
vendors. Scripts are in the session scratchpad, not the repo.

### A1. Lighthouse, four categories, five gated routes

Lighthouse 9.6.8, mobile preset, simulated throttling, HeadlessChrome 136.

| Route | Perf | A11y | Best practices | SEO | CLS | LCP |
|---|---|---|---|---|---|---|
| `/` | 100 | 100 | 100 | 100 | 0 | 1.1s |
| `/packages/` | 100 | 100 | 100 | 100 | 0 | 1.4s |
| `/how-it-works/` | 100 | 100 | 100 | 100 | 0 | 1.1s |
| `/faq/` | 100 | 100 | 100 | 100 | 0 | 1.2s |
| `/start/` | 100 | 100 | 100 | 100 | 0 | 1.1s |

Zero failing audits on all five. The `netlify.toml` thresholds are 1.0 across
the board, so there is no margin: any single regression cancels the deploy.

Two ungated routes, for the record: `/start/thanks/` and `/404` score
100/100/100/**92**. The single SEO deduction on each is `is-crawlable`, which
fires on their `noindex,follow`. That is intended, and neither route is in the
plugin's audit list.

Caveat: local Lighthouse is version 9.6.8 (what the plugin pins). Chrome
DevTools ships a much newer Lighthouse whose scoring curves differ. Treat A1 as
strong evidence that the deploy gate will pass, not as a substitute for reading
the gate's own output in B4.

### A2. Layout shift and the font swap

- Lighthouse CLS: **0** on all five gated routes. 0.003 on `/start/thanks/`,
  which is run-to-run noise below the 0.1 "good" threshold.
- Live `PerformanceObserver` on `/`, mobile viewport, throttled to 400 kbps and
  400 ms RTT: **CLS 0, zero layout-shift entries.** Not one shift was recorded
  at any point in the load, which is what the preloaded woff2 is there to buy.

**Not proven: the `size-adjust` numbers themselves.** The fallback face declares
`src: local('Arial'), local('Helvetica Neue'), local('Liberation Sans')`. This
Linux container has none of the three, so `Instrument Sans Fallback` resolved to
`status: "error"` and the fallback measurement fell through to Chrome's default
sans. The 70 px block-height delta measured with fonts blocked is that
substitution, not evidence about `size-adjust: 106.5%`. Validating the metric
overrides needs a machine where Arial exists. It is B7.

### A3. axe-core, seven routes, two viewports

axe-core **4.10.2** (current), WCAG 2.0 A/AA + 2.1 A/AA + 2.2 AA +
best-practice rules, at 390x844 and 1440x900.

**Zero violations. All fourteen runs.** Cross-checked against the axe-core 4.4.1
that ships inside Lighthouse: also zero.

Three "needs review" items, all investigated and cleared:

1. `color-contrast`, 26 nodes on `/packages/`: the aria-hidden check and dash
   glyphs in the comparison table. axe will not score glyph-only content.
   Computed directly: `rgb(31,36,33)` on `rgb(251,249,244)` = **14.98:1**.
   Passes 4.5:1 and 3:1 with room to spare.
2. `th-has-data-cells`, 1 node on `/packages/`: caused by the two
   `<th scope="rowgroup" colspan="4">` band rows (Build, Monthly). A rowgroup
   header spanning the table has no data cells to its right, so axe declines to
   judge. Confirmed by deleting those two rows in the live DOM and re-running:
   the check flips to **pass**. The markup is correct as written.
3. `color-contrast` "partially obscured", 2 nodes on `/start/` and 9 more on
   `/packages/` at mobile width: the two empty textareas, and cells scrolled
   outside the `.table-scroll` clip. Empty elements have no text to contrast.

### A4. Keyboard-only pass

Tab order captured programmatically on `/`, `/start/`, `/packages/`, `/faq/`.

- **Skip link is focus #1 on every route**, with the two-tone ring
  `0 0 0 2px #FBF9F4, 0 0 0 4px #1F2421`.
- Every header nav item and the CTA button takes focus in source order. The CTA
  sits on `rgb(31,92,67)` green and still gets the off-white-then-ink ring, so
  the old green-on-green failure is gone.
- In the deep green closing band the ring **inverts** to
  `0 0 0 2px #16302A, 0 0 0 4px #FBF9F4`, as `.section-deep :focus-visible`
  specifies.
- `:focus-visible` matches on every probed element, and `outline` is
  `2px solid transparent` throughout, so nothing depends on a UA default.
- Accordions: `<summary>` takes focus, and **Enter and Space each toggle open
  and closed**. 20 on `/faq/`, 5 on `/packages/`.
- Comparison table at 390px: `.table-scroll` is `role="region"`,
  `aria-label="Package comparison"`, `tabindex="0"`, takes focus, and eight
  ArrowRight presses scroll it 0 to 298 px (scrollWidth 640, clientWidth 342).
- Full form fill and submit from the keyboard on `/start/`: all seven fields
  reached in order, `checkValidity()` true, Enter submits, lands on
  `/start/thanks/`.

One defect found. See **D2**.

### A5. Screen reader semantics

Not a screen reader. Chrome's accessibility tree via CDP, which is what a screen
reader consumes. It settles what the markup exposes; it does not settle how
VoiceOver or NVDA phrase it. The phrasing pass stays as **C6**.

- **Landmarks**, all seven routes: `banner`, `main`, `contentinfo`, plus
  `navigation` named "Primary" and `navigation` named "Footer". `/packages/`
  adds `region` named "Package comparison". No unnamed duplicate landmarks.
- **Comparison table**: every data cell's accessible name is **"Included"** or
  **"Not included"**, never a bare glyph. Header resolution for a sampled cell
  returns row header "Custom website design and build", column header "Search",
  band header "Build".
- **How it works**: `<ol class="steps">` with **5 children** and an explicit
  `role="list"`, which it needs because `list-style: none` strips list semantics
  in Safari and VoiceOver.
- **`/start/` fields**: every control has an accessible name, `required` is true
  on the four required fields, and "What does your business do?" carries
  `description: "What you do, who you do it for, and roughly where."` from its
  `aria-describedby`. Nit, not a defect: because the hint span sits inside the
  `<label>`, that sentence lands in both the name and the description, so it is
  announced twice.

### A6. Structured data, static validation

Parsed from the rendered pages, then checked against the current schema.org
term list (roughly 2,000 types and 1,900 properties, fetched from
`schema.org/version/latest`).

- **Every `@type` is a real schema.org type. Every property is a real
  schema.org property, and is declared on the type that uses it or on one of its
  supertypes. Zero findings.**
- `/`: `WebSite` + `ProfessionalService` in one `@graph`. Business node has
  name, url, telephone, `areaServed: State "Utah"`, and **no `address`**, which
  is what suppresses a local-business rich result, as intended.
- `/packages/`: the base graph plus **three `Service` items, two `Offer`s
  each**. Build offers carry `price` + `priceCurrency`; subscription offers
  carry a `UnitPriceSpecification` with `billingDuration: "P1M"`. Every
  `provider` resolves to `#business`.
- `/faq/`: the base graph plus `FAQPage` with **20 `Question`s**, each with a
  `name` and an `acceptedAnswer` of type `Answer` with `text`. No duplicates.

Google's Rich Results Test has no public API and needs a live URL, so the
verdict-level check stays as **C5**.

### A7. No-JS behaviour

`/start/` loaded with JavaScript disabled, three times:

- `<option value="Not sure yet" selected>` is in the **static HTML**, so the
  select defaults to "Not sure yet" with or without JS, and with or without
  `?tier=`.
- The form is a plain POST: `method="POST"`, `action="/start/thanks/"`,
  `data-netlify="true"`, `data-netlify-honeypot="bot-field"`, plus the
  `<input type="hidden" name="form-name" value="inquiry">` Netlify needs. No
  `onsubmit`, no interception.
- With JS on, the prefill maps `?tier=presence|search|search-plus` to
  Presence / Search / Search Plus, and `?tier=bogus` falls back to "Not sure
  yet".

### A8. Content Security Policy, marketing routes

All seven routes, plus `/start/?tier=search`, loaded under the strict `/*`
policy from `netlify.toml`:
**zero CSP violations, zero console messages, zero failed requests.** The
inline JSON-LD and the single prefill script survive `script-src 'self'
'unsafe-inline'`.

This proves the policy is compatible with the pages. It does **not** prove
Netlify delivers the header. That is **B1**.

### A9. Residue sweep against served HTML

```
for u in / /packages/ /how-it-works/ /faq/ /start/ /start/thanks/ /404; do
  curl -s "http://127.0.0.1:PORT$u" \
    | grep -io "no lock-in\|\$0 a month\|nothing to pay\|\$500\|\$750\|snic9004"
done
```

Output: nothing. Clean on all seven. Re-run against production as **C8**, since
that is the only version that proves what shipped.

### A10. Meta, canonical, Open Graph tags

All seven routes carry a unique `<title>`, a unique `<meta name="description">`,
`rel="canonical"`, matching `og:title` / `og:description` / `og:url`,
`og:type=website`, `twitter:card=summary_large_image`, and
`og:image=https://www.keepsitemedia.com/og-default.png` with an `og:image:alt`.
`noindex,follow` appears on `/start/thanks/` and `/404` only. No page still
carries the old "websites that you own and keep" line.

`dist/og-default.png` is **1200 x 630**, 42 KB.

Gap worth closing: there is no `og:image:width` / `og:image:height`. Some
scrapers render the card faster and more reliably with them. Advisory, not a
failure.

### A11. Automated gate

`npm run gate` (astro check, build, `scripts/verify.mjs`): **20 assertions, 20
passed, 0 failed.** Build clean, 7 pages, zero errors, zero warnings, zero hints.

---

## Part B: needs the deploy preview

Push `brand-transition`, open the PR against `main`, use the preview URL. This
merges the nine items Task 6.4 left open.

- [ ] **B1. Security headers are delivered.** The live pre-transition deploy
  currently returns only `strict-transport-security` and `cache-control`, so the
  whole `[[headers]]` block is new and unproven.

  ```bash
  P=https://<preview-url>
  curl -sI "$P/" | grep -iE 'content-security-policy|strict-transport|x-content-type|referrer-policy|permissions-policy|x-frame'
  ```

  Expect all six on `/`.

- [ ] **B2. The `/admin` exact-path header block works.**

  ```bash
  curl -sI "$P/admin"  | grep -i 'content-security-policy'
  curl -sI "$P/admin/" | grep -i 'content-security-policy'
  ```

  Both must return the **widened** policy naming `unpkg.com` and
  `identity.netlify.com`, not the strict `/*` one. The two identical header
  blocks exist because `/admin` does not match the `/admin/*` glob, and this
  curl is the only thing that proves the exact-path block fires.

- [ ] **B3. Cache headers.** `curl -sI "$P/"` gives
  `cache-control: public, max-age=0, must-revalidate`. Any `/_astro/*` asset
  gives `max-age=31536000, immutable`.

- [ ] **B4. The Lighthouse plugin's own gate.** Read the deploy log's plugin
  summary table. Five audits, four categories, all at 1.0. A1 says this should
  pass; the log is what makes it a fact. If a threshold trips, the deploy is
  cancelled and no report ships, so the failing-audit list in the **log** is the
  diagnostic, not `/reports/`.

- [ ] **B5. `/reports/lighthouse-home.html` renders.** Load it with the console
  open. It is a self-contained page with inline styles and script served from
  the locked-down `/*` policy, so it is worth one look.

- [ ] **B6. Decap boots.** Load `/admin/` with the console open. Zero CSP
  violations, Identity widget renders, login completes. **Then load bare
  `/admin`.** See **D1** before you do: it is expected to fail, and this is the
  check that confirms it.

- [ ] **B7. Font metrics on a machine that has Arial.** Throttle to Slow 3G,
  disable cache, reload `/`, watch the hero. Expect no visible reflow when
  Instrument Sans swaps in.

  If text jumps: block `/_astro/*.woff2` in the Network tab, screenshot the
  hero, unblock, reload, screenshot again, compare line widths. Widen or narrow
  `size-adjust` until they match, then re-derive the overrides as
  `0.970 / size-adjust` and `0.250 / size-adjust`. Owner: Task 1.3.

- [ ] **B8. Netlify Forms re-detection.** The `inquiry` form appears under the
  site's **Forms** tab after this build. Detection is build-time. If it is
  missing, confirm `name="inquiry"` and `data-netlify="true"` are both in the
  deployed HTML, then redeploy.

- [ ] **B9. Live form submission on the preview.** Submit end to end. Lands on
  `/start/thanks/`, appears in the Forms dashboard, notification arrives.

- [ ] **B10. Homepage bands, two-screen check.** At 1440x900 and 1280x720.
  Measured layout: band 1 at y=77 (h 775), band 2 at 852 (h 548), band 3 at
  1400 (h 553), band 4 "Why Keepsite" at **1953**, band 5 at 2407. Bands 1 to 3
  are inside two screens at both sizes; **band 4 starts below two screens at
  both** (1800 px and 1440 px respectively). Task 6.4 expected bands 1 to 4
  within two screens. Owner call: accept the measurement, or tighten bands 1 to
  3. Owner: Task 3.1.

- [ ] **B11. No-JS walk.** Disable JavaScript and walk all seven routes plus the
  form. Everything except the `?tier=` prefill must behave identically. A7 proves
  `/start/`; this covers the rest.

---

## Part C: needs production

- [ ] **C1. Flip the primary domain to `www`. Do this before anything else in
  Part C.** Right now production does the opposite of what the site claims:

  ```
  https://keepsitemedia.com/      -> 200
  https://www.keepsitemedia.com/  -> 301 -> https://keepsitemedia.com/
  ```

  Every canonical, `og:url`, sitemap entry, JSON-LD `@id`, and the CMS
  `site_url` points at `https://www.keepsitemedia.com/`. Launching as-is means
  every canonical URL 301s to a different host, and every curl below returns a
  redirect instead of the thing you are testing. Netlify → Domain management →
  set **`www.keepsitemedia.com` as Primary**. `README.md` "Connecting the
  domain" already documents this; it has not been applied. Re-check with the two
  curls above: apex 301s to www, www returns 200.

- [ ] **C2. Lighthouse in Chrome DevTools**, mobile preset, against production
  `/`, `/packages/`, `/how-it-works/`, `/faq/`, `/start/`. Target 100/100/100/100.
  A newer Lighthouse than the plugin's, so this is the number worth quoting.

- [ ] **C3. axe DevTools extension** on all seven routes including
  `/start/thanks/` and `/404`. Expect zero violations, and the same three
  cleared "needs review" items listed in A3.

- [ ] **C4. Redirects.**

  ```bash
  for u in /pricing /pricing/ /contact /contact/ /portfolio; do
    printf '%s -> ' "$u"
    curl -sI "https://www.keepsitemedia.com$u" | awk '/^HTTP|^location/i {printf "%s ", $0}'
    echo
  done
  ```

  Expect 301 on each, to `/packages/`, `/packages/`, `/start/`, `/start/`, `/`.

  Note: `netlify.toml` declares `/pricing`, `/contact`, `/portfolio` without
  trailing slashes. Netlify normalises the trailing slash when matching, so the
  `/pricing/` and `/contact/` variants should hit the same rules. That is an
  assumption about Netlify's matcher, not something the config states. If either
  variant 404s, add the explicit rules. Owner: Task 4.1.

- [ ] **C5. Rich Results and Schema.org.** A6 proved the vocabulary is valid;
  this proves Google's parsers agree.

  Google's [Rich Results Test](https://search.google.com/test/rich-results) on
  `/`, `/packages/`, `/faq/`. Expect `WebSite` + `ProfessionalService` on `/`,
  three `Service` items on `/packages/`, `FAQPage` with 20 questions on `/faq/`.
  Zero errors. No local-business result on `/`, because there is no address.

  The Schema.org validator has a working CLI form:

  ```bash
  for u in / /packages/ /faq/; do
    printf '%s ' "$u"
    curl -s -X POST 'https://validator.schema.org/validate' \
      --data-urlencode "url=https://www.keepsitemedia.com$u" \
      | grep -o '"totalNum[^,}]*' | tr '\n' ' '
    echo
  done
  ```

  Expect `"totalNumErrors":0` on each. The response is prefixed `)]}'`, which is
  normal. Only `url=` works; the `code=` field is rejected, so this cannot be run
  against a local build.

- [ ] **C6. Screen reader pass**, VoiceOver or NVDA. A5 proved what the
  accessibility tree exposes; this proves how it is announced.

  1. `/packages/` table, cell by cell: each cell announces its row and column
     headers, and "Included" or "Not included".
  2. `/how-it-works/`: the steps announce as a list of 5 items, in order.
  3. `/start/`: every field announces label, required state, and the hint on
     "What does your business do?". Listen for whether the doubled hint (A5) is
     annoying enough to move outside the `<label>`.
  4. Every page: landmarks announce as banner, navigation, main, contentinfo.

- [ ] **C7. Open Graph preview.** Paste production `/`, `/packages/`, `/faq/`
  into LinkedIn Post Inspector or equivalent. The deep green 1200x630 card
  renders and the title and description are the page's own. Force a re-scrape if
  a stale card shows.

- [ ] **C8. Residue sweep against production HTML.**

  ```bash
  for u in / /packages/ /how-it-works/ /faq/ /start/ /start/thanks/ /404; do
    curl -s "https://www.keepsitemedia.com$u" \
      | grep -io "no lock-in\|\$0 a month\|nothing to pay\|\$500\|\$750\|snic9004" \
      && echo "RESIDUE at $u"
  done
  echo "sweep complete"
  ```

  Only `sweep complete`. No `RESIDUE` line. No acceptable exception.

- [ ] **C9. Live form submission, twice.**
  1. Submit at `https://www.keepsitemedia.com/start/`. Lands on
     `/start/thanks/`. Appears under **Netlify → Forms → inquiry** with all
     seven fields. Notification arrives at **keepsitemedia@gmail.com**.
  2. Repeat from `/start/?tier=search` and confirm the stored `package` value is
     `Search`.

- [ ] **C10. Record the sign-off.** Paste Part A's tables plus the Part B and C
  results into the PR or the deploy notes. That record is what makes "Lighthouse
  100s" a fact rather than a claim, which matters for a business whose pitch is
  ongoing competence.

---

## Part D: open findings

### D1. Bare `/admin` loads the CMS shell but cannot load its config

**Blocking for the CMS, not for the marketing site.** Reproduced locally against
a server that implements `netlify.toml` exactly.

`dist/admin/index.html` has no `<link rel="cms-config-url">`, so Decap falls
back to fetching `config.yml` **relative to the document URL**:

- At `/admin/` it resolves to `/admin/config.yml`. 200. CMS renders its login.
- At `/admin` it resolves to `/config.yml`. 404. The page renders
  *"Error loading the CMS configuration / Failed to load config.yml (404)"*.

`netlify.toml` rewrites `/admin` to `/admin/index.html` with **status 200**, so
the browser's URL stays `/admin` and the relative fetch misses. `README.md`
tells the owner to log in at `https://<your-site>/admin`, which is the broken
form.

Two fixes, either one:

1. Add `<link href="/admin/config.yml" type="text/yaml" rel="cms-config-url">`
   to `public/admin/index.html`. Keeps the 200 rewrite and the exact-path CSP
   block meaningful.
2. Change the redirect to `status = 301, to = "/admin/"`. Simpler, but then the
   `for = "/admin"` header block only ever decorates a redirect.

Not fixed here: Task 9.2 produces a checklist, not a diff. Owner: Task 8.1,
which already owns `public/admin/`. **Confirm the repro on the preview (B6)
before changing anything**, because it turns on Netlify's redirect-rule
precedence, which cannot be tested locally.

Related, benign: on localhost, `/admin/` logs two CSP violations from Decap
probing `http://localhost:8081/api/v1`, because `config.yml` sets
`local_backend: true`. Decap only probes when the hostname is `localhost` or
`127.0.0.1`, so this will not fire on a preview or in production. B6 confirms.

### D2. The skip link moves the browser's scroll position but not focus

`<main id="main">` has no `tabindex="-1"`. Measured on `/`:

- Tab once: the skip link takes focus with the correct ring. Correct.
- Enter: `location.hash` becomes `#main` and the page scrolls to y=77.
  `document.activeElement` is still `<body>`.
- Tab again: focus lands on the first link **inside** `<main>`. So in Chrome the
  practical outcome is right, because Chrome sets the sequential-focus-navigation
  starting point from the fragment.

Not every engine does. Safari historically does not, and a screen reader's
virtual cursor may not follow the hash either, which is the case the skip link
exists for. The one-line fix is `tabindex="-1"` on `<main id="main">`.

Advisory, not a gate failure: axe finds no violation, Lighthouse accessibility
is 100, and the Chrome behaviour is correct. Owner: Task 1.2, which owns
`BaseLayout.astro`. Worth confirming against a real screen reader in C6 first.

### D3. Advisories, no owner assigned

- No `og:image:width` / `og:image:height`. See A10.
- The `aria-describedby` hint on "What does your business do?" is announced
  twice, once as part of the accessible name and once as the description,
  because the hint span sits inside the `<label>`. See A5. Judge it in C6.

---

## Verdict

**Proven, no further action:** Lighthouse 100/100/100/100 on all five gated
routes; CLS 0 including under throttling; zero axe violations on seven routes at
two viewports with the current axe-core; skip link first in tab order on every
route; focus rings visible and correctly inverted on all three surfaces;
accordions keyboard-operable with Enter and Space; comparison table scrollable
by keyboard with an accessible name; full form fill and submit by keyboard;
every table cell announcing "Included" or "Not included"; correct landmarks on
all seven routes; JSON-LD valid against the schema.org vocabulary with zero
findings and the exact shapes the spec calls for; no-JS form is a plain POST
defaulting to "Not sure yet"; zero CSP violations on every marketing route;
residue sweep clean; `npm run gate` 20/20.

**Pending the preview:** header delivery, the `/admin` exact-path CSP block,
cache headers, the Lighthouse plugin's own gate, Decap booting, Netlify Forms
re-detection, live submission, the two-screen band question, and the
`size-adjust` validation.

**Pending production:** the domain flip, DevTools Lighthouse, axe DevTools,
redirects, Rich Results, a real screen reader, share-card scraping, the
production residue sweep, and the two live form submissions.

**Blocking now:** D1 (bare `/admin` cannot load its config) and C1 (production
canonicalises to the apex while the entire site claims `www`). C1 is a settings
change, not a code change, and it must happen before the rest of Part C.
