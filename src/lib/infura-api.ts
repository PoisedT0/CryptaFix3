// Infura API integration using ethers.js v6
// Independent provider for Ethereum, Polygon, Arbitrum, Base, Optimism, zkSync Era

import { ethers, type Provider } from 'ethers';
import { getCurrentPrices, type PriceData } from './coingecko-api';

// Supported chains configuration
export type SupportedChain = 'ethereum' | 'polygon' | 'arbitrum' | 'base' | 'optimism' | 'zksync';

export interface ChainConfig {
  name: string;
  symbol: string;
  icon: string;
  nativeToken: string;
  infuraEndpoint?: string;
  alchemyEndpoint?: string;
  publicRpc?: string;
  etherscanApi?: string;
  explorerUrl: string;
}

// Chain configurations
export const CHAIN_CONFIGS: Record<SupportedChain, ChainConfig> = {
  ethereum: {
    name: 'Ethereum',
    symbol: 'ETH',
    icon: '⟠',
    nativeToken: 'ETH',
    infuraEndpoint: 'https://mainnet.infura.io/v3/',
    alchemyEndpoint: 'https://eth-mainnet.g.alchemy.com/v2/',
    publicRpc: 'https://eth.llamarpc.com',
    etherscanApi: 'https://api.etherscan.io/api',
    explorerUrl: 'https://etherscan.io',
  },
  polygon: {
    name: 'Polygon',
    symbol: 'MATIC',
    icon: '⬡',
    nativeToken: 'MATIC',
    infuraEndpoint: 'https://polygon-mainnet.infura.io/v3/',
    alchemyEndpoint: 'https://polygon-mainnet.g.alchemy.com/v2/',
    publicRpc: 'https://polygon.llamarpc.com',
    etherscanApi: 'https://api.polygonscan.com/api',
    explorerUrl: 'https://polygonscan.com',
  },
  arbitrum: {
    name: 'Arbitrum',
    symbol: 'ARB',
    icon: '◈',
    nativeToken: 'ETH',
    infuraEndpoint: 'https://arbitrum-mainnet.infura.io/v3/',
    alchemyEndpoint: 'https://arb-mainnet.g.alchemy.com/v2/',
    publicRpc: 'https://arbitrum.llamarpc.com',
    etherscanApi: 'https://api.arbiscan.io/api',
    explorerUrl: 'https://arbiscan.io',
  },
  base: {
    name: 'Base',
    symbol: 'BASE',
    icon: '🔵',
    nativeToken: 'ETH',
    alchemyEndpoint: 'https://base-mainnet.g.alchemy.com/v2/',
    publicRpc: 'https://mainnet.base.org',
    etherscanApi: 'https://api.basescan.org/api',
    explorerUrl: 'https://basescan.org',
  },
  optimism: {
    name: 'Optimism',
    symbol: 'OP',
    icon: '🔴',
    nativeToken: 'ETH',
    infuraEndpoint: 'https://optimism-mainnet.infura.io/v3/',
    alchemyEndpoint: 'https://opt-mainnet.g.alchemy.com/v2/',
    publicRpc: 'https://mainnet.optimism.io',
    etherscanApi: 'https://api-optimistic.etherscan.io/api',
    explorerUrl: 'https://optimistic.etherscan.io',
  },
  zksync: {
    name: 'zkSync Era',
    symbol: 'ZK',
    icon: '⚡',
    nativeToken: 'ETH',
    alchemyEndpoint: 'https://zksync-mainnet.g.alchemy.com/v2/',
    publicRpc: 'https://mainnet.era.zksync.io',
    explorerUrl: 'https://explorer.zksync.io',
  },
};

