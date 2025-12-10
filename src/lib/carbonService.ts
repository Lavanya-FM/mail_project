// src/lib/carbonService.ts
// Carbon calculation + badges + gamification helpers for ThreadShare / JeeMail UI

export interface CarbonMetrics {
  storageSavedGB: number;           // GB-month
  dataTransferReducedGB: number;    // GB
  storageCO2eKg: number;
  transferCO2eKg: number;
  totalCO2eSavedKg: number;
  // numeric values
  carbonCredits: number;            // legacy numeric (high-precision)
  carbonCreditsEarned: number;      // canonical numeric field (high-precision)
  // gamification
  gamifiedPoints: number;
}

export interface CarbonBadgeTier {
  tier: string;
  minCredits: number;
  maxCredits: number;
  color: string;
  icon: string;
  description: string;
}

// --- Emission factors (tunable) ---
const EMISSION_FACTORS = {
  STORAGE_KG_PER_GB_MONTH: 0.0003, // kg CO2e per GB-month (default used in backend)
  NETWORK_INTERNET_KG_PER_GB: 0.02, // kg CO2e per GB transferred (default used in backend)
  NETWORK_MOBILE_KG_PER_GB: 0.1,
  NETWORK_WIFI_KG_PER_GB: 0.0005,
};

// --- Badge tiers (copy / update to taste) ---
export const CARBON_BADGE_TIERS: CarbonBadgeTier[] = [
  { tier: 'Bronze 1', minCredits: 0, maxCredits: 0.15, color: 'from-amber-600 to-amber-700', icon: '🥉', description: 'Just started your carbon journey' },
  { tier: 'Bronze 2', minCredits: 0.15, maxCredits: 0.3, color: 'from-amber-700 to-amber-800', icon: '🥉', description: 'Building your carbon savings' },
  { tier: 'Bronze 3', minCredits: 0.3, maxCredits: 0.5, color: 'from-amber-800 to-yellow-700', icon: '🥉', description: 'Bronze mastery achieved' },

  { tier: 'Silver 1', minCredits: 0.5, maxCredits: 0.9, color: 'from-gray-300 to-gray-400', icon: '🥈', description: 'Silver contributor' },
  { tier: 'Silver 2', minCredits: 0.9, maxCredits: 1.4, color: 'from-gray-400 to-gray-500', icon: '🥈', description: 'Silver specialist' },
  { tier: 'Silver 3', minCredits: 1.4, maxCredits: 2, color: 'from-gray-500 to-slate-600', icon: '🥈', description: 'Silver master' },

  { tier: 'Gold 1', minCredits: 2, maxCredits: 2.8, color: 'from-yellow-400 to-yellow-500', icon: '🏆', description: 'Gold tier contributor' },
  { tier: 'Gold 2', minCredits: 2.8, maxCredits: 3.8, color: 'from-yellow-500 to-yellow-600', icon: '🏆', description: 'Gold specialist' },
  { tier: 'Gold 3', minCredits: 3.8, maxCredits: 5, color: 'from-yellow-600 to-amber-600', icon: '🏆', description: 'Gold master' },

  { tier: 'Platinum 1', minCredits: 5, maxCredits: 6.5, color: 'from-cyan-300 to-cyan-400', icon: '💎', description: 'Platinum pioneer' },
  { tier: 'Platinum 2', minCredits: 6.5, maxCredits: 8, color: 'from-cyan-400 to-cyan-500', icon: '💎', description: 'Platinum specialist' },
  { tier: 'Platinum 3', minCredits: 8, maxCredits: 10, color: 'from-cyan-500 to-blue-500', icon: '💎', description: 'Platinum master' },

  { tier: 'Diamond 1', minCredits: 10, maxCredits: 13, color: 'from-blue-300 to-blue-400', icon: '💠', description: 'Diamond contributor' },
  { tier: 'Diamond 2', minCredits: 13, maxCredits: 16, color: 'from-blue-400 to-blue-500', icon: '💠', description: 'Diamond specialist' },
  { tier: 'Diamond 3', minCredits: 16, maxCredits: 20, color: 'from-blue-500 to-indigo-600', icon: '💠', description: 'Diamond master' },

  { tier: 'Ace 1', minCredits: 20, maxCredits: 26, color: 'from-purple-400 to-purple-500', icon: '🎯', description: 'Ace champion' },
  { tier: 'Ace 2', minCredits: 26, maxCredits: 33, color: 'from-purple-500 to-purple-600', icon: '🎯', description: 'Ace master' },
  { tier: 'Ace 3', minCredits: 33, maxCredits: 40, color: 'from-purple-600 to-indigo-700', icon: '🎯', description: 'Ace legend' },

  { tier: 'Ace Master 1', minCredits: 40, maxCredits: 60, color: 'from-red-500 to-pink-500', icon: '👑', description: 'Ace Master - Environmental Champion' },
  { tier: 'Ace Master 2', minCredits: 60, maxCredits: 100, color: 'from-pink-500 to-rose-600', icon: '👑', description: 'Ace Master - Carbon Warrior' },
  { tier: 'Ace Master 3', minCredits: 100, maxCredits: Infinity, color: 'from-rose-600 to-red-700', icon: '👑', description: 'Ace Master - Planet Guardian' },
];

