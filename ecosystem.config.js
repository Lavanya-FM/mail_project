module.exports = {
  apps: [
    {
      name: "jeemail-backend",
      script: "server.js",
      cwd: "./",
      env: {
        NODE_ENV: "production"
      }
    }
  ]
};
