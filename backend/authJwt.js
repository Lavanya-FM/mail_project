// backend/authJwt.js
const jwt = require('jsonwebtoken');
module.exports = function(req, res, next) {
  const auth = req.headers.authorization || '';
  const m = auth.match(/^Bearer\s+(.+)$/);
  if (!m) return next();
  const token = m[1];
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'your_jwt_secret');
    req.user = payload.user || payload; // adapt to your token shape
  } catch (e) {
    console.warn('JWT verify failed', e.message);
  }
  return next();
};
