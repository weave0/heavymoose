# Heavy Moose — AI Coding Agent Instructions

## ⚠️ Domain Rule — Read This First

The **public-facing domain** is **heavymoose.com**. Always use `heavymoose.com` when referencing the live site. The Cloudflare Pages project name is `heavymoose`. Preview deployments get random `.heavymoose.pages.dev` URLs — these are **not** the production site.

**Production deploy always requires `--branch main`.**

---

## Project Overview

Heavy Moose is the industrial/experimental artist website for Brett Weaver (GFV LLC). Single-page vanilla HTML/CSS/JS — no build tools, no frameworks. Two main pages: `index.html` (homepage) and `music.html` (discography).

**Related ecosystem**: [goodflippinvibes.com](https://goodflippinvibes.com) — the parent label/community platform. GitHub repo: `weave0/goodflippindesign`.

---

## Site Architecture

| File | Purpose |
|------|---------|
| `index.html` | Main homepage — hero, showcase, about, albums, art gallery, ecosystem bridge, footer |
| `music.html` | Full discography page — DROSS I + DROSS II |
| `_worker.js` | Cloudflare Pages advanced-mode worker — routes, serves static |
| `_headers` | Security headers (CSP, HSTS) — allows YouTube, Google Fonts |
| `wrangler.toml` | CF Pages config — `nodejs_compat`, project name `heavymoose` |
| `shared/` | Ecosystem nav (CSS/HTML/JS/logos) shared across GFV ecosystem sites |

### Assets
```
assets/images/
  Molten moose skull in industrial chaos.png     ← DROSS I album art
  Ruined city with moose-headed wanderer.png     ← DROSS II album art + gallery
  Mythical moose at neon-lit concert.png         ← about portrait + gallery (wide)
  Cyberpunk moose with electric guitar.png       ← gallery
  Moose-headed figure in neon industrial chaos.png ← gallery
  Rust and glitch in darkness.png                ← gallery
  apocalyptic-ritual.png
  cosmic-ritual-defiance.png
  moose-on-sun-banjo.png
  moose-rocking-sun.png
  ritual-of-no.png
  rockstar-moose-festival.png
  rockstar-moose-ready.png
  rockstar-moose-ritual.png
```

---

## Deploy Commands

**Always use `--branch main` to hit production (`heavymoose.com`).**

```powershell
# From any terminal (absolute path required):
npx wrangler pages deploy z:\HeavyMoose --project-name heavymoose --branch main --commit-dirty=true

# Or from z:\HeavyMoose:
npm run deploy
```

> Without `--branch main`, deploy goes to a random preview URL only.

**`npm run deploy`** (in package.json) uses `--branch main` — always prefer it.

### Cloudflare Pages Config
- **Project name**: `heavymoose`
- **Production domains**: `heavymoose.com`, `www.heavymoose.com`
- **CF Pages dashboard**: https://dash.cloudflare.com → Pages → heavymoose
- **Wrangler version**: v4.x (`npx wrangler@latest`)

### Secrets (set via `wrangler secret put <NAME> --project-name heavymoose`)
- `GA_MEASUREMENT_ID` — Google Analytics 4 (optional)

---

## Design System

```css
:root {
  --bg: #060608;
  --bg-elevated: #0c0c10;
  --bg-card: #10101a;
  --text: #e8e8f0;
  --text-muted: #6a6a8a;
  --accent: #e0001e;      /* neon blood red */
  --electric: #00d4ff;    /* cyber cyan */
  --volt: #b8ff00;        /* acid lime */
  --border: rgba(255,255,255,0.06);
  --radius: 0px;          /* intentional sharp edges */
  --glow-red: 0 0 20px rgba(224,0,30,0.6), 0 0 60px rgba(224,0,30,0.2);
  --glow-electric: 0 0 16px rgba(0,212,255,0.55), 0 0 50px rgba(0,212,255,0.15);
  --transition-fast: 150ms ease;
  --transition-base: 300ms ease;
}
```

**Aesthetic**: Neon industrial dark. Glitch typography, CRT scanlines, circuit grid, chromatic aberration. No rounded corners (`--radius: 0px`).

---

## CSS / JS Rules

### Animation — GPU only
```css
/* ✅ Allowed */
transition: transform 0.3s ease, opacity 0.3s ease, border-color 0.3s ease;
will-change: transform;

/* ❌ Forbidden */
transition: all 0.3s;     /* layout thrashing */
transition: top 0.2s;     /* non-GPU */
```

### JavaScript Pattern
- **IIFE wrapper**: All code in `(function() { ... })()` — no global scope pollution
- **Progressive enhancement**: Features degrade gracefully if JS fails
- **Touch targets**: Minimum 44px on all interactive elements

### WCAG 2.1 AA
- Minimum contrast ratio: 4.5:1
- `--text-muted: #6a6a8a` — check if changed (must stay ≥4.5:1 on `--bg`)
- All external links: `rel="noopener"`

### Responsive Breakpoints
```css
@media (max-width: 900px) { /* Tablet */ }
@media (max-width: 600px) { /* Mobile */ }
```

---

## Key Sections — index.html Structure

| Section | Class | Notes |
|---------|-------|-------|
| Nav | `.site-nav` | Brand = "HEAVY MOOSE", links to music.html + #about |
| Hero | `.hero` | Glitch effect via `data-text` attr + `::before`/`::after` |
| Showcase | `.showcase` | Feature callouts |
| About | `.about` | Portrait: `Mythical moose at neon-lit concert.png` |
| Albums | `.albums` | DROSS I + II with art, tracklist, streaming links |
| Art Gallery | `.art-gallery` | 3-col CSS grid, 6 DALL-E images |
| Ecosystem Bridge | `.ecosystem-bridge` | Links to goodflippinvibes.com |
| Footer | `footer` | Tagline: "Yeah... Sometimes Life is Heavy" |

### Album Cards — Streaming Links
Both albums have: Amazon Music → Apple Music → goodflippinvibes.com (secondary)
- Amazon links are search-based fallbacks — replace with direct URLs when available
- Apple links are search-based fallbacks — replace with direct URLs when available

---

## Git / GitHub
- **Repo**: `weave0/heavymoose` — `main` branch
- CF Pages is connected to this repo; pushes to `main` auto-deploy

### Commit workflow
```powershell
cd z:\HeavyMoose
git add -A
git commit -m "type: description"
git push origin main
```

---

## npm Scripts
```json
"dev":          "npx http-server . -p 3001 -o --cors",
"deploy":       "npx wrangler pages deploy . --project-name=heavymoose --branch main --commit-dirty=true",
"deploy:clean": "npx wrangler pages deploy . --project-name=heavymoose --branch main"
```

---

## Business Context
- **Artist**: Heavy Moose (Brett Weaver alias)
- **Label**: GFV LLC DBA Good Flippin Vibes
- **Discography**: DROSS (2024, 10 tracks) · DROSS II (2025, 12 tracks)
- **Genre**: Industrial / Dark Ambient / Experimental
- **Contact/label site**: goodflippinvibes.com
