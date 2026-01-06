/**
 * Transaction types and tax calculation helpers
 * Real prices are fetched from coingecko-api.ts
 */

export interface Transaction {
  hash: string;
  type: 'buy' | 'sell' | 'transfer' | 'stake' | 'airdrop';
  asset: string;
  amount: number;
  timestamp: number;
  valueEur: number;
  fee: number;
  feeEur: number;
  from?: string;
  to?: string;
}

// Keep backward compatibility
export type MockTransaction = Transaction;

/**
 * @deprecated Use calculateCostBasisFIFO from cost-basis.ts for real calculations
 * This is kept for backward compatibility but returns 0 when no data
 */
export const calculateTaxFIFO = (
  transactions: Transaction[],
  year: number
): {
  totalGains: number;
  totalLosses: number;
  netGain: number;
  taxableEvents: Transaction[];
} => {
  // Import and use real cost basis calculation
  const { calculateCostBasisFIFO, filterTaxResultsByYear } = require('./cost-basis');
  
  const result = calculateCostBasisFIFO(transactions);
  const yearFiltered = filterTaxResultsByYear(result, year);
  
  return {
    totalGains: yearFiltered.totalGains,
    totalLosses: yearFiltered.totalLosses,
    netGain: yearFiltered.netGain,
    taxableEvents: yearFiltered.taxableEvents.map((s: any) => s.transaction),
  };
};
