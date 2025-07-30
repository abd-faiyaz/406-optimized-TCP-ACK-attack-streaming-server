#!/bin/bash

# Demo script showing different ways to run the server

echo "🛡️ Optimistic ACK Attack Defense System - Server Startup Demo"
echo "============================================================="
echo

echo "Available startup options:"
echo

echo "1. 🔒 High Security Mode (Maximum Protection)"
echo "   npx tsx src/app.ts --defense-mode high"
echo "   - Aggressive attack detection"
echo "   - Low tolerance thresholds"
echo "   - 30-minute quarantine"
echo

echo "2. ⚖️  Medium Security Mode (Balanced - Default)"
echo "   npx tsx src/app.ts --defense-mode medium"
echo "   npx tsx src/app.ts  # (default)"
echo "   - Balanced protection and performance"
echo "   - Moderate thresholds"
echo "   - 10-minute quarantine"
echo

echo "3. 🚀 Low Security Mode (Performance Optimized)"
echo "   npx tsx src/app.ts --defense-mode low"
echo "   - Minimal protection overhead"
echo "   - Higher tolerance thresholds"
echo "   - 5-minute quarantine"
echo

echo "4. ⚠️  No Protection (Vulnerable - Testing Only)"
echo "   npx tsx src/app.ts --no-defense"
echo "   npx tsx src/app.ts --defense false"
echo "   - NO attack protection"
echo "   - For testing attack effectiveness"
echo "   - Performance baseline"
echo

echo "5. 🔧 Custom Configuration"
echo "   npx tsx src/app.ts --defense-mode high --port 8080"
echo "   npx tsx src/app.ts -dm medium -p 3001"
echo

echo "6. 📚 Help and Documentation"
echo "   npx tsx src/app.ts --help"
echo

echo "🧪 Testing Commands:"
echo "==================="
echo

echo "Normal request (should succeed):"
echo "curl http://localhost:3000/download/xl.dat"
echo

echo "Simulated attack (should be blocked if defense enabled):"
echo "curl -H 'X-Simulate-Attack: optimistic-ack' http://localhost:3000/download/xl.dat"
echo

echo "Check defense status:"
echo "curl http://localhost:3000/security/status"
echo

echo "View security metrics (if defense enabled):"
echo "curl http://localhost:3000/security/metrics | jq"
echo

echo "Real attack tool user agent (should be blocked):"
echo "curl -H 'User-Agent: OptimisticACK-Attack-Tool/1.0' http://localhost:3000/download/xl.dat"
echo

read -p "Press Enter to start server with default settings (medium security), or Ctrl+C to exit..."

echo
echo "Starting server with medium security mode..."
echo "npx tsx src/app.ts"
echo

npx tsx src/app.ts
