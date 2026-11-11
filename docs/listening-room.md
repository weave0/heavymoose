# Good Flippin Vibes / Heavy Moose Listening Room

Source: `listen/`. Separate Cloudflare Pages project: **heavymoose-listen**.
Preferred hostname: **listen.heavymoose.com**. Existing `heavymoose` project and production pages remain unchanged.

## Run and verify

No dependency installation or paid service is required for the application.

On a fresh checkout, first run `node scripts/hydrate-listen.cjs` to restore Git-ignored streaming media from the current label-owned deployment. The Restricted campaign features the album and Bat Attack video on Discover.

```powershell
node --test scripts/test-listen.mjs
node scripts/build-listen.cjs
node scripts/preview-listen.cjs
```

Open http://127.0.0.1:3001. `dist/listen` contains only the app, its headers, and referenced assets. It excludes repository internals and the existing production Worker. The preview server supports byte-range requests for audio seeking.

## Current library

38 releases and 25 streamable songs. The latest addition is **80s Maybe Included** by Heavy Moose, using the supplied Cosmic Moose Sentinel cover and the nine `master_B_reference_320.mp3` listening masters. WAV masters remain untouched. Every MP3 passed a complete FFmpeg decode and SHA-256 copy comparison. Streaming is enabled; file downloads remain disabled. The supplied order and titles are authoritative, including “Bat Attack” (source folder `03_bst_attack22`) and “Fly To” (source folder `06_flyin`). The album appears first in the manifest and discovery cards. The Restricted hero plays this album, alongside an opt-in YouTube embed for Bat Attack (`mde4tAc-s9o`).

Artist-supplied MP3s under `assets/audio/listen/` are Git-ignored. The public repository contains catalog paths, sizes and SHA-256 hashes in `listen/media-assets.json`. The deployment serves audio for listening without download links. Streaming cannot prevent browser recording or network-level copying. Rebuilds restore absent audio with `scripts/hydrate-listen.cjs` and verify every hash; bootstrap new recordings locally before CI can fetch them.

1. 80's Opening Song
2. Juggle
3. Bat Attack
4. FF
5. Less Of A Fan
6. Fly To
7. Somethin'
8. In Context
9. 80's Close

## Initial source audit

