/**
 * Carbon Credit Calculation Service
 * Calculates CO2e savings from reduced cloud storage and data transfer
 */

export interface CarbonMetrics {
  storageSavedGB: number; // GB-month
  dataTransferReducedGB: number; // GB
  totalCO2eSavedKg: number;
  carbonCreditsEarned: number;
}

export interface CarbonBadgeTier {
  tier: string;
  minCredits: number;
  maxCredits: number;
  color: string;
  icon: string;
  description: string;
}

// Emission factors based on industry standards
const EMISSION_FACTORS = {
  STORAGE: 0.001, // kg CO2e per GB-month (can vary 0.0003 - 0.0010)
  NETWORK_INTERNET: 0.01, // kg CO2e per GB (average of 0.005 - 0.02)
  NETWORK_MOBILE: 0.1, // kg CO2e per GB (average of 0.05 - 0.2)
  NETWORK_WIFI: 0.0005, // kg CO2e per GB (average of 0.001 - 0.0001)
};

// Carbon badge tiers with 3 sub-tiers each
export const CARBON_BADGE_TIERS: CarbonBadgeTier[] = [
  // Bronze Tier (0 - 0.5 credits)
  { tier: 'Bronze 1', minCredits: 0, maxCredits: 0.15, color: 'from-amber-600 to-amber-700', icon: '🥉', description: 'Just started your carbon journey' },
  { tier: 'Bronze 2', minCredits: 0.15, maxCredits: 0.3, color: 'from-amber-700 to-amber-800', icon: '🥉', description: 'Building your carbon savings' },
  { tier: 'Bronze 3', minCredits: 0.3, maxCredits: 0.5, color: 'from-amber-800 to-yellow-700', icon: '🥉', description: 'Bronze mastery achieved' },

  // Silver Tier (0.5 - 2 credits)
  { tier: 'Silver 1', minCredits: 0.5, maxCredits: 0.9, color: 'from-gray-300 to-gray-400', icon: '🥈', description: 'Silver contributor' },
  { tier: 'Silver 2', minCredits: 0.9, maxCredits: 1.4, color: 'from-gray-400 to-gray-500', icon: '🥈', description: 'Silver specialist' },
  { tier: 'Silver 3', minCredits: 1.4, maxCredits: 2, color: 'from-gray-500 to-slate-600', icon: '🥈', description: 'Silver master' },

  // Gold Tier (2 - 5 credits)
  { tier: 'Gold 1', minCredits: 2, maxCredits: 2.8, color: 'from-yellow-400 to-yellow-500', icon: '🏆', description: 'Gold tier contributor' },
  { tier: 'Gold 2', minCredits: 2.8, maxCredits: 3.8, color: 'from-yellow-500 to-yellow-600', icon: '🏆', description: 'Gold specialist' },
  { tier: 'Gold 3', minCredits: 3.8, maxCredits: 5, color: 'from-yellow-600 to-amber-600', icon: '🏆', description: 'Gold master' },

  // Platinum Tier (5 - 10 credits)
  { tier: 'Platinum 1', minCredits: 5, maxCredits: 6.5, color: 'from-cyan-300 to-cyan-400', icon: '💎', description: 'Platinum pioneer' },
  { tier: 'Platinum 2', minCredits: 6.5, maxCredits: 8, color: 'from-cyan-400 to-cyan-500', icon: '💎', description: 'Platinum specialist' },
  { tier: 'Platinum 3', minCredits: 8, maxCredits: 10, color: 'from-cyan-500 to-blue-500', icon: '💎', description: 'Platinum master' },

  // Diamond Tier (10 - 20 credits)
  { tier: 'Diamond 1', minCredits: 10, maxCredits: 13, color: 'from-blue-300 to-blue-400', icon: '💠', description: 'Diamond contributor' },
  { tier: 'Diamond 2', minCredits: 13, maxCredits: 16, color: 'from-blue-400 to-blue-500', icon: '💠', description: 'Diamond specialist' },
  { tier: 'Diamond 3', minCredits: 16, maxCredits: 20, color: 'from-blue-500 to-indigo-600', icon: '💠', description: 'Diamond master' },

  // Ace Tier (20 - 40 credits)
  { tier: 'Ace 1', minCredits: 20, maxCredits: 26, color: 'from-purple-400 to-purple-500', icon: '🎯', description: 'Ace champion' },
  { tier: 'Ace 2', minCredits: 26, maxCredits: 33, color: 'from-purple-500 to-purple-600', icon: '🎯', description: 'Ace master' },
  { tier: 'Ace 3', minCredits: 33, maxCredits: 40, color: 'from-purple-600 to-indigo-700', icon: '🎯', description: 'Ace legend' },

  // Ace Master Tier (40+ credits)
  { tier: 'Ace Master 1', minCredits: 40, maxCredits: 60, color: 'from-red-500 to-pink-500', icon: '👑', description: 'Ace Master - Environmental Champion' },
  { tier: 'Ace Master 2', minCredits: 60, maxCredits: 100, color: 'from-pink-500 to-rose-600', icon: '👑', description: 'Ace Master - Carbon Warrior' },
  { tier: 'Ace Master 3', minCredits: 100, maxCredits: Infinity, color: 'from-rose-600 to-red-700', icon: '👑', description: 'Ace Master - Planet Guardian' },
];

