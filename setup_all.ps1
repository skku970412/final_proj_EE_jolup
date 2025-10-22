param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$ForwardedArgs
)

$ErrorActionPreference = "Stop"
Set-Location -Path $PSScriptRoot

$backendScript = Join-Path -Path $PSScriptRoot -ChildPath "backend/setup.ps1"
if (-not (Test-Path $backendScript)) {
    throw "backend/setup.ps1 script is missing."
}

& $backendScript @ForwardedArgs

$frontendDir = Join-Path -Path $PSScriptRoot -ChildPath "frontend"
$packageJson = Join-Path -Path $frontendDir -ChildPath "package.json"
if (-not (Test-Path $frontendDir)) {
    throw "frontend directory not found."
}
if (-not (Test-Path $packageJson)) {
    throw "frontend/package.json is missing."
}

Push-Location -Path $frontendDir
try {
    npm install
}
finally {
    Pop-Location
}
