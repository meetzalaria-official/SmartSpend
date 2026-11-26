param(
    [int]$Port = 8080,
    [switch]$NoOpen
)

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

& (Join-Path $root "build.ps1")
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Push-Location $root
try {
    $javaArgs = @(
        "-cp", "backend\bin;backend\lib\sqlite-jdbc-3.54.1.0.jar",
        "com.smartspend.server.PreviewServer",
        "--port", "$Port"
    )
    if ($NoOpen) { $javaArgs += "--no-open" }

    & java @javaArgs
    exit $LASTEXITCODE
}
finally {
    Pop-Location
}
