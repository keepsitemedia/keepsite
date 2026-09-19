# Keepsite Media

Marketing site for Keepsite Media. Astro static site, deployed to Netlify, content editable via DecapCMS.

## Local development

```bash
npm install
npm run dev      # http://localhost:4321
npm run build    # outputs to dist/
npm run preview  # serve the production build
```

## Editing content

Page copy lives in `src/data/*.json`, one file per page: `site.json`, `home.json`, `packages.json`, `process.json`, `faq.json`, `privacy.json`. Work entries are markdown files in `src/content/work/`. All of it is editable in the browser at `/admin` (DecapCMS) once Identity and Git Gateway are enabled.

The `/admin` sidebar has two collections. **Site Settings** holds the five page files (Site & Navigation, Home Page, Packages Page, How It Works, FAQ). **Work** is the folder collection you add projects to.

**Testing CMS changes locally**, without committing to `main`. Both commands run from the repo root:

```bash
npm run cms    # terminal 1: starts decap-server on :8081
npm run dev    # terminal 2: starts Astro on :4321
```

Then open `http://localhost:4321/admin/`. `local_backend: true` in `public/admin/config.yml` makes the CMS read and write your working tree instead of the repo, so you can try an edit, see it in `npm run dev`, and throw it away with `git checkout src/`.

**Tier prices live in one place.** `src/data/packages.json` is the only source for the four tier prices. Editing one there updates the package cards, the homepage tier strip, the monthly section (for monthly prices), and the JSON-LD `Offer` search engines read, all together.

Two other files quote prices as plain copy, and neither updates on its own:

- `src/data/home.json` — the meta description mentions the starting price ("Packages from $2,400").
- `src/data/faq.json` — answers quote the add-on prices ($60, $150, $225) and Range's floor ($4,200, $490).

Add-on prices in `packages.json` are display-only copy: editing one changes the add-ons list and nothing else. So when any price changes, check those two files too. Add-on prices are flat or "Quoted first". The verifier fails the build if any page states an hourly rate.

## Turning on analytics

Google Analytics 4 is off until a Measurement ID is set: `analyticsId` in
`src/data/site.json`, also editable in `/admin` under Site & Navigation.
With an id present the layout adds the gtag loader and its config on every
public page; the content security policy in `netlify.toml` already allows
Google's tag and collection domains, and `scripts/verify.mjs` adds the two
tags to its script budget when the id is set. The office and the signing
page carry no analytics. Google's Analytics terms require a privacy notice
that names it; `/privacy/`, linked from the footer and edited under
`privacy.json`, is that notice, and it also covers the inquiry form, the
questionnaires, e-signing and Stripe. Update its date when its wording
changes.

The same steps apply to every client site at launch, and the office's
Launch stage creates an "Install analytics and Search Console" task for it:
a GA4 property in the client's Google account with Keepsite as an
administrator, the id in their site, a Search Console domain property
verified by DNS and linked to GA4, and the website URL on their Google
Business Profile. Clients on the seeded pipeline stored before this task
existed do not get it until the pipelines are re-saved under Settings.

## Brand assets

The logo source is `docs/brand/*.svg`, the Canva exports: `1.svg` is the
full lockup with the tagline, `2.svg` the lockup without it, `4.svg` the K
and the stripe block. Everything the site serves derives from them and is
committed, so a build never touches `docs/`:

- `public/brand/*.svg`, the three lockups cropped to their own bounding box
  and recolored from the artboard's ink to the palette tokens, from
  `npm run logos`. `Logo.astro` serves these as `<img>`; inlining them would
  put 9 KB and 20 KB into every page instead of one cached copy.
- `public/favicon.svg`, the mark on a square, also from `npm run logos`.
- `public/og-default.png`, the share card, from `npm run og`.
- `public/apple-touch-icon.png`, the mark at 180px, from `npm run icons`.

Run `npm run logos` first: the other two read `public/brand/`.

The site's faces are Arial and Georgia, which ship with Windows, macOS and
iOS, with Arimo and Gelasio self-hosted as metric-identical fallbacks for
Android and Linux, and Montserrat for labels. All three fallbacks are SIL
OFL through fontsource. `scripts/verify.mjs` fails the build if a stylesheet
still names the retired faces or palette.

