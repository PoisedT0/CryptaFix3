// Unified crypto provider abstraction
// Supports Etherscan, Infura, Alchemy, and Bitcoin (Blockstream/Mempool)

import { fetchWalletDataInfura, type InfuraWalletData, CHAIN_CONFIGS, type SupportedChain, type ChainConfig } from './infura-api';
import { fetchBitcoinWalletData, type BitcoinWalletData } from './bitcoin-api';
import { fetchEtherscanWalletData } from './etherscan-api';
import { fetchSolanaWalletData } from './solana-api';
import { hashApiKey } from './apiKeyHash';
import type { Provider, TransactionCategory, StoredProviderConfig } from './types';

// Re-export types for backwards compatibility
export type { Provider, TransactionCategory, StoredProviderConfig };

export interface ProviderConfig {
  provider: Provider;
  apiKey: string;
}

export interface WalletTransaction {
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
  category?: TransactionCategory;
}

export interface WalletData {
  holdings: Record<string, number>;
  transactions: WalletTransaction[];
  valueEur: number;
  address: string;
  chain: string;
  provider: Provider;
}

// Re-export chain configs
export { CHAIN_CONFIGS, type SupportedChain, type ChainConfig };

// Supported chains with UI info
export type SupportedUIChain = 'ETH' | 'BTC' | 'MATIC' | 'ARB' | 'BASE' | 'OP' | 'ZK' | 'SOL' | 'BSC' | 'LINEA';

export interface ChainUIConfig {
  value: SupportedUIChain;
  label: string;
  icon: string;
  apiChain: string;
  color: string;
}

export const CHAINS: ChainUIConfig[] = [
  { value: 'ETH', label: 'Ethereum', icon: '⟠', apiChain: 'ethereum', color: 'text-blue-400' },
  { value: 'BTC', label: 'Bitcoin', icon: '₿', apiChain: 'bitcoin', color: 'text-orange-400' },
  { value: 'SOL', label: 'Solana', icon: '◎', apiChain: 'solana', color: 'text-gradient-to-r from-purple-400 to-cyan-400' },
  { value: 'LINEA', label: 'Linea', icon: '🟩', apiChain: 'linea', color: 'text-emerald-400' },
  { value: 'BSC', label: 'BNB Chain', icon: '🔶', apiChain: 'bsc', color: 'text-yellow-400' },
  { value: 'MATIC', label: 'Polygon', icon: '⬡', apiChain: 'polygon', color: 'text-purple-400' },
  { value: 'ARB', label: 'Arbitrum', icon: '◈', apiChain: 'arbitrum', color: 'text-cyan-400' },
  { value: 'BASE', label: 'Base', icon: '🔵', apiChain: 'base', color: 'text-blue-500' },
  { value: 'OP', label: 'Optimism', icon: '🔴', apiChain: 'optimism', color: 'text-red-400' },
  { value: 'ZK', label: 'zkSync Era', icon: '⚡', apiChain: 'zksync', color: 'text-indigo-400' },
];

// Provider labels for UI
export const PROVIDER_LABELS: Record<Provider, string> = {
  etherscan: 'Etherscan',
  polygonscan: 'PolygonScan',
  arbiscan: 'ArbiScan',
  lineascan: 'LineaScan',
  bscscan: 'BscScan',
  infura: 'Infura',
  alchemy: 'Alchemy',
  bitcoin: 'Blockstream',
  solana: 'Solana RPC',
};

// Key input labels per provider
export const PROVIDER_KEY_LABELS: Record<Provider, string> = {
  etherscan: 'Etherscan API Key',
  polygonscan: 'Polygonscan API Key',
  arbiscan: 'Arbiscan API Key',
  lineascan: 'Lineascan API Key',
  bscscan: 'BscScan API Key',
  infura: 'Infura Project ID',
  alchemy: 'Alchemy API Key',
  bitcoin: 'Non richiesta (API pubblica)',
  solana: 'Non richiesta (RPC pubblica)',
};

// Provider descriptions
export const PROVIDER_DESCRIPTIONS: Record<Provider, string> = {
  etherscan: 'Ottimo per transazioni dettagliate',
  polygonscan: 'Explorer dedicato per Polygon',
  arbiscan: 'Explorer dedicato per Arbitrum',
  lineascan: 'Explorer dedicato per Linea',
  bscscan: 'Explorer dedicato per BNB Chain',
  infura: 'Stabile per multi-chain, gratuito su infura.io',
  alchemy: 'Veloce e affidabile per grandi volumi',
  bitcoin: 'API pubblica per Bitcoin (Blockstream/Mempool)',
  solana: 'RPC pubblico per Solana (read-only)',
};

