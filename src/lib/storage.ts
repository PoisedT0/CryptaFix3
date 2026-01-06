// Local storage utilities for CRYPTA
// All data is stored locally with AES-256 encryption - no cloud, no tracking
// GDPR-by-design: Data encrypted at rest

import type { Provider, TransactionCategory, StoredProviderConfig } from './types';
import { hashApiKey } from './apiKeyHash';
import type { EncryptedPayloadV1, UnlockedVault } from './cryptoVault';
import { decryptWithKey, encryptWithKey, VaultLockedError } from './cryptoVault';
import {
  SCHEMA_VERSIONS,
  type Versioned,
  walletsSchema,
  transactionsSchema,
  snapshotsSchema,
  providerConfigsSchema,
  settingsSchema,
} from './storageSchemas';

export interface Wallet {
  id: string;
  address: string;
  chain: 'ETH' | 'BTC' | 'MATIC' | 'ARB' | 'BASE' | 'OP' | 'ZK' | 'SOL' | 'BSC' | 'LINEA';
  label: string;
  addedAt: number;
  provider?: Provider;
  apiKey?: string; // Now stored encrypted
  apiKeyHash?: string; // SHA-256 hash for verification without decryption
  lastSync?: number;
  isFromCache?: boolean;
}

export interface Transaction {
  id: string;
  walletId: string;
  hash: string;
  type: 'buy' | 'sell' | 'transfer' | 'stake' | 'airdrop';
  asset: string;
  amount: number;
  valueEur: number;
  timestamp: number;
  fee?: number;
  feeEur?: number;
  category?: TransactionCategory;
  chain?: string;
}

export interface PortfolioSnapshot {
  timestamp: number;
  totalValueEur: number;
  assets: Record<string, { amount: number; valueEur: number }>;
}

export interface TaxCalculation {
  year: number;
  totalGains: number;
  totalLosses: number;
  netGain: number;
  taxableAmount: number;
  estimatedTax: number;
  method: 'FIFO' | 'LIFO' | 'HIFO';
  transactions: Transaction[];
}

const STORAGE_KEYS = {
  WALLETS: 'crypta_wallets',
  TRANSACTIONS: 'crypta_transactions',
  SNAPSHOTS: 'crypta_snapshots',
  SETTINGS: 'crypta_settings',
  ONBOARDING_COMPLETE: 'crypta_onboarding',
  HIDDEN_ASSETS: 'crypta_hidden_assets',
  SPAM_ASSETS: 'crypta_spam_assets',
  PROVIDER_CONFIGS: 'crypta_provider_configs',
};

// Keys that should be encrypted (sensitive data)
const ENCRYPTED_KEYS = [
  STORAGE_KEYS.WALLETS,
  STORAGE_KEYS.TRANSACTIONS,
  STORAGE_KEYS.SNAPSHOTS,
  STORAGE_KEYS.PROVIDER_CONFIGS,
];

type KnownSchemaKey =
  | typeof STORAGE_KEYS.WALLETS
  | typeof STORAGE_KEYS.TRANSACTIONS
  | typeof STORAGE_KEYS.SNAPSHOTS
  | typeof STORAGE_KEYS.PROVIDER_CONFIGS
  | typeof STORAGE_KEYS.SETTINGS;

type SchemaInfo<T> = {
  version: number;
  schema: (unknownValue: unknown) => { success: true; data: T } | { success: false };
  defaultValue: T;
};

function safeParseWith<T>(schema: { safeParse: (v: unknown) => any }, v: unknown): { success: true; data: T } | { success: false } {
  const res = schema.safeParse(v);
  if (res.success) return { success: true, data: res.data as T };
  return { success: false };
}

