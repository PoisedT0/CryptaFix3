// Etherscan API V2 Integration (client-side)
// Supports ETH, Polygon, Arbitrum, Base, Optimism, BSC via their "scan" explorers.
//

// Migrated from deprecated V1 endpoints to V2 API

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
    const v = BigInt(wei || '0');
    const eth = Number(v) / 1e18;
    return Number.isFinite(eth) ? eth : 0;
  } catch (e) {
    console.warn('[Etherscan] Failed to parse wei:', wei, e);
    return 0;
  }
}

function parseTokenAmount(value: string, decimals: string): number {
  try {
    const d = Number(decimals || 0);
    const v = BigInt(value || '0');
    const pow10 = (n: number): bigint => {
      let r = 1n;
      for (let i = 0; i < n; i++) r *= 10n;
      return r;
    };

    if (d > 18) {
      const scaled = Number(v / pow10(d - 18)) / 1e18;
      return Number.isFinite(scaled) ? scaled : 0;
    }

    const denom = 10 ** d;
    const scaled = Number(v) / denom;
    return Number.isFinite(scaled) ? scaled : 0;
  } catch (e) {
    console.warn('[Etherscan] Failed to parse token amount:', value, decimals, e);
    return 0;
  }
}

async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  
  // Check for API errors in V2 response
  if (data.status === '0' || data.message === 'NOTOK') {
    throw new Error(data.result || 'API Error');
  }
  
  return data as T;
}

export async function fetchEtherscanWalletData(
  address: string,
  network: string,
  apiKey: string,
  signal?: AbortSignal
): Promise<{ holdings: Record<string, number>; transactions: EtherscanWalletTransaction[] } | null> {
  ensureApiKey(apiKey, network);

  const EXPLORER_API: Record<string, { apiBase: string; nativeSymbol: string }> = {
    ethereum: { apiBase: 'https://api.etherscan.io/api', nativeSymbol: 'ETH' },
    polygon: { apiBase: 'https://api.polygonscan.com/api', nativeSymbol: 'MATIC' },
    arbitrum: { apiBase: 'https://api.arbiscan.io/api', nativeSymbol: 'ETH' },
    base: { apiBase: 'https://api.basescan.org/api', nativeSymbol: 'ETH' },
    optimism: { apiBase: 'https://api-optimistic.etherscan.io/api', nativeSymbol: 'ETH' },
    bsc: { apiBase: 'https://api.bscscan.com/api', nativeSymbol: 'BNB' },
    linea: { apiBase: 'https://api.lineascan.build/api', nativeSymbol: 'ETH' },
  };

  const cfg = EXPLORER_API[network];
  const apiBase: string | undefined = cfg?.apiBase;
  const nativeSymbol: string = cfg?.nativeSymbol || 'ETH';
  
  if (!apiBase) throw new Error(`Explorer API not configured for network: ${network}`);

  // V2 API: Fetch on-chain native balance
  const balanceUrl = `${apiBase}?module=account&action=balance&address=${encodeURIComponent(
    address
  )}&tag=latest&apikey=${encodeURIComponent(apiKey)}`;

  // V2 API: Fetch normal tx list (native transfers)
  const txUrl = `${apiBase}?module=account&action=txlist&address=${encodeURIComponent(
    address
  )}&startblock=0&endblock=99999999&sort=asc&apikey=${encodeURIComponent(apiKey)}`;

  // V2 API: Fetch ERC20 token transfers
  const tokenUrl = `${apiBase}?module=account&action=tokentx&address=${encodeURIComponent(
    address
  )}&startblock=0&endblock=99999999&sort=asc&apikey=${encodeURIComponent(apiKey)}`;

  type ApiResp<T> = { status: string; message: string; result: T };

  try {
    const [balResp, txResp, tokenResp] = await Promise.all([
      fetchJson<ApiResp<string>>(balanceUrl, signal).catch(() => ({ status: '0', message: 'err', result: '0' } as any)),
      fetchJson<ApiResp<TxListItem[]>>(txUrl, signal).catch(() => ({ status: '0', message: 'err', result: [] } as any)),
      fetchJson<ApiResp<TokenTxItem[]>>(tokenUrl, signal).catch(() => ({ status: '0', message: 'err', result: [] } as any)),
    ]);

    const txItems: TxListItem[] = Array.isArray(txResp.result) ? txResp.result : [];
    const tokenItems: TokenTxItem[] = Array.isArray(tokenResp.result) ? tokenResp.result : [];

    const transactions: EtherscanWalletTransaction[] = [];

    // Native transfers
    for (const t of txItems) {
      if (t.isError === '1') continue;
      const amount = parseWeiToEth(t.value);
      if (!amount || amount === 0) continue;
      const ts = Number(t.timeStamp) * 1000;
      
      let fee = 0;
      try {
        if (t.gasUsed && t.gasPrice) {
          const feeWei = BigInt(t.gasUsed) * BigInt(t.gasPrice);
          fee = Number(feeWei) / 1e18;
        }
      } catch (e) {
        console.warn('[Etherscan] Failed to calculate fee:', e);
      }

      transactions.push({
        hash: t.hash,
        type: 'transfer',
        asset: nativeSymbol,
        amount,
        timestamp: ts,
        valueEur: 0,
        fee: Number.isFinite(fee) ? fee : 0,
        feeEur: 0,
        from: t.from,
        to: t.to,
      });
    }

    // ERC20 transfers
    for (const t of tokenItems) {
      const amount = parseTokenAmount(t.value, t.tokenDecimal);
      if (!amount || amount === 0) continue;
      const ts = Number(t.timeStamp) * 1000;
      transactions.push({
        hash: t.hash,
        type: 'transfer',
        asset: (t.tokenSymbol || '').toUpperCase(),
        amount,
        timestamp: ts,
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
    if (nativeBalance > 0) holdings[nativeSymbol] = nativeBalance;
    
    const addrLower = address.toLowerCase();
    // Best-effort token holdings from transfer netting
    for (const tx of transactions) {
      const incoming = (tx.to || '').toLowerCase() === addrLower;
      const sign = incoming ? 1 : -1;
      if (tx.asset === nativeSymbol) continue; // native handled by balance endpoint
      holdings[tx.asset] = (holdings[tx.asset] || 0) + sign * tx.amount;
    }

    // Remove zeros / tiny negatives from rounding
    for (const [k, v] of Object.entries(holdings)) {
      if (!Number.isFinite(v) || Math.abs(v) < 1e-12) {
        delete holdings[k];
        continue;
      }
      if (v < 0) holdings[k] = 0;
    }

    return { holdings, transactions };
  } catch (error) {
    console.error('[Etherscan] Error fetching wallet data:', error);
    throw error;
  }
}
