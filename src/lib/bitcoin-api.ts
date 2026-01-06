// Bitcoin API integration using Blockstream/mempool.space
// No API key required - public APIs for read-only data

import { getCurrentPrices } from './coingecko-api';

// Public API endpoints
const BLOCKSTREAM_API = 'https://blockstream.info/api';
const MEMPOOL_API = 'https://mempool.space/api';

// Cache for API responses
const CACHE_TTL = 60 * 1000; // 1 minute
const cache = new Map<string, { data: any; timestamp: number }>();

function getFromCache<T>(key: string): T | null {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data as T;
  }
  return null;
}

function setCache(key: string, data: any): void {
  cache.set(key, { data, timestamp: Date.now() });
}

export interface BitcoinTransaction {
  hash: string;
  type: 'buy' | 'sell' | 'transfer';
  asset: string;
  amount: number;
  timestamp: number;
  valueEur: number;
  fee: number;
  feeEur: number;
  from?: string;
  to?: string;
}

export interface BitcoinWalletData {
  holdings: Record<string, number>;
  transactions: BitcoinTransaction[];
  valueEur: number;
  address: string;
  chain: string;
}

interface BlockstreamAddress {
  address: string;
  chain_stats: {
    funded_txo_count: number;
    funded_txo_sum: number;
    spent_txo_count: number;
    spent_txo_sum: number;
    tx_count: number;
  };
  mempool_stats: {
    funded_txo_count: number;
    funded_txo_sum: number;
    spent_txo_count: number;
    spent_txo_sum: number;
    tx_count: number;
  };
}

interface BlockstreamTx {
  txid: string;
  vin: Array<{
    prevout: {
      scriptpubkey_address?: string;
      value: number;
    };
  }>;
  vout: Array<{
    scriptpubkey_address?: string;
    value: number;
  }>;
  status: {
    confirmed: boolean;
    block_time?: number;
  };
  fee: number;
}

/**
 * Validate Bitcoin address format
 */
export function isValidBitcoinAddress(address: string): boolean {
  // Legacy (P2PKH) - starts with 1
  const legacyRegex = /^1[a-km-zA-HJ-NP-Z1-9]{25,34}$/;
  // SegWit (P2SH) - starts with 3
  const segwitP2shRegex = /^3[a-km-zA-HJ-NP-Z1-9]{25,34}$/;
  // Native SegWit (Bech32) - starts with bc1
  const bech32Regex = /^bc1[a-zA-HJ-NP-Z0-9]{25,87}$/i;
  
  return legacyRegex.test(address) || segwitP2shRegex.test(address) || bech32Regex.test(address);
}

/**
 * Fetch Bitcoin address balance and transactions
 */