function getSchemaInfo(key: KnownSchemaKey): SchemaInfo<any> {
  switch (key) {
    case STORAGE_KEYS.WALLETS:
      return {
        version: SCHEMA_VERSIONS.wallets,
        schema: (v) => safeParseWith(walletsSchema, v),
        defaultValue: [],
      };
    case STORAGE_KEYS.TRANSACTIONS:
      return {
        version: SCHEMA_VERSIONS.transactions,
        schema: (v) => safeParseWith(transactionsSchema, v),
        defaultValue: [],
      };
    case STORAGE_KEYS.SNAPSHOTS:
      return {
        version: SCHEMA_VERSIONS.snapshots,
        schema: (v) => safeParseWith(snapshotsSchema, v),
        defaultValue: [],
      };
    case STORAGE_KEYS.PROVIDER_CONFIGS:
      return {
        version: SCHEMA_VERSIONS.providerConfigs,
        schema: (v) => safeParseWith(providerConfigsSchema, v),
        defaultValue: [],
      };
    case STORAGE_KEYS.SETTINGS:
      return {
        version: SCHEMA_VERSIONS.settings,
        // Merge defaults first to allow partial/legacy settings objects.
        schema: (v) => {
          const base = typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {};
          return safeParseWith(settingsSchema, { ...DEFAULT_SETTINGS, ...base });
        },
        defaultValue: DEFAULT_SETTINGS,
      };
    default:
      // Should never happen.
      return {
        version: 1,
        schema: () => ({ success: false } as const),
        defaultValue: null,
      };
  }
}

function isVersionedObject(v: unknown): v is Versioned<unknown> {
  return (
    !!v &&
    typeof v === 'object' &&
    'schemaVersion' in (v as any) &&
    'data' in (v as any) &&
    typeof (v as any).schemaVersion === 'number'
  );
}

/**
 * Normalize unknown persisted content into the current schema.
 * Returns normalized data + whether we should re-persist it (wrap/migrate).
 */
function normalizePersisted<T>(key: KnownSchemaKey, rawValue: unknown): { data: T; shouldPersist: boolean } {
  const info = getSchemaInfo(key) as SchemaInfo<T>;

  // Versioned format
  if (isVersionedObject(rawValue)) {
    const parsed = info.schema((rawValue as Versioned<unknown>).data);
    if (!parsed.success) {
      return { data: info.defaultValue, shouldPersist: true };
    }
    // If older schemaVersion, we would migrate here. For now, wrap as current version.
    const sv = (rawValue as Versioned<unknown>).schemaVersion;
    if (sv !== info.version) {
      return { data: parsed.data, shouldPersist: true };
    }
    return { data: parsed.data, shouldPersist: false };
  }

  // Legacy format (bare data)
  const legacyParsed = info.schema(rawValue);
  if (legacyParsed.success) {
    return { data: legacyParsed.data, shouldPersist: true };
  }

  return { data: info.defaultValue, shouldPersist: true };
}

function wrapVersioned<T>(key: KnownSchemaKey, data: T): Versioned<T> {
  const info = getSchemaInfo(key) as SchemaInfo<T>;
  return {
    schemaVersion: info.version,
    data,
  };
}

// In-memory unlocked vault + decrypted cache.
let _vault: UnlockedVault | null = null;
const _secureCache = new Map<string, unknown>();

function isVaultReady(): boolean {
  return _vault !== null;
}

// Our new encrypted payload is stored as JSON string of {v,iv,ct}
function isVaultPayloadString(raw: string): boolean {
  try {
    const p = JSON.parse(raw) as Partial<EncryptedPayloadV1>;
    return p?.v === 1 && typeof p?.iv === 'string' && typeof p?.ct === 'string';
  } catch {
    return false;
  }
}

// Initialize vault for storage usage. Must be called after user unlocks.
export async function initializeSecureStorage(vault: UnlockedVault): Promise<void> {
  _vault = vault;
  _secureCache.clear();

  // Preload encrypted keys into cache so the rest of the app can stay synchronous.
  for (const key of ENCRYPTED_KEYS) {
    const schemaKey = key as KnownSchemaKey;
    const raw = localStorage.getItem(key);
    if (!raw) continue;

    if (!isVaultPayloadString(raw)) {
      // Legacy / plaintext content: keep it for now; the VaultGate can later offer migration.
      // We try to parse plaintext JSON and re-encrypt immediately.
      try {
        const parsed = JSON.parse(raw);
        const normalized = normalizePersisted(schemaKey, parsed);
        _secureCache.set(key, normalized.data);
        // Re-encrypt to new format in background.
        void (async () => {
          if (!_vault) return;
          const payload = await encryptWithKey(wrapVersioned(schemaKey, normalized.data), _vault);
          localStorage.setItem(key, JSON.stringify(payload));
        })();
      } catch {
        // If it isn't valid JSON and isn't our new payload, we can't interpret it here.
        // Leave it as-is; callers will see defaults.
      }
      continue;
    }

    try {
      const payload = JSON.parse(raw) as EncryptedPayloadV1;
      const decrypted = await decryptWithKey(payload, vault);
      const normalized = normalizePersisted(schemaKey, decrypted);
      _secureCache.set(key, normalized.data);

      if (normalized.shouldPersist) {
        // Persist back as versioned payload.
        void (async () => {
          if (!_vault) return;
          const rePayload = await encryptWithKey(wrapVersioned(schemaKey, normalized.data), _vault);
          localStorage.setItem(key, JSON.stringify(rePayload));
        })();
      }
    } catch (err) {
      console.warn(`[Storage] Failed to decrypt ${key}.`, err);
      // Do not throw here; app can still render and user can clear data.
    }
  }
}

