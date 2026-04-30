# Heavy Moose — Workspace Transfer & GFV Ecosystem Handoff

**Artist:** Heavy Moose (Brett Weaver / GFV LLC)
**Live site:** <https://heavymoose.com>
**GitHub repo:** <https://github.com/weave0/heavymoose>
**Parent label / ecosystem hub:** <https://goodflippinvibes.com>
**Last updated:** April 29, 2026

---

## 1. What This Site Is

Heavy Moose is the industrial / dark ambient / experimental artist site for Brett Weaver —
the darker pairing to Good Flippin Vibes. Single-page vanilla HTML/CSS/JS (no build tools,
no frameworks). Hosted on Cloudflare Pages as a static site with an advanced-mode Worker
(`_worker.js`) for routing.

**Two public pages:**

| Page         | URL                       | Purpose                                                                |
| ------------ | ------------------------- | ---------------------------------------------------------------------- |
| `index.html` | heavymoose.com            | Homepage: hero, showcase, about, albums, art gallery, ecosystem bridge |
| `music.html` | heavymoose.com/music.html | Full discography + in-page audio player                                |

---

## 2. Workspace Root

```
z:\HeavyMoose
```

Open in VS Code:

```
File → Open Workspace from File → z:\HeavyMoose\heavymoose.code-workspace
```

---

## 3. Repository & Hosting

| Setting            | Value                                     |
| ------------------ | ----------------------------------------- |
| GitHub repo        | weave0/heavymoose                         |
| CF Pages project   | heavymoose                                |
| Production domains | heavymoose.com, www.heavymoose.com        |
| Production branch  | **main** (required — see deploy notes)    |
| CF Account         | Weave0 / 3253d907ea85a18eb442283d7308b193 |

> **Deploy rule:** always use `--branch main`. Without it, Wrangler pushes to a random
> `*.heavymoose.pages.dev` preview URL and the production site does not update.

---

## 4. npm Scripts

```powershell
npm run dev              # local http-server on :3001
npm run deploy           # deploy to production (--branch main, --commit-dirty=true)
npm run deploy:clean     # deploy to production (no dirty flag)
npm run verify:prod      # HEAD check against https://heavymoose.com
npm run deploy:verified  # deploy then verify in one step
```

---

## 5. Discography (current as of Apr 29 2026)

### DROSS: TEMPER — _new release_ (2026)

- Collaboration with DJ Shariff
- **12 tracks** — served as 320 kbps MP3s from `assets/audio/temper/`
- In-page HTML5 player on `music.html#temper`
- Amazon Music (direct): <https://music.amazon.com/albums/B0GZ17Z8BH>
- Apple Music: search fallback (no canonical URL confirmed yet)
- Tracks (in order):

| #   | File                 | Title         |
| --- | -------------------- | ------------- |
| 01  | 01-no.mp3            | NO            |
| 02  | 02-fight.mp3         | Fight         |
| 03  | 03-every-night.mp3   | Every Night   |
| 04  | 04-worst-dark.mp3    | Worst Dark    |
| 05  | 05-turn.mp3          | Turn          |
| 06  | 06-first-steps.mp3   | First Steps   |
| 07  | 07-mine.mp3          | Mine          |
| 08  | 08-face.mp3          | Face          |
| 09  | 09-open.mp3          | Open          |
| 10  | 10-among.mp3         | Among         |
| 11  | 11-what-remained.mp3 | What Remained |
| 12  | 12-here.mp3          | Here          |

### DROSS — _Glass and Ash_ (2024)

- 11 tracks — streaming links point to Amazon/Apple search fallbacks
- music.html anchor: `#dross-1`
- Source masters: `Z:\GFD\GFD Dev Projects\SummitView\sandbox\audio_hd\dross_glass_and_ash\`

### DROSS II — _Yield_ (2025)

- 12 tracks — streaming links point to Amazon/Apple search fallbacks
- music.html anchor: `#dross-2`
- Source masters: `Z:\GFD\GFD Dev Projects\SummitView\sandbox\audio_hd\dross_yield\`

> **TODO for GFV:** replace search-fallback streaming URLs for DROSS and DROSS II
> with canonical album URLs once they are confirmed.

---

## 6. Audio Player — Technical Notes

The TEMPER player on `music.html` is a custom HTML5 player (no library). Key behaviours:

- `preload="none"` — no audio loads until user interacts (bandwidth-safe)
- `controlslist="nodownload" disableremoteplayback` — Chrome-only download deterrent
  (progressive enhancement; other browsers ignore these attributes — not true DRM)
- **Media Session API** — exposes album art + track metadata to lock screen / OS media
  controls / Bluetooth devices
- **localStorage resume** — saves last-played track index + position; pre-loads on
  return visit but does not autoplay
- `aria-current="true"` toggled on active track row for screen-reader "now playing" state
- `prefers-reduced-motion` CSS block disables animations for accessibility
- Keyboard: `Space` toggles play/pause on focused player; track rows are keyboard-navigable

Audio files are served with these Cloudflare headers (set in `_headers`):

```
/assets/audio/*
  Cache-Control: public, max-age=604800, stale-while-revalidate=86400
  Content-Disposition: inline
  X-Robots-Tag: noindex
```

---

## 7. Design System

```css
--bg: #060608 --bg-elevated: #0c0c10 --bg-card: #10101a --text: #e8e8f0
  --text-muted: #6a6a8a --accent: #e0001e /* neon blood red */
  --electric: #00d4ff /* cyber cyan */ --volt: #b8ff00 /* acid lime */
  --radius: 0px /* sharp edges — intentional */;
