/**
 * CoinGecko API integration for real crypto prices.
 *
 * NOTE: This project intentionally calls CoinGecko directly from the client
 * (no Supabase dependency). Rate limiting + caching are handled locally.
 */

// Asset symbol to CoinGecko ID mapping
export const ASSET_ID_MAP: Record<string, string> = {
  // Major cryptos
  ETH: 'ethereum',
  BTC: 'bitcoin',
  SOL: 'solana',
  MATIC: 'matic-network',
  POLYGON: 'matic-network',
  POL: 'matic-network',
  LINK: 'chainlink',
  UNI: 'uniswap',
  AAVE: 'aave',
  CRV: 'curve-dao-token',
  MKR: 'maker',
  COMP: 'compound-governance-token',
  SNX: 'synthetix-network-token',
  LDO: 'lido-dao',
  ARB: 'arbitrum',
  OP: 'optimism',
  AVAX: 'avalanche-2',
  ATOM: 'cosmos',
  DOT: 'polkadot',
  ADA: 'cardano',
  XRP: 'ripple',
  DOGE: 'dogecoin',
  SHIB: 'shiba-inu',
  TLM: 'alien-worlds',
  PEPE: 'pepe',
  
  // USD Stablecoins
  USDC: 'usd-coin',
  USDT: 'tether',
  DAI: 'dai',
  BUSD: 'binance-usd',
  TUSD: 'true-usd',
  FRAX: 'frax',
  LUSD: 'liquity-usd',
  GUSD: 'gemini-dollar',
  USDP: 'paxos-standard',
  
  // Euro-pegged stablecoins (26% rate applies)
  EURC: 'euro-coin',
  EUROC: 'euro-coin',
  EURS: 'stasis-eurs',
  EURT: 'tether-eurt',
  AGEUR: 'ageur',
  CEUR: 'celo-euro',
  SEUR: 'seur',
  JEUR: 'jarvis-synthetic-euro',
  PAR: 'parallel-protocol',
};

// Euro-pegged stablecoins for special tax treatment
export const EURO_STABLECOINS = new Set([
  'EURC', 'EUROC', 'EURS', 'EURT', 'AGEUR', 'CEUR', 'SEUR', 'JEUR', 'PAR'
]);

export interface PriceData {
  eur: number;
  eur_24h_change: number;
}

export interface HistoricalPriceData {
  market_data?: {
    current_price?: {
      eur?: number;
    };
  };
}

// Cache configuration
const CACHE_CURRENT_TTL = 5 * 60 * 1000; // 5 minutes for current prices
const CACHE_HISTORICAL_TTL = 60 * 60 * 1000; // 1 hour for historical prices
const RATE_LIMIT_DELAY = 2000; // 2 seconds between calls

// Queue for rate limiting
let lastCallTime = 0;

// In-flight request deduplication
let pendingRequest: Promise<Record<string, PriceData>> | null = null;
let pendingRequestSymbols: string | null = null;

const rateLimitedFetch = async (url: string): Promise<Response> => {
  const now = Date.now();
  const timeSinceLastCall = now - lastCallTime;
  
  if (timeSinceLastCall < RATE_LIMIT_DELAY) {
    await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY - timeSinceLastCall));
  }
  
  lastCallTime = Date.now();
  return fetch(url);
};

// Cache helpers
const getCacheKey = (prefix: string, key: string) => `coingecko_${prefix}_${key}`;

const getFromCache = <T>(key: string, ttl: number): T | null => {
  try {
    const cached = localStorage.getItem(key);
    if (!cached) return null;
    
    const { data, timestamp } = JSON.parse(cached);
    if (Date.now() - timestamp > ttl) {
      localStorage.removeItem(key);
      return null;
    }
    return data as T;
  } catch {
    return null;
  }
};

const setCache = <T>(key: string, data: T): void => {
  try {
    localStorage.setItem(key, JSON.stringify({
      data,
      timestamp: Date.now(),
    }));
  } catch {
    // localStorage might be full or disabled
  }
};

/**
 * Sanitize and validate asset symbols
 * Filters out spam tokens and invalid symbols
 */
const sanitizeSymbols = (symbols: string[]): string[] => {
  return symbols
    .map(s => s.toUpperCase().trim())
    .filter(s => {
      // Must be 1-10 characters
      if (s.length < 1 || s.length > 10) return false;
      // Must be alphanumeric only
      if (!/^[A-Z0-9]+$/.test(s)) return false;
      // Filter common spam patterns
      if (s.includes('VISIT') || s.includes('CLAIM') || s.includes('REWARD')) return false;
      return true;
    })
    .filter((s, i, arr) => arr.indexOf(s) === i); // Dedupe
};

/**
 * Get CoinGecko ID for an asset symbol
 */
