// Solana API integration using public JSON-RPC
// No API key required - public RPC for read-only portfolio data

import { getCurrentPrices } from './coingecko-api';

const SOLANA_RPC = 'https://api.mainnet-beta.solana.com';

export interface SolanaTransaction {
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

export interface SolanaWalletData {
  holdings: Record<string, number>;
  transactions: SolanaTransaction[];
  valueEur: number;
  address: string;
  chain: string;
}

type JsonRpcReq = { jsonrpc: '2.0'; id: number; method: string; params: any[] };

async function rpc<T>(method: string, params: any[]): Promise<T> {
  const body: JsonRpcReq = { jsonrpc: '2.0', id: 1, method, params };
  const res = await fetch(SOLANA_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Solana RPC HTTP ${res.status}`);
  }
  const json = await res.json();
  if (json?.error) {
    throw new Error(`Solana RPC error: ${json.error?.message || 'unknown'}`);
  }
  return json.result as T;
}

// A small allowlist of common SPL token mints to display meaningful symbols.
// Unknown mints are ignored to avoid cluttering the UI with long addresses.
const KNOWN_SPL_MINTS: Record<string, string> = {
  // USDC
  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: 'USDC',
  // USDT
  Es9vMFrzaCERmJfrF4H2FYDq5XjK3mJwYb5yF9dDgD4p: 'USDT',
};

export async function fetchSolanaWalletData(address: string): Promise<SolanaWalletData | null> {
  try {
    // Native SOL balance
    const bal = await rpc<{ value: number }>('getBalance', [address]);
    const sol = (bal?.value || 0) / 1e9;

    const holdings: Record<string, number> = {};
    if (sol > 0) holdings['SOL'] = sol;

    // SPL token accounts (read-only)
    const tokenAccounts = await rpc<any>('getTokenAccountsByOwner', [
      address,
      { programId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' },
      { encoding: 'jsonParsed' },
    ]);

    for (const item of tokenAccounts?.value || []) {
      const info = item?.account?.data?.parsed?.info;
      const mint: string = String(info?.mint || '').trim();
      const sym = KNOWN_SPL_MINTS[mint];
      if (!sym) continue;
      const amt = Number(info?.tokenAmount?.uiAmount ?? 0);
      if (!Number.isFinite(amt) || amt <= 0) continue;
      holdings[sym] = (holdings[sym] || 0) + amt;
    }

    // Value in EUR (best-effort)
    let valueEur = 0;
    const symbols = Object.keys(holdings);
    if (symbols.length > 0) {
      const prices = await getCurrentPrices(symbols);
      for (const s of symbols) {
        const p = prices[s]?.eur;
        if (p) valueEur += holdings[s] * p;
      }
    }

    return {
      holdings,
      transactions: [],
      valueEur,
      address,
      chain: 'solana',
    };
  } catch (err) {
    console.error('[Solana] Error fetching wallet data:', err);
    return null;
  }
}