```

Breakpoints: `900px` (tablet), `600px` (mobile).
GPU-only transitions — no `top`/`left`/`width` animation.

---

## 8. Shared Ecosystem Navigation

The `shared/` folder contains the GFV cross-site nav component:

| File                              | Purpose                               |
| --------------------------------- | ------------------------------------- |
| `shared/ecosystem-nav.css`        | Styles for the top nav bar            |
| `shared/ecosystem-nav.html`       | Nav markup snippet (reference)        |
| `shared/ecosystem-nav.js`         | Toggle/dropdown behaviour             |
| `shared/ecosystem-nav-logos.html` | Logos used in the nav                 |
| `shared/README.md`                | Integration guide for other GFV sites |

Both `index.html` and `music.html` include this component. To update the nav across
all GFV sites, edit the `shared/` files in whichever GFV repo has the authoritative copy
and then sync to each site.

---

## 9. SEO & Schema

- `music.html` contains a full **JSON-LD schema graph** (`application/ld+json`) with:
  - `MusicGroup` (Heavy Moose, linked to goodflippinvibes.com)
  - Three `MusicAlbum` entries (DROSS, DROSS II, DROSS: TEMPER)
  - 12 `MusicRecording` entries for TEMPER tracks
- `sitemap.xml` lists `index.html` and `music.html` with `lastmod 2026-04-30`
- Open Graph + Twitter Card meta on both pages

---

## 10. Key Files

```
index.html            Homepage
music.html            Discography + TEMPER player
_worker.js            Cloudflare Pages Worker (routing + static serve)
_headers              Security headers (CSP, HSTS, audio cache rules)
wrangler.toml         CF Pages config — project "heavymoose", nodejs_compat
sitemap.xml           Two-page sitemap
robots.txt            Standard allow-all
cache-bust.txt        Bump on each deploy (currently: 2026-04-30)
assets/images/        DALL·E album art + gallery (see copilot-instructions.md for map)
assets/audio/temper/  12 TEMPER MP3 files (320 kbps, 79 MB total)
shared/               GFV ecosystem nav component
scripts/              dev-admin-check.ps1, update-cache-bust.js, verify-production.ps1
```

---

## 11. Authentication (Local CLIs)

```powershell
# GitHub
gh auth status                    # verify
gh auth login                     # refresh if needed

# Cloudflare
npx wrangler whoami               # verify (expect account: Weave0)
npx wrangler login                # refresh if needed
```

One-command check:

```powershell
.\scripts\dev-admin-check.ps1
.\scripts\dev-admin-check.ps1 -FixWranglerAuth   # also refreshes CF auth
```

---

## 12. Secrets

```powershell
# Google Analytics 4 (currently disabled in index.html — replace G-XXXXXXXXXX first)
npx wrangler secret put GA_MEASUREMENT_ID --project-name heavymoose
```

---

## 13. Open Items / Known TODOs

| Priority | Item                                                                                                 |
| -------- | ---------------------------------------------------------------------------------------------------- |
| High     | Replace DROSS I/II streaming links with canonical Amazon/Apple album URLs                            |
| High     | Wire in a dedicated DROSS: TEMPER cover image (current: Cyberpunk moose placeholder)                 |
| High     | Set GA4 measurement ID — analytics disabled until `G-XXXXXXXXXX` is replaced                         |
| Medium   | Add TEMPER Open Graph social image (dedicated share image for the new release)                       |
| Medium   | Schema.org `MusicRecording` entries for DROSS I and DROSS II tracks (currently only TEMPER has them) |
| Low      | 192 kbps preview copies of TEMPER tracks for low-bandwidth visitors                                  |
| Low      | Web Audio API frequency visualizer over the player                                                   |
| Low      | Persist DROSS I/II streaming links once canonical URLs are confirmed                                 |

---

## 14. Handoff Checklist

1. Open `z:\HeavyMoose\heavymoose.code-workspace` in VS Code
2. Run `.\scripts\dev-admin-check.ps1` — confirm both GH and CF auth pass
3. Run `npm run verify:prod` — expect HTTP 200 from heavymoose.com
4. Review open items in section 13 above
5. To deploy any change: `npm run deploy` (always targets `--branch main`)

---

## 15. GFV Ecosystem Integration Points

- **heavymoose.com → goodflippinvibes.com:** Ecosystem bridge section on homepage
  (`#ecosystem-bridge`) links to GFV and describes the relationship.
- **goodflippinvibes.com → heavymoose.com:** GFV should list Heavy Moose in its
  artist/label roster and link to `heavymoose.com`.
- **Shared nav component:** `shared/` folder content should stay in sync with the
  authoritative GFV ecosystem nav (source of truth: `weave0/goodflippindesign`).
- **Music pages:** GFV's `music.html` / `music-djz.html` are separate pages at
  `goodflippinvibes.com` — Heavy Moose discography lives at `heavymoose.com/music.html`.
- **Label credit:** All Heavy Moose releases are under GFV LLC DBA Good Flippin Vibes.
