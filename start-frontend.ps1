# Start Frontend Only
Write-Host "🌐 Starting React Frontend..." -ForegroundColor Green

# Check if node_modules exists
Set-Location "frontend"
if (!(Test-Path "node_modules")) {
    Write-Host "📦 Installing dependencies..." -ForegroundColor Yellow
    npm install
}

Write-Host "🚀 Starting development server..." -ForegroundColor Green
npm run dev