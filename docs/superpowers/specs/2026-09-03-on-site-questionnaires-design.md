# On-site questionnaires — design

Three questionnaires move off Google Forms and onto keepsitemedia.com.
Each submission is one client's answers, delivered as JSON that
`keepsite-sitemap` reads directly. Access is gated by a signed token in
the URL, so the pages can sit on a static host without being open to
anyone who finds them.

The work spans two repositories:

- **keepsite** — the questionnaire pages, the submission function, and
  the token-minting script.
- **keepsite-skills** — the intake reader, which stops parsing CSV.

## Why

Google Forms exports every client's responses in one sheet, so reading
one client's answers means picking a row out of everyone's. Neither
form collects an email address or a business name, and
`intake.mjs:identity()` looks for exactly those two:

```js
const identity = (r) => field(r, 'email') || field(r, 'business name');
```

Both return `''`. `selectResponse` therefore cannot group rows by
client at all: it throws `more than one client in this file`, or
reduces to the newest `Timestamp` across every client. The `--match`
escape hatch tests a string against every field, so identifying Brynlie
depends on Brynlie having typed "Brynlie" into an answer. That fails
quietly, and a quiet failure here builds the wrong site.

Everything else in `lib/intake.mjs` and `lib/csv.mjs` exists to
reverse-engineer the export: fuzzy header matching against needle
lists, duplicate-submission selection, and multi-select splitting that
matches longest-option-first so `Portfolio/Gallery` is not eaten by
`Gallery`, then makes a second loose-comparison pass for slash-spacing
drift, then splits residue on either `,` or `;` because the separator
varies between exports.

Owning the form removes the problems rather than handling them.

## The three questionnaires

The real sequence today is seven questions, then the four-direction
demo, then fifty-three more. This design keeps that order — a client
seeing four designs before doing an hour of homework is the reason
`client-design-proposals` can work from a URL alone — and fixes the
copy that describes it (see **Copy changes**).

### 1. Pre-demo — `/questionnaire/intro/`

Feeds `client-design-proposals`. Seven questions, four of which
`/start/` already covers. Named `intro` rather than `start` so it is
never confused with the public `/start/` inquiry form.

| Question | Key | Source |
|---|---|---|
| Name and contact | `name`, `email` | prefilled from `/start/` |
| Business name | `business` | prefilled from `/start/` |
| What do you do? | `whatWeDo` | prefilled from `/start/` `about` |
| Existing website or branding | `existingBrand` | website prefilled from `/start/`; branding is new |
| Who do you want to attract? | `attract` | new |
| Three words for how it should feel | `feelWanted` | new |
| Anything you love or hate visually | `visualLikes` | new, optional |

Prefilled fields render with their existing value and stay editable.
The client answers three questions, not seven. This is the concrete
thing that makes "one questionnaire, no dribs and drabs" closer to
true, and it is only possible because both forms are ours.

`/start/` itself does not change. It is a cold-lead form, and moving
"pick three words for how your website should feel" to the top of the
funnel adds friction where it costs the most.

### 2. Post-demo brand — `/questionnaire/brand/`

The current Keepsite Demo Feedback and Brand Questionnaire, fourteen
questions. Two changes:

- `feelWanted` and `existingBrand` are shown back from the pre-demo
  answers as "we have this, correct it if it's wrong" rather than
  asked again.
- The demo pick is generated from the client's own demo file rather
  than typed. See **Resolving the demo pick**.

### 3. Post-demo build — `/questionnaire/build/`

The current build questionnaire, thirty-nine questions. Renamed: it is
titled "Keepsite Search Package Initial Build Questionnaire" today and
contains no tier-specific question, so a Presence client fills in a
form named for a tier they did not buy. One form serves all tiers.

## Question definitions

Each questionnaire is a JSON file in
`src/data/questionnaires/{intro,brand,build}.json`, matching the
existing `src/data/*.json` convention. A definition holds an ordered
list of sections, each with a `legend`, optional `help`, and its
questions:

