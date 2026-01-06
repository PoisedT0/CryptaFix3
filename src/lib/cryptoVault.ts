// WebCrypto-based vault for CRYPTA
// - AES-GCM authenticated encryption
// - PBKDF2 key derivation
// - Key kept only in memory (never persisted)

export type VaultMetaV1 = {
  v: 1;
  salt: string; // base64
  kdf: {
    name: 'PBKDF2';
    hash: 'SHA-256';
    iterations: number;
  };
  alg: {
    name: 'AES-GCM';
  };
};

export type EncryptedPayloadV1 = {
  v: 1;
  iv: string; // base64
  ct: string; // base64
};

export class VaultLockedError extends Error {
  name = 'VaultLockedError';
  constructor(message = 'Vault is locked') {
    super(message);
  }
}

export class VaultCryptoError extends Error {
  name = 'VaultCryptoError';
  constructor(message = 'Cryptographic operation failed') {
    super(message);
  }
}

const VAULT_META_KEY = 'crypta_vault_meta';
const VAULT_CHECK_KEY = 'crypta_vault_check';

const DEFAULT_ITERATIONS = 210_000;

// --------- small helpers ---------

const te = new TextEncoder();
const td = new TextDecoder();

function b64encode(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function b64decode(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function getRandomBytes(len: number): Uint8Array {
  const out = new Uint8Array(len);
  crypto.getRandomValues(out);
  return out;
}

async function importPassphrase(passphrase: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', te.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
}

async function deriveAesKey(passphraseKey: CryptoKey, meta: VaultMetaV1): Promise<CryptoKey> {
  const saltBytes = b64decode(meta.salt);
  // Cast to ArrayBuffer to satisfy TypeScript strict mode
  const salt = saltBytes.buffer.slice(saltBytes.byteOffset, saltBytes.byteOffset + saltBytes.byteLength) as ArrayBuffer;
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: meta.kdf.iterations,
      hash: meta.kdf.hash,
    },
    passphraseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

// --------- vault public API ---------

export function readVaultMeta(): VaultMetaV1 | null {
  const raw = localStorage.getItem(VAULT_META_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as VaultMetaV1;
    if (parsed?.v !== 1) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function isVaultConfigured(): boolean {
  return !!readVaultMeta() && !!localStorage.getItem(VAULT_CHECK_KEY);
}

export function getVaultStorageKeys() {
  return { metaKey: VAULT_META_KEY, checkKey: VAULT_CHECK_KEY };
}

export async function createVault(passphrase: string, iterations = DEFAULT_ITERATIONS): Promise<void> {
  if (!passphrase || passphrase.length < 8) {
    throw new Error('Passphrase must be at least 8 characters');
  }

  const meta: VaultMetaV1 = {
    v: 1,
    salt: b64encode(getRandomBytes(16)),
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations },
    alg: { name: 'AES-GCM' },
  };
  localStorage.setItem(VAULT_META_KEY, JSON.stringify(meta));

  // store a sentinel to validate passphrase later
  const checkPayload = await encryptJson({ ok: true, t: Date.now() }, passphrase, meta);
  localStorage.setItem(VAULT_CHECK_KEY, JSON.stringify(checkPayload));
}

export async function verifyVaultPassphrase(passphrase: string): Promise<boolean> {
  const meta = readVaultMeta();
  const rawCheck = localStorage.getItem(VAULT_CHECK_KEY);
  if (!meta || !rawCheck) return false;
  try {
    const payload = JSON.parse(rawCheck) as EncryptedPayloadV1;
    const data = await decryptJson<{ ok: boolean }>(payload, passphrase, meta);
    return !!data?.ok;
  } catch {
    return false;
  }
}

// Helper to convert Uint8Array to ArrayBuffer for WebCrypto
function toArrayBuffer(arr: Uint8Array): ArrayBuffer {
  return arr.buffer.slice(arr.byteOffset, arr.byteOffset + arr.byteLength) as ArrayBuffer;
}

export async function encryptJson<T>(data: T, passphrase: string, metaOverride?: VaultMetaV1): Promise<EncryptedPayloadV1> {
  const meta = metaOverride ?? readVaultMeta();
  if (!meta) throw new VaultCryptoError('Vault is not configured');
  const passKey = await importPassphrase(passphrase);
  const aesKey = await deriveAesKey(passKey, meta);

  const iv = getRandomBytes(12); // recommended length for GCM
  const plaintext = te.encode(JSON.stringify(data));
  const ctBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: toArrayBuffer(iv) }, aesKey, toArrayBuffer(plaintext));
  return {
    v: 1,
    iv: b64encode(iv),
    ct: b64encode(new Uint8Array(ctBuf)),
  };
}

export async function decryptJson<T>(payload: EncryptedPayloadV1, passphrase: string, metaOverride?: VaultMetaV1): Promise<T> {
  const meta = metaOverride ?? readVaultMeta();
  if (!meta) throw new VaultCryptoError('Vault is not configured');
  const passKey = await importPassphrase(passphrase);
  const aesKey = await deriveAesKey(passKey, meta);

  const iv = b64decode(payload.iv);
  const ct = b64decode(payload.ct);
  const ptBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: toArrayBuffer(iv) }, aesKey, toArrayBuffer(ct));
  return JSON.parse(td.decode(new Uint8Array(ptBuf))) as T;
}

// This lets storage encrypt/decrypt with an already unlocked key without keeping the passphrase.
export type UnlockedVault = {
  meta: VaultMetaV1;
  key: CryptoKey;
};

export async function unlockVault(passphrase: string): Promise<UnlockedVault> {
  const meta = readVaultMeta();
  if (!meta) throw new VaultCryptoError('Vault is not configured');
  const passKey = await importPassphrase(passphrase);
  const key = await deriveAesKey(passKey, meta);

  // validate with sentinel
  const rawCheck = localStorage.getItem(VAULT_CHECK_KEY);
  if (!rawCheck) throw new VaultCryptoError('Vault check is missing');
  const payload = JSON.parse(rawCheck) as EncryptedPayloadV1;
  try {
    const iv = b64decode(payload.iv);
    const ct = b64decode(payload.ct);
    const ptBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: toArrayBuffer(iv) }, key, toArrayBuffer(ct));
    const parsed = JSON.parse(td.decode(new Uint8Array(ptBuf))) as { ok?: boolean };
    if (!parsed?.ok) throw new Error('Invalid sentinel');
  } catch {
    throw new Error('Passphrase non valida');
  }
  return { meta, key };
}

export async function encryptWithKey<T>(data: T, vault: UnlockedVault): Promise<EncryptedPayloadV1> {
  const iv = getRandomBytes(12);
  const plaintext = te.encode(JSON.stringify(data));
  const ctBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: toArrayBuffer(iv) }, vault.key, toArrayBuffer(plaintext));
  return { v: 1, iv: b64encode(iv), ct: b64encode(new Uint8Array(ctBuf)) };
}

export async function decryptWithKey<T>(payload: EncryptedPayloadV1, vault: UnlockedVault): Promise<T> {
  const iv = b64decode(payload.iv);
  const ct = b64decode(payload.ct);
  const ptBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: toArrayBuffer(iv) }, vault.key, toArrayBuffer(ct));
  return JSON.parse(td.decode(new Uint8Array(ptBuf))) as T;
}
