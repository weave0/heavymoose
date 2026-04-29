Param(
    [string]$Url = "https://heavymoose.com/",
    [string]$ExpectedTagline = "Yeah... Sometimes Life is Heavy",
    [string]$ExpectedCanonical = "https://heavymoose.com/",
    [int]$TimeoutSec = 30,
    [int]$MaxAttempts = 6,
    [int]$RetryDelaySec = 10,
    [switch]$VerboseOutput
)

$ErrorActionPreference = "Stop"

function Assert-Contains {
    param(
        [string]$Html,
        [string]$Needle,
        [string]$Label
    )

    if ($Html -notmatch [regex]::Escape($Needle)) {
        throw "Missing expected marker ($Label): $Needle"
    }

    Write-Host "[PASS] $Label marker found" -ForegroundColor Green
}

function Assert-MatchesRegex {
    param(
        [string]$Html,
        [string]$Pattern,
        [string]$Label
    )

    if ($Html -notmatch $Pattern) {
        throw "Missing expected marker ($Label): regex '$Pattern'"
    }

    Write-Host "[PASS] $Label marker found" -ForegroundColor Green
}

try {
    # cache-bust query param avoids stale edge/browser caching when checking latest production state
    $requestParams = @{
        Method             = "Get"
        TimeoutSec         = $TimeoutSec
        MaximumRedirection = 5
    }

    if ((Get-Command Invoke-WebRequest).Parameters.ContainsKey("UseBasicParsing")) {
        $requestParams.UseBasicParsing = $true
    }

    $resp = $null

    for ($attempt = 1; $attempt -le $MaxAttempts; $attempt++) {
        $stamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
        $checkUrl = "${Url}?verify=$stamp"
        Write-Host "Checking production URL (attempt $attempt/$MaxAttempts): $checkUrl" -ForegroundColor Cyan

        try {
            $resp = Invoke-WebRequest -Uri $checkUrl @requestParams
            if ($resp.StatusCode -ge 200 -and $resp.StatusCode -lt 400) {
                break
            }
            throw "Unexpected HTTP status code: $($resp.StatusCode)"
        }
        catch {
            if ($attempt -eq $MaxAttempts) {
                throw
            }
            Write-Host "Retrying in $RetryDelaySec seconds..." -ForegroundColor Yellow
            Start-Sleep -Seconds $RetryDelaySec
        }
    }

    Write-Host "[PASS] HTTP status $($resp.StatusCode)" -ForegroundColor Green

    $html = [string]$resp.Content

    Assert-Contains -Html $html -Needle $ExpectedTagline -Label "Footer tagline"
    $escapedCanonical = [regex]::Escape($ExpectedCanonical)
    $canonicalPattern = '<link[^>]+rel=["'']canonical["''][^>]+href=["'']{0}["'']' -f $escapedCanonical
    Assert-MatchesRegex -Html $html -Pattern $canonicalPattern -Label "Canonical URL"
    Assert-Contains -Html $html -Needle "Heavy Moose" -Label "Brand name"

    if ($VerboseOutput) {
        Write-Host "\nResponse URL: $($resp.BaseResponse.ResponseUri.AbsoluteUri)"
        Write-Host "Content length: $($html.Length)"
    }

    Write-Host "\nProduction verification complete." -ForegroundColor Cyan
    exit 0
}
catch {
    Write-Host "[FAIL] Production verification failed" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}