```json
{
  "formVersion": "2026-09-03",
  "sections": [
    {
      "legend": "How people find you",
      "help": "You do not need to know anything about SEO for this section.",
      "questions": [
        {
          "key": "searchTerms",
          "label": "If someone who had never heard of you needed exactly what you offer, what do you think they might type into Google?",
          "help": "Take a guess. There are no wrong answers.",
          "type": "paragraph"
        }
      ]
    }
  ]
}
```

`type` is one of `short`, `paragraph`, `choice`, `checkboxes`,
`openChecklist`, or `file`. `choice` and `checkboxes` carry an
`options` array.

This file is the source of truth for the option lists that
`keepsite-skills/lib/forms.mjs` currently holds as hand-kept copies of
Google's option text, with a comment admitting the coupling: *"If a
form question is edited, edit here to match."* The same list now
renders the inputs and validates the submission.

Sections become real `<fieldset>`/`<legend>` elements and `help`
becomes `aria-describedby`. In the Sheets export these are glued onto
the question text — header 27 reads *"How People Find You You do not
need to know anything about SEO for this section... what do you think
they might type into Google?"* — and the same happens at headers 18,
19, 21, 22, 33, 36 and 39.

### `openChecklist`

`feelWanted` and `feelRefused` are `openChecklist`: the twenty
`FEEL_WORDS` render as togglable suggestions, and the client can add
their own.

Sierra's pre-demo answer was *"Empowering, Validating, Fun."* None of
those three is in `FEEL_WORDS`. "Fun" is near "Playful"; empowering and
validating have no analogue, and they are the two that say something
about her clients. The fixed list exists to make the answer parseable,
and once the form is ours the answer arrives as an array either way.

The submitted value stays an array of strings, so nothing downstream
changes shape.

## Access control

A token in the query string: `/questionnaire/build/?c=lova&t=<token>`.

`t` is the first sixteen bytes of `HMAC-SHA256(secret, "<slug>:<form>")`,
base64url-encoded. The secret is `KEEPSITE_TOKEN_SECRET`, a Netlify
environment variable. The function recomputes the HMAC and compares in
constant time; a mismatch is a 403 and nothing is stored or sent.

Consequences worth stating plainly:

- **No client list to maintain and no deploy per client.** A token is
  derived, not registered.
- **Tokens do not expire and cannot be revoked individually.**
  Rotating `KEEPSITE_TOKEN_SECRET` invalidates all of them at once.
  Adding expiry means adding a timestamp to the payload and a clock to
  the check; at this client volume it is not worth it, and the blast
  radius of a leaked token is one client's intake file.
- **The page itself is public.** A static host serves the HTML to
  anyone who has the URL. The token gates submission, which is what
  matters — without one, nothing is written and nothing is emailed.

`/questionnaire/*` gets `X-Robots-Tag: noindex, nofollow` in
`netlify.toml` and a `Disallow: /questionnaire/` line in
`public/robots.txt`, matching how `/demo/` is already handled.

A honeypot field mirrors the `bot-field` pattern already in
`src/pages/start/index.astro`. The rule that hides it lives in
`src/styles/global.css`, not in a page's scoped `<style>`: a value in
`bot-field` makes the function discard the submission silently, so a
visible honeypot destroys a completed form and still shows the client a
thanks page. `scripts/verify.mjs` gates it.

## Submission

Native form POST with `enctype="multipart/form-data"` to
`/api/questionnaire`. `form-action 'self'` in the current CSP already
permits it. The function 302s to `/questionnaire/thanks/?f={form}&c={slug}`
on success.

**JavaScript is required**, unlike `/start/`. One static page serves
every client, so the `c` and `t` values ship empty in the HTML and are
filled from the query string at runtime; on the brand form the demo
radios are built at runtime too. Without JavaScript the token never
reaches the form and every submission is a 403. That is inherent to a
static host and one page per form, not a gap to close: the alternative
is a page per client and a deploy per client, which is exactly what
deriving the token instead of registering it was meant to avoid. The
three pages therefore carry a `<noscript>` line saying so, above the
first question — one sentence read up front beats an hour of answers
that cannot be sent.

