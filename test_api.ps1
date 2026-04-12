# API Test Suite for Mnemos Backend

$baseUrl = "http://localhost:8000"

# Colors
$green = "Green"
$blue = "Cyan"

Write-Host "Starting Mnemos API Tests..." -ForegroundColor $blue
Write-Host "================================" -ForegroundColor $blue

# 1. Health Check
Write-Host "`n=== HEALTH CHECK ===" -ForegroundColor $green
$health = curl -UseBasicParsing $baseUrl/health
$health.Content | ConvertFrom-Json | Format-List

# 2. Get Pages (before creating)
Write-Host "`n=== GET PAGES (before) ===" -ForegroundColor $green
$pagesResp = curl -UseBasicParsing "$baseUrl/api/pages"
$pages = $pagesResp.Content | ConvertFrom-Json
$uncategorizedId = $pages.pages[0].id
Write-Host "Found $(($pages.pages).Count) page(s)"
$pages.pages | Format-Table -Property id, name, icon, note_count

# 3. Create Docker Page
Write-Host "`n=== CREATE PAGE (Docker) ===" -ForegroundColor $green
$pageBody = @{
    name = "Docker"
    description = "Container knowledge"
    icon = "🐳"
} | ConvertTo-Json
$newPage = Invoke-WebRequest -UseBasicParsing -Method POST "$baseUrl/api/pages" `
  -Headers @{"Content-Type"="application/json"} `
  -Body $pageBody
$newPage.Content | ConvertFrom-Json | Format-List

# 4. Get Pages (after creating)
Write-Host "`n=== GET PAGES (after) ===" -ForegroundColor $green
$pagesResp2 = curl -UseBasicParsing "$baseUrl/api/pages"
$pages2 = $pagesResp2.Content | ConvertFrom-Json
Write-Host "Total pages: $(($pages2.pages).Count)"
$pages2.pages | Format-Table -Property id, name, icon, note_count

# 5. Get Stats
Write-Host "`n=== STATS ===" -ForegroundColor $green
$stats = curl -UseBasicParsing "$baseUrl/api/stats"
$stats.Content | ConvertFrom-Json | Format-List

# 6. Get Tags
Write-Host "`n=== TAGS ===" -ForegroundColor $green
$tags = curl -UseBasicParsing "$baseUrl/api/tags"
$tags.Content | ConvertFrom-Json | Format-List

# 7. Capture Note
Write-Host "`n=== CAPTURE NOTE ===" -ForegroundColor $green
$captureBody = @{
    text = "Docker Swarm orchestrates containers across multiple hosts"
    page_hint = "Docker"
} | ConvertTo-Json
$capture = Invoke-WebRequest -UseBasicParsing -Method POST "$baseUrl/api/capture" `
  -Headers @{"Content-Type"="application/json"} `
  -Body $captureBody
$capture.Content | ConvertFrom-Json | Format-List

# 8. Get Notes for Uncategorized
Write-Host "`n=== NOTES (Uncategorized) ===" -ForegroundColor $green
$notes = curl -UseBasicParsing "$baseUrl/api/notes?page_id=$uncategorizedId"
$notesData = $notes.Content | ConvertFrom-Json
Write-Host "Note count: $(($notesData.notes).Count)"
$notesData.notes | Format-Table -Property id, title, created_at

# 9. Get Edges
Write-Host "`n=== EDGES ===" -ForegroundColor $green
$edges = curl -UseBasicParsing "$baseUrl/api/edges"
$edgesData = $edges.Content | ConvertFrom-Json
Write-Host "Edge count: $(($edgesData.edges).Count)"

# 10. Chat
Write-Host "`n=== CHAT ===" -ForegroundColor $green
$chatBody = @{
    question = "What do I know about Docker?"
    context_type = "home"
} | ConvertTo-Json
$chat = Invoke-WebRequest -UseBasicParsing -Method POST "$baseUrl/api/chat" `
  -Headers @{"Content-Type"="application/json"} `
  -Body $chatBody
$chat.Content | ConvertFrom-Json | Format-List

# 11. History
Write-Host "`n=== HISTORY ===" -ForegroundColor $green
$history = curl -UseBasicParsing "$baseUrl/api/history"
$historyData = $history.Content | ConvertFrom-Json
Write-Host "History entries: $(($historyData.history).Count)"
if ($historyData.history.Count -gt 0) {
    $historyData.history | Format-Table -Property action, timestamp
}

# 12. Curator Scan
Write-Host "`n=== CURATOR SCAN ===" -ForegroundColor $green
Try {
    $curator = Invoke-WebRequest -UseBasicParsing -Method POST "$baseUrl/api/curator/scan" -ErrorAction Stop
    $curator.Content | ConvertFrom-Json | Format-List
} Catch {
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Yellow
}

# 13. Canvas (optional test with first page)
Write-Host "`n=== CANVAS (Dashboard) ===" -ForegroundColor $green
$pageId = $pages2.pages[0].id
Try {
    $canvas = Invoke-WebRequest -UseBasicParsing "$baseUrl/api/pages/$pageId/canvas" -ErrorAction Stop
    $canvas.Content | ConvertFrom-Json | Format-List
} Catch {
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Yellow
}

Write-Host "`n================================" -ForegroundColor $blue
Write-Host "API Tests Complete!" -ForegroundColor $blue