## Turning on the Work page

`/work/`, its nav item, the homepage strip, and the sitemap entry are all generated from the `work` content collection, which is empty at launch. They appear on the next deploy after the first entry exists. Nothing needs a code change.

Adding the first real project:

1. In `/admin` → **Work** → **New Work**, fill in every field. `Screenshot` wants a 1200×750 image; anything else is cropped to that ratio.
2. Set **Featured** on the first two or three, so the homepage strip has enough cards to look deliberate. The strip renders only at two or more.
3. In `netlify.toml`, change the `/portfolio` redirect target from `to = "/"` to `to = "/work/"` in the same commit. Until `/work/` exists, that redirect has to point at the homepage.
4. In `netlify.toml`, add a `work/index.html` audit block to the Lighthouse plugin's `[[plugins.inputs.audits]]` list (copy one of the existing blocks) in the same commit, so `/work/` ships gated like every other route.
5. Deploy, then confirm `/work/` resolves, the nav shows **Work** second, and `/portfolio` lands on `/work/`.
6. Removing the **last** project needs a clean rebuild, because Astro's glob loader skips its delete sweep when a collection drops to zero files and leaves the stale page behind. The Netlify build command already clears the store on every build, so a deploy is enough; a local `npm run build` after deleting the last entry may need `rm -rf node_modules/.astro` first.

Never add a project you have not actually built, and never add traffic or ranking numbers to an entry. The schema has no field for them on purpose.

## Deploying to Netlify

1. Push this repo to GitHub.
2. In Netlify: **Add new site → Import from Git**, pick the repo. Build settings are read from `netlify.toml` (build `npm run build`, publish `dist`).
3. Deploy.

> **Branch note:** This repo's default branch is `main`, and the DecapCMS config (`public/admin/config.yml`) is set to `branch: main`. If you create your GitHub repo with a different default branch name, update that value in `public/admin/config.yml` to match before deploying.

## Connecting the domain (keepsitemedia.com via Namecheap)

After the first Netlify deploy, point the Namecheap domain at Netlify. **Netlify recommends using `www.keepsitemedia.com` as the primary domain** — an apex-only (`keepsitemedia.com`) primary doesn't get the full CDN benefits. These steps set up `www` as primary with the bare apex redirecting to it.

1. **Add the domain in Netlify:** Site → **Domain management → Add a domain** → enter `keepsitemedia.com`, then also add `www.keepsitemedia.com`. Set **`www.keepsitemedia.com` as the Primary domain**.

2. **Add DNS records at Namecheap** — Domain List → Manage → **Advanced DNS**. First delete Namecheap's default parking records (the `CNAME` on `@`/`www` and any **URL Redirect** record), then add:

   **`www` subdomain (the primary):**
   - **CNAME** — Host `www`, Value `<your-site-name>.netlify.app` (your Netlify subdomain, shown in the dashboard). TTL **Automatic**.

   **Apex `keepsitemedia.com` (redirects to `www`)** — use whichever record type your DNS supports:
   - **Recommended — ALIAS / ANAME / flattened CNAME:** Host `@`, Value `apex-loadbalancer.netlify.com`. More resilient than an A record.
   - **Fallback — A record:** Host `@`, Value `75.2.60.5`.

   > Heads-up: Namecheap's standard **BasicDNS** usually has no ALIAS/ANAME record type. If you don't see one in Advanced DNS, use the **A record** fallback (`@` → `75.2.60.5`) — it works fine; the ALIAS option is just slightly more resilient.

3. **Wait for DNS to propagate** — usually minutes, up to ~24h.

