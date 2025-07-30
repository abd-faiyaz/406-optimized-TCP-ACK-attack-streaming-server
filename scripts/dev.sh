# scripts/dev.sh
#!/bin/bash

# Function to cleanup background processes
cleanup() {
    echo "Cleaning up background processes..."
    kill $(jobs -p) 2>/dev/null || true
    exit 0
}

# Set trap for cleanup
trap cleanup SIGINT SIGTERM

echo "Starting development environment..."

# Start backend in development mode
cd backend && npm run dev &
BACKEND_PID=$!

# Wait for backend to start
sleep 5

# Start frontend in development mode
cd ../frontend && npm run dev &
FRONTEND_PID=$!

# Start monitoring services
cd ../monitoring && npm run dev &
MONITORING_PID=$!

echo "All services started!"
echo "Frontend: http://localhost:3000"
echo "Backend API: http://localhost:3001"
echo "Streaming Server: http://localhost:8080"
echo ""
echo "Press Ctrl+C to stop all services"

# Wait for any background job to finish
wait