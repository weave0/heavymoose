# Heavy Moose Workspace Transfer and Admin Access

This workspace is the canonical development root for the Heavy Moose site.

## Workspace Root

- z:\HeavyMoose

## Open in VS Code

- File -> Open Workspace from File
- Select: z:\HeavyMoose\heavymoose.code-workspace

## Repo and Domain

- GitHub repo: <https://github.com/weave0/heavymoose>
- Cloudflare Pages project: heavymoose
- Production domain: <https://heavymoose.com>
- Production deploy branch: main

## Required Local Tools

- Node.js 20+
- Git
- GitHub CLI (gh)
- Wrangler CLI (via npx wrangler)

## Authentication and Privilege Model

Development/admin-level workflows rely on local authenticated CLIs:

1. GitHub auth with repo and workflow scopes

- Check: gh auth status
- Login (if needed): gh auth login

2. Cloudflare auth with pages write scope

- Check: npx wrangler whoami
- Login/refresh (if needed): npx wrangler login

Expected Cloudflare account for this project:

- Account name: Weave0
- Account ID: 3253d907ea85a18eb442283d7308b193

## One-Command Access Verification

Run this from PowerShell:

- .\scripts\dev-admin-check.ps1

Optional token refresh during check:

- .\scripts\dev-admin-check.ps1 -FixWranglerAuth

## Standard Dev Commands

- npm run dev
- npm run deploy
- npm run deploy:clean
- npm run verify:prod
- npm run deploy:verified

Important:

- deploy scripts are pinned to production with --branch main
- avoid ad-hoc deploy commands without --branch main if production update is intended
- prefer npm run deploy:verified when shipping user-visible copy or design changes

## Cloudflare Pages Settings to Verify

In Pages project heavymoose:

- Production branch is main
- Custom domains include:
  - <https://heavymoose.com>
  - <https://www.heavymoose.com>

## Secrets

Set secrets against the pages project when needed:

- npx wrangler secret put GA_MEASUREMENT_ID --project-name heavymoose

## Handoff Checklist

1. Open z:\HeavyMoose\heavymoose.code-workspace
2. Run .\scripts\dev-admin-check.ps1
3. Confirm gh auth status shows account weave0
4. Confirm wrangler whoami shows account Weave0 and pages write scope
5. Run npm run deploy to validate production branch deployment
6. Run npm run verify:prod to confirm production page markers are live
