$body = @{
    message    = "Hello, this is a test message"
    model      = "google/gemma-3-27b-it:free"
    chat_id    = "test-$(Get-Random)"
    user_email = "test@demo.com"
} | ConvertTo-Json

Write-Host "Sending chat request..." -ForegroundColor Cyan
$response = Invoke-RestMethod -Uri "http://localhost:10001/chat" -Method Post -Body $body -ContentType "application/json"
Write-Host "Response received!" -ForegroundColor Green
$response | ConvertTo-Json -Depth 5

Write-Host "`nWaiting 2 seconds for background task to complete..." -ForegroundColor Yellow
Start-Sleep -Seconds 2

Write-Host "`nChecking token usage..." -ForegroundColor Cyan
$tokenUsage = Invoke-RestMethod -Uri "http://localhost:10001/api/dashboard/token-usage?time_range=24h" -Method Get
$tokenUsage | ConvertTo-Json -Depth 5
