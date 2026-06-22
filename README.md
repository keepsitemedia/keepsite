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
3. Send to **snic9004@gmail.com**.

## Enabling the CMS (/admin)

DecapCMS uses Netlify's git-gateway:

1. Netlify dashboard → **Identity → Enable Identity**.
2. **Identity → Services → Git Gateway → Enable**.
3. **Identity → Registration**: set to *Invite only*, then invite yourself.
4. Accept the email invite, set a password, and log in at `https://<your-site>/admin`.

## Ownership

This site is built to be handed over. The GitHub repo and the Netlify account are the client's. There are no monthly fees and no ongoing costs.
