import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  createVault,
  isVaultConfigured,
  unlockVault,
  type UnlockedVault,
} from '@/lib/cryptoVault';
import { clearSecureStorage, getSettings, initializeSecureStorage } from '@/lib/storage';

type VaultState = {
  isConfigured: boolean;
  isUnlocked: boolean;
  isInitializing: boolean;
  error: string | null;
  unlock: (passphrase: string) => Promise<boolean>;
  setupNewVault: (passphrase: string) => Promise<boolean>;
  lock: () => void;
};

const VaultContext = createContext<VaultState | null>(null);

export function VaultProvider({ children }: { children: React.ReactNode }) {
  const [vault, setVault] = useState<UnlockedVault | null>(null);
  const [isInitializing, setIsInitializing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [configuredFlag, setConfiguredFlag] = useState<boolean>(isVaultConfigured());
  const lastActivityRef = useRef<number>(Date.now());
  const lastEventRef = useRef<number>(0);

  const unlock = useCallback(async (passphrase: string) => {
    setError(null);
    setIsInitializing(true);
    try {
      const unlocked = await unlockVault(passphrase);
      await initializeSecureStorage(unlocked);
      setVault(unlocked);
      setConfiguredFlag(true);
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Errore di sblocco';
      setError(msg);
      return false;
    } finally {
      setIsInitializing(false);
    }
  }, []);

  const setupNewVault = useCallback(async (passphrase: string) => {
    setError(null);
    setIsInitializing(true);
    try {
      await createVault(passphrase);
      const ok = await unlock(passphrase);
      return ok;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Errore configurazione';
      setError(msg);
      return false;
    } finally {
      setIsInitializing(false);
    }
  }, [unlock]);

  const lock = useCallback(() => {
    setVault(null);
    setError(null);
    clearSecureStorage();
  }, []);

  // Auto-lock after inactivity (based on Settings).
  useEffect(() => {
    if (!vault) return;

    lastActivityRef.current = Date.now();

    const markActivity = () => {
      const now = Date.now();
      // Throttle very frequent events (mousemove/scroll).
      if (now - lastEventRef.current < 750) return;
      lastEventRef.current = now;
      lastActivityRef.current = now;
    };

    const events: Array<keyof WindowEventMap> = ['mousemove', 'keydown', 'touchstart', 'scroll', 'click'];
    for (const ev of events) window.addEventListener(ev, markActivity, { passive: true });

    const onVisibility = () => {
      // When user returns to the tab, treat it as activity.
      if (!document.hidden) markActivity();
    };
    document.addEventListener('visibilitychange', onVisibility);

    const interval = window.setInterval(() => {
      const s = getSettings();
      const enabled = s.autoLockEnabled !== false;
      const minutes = typeof s.autoLockMinutes === 'number' ? s.autoLockMinutes : 15;
      if (!enabled) return;
      const timeoutMs = Math.max(1, minutes) * 60_000;
      if (Date.now() - lastActivityRef.current >= timeoutMs) {
        lock();
      }
    }, 15_000);

    return () => {
      window.clearInterval(interval);
      for (const ev of events) window.removeEventListener(ev, markActivity);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [vault, lock]);

  const value = useMemo<VaultState>(
    () => ({
      isConfigured: configuredFlag,
      isUnlocked: vault !== null,
      isInitializing,
      error,
      unlock,
      setupNewVault,
      lock,
    }),
    [configuredFlag, vault, isInitializing, error, unlock, setupNewVault, lock]
  );

  return <VaultContext.Provider value={value}>{children}</VaultContext.Provider>;
}

export function useVault() {
  const ctx = useContext(VaultContext);
  if (!ctx) throw new Error('useVault must be used within VaultProvider');
  return ctx;
}
