# Client office — design

A private back office on keepsitemedia.com for running clients: a
pipeline per product, tasks and a calendar, automated client email,
meeting reminders, Stripe deposits, balances and monthly subscriptions,
e-signed agreements, and one place where a client's documents and
questionnaire answers live. It replaces HoneyBook for Keepsite's own
use.

Admins are the only users. Clients never log in; they keep receiving
signed links by email, the way the questionnaires already work. The
tool lives in this repo, deploys with the site, and is invisible to
anyone without an admin account.

## Why

HoneyBook's Essentials plan, the cheapest tier with automations, is $59
a month. Its processing fees are higher than Stripe's. And it knows
nothing about the questionnaires, the demo, or the three-stage process
the site describes, so every link and status would be typed in by hand.

The pieces this needs already exist on the site in some form. The
questionnaire function writes each client's answers to Netlify Blobs
under their slug. Client links are derived from an HMAC secret rather
than registered. Resend sends notifications. Netlify Identity is
enabled for the CMS. Netlify has scheduled functions. The office is
mostly a matter of putting a login and a data model in front of what is
there.

Netlify Identity is a sound choice: Netlify reversed its deprecation in
February 2026. Git Gateway, which the Decap `/admin` login depends on,
is what was deprecated. That is a separate problem and out of scope
here.

## Scale

Designed for one or two admins and up to fifty clients. Every listing
in the tool reads at most a few hundred small JSON documents. Steady
state cost on Netlify is on the order of ten to fifteen credits a
month, or about ten cents. Production deploys, at fifteen credits each,
are the only line that moves the bill, and that is true with or without
the office. Past a few hundred clients, a second concurrent admin, or
cross-client reporting, the store moves to Netlify DB; the storage
module in **Data model** is the one place that touches.

## Routes and rendering

The site gains the `@astrojs/netlify` adapter. `output` stays
`static`, and only pages that export `prerender = false` render per
request. Every page under `src/pages/office/` and the `/sign/` page do.
The marketing pages keep building static, the sitemap filter excludes
`/office/`, and the Lighthouse gate is untouched.

| Route | Auth | Purpose |
|---|---|---|
| `/office/login/` | none | Email and password form. |
| `/office/` | admin | Dashboard: clients by stage, tasks due this week, meetings, overdue and failed payments. |
| `/office/clients/` | admin | Client list with stage, tier, pipeline, next due task. |
| `/office/clients/{slug}/` | admin | Client page with tabs: Overview, Tasks, Questionnaires, Documents, Payments, Meetings, Agreements, Emails. |
| `/office/calendar/` | admin | Day view of tasks and meetings. See **Calendar**. |
| `/office/send/{slug}/{emailId}/` | admin | Email send screen: prompted fields, preview, send. |
| `/office/settings/` | admin | Pipelines and email templates. |
| `/office/data/` | admin | Every document type with counts; download any type as JSON or CSV. |
| `/sign/?t=…` | signer token | Client signing page. |
| `/questionnaire/*` | questionnaire token | Unchanged. |

Mutations are native form posts to functions under
`netlify/functions/office-*.mjs`, which validate, write, and redirect
back, matching the questionnaire pattern. Client-side JavaScript is for
conveniences (the signature canvas, the calendar date picker, live
email preview), never the only path.

Hidden from non-admins in three layers: `/office/*` carries
`X-Robots-Tag: noindex, nofollow` and a `Disallow: /office/` line in
`public/robots.txt`; the sitemap filter excludes it; and an
unauthenticated request gets a 302 to the login page, never office
HTML.

No third-party script is added anywhere. Login talks to Identity's
same-origin endpoints, Stripe pages are Stripe-hosted redirects, and
the signature pad is a small canvas script in `src/scripts/`. The
strict `/*` Content-Security-Policy in `netlify.toml` stays as it is
for every route but one. The signing page shows the filled PDF in a
same-origin iframe served by `office-sign-document.mjs`, and `/*` sets
`frame-ancestors 'none'` and `X-Frame-Options: DENY`, which forbid
exactly that. A `/sign/*` header block relaxes both to same-origin;
the widening is scoped to `/sign/*` and nothing else changes.

## Auth

Netlify Identity, invite only. An admin is a user whose
`app_metadata.roles` includes `admin`, set in the Netlify dashboard.

`netlify/functions/lib/session.mjs` owns the session:

