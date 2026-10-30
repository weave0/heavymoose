# Heavy Moose — October 2026 artist distribution notice

## Purpose

Display a restrained, highly visible notice immediately below the Heavy Moose homepage navigation, linking to the documented artist account at:

https://goodflippinyikes.com/heavy-moose/distrokid

The notice says **new releases are blocked through DistroKid** and does not claim the music is banned universally or that infringement, legal liability, or wrongdoing has been established.

## Live architecture (October 29, 2026)

- Site: `https://heavymoose.com/`
- Existing Cloudflare Pages project: `heavymoose`
- Independent Cloudflare Worker: `heavymoose-release-notice`
- Zone route: `heavymoose.com/` (exact homepage only)
- Production route ID: `76d0b823fee14a6d916b7608bd239487`
- Worker source copy: `scripts/edge/distribution-notice.mjs` (this branch)
- No additional paid services or application dependencies.

The Worker performs `fetch(request)` to the existing Pages origin, then uses `HTMLRewriter` to insert CSS in `head` and the announcement after `nav.hm-masthead`. All existing homepage content, scripts, catalogs and assets remain owned by the original Pages deployment. The worker passes non-target paths through unchanged.

## Critical deployment safety

The live Heavy Moose site is sometimes manually deployed from a workspace ahead of GitHub `main`. **Do not merge this branch to main or redeploy the entire Pages project without comparing its current production output to the repository first.** The repo's GitHub Actions workflow deploys the full repository on pushes to main; an unsynchronized deploy could erase newer live changes.

The notice is already deployed through Cloudflare's Worker API. This branch is a backup and future source-of-truth candidate, not an instruction to run the full Pages deploy.

## Validation and rollback

1. Open `https://heavymoose.com/` in a normal browser. Confirm the notice appears immediately under the navigation, links to the case file, and displays properly on mobile.
2. Confirm that videos, discography, audio playback, and the regular site menu are unaffected.
3. Check `https://heavymoose.com/music` or `/music.html` to verify non-homepage pages remain unchanged.
4. If the Worker misbehaves, remove **only** the exact route `heavymoose.com/` from Cloudflare's Workers routes. This restores the original Pages homepage immediately, without a Pages redeploy.
5. Update the source, upload a new Worker version, and verify the preview before changing the production route.

Cloudflare API confirmed successful Worker upload and route creation. The external fetch environment was unable to validate rendered HTML at time of deployment, so browser-level verification remains required.

## Editorial note

The language is intentionally precise: the October 28, 2026 DistroKid email reported stores would no longer accept the artist's releases **via DistroKid**, without identifying a specific track or violation. The linked case file documents the October 29 legal acknowledgment. Do not generalize this to all distributors, streaming services or alleged copyright violations.
