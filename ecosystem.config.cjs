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
