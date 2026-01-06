// IndexedDB client-side caching with Dexie.js
// TTL: prices 5min, transactions 24h, holdings 7 days

import Dexie, { type Table } from 'dexie';

// Cache entry types
export interface CachedPrice {
  id?: number;
  symbol: string;
  eur: number;
  eur_24h_change: number;
  timestamp: number;
  expiresAt: number;
}

export interface CachedHolding {
  id?: number;
  walletId: string;
  chain: string;
  symbol: string;
  amount: number;
  timestamp: number;
  expiresAt: number;
}

export interface CachedTransaction {
  id?: number;
  walletId: string;
  chain: string;
  hash: string;
  type: 'buy' | 'sell' | 'transfer' | 'stake' | 'airdrop';
  asset: string;
  amount: number;
  valueEur: number;
  timestamp: number;
  fee: number;
  feeEur: number;
  from?: string;
  to?: string;
  category?: 'defi' | 'staking' | 'nft' | 'cross-chain' | 'standard';
  cachedAt: number;
  expiresAt: number;
}

export interface CacheMetadata {
  id?: number;
  key: string;
  lastSync: number;
  provider?: string;
  chain?: string;
  walletId?: string;
  isOffline?: boolean;
}

// TTL constants
export const TTL = {
  PRICES: 5 * 60 * 1000,        // 5 minutes
  TRANSACTIONS: 24 * 60 * 60 * 1000, // 24 hours
  HOLDINGS: 7 * 24 * 60 * 60 * 1000, // 7 days
};

class CryptoCache extends Dexie {
  prices!: Table<CachedPrice>;
  holdings!: Table<CachedHolding>;
  transactions!: Table<CachedTransaction>;
  metadata!: Table<CacheMetadata>;

  constructor() {
    super('CryptaCache');
    
    this.version(1).stores({
      prices: '++id, symbol, expiresAt',
      holdings: '++id, [walletId+chain+symbol], walletId, chain, expiresAt',
      transactions: '++id, [walletId+chain+hash], walletId, chain, hash, expiresAt',
      metadata: '++id, key, walletId',
    });
  }
}

export const cacheDb = new CryptoCache();

// =====================
// Price Cache Functions
// =====================

export async function getCachedPrices(symbols: string[]): Promise<Record<string, CachedPrice>> {
  const now = Date.now();
  const result: Record<string, CachedPrice> = {};
  
  try {
    for (const symbol of symbols) {
      const cached = await cacheDb.prices
        .where('symbol')
        .equals(symbol.toUpperCase())
        .and(p => p.expiresAt > now)
        .first();
      
      if (cached) {
        result[symbol.toUpperCase()] = cached;
      }
    }
  } catch (err) {
    console.error('[CacheDB] Error getting cached prices:', err);
  }
  
  return result;
}

export async function setCachedPrices(prices: Record<string, { eur: number; eur_24h_change: number }>): Promise<void> {
  const now = Date.now();
  const expiresAt = now + TTL.PRICES;
  
  try {
    const entries: CachedPrice[] = Object.entries(prices).map(([symbol, data]) => ({
      symbol: symbol.toUpperCase(),
      eur: data.eur,
      eur_24h_change: data.eur_24h_change,
      timestamp: now,
      expiresAt,
    }));
    
    // Clear old prices for these symbols
    const symbols = entries.map(e => e.symbol);
    await cacheDb.prices.where('symbol').anyOf(symbols).delete();
    
    // Add new prices
    await cacheDb.prices.bulkAdd(entries);
  } catch (err) {
    console.error('[CacheDB] Error setting cached prices:', err);
  }
}

// =======================
// Holdings Cache Functions
// =======================

export async function getCachedHoldings(walletId: string, chain: string): Promise<Record<string, number> | null> {
  const now = Date.now();
  
  try {
    const cached = await cacheDb.holdings
      .where(['walletId', 'chain'])
      .equals([walletId, chain])
      .and(h => h.expiresAt > now)
      .toArray();
    
    if (cached.length === 0) return null;
    
    const result: Record<string, number> = {};
    for (const h of cached) {
      result[h.symbol] = h.amount;
    }
    return result;
  } catch (err) {
    console.error('[CacheDB] Error getting cached holdings:', err);
    return null;
  }
}

