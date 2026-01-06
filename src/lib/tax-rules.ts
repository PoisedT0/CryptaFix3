// Italian Crypto Tax Rules - MiCA & DAC8 2026 Compliant

export type ItalianCryptoTaxRules = {
  year: number;
  /** e.g. 0.26 */
  taxRate: number;
  taxRateLabel: string;
  /** true only up to 2024 (demo app rule) */
  hasExemptionThreshold: boolean;
  /** null when threshold is not applicable */
  exemptionThresholdEur: number | null;
  /** One-line user-facing summary */
  summary: string;
  /** IVCA rate for Quadro RW */
  ivcaRate: number;
  /** Loss compensation years allowed */
  lossCompensationYears: number;
};

export function getItalianCryptoTaxRules(year: number): ItalianCryptoTaxRules {
  if (year <= 2024) {
    return {
      year,
      taxRate: 0.26,
      taxRateLabel: "26%",
      hasExemptionThreshold: true,
      exemptionThresholdEur: 2000,
      summary: "Aliquota 26% con soglia di esenzione (regole fino al 2024)",
      ivcaRate: 0.002, // 0.2% IVCA
      lossCompensationYears: 4,
    };
  }

  if (year === 2025) {
    return {
      year,
      taxRate: 0.26,
      taxRateLabel: "26%",
      hasExemptionThreshold: false,
      exemptionThresholdEur: null,
      summary: "Aliquota 26% (dal 2025 senza soglia di esenzione)",
      ivcaRate: 0.002,
      lossCompensationYears: 4,
    };
  }

  // 2026+: MiCA/DAC8 regime
  return {
    year,
    taxRate: 0.33,
    taxRateLabel: "33%",
    hasExemptionThreshold: false,
    exemptionThresholdEur: null,
    summary: "Aliquota 33% (dal 2026 senza soglia di esenzione)",
    ivcaRate: 0.002,
    lossCompensationYears: 4,
  };
}

export function getItalianCryptoTaxableAmount(netGainEur: number, year: number): number {
  if (netGainEur <= 0) return 0;
  const rules = getItalianCryptoTaxRules(year);

  if (rules.hasExemptionThreshold && typeof rules.exemptionThresholdEur === "number") {
    return Math.max(0, netGainEur - rules.exemptionThresholdEur);
  }

  return netGainEur;
}

// ============= DAC8 Compliance =============

/** DAC8 reporting threshold for automatic CASP reporting */
export const DAC8_REPORTING_THRESHOLD = 50000; // €50,000

/** Check if a transfer triggers DAC8 automatic reporting */
export function isDAC8Reportable(valueEur: number): boolean {
  return valueEur >= DAC8_REPORTING_THRESHOLD;
}

/** Get DAC8 warning message */
export function getDAC8Warning(valueEur: number): string | null {
  if (!isDAC8Reportable(valueEur)) return null;
  return `⚠️ Transazione ≥€50.000: Reportabile automaticamente dal CASP (DAC8 2026)`;
}

// ============= Loss Compensation =============

export interface LossCompensationResult {
  /** Net gain after compensation */
  netGainAfterCompensation: number;
  /** Total losses used */
  lossesUsed: number;
  /** Remaining losses to carry forward */
  remainingLosses: number;
  /** Breakdown by year */
  breakdown: Array<{
    year: number;
    lossAvailable: number;
    lossUsed: number;
    lossRemaining: number;
  }>;
}

/**
 * Calculate loss compensation across years
 * Italian rules allow carrying forward losses for 4 years
 */
export function calculateLossCompensation(
  currentYearGain: number,
  previousYearLosses: Record<number, number>, // { 2023: 1000, 2024: 500 }
  currentYear: number
): LossCompensationResult {
  const rules = getItalianCryptoTaxRules(currentYear);
  const maxYearsBack = rules.lossCompensationYears;
  
  let remainingGain = Math.max(0, currentYearGain);
  let totalLossesUsed = 0;
  const breakdown: LossCompensationResult['breakdown'] = [];
  const updatedLosses: Record<number, number> = { ...previousYearLosses };
  
  // Sort years from oldest to newest (FIFO for losses)
  const sortedYears = Object.keys(previousYearLosses)
    .map(Number)
    .filter(year => year >= currentYear - maxYearsBack && year < currentYear)
    .sort((a, b) => a - b);
  
  for (const year of sortedYears) {
    const lossAvailable = previousYearLosses[year] || 0;
    if (lossAvailable <= 0 || remainingGain <= 0) {
      breakdown.push({
        year,
        lossAvailable,
        lossUsed: 0,
        lossRemaining: lossAvailable,
      });
      continue;
    }
    
    const lossUsed = Math.min(lossAvailable, remainingGain);
    const lossRemaining = lossAvailable - lossUsed;
    
    remainingGain -= lossUsed;
    totalLossesUsed += lossUsed;
    updatedLosses[year] = lossRemaining;
    
    breakdown.push({
      year,
      lossAvailable,
      lossUsed,
      lossRemaining,
    });
  }
  
  // Calculate remaining losses (sum of all unused losses within valid years)
  const remainingLosses = breakdown.reduce((sum, b) => sum + b.lossRemaining, 0);
  
  return {
    netGainAfterCompensation: remainingGain,
    lossesUsed: totalLossesUsed,
    remainingLosses,
    breakdown,
  };
}

