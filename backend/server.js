const express = require("express");
const cors = require("cors");
const path = require("path");

console.log("SERVER: Starting server.js");

const mailRoutes = require("./mail");
console.log("SERVER: Loaded mail.js");

const driveRoutes = require("./drive");
console.log("SERVER: Loaded drive.js");

// NEW carbon service route
const carbonRoutes = require("./carbonService");
console.log("SERVER: Loaded carbonService.js");

const authJwt = require('./authJwt');
app.use(authJwt); // must be before routes

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(cors());

// static files
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
console.log("SERVER: Static /uploads enabled");

// mount routes
app.use("/api", mailRoutes);
console.log("SERVER: mail routes mounted at /api");

app.use("/api/drive", driveRoutes);
console.log("SERVER: drive routes mounted at /api/drive");

// NEW: carbon route mount
app.use("/api/carbon", carbonRoutes);
console.log("SERVER: carbon routes mounted at /api/carbon");

app.listen(3000, "0.0.0.0", () =>
  console.log("🚀 Backend running on 0.0.0.0:3000")
);
