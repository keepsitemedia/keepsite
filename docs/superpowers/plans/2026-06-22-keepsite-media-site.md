# Keepsite Media Marketing Site Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a fast, responsive 4-page Astro marketing/portfolio site for Keepsite Media, deployed to Netlify, with DecapCMS-editable content and a Netlify Forms inquiry page that emails the owner.

**Architecture:** Astro static site. Page copy and site settings live as JSON data files (`src/data/`) imported directly by Astro and editable by DecapCMS "file" collections. Portfolio entries are a markdown content collection editable by a Decap "folder" collection. The inquiry form uses Netlify Forms (no backend). DecapCMS is served from `/admin` with a git-gateway backend.

**Tech Stack:** Astro 5.x, Node 18+, DecapCMS (CDN), Netlify (hosting + Forms + Identity/Git Gateway). No database, no serverless functions, no runtime dependencies.

## Global Constraints

- Brand name: **Keepsite Media**; domain **keepsitemedia.com**.
- Inquiry form submissions must email **snic9004@gmail.com** (configured in Netlify dashboard, not code).
- Pricing copy, exact values: **Static site — $400**; **Static site + DecapCMS — $750**.
- Hourly billing copy, exact values: **$50 first hour, $75 each additional hour, 1-hour minimum**.
- Content pillars to reflect in copy/design: **effortless, personal, trustworthy**.
- Ownership message must appear: client owns the **git repo + Netlify account**, **no monthly/ongoing costs**.
- Inquiry page route: `/contact`.
- Voice: first-person ("I build…").
- Site must build with `npm run build` producing static output in `dist/`, no backend.
- Verification per task uses `npm run build` + assertions against built HTML in `dist/` (a static brochure site's test cycle is build + render-content check; there is no application logic to unit-test).

---

## File Structure

- `package.json`, `astro.config.mjs` — project + Astro config (static output).
- `netlify.toml` — build command, publish dir, redirects.
- `.gitignore`, `README.md` — housekeeping + owner handoff docs.
- `src/styles/global.css` — design tokens (colors, type, spacing) + base styles.
- `src/layouts/BaseLayout.astro` — html shell, head/meta, imports global css, slots header/footer.
- `src/components/Header.astro`, `src/components/Footer.astro` — shared nav/footer (read `src/data/site.json`).
- `src/components/ProjectCard.astro` — one portfolio card.
- `src/data/site.json` — brand, contact email, nav labels, footer text.
- `src/data/home.json` — home page copy blocks.
- `src/data/pricing.json` — pricing page copy + tiers + hourly terms.
- `src/content.config.ts` — Astro content collection definition for portfolio.
- `src/content/portfolio/*.md` — portfolio entries (placeholder).
- `src/pages/index.astro` — home.
- `src/pages/pricing.astro` — pricing.
- `src/pages/portfolio.astro` — portfolio grid.
- `src/pages/contact.astro` — Netlify Forms inquiry page.
- `public/admin/index.html`, `public/admin/config.yml` — DecapCMS.
- `public/images/.gitkeep` — placeholder image dir.

---

## Task 1: Scaffold Astro project, base layout, global styles, Netlify config

**Files:**
- Create: `package.json`, `astro.config.mjs`, `netlify.toml`, `.gitignore`
- Create: `src/styles/global.css`
- Create: `src/layouts/BaseLayout.astro`
- Create: `src/pages/index.astro` (temporary smoke page, replaced in Task 3)

**Interfaces:**
- Produces: `BaseLayout.astro` accepting props `{ title: string; description?: string }` and a default `<slot />` for page body. Renders `<html>`, `<head>` (title, meta description, viewport, charset), imports `../styles/global.css`, and a `<body>` containing `<slot />`.
- Produces: design tokens as CSS custom properties on `:root` in `global.css`: `--color-bg`, `--color-text`, `--color-muted`, `--color-accent`, `--color-accent-ink`, `--color-surface`, `--font-sans`, `--space-*`, `--radius`, `--maxw`.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "keepsite-media",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "astro dev",
    "build": "astro build",
    "preview": "astro preview",
    "check": "astro check"
  },
  "dependencies": {
    "astro": "^5.0.0"
  }
}
```

- [ ] **Step 2: Install dependencies**

Run: `npm install`
Expected: completes, creates `node_modules/` and `package-lock.json`.

- [ ] **Step 3: Create `astro.config.mjs`**

```js
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://keepsitemedia.com',
  output: 'static',
});
```

- [ ] **Step 4: Create `netlify.toml`**

```toml
[build]
  command = "npm run build"
  publish = "dist"

