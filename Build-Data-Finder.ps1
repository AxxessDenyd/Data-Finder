# Builds Data Finder on this Windows PC. No GitHub build is used.
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot

function Missing([string]$name, [string]$url) {
  Write-Host ""
  Write-Host "This PC is missing $name."
  Write-Host "Install the free copy from $url"
  Write-Host "Then close this window and double-click Build-Data-Finder.bat again."
  exit 1
}

if ($env:OS -ne 'Windows_NT') {
  Write-Host "Build Data Finder on the Windows PC. This script does not run on a phone or a Mac."
  exit 1
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Missing 'Node.js' 'https://nodejs.org'
}
if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) {
  Missing 'Rust' 'https://rustup.rs'
}

$vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
$hasMsvc = $false
if (Test-Path -LiteralPath $vswhere) {
  $install = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
  if ($install) { $hasMsvc = $true }
}
if (-not $hasMsvc) {
  Missing 'Visual Studio Build Tools, with Desktop development with C++ checked' 'https://visualstudio.microsoft.com/visual-cpp-build-tools/'
}

$toolchain = ''
try { $toolchain = (& rustup show active-toolchain) } catch { $toolchain = '' }
if ($toolchain -notmatch 'msvc') {
  Write-Host "Switching Rust to the Windows build tools..."
  & rustup default stable-x86_64-pc-windows-msvc
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

Write-Host "Installing the pieces Data Finder needs..."
& npm ci
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Building Data Finder. The first time can take several minutes."
& npx --yes '@tauri-apps/cli@2.12.3' build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$built = Join-Path $PSScriptRoot 'Built'
New-Item -ItemType Directory -Force -Path $built | Out-Null
$setup = Get-ChildItem -Path 'src-tauri\target\release\bundle\nsis' -Filter '*setup.exe' | Select-Object -First 1
if (-not $setup) { throw 'The installer was not created.' }
Copy-Item -LiteralPath $setup.FullName -Destination (Join-Path $built 'Data Finder Setup.exe') -Force
$portable = Get-ChildItem -Path 'src-tauri\target\release' -Filter '*.exe' | Where-Object { $_.Name -notlike '*setup*' } | Select-Object -First 1
if (-not $portable) { throw 'The program was not created.' }
Copy-Item -LiteralPath $portable.FullName -Destination (Join-Path $built 'Data Finder.exe') -Force

Write-Host ""
Write-Host "Done. Close Data Finder if it is open, then use the files in the Built folder."
Start-Process explorer.exe $built