- **Login.** `office-login.mjs` posts email and password to
  `/.netlify/identity/token` with `grant_type=password`. On success it
  sets two cookies, `ks_access` (the access token, one hour) and
  `ks_refresh` (the refresh token), both `HttpOnly`, `Secure`,
  `SameSite=Strict`, `Path=/`. On failure it redirects back to the login
  page with a generic error; it never says which of email or password
  was wrong.
- **Guard.** Every office page and office function calls
  `requireAdmin(request)`. It sends `ks_access` to
  `/.netlify/identity/user`. If that returns a user with the `admin`
  role, the request proceeds. If the token is expired, it exchanges
  `ks_refresh` for a new access token and sets the cookie on the
  response. Any other outcome is a 302 to `/office/login/` for pages and
  a 401 for functions.
- **Logout.** `office-logout.mjs` calls Identity's logout endpoint and
  clears both cookies.

Password reset uses Netlify's own recovery email. Magic-link login is
out of scope; passwords are enough for one or two admins.

Form posts to office functions carry a CSRF token: a random value set
in a `ks_csrf` cookie at login and echoed in a hidden field. The
function compares them in constant time. `SameSite=Strict` already
blocks cross-site posts in every current browser; the token is the
belt to that suspender.

## Data model

One Blobs store, `office`, holding JSON documents keyed by type and
client slug. The slug is the questionnaire slug, validated against the
same regex `questionnaire.mjs` uses. A client's questionnaire answers
are read from the existing `questionnaires` store under that slug;
nothing is copied.

| Key | Content | Writer |
|---|---|---|
| `clients/{slug}.json` | name, business, email, phone, address, tier, `pipeline`, `stage`, stage history, `stripeCustomerId`, dates (inquiry, signed, launched), notes | admin |
| `tasks/{slug}/{id}.json` | title, due date, optional time, done, `source` (`pipeline` or `manual`), stage that created it, notes | admin; the questionnaire function and the Stripe webhook may set `done` on the tasks they own |
| `meetings/{slug}/{id}.json` | start, duration, video link, notes, `remindersSent` | admin creates; the hourly job writes `remindersSent` |
| `payments/{slug}/{id}.json` | kind (`deposit`, `balance`, `monthly`), amount, currency, Stripe IDs, status, paid date, failure reason | Stripe webhook |
| `agreements/{slug}/{id}.json` | template, filled fields, status, signers, hash, audit trail | signing route and the admin send action, only through `agreement-state.mjs` |
| `documents/{slug}/{name}` | raw bytes | admin upload, sealing |
| `documents/{slug}/{name}.meta.json` | original name, size, type, source, uploaded at | same as its file |
| `emails/{slug}/{id}.json` | template, subject, rendered body, to, sent at, Resend ID | the send function |
| `settings/pipelines.json` | list of pipelines | admin |
| `settings/templates.json` | list of email templates | admin |

IDs are the creation time in `YYYYMMDDTHHMMSS` form followed by six
random base32 characters, so prefix listing returns documents in
creation order and two writes in the same second cannot collide.

**One writer per key.** Blobs has no transactions. The table above
assigns each key exactly one kind of writer, so the admin editing a
client while a webhook lands never races. The two exceptions, `done`
on a task and `remindersSent` on a meeting, are single-field flips
where the last write is always the right one.

`netlify/functions/lib/store.mjs` is the only module that imports
`@netlify/blobs`. It exposes `getClient`, `putClient`, `listClients`,
and the equivalent for every type, plus `listByPrefix`. Pages and
functions call these and nothing lower. Moving to Netlify DB later
means rewriting this file and no other.

Settings documents are seeded from `src/data/office/pipelines.json`
and `src/data/office/templates.json` when the store has none, so the
defaults are versioned in git and edits in the office survive deploys.

## Pipelines and tasks

A pipeline is a named workflow for one product. The client record
stores `pipeline` and `stage`. The first pipeline, `website`, matches
the process the site describes:

| Stage | Tasks created (default offset from stage start) | Client email on entry |
|---|---|---|
| Inquiry | Reply with recommendation (1d) | none |
| Agreement | Send agreement (0d), Deposit received (7d) | Agreement |
| Intro questionnaire | Intro questionnaire back (5d) | Intro questionnaire links |
| Demo | Build demo (5d), Send demo (5d) | none until sent by hand |
| Post-demo questionnaires | Brand questionnaire back (7d), Build questionnaire back (7d) | Demo and questionnaire links |
| Layouts | Layouts to client (10d), Layout changes back (5d) | Layouts ready |
| Copy and photos | Copy in place (10d), Client review back (5d) | Copy ready |
| Launch | Balance received (0d), Launch (3d), Start monthly (3d) | Balance link and launch |
| Live | none | none |

