#!/bin/bash

# Configuration
SERVER_USER="ubuntu"
SERVER_IP="51.79.231.85"
SERVER_PATH="/home/ubuntu/Mail_Project"

echo "🚀 Starting Deployment to $SERVER_IP..."

# 1. Build Frontend
echo "📦 Building Frontend..."
rm -rf dist
npm run build
if [ $? -ne 0 ]; then
    echo "❌ Build failed. Aborting."
    exit 1
fi

# 2. Transfer Files
echo "📤 Transferring files to server..."
# Exclude node_modules, .git, and other unnecessary files
rsync -avz --exclude 'node_modules' --exclude '.git' --exclude '.env' \
    ./dist \
    ./backend \
    ./package.json \
    $SERVER_USER@$SERVER_IP:$SERVER_PATH

# 3. Restart Server (Assuming PM2)
echo "🔄 Restarting Server..."
ssh $SERVER_USER@$SERVER_IP "cd $SERVER_PATH && npm install --production && cd backend && npm install --production && pm2 restart jeemail-backend"

echo "✅ Deployment Complete!"