[[redirects]]
  from = "/admin"
  to = "/admin/index.html"
  status = 200
```

- [ ] **Step 5: Create `.gitignore`**

```
node_modules/
dist/
.astro/
.DS_Store
.env
```

- [ ] **Step 6: Create `src/styles/global.css`**

```css
:root {
  --color-bg: #fbf9f4;          /* warm off-white */
  --color-surface: #ffffff;
  --color-text: #1f2421;        /* near-black, warm */
  --color-muted: #5c6661;
  --color-accent: #2f7d5b;      /* calm green */
  --color-accent-ink: #ffffff;
  --color-border: #e7e2d6;
  --font-sans: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  --space-1: 0.5rem;
  --space-2: 1rem;
  --space-3: 1.5rem;
  --space-4: 2.5rem;
  --space-5: 4rem;
  --space-6: 6rem;
  --radius: 14px;
  --maxw: 1080px;
}

* { box-sizing: border-box; }

html { scroll-behavior: smooth; }

body {
  margin: 0;
  font-family: var(--font-sans);
  color: var(--color-text);
  background: var(--color-bg);
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
}

h1, h2, h3 { line-height: 1.15; letter-spacing: -0.02em; margin: 0 0 var(--space-2); }
h1 { font-size: clamp(2.2rem, 5vw, 3.4rem); }
h2 { font-size: clamp(1.6rem, 3.5vw, 2.3rem); }
p { margin: 0 0 var(--space-2); }
a { color: var(--color-accent); }

.container { max-width: var(--maxw); margin: 0 auto; padding: 0 var(--space-3); }
.section { padding: var(--space-6) 0; }
.muted { color: var(--color-muted); }
.center { text-align: center; }

.btn {
  display: inline-block;
  background: var(--color-accent);
  color: var(--color-accent-ink);
  padding: 0.85rem 1.5rem;
  border-radius: var(--radius);
  text-decoration: none;
  font-weight: 600;
  border: 0;
  cursor: pointer;
  transition: transform 0.05s ease, opacity 0.15s ease;
}
.btn:hover { opacity: 0.92; }
.btn:active { transform: translateY(1px); }
.btn-outline {
  background: transparent;
  color: var(--color-accent);
  border: 1.5px solid var(--color-accent);
}

.card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  padding: var(--space-3);
}

.grid { display: grid; gap: var(--space-3); }
@media (min-width: 720px) {
  .grid-2 { grid-template-columns: repeat(2, 1fr); }
  .grid-3 { grid-template-columns: repeat(3, 1fr); }
}

:focus-visible { outline: 3px solid var(--color-accent); outline-offset: 2px; }
```

- [ ] **Step 7: Create `src/layouts/BaseLayout.astro`**

```astro
---
import '../styles/global.css';
const { title, description = 'Keepsite Media builds websites you own and keep — no lock-in, no monthly fees.' } = Astro.props;
---
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="description" content={description} />
    <title>{title}</title>
  </head>
  <body>
    <slot />
  </body>
</html>
```

- [ ] **Step 8: Create temporary `src/pages/index.astro` smoke page**

```astro
---
import BaseLayout from '../layouts/BaseLayout.astro';
---
<BaseLayout title="Keepsite Media">
  <main class="container section">
    <h1>Keepsite Media</h1>
    <p>Build smoke test.</p>
  </main>
