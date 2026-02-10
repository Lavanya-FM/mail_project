#!/bin/bash
set -e

SERVER_IP="51.79.231.85"
USER="ubuntu"
DEST_DIR="/home/ubuntu/Mail_Project"

echo "=== 🚀 Shipping to Production ($SERVER_IP) ==="

# 1. Build Local
echo "Step 1: Cleaning..."
rm -rf dist

echo "Step 2: Installing & Building..."
npm install
npm run build

# 2. Sync Files (using rsync if available, otherwise scp)
echo "Step 3: Uploading files to server..."

# Create directory if not exists
ssh -o StrictHostKeyChecking=no $USER@$SERVER_IP "mkdir -p $DEST_DIR"

if command -v rsync &> /dev/null; then
    # Sync backend (excluding node_modules and version control)
    rsync -avz --exclude 'node_modules' --exclude '.env' --exclude '.git' ./backend $USER@$SERVER_IP:$DEST_DIR/
    
    # Sync public/dist folder
    rsync -avz --delete ./dist $USER@$SERVER_IP:$DEST_DIR/
    
    # Sync root configs
    rsync -avz ./package.json $USER@$SERVER_IP:$DEST_DIR/
    rsync -avz ./ecosystem.config.cjs $USER@$SERVER_IP:$DEST_DIR/
else
    echo "rsync not found, using scp (slower)..."
    # Fallback SCP
    scp -r dist backend package.json ecosystem.config.cjs $USER@$SERVER_IP:$DEST_DIR/
fi

# 3. Restart Remote
echo "Step 4: Restarting remote service..."
ssh -o StrictHostKeyChecking=no $USER@$SERVER_IP "
  source ~/.nvm/nvm.sh || source ~/.bashrc; 
  cd $DEST_DIR && 
  npm install --production --force && 
  cd backend && 
  npm install --production --force && 
  cd .. &&
  (pm2 restart jeemail-backend || pm2 start ecosystem.config.cjs --env production) &&
  pm2 save
"

echo "=== ✅ Deployment Complete ==="
