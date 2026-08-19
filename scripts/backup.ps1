$ErrorActionPreference = 'Stop'
if (-not $env:DATABASE_URL) { throw 'DATABASE_URL is required' }
$backupDirectory = if ($env:BACKUP_DIRECTORY) { $env:BACKUP_DIRECTORY } else { '.\backups' }
New-Item -ItemType Directory -Force -Path $backupDirectory | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$target = Join-Path $backupDirectory "unitrack-$stamp.dump"
pg_dump --format=custom --file=$target $env:DATABASE_URL
Write-Output "Created $target"
if ($env:BACKUP_BUCKET) { Write-Warning 'Upload the dump to BACKUP_BUCKET with your cloud provider CLI and retain encrypted, tested copies.' }