Each pipeline also declares which questionnaire forms belong to it and
its payment plan (see **Payments**). A pipeline with no questionnaires
shows no Questionnaires tab.

Advancing a client to a stage is one button on the client page. It
records the stage and date in the client's stage history, creates that
stage's tasks with due dates from the offsets, and opens the entry
email's send screen if the stage has one. Moving a client back changes
the stage and nothing else; tasks are never deleted by a stage change.

Two advances happen without a click: a questionnaire submission marks
that form's task done (the questionnaire function gains a call into
the store, guarded so a client with no office record is a no-op), and a
paid balance marks the Launch stage's balance task done. Nothing else
is automatic. In particular a paid deposit does not advance the stage;
ACH can take days to settle and the decision stays human.

Manual tasks can be added to any client at any time with a title, due
date, optional time and notes.

The `/start/` inquiry form gains a function target,
`office-inquiry.mjs`, that creates a client record at the Inquiry stage
from the fields the form already has, then re-posts the same body to
Netlify Forms so the existing email notification keeps working. The
slug is derived from the business name and made unique. A duplicate
email address attaches the inquiry to the existing client as a note
rather than creating a second record.

## Calendar

`/office/calendar/?d=YYYY-MM-DD`, default today, in Mountain time.
The day view lists that day's tasks and meetings in time order, with
untimed tasks first. Previous and next arrows, a native date input, and
a month grid with a dot on any day that has an item. Each entry links
to its client and can be marked done or rescheduled from the same page.

## Email

All email goes through Resend from `KEEPSITE_NOTIFY_FROM`, the address
the questionnaire function already uses. `netlify/functions/lib/mail.mjs`
wraps the send, logs every message to `emails/{slug}/`, and is the
only module that calls Resend.

Templates live in `settings/templates.json`. A template has an ID, a
subject, a body in Markdown, and two kinds of placeholders:

- **Auto-filled**, resolved from the client and the triggering event:
  `{{client.name}}`, `{{client.business}}`, `{{links.sign}}`,
  `{{links.intro}}`, `{{links.brand}}`, `{{links.build}}`,
  `{{links.demo}}`, `{{links.pay}}`, `{{meeting.start}}`,
  `{{meeting.link}}`, `{{payment.amount}}`, `{{agreement.deposit}}`.
- **Prompted**, declared on the template as `fields: [{key, label,
  default, required}]`. The send screen shows one input per prompted
  field above the preview.

The send screen renders the template with both kinds filled, lets the
admin edit the result freehand, and sends on confirmation. Missing
required prompted fields block the send. Stage-entry emails open this
screen rather than sending silently, so wording can be adjusted for the
person in front of you.

Questionnaire nudges: when a questionnaire task is three days past due
and no submission exists, the digest lists it and links to the send
screen with a reminder template prefilled. Not automatic.

Unsubscribe is not offered. Every message is transactional, sent to a
client under contract about their own project.

## Meetings and client reminders

A meeting is booked on the client page with date, time, duration,
video link and notes. Booking sends the client a confirmation with an
attached `.ics` file and the same to the admin.

`office-meetings-cron.mjs` runs hourly. For every meeting starting in
the next 25 hours it sends the 24-hour reminder if
`remindersSent.day` is unset, and for every meeting starting in the
next 2 hours it sends the 1-hour reminder if `remindersSent.hour` is
unset, then records the flag. Hourly granularity means the one-hour
reminder lands between 60 and 120 minutes before, which is the trade
for not running a queue. A retry cannot double-send because the flag
is written before the next run.

## Internal digest

`office-digest-cron.mjs` runs daily at 7 a.m. Mountain time (13:00
UTC; the cron expression is adjusted twice a year by hand, and the
digest notes the local time it was generated so drift is visible). It
sends one email to `KEEPSITE_NOTIFY_TO` with: overdue tasks, tasks due
today and in the next three days, meetings today and tomorrow,
questionnaires past due with no submission, failed monthlies, and
agreements sent but unsigned for more than five days. If every section
is empty, nothing is sent.

## Payments

Stripe is the system of record for money. The tool stores the IDs and
the outcome of each event and links to Stripe for everything else:
fees, payouts, refunds, disputes and tax forms. A bookkeeper gets a
read-only Stripe role, not an office login.

A Stripe Customer is created when a client enters the Agreement stage,
with `metadata.slug` set so every webhook can find its client.

