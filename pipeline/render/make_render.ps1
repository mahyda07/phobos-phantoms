# Written with AI assistance (Claude).
# Builds the hosting copy of the planner service for Render (free web service) and pushes it to
# the public repo https://github.com/aprettymess/phobos-planner, which Render deploys automatically.
# Run from the repo root:  powershell -ExecutionPolicy Bypass -File pipeline\render\make_render.ps1
param([string]$Out = "F:\SpaceApps2026\render-planner", [string]$Message = "Update planner service from the project repo")
$ErrorActionPreference = "Stop"
$repo = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path

foreach ($p in "pipeline\api.py", "pipeline\planner_basic.py", "pipeline\fallback\route.json", "pipeline\fallback\window.json", "terrain\out\grid.json", "terrain\out\stops.csv", "terrain\out\science.bin") {
    if (-not (Test-Path (Join-Path $repo $p))) { throw "Missing $p. Run this on an up-to-date main (git pull)." }
}
if (-not (Test-Path (Join-Path $Out ".git"))) { throw "$Out is not the clone of aprettymess/phobos-planner. Clone it first: git clone https://github.com/aprettymess/phobos-planner.git $Out" }

# Replace everything except the git folder
Get-ChildItem $Out -Force | Where-Object { $_.Name -ne ".git" } | Remove-Item -Recurse -Force
New-Item -ItemType Directory -Path (Join-Path $Out "terrain") | Out-Null
Copy-Item (Join-Path $repo "LICENSE") $Out
if (Test-Path (Join-Path $repo "results.md")) { Copy-Item (Join-Path $repo "results.md") $Out }   # served at GET /results
Copy-Item (Join-Path $repo "contracts")   (Join-Path $Out "contracts") -Recurse
Copy-Item (Join-Path $repo "pipeline")    (Join-Path $Out "pipeline")  -Recurse
Copy-Item (Join-Path $repo "terrain\out") (Join-Path $Out "terrain\out") -Recurse
Get-ChildItem $Out -Recurse -Directory -Force |
    Where-Object { $_.Name -in "__pycache__", "node_modules", ".pytest_cache", "render" } |
    Sort-Object { $_.FullName.Length } -Descending |
    ForEach-Object { Remove-Item $_.FullName -Recurse -Force -ErrorAction SilentlyContinue }

$utf8 = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText((Join-Path $Out "requirements.txt"), "numpy`nscipy`nscikit-image`njsonschema`nfastapi`nuvicorn[standard]`n", $utf8)
[System.IO.File]::WriteAllText((Join-Path $Out "README.md"), "# Phobos Planner service`n`nHosting copy of the planner web service from the Phobos Phantoms OG 7.66 project (NASA Space Apps Challenge 2026). Source of truth: the project repository (pipeline/, contracts/, terrain/out/); this copy is made by pipeline/render/make_render.ps1.`n`nRender: build ``pip install -r requirements.txt``, start ``uvicorn pipeline.api:app --host 0.0.0.0 --port `$PORT``, env PYTHON_VERSION=3.12.7 and CORS_ALLOW_ORIGINS.`n", $utf8)

Push-Location $Out
try {
    git add -A
    git status --short
    git diff --cached --quiet
    if ($LASTEXITCODE -eq 0) { "No changes to push." }
    else { git commit -m $Message; git push }
} finally { Pop-Location }
