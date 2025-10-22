param(
    [switch]$SkipInstall
)

$ErrorActionPreference = "Stop"
Set-Location -Path $PSScriptRoot

if (-not (Test-Path ".venv")) {
    python -m venv .venv
}

$venvPython = Join-Path -Path ".venv" -ChildPath "Scripts\python.exe"

if (-not (Test-Path $venvPython)) {
    throw "가상 환경이 생성되지 않았습니다."
}

if (-not $SkipInstall) {
    & $venvPython -m pip install --upgrade pip
    & $venvPython -m pip install -r requirements.txt
}

Write-Host "가상 환경이 backend/.venv 에 준비되었습니다."
Write-Host "활성화: `n    .venv\\Scripts\\Activate.ps1"
