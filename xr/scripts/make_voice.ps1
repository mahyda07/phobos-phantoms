# Written with AI assistance (Claude). Track [P5].
# Builds the headset's fixed voice clips (run 2, Phase 2b). Quest Browser 157 has no speechSynthesis
# (probe 15 Nov 2026, PROGRESS.md), so the lines are made offline with Windows SAPI (voice: Microsoft Zira Desktop)
# and played with Web Audio. Numbers are never spoken; they stay on the visor.
# Run from the repo root:  powershell -File xr/scripts/make_voice.ps1   (needs ffmpeg on PATH)
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Speech
$out = Join-Path $PSScriptRoot "..\public\voice"
New-Item -ItemType Directory -Force -Path $out | Out-Null
$tmp = Join-Path ([System.IO.Path]::GetTempPath()) "marswalk-voice"
New-Item -ItemType Directory -Force -Path $tmp | Out-Null

$lines = [ordered]@{
  "steep"        = "Steep ground ahead."
  "hazard"       = "A I hazard ahead."
  "stop"         = "Stop reached."
  "margin"       = "Margin under one hour."
  "home"         = "Return route ready."
  "home-offline" = "Planner offline. Showing the walked path, reversed."
  "waking"       = "Waking the planner."
  "walk"         = "Walk started."
}

$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
$s.SelectVoice("Microsoft Zira Desktop")
$s.Rate = 0
foreach ($k in $lines.Keys) {
  $wav = Join-Path $tmp "$k.wav"
  $s.SetOutputToWaveFile($wav)
  $s.Speak($lines[$k])
  $s.SetOutputToNull()
  $mp3 = Join-Path $out "$k.mp3"
  # mono 64 kb/s, trim leading/trailing silence, normalise loudness to about -16 LUFS
  & ffmpeg -hide_banner -loglevel error -y -i $wav -af "silenceremove=start_periods=1:start_threshold=-50dB,areverse,silenceremove=start_periods=1:start_threshold=-50dB,areverse,loudnorm=I=-16:TP=-1.5" -ac 1 -ar 44100 -b:a 64k $mp3
  Write-Output ("{0,-13} {1}" -f $k, $lines[$k])
}
$s.Dispose()
$manifest = [ordered]@{ voice = "Microsoft Zira Desktop (Windows SAPI)"; made_utc = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ"); lines = $lines }
[System.IO.File]::WriteAllText((Join-Path $out "voice.json"), ($manifest | ConvertTo-Json), (New-Object System.Text.UTF8Encoding $false))