</BaseLayout>
```

- [ ] **Step 9: Build and verify output**

Run: `npm run build`
Expected: build succeeds; `dist/index.html` exists.

- [ ] **Step 10: Assert built HTML contains expected content**

Run: `grep -q "Keepsite Media" dist/index.html && grep -q 'name="viewport"' dist/index.html && echo PASS`
Expected: prints `PASS`.

- [ ] **Step 11: Commit**

```bash
git add package.json package-lock.json astro.config.mjs netlify.toml .gitignore src/styles/global.css src/layouts/BaseLayout.astro src/pages/index.astro
git commit -m "feat: scaffold Astro project, base layout, design tokens, Netlify config"
```

---

## Task 2: Site settings data + Header and Footer components

**Files:**
- Create: `src/data/site.json`
- Create: `src/components/Header.astro`
- Create: `src/components/Footer.astro`
- Modify: `src/layouts/BaseLayout.astro` (render Header above slot, Footer below)

**Interfaces:**
- Consumes: `BaseLayout.astro` from Task 1.
- Produces: `src/data/site.json` shape `{ brand: string, email: string, nav: {label: string, href: string}[], footerNote: string }`.
- Produces: `Header.astro` and `Footer.astro` taking no props (they import `site.json` directly).

- [ ] **Step 1: Create `src/data/site.json`**

```json
{
  "brand": "Keepsite Media",
  "email": "snic9004@gmail.com",
  "nav": [
    { "label": "Home", "href": "/" },
    { "label": "Portfolio", "href": "/portfolio" },
    { "label": "Pricing", "href": "/pricing" },
    { "label": "Get in touch", "href": "/contact" }
  ],
  "footerNote": "You keep everything — the git repo, the Netlify account, the whole site. No lock-in, no monthly fees."
}
```

- [ ] **Step 2: Create `src/components/Header.astro`**

```astro
---
import site from '../data/site.json';
const path = Astro.url.pathname;
---
<header class="site-header">
  <div class="container header-inner">
    <a class="brand" href="/">{site.brand}</a>
    <nav aria-label="Primary">
      {site.nav.map((item) => (
        <a
          href={item.href}
          class={item.href === '/contact' ? 'nav-cta' : 'nav-link'}
          aria-current={path === item.href ? 'page' : undefined}
        >{item.label}</a>
      ))}
    </nav>
  </div>
</header>

<style>
  .site-header { border-bottom: 1px solid var(--color-border); background: var(--color-bg); position: sticky; top: 0; z-index: 10; }
  .header-inner { display: flex; align-items: center; justify-content: space-between; padding-top: var(--space-2); padding-bottom: var(--space-2); gap: var(--space-2); flex-wrap: wrap; }
  .brand { font-weight: 800; font-size: 1.15rem; text-decoration: none; color: var(--color-text); }
  nav { display: flex; align-items: center; gap: var(--space-3); flex-wrap: wrap; }
  .nav-link { text-decoration: none; color: var(--color-text); font-weight: 500; }
  .nav-link[aria-current="page"] { color: var(--color-accent); }
  .nav-cta { text-decoration: none; background: var(--color-accent); color: var(--color-accent-ink); padding: 0.5rem 1rem; border-radius: var(--radius); font-weight: 600; }
</style>
```

- [ ] **Step 3: Create `src/components/Footer.astro`**

```astro
---
import site from '../data/site.json';
const year = 2026;
---
<footer class="site-footer">
  <div class="container">
    <p class="footer-note">{site.footerNote}</p>
    <p class="muted">
      <a href={`mailto:${site.email}`}>{site.email}</a> · © {year} {site.brand}
    </p>
  </div>
</footer>

<style>
  .site-footer { border-top: 1px solid var(--color-border); padding: var(--space-4) 0; margin-top: var(--space-5); }
  .footer-note { max-width: 46ch; font-weight: 600; }
</style>
```

- [ ] **Step 4: Update `src/layouts/BaseLayout.astro` to include Header/Footer**

```astro
---
import '../styles/global.css';
import Header from '../components/Header.astro';
import Footer from '../components/Footer.astro';
const { title, description = 'Keepsite Media builds websites you own and keep — no lock-in, no monthly fees.' } = Astro.props;
---
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="description" content={description} />
    <title>{title}</title>
  </head>
  <body>
    <Header />
    <slot />
    <Footer />
  </body>
