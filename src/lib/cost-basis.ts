/**
 * Cost Basis Tracking with FIFO, LIFO, and HIFO methods
 * Tracks purchase lots and calculates real gains/losses on sales
 */

import type { Transaction } from "./crypto-data";

/** Supported cost basis calculation methods */
export type CostBasisMethod = 'FIFO' | 'LIFO' | 'HIFO';

/**
 * A purchase lot for cost basis tracking
 */
export interface CostBasisLot {
  /** Unique identifier for the lot */
  id: string;
  /** Asset symbol (e.g., BTC, ETH) */
  asset: string;
  /** Amount purchased */
  amount: number;
  /** Remaining amount (after partial sales) */
  remainingAmount: number;
  /** Cost per unit in EUR at time of purchase */
  costPerUnit: number;
  /** Total cost in EUR */
  totalCost: number;
  /** Purchase timestamp */
  timestamp: number;
  /** Original transaction hash */
  txHash: string;
}

/**
 * Result of a sale calculation
 */
export interface SaleResult {
  /** Transaction that generated this sale */
  transaction: Transaction;
  /** Total proceeds from the sale in EUR */
  proceeds: number;
  /** Cost basis used for this sale */
  costBasis: number;
  /** Gain or loss (proceeds - costBasis) */
  gainLoss: number;
  /** Lots consumed for this sale */
  lotsUsed: Array<{
    lotId: string;
    amountUsed: number;
    costPerUnit: number;
    cost: number;
  }>;
}

/**
 * Calculate cost basis and gains/losses using specified method
 * @param transactions - Array of transactions to process
 * @param method - Cost basis method: FIFO (default), LIFO, or HIFO
 */
