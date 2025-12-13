// backend/authJwt.js

const jwt = require("jsonwebtoken");

// Public routes that DO NOT require JWT
const openRoutes = [
  "/api/login",
  "/api/register",
  "/api/email/create",
  "/api/emails",
  "/api/carbon/metrics",
  "/api/carbon/metrics/me"
];

module.exports = function (req, res, next) {
  // Skip JWT for open routes
  if (openRoutes.some((r) => req.path.startsWith(r))) {
    return next();
  }

  const authHeader = req.headers.authorization || "";

  // Skip if no token at all
if (!authHeader || !authHeader.startsWith("Bearer ")) {
  return next(); // or return 401
}

  const token = authHeader.replace("Bearer ", "").trim();
  if (!token) {
    return next();
  }

  try {
    const payload = jwt.verify(
      token,
      process.env.JWT_SECRET || "your_jwt_secret"
    );
    req.user = payload.user || payload;
  } catch (err) {
    console.warn("JWT verify failed:", err.message);
    // DO NOT block the request, just log
  }

  next();
};
