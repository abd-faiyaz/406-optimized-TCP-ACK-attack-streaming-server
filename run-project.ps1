# Run Optimistic ACK Attack Project
# This script runs the full project using the existing virtual environment

Write-Host "Starting Optimistic ACK Attack Project" -ForegroundColor Green
Write-Host "======================================" -ForegroundColor Green

# Check if virtual environment exists
if (!(Test-Path ".\venv\Scripts\Activate.ps1")) {
    Write-Host "Virtual environment not found at .\venv" -ForegroundColor Red
    Write-Host "Please create virtual environment first" -ForegroundColor Yellow
    exit 1
}

# Activate virtual environment
Write-Host "Activating virtual environment..." -ForegroundColor Yellow
& ".\venv\Scripts\Activate.ps1"

# Check and install Python dependencies
Write-Host "Checking Python dependencies..." -ForegroundColor Yellow
python -c "import flask, flask_socketio" 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "Installing Python dependencies..." -ForegroundColor Yellow
    pip install -r requirements.txt
}

# Install Node.js dependencies for frontend
Write-Host "Installing frontend dependencies..." -ForegroundColor Yellow
Set-Location "frontend"
if (!(Test-Path "node_modules")) {
    npm install
}
Set-Location ".."

# Start backend in new window
Write-Host "Starting Python backend server..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd 'D:\Optimistic-Ack-Attack'; .\venv\Scripts\Activate.ps1; cd backend\src; python app.py --defense-mode medium"

# Wait a moment then start frontend in new window
Start-Sleep 3
Write-Host "Starting React frontend..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd 'D:\Optimistic-Ack-Attack\frontend'; npm run dev"

Write-Host ""
Write-Host "Project is starting up!" -ForegroundColor Green
Write-Host "Backend API: http://localhost:3001" -ForegroundColor Cyan
Write-Host "Frontend: http://localhost:5173" -ForegroundColor Cyan
Write-Host "Security Status: http://localhost:3001/security/status" -ForegroundColor Cyan
Write-Host ""
Write-Host "Test the defense system:" -ForegroundColor Yellow
Write-Host 'curl -H "X-Simulate-Attack: optimistic-ack" http://localhost:3001/download/xl.dat' -ForegroundColor White
Write-Host ""
Write-Host "Press Ctrl+C in the terminal windows to stop the servers" -ForegroundColor Yellow