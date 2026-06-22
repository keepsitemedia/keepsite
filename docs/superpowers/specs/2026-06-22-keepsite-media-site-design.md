# Keepsite Media — Marketing Site Design

**Date:** 2026-06-22
**Status:** Approved (structure)

## Overview

A small static marketing and portfolio site for **Keepsite Media** (keepsitemedia.com),
advertising website-development services. The core sales principle is **ownership without
lock-in**: clients *keep* the website. They own the git repository and Netlify account and
have no ongoing costs. Updates are billed hourly.

The site itself embodies what it sells — a fast Astro static site on Netlify, no backend, no
recurring cost, editable via DecapCMS.

## Brand & Design Direction

**Content pillars:** effortless, personal, trustworthy.

- **Effortless** → fast static pages, minimal navigation, uncluttered layouts, plain-language
  pricing.
- **Personal** → first-person voice ("I build…"), direct contact, human tone.
- **Trustworthy** → transparent pricing, the "you Keep it" guarantee front and center, explicit
  "no hidden / no ongoing costs" messaging.

**Visual treatment:** clean and warm. Generous whitespace, strong friendly typography, a single
calm accent color, rounded-but-not-cartoonish shapes. Professional, not flashy. Fully responsive,
fast, accessible.

## Tech & Architecture

- **Framework:** Astro (static output).
- **Hosting:** Netlify.
- **CMS:** DecapCMS at `/admin`, GitHub backend (git-gateway via Netlify Identity, or GitHub
  OAuth). Lets the owner edit page content without code and doubles as a live demo of the $750
  product.
- **Content storage:** markdown / data files under `src/content/` (and a portfolio collection),
  rendered by Astro and editable by Decap.
- **Forms:** Netlify Forms for the inquiry page; submissions email **snic9004@gmail.com**.
  Includes honeypot spam protection.
- **No database, no serverless backend, no ongoing cost.**

## Pages

### 1. Home / Intro (`/`)
- Hero: the "Keep" promise headline + subhead, primary CTA → Inquiry.
- The model explained: you own git + Netlify, no monthly fees.
- Hourly billing summary: **$50 first hour, $75 each hour after, 1-hour minimum**.
- Value props ("why own it") — 3–4 short cards.
- Closing CTA → Inquiry.

### 2. Portfolio (`/portfolio`)
- Responsive grid of project cards: screenshot/thumbnail, title, short blurb, live link.
- **Placeholder cards** to start, structured as a Decap-editable collection so real sites are
  swapped in later without code changes.

### 3. Pricing (`/pricing`)
- Two build tiers:
  - **Static site — $400**
  - **Static site + DecapCMS — $750** (client can update content themselves).
- Hourly updates section: **$50 first hour / $75 per additional hour / 1-hour minimum**.
- Ownership messaging: no monthly fees; client owns git repo + Netlify account.

### 4. Inquiry (`/inquiry` or `/contact`)
- Netlify Form: name, email, project type (select: static / CMS / not sure / other), message.
- Honeypot field for spam.
- Success confirmation state after submit.

### Shared
- **Header:** logo/wordmark + nav (Home, Portfolio, Pricing, Inquiry/Contact CTA).
- **Footer:** contact email, a short "you keep everything — git, hosting, the lot" line, copyright.

## Content Model (Decap collections)

- **Pages** (singletons): home, pricing copy blocks, intro/about text — editable fields.
- **Portfolio** (collection): each entry = title, blurb, thumbnail image, URL.
- **Site settings** (singleton): brand name, contact email, nav labels, footer text.

## Out of Scope (YAGNI)

- No blog/CMS articles beyond the above.
- No e-commerce / online payment (billing is handled directly, hourly).
- No user accounts beyond the single CMS editor (the owner).
- No analytics integration in v1 (can be added later as a snippet).

## Success Criteria

- Four pages render correctly and responsively.
- Inquiry form submits via Netlify Forms and emails snic9004@gmail.com.
- DecapCMS `/admin` loads and can edit page + portfolio content.
- Site builds and deploys to Netlify with no backend and no ongoing cost.
- Pricing and the ownership ("you keep it") principle are unmistakably clear.