The function:

1. Verifies the token. Bad token, 403.
2. Validates each answer against the question definition — unknown
   keys rejected, `choice` and `checkboxes` values checked against
   `options` except where the type is `openChecklist`.
3. Writes `{slug}/{form}.json` to Netlify Blobs.
4. Emails the JSON as an attachment.

Blobs is the durable record; email is the notification. If the send
fails after the client has submitted, the answers still exist. That
ordering is the whole point — the one failure that costs real goodwill
is losing forty answers at the submit button.

### Save and resume

The build questionnaire is thirty-nine questions and nobody finishes it
in one sitting. Answers persist to `localStorage`, keyed by slug and
form, written on `input` with a short debounce, and cleared on
`/questionnaire/thanks/` — the function names the key in its redirect
(`?f={form}&c={slug}`). That redirect is the only evidence the answers
were stored, so a 403, a 400 or a 500 leaves the draft where it is;
clearing on the `submit` event would fire before any response and lose
the work on every refusal. Losing an hour of work to a closed tab is the failure that
loses a client's patience, and this is the cheapest possible guard
against it.

### Submitted shape

Keys match the names `read-intake-cli.mjs` already produces —
`whatWeDo`, `primaryAction`, `homepageSections`, `features`, and so on.
The form emits the shape the skill already expects:

```json
{
  "formVersion": "2026-09-03",
  "slug": "lova-content-creation",
  "form": "build",
  "submittedAt": "2026-09-03T18:22:41.007Z",
  "answers": {
    "whatWeDo": "...",
    "pages": ["Home", "About", "Portfolio/Gallery"]
  },
  "files": []
}
```

## Files

Split by size, because a Netlify Function request body caps at about
6MB.

**Logo and brand guide** go through the function into Netlify Blobs
under the client's slug, and are listed in `files`. They are small, and
they arrive named correctly without anyone renaming anything.

**Photos** do not go through the form. Each client gets a Google Drive
folder, linked from the questionnaire and from their confirmation
email.

The Drive folder is created when the client's token is minted, not when
they submit. Making it a side effect of submission buys nothing and
costs a live Google dependency in the request path — an Apps Script web
app deployed "anyone can access", its own quotas, and a
`script.google.com` origin admitted into a CSP otherwise locked to
`'self'`.

Google Photos is not used. Apps Script has no Photos service, and the
Photos Library API was restricted in March 2025 to `appendonly` writes
plus reads of app-created data only, which is precisely the flow that
breaks: a client filling an album through the Photos app creates items
the API cannot read back. Drive has folders, `DriveApp.createFolder()`
is one line, and it takes any file type.

This also retires a live privacy problem. Demo-form Q15 currently
points every client at one shared album,
`photos.app.goo.gl/9vj69b3VTGLTJZRy6`, where each client can see every
other client's photographs.

## Token minting

`scripts/mint-token.mjs` in keepsite. Takes a slug, prints the three
questionnaire URLs and — if `--drive` is passed and credentials are
configured — creates the client's Drive folder and prints its link.

At current client volume, making the folder by hand takes five seconds
and the `--drive` path is optional. It is specified so the manual step
has somewhere to go later, not because it needs automating now.

## Resolving the demo pick

`demo.mjs:readDirections()` already parses a demo file into four
directions with `number`, `id`, and `prefix`.
`directionByAnswer()` then recovers the number from prose with
`/demo\s*0?(\d)/i`.

The brand questionnaire reads the client's demo at
`keepsite/public/demo/{slug}/index.html` at build time and renders one
radio per direction plus an explicit "A mix of several". The submitted
value is the direction `id`, so `directionByAnswer` becomes a lookup
and the regex goes away. "A mix of several" still submits `null`, and
the sitemap skill's existing rule holds: propose a base direction with
one sentence of reasoning and wait for the human.

## keepsite-skills changes

Each submission lands in `{slug}/intake/` as `intro.json`,
`brand.json`, or `build.json`. The names follow the form keys, so
`demo-feedback.csv` becomes `brand.json`.

