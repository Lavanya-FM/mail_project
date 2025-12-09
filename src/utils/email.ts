// src/utils/email.ts
export function normalizeEmailBody(raw: any): string {
  // Treat null/undefined as empty
  if (raw === null || typeof raw === "undefined") return "";

  // Ensure string
  let s = typeof raw === "string" ? raw : String(raw);

  // normalize newlines and non-breaking spaces, remove CR
  s = s.replace(/\r/g, "").replace(/\u00A0/g, " ");

  // Trim overall
  s = s.trim();

  // If the whole value is just digits of zero (e.g. "0", "00"), treat as empty
  if (/^0+$/.test(s)) return "";

  // Split into lines, trim each, remove empty / zero-only lines
  const lines = s.split("\n").map(l => l.trim()).filter(l => l && !/^0+$/.test(l));

  const out = lines.join("\n").trim();
  return out === "" ? "" : out;
}
