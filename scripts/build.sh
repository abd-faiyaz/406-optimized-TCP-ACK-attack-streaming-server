# scripts/build.sh
#!/bin/bash

set -e

echo "Building Optimistic TCP ACK Attack Project..."

# Clean previous builds
echo "Cleaning previous builds..."
npx lerna clean --yes
rm -rf */dist */build

# Install dependencies
echo "Installing dependencies..."
npx lerna bootstrap --hoist

# Build all packages
echo "Building all packages..."
npx lerna run build --stream

# Build Docker images
echo "Building Docker images..."
docker build -f docker/Dockerfile.server -t tcp-attack-server .
docker build -f docker/Dockerfile.client -t tcp-attack-client .
docker build -f docker/Dockerfile.monitoring -t tcp-attack-monitoring .

echo "Build completed successfully!"