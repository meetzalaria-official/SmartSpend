# SmartSpend Phase 8 - compile the Java API and static server
$ErrorActionPreference = "Stop"

$root = $PSScriptRoot
$sourceRoot = Join-Path $root "backend\src"
$outputRoot = Join-Path $root "backend\bin"

Write-Host ""
Write-Host "  SmartSpend - build" -ForegroundColor Cyan
Write-Host "  ------------------" -ForegroundColor DarkCyan

if (-not (Get-Command javac -ErrorAction SilentlyContinue)) {
    Write-Host "  javac was not found." -ForegroundColor Red
    Write-Host "  Install a JDK 17 (not only a JRE), then reopen the terminal." -ForegroundColor Yellow
    exit 1
}

if (-not (Test-Path $sourceRoot)) {
    Write-Host "  Missing source folder: $sourceRoot" -ForegroundColor Red
    exit 1
}

New-Item -ItemType Directory -Force -Path $outputRoot | Out-Null

$sources = Get-ChildItem -Path $sourceRoot -Recurse -Filter "*.java" -File
if (-not $sources -or $sources.Count -eq 0) {
    Write-Host "  No Java files found in $sourceRoot" -ForegroundColor Red
    exit 1
}

$sourceFiles = @($sources | ForEach-Object { $_.FullName })
& javac -encoding UTF-8 -d $outputRoot $sourceFiles
if ($LASTEXITCODE -ne 0) {
    Write-Host "  Compilation failed (exit code $LASTEXITCODE)." -ForegroundColor Red
    exit $LASTEXITCODE
}

Write-Host "  Compiled $($sourceFiles.Count) Java file(s)." -ForegroundColor Green
Write-Host "  Output: $outputRoot" -ForegroundColor DarkGray
Write-Host ""
