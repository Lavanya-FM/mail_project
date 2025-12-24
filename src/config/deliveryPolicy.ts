export const DELIVERY_POLICY = {
  // Gmail-accurate SMTP limits
  SMTP_SAFE_RAW_BYTES: 18 * 1024 * 1024, // 18 MB (base64-safe)
  SMTP_HARD_LIMIT: 25 * 1024 * 1024,     // never exceed

  // P2P switching
  P2P_MIN_BYTES: 5 * 1024 * 1024,        // start preferring P2P
  MAX_FILES_P2P: 20,
};
