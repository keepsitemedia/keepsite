# Office: two brands, contacts and own tasks — design

The office at keepsitemedia.com/office becomes the one place both
businesses are run from: Keepsite Media and Lova Content Creation, the
owner's spouse's business. Lova gets full parity with Keepsite: its own
pipelines, tiers, agreements, Stripe account, email address and domain
for the pages its clients see. Two brand-free additions come with it: a
contacts list for partners, referral sources and vendors, and tasks that
belong to the business rather than to a client.

This supersedes the "Second deployment" section of
`2026-09-04-client-office-design.md`, which planned a second Netlify
site built from an overlay. That plan was never started. The rest of
that spec still stands and this one builds on its data model, routes
and conventions.

## Why one office

The spouse should open one URL and see everything. Both owners are
admins and can see both businesses, with a switcher to look at one at a
time. A second deployment gave separation the owners do not want, and
would have duplicated Identity, Blobs, environment and Resend setup for
a business whose whole client list fits on one screen.

The three reasons the old design separated the sites still hold, and
are met inside one office instead: Lova's payments go to Lova's Stripe
account through per-brand secrets; sealed agreements carry Lova's legal
name and signer because the template and the client carry the brand;
and Lova's clients sign, pay and answer on Lova's domain because links
are minted on the brand's hostname and her domain is an alias of this
site.

## Naming

Client documents already have a `business` field: the client's own
company name. The field that says which of the two businesses a record
belongs to is `brand`, with ids `keepsite` and `lova`. "Brand" is used
in that sense throughout this spec and the code.

## Brand registry

`src/data/office/brands.json` lists the brands. `brands.mjs` beside the
other office modules reads it and is the only module that knows the
shape.

Keepsite's entry is `{ "id": "keepsite", "env": "" }` plus nothing:
its name, legal name, email, phone and URL come from `site.json` and
its tiers from `packages.json`, so tier prices keep their one source.

Lova's entry carries everything inline:

```json
{
  "id": "lova",
  "env": "LOVA_",
  "name": "Lova Content Creation",
  "legalName": "Lova Content Creation",
  "email": "hello@example.com",
  "phone": "",
  "url": "https://lova.example.com",
  "signer": "Owner Name",
  "tiers": [{ "name": "Starter", "buildPrice": 500, "monthlyPrice": 100 }],
  "plan": "deposit-balance-monthly"
}
```

The seeded values are placeholders for her to edit in a commit; the
README's Lova section lists which ones. `brands.mjs` exports:

- `BRANDS`: the resolved list, Keepsite first, every entry with the
  same keys whatever its source.
- `brandOf(id)`: throws on an unknown id. Records missing `brand` read
  as `keepsite` through `brandOfRecord(doc)`.
- `tiersFor(id)`: tier names; `tierPrices(id, name)`: build and monthly
  prices in cents, replacing the unbranded version in `payments.mjs`.
- `urlFor(id)`: `process.env.URL` for Keepsite as today, the entry's
  `url` for Lova. `siteUrl()` in `context.mjs` becomes `urlFor(brand)`.
- `secret(id, name)`: `process.env[env + name]`, so `secret('lova',
  'STRIPE_SECRET_KEY')` reads `LOVA_STRIPE_SECRET_KEY` and Keepsite's
  reads the existing unprefixed names.

Brands are a data file, not a setting: changing one means a Stripe
account, a domain and a legal name, and belongs in a commit.

## Secrets

Keepsite keeps every existing variable name. Lova adds four:

| Variable | Purpose |
|---|---|
| `LOVA_STRIPE_SECRET_KEY` | Lova's Stripe account. |
| `LOVA_STRIPE_WEBHOOK_SECRET` | Signs the webhook Lova's account registers. |
| `LOVA_NOTIFY_FROM` | From address on every email to a Lova client. Must be on a domain verified in Resend. |
| `LOVA_NOTIFY_TO` | Lova's digest, meeting copies and agreement copies. |

`RESEND_API_KEY` stays shared; one Resend account verifies both
domains. `KEEPSITE_TOKEN_SECRET` and `KEEPSITE_SESSION_SECRET` stay
shared; they are not brand copy. A missing Lova secret fails closed
exactly as a missing Keepsite one does: Lova clients' payment buttons
show the banner and disable, and a send to a Lova client is refused
with the reason on screen.

## Records

- `clients/{slug}.json` gains `brand`, required on create and validated
  against the registry. The `tier` must be one of that brand's tiers.
  The `pipeline` must belong to the brand. `brand` is not editable
  after creation; a wrong brand is a new client.
- Slugs stay unique across both brands. No store key changes.
- Pipelines gain `brand`. `validatePipelines` requires it and refuses an
  unknown one. The seed gains a Lova pipeline, `lova-content`, with
  three placeholder stages (Inquiry, Agreement, Live) reusing the shared
  email templates, `questionnaires: []` and the deposit-balance-monthly
  plan. Stored pipelines without a brand are Keepsite's until re-saved.
