#!/bin/bash

echo "Setting up Optimistic TCP ACK Attack Project..."

# Check if running as root (required for raw sockets)
if [[ $EUID -ne 0 ]]; then
   echo "This script must be run as root for raw socket operations" 
   exit 1
fi

# Install system dependencies
apt-get update
apt-get install -y nodejs npm ffmpeg tcpdump wireshark-common libpcap-dev

# Install Node.js dependencies
echo "Installing backend dependencies..."
cd backend && npm install

echo "Installing frontend dependencies..."
cd ../frontend && npm install

echo "Installing client dependencies..."
cd ../clients/normal-client && npm install
cd ../malicious-client && npm install

echo "Installing monitoring dependencies..."
cd ../../monitoring && npm install

# Create necessary directories
mkdir -p data/files data/streams data/logs data/reports

# Generate sample files for testing
echo "Generating test files..."
dd if=/dev/zero of=data/files/small_file.bin bs=1M count=10
dd if=/dev/zero of=data/files/medium_file.bin bs=1M count=100
dd if=/dev/zero of=data/files/large_file.bin bs=1M count=500

# Set up network capabilities (for raw sockets)
setcap cap_net_raw=ep $(which node)

echo "Setup complete!"
echo ""
echo "To start the project:"
echo "1. Start the server: ./scripts/start-server.sh"
echo "2. Open browser to http://localhost:3000"
echo "3. Run clients: ./scripts/start-clients.sh"
echo ""
echo "Note: Ensure you're in an isolated network environment for testing"
