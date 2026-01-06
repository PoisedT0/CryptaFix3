// Etherscan-family API integration (client-side)
// Supports ETH, Polygon, Arbitrum, Base, Optimism, BSC via their "scan" explorers.
//
// This replaces the previous Supabase Edge Function dependency.

import { CHAIN_CONFIGS } from './infura-api';
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
  timeStamp: string;
  from: string;
  to: string;
  value: string;
  gasPrice?: string;
  gasUsed?: string;
  isError?: string;
};

type TokenTxItem = {
  hash: string;
  timeStamp: string;
  from: string;
  to: string;
  value: string;
  tokenSymbol: string;
  tokenDecimal: string;
};

function ensureApiKey(apiKey: string, network: string): void {
  if (!apiKey || apiKey.trim().length < 3) {
    throw new Error(
      `Missing API key for Etherscan-family provider on ${network}. Add it in Settings → Providers.`
    );
  }
}

function parseWeiToEth(wei: string): number {
  // Avoid bringing a big decimal lib here; this is best-effort.
  const v = BigInt(wei || '0');
  const eth = Number(v) / 1e18;
  return Number.isFinite(eth) ? eth : 0;
}

function parseTokenAmount(value: string, decimals: string): number {
  const d = Number(decimals || 0);
  const v = BigInt(value || '0');
  const pow10 = (n: number): bigint => {
    let r = 1n;
    for (let i = 0; i < n; i++) r *= 10n;
    return r;
  };

  // Try to keep values within JS number range. For large decimals, scale down.
  if (d > 18) {
    const scaled = Number(v / pow10(d - 18)) / 1e18;
    return Number.isFinite(scaled) ? scaled : 0;
  }

  const denom = 10 ** d;
  const scaled = Number(v) / denom;
  return Number.isFinite(scaled) ? scaled : 0;
}

async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

export async function fetchEtherscanWalletData(
  address: string,
  network: string,
  apiKey: string,
  signal?: AbortSignal
): Promise<{ holdings: Record<string, number>; transactions: EtherscanWalletTransaction[] } | null> {
  ensureApiKey(apiKey, network);

  // Prefer local mapping for explorers not present in CHAIN_CONFIGS (e.g., BSC, Linea).
  const EXPLORER_API: Record<string, { apiBase: string; nativeSymbol: string }> = {
    ethereum: { apiBase: 'https://api.etherscan.io/api', nativeSymbol: 'ETH' },
    polygon: { apiBase: 'https://api.polygonscan.com/api', nativeSymbol: 'MATIC' },
    arbitrum: { apiBase: 'https://api.arbiscan.io/api', nativeSymbol: 'ETH' },
    base: { apiBase: 'https://api.basescan.org/api', nativeSymbol: 'ETH' },
    optimism: { apiBase: 'https://api-optimistic.etherscan.io/api', nativeSymbol: 'ETH' },
    bsc: { apiBase: 'https://api.bscscan.com/api', nativeSymbol: 'BNB' },
    linea: { apiBase: 'https://api.lineascan.build/api', nativeSymbol: 'ETH' },
  };

  const fallbackCfg = EXPLORER_API[network];
  const cfg = (CHAIN_CONFIGS as any)[network];
  const apiBase: string | undefined = fallbackCfg?.apiBase || cfg?.etherscanApi;
  const nativeSymbol: string = fallbackCfg?.nativeSymbol || cfg?.nativeToken || (network === 'polygon' ? 'MATIC' : 'ETH');
  if (!apiBase) throw new Error(`Explorer API not configured for network: ${network}`);

  // Fetch on-chain native balance (more reliable than netting txs).
  const balanceUrl = `${apiBase}?module=account&action=balance&address=${encodeURIComponent(
    address
  )}&tag=latest&apikey=${encodeURIComponent(apiKey)}`;

  // Fetch normal tx list (native transfers). We keep it simple: last 1000, ascending.
  const txUrl = `${apiBase}?module=account&action=txlist&address=${encodeURIComponent(
    address
  )}&startblock=0&endblock=99999999&sort=asc&apikey=${encodeURIComponent(apiKey)}`;

  // Fetch ERC20 token transfers.
  const tokenUrl = `${apiBase}?module=account&action=tokentx&address=${encodeURIComponent(
    address
  )}&startblock=0&endblock=99999999&sort=asc&apikey=${encodeURIComponent(apiKey)}`;

  type ApiResp<T> = { status: string; message: string; result: T };

  const [balResp, txResp, tokenResp] = await Promise.all([
    fetchJson<ApiResp<string>>(balanceUrl, signal).catch(() => ({ status: '0', message: 'err', result: '0' } as any)),
    fetchJson<ApiResp<TxListItem[]>>(txUrl, signal),
    fetchJson<ApiResp<TokenTxItem[]>>(tokenUrl, signal).catch(() => ({ status: '0', message: 'err', result: [] as TokenTxItem[] })),
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
    const feeWei = BigInt(t.gasUsed || '0') * BigInt(t.gasPrice || '0');
    const fee = Number(feeWei) / 1e18;
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

  // Holdings: start from native balance.
  const holdings: Record<string, number> = {};
  const nativeBalance = parseWeiToEth((balResp as any)?.result || '0');
  if (nativeBalance > 0) holdings[nativeSymbol] = nativeBalance;
  const addrLower = address.toLowerCase();
  // Best-effort token holdings from transfer netting.
  for (const tx of transactions) {
    const incoming = (tx.to || '').toLowerCase() === addrLower;
    const sign = incoming ? 1 : -1;
    if (tx.asset === nativeSymbol) continue; // native handled by balance endpoint
    holdings[tx.asset] = (holdings[tx.asset] || 0) + sign * tx.amount;
  }

  // Remove zeros / tiny negatives from rounding.
  for (const [k, v] of Object.entries(holdings)) {
    if (!Number.isFinite(v) || Math.abs(v) < 1e-12) {
      delete holdings[k];
      continue;
    }
    if (v < 0) holdings[k] = 0;
  }

  return { holdings, transactions };
}