// Clear in-memory vault and decrypted cache (does not delete persisted data).
export function clearSecureStorage(): void {
  _vault = null;
  _secureCache.clear();
}

// Generate unique ID
export const generateId = (): string => {
  // Prefer cryptographically strong UUIDs to avoid collisions.
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  // Fallback: timestamp + random (best effort)
  const rand = Math.random().toString(36).slice(2);
  return `${Date.now()}-${rand}`;
};

// ============= Secure Storage Helpers =============

/**
 * Get data from localStorage with automatic decryption
 */
const getSecureData = <T>(key: string, defaultValue: T): T => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return defaultValue;

    if (ENCRYPTED_KEYS.includes(key)) {
      if (!isVaultReady()) {
        throw new VaultLockedError();
      }
      if (_secureCache.has(key)) {
        return _secureCache.get(key) as T;
      }
      // If not cached (e.g., first run), default.
      return defaultValue;
    }

    return JSON.parse(raw) as T;
  } catch (err) {
    if (err instanceof VaultLockedError) throw err;
    console.error(`[Storage] Error reading ${key}:`, err);
    return defaultValue;
  }
};

/**
 * Save data to localStorage with automatic encryption
 */
const setSecureData = <T>(key: string, data: T): void => {
  try {
    if (ENCRYPTED_KEYS.includes(key)) {
      if (!_vault) throw new VaultLockedError();
      _secureCache.set(key, data);

      // Encrypt async to avoid making the entire app async.
      void (async () => {
        if (!_vault) return;
        const payload = await encryptWithKey(wrapVersioned(key as KnownSchemaKey, data), _vault);
        localStorage.setItem(key, JSON.stringify(payload));
      })();
    } else {
      localStorage.setItem(key, JSON.stringify(data));
    }
  } catch (err) {
    if (err instanceof VaultLockedError) throw err;
    console.error(`[Storage] Error saving ${key}:`, err);
  }
};

// ============= Wallets =============

export const getWallets = (): Wallet[] => {
  return getSecureData<Wallet[]>(STORAGE_KEYS.WALLETS, []);
};

export const saveWallet = (wallet: Omit<Wallet, 'id' | 'addedAt'>): Wallet => {
  const wallets = getWallets();
  
  // Hash API key if provided (for verification without decryption)
  const apiKeyHash = wallet.apiKey ? hashApiKey(wallet.apiKey) : undefined;
  
  const newWallet: Wallet = {
    ...wallet,
    id: generateId(),
    addedAt: Date.now(),
    apiKeyHash,
  };
  
  wallets.push(newWallet);
  setSecureData(STORAGE_KEYS.WALLETS, wallets);
  return newWallet;
};

export const updateWallet = (id: string, updates: Partial<Omit<Wallet, 'id' | 'addedAt'>>): Wallet | null => {
  const wallets = getWallets();
  const index = wallets.findIndex(w => w.id === id);
  
  if (index === -1) return null;
  
  // Hash API key if updated
  if (updates.apiKey) {
    updates.apiKeyHash = hashApiKey(updates.apiKey);
  }
  
  wallets[index] = { ...wallets[index], ...updates };
  setSecureData(STORAGE_KEYS.WALLETS, wallets);
  return wallets[index];
};

export const deleteWallet = (id: string): void => {
  const wallets = getWallets().filter(w => w.id !== id);
  setSecureData(STORAGE_KEYS.WALLETS, wallets);
};

// ============= Transactions =============

export const getTransactions = (): Transaction[] => {
  return getSecureData<Transaction[]>(STORAGE_KEYS.TRANSACTIONS, []);
};