37 release entries were migrated from the existing music catalog and structured metadata. Two artists/collaborators are represented: Heavy Moose and DJ Shariff. Only 16 recordings pass the MP3 signature check: 12 Knock, Knock ('Merica) tracks, three Flipside Rituals tracks, and DJ Shariff's 'Merica. These were already served on the existing music page.

The 12 Temper MP3s, 13 Floor Witness MP3s and `conus/missed-some-80s.mp3` in the source repository contain only zero bytes. They are excluded from the listening manifest and isolated deployment; their original files are untouched. Replace them with real recordings before enabling them. Album artwork and release metadata remain visible. No fabricated songs, public-domain substitutes, or third-party streaming previews are presented as label recordings.

`scripts/seed-listen-catalog.cjs` records the original migration logic. Do not rerun it after manual catalog edits or imports: it rebuilds the catalog from the original source and would omit later additions.

## Provide music one album at a time

Place each album in a folder like this, anywhere accessible on your computer, or upload the folder as a ZIP / share its Google Drive folder:

```text
Good Flippin Vibes Music/
  Artist Name/
    Album Name/
      album.json
      cover.jpg
      01 - First Song.mp3
      02 - Second Song.mp3
```

For an album you provide in chat, the MP3s and artwork plus artist name, album name, track order, year, and streaming/download permissions are enough; the manifest can be created for you. A local Windows folder path works when this desktop has read access. A cloud folder needs an accessible link/connection. Keep original WAV/FLAC masters separately. Prefer MP3 256–320 kbps, square JPG/PNG artwork (ideally 1500px+), and files under **25 MiB each** for this initial Pages setup.

Example `album.json` for a new album:

```json
{
  "id": "album-name",
  "artist": { "id": "artist-name", "name": "Artist Name", "description": "A short artist introduction." },
  "title": "Album Name",
  "year": "2026",
  "releaseDate": "2026-10-29",
  "genre": "Electronic",
  "cover": "cover.jpg",
  "streamingAllowed": true,
  "downloadAllowed": false,
  "tracks": [
    { "file": "01 - First Song.mp3", "title": "First Song" },
    { "file": "02 - Second Song.mp3", "title": "Second Song" }
  ]
}
```

Validate, then import explicitly:

```powershell
node scripts/ingest-listen.cjs "C:\Music\Artist Name\Album Name"
node scripts/ingest-listen.cjs "C:\Music\Artist Name\Album Name" --apply
node --test scripts/test-listen.mjs
node scripts/build-listen.cjs
```

The importer checks permissions, filenames, MP3 headers and size, refuses existing album IDs/destination files, copies assets into `assets/audio/listen/<artist-id>/<album-id>/` and `assets/images/listen/`, and updates `listen/catalog.json`. New artists require no code changes. For an existing catalog-only album, add track entries to `tracks`, assign its existing album ID, and populate that album's track-ID array instead of importing a second album. Never overwrite the original zero-filled files without verifying replacement recordings.

## Playback, storage and offline behavior

One HTML5 audio element persists across client-side views. Likes, queue, current song, position, volume, shuffle and repeat are stored locally, with invalid/stale values discarded. Refresh restores position without autoplay. Lock-screen controls use Media Session where supported. Private browsing/storage restrictions degrade to a session-only collection.

The service worker is scoped to the app directory and caches only the shell/catalog. **Offline music playback is not implemented or advertised.** Audio and byte-range requests always use the network. Existing tracks default to `downloadAllowed:false`; explicit permission enables a plain file-download link, not an offline in-app cache. A future offline cache needs opt-in, quota/eviction handling, removal UI and byte-range responses. Browser storage is never guaranteed permanent. New releases require a service-worker cache version bump when changing shell paths; the network-first policy refreshes unchanged URLs automatically.

## Deployment and DNS

`.github/workflows/listening-room.yml` validates PRs and deploys pushes to `main` and the initial `feat/listening-room` branch **only to heavymoose-listen**, when repository secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` are configured. The initial repository audit found these two secrets absent, so automatic publishing skips with a clear summary until they are supplied. The initial branch is allowed to publish this separate app for review before merging. Later feature branches validate on PR without publishing. Existing production deployment rules are untouched.

Local publishing uses the existing Cloudflare sign-in (no token in source):

```powershell
node --test scripts/test-listen.mjs
node scripts/build-listen.cjs
npx wrangler@4 pages deploy dist/listen --project-name=heavymoose-listen --branch=main
```

The production site remains on `heavymoose` / heavymoose.com. Listening-room deployment uses `heavymoose-listen.pages.dev`. To attach the preferred hostname, register `listen.heavymoose.com` under the new project's custom domains, then create only a CNAME named `listen` pointing to `heavymoose-listen.pages.dev` (proxied). Wait for Cloudflare domain validation and TLS activation. Do not replace apex or www records. DNS completion/status is reported separately in the handoff.

Initial deployment completed October 29, 2026: https://9dd58fed.heavymoose-listen.pages.dev (stable alias https://heavymoose-listen.pages.dev). The preferred address **https://listen.heavymoose.com** is active: domain ownership and HTTP/TLS validation passed, and an HTTPS request returned 200. Its proxied CNAME points to `heavymoose-listen.pages.dev`. No further DNS entry is needed. Apex/www records were not changed.

Fallback `/listen/`: build and copy the complete `dist/listen` output into a production site's `/listen/` directory, then review its routing and CSP before deploying the main site. Do not serve the raw source directory: its referenced assets are assembled by the build. The relative manifest scope/assets also work under this subdirectory.

## Cost

This is a static Pages app with no Functions, database, login provider, R2 bucket, or paid SDK. Static requests are free and unlimited under [Cloudflare's documented Pages pricing](https://developers.cloudflare.com/pages/functions/pricing/). The Free plan supports 20,000 files and 25 MiB per asset; [current limits](https://developers.cloudflare.com/pages/platform/limits/) also describe build quotas. This project adds no paid subscription. Reassess storage strategy for large catalogs or files exceeding 25 MiB; do not enable billable storage automatically. GitHub Actions usage remains subject to the account's existing allowance.
