param(
    [string]$EnvFile,
    [string]$EvidenceFile,
    [int]$Port = 8791
)
$ErrorActionPreference = 'Stop'
$appRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if ($EnvFile) { $env:SHADOW_ENV_FILE = (Resolve-Path -LiteralPath $EnvFile).Path }
if ($EvidenceFile) {
    $env:IMA_EVIDENCE_CACHE_FILE = (Resolve-Path -LiteralPath $EvidenceFile).Path
    Write-Host '缓存资料模式：不会执行新的 ima 检索；页面保留原始资料日期。'
} else {
    $env:IMA_EVIDENCE_CACHE_FILE = ''
    Write-Host '实时检索模式：需要 ima 权限与可用额度。'
}
$env:HOST = '127.0.0.1'
$env:PORT = [string]$Port
Push-Location -LiteralPath $appRoot
try { node server.mjs } finally { Pop-Location }