export async function setCachedHoldings(
  walletId: string,
  chain: string,
  holdings: Record<string, number>
): Promise<void> {
  const now = Date.now();
  const expiresAt = now + TTL.HOLDINGS;
  
  try {
    // Clear old holdings for this wallet/chain
    await cacheDb.holdings
      .where(['walletId', 'chain'])
      .equals([walletId, chain])
      .delete();
    
    // Add new holdings
    const entries: CachedHolding[] = Object.entries(holdings).map(([symbol, amount]) => ({
      walletId,
      chain,
      symbol,
      amount,
      timestamp: now,
      expiresAt,
    }));
    
    await cacheDb.holdings.bulkAdd(entries);
  } catch (err) {
    console.error('[CacheDB] Error setting cached holdings:', err);
  }
}

// ============================
// Transactions Cache Functions
// ============================

export async function getCachedTransactions(walletId: string, chain: string): Promise<CachedTransaction[] | null> {
  const now = Date.now();
  
  try {
    const cached = await cacheDb.transactions
      .where('walletId')
      .equals(walletId)
      .and(tx => tx.chain === chain && tx.expiresAt > now)
      .toArray();
    
    if (cached.length === 0) return null;
    return cached;
  } catch (err) {
    console.error('[CacheDB] Error getting cached transactions:', err);
    return null;
  }
}

export async function setCachedTransactions(
  walletId: string,
  chain: string,
  transactions: Array<{
    hash: string;
    type: 'buy' | 'sell' | 'transfer' | 'stake' | 'airdrop';
    asset: string;
    amount: number;
    valueEur: number;
    timestamp: number;
    fee: number;
    feeEur: number;
    from?: string;
    to?: string;
    category?: 'defi' | 'staking' | 'nft' | 'cross-chain' | 'standard';
  }>
): Promise<void> {
  const now = Date.now();
  const expiresAt = now + TTL.TRANSACTIONS;
  
  try {
    // Clear old transactions for this wallet/chain
    await cacheDb.transactions
      .where('walletId')
      .equals(walletId)
      .and(tx => tx.chain === chain)
      .delete();
    
    // Add new transactions
    const entries: CachedTransaction[] = transactions.map(tx => ({
      walletId,
      chain,
      ...tx,
      cachedAt: now,
      expiresAt,
    }));
    
    await cacheDb.transactions.bulkAdd(entries);
  } catch (err) {
    console.error('[CacheDB] Error setting cached transactions:', err);
  }
}

// =================
// Metadata Functions
// =================

export async function getCacheMetadata(walletId: string): Promise<CacheMetadata | null> {
  try {
    return await cacheDb.metadata
      .where('walletId')
      .equals(walletId)
      .first() || null;
  } catch (err) {
    console.error('[CacheDB] Error getting cache metadata:', err);
    return null;
  }
}

export async function setCacheMetadata(
  walletId: string,
  metadata: Partial<Omit<CacheMetadata, 'id' | 'walletId'>>
): Promise<void> {
  try {
    const existing = await cacheDb.metadata.where('walletId').equals(walletId).first();
    
    if (existing) {
      await cacheDb.metadata.update(existing.id!, {
        ...metadata,
        key: `wallet_${walletId}`,
        walletId,
      });
    } else {
      await cacheDb.metadata.add({
        key: `wallet_${walletId}`,
        walletId,
        lastSync: Date.now(),
        ...metadata,
      });
    }
  } catch (err) {
    console.error('[CacheDB] Error setting cache metadata:', err);
  }
}

// =================
// Utility Functions
// =================

export async function clearExpiredCache(): Promise<void> {
  const now = Date.now();
  
  try {
    await cacheDb.prices.where('expiresAt').below(now).delete();
    await cacheDb.holdings.where('expiresAt').below(now).delete();
    await cacheDb.transactions.where('expiresAt').below(now).delete();
    console.log('[CacheDB] Cleared expired cache entries');
  } catch (err) {
    console.error('[CacheDB] Error clearing expired cache:', err);
  }
}

export async function clearAllCache(): Promise<void> {
  try {
    await cacheDb.prices.clear();
    await cacheDb.holdings.clear();
    await cacheDb.transactions.clear();
    await cacheDb.metadata.clear();
    console.log('[CacheDB] Cleared all cache');
  } catch (err) {
    console.error('[CacheDB] Error clearing all cache:', err);
  }
}

export function isOnline(): boolean {
  return navigator.onLine;
}

// Auto-clear expired cache on startup
clearExpiredCache().catch(console.error);
