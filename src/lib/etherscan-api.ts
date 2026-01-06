// Etherscan API V2 Integration (client-side)
// Supports ETH, Polygon, Arbitrum, Base, Optimism, BSC via their "scan" explorers.
//

// Migrated from deprecated V1 endpoints to V2 API
import { etherscanLimiter } from './api-rate-limiter';

// This replaces the previous Supabase Edge Function dependency.

export interface EtherscanWalletTransaction {
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

type TxListItem = {
  hash: string;
  blockNumber: string;
  timeStamp: string;
  from: string;
  to: string;
  value: string;
  gas?: string;
  gasPrice?: string;
  gasUsed?: string;
  isError?: string;
};

type TokenTxItem = {
  hash: string;
  blockNumber: string;
  timeStamp: string;
  from: string;
  to: string;
  value: string;
  tokenSymbol: string;
  tokenDecimal: string;
  tokenName?: string;
};

function ensureApiKey(apiKey: string, network: string): void {
  if (!apiKey || apiKey.trim().length < 3) {
    throw new Error(
      `Missing API key for Etherscan-family provider on ${network}. Add it in Settings → Providers.`
    );
  }
}

function parseWeiToEth(wei: string): number {
  try {
    const v = BigInt(wei);
    return Number(v) / 1e18;
  } catch (e) {
    return 0;
  }
}

function parseTokenAmount(value: string, decimals: string | number): number {
  try {
    const v = BigInt(value);
    const d = typeof decimals === 'string' ? parseInt(decimals) : decimals;
    if (isNaN(d)) return 0;

    const denom = 10 ** d;
    const scaled = Number(v) / denom;
    return Number.isFinite(scaled) ? scaled : 0;
  } catch (e) {
    console.warn('[Etherscan] Failed to parse token amount:', value, decimals, e);
    return 0;
  }
}

async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  return etherscanLimiter.enqueue(url, async () => {
    const response = await fetch(url, { signal });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    
    // Handle Etherscan specific rate limit messages in the JSON response
    if (data.status === '0' && (data.result || '').includes('rate limit')) {
      throw new Error('Max calls per sec rate limit reached');
    }
    
    if (data.status === '0' && data.message === 'NOTOK') {
      throw new Error(data.result || 'Etherscan API error');
    }
    return data;
  });
}