- Agreement templates gain `brand` and `tier`. `validateAgreementTemplate`
  requires both and checks the tier exists for the brand. The client
  page's default template is the one matching the client's brand and
  tier, replacing the hard-coded tier map. A placeholder
  `lova-starter.json` ships with Lova's legal name and signer party.
  The office signer for an agreement comes from the brand's `signer`
  and `email` when the template names nobody.
- Payment documents gain `brand`, copied from the client at creation,
  so the webhook and the glance never look it up.
- Email templates stay shared. `buildContext` fills `site.*` from the
  client's brand instead of `site.json`, so `{{site.brand}}` and the
  sign, demo and questionnaire links are right for either business.
- The `/start/` inquiry handler creates Keepsite clients.
- Meeting invites use the brand's name in `PRODID` and its hostname in
  the `uid`.

## Stripe

Every Stripe request takes the brand's key: `stripeRequest` and
`stripeConfigured` gain a `brand` argument and the payment actions pass
the client's. Lova's Stripe account registers the same endpoint with
`?brand=lova`; the webhook function reads the query, verifies with that
brand's signing secret, and `applyEvent` resolves the slug as today.
An event whose resolved client is not of the query's brand is ignored
and logged. Checkout success and cancel URLs are built with
`urlFor(brand)`.

## Public pages

The rule is: a public page takes its brand from the record it shows,
never from the hostname. Links are minted on the brand's hostname, so
the hostname only has to serve the page.

