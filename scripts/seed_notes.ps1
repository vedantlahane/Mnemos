$outputFile = "backend_all_content.txt"
$backendPath = "backend"

# Clear the file if it exists
if (Test-Path $outputFile) { Remove-Item $outputFile }

$count = 0
Get-ChildItem -Path $backendPath -Recurse -File | Where-Object { 
    # Include only files we want
    ($_.Extension -in ".py", ".txt", ".json", ".yml", ".yaml", ".md", ".sql") -and
    # Exclude unwanted paths
    $_.FullName -notmatch "(\\__pycache__|\.venv|venv|node_modules|dist|build|\.pyc|\.pyo)" -and
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