// --- Calculation helpers ---

/**
 * Storage savings (kg CO₂e) from GB-months saved.
 */
export function calculateStorageSavings(storageSavedGB: number, factorKgPerGbMonth = EMISSION_FACTORS.STORAGE_KG_PER_GB_MONTH): number {
  return Number(storageSavedGB || 0) * factorKgPerGbMonth;
}

/**
 * Data transfer savings (kg CO₂e) from GB transferred avoided.
 */
export function calculateDataTransferSavings(
  dataTransferGB: number,
  networkType: 'internet' | 'mobile' | 'wifi' = 'internet'
): number {
  let factor = EMISSION_FACTORS.NETWORK_INTERNET_KG_PER_GB;
  if (networkType === 'mobile') factor = EMISSION_FACTORS.NETWORK_MOBILE_KG_PER_GB;
  if (networkType === 'wifi') factor = EMISSION_FACTORS.NETWORK_WIFI_KG_PER_GB;
  return Number(dataTransferGB || 0) * factor;
}

/**
 * Total CO₂e saved (kg) from storage + transfer.
 */
export function calculateTotalCO2eSavings(
  storageSavedGB: number,
  dataTransferReducedGB: number,
  networkType: 'internet' | 'mobile' | 'wifi' = 'internet'
): { storageCO2eKg: number; transferCO2eKg: number; totalCO2eSavedKg: number } {
  const storageCO2eKg = calculateStorageSavings(storageSavedGB);
  const transferCO2eKg = calculateDataTransferSavings(dataTransferReducedGB, networkType);
  const totalCO2eSavedKg = storageCO2eKg + transferCO2eKg;
  return { storageCO2eKg, transferCO2eKg, totalCO2eSavedKg };
}

/**
 * Convert kg CO₂e → carbon credits (1 credit = 1000 kg CO₂e)
 */
export function calculateCarbonCredits(totalCO2eKg: number, kgPerCredit = 1000): number {
  return Number(totalCO2eKg || 0) / Number(kgPerCredit || 1000);
}

/**
 * Calculate full metrics object. `mode` accepts:
 * - 'realistic' (no multiplier)
 * - 'medium' (small UX multiplier)
 * - 'gamified' (larger UX multiplier)
 *
 * Mode only affects the returned metrics (frontend / gamification). Production ledger / submission should
 * use canonical backend metrics (backend already supports `mode` query param).
 */
export function calculateCarbonMetrics(
  storageSavedGB: number,
  dataTransferReducedGB: number,
  networkType: 'internet' | 'mobile' | 'wifi' = 'internet',
  mode: 'realistic' | 'medium' | 'gamified' = 'realistic'
): CarbonMetrics {
  const { storageCO2eKg, transferCO2eKg, totalCO2eSavedKg } = calculateTotalCO2eSavings(
    storageSavedGB,
    dataTransferReducedGB,
    networkType
  );

  // UX multipliers: keep numeric unchanged at 'realistic'
  let multiplier = 1;
  if (mode === 'medium') multiplier = 5;
  if (mode === 'gamified') multiplier = 10;

  const adjustedKg = totalCO2eSavedKg * multiplier;
  const rawCredits = calculateCarbonCredits(adjustedKg);

  // canonical numeric fields
  const carbonCredits = Number(rawCredits.toFixed(8));          // legacy numeric with precision
  const carbonCreditsEarned = carbonCredits;                   // canonical name used by UI / badges

  // gamified points scaling: integer points shown in UI
  // default conversion: 1 point = 0.001 credit (so points = credits * 1000)
  const gamifiedPoints = Math.round(carbonCredits * 1000);

  return {
    storageSavedGB: Number(storageSavedGB || 0),
    dataTransferReducedGB: Number(dataTransferReducedGB || 0),
    storageCO2eKg,
    transferCO2eKg,
    totalCO2eSavedKg,
    carbonCredits,
    carbonCreditsEarned,
    gamifiedPoints,
  };
}