export async function fetchBitcoinWalletData(
  address: string
): Promise<BitcoinWalletData | null> {
  const cacheKey = `btc_wallet_${address}`;
  const cached = getFromCache<BitcoinWalletData>(cacheKey);
  if (cached) {
    console.log('[Bitcoin] Using cached data for', address);
    return cached;
  }

  try {
    console.log(`[Bitcoin] Fetching wallet data for ${address}`);
    
    // Fetch address info
    const addressRes = await fetch(`${BLOCKSTREAM_API}/address/${address}`);
    if (!addressRes.ok) {
      throw new Error(`Failed to fetch address: ${addressRes.status}`);
    }
    
    const addressData: BlockstreamAddress = await addressRes.json();
    
    // Calculate balance in BTC
    const chainBalance = addressData.chain_stats.funded_txo_sum - addressData.chain_stats.spent_txo_sum;
    const mempoolBalance = addressData.mempool_stats.funded_txo_sum - addressData.mempool_stats.spent_txo_sum;
    const totalSatoshis = chainBalance + mempoolBalance;
    const balanceBtc = totalSatoshis / 100_000_000; // satoshis to BTC
    
    const holdings: Record<string, number> = {};
    if (balanceBtc > 0) {
      holdings['BTC'] = balanceBtc;
    }
    
    // Fetch recent transactions
    const txRes = await fetch(`${BLOCKSTREAM_API}/address/${address}/txs`);
    const txs: BlockstreamTx[] = txRes.ok ? await txRes.json() : [];
    
    const transactions: BitcoinTransaction[] = [];
    
    // Process last 25 transactions
    for (const tx of txs.slice(0, 25)) {
      // Calculate if incoming or outgoing
      let inValue = 0;
      let outValue = 0;
      
      // Check inputs (spent from this address)
      for (const vin of tx.vin) {
        if (vin.prevout?.scriptpubkey_address?.toLowerCase() === address.toLowerCase()) {
          outValue += vin.prevout.value;
        }
      }
      
      // Check outputs (received to this address)
      for (const vout of tx.vout) {
        if (vout.scriptpubkey_address?.toLowerCase() === address.toLowerCase()) {
          inValue += vout.value;
        }
      }
      
      const netSatoshis = inValue - outValue;
      const netBtc = Math.abs(netSatoshis) / 100_000_000;
      
      if (netBtc > 0.00000001) { // Filter dust
        const isIncoming = netSatoshis > 0;
        
        transactions.push({
          hash: tx.txid,
          type: isIncoming ? 'buy' : 'sell',
          asset: 'BTC',
          amount: netBtc,
          timestamp: (tx.status.block_time || Date.now() / 1000) * 1000,
          valueEur: 0, // Will calculate with price
          fee: tx.fee / 100_000_000,
          feeEur: 0,
        });
      }
    }
    
    // Fetch BTC price
    let valueEur = 0;
    if (balanceBtc > 0) {
      const prices = await getCurrentPrices(['BTC']);
      if (prices['BTC']) {
        valueEur = balanceBtc * prices['BTC'].eur;
        
        // Update transaction values
        for (const tx of transactions) {
          tx.valueEur = tx.amount * prices['BTC'].eur;
          tx.feeEur = tx.fee * prices['BTC'].eur;
        }
      }
    }
    
    const result: BitcoinWalletData = {
      holdings,
      transactions,
      valueEur,
      address,
      chain: 'bitcoin',
    };
    
    setCache(cacheKey, result);
    console.log(`[Bitcoin] Fetched balance: ${balanceBtc} BTC, value: €${valueEur.toFixed(2)}, txs: ${transactions.length}`);
    
    return result;
  } catch (err) {
    console.error('[Bitcoin] Error fetching wallet data:', err);
    
    // Try fallback to mempool.space
    try {
      console.log('[Bitcoin] Trying mempool.space fallback...');
      const mempoolRes = await fetch(`${MEMPOOL_API}/address/${address}`);
      if (!mempoolRes.ok) throw new Error('Mempool fallback failed');
      
      const mempoolData = await mempoolRes.json();
      const balanceSats = (mempoolData.chain_stats?.funded_txo_sum || 0) - 
                          (mempoolData.chain_stats?.spent_txo_sum || 0);
      const balanceBtc = balanceSats / 100_000_000;
      
      const holdings: Record<string, number> = {};
      if (balanceBtc > 0) {
        holdings['BTC'] = balanceBtc;
      }
      
      // Get price
      let valueEur = 0;
      if (balanceBtc > 0) {
        const prices = await getCurrentPrices(['BTC']);
        if (prices['BTC']) {
          valueEur = balanceBtc * prices['BTC'].eur;
        }
      }
      
      return {
        holdings,
        transactions: [],
        valueEur,
        address,
        chain: 'bitcoin',
      };
    } catch (fallbackErr) {
      console.error('[Bitcoin] Fallback also failed:', fallbackErr);
      throw err;
    }
  }
}

/**
 * Get current Bitcoin network fee estimates
 */
export async function getBitcoinFeeEstimates(): Promise<{
  fastest: number;
  halfHour: number;
  hour: number;
  economy: number;
} | null> {
  try {
    const res = await fetch(`${MEMPOOL_API}/v1/fees/recommended`);
    if (!res.ok) return null;
    
    const data = await res.json();
    return {
      fastest: data.fastestFee,
      halfHour: data.halfHourFee,
      hour: data.hourFee,
      economy: data.economyFee,
    };
  } catch {
    return null;
  }
}
