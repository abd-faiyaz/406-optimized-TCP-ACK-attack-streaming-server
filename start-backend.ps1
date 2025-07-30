# Start Backend Only with Virtual Environment
Write-Host "🛡️ Starting Python Backend Server..." -ForegroundColor Green

# Activate virtual environment
Write-Host "🔧 Activating virtual environment..." -ForegroundColor Yellow
& ".\venv\Scripts\Activate.ps1"

# Check if Python packages are installed
Write-Host "📦 Checking Python dependencies..." -ForegroundColor Yellow
python -c "import flask, flask_socketio" 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "📦 Installing Python dependencies..." -ForegroundColor Yellow
    pip install -r requirements.txt
}

# Start backend
Write-Host "🚀 Starting backend server with medium security..." -ForegroundColor Green
Set-Location "backend\src"

Write-Host ""
Write-Host "Available options:" -ForegroundColor Cyan
Write-Host "  python app.py --defense-mode high    # Maximum protection" -ForegroundColor White
Write-Host "  python app.py --defense-mode medium  # Balanced (default)" -ForegroundColor White  
Write-Host "  python app.py --defense-mode low     # Performance optimized" -ForegroundColor White
Write-Host "  python app.py --no-defense           # No protection (testing)" -ForegroundColor White
Write-Host ""

# Start with medium security by default
python app.py --defense-mode medium