// ============= Substitute Tax 2025 (Imposta Sostitutiva) =============

/** Substitute tax rate for 2025 snapshot (18%) */
export const SUBSTITUTE_TAX_RATE_2025 = 0.18;

/** Reference date for 2025 substitute tax */
export const SUBSTITUTE_TAX_DATE_2025 = new Date('2025-01-01T00:00:00Z');

export interface SubstituteTaxCalculation {
  /** Portfolio value at reference date */
  portfolioValueAtDate: number;
  /** Substitute tax rate */
  taxRate: number;
  /** Calculated tax */
  taxAmount: number;
  /** Reference date */
  referenceDate: Date;
  /** Whether this is more advantageous than regular tax */
  isAdvantangeous: boolean;
  /** Regular tax for comparison */
  regularTaxAmount: number;
  /** Savings compared to regular tax (can be negative) */
  savings: number;
}

/**
 * Calculate substitute tax option for 2025
 * This allows taxpayers to pay 18% on portfolio value as of 1/1/2025
 * instead of regular capital gains tax on realized gains
 */
export function calculateSubstituteTax2025(
  portfolioValueAt2025: number,
  regularGains: number,
  year: number
): SubstituteTaxCalculation {
  const rules = getItalianCryptoTaxRules(year);
  
  const taxAmount = portfolioValueAt2025 * SUBSTITUTE_TAX_RATE_2025;
  const regularTaxableAmount = getItalianCryptoTaxableAmount(regularGains, year);
  const regularTaxAmount = regularTaxableAmount * rules.taxRate;
  const savings = regularTaxAmount - taxAmount;
  
  return {
    portfolioValueAtDate: portfolioValueAt2025,
    taxRate: SUBSTITUTE_TAX_RATE_2025,
    taxAmount,
    referenceDate: SUBSTITUTE_TAX_DATE_2025,
    isAdvantangeous: savings > 0,
    regularTaxAmount,
    savings,
  };
}

// ============= Quadro RW/RT Helpers =============

export interface QuadroRWData {
  /** Total value of crypto assets at year end */
  totalValueYearEnd: number;
  /** IVCA (wealth tax) amount */
  ivcaAmount: number;
  /** Country code for foreign assets */
  countryCode: string;
  /** Asset type code for crypto */
  assetTypeCode: string;
}

export interface QuadroRTData {
  /** Total capital gains */
  totalGains: number;
  /** Total capital losses */
  totalLosses: number;
  /** Net taxable amount */
  netTaxable: number;
  /** Tax due */
  taxDue: number;
  /** Losses to carry forward */
  lossCarryForward: number;
}

/**
 * Generate Quadro RW data for crypto holdings
 */
export function generateQuadroRW(
  portfolioValueYearEnd: number,
  year: number
): QuadroRWData {
  const rules = getItalianCryptoTaxRules(year);
  
  return {
    totalValueYearEnd: portfolioValueYearEnd,
    ivcaAmount: portfolioValueYearEnd * rules.ivcaRate,
    countryCode: 'XX', // Crypto is considered "virtual", no specific country
    assetTypeCode: '21', // Code for crypto-assets
  };
}

/**
 * Generate Quadro RT data for capital gains
 */
export function generateQuadroRT(
  gains: number,
  losses: number,
  previousLosses: Record<number, number>,
  year: number
): QuadroRTData {
  const lossCompensation = calculateLossCompensation(gains, previousLosses, year);
  const rules = getItalianCryptoTaxRules(year);
  
  const netTaxable = getItalianCryptoTaxableAmount(lossCompensation.netGainAfterCompensation, year);
  const taxDue = netTaxable * rules.taxRate;
  
  // Current year losses that can be carried forward
  const currentYearLosses = Math.abs(Math.min(0, gains - losses));
  
  return {
    totalGains: gains,
    totalLosses: losses,
    netTaxable,
    taxDue,
    lossCarryForward: lossCompensation.remainingLosses + currentYearLosses,
  };
}