Each pipeline declares a payment plan. The `website` plan is deposit
and balance, then monthly, matching the agreements:

- **Deposit** and **balance** are Checkout sessions in `payment` mode
  with `us_bank_account` and `card` as payment method types,
  `setup_future_usage: off_session` so the method is saved, and
  `metadata` carrying slug and kind. The amounts come from the
  agreement's filled fields. The session URL is `{{links.pay}}` in the
  stage email or copied from the Payments tab. Stripe hosts the page,
  the receipt, and the ACH mandate text.
- **Monthly** is a Subscription on the saved default payment method,
  started by a button on the client page after launch, with the tier's
  price from `src/data/packages.json` (looked up by tier, so prices
  still live in one place) and any discount from the agreement as a
  coupon, with `billing_cycle_anchor` on the launch date.

`office-stripe-webhook.mjs` verifies the signature with
`STRIPE_WEBHOOK_SECRET` and writes a payment document on
`checkout.session.completed`, `checkout.session.async_payment_succeeded`,
`checkout.session.async_payment_failed`, `invoice.paid`,
`invoice.payment_failed`, and `customer.subscription.deleted`. An ACH
deposit shows as pending from the completed session until the
succeeded event arrives. Events are idempotent on the Stripe event ID,
stored in the payment document, so a redelivered event changes
nothing.

The Payments tab lists payment documents newest first, each linked to
the Stripe dashboard, with a running total and the subscription state.
`/office/data/` exports payments as CSV: slug, business, tier, kind,
amount, status, paid date, Stripe IDs.

Not tracked here, by design: sales tax, which the agreements make the
client's responsibility, and pass-through expenses under section 2.7 of
the agreements, which live in bank statements. Neither is needed to
launch; an expense record per client is a small later addition if
pass-throughs become common.

## Agreements and e-sign

The three agreements (`presence`, `search`, `search-plus`) become PDF
templates with named form fields, converted once from the docx files
and kept in `src/data/office/agreements/{tier}.pdf`. The fields are the
Schedule 1 blanks: client name, business, address, email, phone, build
fee, monthly fee, deposit amount and percent, balance amount and
percent, pages included, discount, effective date, and two signature
blocks each with name, date and signature image. Each template file
carries a version in its filename; an agreement records which version
it was made from.

An agreement is created from the client page by picking a template and
confirming the prefilled fields, which come from the tier prices and
the client record. The admin can edit any field before sending.

`netlify/functions/lib/agreement-state.mjs` is the only code that
changes an agreement's status, and it appends an audit entry for every
change. States: `draft`, `sent`, `partiallySigned`, `completed`,
`declined`, `expired`, `voided`. Two signers, `keepsite` and `client`,
each with a 32-byte random token, a 14-day expiry, and a status of
`pending`, `viewed`, `signed`, `declined` or `expired`.

Sending: the admin signs first, in the office, on the same signature
canvas the client will use, and the send action records that
signature, moves the agreement to `sent`, and opens the Agreement email
send screen with `{{links.sign}}` filled.

Signing: `/sign/?t=…` is server-rendered. It looks up the signer by
token, records `viewed` on first open, and renders the filled PDF
inline (drawn from the template with the agreement's fields, by
`pdf-lib`, not stored until sealing). The page requires scrolling the
document to the end, two checkboxes (I have read and agree to these
terms; I agree to sign this agreement electronically), and a drawn
signature. `office-sign.mjs` validates the token again, refuses a
signer that is not `pending` or `viewed`, and records consent time,
IP, user agent, and the signature PNG in `documents/{slug}/`. The
state module then moves the signer to `signed` and the agreement to
`partiallySigned` or `completed`.

Declining records a reason, moves the agreement to `declined`, and
emails the admin. Expiry is checked on open and by the daily digest
job. Voiding is an admin action on any agreement not yet completed.

Sealing, on `completed`: `pdf-lib` fills the fields, flattens them,
stamps both signature images in their blocks, appends a certificate of
completion page listing every audit entry (event, who, when, IP), and
writes the result to `documents/{slug}/agreement-{id}.pdf`. The
SHA-256 of the final bytes is stored on the agreement and printed on
the certificate as the hash of the document before the certificate was
appended, so the certificate can describe the document without
describing itself. Both parties get the sealed PDF by email. The client
moves to the Intro questionnaire stage only when the admin clicks
advance.