// Common ERC-20 token addresses per network
const POPULAR_TOKENS: Record<string, Array<{ address: string; symbol: string; decimals: number }>> = {
  ethereum: [
    { address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', symbol: 'USDT', decimals: 6 },
    { address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', symbol: 'USDC', decimals: 6 },
    { address: '0x6B175474E89094C44Da98b954EeseeEe523a2206206994597C13D831ec7', symbol: 'DAI', decimals: 18 },
    { address: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', symbol: 'WBTC', decimals: 8 },
    { address: '0x514910771AF9Ca656af840dff83E8264EcF986CA', symbol: 'LINK', decimals: 18 },
  ],
  polygon: [
    { address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', symbol: 'USDT', decimals: 6 },
    { address: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174', symbol: 'USDC', decimals: 6 },
    { address: '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063', symbol: 'DAI', decimals: 18 },
    { address: '0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6', symbol: 'WBTC', decimals: 8 },
  ],
  arbitrum: [
    { address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', symbol: 'USDT', decimals: 6 },
    { address: '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8', symbol: 'USDC', decimals: 6 },
    { address: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1', symbol: 'DAI', decimals: 18 },
    { address: '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f', symbol: 'WBTC', decimals: 8 },
  ],
  base: [
    { address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', symbol: 'USDC', decimals: 6 },
    { address: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb', symbol: 'DAI', decimals: 18 },
  ],
  optimism: [
    { address: '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58', symbol: 'USDT', decimals: 6 },
    { address: '0x7F5c764cBc14f9669B88837ca1490cCa17c31607', symbol: 'USDC', decimals: 6 },
    { address: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1', symbol: 'DAI', decimals: 18 },
  ],
  zksync: [
    { address: '0x3355df6D4c9C3035724Fd0e3914dE96A5a83aaf4', symbol: 'USDC', decimals: 6 },
    { address: '0x493257fD37EDB34451f62EDf8D2a0C418852bA4C', symbol: 'USDT', decimals: 6 },
  ],
};

// ERC-20 ABI for balance check
const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
];

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

export interface InfuraTransaction {
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

export interface InfuraWalletData {
  holdings: Record<string, number>;
  transactions: InfuraTransaction[];
  valueEur: number;
  address: string;
  chain: string;
}

/**
 * Create an RPC provider for a specific network
 */
function createProvider(network: string, projectId: string, providerType: 'infura' | 'alchemy' | 'public' = 'infura'): Provider {
  const chainConfig = CHAIN_CONFIGS[network as SupportedChain];
  if (!chainConfig) {
    throw new Error(`Network ${network} not supported`);
  }
  
  let rpcUrl: string;
  
  if (providerType === 'infura' && chainConfig.infuraEndpoint) {
    rpcUrl = chainConfig.infuraEndpoint + projectId;
  } else if (providerType === 'alchemy' && chainConfig.alchemyEndpoint) {
    rpcUrl = chainConfig.alchemyEndpoint + projectId;
  } else if (chainConfig.publicRpc) {
    rpcUrl = chainConfig.publicRpc;
  } else {
    throw new Error(`No RPC endpoint available for ${network} with provider ${providerType}`);
  }
  
  return new ethers.JsonRpcProvider(rpcUrl);
}

/**
 * Fetch wallet data using Infura RPC
 */
export async function fetchWalletDataInfura(
  address: string,
  network: string,
  projectId: string
): Promise<InfuraWalletData | null> {
  const cacheKey = `infura_wallet_${network}_${address}`;
  const cached = getFromCache<InfuraWalletData>(cacheKey);
  if (cached) {
    console.log('[Infura] Using cached data for', address);
    return cached;
  }

  try {
    console.log(`[Infura] Fetching wallet data for ${address} on ${network}`);
    
    const provider = createProvider(network, projectId);
    const holdings: Record<string, number> = {};
    
    // Get native token balance
    const nativeBalance = await provider.getBalance(address);
    const chainConfig = CHAIN_CONFIGS[network as SupportedChain];
    const nativeSymbol = chainConfig?.nativeToken || 'ETH';
    const nativeAmount = Number(ethers.formatEther(nativeBalance));
    
    if (nativeAmount > 0) {
      holdings[nativeSymbol] = nativeAmount;
    }
    
    // Get ERC-20 token balances
    const tokens = POPULAR_TOKENS[network] || [];
    
    for (const token of tokens) {
      try {
        const contract = new ethers.Contract(token.address, ERC20_ABI, provider);
        const balance = await contract.balanceOf(address);
        const amount = Number(ethers.formatUnits(balance, token.decimals));
        
        if (amount > 0.001) { // Filter dust amounts
          holdings[token.symbol] = amount;
        }
      } catch (err) {
        // Skip tokens that fail (might not exist on this address)
        console.log(`[Infura] Could not fetch ${token.symbol}:`, err);
      }
    }
    
    // Get recent transactions (Infura RPC is limited, get last few blocks)
    const transactions: InfuraTransaction[] = [];
    
    try {
      const currentBlock = await provider.getBlockNumber();
      // Check last 100 blocks for activity
      for (let i = 0; i < 10; i++) {
        const blockNum = currentBlock - i * 10;
        if (blockNum < 0) break;
        
        const block = await provider.getBlock(blockNum, true);
        if (block && block.prefetchedTransactions) {
          for (const tx of block.prefetchedTransactions) {
            const isIncoming = tx.to?.toLowerCase() === address.toLowerCase();
            const isOutgoing = tx.from?.toLowerCase() === address.toLowerCase();
            
            if (isIncoming || isOutgoing) {
              const value = Number(ethers.formatEther(tx.value));
              if (value > 0) {
                transactions.push({
                  hash: tx.hash,
                  type: isIncoming ? 'buy' : 'sell',
                  asset: nativeSymbol,
                  amount: value,
                  timestamp: block.timestamp * 1000,
                  valueEur: 0, // Will be calculated with prices
                  fee: 0,
                  feeEur: 0,
                  from: tx.from,
                  to: tx.to || undefined,
                });
              }
            }
          }
        }
      }
    } catch (err) {
      console.log('[Infura] Could not fetch transactions:', err);
    }
    
    // Calculate total value using CoinGecko
    let valueEur = 0;
    const symbols = Object.keys(holdings);
    
    if (symbols.length > 0) {
      const prices = await getCurrentPrices(symbols);
      
      for (const [symbol, amount] of Object.entries(holdings)) {
        const priceData = prices[symbol];
        if (priceData) {
          valueEur += amount * priceData.eur;
        }
      }
      
      // Update transaction values
      for (const tx of transactions) {
        const priceData = prices[tx.asset];
        if (priceData) {
          tx.valueEur = tx.amount * priceData.eur;
        }
      }
    }
    
    const result: InfuraWalletData = {
      holdings,
      transactions,
      valueEur,
      address,
      chain: network,
    };
    
    setCache(cacheKey, result);
    console.log(`[Infura] Fetched ${Object.keys(holdings).length} assets, value: €${valueEur.toFixed(2)}`);
    
    return result;
  } catch (err) {
    console.error('[Infura] Error fetching wallet data:', err);
    throw err;
  }
}

/**
 * Check if a network is supported
 */
export function isNetworkSupported(network: string): boolean {
  return network in CHAIN_CONFIGS;
}

/**
 * Get supported networks
 */
export function getSupportedNetworks(): string[] {
  return Object.keys(CHAIN_CONFIGS);
}

/**
 * Get chain configuration
 */
export function getChainConfig(network: string): ChainConfig | undefined {
  return CHAIN_CONFIGS[network as SupportedChain];
}

/**
 * Get all chain configurations
 */
export function getAllChainConfigs(): Record<SupportedChain, ChainConfig> {
  return CHAIN_CONFIGS;
}