export const saveTransaction = (tx: Omit<Transaction, 'id'>): Transaction => {
  const transactions = getTransactions();
  const newTx: Transaction = {
    ...tx,
    id: generateId(),
  };
  transactions.push(newTx);
  setSecureData(STORAGE_KEYS.TRANSACTIONS, transactions);
  return newTx;
};

export const saveTransactions = (txs: Transaction[]): void => {
  setSecureData(STORAGE_KEYS.TRANSACTIONS, txs);
};

// ============= Settings =============

export interface AppSettings {
  taxMethod: 'FIFO' | 'LIFO' | 'HIFO';
  country: string;
  currency: 'EUR' | 'USD';
  taxThreshold: number;
  // New settings for compliance
  enableDAC8Alerts?: boolean;
  useSubstituteTax2025?: boolean;
  lossCompensationYears?: number;
  // Security
  autoLockEnabled?: boolean;
  autoLockMinutes?: number;
}

// ============= Provider Configs =============

export const getProviderConfigs = (): StoredProviderConfig[] => {
  return getSecureData<StoredProviderConfig[]>(STORAGE_KEYS.PROVIDER_CONFIGS, []);
};

export const saveProviderConfigs = (configs: StoredProviderConfig[]): void => {
  setSecureData(STORAGE_KEYS.PROVIDER_CONFIGS, configs);
};

const DEFAULT_SETTINGS: AppSettings = {
  taxMethod: 'FIFO',
  country: 'IT',
  currency: 'EUR',
  taxThreshold: 51645.69, // Italian threshold
  enableDAC8Alerts: true,
  useSubstituteTax2025: false,
  lossCompensationYears: 4,
  autoLockEnabled: true,
  autoLockMinutes: 15,
};

export const getSettings = (): AppSettings => {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.SETTINGS);
    if (!data) return DEFAULT_SETTINGS;
    const parsedJson = JSON.parse(data) as unknown;

    // Accept both legacy object and versioned wrapper.
    const versionedCandidate = isVersionedObject(parsedJson) ? (parsedJson as Versioned<unknown>).data : parsedJson;
    const validated = settingsSchema.safeParse(versionedCandidate);
    if (!validated.success) {
      // Reset to defaults if corrupted.
      localStorage.setItem(
        STORAGE_KEYS.SETTINGS,
        JSON.stringify({ schemaVersion: SCHEMA_VERSIONS.settings, data: DEFAULT_SETTINGS })
      );
      return DEFAULT_SETTINGS;
    }

    const merged = { ...DEFAULT_SETTINGS, ...validated.data };
    // Ensure persisted in versioned format.
    localStorage.setItem(
      STORAGE_KEYS.SETTINGS,
      JSON.stringify({ schemaVersion: SCHEMA_VERSIONS.settings, data: merged })
    );
    return merged;
  } catch {
    return DEFAULT_SETTINGS;
  }
};

export const saveSettings = (settings: AppSettings): void => {
  // Validate before saving; if invalid, fall back to defaults.
  const validated = settingsSchema.safeParse(settings);
  const finalSettings = validated.success ? validated.data : DEFAULT_SETTINGS;
  localStorage.setItem(
    STORAGE_KEYS.SETTINGS,
    JSON.stringify({ schemaVersion: SCHEMA_VERSIONS.settings, data: finalSettings })
  );
};

// ============= Onboarding =============

export const isOnboardingComplete = (): boolean => {
  return localStorage.getItem(STORAGE_KEYS.ONBOARDING_COMPLETE) === 'true';
};

export const completeOnboarding = (): void => {
  localStorage.setItem(STORAGE_KEYS.ONBOARDING_COMPLETE, 'true');
};

// ============= Hidden Assets =============

export const getHiddenAssets = (): string[] => {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.HIDDEN_ASSETS);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
};

export const toggleHiddenAsset = (symbol: string): boolean => {
  const hidden = getHiddenAssets();
  const normalized = symbol.toUpperCase();
  const index = hidden.indexOf(normalized);
  
  if (index === -1) {
    hidden.push(normalized);
    localStorage.setItem(STORAGE_KEYS.HIDDEN_ASSETS, JSON.stringify(hidden));
    return true; // Now hidden
  } else {
    hidden.splice(index, 1);
    localStorage.setItem(STORAGE_KEYS.HIDDEN_ASSETS, JSON.stringify(hidden));
    return false; // Now visible
  }
};

