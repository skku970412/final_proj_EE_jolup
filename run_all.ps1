param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$ForwardedArgs
)

$ErrorActionPreference = "Stop"
Set-Location -Path $PSScriptRoot

$backendDir = Join-Path -Path $PSScriptRoot -ChildPath "backend"
if (-not (Test-Path $backendDir)) {
    throw "backend directory not found."
}

$venvPython = Join-Path -Path $backendDir -ChildPath ".venv\Scripts\python.exe"
if (-not (Test-Path $venvPython)) {
    throw "backend/.venv is missing. Run .\setup_all.ps1 first."
}

$frontendDir = Join-Path -Path $PSScriptRoot -ChildPath "frontend"
$packageJson = Join-Path -Path $frontendDir -ChildPath "package.json"
if (-not (Test-Path $frontendDir)) {
    throw "frontend directory not found."
}
if (-not (Test-Path $packageJson)) {
    throw "frontend/package.json is missing."
}

$uvicornHost = if ($env:UVICORN_HOST) { $env:UVICORN_HOST } else { "0.0.0.0" }
$uvicornPort = if ($env:UVICORN_PORT) { $env:UVICORN_PORT } else { "8000" }
$frontendHost = if ($env:FRONTEND_HOST) { $env:FRONTEND_HOST } else { "0.0.0.0" }
$frontendPort = if ($env:VITE_DEV_SERVER_PORT) { $env:VITE_DEV_SERVER_PORT } else { "5173" }

$backendJob = Start-Job -ScriptBlock {
    param($dir, $pythonExe, $hostValue, $portValue, $extraArgs)
    Set-Location -Path $dir
    $args = @("-m", "uvicorn", "app.main:app", "--reload", "--host", $hostValue, "--port", $portValue) + $extraArgs
    & $pythonExe @args
} -ArgumentList $backendDir, $venvPython, $uvicornHost, $uvicornPort, $ForwardedArgs

try {
    Set-Location -Path $frontendDir
    npm run dev -- --host $frontendHost --port $frontendPort
}
finally {
    if ($backendJob -and ($backendJob.State -eq 'Running')) {
        Stop-Job -Job $backendJob -ErrorAction SilentlyContinue
    }
    Receive-Job -Job $backendJob -ErrorAction SilentlyContinue | Write-Output
    Remove-Job -Job $backendJob -ErrorAction SilentlyContinue
}
