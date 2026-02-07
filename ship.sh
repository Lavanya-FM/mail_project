#!/bin/bash
set -e

SERVER_IP="51.79.231.85"
USER="ubuntu"
DEST_DIR="/home/ubuntu/Mail_Project"

echo "=== 🚀 Shipping to Production ($SERVER_IP) ==="

# 1. Build Local
echo "Step 1: Cleaning & Building locally..."
rm -rf dist
npm install
npm run build

# 2. Sync Files (using rsync if available, otherwise scp)
echo "Step 2: Uploading files..."
echo "  - Cleaning remote dist folder..."
ssh $USER@$SERVER_IP "rm -rf $DEST_DIR/dist"
if command -v rsync &> /dev/null; then
    rsync -avz --exclude 'node_modules' --exclude '.env' --exclude '.git' --exclude 'dist' ./backend $USER@$SERVER_IP:$DEST_DIR/
    rsync -avz --delete ./dist $USER@$SERVER_IP:$DEST_DIR/
    rsync -avz ./package.json $USER@$SERVER_IP:$DEST_DIR/
    rsync -avz ./ecosystem.config.js $USER@$SERVER_IP:$DEST_DIR/
else
    echo "rsync not found, using scp (slower)..."
    scp -r dist backend package.json ecosystem.config.js $USER@$SERVER_IP:$DEST_DIR/
fi

# 3. Restart Remote
echo "Step 3: Restarting remote service..."
ssh $USER@$SERVER_IP "source ~/.nvm/nvm.sh; cd $DEST_DIR && npm install --production && cd backend && npm install --production && pm2 restart jeemail-backend || ((pm2 start ecosystem.config.js) || node backend/server.js)"

echo "=== ✅ Deployment Complete ==="
