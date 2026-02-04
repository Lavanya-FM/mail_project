module.exports = {
  apps: [
    {
      name: "jeemail-backend",
      script: "server.js",
      cwd: "./",
      env: {
        NODE_ENV: "production"
      },
      max_memory_restart: "1024M",
      node_args: "--max-old-space-size=2048"
    }
  ]
};
