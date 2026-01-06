import { z } from 'zod';

import {
  type EncryptedPayloadV1,
  type VaultMetaV1,
  decryptJson,
  encryptJson,
} from './cryptoVault';
import { exportBackupData, importBackupData, type BackupDataV1 } from './storage';

/**
 * Encrypted, self-contained backup file.
 * - Encryption uses PBKDF2 + AES-GCM with a fresh per-backup salt.
 * - Does NOT depend on the device vault meta.
 */
export type EncryptedBackupFileV1 = {
  v: 1;
  createdAt: number;
  meta: VaultMetaV1;
  payload: EncryptedPayloadV1;
};

const encryptedBackupFileSchema: z.ZodType<EncryptedBackupFileV1> = z.object({
  v: z.literal(1),
  createdAt: z.number(),
  meta: z.object({
    v: z.literal(1),
    salt: z.string(),
    kdf: z.object({
      name: z.literal('PBKDF2'),
      hash: z.literal('SHA-256'),
      iterations: z.number().int().positive(),
    }),
    alg: z.object({ name: z.literal('AES-GCM') }),
  }),
  payload: z.object({ v: z.literal(1), iv: z.string(), ct: z.string() }),
});

function randomSaltB64(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export async function createEncryptedBackup(passphrase: string): Promise<string> {
  const data: BackupDataV1 = exportBackupData();
  const meta: VaultMetaV1 = {
    v: 1,
    salt: randomSaltB64(),
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: 210_000 },
    alg: { name: 'AES-GCM' },
  };

  const payload = await encryptJson(data, passphrase, meta);
  const file: EncryptedBackupFileV1 = { v: 1, createdAt: Date.now(), meta, payload };
  return JSON.stringify(file);
}

export async function restoreEncryptedBackup(jsonText: string, passphrase: string): Promise<BackupDataV1> {
  const parsed = encryptedBackupFileSchema.safeParse(JSON.parse(jsonText));
  if (!parsed.success) {
    throw new Error('File di backup non valido o corrotto');
  }
  const { meta, payload } = parsed.data;
  const data = await decryptJson<BackupDataV1>(payload, passphrase, meta);
  return data;
}

export async function applyBackup(data: BackupDataV1): Promise<void> {
  importBackupData(data);
}