// Network mapping per provider
const NETWORK_MAP: Record<Provider, Record<string, string>> = {
  etherscan: {
    ethereum: 'mainnet',
    polygon: 'polygon',
    arbitrum: 'arbitrum',
    base: 'base',
    optimism: 'optimism',
    // bsc/linea handled by dedicated providers
  },
  polygonscan: {
    polygon: 'polygon',
  },
  arbiscan: {
    arbitrum: 'arbitrum',
  },
  lineascan: {
    linea: 'linea',
  },
  bscscan: {
    bsc: 'bsc',
  },
  infura: {
    ethereum: 'ethereum',
    polygon: 'polygon',
    arbitrum: 'arbitrum',
    optimism: 'optimism',
  },
  alchemy: {
    ethereum: 'eth-mainnet',
    polygon: 'polygon-mainnet',
    arbitrum: 'arb-mainnet',
    base: 'base-mainnet',
    optimism: 'opt-mainnet',
    zksync: 'zksync-mainnet',
    solana: 'solana-mainnet',
  },
  bitcoin: {
    bitcoin: 'mainnet',
  },
  solana: {
    solana: 'mainnet',
  },
};

// Get best provider for a given chain
export function getBestProviderForChain(chain: string): Provider {
  if (chain === 'bitcoin') return 'bitcoin';
  if (chain === 'solana') return 'solana';
  if (chain === 'linea') return 'lineascan';
  if (chain === 'bsc') return 'bscscan';
  
  // Etherscan family supports: ETH, Base, Optimism
  if (chain === 'polygon') return 'polygonscan';
  if (chain === 'arbitrum') return 'arbiscan';
  if (['ethereum', 'base', 'optimism'].includes(chain)) return 'etherscan';
  
  // zkSync uses Alchemy by default
  if (chain === 'zksync') {
    return 'alchemy';
  }
  
  return 'infura';
}

/**
 * Fetch wallet data using Etherscan-family explorers directly (no backend).
 */
async function fetchWithEtherscan(
  provider: Provider,
  address: string,
  network: string,
  apiKey: string
): Promise<WalletData | null> {
  const data = await fetchEtherscanWalletData(address, network, apiKey);
  if (!data) return null;
  return {
    holdings: data.holdings,
    transactions: data.transactions,
    valueEur: 0,
    address,
    chain: network,
    provider,
  };
}

/**
 * Fetch wallet data using Infura
 */
async function fetchWithInfura(
  address: string,
  network: string,
  projectId: string
): Promise<WalletData | null> {
  const data = await fetchWalletDataInfura(address, network, projectId);
  
  if (!data) return null;

  return {
    holdings: data.holdings,
    transactions: data.transactions,
    valueEur: data.valueEur,
    address: data.address,
    chain: data.chain,
    provider: 'infura',
  };
}

/**
 * Fetch wallet data using Alchemy
 * Note: Similar to Infura, uses ethers.js with Alchemy RPC
 */
async function fetchWithAlchemy(
  address: string,
  network: string,
  apiKey: string
): Promise<WalletData | null> {
  // Alchemy uses similar approach to Infura
  // For now, we'll implement a basic version using their RPC
  const alchemyNetworks: Record<string, string> = {
    ethereum: `https://eth-mainnet.g.alchemy.com/v2/${apiKey}`,
    polygon: `https://polygon-mainnet.g.alchemy.com/v2/${apiKey}`,
    arbitrum: `https://arb-mainnet.g.alchemy.com/v2/${apiKey}`,
  };

  const rpcUrl = alchemyNetworks[network];
  if (!rpcUrl) {
    throw new Error(`Network ${network} not supported by Alchemy`);
  }

  try {
    const { ethers } = await import('ethers');
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const holdings: Record<string, number> = {};

    // Get native token balance
    const nativeSymbol = network === 'polygon' ? 'MATIC' : 'ETH';
    const balance = await provider.getBalance(address);
    const amount = Number(ethers.formatEther(balance));

    if (amount > 0) {
      holdings[nativeSymbol] = amount;
    }

    return {
      holdings,
      transactions: [],
      valueEur: 0,
      address,
      chain: network,
      provider: 'alchemy',
    };
  } catch (err) {
    console.error('[Alchemy] Error:', err);
    throw err;
  }
}

/**
 * Fetch wallet data using Bitcoin public APIs (Blockstream/Mempool)
 */
async function fetchWithBitcoin(
  address: string
): Promise<WalletData | null> {
  const data = await fetchBitcoinWalletData(address);
  
  if (!data) return null;

  return {
    holdings: data.holdings,
    transactions: data.transactions,
    valueEur: data.valueEur,
    address: data.address,
    chain: data.chain,
    provider: 'bitcoin',
  };
}