export function calculateCostBasis(
  transactions: Transaction[],
  method: CostBasisMethod = 'FIFO'
): {
  lots: CostBasisLot[];
  sales: SaleResult[];
  totalGains: number;
  totalLosses: number;
  netGain: number;
  unrealizedGains: Record<string, { amount: number; costBasis: number; avgCost: number }>;
} {
  // Normalize timestamps - ensure all are milliseconds
  const normalizedTx = transactions.map(tx => ({
    ...tx,
    // Ensure timestamp is in milliseconds
    timestamp: typeof tx.timestamp === 'number' 
      ? (tx.timestamp < 1e12 ? tx.timestamp * 1000 : tx.timestamp)
      : new Date(tx.timestamp as any).getTime() || Date.now(),
  }));
  
  // Sort transactions by timestamp (oldest first for processing)
  const sortedTx = [...normalizedTx].sort((a, b) => a.timestamp - b.timestamp);
  
  // Track lots per asset
  const lotsByAsset: Record<string, CostBasisLot[]> = {};
  const sales: SaleResult[] = [];
  let totalGains = 0;
  let totalLosses = 0;
  
  /**
   * Get lots ordered by method for consumption:
   * - FIFO: oldest first (by timestamp ascending)
   * - LIFO: newest first (by timestamp descending)
   * - HIFO: highest cost first (by costPerUnit descending)
   */
  const getLotsForMethod = (lots: CostBasisLot[], m: CostBasisMethod): CostBasisLot[] => {
    const available = lots.filter(l => l.remainingAmount > 0);
    switch (m) {
      case 'LIFO':
        return [...available].sort((a, b) => b.timestamp - a.timestamp);
      case 'HIFO':
        return [...available].sort((a, b) => b.costPerUnit - a.costPerUnit);
      case 'FIFO':
      default:
        return [...available].sort((a, b) => a.timestamp - b.timestamp);
    }
  };
  
  for (const tx of sortedTx) {
    const asset = tx.asset.toUpperCase();
    
    // Treat buy, airdrop, AND transfer (incoming) as acquisitions
    // Transfer often means receiving tokens from another wallet
    if (tx.type === 'buy' || tx.type === 'airdrop' || tx.type === 'transfer') {
      // Create a new lot
      if (!lotsByAsset[asset]) {
        lotsByAsset[asset] = [];
      }
      
      // Calculate cost per unit - if valueEur is 0, we don't have historical price
      // In this case, we'll use 0 as cost (worst case for tax purposes)
      const effectiveValueEur = tx.valueEur || 0;
      const costPerUnit = tx.amount > 0 ? effectiveValueEur / tx.amount : 0;
      
      lotsByAsset[asset].push({
        id: `${tx.hash}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        asset,
        amount: tx.amount,
        remainingAmount: tx.amount,
        costPerUnit,
        totalCost: effectiveValueEur,
        timestamp: tx.timestamp,
        txHash: tx.hash,
      });
    } else if (tx.type === 'sell') {
      // Get lots ordered by selected method
      const lots = lotsByAsset[asset] || [];
      const orderedLots = getLotsForMethod(lots, method);
      let remainingToSell = tx.amount;
      let totalCostBasis = 0;
      const lotsUsed: SaleResult['lotsUsed'] = [];
      
      for (const lot of orderedLots) {
        if (remainingToSell <= 0) break;
        if (lot.remainingAmount <= 0) continue;
        
        const amountFromThisLot = Math.min(lot.remainingAmount, remainingToSell);
        const costFromThisLot = amountFromThisLot * lot.costPerUnit;
        
        // Update the original lot (not the sorted copy reference)
        const originalLot = lots.find(l => l.id === lot.id);
        if (originalLot) {
          originalLot.remainingAmount -= amountFromThisLot;
        }
        
        remainingToSell -= amountFromThisLot;
        totalCostBasis += costFromThisLot;
        
        lotsUsed.push({
          lotId: lot.id,
          amountUsed: amountFromThisLot,
          costPerUnit: lot.costPerUnit,
          cost: costFromThisLot,
        });
      }
      
      // If we still have remaining (sold more than we bought), cost basis is 0 for that portion
      // This could happen with transfers in from external wallets
      
      const proceeds = tx.valueEur;
      const gainLoss = proceeds - totalCostBasis;
      
      if (gainLoss > 0) {
        totalGains += gainLoss;
      } else {
        totalLosses += Math.abs(gainLoss);
      }
      
      sales.push({
        transaction: tx,
        proceeds,
        costBasis: totalCostBasis,
        gainLoss,
        lotsUsed,
      });
    }
    // Stakes don't affect cost basis
  }
  
  // Calculate unrealized gains (current holdings with their cost basis)
  const unrealizedGains: Record<string, { amount: number; costBasis: number; avgCost: number }> = {};
  
  for (const [asset, lots] of Object.entries(lotsByAsset)) {
    const remainingLots = lots.filter(l => l.remainingAmount > 0);
    const totalAmount = remainingLots.reduce((sum, l) => sum + l.remainingAmount, 0);
    const totalCostBasis = remainingLots.reduce((sum, l) => sum + (l.remainingAmount * l.costPerUnit), 0);
    
    if (totalAmount > 0) {
      unrealizedGains[asset] = {
        amount: totalAmount,
        costBasis: totalCostBasis,
        avgCost: totalCostBasis / totalAmount,
      };
    }
  }
  
  // Flatten all lots for export
  const allLots = Object.values(lotsByAsset).flat();
  
  return {
    lots: allLots,
    sales,
    totalGains,
    totalLosses,
    netGain: totalGains - totalLosses,
    unrealizedGains,
  };
}

/**
 * Backward compatibility alias - defaults to FIFO
 * @deprecated Use calculateCostBasis with explicit method parameter
 */
export function calculateCostBasisFIFO(transactions: Transaction[]) {
  return calculateCostBasis(transactions, 'FIFO');
}

/**
 * Filter tax results by year
 */
export function filterTaxResultsByYear(
  result: ReturnType<typeof calculateCostBasis>,
  year: number
): {
  totalGains: number;
  totalLosses: number;
  netGain: number;
  taxableEvents: SaleResult[];
} {
  const taxableEvents = result.sales.filter(sale => {
    const saleYear = new Date(sale.transaction.timestamp).getFullYear();
    return saleYear === year;
  });
  
  const totalGains = taxableEvents.reduce((sum, s) => sum + Math.max(0, s.gainLoss), 0);
  const totalLosses = taxableEvents.reduce((sum, s) => sum + Math.abs(Math.min(0, s.gainLoss)), 0);
  
  return {
    totalGains,
    totalLosses,
    netGain: totalGains - totalLosses,
    taxableEvents,
  };
}

/**
 * Calculate unrealized gain/loss with current prices
 */
export function calculateUnrealizedGains(
  unrealizedGains: Record<string, { amount: number; costBasis: number; avgCost: number }>,
  currentPrices: Record<string, number>
): {
  totalUnrealizedGain: number;
  totalUnrealizedLoss: number;
  byAsset: Record<string, { amount: number; costBasis: number; currentValue: number; unrealizedGainLoss: number }>;
} {
  let totalUnrealizedGain = 0;
  let totalUnrealizedLoss = 0;
  const byAsset: Record<string, { amount: number; costBasis: number; currentValue: number; unrealizedGainLoss: number }> = {};
  
  for (const [asset, data] of Object.entries(unrealizedGains)) {
    const currentPrice = currentPrices[asset] || currentPrices[asset.toUpperCase()] || 0;
    const currentValue = data.amount * currentPrice;
    
    // Calculate unrealized gain/loss
    let unrealizedGainLoss = currentValue - data.costBasis;
    
    // Sanity checks for unrealistic values:
    // 1. If cost basis is 0 (no historical data), we can't calculate real gain
    //    In this case, show 0 to indicate "unknown" rather than misleading numbers
    // 2. If unrealized gain exceeds current value, something is wrong
    if (data.costBasis === 0 || data.costBasis < 0.01) {
      // No reliable cost basis data - treat as unknown
      unrealizedGainLoss = 0;
    } else if (unrealizedGainLoss > currentValue) {
      // This shouldn't happen with proper cost basis - cap it
      unrealizedGainLoss = currentValue * 0.5; // Conservative estimate
    }
    
    byAsset[asset] = {
      amount: data.amount,
      costBasis: data.costBasis,
      currentValue,
      unrealizedGainLoss,
    };
    
    if (unrealizedGainLoss > 0) {
      totalUnrealizedGain += unrealizedGainLoss;
    } else {
      totalUnrealizedLoss += Math.abs(unrealizedGainLoss);
    }
  }
  
  return {
    totalUnrealizedGain,
    totalUnrealizedLoss,
    byAsset,
  };
}
