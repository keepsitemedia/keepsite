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

The site is configured for `https://keepsitemedia.com` (`site` in `astro.config.mjs`). After the first Netlify deploy, point the Namecheap domain at Netlify:

1. **Add the domain in Netlify:** Site → **Domain management → Add a domain** → enter `keepsitemedia.com`. Netlify will list it with both the apex (`keepsitemedia.com`) and the `www` subdomain, and show the DNS values it wants.

2. **Decide who runs DNS.** Two options — pick one:

   **Option A — Keep DNS at Namecheap (simplest, recommended).** Leave the nameservers alone and just add records.
   - In Namecheap: **Domain List → Manage → Advanced DNS**.
   - Remove the default Namecheap "parking" records (the CNAME on `@`/`www` and any URL-redirect record), then add:
     - **A record** — Host `@`, Value `75.2.60.5` (Netlify's load balancer IP — confirm the exact IP Netlify shows you under *Domain management*, as it can change).
     - **CNAME record** — Host `www`, Value `<your-site-name>.netlify.app` (your Netlify subdomain, shown in the dashboard).
   - Set TTL to **Automatic**.

   **Option B — Let Netlify run DNS (Netlify DNS).** More features (automatic apex handling), but you hand Netlify control of the zone.
   - In Netlify, choose **Set up Netlify DNS** for the domain and copy the 4 nameservers it gives you (e.g. `dns1.p0X.nsone.net`).
   - In Namecheap: **Domain List → Manage → Nameservers → Custom DNS**, paste those 4, save.

3. **Wait for DNS to propagate** (usually minutes, up to ~24h). Namecheap changes can take a little while to show up.

4. **Enable HTTPS:** in Netlify → **Domain management → HTTPS**, click **Verify DNS configuration**, then **Provision certificate** (free Let's Encrypt). Once issued, turn on **Force HTTPS**.

5. **Set the primary domain:** in Netlify, set `keepsitemedia.com` (or `www`, your choice) as the **Primary domain** so the other redirects to it.

> Tip: the apex/`www` choice is cosmetic — Netlify redirects one to the other either way. If you ever change the canonical URL, update `site` in `astro.config.mjs` to match.

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