Legal footing: ESIGN and UETA require intent to sign, consent to do
business electronically, attribution, and a record both parties can
keep. The drawn signature and the first checkbox are intent, the
second checkbox is consent, the token plus IP plus user agent plus
timestamp is attribution, and the sealed PDF with its hash is the
record. This is the same footing Knotsign was built on and is not
legal advice.

## Documents

The Documents tab lists everything under `documents/{slug}/` and the
files in the `questionnaires` store under the same slug: sealed
agreements, signature images, uploads, logos and brand guides. Each is
served by `office-document.mjs`, which requires an admin and streams
the bytes; Blobs is never exposed as a public URL. Uploads take one
file at a time, up to 6 MB, the Netlify function body limit, and are
stored under their sanitised name using the existing `safeName`.

The Questionnaires tab shows each form for the client's pipeline as
not sent, sent, or submitted with the date, and renders the answers
inline.

`scripts/pull-intake.mjs {slug}` fetches `intro.json`, `brand.json`
and `build.json` from the `questionnaires` store into
`{slug}/intake/`, using `NETLIFY_SITE_ID` and `NETLIFY_AUTH_TOKEN`. It
retires the save-the-attachment step in the README. The email
attachment keeps going out as a backup.

## Secrets

All in Netlify environment variables. New:

| Variable | Purpose |
|---|---|
| `STRIPE_SECRET_KEY` | Create customers, sessions, subscriptions. |
| `STRIPE_WEBHOOK_SECRET` | Verify webhook signatures. |
| `KEEPSITE_SESSION_SECRET` | Signs the CSRF cookie. |

Existing and reused: `KEEPSITE_TOKEN_SECRET`, `RESEND_API_KEY`,
`KEEPSITE_NOTIFY_FROM`, `KEEPSITE_NOTIFY_TO`. Local only:
`NETLIFY_SITE_ID`, `NETLIFY_AUTH_TOKEN` for the pull script. As with
the questionnaire secrets, a missing Stripe or session secret fails
closed: the function returns an error rather than proceeding.

## Phases

One spec, five sub-projects, each usable when it ships:

1. **Foundation.** Adapter, session module, login, guard, store
   module, client records, pipelines and tasks, calendar, dashboard,
   Questionnaires tab, inquiry function, data export page.
2. **Email and meetings.** Mail module, templates, send screen,
   stage-entry emails, meetings, both cron jobs, digest.
3. **Payments.** Stripe customer, Checkout sessions, subscription,
   webhook, Payments tab, CSV export.
4. **Agreements.** PDF templates, state module, signing page, sealing,
   certificate.
5. **Documents.** Uploads, document streaming, pull-intake script,
   README updates.

## Testing

Unit tests run under `node --test` beside the existing ones in
`netlify/functions/lib/`.

- **Session:** valid access token with `admin` role passes; valid
  token without the role is refused; expired token with a good refresh
  token passes and sets a new cookie; missing cookies redirect;
  functions get 401 not 302.
- **Store:** every accessor round-trips; `listByPrefix` returns
  creation order; slugs outside the regex are rejected before any
  Blobs call. Tests use an in-memory fake behind the same interface.
- **Pipeline:** advancing creates the declared tasks with the right
  due dates; advancing twice does not duplicate; moving back leaves
  tasks; a questionnaire submission marks the right task and no other.
- **Templates:** auto placeholders resolve; a missing required
  prompted field blocks; an unknown placeholder renders as its name in
  braces rather than blank, so it is seen.
- **Cron:** meeting reminders send once per window and never twice;
  the digest is empty when nothing is due and includes every section
  when something is.
- **Stripe:** webhook rejects a bad signature; each handled event
  writes the expected payment document; a redelivered event is a
  no-op.
- **Agreements:** every legal transition is allowed and every illegal
  one throws; a signer past expiry cannot sign; sealing produces a
  PDF whose stored hash matches its bytes; the certificate lists every
  audit entry.
- **Accessibility:** `/office/login/` and `/sign/` join the Lighthouse
  audit list at the existing thresholds. Authenticated office pages
  cannot be audited by the plugin and are checked by hand.

## Out of scope

- A client portal. Clients get links, not logins.
- Magic-link or social login for admins.
- Google Calendar sync and client self-booking.
- Stripe Invoicing, sales tax, and expense tracking.
- Generating the agreements' body text from the tool; the docx files
  remain the source and the PDF templates are converted from them by
  hand when the text changes.
- Replacing the Decap `/admin` login, which depends on the deprecated
  Git Gateway. Separate problem.
- Any change to `/questionnaire/*` beyond the task-done call.