// --- Badge helpers ---

/**
 * Returns badge tier object for numeric credits.
 */
export function getBadgeTierForCredits(credits: number): CarbonBadgeTier {
  const t = CARBON_BADGE_TIERS.find((x) => credits >= x.minCredits && credits < x.maxCredits);
  return t || CARBON_BADGE_TIERS[0];
}

/**
 * Get the next tier after current credits (if any).
 */
export function getNextBadgeTier(credits: number): CarbonBadgeTier | null {
  const idx = CARBON_BADGE_TIERS.findIndex((x) => credits >= x.minCredits && credits < x.maxCredits);
  if (idx === -1 || idx === CARBON_BADGE_TIERS.length - 1) return null;
  return CARBON_BADGE_TIERS[idx + 1];
}

/**
 * Progress to next tier (current credits numeric).
 */
export function getProgressToNextTier(credits: number): { current: number; next: number; percentage: number } {
  const currentTier = getBadgeTierForCredits(credits);
  const nextTier = getNextBadgeTier(credits);
  if (!nextTier) {
    return { current: credits, next: currentTier.maxCredits, percentage: 100 };
  }
  const range = nextTier.minCredits - currentTier.minCredits;
  const inRange = credits - currentTier.minCredits;
  const pct = Math.min(Math.max((inRange / range) * 100, 0), 100);
  return { current: credits, next: nextTier.minCredits, percentage: pct };
}

// --- Formatting utilities ---

/**
 * Format carbon credits for display.
 * Always returns a string suffixed with " credits".
 * Behavior:
 *  - Very small values: 8 decimals
 *  - Small values: 4-3 decimals
 *  - Larger values: 2 decimals
 */
export function formatCarbonCredits(credits: number): string {
  const c = Number(credits || 0);

  // Ensure we show very small numbers with 8 decimals as requested
  if (c === 0) return '0.00000000 credits';
  if (c < 0.0001) return `${c.toFixed(8)} credits`;
  if (c < 0.01) return `${c.toFixed(4)} credits`;
  if (c < 0.1) return `${c.toFixed(3)} credits`;
  if (c < 1) return `${c.toFixed(2)} credits`;
  return `${c.toFixed(2)} credits`;
}

/**
 * Format CO₂e savings for display (kg / tons)
 */
export function formatCO2eSavings(kg: number): string {
  const k = Number(kg || 0);
  if (k < 1) return `${k.toFixed(6)} kg`;      // show micro amounts
  if (k < 1000) return `${k.toFixed(3)} kg`;
  return `${(k / 1000).toFixed(2)} tons`;
}

// --- Gamification mapping helpers ---

/**
 * Convert gamified points to credits (inverse of points = round(credits * 1000)).
 * Default mapping: credits = points / 1000
 */
export function gamifiedPointsToCredits(points: number): number {
  return Number(points || 0) / 1000;
}

/**
 * Given gamified points, return a badge tier (maps points → credits → tier).
 */
export function getBadgeForGamifiedPoints(points: number): CarbonBadgeTier {
  const credits = gamifiedPointsToCredits(points);
  return getBadgeTierForCredits(credits);
}

// --- Exports (already covered above) ---
export default {
  calculateStorageSavings,
  calculateDataTransferSavings,
  calculateTotalCO2eSavings,
  calculateCarbonCredits,
  calculateCarbonMetrics,
  getBadgeTierForCredits,
  getNextBadgeTier,
  getProgressToNextTier,
  formatCarbonCredits,
  formatCO2eSavings,
  gamifiedPointsToCredits,
  getBadgeForGamifiedPoints,
  CARBON_BADGE_TIERS,
};
