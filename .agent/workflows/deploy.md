---
description: Deploy the Jeemail application to a server
---

This workflow automates the deployment process, including building the frontend and preparing the backend.

1. **Prerequisites**:
   - Node.js (v18+)
   - MySQL (Database `maildb`, User `mailuser`, Pass `StrongPassword123!`)
   - Redis Server (default port)

2. **Run Deployment Script**:
   The `deploy.sh` script handles dependency installation, frontend building, and configuration.

   ```bash
   ./deploy.sh
   ```

3. **Start Application**:
   Use PM2 to manage the node process:

   ```bash
   npm install -g pm2
   pm2 start ecosystem.config.js
   pm2 save
   pm2 startup
   ```

4. **Verify**:
   Access the application at `http://YOUR_SERVER_IP:3000`.
