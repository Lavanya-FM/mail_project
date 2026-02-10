#!/bin/bash
set -e

echo "Starting deployment..."

# 1. Install dependencies
npm install

# 2. Build Frontend
echo "Cleaning previous build..."
rm -rf dist

echo "Building frontend..."
npm run build

# 3. Restart Backend
echo "Restarting backend..."
npx pm2 restart jeemail-backend || npx pm2 start ecosystem.config.cjs

echo "Deployment complete!"
