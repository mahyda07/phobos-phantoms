# Written with AI assistance (Claude).
# Builds the Hugging Face Space staging folder (Gradio SDK) from this repo.
# Run from the repo root:  powershell -ExecutionPolicy Bypass -File pipeline\hf\make_space.ps1
param([string]$Out = "F:\SpaceApps2026\hf-space")
$ErrorActionPreference = "Stop"
$hf   = $PSScriptRoot
$repo = (Resolve-Path (Join-Path $hf "..\..")).Path

foreach ($p in "pipeline\api.py", "pipeline\planner_basic.py", "pipeline\fallback\route.json", "terrain\out\grid.json", "terrain\out\stops.csv", "terrain\out\science.bin", "pipeline\fallback\window.json") {
    if (-not (Test-Path (Join-Path $repo $p))) { throw "Missing $p. Run this on an up-to-date main (git pull)." }
}

if (Test-Path $Out) { Remove-Item $Out -Recurse -Force }
New-Item -ItemType Directory -Path $Out | Out-Null
New-Item -ItemType Directory -Path (Join-Path $Out "terrain") | Out-Null

foreach ($f in "app.py", "requirements.txt", "README.md") { Copy-Item (Join-Path $hf $f) $Out }
Copy-Item (Join-Path $repo "LICENSE") $Out
if (Test-Path (Join-Path $repo "results.md")) { Copy-Item (Join-Path $repo "results.md") $Out }   # served at GET /results
Copy-Item (Join-Path $repo "contracts")   (Join-Path $Out "contracts") -Recurse
Copy-Item (Join-Path $repo "pipeline")    (Join-Path $Out "pipeline")  -Recurse
Copy-Item (Join-Path $repo "terrain\out") (Join-Path $Out "terrain\out") -Recurse

# Drop what the Space does not need (caches, node packages, this hf folder itself)
Get-ChildItem $Out -Recurse -Directory -Force |
    Where-Object { $_.Name -in "__pycache__", "node_modules", ".pytest_cache", "hf" } |
    Sort-Object { $_.FullName.Length } -Descending |
    ForEach-Object { Remove-Item $_.FullName -Recurse -Force -ErrorAction SilentlyContinue }

$files = Get-ChildItem $Out -Recurse -File -Force
"Staging folder: $Out"
"{0} files, {1:N1} MB" -f $files.Count, (($files | Measure-Object Length -Sum).Sum / 1MB)
Get-ChildItem $Out | Select-Object Mode, Name | Format-Table -AutoSize
