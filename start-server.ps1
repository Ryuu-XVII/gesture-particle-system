# Cross-platform development server (requires Node.js 20+).
$ErrorActionPreference = "Stop"
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw "Install Node.js 20 or later, then run this script again."
}
& node (Join-Path $PSScriptRoot "scripts/serve.mjs")
