// Shared domain types used across storage/providers.

// "Scan" explorers are separated so users can store distinct API keys.
export type Provider =
  | 'etherscan'
  | 'polygonscan'
  | 'arbiscan'
  | 'lineascan'
  | 'bscscan'
  | 'infura'
  | 'alchemy'
  | 'bitcoin'
  | 'solana';

// Transaction categories for advanced categorization
export type TransactionCategory = 'standard' | 'defi' | 'staking' | 'nft' | 'cross-chain';

export interface StoredProviderConfig {
  walletId?: string;
  provider: Provider;
  apiKey: string;
  apiKeyHash?: string;
}
