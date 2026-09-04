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

Page copy lives in `src/data/*.json`, one file per page: `site.json`, `home.json`, `packages.json`, `process.json`, `faq.json`. Work entries are markdown files in `src/content/work/`. All of it is editable in the browser at `/admin` (DecapCMS) once Identity and Git Gateway are enabled.

The `/admin` sidebar has two collections. **Site Settings** holds the five page files (Site & Navigation, Home Page, Packages Page, How It Works, FAQ). **Work** is the folder collection you add projects to.

**Testing CMS changes locally**, without committing to `main`. Both commands run from the repo root:

```bash
npm run cms    # terminal 1: starts decap-server on :8081
npm run dev    # terminal 2: starts Astro on :4321
```

Then open `http://localhost:4321/admin/`. `local_backend: true` in `public/admin/config.yml` makes the CMS read and write your working tree instead of the repo, so you can try an edit, see it in `npm run dev`, and throw it away with `git checkout src/`.

**Tier prices live in one place.** `src/data/packages.json` is the only source for the three tier prices. Editing one there updates the package cards, the homepage tier strip, the monthly section (for monthly prices), and the JSON-LD `Offer` search engines read, all together.

Two other files quote prices as plain copy, and neither updates on its own:

- `src/data/home.json` — the meta description mentions the starting price ("Packages from $1,100"), which renders into the homepage `<meta name="description">` and `og:description`.
- `src/data/faq.json` — two answers quote the add-on prices ($90, $180, $270).

Add-on prices in `packages.json` are display-only copy: editing one changes the add-ons list and nothing else. So when any price changes, check those two files too.

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

### Saving a submission for the build skills

**This step is manual and nothing does it for you.** The email arrives with a
`{form}.json` attachment. Save it into the client's workspace as:

```
{slug}/intake/intro.json
{slug}/intake/brand.json
{slug}/intake/build.json
```

`keepsite-sitemap` reads `brand.json` and `build.json` from that directory and
refuses to run without them; `intro.json` feeds `client-design-proposals` at
stage one. The filename matters — the skill looks for exactly those names.
Netlify Blobs holds the durable copy under the same slug if an email is ever
lost: **Netlify → Blobs → `questionnaires` → `{slug}/{form}.json`**, with any
uploaded logo or brand guide beside it.

## The office (/office)

A private back office for running clients: pipeline stages, tasks, a
calendar, each client's questionnaire answers, and data export. Design:
`docs/superpowers/specs/2026-09-04-client-office-design.md`. Later phases
add email, meetings, payments and e-signed agreements.

### Who can log in

Netlify Identity users with the `admin` role. Netlify → Identity → invite
the address, then open the user and add `admin` under Roles. Nothing else
grants access; a logged-in Identity user without the role is refused.

### Environment variables

| Variable | What it does |
|---|---|
| `KEEPSITE_SESSION_SECRET` | Signs the CSRF cookie. Any long random string. Without it every office form post is refused. |
| `KEEPSITE_TOKEN_SECRET` | Already set for the questionnaires; the office uses it to show each client's questionnaire links. |

### Local development

The office renders on the server, and its store and login are Netlify
services. Two environment variables stand in for them locally:

```bash
KEEPSITE_SESSION_SECRET=dev KEEPSITE_TOKEN_SECRET=... npm run dev:office
```

`dev:office` sets `OFFICE_STORE_DIR=.office-data` (a gitignored directory
of JSON files in place of Netlify Blobs) and `IDENTITY_URL` pointing at the
production Identity service, so you log in with your real account. Delete
`.office-data/` to start over.

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

Client-facing add-on rates (for example `$180` for an additional standard page) are published on `/packages/` and are fine to have in the repo. The internal cost basis behind them is not.
