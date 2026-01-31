#!/bin/bash
set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== Starting Deployment Process ===${NC}"

# 1. Check Pre-requisites
echo -e "${YELLOW}Step 1: Checking Pre-requisites...${NC}"
if ! command -v node &> /dev/null; then
    echo -e "${RED}Error: Node.js is not installed.${NC}"
    exit 1
fi

if ! command -v mysql &> /dev/null; then
    echo -e "${YELLOW}Warning: MySQL is not found in PATH. Ensure database 'maildb' exists.${NC}"
fi

if ! command -v redis-server &> /dev/null; then
    echo -e "${YELLOW}Warning: Redis is not found in PATH. P2P features might fail.${NC}"
fi

# 2. Install Frontend Dependencies & Build
echo -e "${YELLOW}Step 2: Building Frontend...${NC}"
npm install
npm run build
if [ ! -d "dist" ]; then
    echo -e "${RED}Error: Frontend build failed. 'dist' directory not found.${NC}"
    exit 1
fi
echo -e "${GREEN}Frontend built successfully.${NC}"

# 3. Install Backend Dependencies
echo -e "${YELLOW}Step 3: Installing Backend Dependencies...${NC}"
cd backend
npm install
cd ..

# 4. Setup Environment Variables
echo -e "${YELLOW}Step 4: Setting up Environment...${NC}"
if [ ! -f "backend/.env" ]; then
    echo "Creating backend/.env with default values..."
    cat > backend/.env << EOL
PORT=3000
NODE_ENV=production
JWT_SECRET=$(openssl rand -hex 32)
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
# SMTP Config (Update these for real emails)
# SMTP_HOST=smtp.gmail.com
# SMTP_PORT=587
# SMTP_USER=your_email
# SMTP_PASS=your_password
EOL
    echo -e "${GREEN}Created backend/.env${NC}"
else
    echo "backend/.env already exists."
fi

# 5. Fix PM2 Config (if needed)
# We update the cwd in ecosystem.config.js to the current directory dynamically or suggest usage
PWD=$(pwd)
SERVER_PATH="$PWD/backend"

# Create a local ecosystem config if desired, or just print instructions
# Create a local ecosystem config if desired, or just print instructions
cat > ecosystem.config.cjs << EOL
module.exports = {
  apps: [
    {
      name: "jeemail-backend",
      script: "./backend/server.js",
      env: {
        NODE_ENV: "production",
        PORT: 3000
      }
    }
  ]
};
EOL

echo -e "${GREEN}=== Deployment Preparation Complete ===${NC}"
echo -e "To start the application, run:"
echo -e "  ${YELLOW}pm2 start ecosystem.config.cjs${NC}"
echo -e "or"
echo -e "  ${YELLOW}node backend/server.js${NC}"
echo ""
echo -e "Make sure MySQL user 'mailuser' with password 'StrongPassword123!' and DB 'maildb' exists."