export const isAssetHidden = (symbol: string): boolean => {
  return getHiddenAssets().includes(symbol.toUpperCase());
};

// ============= Spam Assets =============

export const getSpamAssets = (): string[] => {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.SPAM_ASSETS);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
};

export const toggleSpamAsset = (symbol: string): boolean => {
  const spam = getSpamAssets();
  const normalized = symbol.toUpperCase();
  const index = spam.indexOf(normalized);
  
  if (index === -1) {
    spam.push(normalized);
    localStorage.setItem(STORAGE_KEYS.SPAM_ASSETS, JSON.stringify(spam));
    return true; // Now spam
  } else {
    spam.splice(index, 1);
    localStorage.setItem(STORAGE_KEYS.SPAM_ASSETS, JSON.stringify(spam));
    return false; // Not spam
  }
};

export const isAssetSpam = (symbol: string): boolean => {
  return getSpamAssets().includes(symbol.toUpperCase());
};

// ============= Encrypted Backup Export/Import =============

export type BackupDataV1 = {
  v: 1;
  wallets: Wallet[];
  transactions: Transaction[];
  snapshots: PortfolioSnapshot[];
  providerConfigs: StoredProviderConfig[];
  settings: AppSettings;
  onboardingComplete: boolean;
  hiddenAssets: string[];
  spamAssets: string[];
};

/**
 * Export all app data into a single object.
 * Requires the vault to be unlocked because wallets/transactions/snapshots/provider configs are encrypted.
 */
export const exportBackupData = (): BackupDataV1 => {
  return {
    v: 1,
    wallets: getWallets(),
    transactions: getTransactions(),
    snapshots: getPortfolioSnapshots(),
    providerConfigs: getProviderConfigs(),
    settings: getSettings(),
    onboardingComplete: isOnboardingComplete(),
    hiddenAssets: getHiddenAssets(),
    spamAssets: getSpamAssets(),
  };
};

/**
 * Restore app data from a previously exported object.
 * Requires the vault to be unlocked because we re-encrypt sensitive data under the current vault key.
 */
export const importBackupData = (backup: BackupDataV1): void => {
  if (!backup || backup.v !== 1) {
    throw new Error('Backup non supportato');
  }

  // Encrypted blobs
  setSecureData(STORAGE_KEYS.WALLETS, backup.wallets ?? []);
  setSecureData(STORAGE_KEYS.TRANSACTIONS, backup.transactions ?? []);
  setSecureData(STORAGE_KEYS.SNAPSHOTS, backup.snapshots ?? []);
  setSecureData(STORAGE_KEYS.PROVIDER_CONFIGS, backup.providerConfigs ?? []);

  // Unencrypted
  saveSettings(backup.settings ?? DEFAULT_SETTINGS);
  localStorage.setItem(STORAGE_KEYS.ONBOARDING_COMPLETE, backup.onboardingComplete ? 'true' : 'false');
  localStorage.setItem(STORAGE_KEYS.HIDDEN_ASSETS, JSON.stringify(backup.hiddenAssets ?? []));
  localStorage.setItem(STORAGE_KEYS.SPAM_ASSETS, JSON.stringify(backup.spamAssets ?? []));
};

// ============= Clear All Data =============

export const clearAllData = (): void => {
  Object.values(STORAGE_KEYS).forEach(key => localStorage.removeItem(key));
  // Also clear encryption-related keys
  localStorage.removeItem('crypta_encryption_enabled');
  localStorage.removeItem('crypta_passphrase_hash');
};

// ============= Migration =============

/**
 * Migrate a single key to encrypted format (legacy migration helper)
 */
const migrateToEncrypted = (key: string): void => {
  // This is now handled automatically by initializeSecureStorage
  console.log(`[Storage] Migration for ${key} handled on unlock`);
};

/**
 * Migrate all unencrypted data to encrypted format
 * Call this on app startup
 */
export const migrateStorageToEncrypted = (): void => {
  console.log('[Storage] Starting migration to encrypted format...');
  ENCRYPTED_KEYS.forEach(key => {
    migrateToEncrypted(key);
  });
  console.log('[Storage] Migration complete');
};
