import { z } from 'zod';

import type { Provider, StoredProviderConfig, TransactionCategory } from './types';

/**
 * All persisted blobs are stored as Versioned<T> = { schemaVersion, data }.
 * This gives us a stable migration and corruption-handling strategy.
 */
export type Versioned<T> = {
  schemaVersion: number;
  data: T;
};

export const SCHEMA_VERSIONS = {
  wallets: 1,
  transactions: 1,
  snapshots: 1,
  providerConfigs: 1,
  settings: 1,
} as const;

const providerEnum = z.enum(
  ['etherscan', 'polygonscan', 'arbiscan', 'lineascan', 'bscscan', 'infura', 'alchemy', 'bitcoin', 'solana'] satisfies Provider[]
);

const chainEnum = z.enum(['ETH', 'BTC', 'MATIC', 'ARB', 'BASE', 'OP', 'ZK', 'SOL', 'BSC', 'LINEA']);

const transactionCategoryEnum = z.enum(
  ['standard', 'defi', 'staking', 'nft', 'cross-chain'] satisfies TransactionCategory[]
);

export const walletSchema = z.object({
  id: z.string().min(1),
  address: z.string().min(1),
  chain: chainEnum,
  label: z.string(),
  addedAt: z.number(),
  provider: providerEnum.optional(),
  apiKey: z.string().optional(),
  apiKeyHash: z.string().optional(),
  lastSync: z.number().optional(),
  isFromCache: z.boolean().optional(),
});

export const walletsSchema = z.array(walletSchema);

export const transactionSchema = z.object({
  id: z.string().min(1),
  walletId: z.string().min(1),
  hash: z.string().min(1),
  type: z.enum(['buy', 'sell', 'transfer', 'stake', 'airdrop']),
  asset: z.string().min(1),
  amount: z.number(),
  valueEur: z.number(),
  timestamp: z.number(),
  fee: z.number().optional(),
  feeEur: z.number().optional(),
  category: transactionCategoryEnum.optional(),
  chain: z.string().optional(),
});

export const transactionsSchema = z.array(transactionSchema);

export const portfolioSnapshotSchema = z.object({
  timestamp: z.number(),
  totalValueEur: z.number(),
  assets: z.record(
    z.object({
      amount: z.number(),
      valueEur: z.number(),
    })
  ),
});

export const snapshotsSchema = z.array(portfolioSnapshotSchema);

export const providerConfigSchema: z.ZodType<StoredProviderConfig> = z.object({
  walletId: z.string().optional(),
  provider: providerEnum,
  apiKey: z.string(),
  apiKeyHash: z.string().optional(),
});

export const providerConfigsSchema = z.array(providerConfigSchema);

export const settingsSchema = z.object({
  taxMethod: z.enum(['FIFO', 'LIFO', 'HIFO']),
  country: z.string().min(1),
  currency: z.enum(['EUR', 'USD']),
  taxThreshold: z.number(),
  enableDAC8Alerts: z.boolean().optional(),
  useSubstituteTax2025: z.boolean().optional(),
  lossCompensationYears: z.number().optional(),
  // Security
  autoLockEnabled: z.boolean().optional(),
  autoLockMinutes: z.number().int().positive().optional(),
});

export const versioned = <T>(schema: z.ZodType<T>) =>
  z.object({
    schemaVersion: z.number().int().nonnegative(),
    data: schema,
  });

export const versionedWalletsSchema = versioned(walletsSchema);
export const versionedTransactionsSchema = versioned(transactionsSchema);
export const versionedSnapshotsSchema = versioned(snapshotsSchema);
export const versionedProviderConfigsSchema = versioned(providerConfigsSchema);
export const versionedSettingsSchema = versioned(settingsSchema);
