# Keepsite Media

Marketing and portfolio site for Keepsite Media. Astro static site, deployed to Netlify, content editable via DecapCMS.

## Local development

```bash
npm install
npm run dev      # http://localhost:4321
npm run build    # outputs to dist/
npm run preview  # serve the production build
```

## Editing content

Page copy and settings live in `src/data/*.json`. Portfolio entries are markdown files in `src/content/portfolio/`. All of these are editable in the browser at `/admin` (DecapCMS) once the CMS is enabled (below).

## Turning on the Work page

`/work/`, its nav item, the homepage strip, and the sitemap entry are all generated from the `work` content collection, which is empty at launch. They appear on the next deploy after the first entry exists. Nothing needs a code change.

Adding the first real project:

1. In `/admin` → **Work** → **New Work**, fill in every field. `Screenshot` wants a 1200×750 image; anything else is cropped to that ratio.
2. Set **Featured** on the first two or three, so the homepage strip has enough cards to look deliberate. The strip renders only at two or more.
3. In `netlify.toml`, change the `/portfolio` redirect target from `to = "/"` to `to = "/work/"` in the same commit. Until `/work/` exists, that redirect has to point at the homepage.
4. Deploy, then confirm `/work/` resolves, the nav shows **Work** second, and `/portfolio` lands on `/work/`.
5. Removing the **last** project needs a clean rebuild, because Astro's glob loader skips its delete sweep when a collection drops to zero files and leaves the stale page behind. The Netlify build command already clears the store on every build, so a deploy is enough; a local `npm run build` after deleting the last entry may need `rm -rf node_modules/.astro` first.

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

Netlify Forms is automatic — Netlify detects the `inquiry` form on the contact page at deploy time. To get emailed on each submission:

1. After the first deploy, confirm the `inquiry` form appears under **Netlify → Forms** (Netlify detects it automatically from the deployed static HTML).
2. Then set up the notification: **Forms → Form notifications → Add notification → Email notification**.
3. Send to **keepsitemedia@gmail.com**.

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