export const getAssetId = (symbol: string): string | null => {
  const normalized = symbol.toUpperCase();
  return ASSET_ID_MAP[normalized] || null;
};

/**
 * Check if an asset is a euro-pegged stablecoin
 */
export const isEuroStablecoin = (symbol: string): boolean => {
  return EURO_STABLECOINS.has(symbol.toUpperCase());
};

/**
 * Get current prices for multiple assets
 * Uses edge function for reliability
 */
export const getCurrentPrices = async (
  assets: string[]
): Promise<Record<string, PriceData>> => {
  // Sanitize symbols first
  const cleanSymbols = sanitizeSymbols(assets);
  
  if (cleanSymbols.length === 0) {
    return {};
  }
  
  // Create cache key from sorted symbols
  const symbolsKey = cleanSymbols.sort().join(',');
  const cacheKey = getCacheKey('current', symbolsKey);
  
  // Check cache
  const cached = getFromCache<Record<string, PriceData>>(cacheKey, CACHE_CURRENT_TTL);
  if (cached) {
    console.log('[CoinGecko] Cache hit for', cleanSymbols.length, 'symbols');
    return cached;
  }
  
  // Deduplication: if same request is in-flight, wait for it
  if (pendingRequest && pendingRequestSymbols === symbolsKey) {
    console.log('[CoinGecko] Deduplicating request');
    return pendingRequest;
  }
  
  console.log('[CoinGecko] Fetching prices for', cleanSymbols.length, 'symbols');
  
  // Create the request promise
  pendingRequestSymbols = symbolsKey;
  pendingRequest = (async () => {
    try {
      // Map symbols -> CoinGecko ids
      const idPairs = cleanSymbols
        .map((s) => ({ symbol: s, id: getAssetId(s) }))
        .filter((p): p is { symbol: string; id: string } => Boolean(p.id));

      if (idPairs.length === 0) {
        return getFallbackPrices(assets);
      }

      // CoinGecko simple price supports batching many ids.
      const ids = Array.from(new Set(idPairs.map((p) => p.id))).join(',');
      const url = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(ids)}&vs_currencies=eur&include_24hr_change=true`;

      const resp = await rateLimitedFetch(url);
      if (!resp.ok) {
        console.warn('[CoinGecko] HTTP error:', resp.status);
        return getFallbackPrices(assets);
      }

      const json = (await resp.json()) as Record<string, { eur?: number; eur_24h_change?: number }>;

      const result: Record<string, PriceData> = {};
      for (const { symbol, id } of idPairs) {
        const p = json?.[id];
        if (!p) continue;
        result[symbol.toUpperCase()] = {
          eur: Number(p.eur ?? 0),
          eur_24h_change: Number(p.eur_24h_change ?? 0),
        };
      }

      if (Object.keys(result).length > 0) {
        setCache(cacheKey, result);
      }

      return result;
    } catch (err) {
      console.warn('[CoinGecko] Request error:', err);
      return getFallbackPrices(assets);
    } finally {
      setTimeout(() => {
        if (pendingRequestSymbols === symbolsKey) {
          pendingRequest = null;
          pendingRequestSymbols = null;
        }
      }, 100);
    }
  })();
  
  return pendingRequest;
};

/**
 * Get historical price for an asset on a specific date
 * Uses CoinGecko /coins/{id}/history endpoint
 * @param assetId - CoinGecko asset ID (e.g., 'ethereum')
 * @param date - Date string in YYYY-MM-DD format
 */
export const getHistoricalPrice = async (
  assetIdOrSymbol: string,
  date: string // YYYY-MM-DD format
): Promise<number | null> => {
  // Check if it's a symbol and convert to ID
  const assetId = ASSET_ID_MAP[assetIdOrSymbol.toUpperCase()] || assetIdOrSymbol;
  
  // Convert date from YYYY-MM-DD to DD-MM-YYYY (CoinGecko format)
  const [year, month, day] = date.split('-');
  const formattedDate = `${day}-${month}-${year}`;
  
  const cacheKey = getCacheKey('historical', `${assetId}_${date}`);
  const cached = getFromCache<number>(cacheKey, CACHE_HISTORICAL_TTL);
  if (cached !== null) return cached;
  
  const url = `https://api.coingecko.com/api/v3/coins/${assetId}/history?date=${formattedDate}&localization=false`;
  
  try {
    const response = await rateLimitedFetch(url);
    
    if (!response.ok) {
      console.warn('CoinGecko historical API error:', response.status);
      return null;
    }
    
    const data: HistoricalPriceData = await response.json();
    const price = data.market_data?.current_price?.eur || null;
    
    if (price !== null) {
      setCache(cacheKey, price);
    }
    
    return price;
  } catch (error) {
    console.warn('CoinGecko historical fetch error:', error);
    return null;
  }
};

/**
 * Get market chart data for an asset (for price curves)
 * Uses CoinGecko /coins/{id}/market_chart endpoint
 */
export const getMarketChart = async (
  assetIdOrSymbol: string,
  days: number = 30
): Promise<Array<{ timestamp: number; price: number }>> => {
  const assetId = ASSET_ID_MAP[assetIdOrSymbol.toUpperCase()] || assetIdOrSymbol;
  
  const cacheKey = getCacheKey('chart', `${assetId}_${days}`);
  const cached = getFromCache<Array<{ timestamp: number; price: number }>>(cacheKey, CACHE_CURRENT_TTL);
  if (cached) return cached;
  
  const url = `https://api.coingecko.com/api/v3/coins/${assetId}/market_chart?vs_currency=eur&days=${days}`;
  
  try {
    const response = await rateLimitedFetch(url);
    
    if (!response.ok) {
      console.warn('CoinGecko chart API error:', response.status);
      return [];
    }
    
    const data = await response.json();
    const prices = (data.prices || []).map((p: [number, number]) => ({
      timestamp: p[0],
      price: p[1],
    }));
    
    setCache(cacheKey, prices);
    return prices;
  } catch (error) {
    console.warn('CoinGecko chart fetch error:', error);
    return [];
  }
};

/**
 * Fallback mock prices when API is down
 */
// Fallback prices in EUR (updated Jan 2026) - used when API fails
const FALLBACK_PRICES: Record<string, PriceData> = {
  ETH: { eur: 3450, eur_24h_change: 0 },
  BTC: { eur: 97500, eur_24h_change: 0 },
  SOL: { eur: 195, eur_24h_change: 0 },
  MATIC: { eur: 0.48, eur_24h_change: 0 },
  POL: { eur: 0.48, eur_24h_change: 0 },
  USDC: { eur: 0.96, eur_24h_change: 0 },
  USDT: { eur: 0.96, eur_24h_change: 0 },
  DAI: { eur: 0.96, eur_24h_change: 0 },
  EURC: { eur: 1.0, eur_24h_change: 0 },
  EURS: { eur: 1.0, eur_24h_change: 0 },
  LINK: { eur: 24, eur_24h_change: 0 },
  UNI: { eur: 14.5, eur_24h_change: 0 },
  TLM: { eur: 0.012, eur_24h_change: 0 },
  DOGE: { eur: 0.32, eur_24h_change: 0 },
  SHIB: { eur: 0.000021, eur_24h_change: 0 },
  AVAX: { eur: 38, eur_24h_change: 0 },
  DOT: { eur: 6.8, eur_24h_change: 0 },
  ADA: { eur: 0.95, eur_24h_change: 0 },
  XRP: { eur: 2.35, eur_24h_change: 0 },
  PEPE: { eur: 0.000017, eur_24h_change: 0 },
  WBTC: { eur: 97500, eur_24h_change: 0 },
  ARB: { eur: 0.78, eur_24h_change: 0 },
  OP: { eur: 1.85, eur_24h_change: 0 },
  AAVE: { eur: 345, eur_24h_change: 0 },
};

const getFallbackPrices = (assets: string[]): Record<string, PriceData> => {
  const result: Record<string, PriceData> = {};
  for (const asset of assets) {
    const normalized = asset.toUpperCase();
    if (FALLBACK_PRICES[normalized]) {
      result[normalized] = FALLBACK_PRICES[normalized];
    }
  }
  return result;
};

/**
 * Calculate portfolio value with real prices
 */
export const calculateRealPortfolioValue = async (
  holdings: Record<string, number>
): Promise<{
  total: number;
  breakdown: Record<string, { amount: number; valueEur: number; change24h: number }>;
  usingFallback: boolean;
}> => {
  const assets = Object.keys(holdings);
  if (assets.length === 0) {
    return { total: 0, breakdown: {}, usingFallback: false };
  }
  
  const prices = await getCurrentPrices(assets);
  const hasFallback = Object.keys(prices).length < assets.length;
  
  let total = 0;
  const breakdown: Record<string, { amount: number; valueEur: number; change24h: number }> = {};
  
  for (const [asset, amount] of Object.entries(holdings)) {
    const normalized = asset.toUpperCase();
    const priceData = prices[normalized];
    
    if (priceData) {
      const valueEur = amount * priceData.eur;
      breakdown[normalized] = {
        amount,
        valueEur,
        change24h: priceData.eur_24h_change,
      };
      total += valueEur;
    } else {
      // Unknown asset, skip
      breakdown[normalized] = {
        amount,
        valueEur: 0,
        change24h: 0,
      };
    }
  }
  
  return { total, breakdown, usingFallback: hasFallback };
};
