Param(
    [switch]$FixWranglerAuth
)

$ErrorActionPreference = "Stop"

Write-Host "== Heavy Moose Developer Access Check ==" -ForegroundColor Cyan
Write-Host "Workspace: z:\HeavyMoose"
Write-Host ""

function Run-Step {
    param(
        [string]$Name,
        [scriptblock]$Action
    )

    try {
        Write-Host "[RUN ] $Name" -ForegroundColor Yellow
        & $Action
        Write-Host "[PASS] $Name" -ForegroundColor Green
        Write-Host ""
    }
    catch {
        Write-Host "[FAIL] $Name" -ForegroundColor Red
        Write-Host $_.Exception.Message -ForegroundColor Red
        Write-Host ""
        throw
    }
}

Run-Step -Name "GitHub CLI auth" -Action {
    gh auth status | Out-Host
}

Run-Step -Name "Cloudflare Wrangler auth" -Action {
    npx wrangler whoami | Out-Host
}

if ($FixWranglerAuth) {
    Run-Step -Name "Refresh Wrangler OAuth token" -Action {
        npx wrangler login | Out-Host
    }
}

Run-Step -Name "Git remote points to weave0/heavymoose" -Action {
    Set-Location "z:\HeavyMoose"
    $remote = git remote get-url origin
    if ($remote -notmatch "weave0/heavymoose") {
        throw "Unexpected origin remote: $remote"
    }
    Write-Host "origin=$remote"
}

Run-Step -Name "Pages deploy dry capability check" -Action {
    Write-Host "Expected deploy command:" -ForegroundColor Gray
    Write-Host "npm run deploy" -ForegroundColor Gray
    Write-Host "(This script validates auth only; it does not deploy.)" -ForegroundColor Gray
}

Write-Host "Developer access check complete." -ForegroundColor Cyan