/**
 * Fetch wallet data using Solana public RPC (no API key).
 */
async function fetchWithSolana(address: string): Promise<WalletData | null> {
  const data = await fetchSolanaWalletData(address);
  if (!data) return null;
  return {
    holdings: data.holdings,
    transactions: data.transactions,
    valueEur: data.valueEur,
    address: data.address,
    chain: data.chain,
    provider: 'solana',
  };
}

/**
 * Unified function to fetch wallet data from any provider
 */
export async function fetchWalletData(
  provider: Provider,
  network: string,
  address: string,
  apiKey: string
): Promise<WalletData | null> {
  console.log(`[Provider] Fetching with ${provider} for ${network}:${address}`);

  switch (provider) {
    case 'etherscan':
      return fetchWithEtherscan(provider, address, network, apiKey);
    case 'polygonscan':
      return fetchWithEtherscan(provider, address, network, apiKey);
    case 'arbiscan':
      return fetchWithEtherscan(provider, address, network, apiKey);
    case 'lineascan':
      return fetchWithEtherscan(provider, address, network, apiKey);
    case 'bscscan':
      return fetchWithEtherscan(provider, address, network, apiKey);
    case 'infura':
      return fetchWithInfura(address, network, apiKey);
    case 'alchemy':
      return fetchWithAlchemy(address, network, apiKey);
    case 'bitcoin':
      return fetchWithBitcoin(address);
    case 'solana':
      return fetchWithSolana(address);
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

/**
 * Fetch with fallback - tries providers in order until one succeeds
 */
export async function fetchWalletDataWithFallback(
  address: string,
  network: string,
  providerConfigs: ProviderConfig[]
): Promise<WalletData | null> {
  const errors: string[] = [];

  for (const config of providerConfigs) {
    try {
      console.log(`[Fallback] Trying ${config.provider}...`);
      const result = await fetchWalletData(config.provider, network, address, config.apiKey);
      if (result) {
        console.log(`[Fallback] Success with ${config.provider}`);
        return result;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`${config.provider}: ${message}`);
      console.log(`[Fallback] ${config.provider} failed:`, message);
    }
  }

  console.error('[Fallback] All providers failed:', errors);
  throw new Error(`All providers failed: ${errors.join('; ')}`);
}

/**
 * Storage functions for provider configs
 * Now using centralized encrypted storage from storage.ts
 */
import { getProviderConfigs, saveProviderConfigs } from './storage';

/**
 * Get stored provider configs from localStorage (decrypts automatically via storage.ts)
 */
export function getStoredProviders(): StoredProviderConfig[] {
  try {
    return getProviderConfigs();
  } catch {
    return [];
  }
}

/**
 * Save provider config to localStorage (encrypts automatically via storage.ts)
 */
export function saveProviderConfig(config: StoredProviderConfig): void {
  const configs = getStoredProviders();
  
  // Add hash for the API key
  const configWithHash: StoredProviderConfig = {
    ...config,
    apiKeyHash: config.apiKey ? hashApiKey(config.apiKey) : undefined,
  };
  
  // Update or add
  const existingIndex = configs.findIndex(c => 
    c.provider === config.provider && c.walletId === config.walletId
  );
  
  if (existingIndex >= 0) {
    configs[existingIndex] = configWithHash;
  } else {
    configs.push(configWithHash);
  }
  
  // Save encrypted
  saveProviderConfigs(configs);
}

/**
 * Delete provider config from storage
 */
export function deleteProviderConfig(provider: Provider, walletId?: string): void {
  const configs = getStoredProviders();
  const filtered = configs.filter(c => 
    !(c.provider === provider && c.walletId === walletId)
  );
  
  saveProviderConfigs(filtered);
}

/**
 * Verify if stored API key matches (using hash)
 */
export function verifyStoredApiKey(provider: Provider, apiKey: string, walletId?: string): boolean {
  const configs = getStoredProviders();
  const config = configs.find(c => c.provider === provider && c.walletId === walletId);
  if (!config || !config.apiKeyHash) return false;
  return hashApiKey(apiKey) === config.apiKeyHash;
}

/**
 * Get default provider config (first available with key)
 */
export function getDefaultProviderConfig(): StoredProviderConfig | null {
  const configs = getStoredProviders();
  return configs.find(c => !c.walletId && c.apiKey) || null;
}

/**
 * Get provider config for a specific wallet
 */
export function getWalletProviderConfig(walletId: string): StoredProviderConfig | null {
  const configs = getStoredProviders();
  return configs.find(c => c.walletId === walletId) || getDefaultProviderConfig();
}

/**
 * Clear all stored API keys (for security reset)
 */
export function clearAllProviderConfigs(): void {
  saveProviderConfigs([]);
}