- `/sign/` and its document route: brand from the agreement (its
  client's brand, stored on the agreement at creation). Legal name,
  signer and contact email come from the brand.
- `/pay/thanks/` and `/pay/cancelled/`: become server-rendered and read
  `?brand=`, appended to the URLs Checkout is given. An unknown or
  missing value renders Keepsite, as today.
- Keepsite's three questionnaire pages are untouched: static, on
  `BaseLayout`, with their existing ids, URLs and tokens.
- Lova's questionnaires come through one server-rendered route,
  `src/pages/questionnaire/[form].astro`, which looks up the client
  from `?c=`, takes the brand from it, and renders the form from that
  brand's registry. Astro prefers the static routes, so `intro`,
  `brand` and `build` never reach it. A registry module replaces the
  hard-coded `FORMS` list in `intake.mjs` with `formsFor(brand)`:
  Keepsite's forms are its three existing files at
  `src/data/questionnaires/*.json`, which do not move; every other
  brand's live under `src/data/questionnaires/{brandId}/`. Lova ships
  with none. The questionnaire
  function looks up the client to choose the brand's notify addresses
  and writes to the same blob store keyed by slug.
- Lova's sign, pay and questionnaire pages use the sign page's plain
  `.office`-scoped layout with the brand's name, never the Keepsite
  marketing layout.

## Lova's domain

Her domain is added to this Netlify site as a domain alias with its own
certificate. Rules in `netlify.toml` scoped to her hostname let
`/sign/*`, `/pay/*`, `/questionnaire/*`, `/api/*`, `/.netlify/*` and
the asset paths through and send every other path to
`https://www.keepsitemedia.com/` with a 302. The adapter writes its own
`_redirects` for rendered routes and those are processed before the
config file, so the exact ordering is confirmed on the first deploy by
requesting her root, a sign link and a pay page. The README records the
result. `/office/` on her hostname is not let through: the office lives
on keepsitemedia.com.

## Switcher

The header gains a segmented control: All, Keepsite, Lova. It posts to
`/office/api/brand`, which sets a `brand` cookie (`all`, or a brand id;
anything else reads as `all`) and redirects back. The middleware reads
the cookie into `locals.brand`. Today, Clients and Calendar filter
clients, tasks, meetings and payments to that brand; `brandOfRecord` on
a task or meeting means its client's brand. Own tasks and contacts
ignore the switcher. The chosen item is the one green thing in the
control. Under All, the clients table gains a Brand column and Today's
pipeline boards are grouped under a brand heading. The new-client form
asks for the brand first and shows only that brand's pipelines and
tiers; with one brand selected in the switcher it is preselected.

## Contacts

A brand-free list of people the businesses have relationships with who
are not clients: partners, referral sources, vendors.

`contacts/{id}.json`:

| Field | Meaning |
|---|---|
| `id` | Store id, sortable by creation time. |
| `business`, `owner` | Company and the person. `business` required. |
| `email`, `phone`, `website` | Optional; email validated when present. |
| `type` | One of `partner`, `referral`, `vendor`, `other`. |
| `notes` | List of `{ at, text }`, newest first. |
| `clientSlug` | Set when a client was started from this contact; null otherwise. |
| `createdAt`, `updatedAt` | ISO. |

Routes: `/office/contacts/` (list), `/office/contacts/new/`,
`/office/contacts/{id}/`. The list shows business, owner, type and the
date of the last note, sorted by that date oldest-first so neglected
relationships surface, with a type filter. The contact page shows the
details, an edit fold, the note log with an add box at the top, and a
"Start a client" button that opens `/office/clients/new/` with the
fields prefilled by query string and a hidden `contact` id; the create
action then writes `clientSlug` on the contact, and the contact page
links to the client. One action, `/office/api/contact`, with ops
`create`, `edit`, `note`, `delete`. Nothing about contacts touches
email, tasks or the calendar. The store gains a `contacts` type with
`get`, `put`, `remove`, `list`, `count`, and the export gains a
`contacts.csv`.

## Own tasks

Tasks that belong to the business, not to a client. They live under
the reserved slug `office` in the existing `tasks/` type, so the
store, the calendar, the digest, the dashboard split and the export
work without change. `slugify` and `uniqueSlug` never produce
`office`, `validateClient` refuses it, and the client action refuses
it before the slug check.

Task documents gain three fields, null on client tasks:

- `project`: free text, grouping label, for example "Referral program".
- `repeat`: `weekly`, `monthly` or null.
- `nextId`: the id of the successor a finished repeating task created,
  so a task creates at most one successor in its lifetime; reopening
  keeps it.

Marking a repeating task done creates the next one with the same
title, project, time, notes and repeat, due seven days later or the
same day next month clamped to that month's last day, using the month
shift the calendar already has. The next task is created in the same
action before the redirect. A replayed Done, or a reopen followed by
Done, creates nothing more because the finished task already carries
`nextId`.

Routes: `/office/tasks/`, a page listing open own tasks grouped by
project with an add form at the top (title, due, time, project,
repeat, notes) and a fold of the last twenty done. Today's "On you"
and the Calendar include own tasks; `TaskRow` shows the project label
in the client column when `slug` is `office`, and the Move sheet gains
the repeat select. The task action learns the reserved slug (no client
lookup for it) and the two fields on `add` and `reschedule`.

## Digest and reminders

The morning digest runs once per brand: that brand's clients' tasks,
meetings and payments plus the own tasks, sent to the brand's notify-to
address from the brand's from address. Two brands with the same address
get two emails. Meeting reminders send from the meeting's client's
brand address and copy that brand's notify-to.

## Migration

No data rewrite. Missing `brand` reads as Keepsite on clients, tasks
through their client, payments and agreements. Stored pipelines get a
brand on the next save under Settings; the seed already has one.
Missing `project` and `repeat` on tasks read as null.

## Testing

Beside each module, `node --test` as today:

- `brands.test.mjs`: Keepsite resolves from site and packages; Lova
  from the entry; unknown id throws; missing record brand reads
  Keepsite; `secret` maps prefixed and unprefixed names; `urlFor`.
- `clients.test.mjs`: brand required and validated, tier checked
  against the brand, pipeline must match brand, `office` refused and
  never generated.
- `pipeline.test.mjs`, `agreement-templates.test.mjs`: brand rules.
- `payments.test.mjs`, `stripe-webhook.test.mjs`: brand key selection,
  `?brand=` verification, cross-brand event ignored, URLs per brand.
- `context.test.mjs`: `site.*` from the client's brand; links on the
  brand's hostname.
- `guard.test.mjs` and the brand action: cookie parsing and fallback.
- `contacts.test.mjs`: validation, note prepend, convert linkage.
- `task.test.mjs`: reserved slug, fields, weekly and monthly next-due
  including the month-end clamp, no double creation on replay, one
  successor across reopen and re-done.
- `digest.test.mjs`: one digest per brand with own tasks in each.
- `check-office.mjs` gains: every pipeline names a known brand; every
  agreement template names a brand and one of its tiers; no seed or
  fixture uses `office` as a client slug; every questionnaire file
  under a brand directory is a form its pipelines may reference.

The gate stays `npm run gate`.

## Phases

Each usable when it ships, in this order:

1. **Own tasks.** Reserved slug, two fields, recurrence, the Tasks
   page, row changes.
2. **Contacts.** Store type, three pages, action, export.
3. **Brands in the office.** Registry, `brand` on clients, pipelines,
   templates, payments and agreements, the switcher, Lova's placeholder
   pipeline, tier and agreement. Still on Keepsite's secrets and
   hostname; Lova clients can be tracked end to end but every link
   points at keepsitemedia.com.
4. **Lova money, mail and domain.** Per-brand Stripe and Resend, the
   webhook query, brand hostnames in links, server-rendered pay pages,
   per-brand digest, the domain alias and its rules, the README section.
5. **Lova questionnaires.** Form registry per brand, the rendered
   route, the function's brand lookup. Ships with no Lova forms.

## Out of scope

A Lova marketing site. Per-user permissions between the two owners.
Editing brands under Settings. Recurrence on client tasks. Contacts
per brand. Importing contacts from anywhere.
