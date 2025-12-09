function sanitizeBody(raw) {
  if (!raw) return "";
  let s = String(raw).replace(/\r/g, "").replace(/\u00A0/g, " ");
  const lines = s.split("\n").map(l => l.trim());
  const filtered = lines.filter(line => line && !/^0+$/.test(line));
  return filtered.join("\n").trim();
}

function normalizeEmail(email) {
  return (email || "").trim().toLowerCase();
}

module.exports = { sanitizeBody, normalizeEmail };
