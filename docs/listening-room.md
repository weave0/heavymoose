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

## Bulk-source audit: existing Heavy Moose collection on E: (preferred)

**Source library:** E:\art\MUSIC\Heavy Moose. The folder can contain album subfolders, original downloads, WAV/FLAC masters, MP3 reference masters, alternates, and other nested layouts. **Do not reorganize or rename it.** Existing audio masters are never modified by the audit.

On a Windows checkout of the feat/listening-room branch, **double-click** this launcher:

    scripts\run-listen-library-audit.cmd

The launcher finds the existing source folder, performs a recursive **read-only** audit and opens a separate results folder:

    E:\art\MUSIC\Heavy Moose Listening Audit

If preferred, run the same scanner directly from the checked-out repository:

~~~powershell
node scripts/audit-listen-library.cjs "E:\art\MUSIC\Heavy Moose" --out "E:\art\MUSIC\Heavy Moose Listening Audit"
~~~

This is a zero-dependency Node.js script. ffprobe (from FFmpeg) is used when available to read embedded tags, duration, bitrate and codec. Without it, the scanner still produces a filename- and folder-based inventory but reports metadata as unverified. SHA-256 comparison runs incrementally to identify **exact** duplicates across folders without loading whole recordings into memory. The optional --no-hash or --no-probe flags reduce confidence and are not recommended for the full audit. Symbolic links and junctions are ignored to avoid accidentally scanning outside the source folder. ZIP/7z/RAR archives are listed for later inspection but are not automatically unpacked.

The scanner produces five files:

| Report | Purpose |
| --- | --- |
| summary.md | Number of audio files, inferred albums, zero-byte files, identical copies and possible missing media; includes an album table |
| inventory.csv | A row for every recording including title, album, track number, format, bitrate, SHA-256, source type, review flags and exact match to the existing app's catalog |
| album-suggestions.json | Grouped albums with source file options, cover candidates, catalog album matches and placeholders for permissions |
| exact-duplicates.csv | Groups of byte-for-byte identical recordings, without deleting any |
| inventory.json | Complete technical audit for subsequent ingestion automation |

**Send back only** summary.md, inventory.csv and album-suggestions.json for the next stage. They contain local file/folder names and metadata, so review their contents if filenames are private. Audio does **not** need to be uploaded to perform the first reconciliation.

The audit does **not** assert that the best-scoring master is the final approved release, that folder order is authoritative, or that local ownership grants streaming/download rights. All album/track names, version choices and permissions must be reviewed before ingestion. Streams default to downloadAllowed:false; the Restricted material retains listening-only restrictions. The next stage reconciles album suggestions with existing catalog-only releases, chooses the correct version of each track, and non-destructively creates individual MP3 streaming renditions when necessary. Recordings larger than Cloudflare Pages' 25 MiB per-file limit must not be published directly. **Do not upload lossless masters, a raw E-drive directory, or private audit reports to this public GitHub repository.** Production listen.heavymoose.com remains untouched until every deployed audio file is present and verified.

This chat cannot directly access the PC's E: drive merely from its path, so the Windows audit must actually be run on the machine that holds the files. No music can be marked imported or live until that step and the subsequent review/build are complete.

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

For a smaller album you provide through chat, MP3s and artwork plus artist name, album name, track order, year, and streaming/download permissions are enough; the manifest can be created after the actual files are accessible. A local Windows drive path alone does not make the files readable from this chat. A cloud folder needs an accessible link/connection. Keep original WAV/FLAC masters separately. Prefer MP3 256–320 kbps, square JPG/PNG artwork (ideally 1500px+), and files under **25 MiB each** for this initial Pages setup.

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

One HTML5 audio element persists across client-side views. This advanced pass adds one-tap **Shuffle everything** and **Play all**, playlist creation and per-song playlist saving, recent listening, Play Next, queue reordering, large favorites, a full-screen mobile player, and a **Keep the music going** preference. Play Next overrides shuffle when explicitly requested. The shuffle engine tracks every song played within the current queue and does not choose it again before the other songs have been heard; Repeat All starts a new cycle when the queue is exhausted. On the default continuous setting, a finished album or small queue is extended with the rest of the playable manifest in album order, without adding duplicates. Repeat All intentionally loops the selected queue instead of extending it. Catalog-only releases and zero-byte MP3s never enter the playable queue.

Likes, queue, current song, position, volume, shuffle state, repeat state, continuous preference, saved playlists and up to 30 recently played unique tracks are stored locally, with invalid/stale values discarded. Existing `gfv-listening-room-v1` likes and queue storage is reused and migrated by the restore helper; no account or database is required. Refresh restores position **without autoplay**, as required by mobile browser policy. Clearing storage or switching phones erases browser-only favorites and playlists; there is no cloud sync. Private browsing/storage restrictions degrade to a session-only collection.

The expanded player provides larger one-handed transport, timeline and heart controls. Media Session supports metadata, play/pause, skip, seek, and position where available. Bluetooth/lock-screen and Android Auto **basic media button** behavior varies by Chrome, Android build and vehicle; this web app does not expose a native Android Auto browsing experience, nor guarantee audio continues through every screen lock or phone call. Confirm interruption, restart and Bluetooth behavior on real Android hardware before claiming vehicle support.

The service worker is scoped to the app directory and caches only the shell/catalog. Its cache changes to v4 and the application script/styles use the \`continuous-1\` version so prior installs update without caching audio. **Offline music playback is not implemented or advertised.** Audio and byte-range requests always use the network. Existing tracks default to `downloadAllowed:false`; explicit permission enables a plain file-download link, not an offline in-app cache. A future offline cache needs opt-in, quota/eviction handling, removal UI and byte-range responses. Browser storage is never guaranteed permanent. New releases require a service-worker cache version bump when changing shell paths; the network-first policy refreshes unchanged URLs automatically.

## Deployment and DNS

`.github/workflows/listening-room.yml` validates PRs and deploys pushes to `main` and the initial `feat/listening-room` branch **only to heavymoose-listen**, when repository secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` are configured. GitHub Action runs verified on November 18, 2026 still show the deployment-check and publish steps skipped on PR validation; a full deployment has not been established for this upgrade. If the two repository secrets are absent, branch push jobs skip publishing until they are supplied. The initial branch is allowed to publish this separate app for review before merging. Later feature branches validate on PR without publishing. Existing production deployment rules are untouched.

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

## November 18, 2026 usability upgrade verification

- The Listening Room's feature branch keeps the existing 38 releases / 25 playable songs; all Restricted tracks remain `downloadAllowed:false`.
- Regression tests now cover legacy likes, playlist restore, Play Next priority, queue moves, full-library extension and a full shuffle cycle without repeats. GitHub Actions runs `node --test scripts/test-listen.mjs`, `node --check listen/app.js` and the isolated build including media hydration.
- No native app store listing, Android Auto media browser, account, billable service, offline audio storage or audio-master source upload is added.
- Browser smoke validation on a real Android phone is still recommended: install the PWA, start Shuffle everything, lock the screen, use Bluetooth controls, trigger a phone/navigation interruption, resume, and verify likes/queue/playlists survive a relaunch. The web browser can limit background playback independent of this app.
- **Publishing requirement:** validation green is not equivalent to deployment. Before updating `listen.heavymoose.com`, hydrate the label-owned MP3s into the isolated build and deploy only to `heavymoose-listen`. Never deploy a source-only directory without its Git-ignored audio assets, and never modify the main `heavymoose` Pages project.