/**
 * Calculate CO2e saved from storage reduction
 * Formula: CO₂e Saved (kg) = Storage Saved (GB-month) × Emission Factor
 */
export function calculateStorageSavings(storageSavedGB: number, emissionFactor: number = EMISSION_FACTORS.STORAGE): number {
  return storageSavedGB * emissionFactor;
}

/**
 * Calculate CO2e saved from data transfer reduction
 * Formula: CO₂e Saved (kg) = Data Transfer Reduced (GB) × Network Emission Factor
 */
export function calculateDataTransferSavings(
  dataTransferGB: number,
  networkType: 'internet' | 'mobile' | 'wifi' = 'internet'
): number {
  let factor = EMISSION_FACTORS.NETWORK_INTERNET;
  
  if (networkType === 'mobile') {
    factor = EMISSION_FACTORS.NETWORK_MOBILE;
  } else if (networkType === 'wifi') {
    factor = EMISSION_FACTORS.NETWORK_WIFI;
  }
  
  return dataTransferGB * factor;
}

/**
 * Calculate total CO2e savings from both storage and data transfer
 */
export function calculateTotalCO2eSavings(
  storageSavedGB: number,
  dataTransferReducedGB: number,
  networkType: 'internet' | 'mobile' | 'wifi' = 'internet'
): number {
  const storageSavings = calculateStorageSavings(storageSavedGB);
  const dataSavings = calculateDataTransferSavings(dataTransferReducedGB, networkType);
  return storageSavings + dataSavings;
}

/**
 * Convert CO2e savings to carbon credits
 * Formula: Carbon Credits = Total CO₂e Saved (kg) / 1000
 * (1 carbon credit = 1 ton of CO₂e = 1000 kg)
 */
export function calculateCarbonCredits(totalCO2eSavingsKg: number): number {
  return totalCO2eSavingsKg / 1000;
}

/**
 * Calculate complete carbon metrics
 */
export function calculateCarbonMetrics(
  storageSavedGB: number,
  dataTransferReducedGB: number,
  networkType: 'internet' | 'mobile' | 'wifi' = 'internet'
): CarbonMetrics {
  const totalCO2eSavedKg = calculateTotalCO2eSavings(storageSavedGB, dataTransferReducedGB, networkType);
  const carbonCreditsEarned = calculateCarbonCredits(totalCO2eSavedKg);

  return {
    storageSavedGB,
    dataTransferReducedGB,
    totalCO2eSavedKg,
    carbonCreditsEarned,
  };
}

/**
 * Get the badge tier for a given carbon credit amount
 */
export function getBadgeTierForCredits(credits: number): CarbonBadgeTier {
  const tier = CARBON_BADGE_TIERS.find(
    (t) => credits >= t.minCredits && credits < t.maxCredits
  );
  return tier || CARBON_BADGE_TIERS[0];
}

/**
 * Get next badge tier info
 */
export function getNextBadgeTier(credits: number): CarbonBadgeTier | null {
  const currentTierIndex = CARBON_BADGE_TIERS.findIndex(
    (t) => credits >= t.minCredits && credits < t.maxCredits
  );
  
  if (currentTierIndex === -1 || currentTierIndex === CARBON_BADGE_TIERS.length - 1) {
    return null;
  }

  return CARBON_BADGE_TIERS[currentTierIndex + 1];
}

/**
 * Calculate progress to next tier
 */
export function getProgressToNextTier(credits: number): { current: number; next: number; percentage: number } {
  const currentTier = getBadgeTierForCredits(credits);
  const nextTier = getNextBadgeTier(credits);

  if (!nextTier) {
    return { current: currentTier.maxCredits, next: currentTier.maxCredits, percentage: 100 };
  }

  const rangeSize = nextTier.maxCredits - currentTier.minCredits;
  const creditsInRange = credits - currentTier.minCredits;
  const percentage = Math.min((creditsInRange / rangeSize) * 100, 100);

  return {
    current: credits,
    next: nextTier.minCredits,
    percentage,
  };
}

/**
 * Format carbon credits for display
 */
export function formatCarbonCredits(credits: number): string {
  if (credits < 0.001) return '0.0000';
  if (credits < 0.01) return credits.toFixed(4);
  if (credits < 0.1) return credits.toFixed(3);
  if (credits < 1) return credits.toFixed(2);
  return credits.toFixed(2);
}

/**
 * Format CO2e savings for display
 */
export function formatCO2eSavings(kg: number): string {
  if (kg < 1) return `${kg.toFixed(3)} kg`;
  if (kg < 1000) return `${kg.toFixed(2)} kg`;
  return `${(kg / 1000).toFixed(2)} tons`;
}
