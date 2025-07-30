# scripts/deploy.sh
#!/bin/bash

set -e

echo "Deploying to production environment..."

# Build production images
docker-compose -f docker/docker-compose.prod.yml build

# Stop existing containers
docker-compose -f docker/docker-compose.prod.yml down

# Start new containers
docker-compose -f docker/docker-compose.prod.yml up -d

# Wait for services to be healthy
echo "Waiting for services to be ready..."
sleep 30

# Run health checks
curl -f http://localhost:3001/health || exit 1
curl -f http://localhost:8080/health || exit 1

echo "Deployment completed successfully!"