module.exports = {
  apps: [
    {
      name: "jeemail-backend",
      script: "server.js",
      cwd: "/home/ubuntu/Mail_Project/backend",
      env: {
        NODE_ENV: "production"
      }
    }
  ]
};