`readAll(intakeDir, demoPath)` reads `brand.json` and
`build.json`. `intro.json` is stored but not read here — it feeds
`client-design-proposals` at Stage One, before this skill runs. It
keeps computing
`directions` from the demo HTML, keeps resolving `direction`, and keeps
reporting the `blank` list — clients skip a lot of the build
questionnaire and the human should know what the build is working
without.

Deleted: `lib/csv.mjs` entirely, and from `lib/intake.mjs`
`normalise`, `fieldKey`, `field`, `checkboxes`, `stamp`, `identity`,
`selectResponse`, and `readIntake`'s CSV loading. Their tests go with
them. The `--match` flag and the `counts` field disappear, having
nothing left to do.

`unmatchedHeaders` is replaced by a version check. It existed to catch
a question whose wording drifted out from under its needles, which
reads identically to a question the client skipped. With owned forms
that drift becomes a submission made against an older question set, so
`readAll` compares the submission's `formVersion` against the snapshot
in `forms.mjs` and reports a mismatch to the human.

`forms.mjs` keeps its option lists but changes role: it is a versioned
snapshot of the definitions in keepsite, carrying a `FORM_VERSION`
constant. A test asserts every `FEATURE_OPTIONS` entry has a
`references/feature-map.md` mapping and every `PAGE_OPTIONS` entry is
covered by `references/page-set-rules.md`. When the form version moves,
copying the lists over and running the tests says what is unmapped.

The two repositories stay coupled through those lists. The version
field makes the coupling loud instead of silent, which is the most this
is worth given they deploy separately.

### Migrating existing intake

`scripts/csv-to-json.mjs` converts a client's two CSVs to the new JSON
using the current matching logic, run once per in-flight client. Brynlie
is mid-build and her `intake/` holds `demo-feedback.csv` and
`build.csv`. After conversion the CSV path is deleted rather than kept
alongside; two readers for one thing is how the second one rots.

## Copy changes

`src/data/process.json` step 1 reads:

> **Tell us about your business.** One questionnaire covers it. We ask
> for everything we need in one pass, so you're not answering questions
> in dribs and drabs for three weeks.

Three questionnaires run, and two of them arrive after the client has
already picked a direction — build Q18 says *"Think about the homepage
direction you already selected"* and Q21 says *"We already have your
overall homepage direction."*

Step 1 becomes the short pre-demo questionnaire it actually is. The
"everything in one pass" claim moves to the post-demo questionnaires,
where the prefill work above makes it defensible.

`src/data/faq.json` has two questionnaire mentions to check for the
same drift.

## Testing

- **Token:** valid token accepts, wrong slug rejects, wrong form
  rejects, tampered token rejects, missing token rejects.
- **Validation:** unknown key rejected; `choice` value outside
  `options` rejected; `openChecklist` accepts an unlisted value; every
  question optional except the pre-demo identity fields.
- **Round trip:** a submission fixture through the function produces
  JSON that `readAll` reads without error, with `blank` correct for the
  skipped questions.
- **Version:** a submission carrying an older `formVersion` is
  reported, not silently accepted.
- **Migration:** `csv-to-json.mjs` on the existing e2e fixtures in
  `keepsite-skills/fixtures/e2e/` produces the same values the current
  CSV reader produces. This is the check that the migration loses
  nothing.
- **Accessibility:** all three routes join the Lighthouse audit list in
  `netlify.toml` at the existing thresholds. `accessibility = 1.0` on a
  thirty-nine question form is the point, not an accident — it is what
  forces the fieldset and label work rather than leaving it to
  intention.

## Out of scope

- Token expiry and per-client revocation. Rotate the secret.
- Conditional or branching questions. The agreements list "multi-step
  or conditional forms" under work not included in a build; the
  questionnaires should not quietly become one.
- A dashboard for reading submissions. The JSON attachment and the
  Blobs record are the interface.
- Any change to `/start/`.
- Moving questions between the pre-demo and post-demo forms beyond the
  prefill described above. That is a process decision, and this design
  deliberately keeps the current order.