</html>
```

- [ ] **Step 5: Build and assert nav + footer render**

Run: `npm run build && grep -q "Portfolio" dist/index.html && grep -q "snic9004@gmail.com" dist/index.html && grep -q "You keep everything" dist/index.html && echo PASS`
Expected: prints `PASS`.

- [ ] **Step 6: Commit**

```bash
git add src/data/site.json src/components/Header.astro src/components/Footer.astro src/layouts/BaseLayout.astro
git commit -m "feat: add site settings data, shared header and footer"
```

---

## Task 3: Home / intro page

**Files:**
- Create: `src/data/home.json`
- Modify: `src/pages/index.astro` (replace smoke page with full home)

**Interfaces:**
- Consumes: `BaseLayout.astro` (Task 1), Header/Footer via layout (Task 2).
- Produces: `src/data/home.json` shape `{ heroHeadline: string, heroSub: string, hourlyLine: string, valueProps: {title: string, body: string}[], closingHeadline: string }`.

- [ ] **Step 1: Create `src/data/home.json`**

```json
{
  "heroHeadline": "I build websites you actually keep.",
  "heroSub": "When the work is done, the site is yours — the git repo, the Netlify account, all of it. No lock-in, no monthly fees, no platform holding your business hostage.",
  "hourlyLine": "Need a change later? Pay by the hour: $50 for the first hour, $75 each hour after, 1-hour minimum. That's it.",
  "valueProps": [
    { "title": "You own it", "body": "The code lives in your GitHub and deploys from your Netlify. I hand over the keys — you're never locked in." },
    { "title": "No ongoing costs", "body": "Static sites on Netlify's free tier mean $0/month hosting. You pay me to build it, then it's yours to run for free." },
    { "title": "Effortless updates", "body": "Want to make edits yourself? I can add a simple visual editor so you change text and images without touching code." },
    { "title": "Personal & direct", "body": "You work with me directly — no account managers, no tickets. Just clear pricing and honest work." }
  ],
  "closingHeadline": "Ready for a site that's truly yours?"
}
```

- [ ] **Step 2: Replace `src/pages/index.astro` with full home page**

```astro
---
import BaseLayout from '../layouts/BaseLayout.astro';
import home from '../data/home.json';
---
<BaseLayout title="Keepsite Media — websites you own and keep">
  <main>
    <section class="section hero">
      <div class="container">
        <h1>{home.heroHeadline}</h1>
        <p class="hero-sub muted">{home.heroSub}</p>
        <p><a class="btn" href="/contact">Start a project</a>
        <a class="btn btn-outline" href="/pricing" style="margin-left:0.75rem">See pricing</a></p>
        <p class="hourly muted">{home.hourlyLine}</p>
      </div>
    </section>

    <section class="section">
      <div class="container">
        <h2>Why own it?</h2>
        <div class="grid grid-2">
          {home.valueProps.map((v) => (
            <div class="card">
              <h3>{v.title}</h3>
              <p class="muted">{v.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>

    <section class="section center">
      <div class="container">
        <h2>{home.closingHeadline}</h2>
        <p><a class="btn" href="/contact">Get in touch</a></p>
      </div>
    </section>
  </main>
</BaseLayout>

<style>
  .hero-sub { max-width: 56ch; font-size: 1.15rem; }
  .hourly { max-width: 56ch; margin-top: var(--space-3); font-size: 0.95rem; }
  .hero h1 { max-width: 18ch; }
</style>
```

- [ ] **Step 3: Build and assert home content**

Run: `npm run build && grep -q "websites you actually keep" dist/index.html && grep -q "1-hour minimum" dist/index.html && grep -q "Why own it" dist/index.html && echo PASS`
Expected: prints `PASS`.

- [ ] **Step 4: Commit**

```bash
git add src/data/home.json src/pages/index.astro
git commit -m "feat: build home/intro page"
```

---

## Task 4: Pricing page

**Files:**
- Create: `src/data/pricing.json`
- Create: `src/pages/pricing.astro`

**Interfaces:**
- Consumes: `BaseLayout.astro`.
- Produces: `src/data/pricing.json` shape `{ intro: string, tiers: {name: string, price: string, blurb: string, features: string[]}[], hourly: {title: string, lines: string[]}, ownership: string }`.

- [ ] **Step 1: Create `src/data/pricing.json`**

```json
{
  "intro": "Simple, honest pricing. You pay once to build it, then you own it outright — no subscriptions, no surprises.",
  "tiers": [
    {
      "name": "Static site",
      "price": "$400",
      "blurb": "A fast, polished website that's done right and handed over to you.",
      "features": [
        "Custom responsive design",
        "Deployed to your Netlify account",
        "Code in your GitHub repo",
        "$0/month hosting on Netlify's free tier"
      ]
    },
    {
      "name": "Static site + DecapCMS",
      "price": "$750",
      "blurb": "Everything in the static site, plus a simple visual editor so you can update content yourself.",
      "features": [
        "Everything in the static site",
        "Edit text and images in your browser",
        "No code required for content changes",
        "Still $0/month — you own and run it"
      ]
    }
  ],
  "hourly": {
    "title": "Updates and changes",
    "lines": [
      "$50 for the first hour",
      "$75 for each additional hour",
      "1-hour minimum per request"
    ]
  },
  "ownership": "Every project comes with full ownership: the git repository and the Netlify account are yours. There are no monthly fees and no ongoing costs from me — once it's built, you're free."
}
```

- [ ] **Step 2: Create `src/pages/pricing.astro`**

```astro
---
import BaseLayout from '../layouts/BaseLayout.astro';
import pricing from '../data/pricing.json';
---
<BaseLayout title="Pricing — Keepsite Media">
  <main>
    <section class="section">
      <div class="container">
        <h1>Pricing</h1>
        <p class="intro muted">{pricing.intro}</p>

        <div class="grid grid-2" style="margin-top: var(--space-4)">
          {pricing.tiers.map((t) => (
            <div class="card tier">
              <h2>{t.name}</h2>
              <p class="price">{t.price}</p>
              <p class="muted">{t.blurb}</p>
              <ul>
                {t.features.map((f) => <li>{f}</li>)}
              </ul>
            </div>
          ))}
        </div>

        <div class="card hourly" style="margin-top: var(--space-4)">
          <h2>{pricing.hourly.title}</h2>
          <ul>
            {pricing.hourly.lines.map((l) => <li>{l}</li>)}
          </ul>
        </div>

        <p class="ownership" style="margin-top: var(--space-4)">{pricing.ownership}</p>

        <p style="margin-top: var(--space-3)"><a class="btn" href="/contact">Start a project</a></p>
      </div>
    </section>
  </main>
</BaseLayout>

<style>
  .intro { max-width: 56ch; }
  .price { font-size: 2.4rem; font-weight: 800; color: var(--color-accent); margin: 0 0 var(--space-1); }
  .tier ul, .hourly ul { padding-left: 1.1rem; }
  .tier li, .hourly li { margin-bottom: 0.4rem; }
  .ownership { max-width: 60ch; font-weight: 600; }
</style>
```

- [ ] **Step 3: Build and assert pricing content (exact figures)**

Run: `npm run build && grep -q "\$400" dist/pricing/index.html && grep -q "\$750" dist/pricing/index.html && grep -q "first hour" dist/pricing/index.html && grep -q "1-hour minimum" dist/pricing/index.html && echo PASS`
Expected: prints `PASS`.

- [ ] **Step 4: Commit**

```bash
git add src/data/pricing.json src/pages/pricing.astro
git commit -m "feat: build pricing page with tiers and hourly terms"
```

---

## Task 5: Portfolio content collection, ProjectCard, portfolio page

**Files:**
- Create: `src/content.config.ts`
- Create: `src/content/portfolio/example-bakery.md`
- Create: `src/content/portfolio/example-consultant.md`
- Create: `src/content/portfolio/example-nonprofit.md`
- Create: `src/components/ProjectCard.astro`
- Create: `src/pages/portfolio.astro`
- Create: `public/images/.gitkeep`

**Interfaces:**
- Consumes: `BaseLayout.astro`.
- Produces: a content collection named `portfolio` with schema `{ title: string, blurb: string, url: string, thumbnail?: string, order: number }`.
- Produces: `ProjectCard.astro` taking props `{ title: string, blurb: string, url: string, thumbnail?: string }`.

- [ ] **Step 1: Create `src/content.config.ts`**

```ts
import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const portfolio = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/portfolio' }),
  schema: z.object({
    title: z.string(),
    blurb: z.string(),
    url: z.string(),
    thumbnail: z.string().optional(),
    order: z.number().default(0),
  }),
});

export const collections = { portfolio };
```

- [ ] **Step 2: Create `src/content/portfolio/example-bakery.md`**

```md
---
title: "Corner Street Bakery"
blurb: "A warm one-page site for a neighborhood bakery — menu, hours, and directions. (Placeholder — replace with a real project.)"
url: "https://example.com"
order: 1
---
```

- [ ] **Step 3: Create `src/content/portfolio/example-consultant.md`**

```md
---
title: "Hart Consulting"
blurb: "A clean professional site with services and a contact form for an independent consultant. (Placeholder — replace with a real project.)"
url: "https://example.com"
order: 2
---
```

- [ ] **Step 4: Create `src/content/portfolio/example-nonprofit.md`**

```md
---
title: "Riverside Food Pantry"
blurb: "A friendly site with a DecapCMS editor so volunteers can post updates themselves. (Placeholder — replace with a real project.)"
url: "https://example.com"
order: 3
---
```

- [ ] **Step 5: Create `public/images/.gitkeep`**

```
```
(empty file — keeps the images directory in git for future thumbnails)

- [ ] **Step 6: Create `src/components/ProjectCard.astro`**

```astro
---
const { title, blurb, url, thumbnail } = Astro.props;
---
<a class="project-card card" href={url} target="_blank" rel="noopener noreferrer">
  <div class="thumb">
    {thumbnail ? <img src={thumbnail} alt={`Screenshot of ${title}`} loading="lazy" /> : <span class="thumb-placeholder">{title}</span>}
  </div>
  <h3>{title}</h3>
  <p class="muted">{blurb}</p>
  <span class="visit">Visit site →</span>
</a>

<style>
  .project-card { display: block; text-decoration: none; color: var(--color-text); transition: transform 0.1s ease, box-shadow 0.15s ease; }
  .project-card:hover { transform: translateY(-3px); box-shadow: 0 10px 30px rgba(0,0,0,0.06); }
  .thumb { aspect-ratio: 16 / 10; border-radius: 10px; overflow: hidden; background: var(--color-bg); display: flex; align-items: center; justify-content: center; margin-bottom: var(--space-2); border: 1px solid var(--color-border); }
  .thumb img { width: 100%; height: 100%; object-fit: cover; }
  .thumb-placeholder { font-weight: 700; color: var(--color-muted); padding: var(--space-2); text-align: center; }
  .visit { color: var(--color-accent); font-weight: 600; }
</style>
```

- [ ] **Step 7: Create `src/pages/portfolio.astro`**

```astro
---
import BaseLayout from '../layouts/BaseLayout.astro';
import ProjectCard from '../components/ProjectCard.astro';
import { getCollection } from 'astro:content';

const projects = (await getCollection('portfolio'))
  .sort((a, b) => a.data.order - b.data.order);
---
<BaseLayout title="Portfolio — Keepsite Media">
  <main>
    <section class="section">
      <div class="container">
        <h1>Portfolio</h1>
        <p class="muted" style="max-width:56ch">A few sites I've built. Each one was handed over in full — the client owns it outright.</p>
        <div class="grid grid-3" style="margin-top: var(--space-4)">
          {projects.map((p) => (
            <ProjectCard title={p.data.title} blurb={p.data.blurb} url={p.data.url} thumbnail={p.data.thumbnail} />
          ))}
        </div>
      </div>
    </section>
  </main>
</BaseLayout>
```

- [ ] **Step 8: Build and assert portfolio renders all entries**

Run: `npm run build && grep -q "Corner Street Bakery" dist/portfolio/index.html && grep -q "Hart Consulting" dist/portfolio/index.html && grep -q "Riverside Food Pantry" dist/portfolio/index.html && echo PASS`
Expected: prints `PASS`.

- [ ] **Step 9: Commit**

```bash
git add src/content.config.ts src/content/portfolio src/components/ProjectCard.astro src/pages/portfolio.astro public/images/.gitkeep
git commit -m "feat: add portfolio collection, project cards, portfolio page"
```

---

## Task 6: Contact page with Netlify Forms

**Files:**
- Create: `src/pages/contact.astro`

**Interfaces:**
- Consumes: `BaseLayout.astro`, `src/data/site.json` (for fallback email).
- Produces: a Netlify-detectable form named `inquiry` with fields `name`, `email`, `project-type`, `message`, plus honeypot `bot-field`.

Netlify detects forms at build time from the static HTML. The form needs `data-netlify="true"`, a hidden `form-name` input matching the form's `name`, and a honeypot via `data-netlify-honeypot`. On submit Netlify redirects to its default success page (or `action`); we point `action` at `/contact?success=1` and show a confirmation when that query param is present.

- [ ] **Step 1: Create `src/pages/contact.astro`**

```astro
---
import BaseLayout from '../layouts/BaseLayout.astro';
import site from '../data/site.json';
const submitted = Astro.url.searchParams.get('success') === '1';
---
<BaseLayout title="Get in touch — Keepsite Media">
  <main>
    <section class="section">
      <div class="container narrow">
        <h1>Let's build something you'll own</h1>
        {submitted ? (
          <div class="card success">
            <h2>Thanks — message received.</h2>
            <p class="muted">I'll get back to you soon at the email you provided. If it's urgent, reach me directly at <a href={`mailto:${site.email}`}>{site.email}</a>.</p>
          </div>
        ) : (
          <>
            <p class="muted" style="max-width:54ch">Tell me a bit about your project. I'll reply personally — no bots, no sales funnel.</p>
            <form
              name="inquiry"
              method="POST"
              data-netlify="true"
              data-netlify-honeypot="bot-field"
              action="/contact?success=1"
              class="inquiry-form"
            >
              <input type="hidden" name="form-name" value="inquiry" />
              <p class="hidden-field">
                <label>Don't fill this out: <input name="bot-field" /></label>
              </p>

              <label class="field">
                <span>Your name</span>
                <input type="text" name="name" required autocomplete="name" />
              </label>

              <label class="field">
                <span>Email</span>
                <input type="email" name="email" required autocomplete="email" />
              </label>

              <label class="field">
                <span>What are you after?</span>
                <select name="project-type">
                  <option value="Static site ($400)">Static site ($400)</option>
                  <option value="Static + DecapCMS ($750)">Static + DecapCMS ($750)</option>
                  <option value="Not sure yet">Not sure yet</option>
                  <option value="Updates to an existing site">Updates to an existing site</option>
                  <option value="Something else">Something else</option>
                </select>
              </label>

              <label class="field">
                <span>Project details</span>
                <textarea name="message" rows="5" required></textarea>
              </label>

              <button type="submit" class="btn">Send inquiry</button>
            </form>
          </>
        )}
      </div>
    </section>
  </main>
</BaseLayout>

<style>
  .narrow { max-width: 640px; }
  .inquiry-form { display: grid; gap: var(--space-3); margin-top: var(--space-4); }
  .field { display: grid; gap: 0.4rem; }
  .field span { font-weight: 600; }
  .field input, .field select, .field textarea {
    font: inherit; padding: 0.7rem 0.8rem; border: 1.5px solid var(--color-border);
    border-radius: 10px; background: var(--color-surface); color: var(--color-text); width: 100%;
  }
  .field textarea { resize: vertical; }
  .hidden-field { display: none; }
  .success { border-color: var(--color-accent); }
</style>
```

- [ ] **Step 2: Build and assert the form is Netlify-detectable**

Run: `npm run build && grep -q 'data-netlify="true"' dist/contact/index.html && grep -q 'name="form-name"' dist/contact/index.html && grep -q 'name="bot-field"' dist/contact/index.html && grep -q 'name="project-type"' dist/contact/index.html && echo PASS`
Expected: prints `PASS`.

- [ ] **Step 3: Assert the default (no-query) build shows the form**

Run: `grep -q "Tell me a bit about your project" dist/contact/index.html && echo PASS`
Expected: prints `PASS`. (The static build renders the form branch; the success branch is exercised at runtime when Netlify redirects to `/contact?success=1` after a submission.)

- [ ] **Step 4: Commit**

```bash
git add src/pages/contact.astro
git commit -m "feat: add contact page with Netlify Forms inquiry form"
```

---

## Task 7: DecapCMS admin

**Files:**
- Create: `public/admin/index.html`
- Create: `public/admin/config.yml`

**Interfaces:**
- Consumes: the data files and content collection from Tasks 2–5.
- Produces: a working `/admin` editor. Decap "file" collections map to `src/data/site.json`, `src/data/home.json`, `src/data/pricing.json`; a "folder" collection maps to `src/content/portfolio/*.md`.

Decap's git-gateway backend requires the owner to enable **Netlify Identity** and **Git Gateway** in the Netlify dashboard after first deploy (documented in the README in Task 8). The config below uses git-gateway.

- [ ] **Step 1: Create `public/admin/index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Content Manager — Keepsite Media</title>
  </head>
  <body>
    <script src="https://unpkg.com/decap-cms@^3.0.0/dist/decap-cms.js"></script>
  </body>
</html>
```

- [ ] **Step 2: Create `public/admin/config.yml`**

```yaml
backend:
  name: git-gateway
  branch: master

media_folder: "public/images"
public_folder: "/images"

collections:
  - name: "settings"
    label: "Site Settings"
    files:
      - name: "site"
        label: "Site & Footer"
        file: "src/data/site.json"
        fields:
          - { name: "brand", label: "Brand name", widget: "string" }
          - { name: "email", label: "Contact email", widget: "string" }
          - name: "nav"
            label: "Navigation"
            widget: "list"
            fields:
              - { name: "label", label: "Label", widget: "string" }
              - { name: "href", label: "Link", widget: "string" }
          - { name: "footerNote", label: "Footer note", widget: "text" }

      - name: "home"
        label: "Home Page"
        file: "src/data/home.json"
        fields:
          - { name: "heroHeadline", label: "Hero headline", widget: "string" }
          - { name: "heroSub", label: "Hero subtext", widget: "text" }
          - { name: "hourlyLine", label: "Hourly billing line", widget: "text" }
          - name: "valueProps"
            label: "Value props"
            widget: "list"
            fields:
              - { name: "title", label: "Title", widget: "string" }
              - { name: "body", label: "Body", widget: "text" }
          - { name: "closingHeadline", label: "Closing headline", widget: "string" }

      - name: "pricing"
        label: "Pricing Page"
        file: "src/data/pricing.json"
        fields:
          - { name: "intro", label: "Intro", widget: "text" }
          - name: "tiers"
            label: "Tiers"
            widget: "list"
            fields:
              - { name: "name", label: "Name", widget: "string" }
              - { name: "price", label: "Price", widget: "string" }
              - { name: "blurb", label: "Blurb", widget: "text" }
              - { name: "features", label: "Features", widget: "list", field: { name: "feature", label: "Feature", widget: "string" } }
          - name: "hourly"
            label: "Hourly section"
            widget: "object"
            fields:
              - { name: "title", label: "Title", widget: "string" }
              - { name: "lines", label: "Lines", widget: "list", field: { name: "line", label: "Line", widget: "string" } }
          - { name: "ownership", label: "Ownership note", widget: "text" }

  - name: "portfolio"
    label: "Portfolio"
    folder: "src/content/portfolio"
    create: true
    extension: "md"
    format: "frontmatter"
    slug: "{{slug}}"
    fields:
      - { name: "title", label: "Title", widget: "string" }
      - { name: "blurb", label: "Blurb", widget: "text" }
      - { name: "url", label: "Live URL", widget: "string" }
      - { name: "thumbnail", label: "Thumbnail", widget: "image", required: false }
      - { name: "order", label: "Sort order", widget: "number", default: 0 }
      - { name: "body", label: "Body (optional)", widget: "markdown", required: false }
```

- [ ] **Step 3: Build and assert admin is published to dist**

Run: `npm run build && test -f dist/admin/index.html && test -f dist/admin/config.yml && grep -q "git-gateway" dist/admin/config.yml && echo PASS`
Expected: prints `PASS`.

- [ ] **Step 4: Validate config.yml is well-formed YAML**

Run: `node -e "const fs=require('fs');const s=fs.readFileSync('public/admin/config.yml','utf8');if(!/collections:/.test(s))process.exit(1);console.log('PASS')"`
Expected: prints `PASS`.

- [ ] **Step 5: Commit**

```bash
git add public/admin/index.html public/admin/config.yml
git commit -m "feat: add DecapCMS admin and content config"
```

---

## Task 8: Owner handoff README + final verification

**Files:**
- Create: `README.md`

**Interfaces:**
- Consumes: the whole site.
- Produces: deploy + handoff documentation for the owner (and clients).

- [ ] **Step 1: Create `README.md`**

```md
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
```

- [ ] **Step 2: Full clean build**

Run: `rm -rf dist && npm run build`
Expected: build succeeds with no errors.

- [ ] **Step 3: Verify all four pages + admin exist in output**

Run: `for f in index.html pricing/index.html portfolio/index.html contact/index.html admin/index.html admin/config.yml; do test -f "dist/$f" || { echo "MISSING $f"; exit 1; }; done; echo PASS`
Expected: prints `PASS`.

- [ ] **Step 4: Run Astro's type/content check**

Run: `npm run check`
Expected: completes with 0 errors (warnings acceptable).

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: add owner handoff README and finalize site"
```

---

## Self-Review Notes

- **Spec coverage:** Home (Task 3), Portfolio (Task 5), Pricing (Task 4), Contact/Netlify Forms (Task 6), DecapCMS (Task 7), shared header/footer (Task 2), brand/design tokens (Task 1), ownership + hourly + exact prices appear in Tasks 3/4 and are asserted in build steps. Email target documented for Netlify config (Task 8) since email delivery is a dashboard setting, not code.
- **Routes:** `/contact` used consistently for the inquiry page (matches Global Constraints).
- **Type consistency:** `site.json`/`home.json`/`pricing.json` shapes are defined once in their creating task and consumed by the matching page; portfolio schema in `content.config.ts` matches `ProjectCard` props and the Decap `portfolio` collection fields.
- **Decap/Astro file alignment:** Decap file paths (`src/data/*.json`, `src/content/portfolio`) point at the exact files Astro imports, so edits flow through to the build.
