import { useState, useCallback } from 'react';
import { etherscanLimiter, coingeckoLimiter } from '@/lib/api-rate-limiter';
import { toast } from '@/hooks/use-toast';
import { getCurrentPrices as getCoingeckoPrices } from '@/lib/coingecko-api';
import { fetchWalletDataWithFallback, getBestProviderForChain } from '@/lib/crypto-providers';
import { getProviderConfigs } from '@/lib/storage';
function escapeHtml(input: string): string {
  return input
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export interface CryptoPrice {
  price: number;
  change24h: number;
  marketCap: number;
}

export interface Transaction {
  hash: string;
  type: 'buy' | 'sell' | 'transfer';
  asset: string;
  amount: number;
  timestamp: string;
  valueEur: number;
  fee: number;
  from?: string;
  to?: string;
}

export interface WalletData {
  transactions: Transaction[];
  holdings: Record<string, number>;
  address: string;
  chain: string;
}

export function useCryptoApi() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function abortable<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
    if (!signal) return promise;
    if (signal.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'));
    return new Promise<T>((resolve, reject) => {
      const onAbort = () => reject(new DOMException('Aborted', 'AbortError'));
      signal.addEventListener('abort', onAbort, { once: true });
      promise
        .then((v) => {
          signal.removeEventListener('abort', onAbort);
          resolve(v);
        })
        .catch((e) => {
          signal.removeEventListener('abort', onAbort);
          reject(e);
        });
    });
  }

  const fetchPrices = useCallback(async (symbols: string[], opts?: { signal?: AbortSignal }): Promise<Record<string, CryptoPrice> | null> => {
    if (!symbols || symbols.length === 0) return {};
    
    setLoading(true);
    setError(null);
    
    try {
      // Use client-side CoinGecko (rate-limited + cached in lib)
      const prices = await abortable(
        coingeckoLimiter.enqueue(`prices-${symbols.join(',')}`, async () => getCoingeckoPrices(symbols)),
        opts?.signal
      );

      const result: Record<string, CryptoPrice> = {};
      for (const [symbol, data] of Object.entries(prices)) {
        result[symbol] = {
          price: data.eur,
          change24h: data.eur_24h_change,
          marketCap: 0,
        };
      }
      return result;
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return null;
      }
      const message = err instanceof Error ? err.message : 'Failed to fetch prices';
      
      // CoinGecko rate limits are handled in lib; show a friendly message if we still fail.
      if (message.toLowerCase().includes('429') || message.toLowerCase().includes('rate limit')) {
        toast({
          title: 'Rate limit API',
          description: 'CoinGecko sta limitando le richieste. Riprova tra poco.',
        });
      }
      
      setError(message);
      console.error('Error fetching prices:', err);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchWalletData = useCallback(async (
    address: string, 
    chain: string = 'ethereum',
    opts?: { signal?: AbortSignal }
  ): Promise<WalletData | null> => {
    setLoading(true);
    setError(null);
    
    try {
      // Determine provider order based on stored configs (per-wallet) and chain defaults.
      const stored = getProviderConfigs();
      const best = getBestProviderForChain(chain);

      // Provider configs are stored per-wallet (walletId). In this hook we don't have
      // walletId, so we use any available keys as a best-effort. The UI/settings layer
      // should be the source of truth.
      const providerConfigs = stored
        .filter((c) => Boolean(c.apiKey) || c.provider === 'bitcoin')
        .map((c) => ({ provider: c.provider, apiKey: c.apiKey || '' }));

      // Ensure we at least try the best provider (even if key is missing, so we can
      // return a friendly error from the provider layer).
      if (!providerConfigs.some((p) => p.provider === best)) {
        providerConfigs.unshift({ provider: best, apiKey: '' });
      }

      const result = await abortable(
        etherscanLimiter.enqueue(`wallet-${address}-${chain}`, async () => {
          const data = await fetchWalletDataWithFallback(address, chain, providerConfigs);
          return {
            transactions: data.transactions.map((t) => ({
              hash: t.hash,
              type: t.type,
              asset: t.asset,
              amount: t.amount,
              timestamp: new Date(t.timestamp).toISOString(),
              valueEur: t.valueEur,
              fee: t.fee,
              from: t.from,
              to: t.to,
            })),
            holdings: data.holdings,
            address: data.address,
            chain: data.chain,
          } as WalletData;
        }),
        opts?.signal
      );

      return result;
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return null;
      }
      const message = err instanceof Error ? err.message : 'Failed to fetch wallet data';

      if (message.toLowerCase().includes('missing api key')) {
        toast({
          title: 'API key mancante',
          description: 'Aggiungi key in Settings → Providers',
          variant: 'destructive',
        });
      }
      
      // Check for rate limit error
      if (message.toLowerCase().includes('429') || message.toLowerCase().includes('rate limit')) {
        toast({
          title: 'Rate limit rilevato',
          description: 'Ritento automaticamente...',
          variant: 'destructive',
        });
      }
      
      setError(message);
      console.error('Error fetching wallet data:', err);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const exportReport = useCallback(async (
    format: 'csv' | 'pdf',
    transactions: Transaction[],
    holdings: Record<string, { amount: number; valueEur: number }>,
    summary: { totalValue: number; totalGain: number; estimatedTax: number; year: number }
  ): Promise<void> => {
    setLoading(true);
    setError(null);
    
    try {
      // Local export (no backend): CSV or HTML.
      let contents = '';
      let mime = 'text/plain';
      let ext = 'txt';

      if (format === 'csv') {
        ext = 'csv';
        mime = 'text/csv';
        const header = ['timestamp', 'hash', 'type', 'asset', 'amount', 'valueEur', 'fee'].join(',');
        const rows = transactions.map((t) =>
          [
            JSON.stringify(t.timestamp),
            JSON.stringify(t.hash),
            JSON.stringify(t.type),
            JSON.stringify(t.asset),
            String(t.amount),
            String(t.valueEur),
            String(t.fee),
          ].join(',')
        );
        contents = [header, ...rows].join('\n');
      } else {
        ext = 'html';
        mime = 'text/html';
        contents = `<!doctype html><html><head><meta charset="utf-8"/><title>Crypta Report</title></head><body>` +
          `<h1>Crypta Report ${summary.year}</h1>` +
          `<p>Total value: €${summary.totalValue.toFixed(2)}</p>` +
          `<p>Total gain: €${summary.totalGain.toFixed(2)}</p>` +
          `<p>Estimated tax: €${summary.estimatedTax.toFixed(2)}</p>` +
          `<h2>Holdings</h2>` +
          `<pre>${escapeHtml(JSON.stringify(holdings, null, 2))}</pre>` +
          `<h2>Transactions</h2>` +
          `<pre>${escapeHtml(JSON.stringify(transactions, null, 2))}</pre>` +
          `</body></html>`;
      }

      const blob = new Blob([contents], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `crypta-report-${summary.year}.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to export report';
      setError(message);
      console.error('Error exporting report:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    loading,
    error,
    fetchPrices,
    fetchWalletData,
    exportReport,
  };
}
