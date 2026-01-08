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

// ✅ Email format validation (RFC 5322 compliant)
function isValidEmailFormat(email) {
  if (!email || typeof email !== 'string') return false;
  
  // Basic format check: local@domain
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  
  if (!emailRegex.test(email)) return false;
  
  // Additional checks
  const parts = email.split('@');
  if (parts.length !== 2) return false;
  
  const [localPart, domain] = parts;
  
  // Local part validation (before @)
  if (localPart.length === 0 || localPart.length > 64) return false;
  if (localPart.startsWith('.') || localPart.endsWith('.')) return false;
  if (localPart.includes('..')) return false; // No consecutive dots
  
  // Domain validation (after @)
  if (domain.length === 0 || domain.length > 255) return false;
  if (domain.startsWith('.') || domain.endsWith('.')) return false;
  if (domain.includes('..')) return false; // No consecutive dots
  
  // Domain must have at least one dot
  if (!domain.includes('.')) return false;
  
  // Check for valid TLD (at least 2 characters)
  const domainParts = domain.split('.');
  const tld = domainParts[domainParts.length - 1];
  if (tld.length < 2) return false;
  
  return true;
}

module.exports = { sanitizeBody, normalizeEmail, isValidEmailFormat };