export async function fetchEtherscanWalletData(
  address: string,
  network: string,
  apiKey: string,
  signal?: AbortSignal
): Promise<{ holdings: Record<string, number>; transactions: EtherscanWalletTransaction[] } | null> {
  ensureApiKey(apiKey, network);

  // Updated to Etherscan API V2 endpoints
  const EXPLORER_API: Record<string, { apiBase: string; nativeSymbol: string; chainId?: string }> = {
    ethereum: { apiBase: 'https://api.etherscan.io/v2/api', nativeSymbol: 'ETH', chainId: '1' },
    polygon: { apiBase: 'https://api.polygonscan.com/v2/api', nativeSymbol: 'MATIC', chainId: '137' },
    arbitrum: { apiBase: 'https://api.arbiscan.io/v2/api', nativeSymbol: 'ETH', chainId: '42161' },
    base: { apiBase: 'https://api.basescan.org/v2/api', nativeSymbol: 'ETH', chainId: '8453' },
    optimism: { apiBase: 'https://api-optimistic.etherscan.io/v2/api', nativeSymbol: 'ETH', chainId: '10' },
    bsc: { apiBase: 'https://api.bscscan.com/v2/api', nativeSymbol: 'BNB', chainId: '56' },
    linea: { apiBase: 'https://api.lineascan.build/v2/api', nativeSymbol: 'ETH', chainId: '59144' },
  };

  const cfg = EXPLORER_API[network];
  const apiBase: string | undefined = cfg?.apiBase;
  const nativeSymbol: string = cfg?.nativeSymbol || 'ETH';
  
  if (!apiBase) throw new Error(`Explorer API not configured for network: ${network}`);

  const chainParam = cfg.chainId ? `&chainid=${cfg.chainId}` : '';

  // V2 API: Fetch on-chain native balance
  const balanceUrl = `${apiBase}?module=account&action=balance&address=${encodeURIComponent(
    address
  )}&tag=latest&apikey=${encodeURIComponent(apiKey)}${chainParam}`;

  // V2 API: Fetch normal tx list (native transfers)
  const txUrl = `${apiBase}?module=account&action=txlist&address=${encodeURIComponent(
    address
  )}&startblock=0&endblock=99999999&sort=asc&apikey=${encodeURIComponent(apiKey)}${chainParam}`;

  // V2 API: Fetch ERC20 token transfers
  const tokenUrl = `${apiBase}?module=account&action=tokentx&address=${encodeURIComponent(
    address
  )}&startblock=0&endblock=99999999&sort=asc&apikey=${encodeURIComponent(apiKey)}${chainParam}`;

  type ApiResp<T> = { status: string; message: string; result: T };

  try {
    const [balResp, txResp, tokenResp] = await Promise.all([
      fetchJson<ApiResp<string>>(balanceUrl, signal).catch((e) => { console.error('[Etherscan Debug] Balance Error:', e); return { status: '0', message: 'err', result: '0' } as any; }),
      fetchJson<ApiResp<TxListItem[]>>(txUrl, signal).catch((e) => { console.error('[Etherscan Debug] Tx Error:', e); return { status: '0', message: 'err', result: [] } as any; }),
      fetchJson<ApiResp<TokenTxItem[]>>(tokenUrl, signal).catch((e) => { console.error('[Etherscan Debug] Token Error:', e); return { status: '0', message: 'err', result: [] } as any; }),
    ]);

    console.log('[Etherscan Debug] Raw Balance:', balResp.result);
    console.log('[Etherscan Debug] Token Tx Count:', tokenResp.result?.length);

    const txItems: TxListItem[] = Array.isArray(txResp.result) ? txResp.result : [];
    const tokenItems: TokenTxItem[] = Array.isArray(tokenResp.result) ? tokenResp.result : [];

    const transactions: EtherscanWalletTransaction[] = [];

    // Native transfers
    for (const t of txItems) {
      if (t.isError === '1') continue;
      const amount = parseWeiToEth(t.value);
      if (amount === 0) continue;

      const isOut = t.from.toLowerCase() === address.toLowerCase();
      
      transactions.push({
        hash: t.hash,
        type: isOut ? 'sell' : 'buy',
        asset: nativeSymbol,
        amount,
        timestamp: parseInt(t.timeStamp) * 1000,
        valueEur: 0,
        fee: parseWeiToEth((BigInt(t.gas || '0') * BigInt(t.gasPrice || '0')).toString()),
        feeEur: 0,
        from: t.from,
        to: t.to,
      });
    }

    // Token transfers
    for (const t of tokenItems) {
      const amount = parseTokenAmount(t.value, t.tokenDecimal);
      if (amount === 0) continue;

      const isOut = t.from.toLowerCase() === address.toLowerCase();

      transactions.push({
        hash: t.hash,
        type: isOut ? 'sell' : 'buy',
        asset: (t.tokenSymbol || 'UNKNOWN').toUpperCase(),
        amount,
        timestamp: parseInt(t.timeStamp) * 1000,
        valueEur: 0,
        fee: 0,
        feeEur: 0,
        from: t.from,
        to: t.to,
      });
    }

    // Holdings: start from native balance
    const holdings: Record<string, number> = {};
    const nativeBalance = parseWeiToEth((balResp as any)?.result || '0');
    
    // Always include native symbol if balance > 0
    if (nativeBalance > 0) {
      holdings[nativeSymbol] = nativeBalance;
    }
    
    const addrLower = address.toLowerCase();
    // Best-effort token holdings from transfer netting
    for (const tx of transactions) {
      // Skip native transfers as we use the direct balance endpoint for native
      if (tx.asset === nativeSymbol) continue;
      
      const incoming = (tx.to || '').toLowerCase() === addrLower;
      const outgoing = (tx.from || '').toLowerCase() === addrLower;
      
      if (incoming) {
        holdings[tx.asset] = (holdings[tx.asset] || 0) + tx.amount;
      }
      if (outgoing) {
        holdings[tx.asset] = (holdings[tx.asset] || 0) - tx.amount;
      }
    }

    // Cleanup holdings: remove zeros, tiny negatives, and handle rounding
    for (const [k, v] of Object.entries(holdings)) {
      if (!Number.isFinite(v) || v < 1e-10) {
        delete holdings[k];
      }
    }

    return { holdings, transactions };
  } catch (error) {
    console.error('[Etherscan] Error fetching wallet data:', error);
    throw error;
  }
}