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

## Enabling the inquiry form

Netlify Forms is automatic — Netlify detects the `inquiry` form on the contact page at deploy time. To get emailed on each submission:

- Netlify dashboard → **Forms → Form notifications → Add notification → Email notification**.
- Send to **snic9004@gmail.com**.

## Enabling the CMS (/admin)

DecapCMS uses Netlify's git-gateway:

1. Netlify dashboard → **Identity → Enable Identity**.
2. **Identity → Services → Git Gateway → Enable**.
3. **Identity → Registration**: set to *Invite only*, then invite yourself.
4. Accept the email invite, set a password, and log in at `https://<your-site>/admin`.

## Ownership

This site is built to be handed over. The GitHub repo and the Netlify account are the client's. There are no monthly fees and no ongoing costs.