4. **Enable HTTPS:** Netlify → **Domain management → HTTPS** → **Verify DNS configuration** → **Provision certificate** (free Let's Encrypt). Once issued, turn on **Force HTTPS**.

> **Canonical URL:** because `www` is the primary domain, `site` in `astro.config.mjs` is set to `https://www.keepsitemedia.com`. If you'd rather make the bare apex the primary instead, change it back to `https://keepsitemedia.com` and flip the Primary domain in Netlify.

> **Alternative — let Netlify run DNS:** instead of the records above, set Namecheap's nameservers to the 4 Netlify provides (Domain List → Manage → **Nameservers → Custom DNS**). That auto-handles the apex, but hands Netlify control of the whole DNS zone.

## Enabling the inquiry form

Netlify Forms is automatic — Netlify detects the `inquiry` form on the `/start/` page at deploy time. To get emailed on each submission:

1. After the first deploy, confirm the `inquiry` form appears under **Netlify → Forms** (Netlify detects it automatically from the deployed static HTML).
2. Then set up the notification: **Forms → Form notifications → Add notification → Email notification**.
3. Send to **keepsitemedia@gmail.com**.

## Running the client questionnaires

Three token-gated forms live at `/questionnaire/intro/`, `/questionnaire/brand/`
and `/questionnaire/build/`. They post to a Netlify Function
(`netlify/functions/questionnaire.mjs`), which writes the answers to Netlify
Blobs and emails them as a JSON attachment through [Resend](https://resend.com).

### Environment variables

Set all four in **Netlify → Site configuration → Environment variables**. They
fail quietly in opposite directions, which is why they are worth checking after
every secret rotation.

| Variable | What it does | What happens without it |
|---|---|---|
| `KEEPSITE_TOKEN_SECRET` | The HMAC secret every questionnaire link is derived from. | Every submission is refused with a 403. The function never fails open. |
| `RESEND_API_KEY` | Authenticates the notification email. | **The blob is written and nobody is told a submission arrived.** The client sees the thanks page and everything looks fine. |
| `KEEPSITE_NOTIFY_FROM` | The `from` address on that email. Must be on a domain verified in Resend. | Resend rejects the send, and the same silence as above. |
| `KEEPSITE_NOTIFY_TO` | Where the JSON attachment is delivered — `keepsitemedia@gmail.com`. | Same. |

`KEEPSITE_TOKEN_SECRET` is also needed locally to mint links. Any long random
string works; generate one with `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`.

Rotating it invalidates every link ever issued, for every client, at once.
That is the only revocation there is, by design — see the design doc under
`docs/superpowers/specs/`. Reissue links to anyone mid-questionnaire.

### Minting a client's links

```bash
KEEPSITE_TOKEN_SECRET=... node scripts/mint-token.mjs lova-content-creation
```

It prints one URL per form. The slug must be lowercase letters, digits and
hyphens — it is the client's directory name everywhere else, and the function
rejects anything else. Send the `intro` link when the agreement is signed, and
the `brand` and `build` links once their demo is up. The same command is where
the client's Google Drive photo folder gets created by hand.

### Pulling a submission for the build skills

```bash
NETLIFY_SITE_ID=... NETLIFY_AUTH_TOKEN=... node scripts/pull-intake.mjs {slug}
```

This writes whatever the client has submitted into the workspace beside this
repo:

```
{slug}/intake/intro.json
{slug}/intake/brand.json
{slug}/intake/build.json
```

plus any logo or brand guide they attached. Pass a second argument to write
somewhere else. The site ID is on the Netlify site's settings page and the
token is a personal access token from your Netlify user settings; both stay on
your machine. The email attachment still arrives and is the backup if the
store is ever unreachable.

`keepsite-sitemap` reads `brand.json` and `build.json` from that directory and
refuses to run without them; `intro.json` feeds `client-design-proposals` at
stage one. The filename matters — the skill looks for exactly those names.

## The office (/office)

A private back office for running clients: pipeline stages, tasks, a
calendar, each client's questionnaire answers, and data export. Design:
`docs/superpowers/specs/2026-09-04-client-office-design.md`; the visual
system is in `.interface-design/system.md`. Email, meetings, payments and
e-signed agreements are part of it too, each with its own section below.

The Today page opens with the pipeline drawn as one rail, then two lists:
**On you** (open tasks due in the next three days, late ones first) and
**Waiting on clients** (tasks that wait on a questionnaire, a signature or
a payment, each with the button that chases it). A client's page has the
same rail with the dates each stage was reached and the one Advance
button, then a glance band: agreement, deposit, questionnaires, next task.

Pipeline tasks can name the packages they apply to and a repeat (weekly,
every two weeks, monthly, quarterly, yearly). Advancing a client creates
only the tasks for their tier; marking a repeating task done creates the
next one while the client is still in that task's stage, which is how
Agile's check-ins stop at launch and its monthly strategy meeting keeps
going.

### Setting up, in order

Once per site. The detail for each step is in the section named beside it;
this is only the order, which the sections below do not give you.

1. **Turn on Identity and give yourself the role.** Netlify → **Identity →
   Enable Identity**, **Registration → Invite only**, invite your address,
   accept the email, then open your user and add `admin` under **Roles**.
   See [Who can log in](#who-can-log-in). Nothing else grants access, and
   the role is the step people forget.
2. **Set the environment variables**, before the first deploy that carries
   the office. `KEEPSITE_SESSION_SECRET` is the office-only one and every
   office form post is refused without it; the rest are already set if the
   questionnaires are running. See
   [Environment variables](#environment-variables-1).
3. **Register the Stripe webhook** and put its signing secret in
   `STRIPE_WEBHOOK_SECRET`. Until both exist, Checkout works and no payment
   is ever marked paid. See [Payments](#payments).
4. **Deploy.** Nothing needs creating by hand: the `office` blob store
   appears on the first write, the pipeline stages and email templates seed
   themselves from `src/data/office/`, and both scheduled functions
   register themselves. Confirm they are listed under **Functions →
   Scheduled**. See [Meetings](#meetings).
5. **Walk one client end to end.** Submit `/start/` and check that a client
   lands at the Inquiry stage, then follow
   [After deploying](#after-deploying) for the agreement, the signature and
   the sealed PDF.

To work on the office without deploying, see
[Local development](#local-development-1).

### Who can log in

Netlify Identity users with the `admin` role. Netlify → Identity → invite
the address, then open the user and add `admin` under Roles. Nothing else
grants access; a logged-in Identity user without the role is refused.
Identity itself is enabled, and registration set to invite-only, in steps 1
and 3 of [Enabling the CMS](#enabling-the-cms-admin).

### Environment variables

| Variable | What it does |
|---|---|
| `KEEPSITE_SESSION_SECRET` | Signs the CSRF cookie. Any long random string. Without it every office form post is refused. |
| `KEEPSITE_TOKEN_SECRET` | Already set for the questionnaires; the office uses it to show each client's questionnaire links. |
| `RESEND_API_KEY`, `KEEPSITE_NOTIFY_FROM`, `KEEPSITE_NOTIFY_TO` | Already set for the questionnaires. The office sends every client email from `KEEPSITE_NOTIFY_FROM` and the daily digest and meeting copies to `KEEPSITE_NOTIFY_TO`. |
| `URL` | Set by Netlify. Used in links inside emails; locally it is unset and links point at `https://www.keepsitemedia.com`. |
| `STRIPE_SECRET_KEY` | Creates customers, Checkout links and subscriptions. Without it the Payments tab shows a banner and every payment button is disabled. Use the test key until the first real client. |
| `STRIPE_WEBHOOK_SECRET` | Verifies webhook signatures. Without it every webhook is refused with 400 and no payment is ever marked paid. |
| `KEEPSITE_FEED_TOKEN` | Bearer token for the calendar feed at `/office/api/feed`. Any long random string; generate one the way `KEEPSITE_TOKEN_SECRET` is generated. Without it every feed request is refused with 401. |

### Local development

The office renders on the server, and its store and login are Netlify
services. Two environment variables stand in for them locally:

```bash
KEEPSITE_SESSION_SECRET=dev KEEPSITE_TOKEN_SECRET=... npm run dev:office
```

`dev:office` sets `OFFICE_STORE_DIR=.office-data` (a gitignored directory
of JSON files in place of Netlify Blobs) and `IDENTITY_URL` pointing at the
production Identity service, so you log in with your real account. Delete
`.office-data/` to start over. Under WSL with the repo on `/mnt/c`, the dev
server does not see file changes; restart it after editing.

### Where the data is

Netlify → Blobs → `office`. Keys are `clients/{slug}.json`,
`tasks/{slug}/{id}.json`, and so on; `/office/data/` lists every type with
counts and downloads any of them as JSON or CSV. Questionnaire answers stay
in the `questionnaires` store and are read from there.

### Inquiries

Every verified `/start/` submission also creates a client at the Inquiry
stage, through `netlify/functions/submission-created.mjs`. The email
notification is unchanged. A second inquiry from an email already on file is
added to that client's notes instead.

### Contacts

`/office/contacts/` is for people you work with who are not clients:
partners, referral sources, vendors, anyone with a relationship worth
remembering. A contact has a business, an owner, contact details, a
type and a log of dated notes. The list sorts by the last note, oldest
first, so the relationships going quiet are at the top; the type links
filter it.

"Start a client" on a contact opens the new-client form filled in from
the contact, and once the client exists the contact links to its page.
Contacts send no email, create no tasks and appear nowhere else; they
export from the Data page like everything else, under `contacts`.

### Email

Every email starts from a template under Settings → Emails, seeded from
`src/data/office/templates.json`. Each one opens into a form: name, subject,
Markdown body, and the fields the send screen asks for (key, label, whether
it is required, a default). **Add an email** at the bottom creates a new
one; it appears as a button on every client's Emails tab, and naming its id
in a stage's `email` under Pipelines makes it open when a client enters
that stage. Templates the office sends on its own (meeting and agreement
notices, the questionnaire reminder) and any a stage names can be edited
but not removed.

`{{client.firstName}}`, `{{links.intro}}` and the rest fill from the client;
the full list is under **Placeholders the office fills in**. Advancing a
client to a stage with an `email` opens that template's send screen;
nothing goes out until you click Send. The one exception is the Agreement
stage: its email carries the signing link, which does not exist until an
agreement has been drafted, signed as Keepsite and sent, so advancing
lands on the Agreements tab instead and the send happens from there. Every
send, sent or failed, appears on the client's Emails tab.

### Meetings

Book from the client's Meetings tab. The client and `KEEPSITE_NOTIFY_TO`
each get a confirmation with a calendar file. Two scheduled functions run:

| Function | Schedule (UTC) | Does |
|---|---|---|
| `office-meetings-cron` | every hour | Reminders about 24 hours and about 1 hour before each meeting, to the client and to you. |
| `office-digest-cron` | `0 13 * * *` | One morning email: overdue and upcoming tasks, meetings today and tomorrow, questionnaires waiting, failed payments, unsigned agreements. Not sent when empty. |

13:00 UTC is 7 a.m. Mountain in summer and 6 a.m. in winter. Change the hour
in `netlify/functions/office-digest-cron.mjs` in March and November if that
matters. Netlify shows both functions under Functions → Scheduled.

### Own tasks

Work that belongs to the business and not to a client: business
development, admin, projects. They live on `/office/tasks/`, grouped by
a free-text project label, and show up on Today and the Calendar like
any other task, with the project where the client name would be. The
calendar's add form has an "Office (no client)" choice for them.

A task can repeat weekly, every two weeks, monthly, quarterly or
yearly. Marking it done creates the next one, dated from the one just
finished, on the same day of the month clamped to a shorter month's
end. Reopening a done task keeps the next
one, and marking it done again does not create another.

In the store these are ordinary task documents under the reserved slug
`office`, with `project`, `repeat` and `nextId` fields, so the export,
the digest and the calendar need nothing special. No client can be
created at that slug.

### Calendar feed

`/office/api/feed` is the one office route a machine calls. The family
calendar at homebase.samnichols.dev reads tasks and meetings from it and
adds or finishes own tasks through it. It sits outside the login: the
caller sends `Authorization: Bearer $KEEPSITE_FEED_TOKEN` and nothing
else, and the token lives only in Netlify and in the caller's own
secrets, never in a browser.

`GET` takes `from`, `to` (days, default 30 back to 90 ahead) and `brand`,
and answers JSON, or ICS with `?format=ics`. `POST` takes a JSON body
with `op` of `add` (an own task: `title`, `due`, optional `time`,
`project`, `repeat`, `notes`), `done` or `reopen` (an `id`). The full
contract, with a sample response, is `docs/office-calendar-feed.md`.

### Payments

Stripe is the system of record; the office stores IDs and outcomes.
Entering the Agreement stage creates the Stripe customer. The Payments tab
makes a deposit or balance link (Stripe Checkout, card and US bank account,
the method is saved for the monthly) and starts the monthly subscription
against that saved method. Amounts prefill from `src/data/packages.json`
and are edited on the form for a discount.

Outcomes arrive through one webhook. In Stripe → Developers → Webhooks add
an endpoint at

```
https://www.keepsitemedia.com/.netlify/functions/stripe-webhook
```

listening to `checkout.session.completed`,
`checkout.session.async_payment_succeeded`,
`checkout.session.async_payment_failed`, `checkout.session.expired`,
`invoice.paid`, `invoice.payment_failed` and
`customer.subscription.deleted`, and put its signing secret in
`STRIPE_WEBHOOK_SECRET`. Set the endpoint's API version to the
`Stripe-Version` pinned in `netlify/functions/lib/office/stripe.mjs`
so events arrive in the shape the code reads. A paid deposit or balance
closes the matching task; nothing advances a stage on its own. Failed
payments show on the dashboard and in the digest; a bank payment shows
as pending until Stripe confirms it, usually within four business
days. A Checkout link expires 24 hours after it is created; an expired
link shows on the Payments tab so the admin can create a new one.

Test and live mode are separate Stripe accounts as far as webhooks go:
each has its own endpoint and its own signing secret. Going live means
registering the endpoint a second time in live mode and rotating both
`STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` together. Before that,
delete the test client's payment documents (Payments tab, or the store
under `payments/<slug>/`) so test-mode links and amounts do not sit in
the CSV totals. Which payment methods Checkout offers is set in Stripe →
Settings → Payment methods, not in the code; turn on US bank account there
for ACH, before the deposit is paid, since the monthly charges whatever
the deposit saved.

**Sales tax.** None is collected: the service is not taxable in Utah, and
the agreement leaves any tax that does apply to the client. Stripe Tax is
off in the code; if that ever changes, the Checkout and subscription calls
in `netlify/functions/lib/office/payments.mjs` are where it goes.

**Switching from test to live keys.** A Stripe customer id belongs to one
mode. Any client who entered Agreement on the test key has a test id, and
every payment button on that client fails in live mode. On their Payments
tab, **Forget** next to the customer id clears it; the next link creates a
live customer. A test client can be removed entirely with **Delete client**
under Details on their Overview, which also removes their tasks, meetings,
payments, agreements, emails and documents. Delete is refused once an
agreement is signed or a payment is on record; those are records to keep.

Give a bookkeeper a read-only role in Stripe rather than an office login;
`/office/data/` exports the payment documents as CSV for revenue by
client.

### Agreements

The four package agreements (Presence, Growth, Agile, Range) are generated
from the docx files (see "What doesn't belong in this repo" for
regenerating). On a client's Agreements tab, pick the template, check
Schedule 1 (prefilled from the client and the tier), and create the draft.
Sign it as Keepsite on the next screen; Send opens the agreement email with
the client's signing link filled in. The client reads the agreement at
`/sign/?t=…`, ticks two consents, draws a signature and signs, or declines
with a reason. Signing links last fourteen days.

`search.json` and `search-plus.json` are retired: they still render and seal
agreements created against them, never appear in the template picker, and
are never regenerated. Schedule 1 carries a payment plan (half and half, or
twelve monthly payments; the deposit and balance rows must still add up)
and, on Range, the list of business arms, which the create form prompts
for.

Sending closes the "Send agreement" task. When both have signed, the office
seals a PDF with both signatures and a certificate of completion page, stores
it in the client's documents with its SHA-256, emails it to the client and to
`KEEPSITE_NOTIFY_TO`, closes the "Client signs agreement" task, and the
Payments tab prefills the deposit and balance from Schedule 1. Nothing in an
agreement can be edited after it is sent; void it and create a new one. If the
seal ever fails, the tab offers "Seal again" on the completed agreement that
has no PDF. Signing takes a one-shot lock before it writes; if a submit dies
between the two, the agreement stays `sent` and no signature can land on it
again, so void it and create a new one.

The certificate records each signer's name, email, IP address, browser and
time, the full audit trail, and the document hash. This is the evidence the
ESIGN Act and UETA look for; it is not legal advice.

#### After deploying

1. Open a test client, create a Presence draft, sign as Keepsite, and send
   the agreement email to yourself.
2. Open the link from the email in a private window: read to the end, tick
   both boxes, draw, sign. Expect the thank-you page, the PDF download to
   open, and both completion emails with the PDF attached.
3. On the client's Agreements tab: status `completed`, a hash, a PDF link;
   both the "Send agreement" and "Client signs agreement" tasks closed; the
   Payments tab's deposit prefilled from Schedule 1.
4. Repeat with a second draft and click Decline: the office receives the
   decline email and the tab shows `declined`.
5. Confirm `/sign/?t=garbage` is a plain 404 and that
   `curl -sI https://www.keepsitemedia.com/sign/?t=x | grep -i x-robots-tag`
   shows `noindex`.

### Documents

A client's Documents tab lists everything on file: sealed agreements and
signature images, files the admin uploaded, and the logo or brand guide the
client attached to a questionnaire. Every link streams through the office
behind the admin login; nothing in Blobs has a public URL. Uploads take one
file at a time, up to 4 MB, and only uploads can be removed.

### Search research

Growth, Agile and Range clients get a Research tab. It answers one question
before Stage 2: which searches share a page and which need their own. Results
come from your own browser through a bookmarklet, one click per keyword on
the results page, filed under the keyword whose text matches the search. No
search API and nothing to configure. The keyword list drafts itself from the
build questionnaire and is edited on the tab.

The engine builds one keyword-by-business matrix from the captures. Every
business is weighted by rank and by how rarely it appears across the study,
so a listing site or a competitor that ranks for everything counts for
almost nothing and a business that ranks for two searches counts for a lot.
Directories count for nothing outright. Keywords are clustered into pages
by how alike their businesses are, and each page gets a kind (homepage,
service page, location page, article), a confidence ("clear" or "close call
with …") and a one-line reason naming the businesses that decided it. The
Study section shows the whole matrix, keywords ordered so pages sit as dark
blocks on the diagonal; any cell opens the two searches side by side.

Search volume comes in by CSV: paste the keywords into Google Keyword
Planner, download, import under Search volume. Volume never moves a keyword
between pages; a page whose keywords add up to fewer than ten searches a
month is set aside as not worth building. Unknown volume is shown as
unknown and never treated as zero. When Planner leaves a keyword out of its
export, one button counts the rest as zero, since Planner's silence means
fewer than ten searches a month.

You review pages, not pairs. Edit a page to move keywords in or out, merge
or split; a released keyword is regrouped on its own. Starting a new round
freezes the page list on the round it closes, so an old report keeps saying
what it said. "Write the report to Documents" renders the study grid, the
pages and their reasons as a PDF; the send screen offers to attach the
newest one. Advancing a Growth, Agile or Range client into Demo creates the
"Run search research" task, which links to the tab.

The engine's one parameter, the clustering cut, and the volume floor are
provisional. `scripts/validate-clusters.mjs` scores the page list against
an independent SERP-overlap tool and sweeps the cut;
`scripts/validate-captures.mjs` compares captures with a SERP API. Their
findings live in `docs/research-validation.md`.

## Enabling the CMS (/admin)

DecapCMS uses Netlify's git-gateway:

1. Netlify dashboard → **Identity → Enable Identity**.
2. **Identity → Services → Git Gateway → Enable**.
3. **Identity → Registration**: set to *Invite only*, then invite yourself.
4. Accept the email invite, set a password, and log in at `https://<your-site>/admin`.

## Repo & access

This is Keepsite Media's own marketing site. The GitHub repo, the Netlify site, and the domain are Keepsite's.

**This repo is private, permanently.** That is a requirement, not an incidental fact. Netlify deploys from private GitHub repos without issue, and git-gateway and DecapCMS work identically. `docs/superpowers/` is a further reason: it holds internal planning material, and the specs and plans there quote Keepsite's own SOP figures. If the repo ever has to go public, audit the history first.

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

The office renders agreements from `src/data/office/agreements/*.json`, which `scripts/agreement-from-docx.py` generates from the docx files in `../legal/`:

```
python3 scripts/agreement-from-docx.py ../legal/presence-agreement.docx presence > src/data/office/agreements/presence.json
```

and the same for `growth`, `agile` and `range`. The docx are written by `../legal/tools/make-agreements.py` from the Search Plus docx in `../legal/`; edit that script, not the docx, then regenerate the docx. Separately, never edit the JSON by hand; change the docx and regenerate the JSON. It needs `python-docx`.

Client-facing add-on rates (for example `$150` for an additional standard page) are published on `/packages/` and are fine to have in the repo. The internal cost basis behind them is not.
