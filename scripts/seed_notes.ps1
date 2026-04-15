$outputFile = "backend_all_content.txt"
$backendPath = "backend"

# Clear the file if it exists
if (Test-Path $outputFile) { Remove-Item $outputFile }

$count = 0
Get-ChildItem -Path $backendPath -Recurse -File | Where-Object { 
    # Include only files we want
    ($_.Extension -in ".py", ".txt", ".json", ".yml", ".yaml", ".md", ".sql") -and
    # Exclude unwanted paths
    $_.FullName -notmatch "(\\__pycache__|\.venv|venv|node_modules|dist|build|app-old|\.pyc|\.pyo)" -and
    # Exclude specific file patterns
    $_.Name -notmatch "(\.env|README|migrations\.sql)"
} | ForEach-Object {
    $count++
    Add-Content -Path $outputFile -Value "=== FILE: $($_.FullName.Replace((Get-Location).Path + '\', '')) ==="
    Add-Content -Path $outputFile -Value ""
    try {
        Get-Content -Path $_.FullName -ErrorAction Stop | Add-Content -Path $outputFile
    } catch {
        Add-Content -Path $outputFile -Value "[Error reading file: $($_.Exception.Message)]"
    }
    Add-Content -Path $outputFile -Value ""
    Add-Content -Path $outputFile -Value ""
}

Write-Host "Done! Added $count files to $outputFile"



$outputFile = "frontend_all_content.txt"
$frontendPath = "frontend"

# Clear the file if it exists
if (Test-Path $outputFile) { Remove-Item $outputFile }

$count = 0
Get-ChildItem -Path $frontendPath -Recurse -File | Where-Object { 
    # Include only files we want
    ($_.Extension -in ".ts", ".tsx", ".js", ".jsx", ".css", ".json", ".md", ".txt") -and
    # Exclude unwanted paths
    $_.FullName -notmatch "(\\node_modules|\\dist|\\build|\\.next|\\coverage|\\.git|\\\.env)" -and
    # Exclude specific file patterns
    $_.Name -notmatch "(\.env|package-lock\.json|pnpm-lock\.yaml)"
} | ForEach-Object {
    $count++
    Add-Content -Path $outputFile -Value "=== FILE: $($_.FullName.Replace((Get-Location).Path + '\', '')) ==="
    Add-Content -Path $outputFile -Value ""
    try {
        Get-Content -Path $_.FullName -ErrorAction Stop | Add-Content -Path $outputFile
    } catch {
        Add-Content -Path $outputFile -Value "[Error reading file: $($_.Exception.Message)]"
    }
    Add-Content -Path $outputFile -Value ""
    Add-Content -Path $outputFile -Value ""
}

Write-Host "Done! Added $count files to $outputFile"

# ═══════════════════════════════════════════════════════
# SPLIT BACKEND CONTENT
# ═══════════════════════════════════════════════════════

Write-Host "`n=== SPLITTING BACKEND CONTENT ===" -ForegroundColor Cyan
$inputFile = "backend_all_content.txt"
$outputDir = "backend_split"
$linesPerFile = 1700

if (-not (Test-Path $outputDir)) {
    New-Item -ItemType Directory -Path $outputDir | Out-Null
}

$content = Get-Content $inputFile -ErrorAction SilentlyContinue
if ($content) {
    $totalLines = if ($content -is [array]) { $content.Count } else { 1 }
    $fileNumber = 1
    $startLine = 0

    while ($startLine -lt $totalLines) {
        $endLine = [Math]::Min($startLine + $linesPerFile - 1, $totalLines - 1)
        $lines = if ($totalLines -eq 1) { $content } else { $content[$startLine..$endLine] }
        $outputFile = Join-Path $outputDir "part_$fileNumber.txt"
        $lines | Set-Content -Path $outputFile
        $actualLines = if ($lines -is [array]) { $lines.Count } else { 1 }
        Write-Host "  Created part_$fileNumber.txt ($actualLines lines)"
        $startLine = $endLine + 1
        $fileNumber++
    }
    Write-Host "Done! Split backend_all_content.txt into $($fileNumber - 1) files" -ForegroundColor Green
}

# ═══════════════════════════════════════════════════════
# SPLIT FRONTEND CONTENT
# ═══════════════════════════════════════════════════════

Write-Host "`n=== SPLITTING FRONTEND CONTENT ===" -ForegroundColor Cyan
$inputFile = "frontend_all_content.txt"
$outputDir = "frontend_split"
$linesPerFile = 1700

if (-not (Test-Path $outputDir)) {
    New-Item -ItemType Directory -Path $outputDir | Out-Null
}

$content = Get-Content $inputFile -ErrorAction SilentlyContinue
if ($content) {
    $totalLines = if ($content -is [array]) { $content.Count } else { 1 }
    $fileNumber = 1
    $startLine = 0

    while ($startLine -lt $totalLines) {
        $endLine = [Math]::Min($startLine + $linesPerFile - 1, $totalLines - 1)
        $lines = if ($totalLines -eq 1) { $content } else { $content[$startLine..$endLine] }
        $outputFile = Join-Path $outputDir "part_$fileNumber.txt"
        $lines | Set-Content -Path $outputFile
        $actualLines = if ($lines -is [array]) { $lines.Count } else { 1 }
        Write-Host "  Created part_$fileNumber.txt ($actualLines lines)"
        $startLine = $endLine + 1
        $fileNumber++
    }
    Write-Host "Done! Split frontend_all_content.txt into $($fileNumber - 1) files" -ForegroundColor Green
}