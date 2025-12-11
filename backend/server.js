const express = require("express");
const cors = require("cors");
const path = require("path");

console.log("SERVER: Starting server.js");

// -------------------------
// CREATE APP FIRST
// -------------------------
const app = express();
app.use(express.json({ limit: "10mb" }));
app.use(cors());

console.log("SERVER: Express app initialized");

// -------------------------
// AUTH MIDDLEWARE (AFTER app exists)
// -------------------------
const authJwt = require("./authJwt");
app.use(authJwt); 
console.log("SERVER: authJwt middleware enabled");

// -------------------------
// ROUTE IMPORTS
// -------------------------
const mailRoutes = require("./mail");
console.log("SERVER: Loaded mail.js");

const driveRoutes = require("./drive");
console.log("SERVER: Loaded drive.js");

const carbonRoutes = require("./carbonService");
console.log("SERVER: Loaded carbonService.js");

// -------------------------
// STATIC FILES
// -------------------------
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
console.log("SERVER: Static /uploads enabled");

// -------------------------
// ROUTE MOUNTS
// -------------------------
app.use("/api", mailRoutes);
console.log("SERVER: mail routes mounted at /api");

app.use("/api/drive", driveRoutes);
console.log("SERVER: drive routes mounted at /api/drive");

app.use("/api/carbon", carbonRoutes);
console.log("SERVER: carbon routes mounted at /api/carbon");

// -------------------------
// START SERVER
// -------------------------
app.listen(3000, "0.0.0.0", () =>
  console.log("🚀 Backend running on 0.0.0.0:3000")
);
