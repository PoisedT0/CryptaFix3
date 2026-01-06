/**
 * Multi-wallet sync queue hook
 * Manages sequential wallet sync with progress tracking
 */

import { useState, useCallback, useRef } from 'react';
import { toast } from '@/hooks/use-toast';

export type WalletSyncStatus = 'queued' | 'syncing' | 'completed' | 'error';

export interface WalletSyncItem {
  walletId: string;
  walletLabel: string;
  status: WalletSyncStatus;
  error?: string;
  isRateLimited?: boolean;
}

export interface SyncQueueState {
  items: WalletSyncItem[];
  currentIndex: number;
  isProcessing: boolean;
  totalCount: number;
  completedCount: number;
  errorCount: number;
}

type SyncFunction = (walletId: string, opts: { signal: AbortSignal }) => Promise<void>;

const DELAY_BETWEEN_WALLETS_MS = 1500; // 1.5s delay between wallets

export function useWalletSyncQueue() {
  const [state, setState] = useState<SyncQueueState>({
    items: [],
    currentIndex: -1,
    isProcessing: false,
    totalCount: 0,
    completedCount: 0,
    errorCount: 0,
  });

  const syncFunctionRef = useRef<SyncFunction | null>(null);
  const abortRef = useRef(false);
  const controllerRef = useRef<AbortController | null>(null);

  /**
   * Register the sync function to be called for each wallet
   */
  const registerSyncFunction = useCallback((fn: SyncFunction) => {
    syncFunctionRef.current = fn;
  }, []);

  /**
   * Start syncing all wallets in queue
   */
  const startQueue = useCallback(
    async (wallets: Array<{ id: string; label: string }>) => {
      if (!syncFunctionRef.current) {
        console.error('[SyncQueue] No sync function registered');
        return;
      }

      if (state.isProcessing) {
        toast({
          title: 'Sincronizzazione in corso',
          description: 'Attendi il completamento della sincronizzazione attuale.',
        });
        return;
      }

      abortRef.current = false;

      // Deduplicate by walletId to avoid concurrent duplicate syncs.
      const uniqueWallets = Array.from(
        new Map(wallets.map((w) => [w.id, w])).values()
      );

      const items: WalletSyncItem[] = uniqueWallets.map((w) => ({
        walletId: w.id,
        walletLabel: w.label,
        status: 'queued',
      }));

      setState({
        items,
        currentIndex: 0,
        isProcessing: true,
        totalCount: uniqueWallets.length,
        completedCount: 0,
        errorCount: 0,
      });

      toast({
        title: 'Sincronizzazione avviata',
        description: `Sincronizzazione di ${wallets.length} wallet...`,
      });

      // Process queue
      for (let i = 0; i < items.length; i++) {
        if (abortRef.current) break;

        const item = items[i];

        // Update current item to syncing
        setState((prev) => ({
          ...prev,
          currentIndex: i,
          items: prev.items.map((it, idx) =>
            idx === i ? { ...it, status: 'syncing' } : it
          ),
        }));

        try {
          const controller = new AbortController();
          controllerRef.current = controller;
          await syncFunctionRef.current!(item.walletId, { signal: controller.signal });

          // Mark as completed
          setState((prev) => ({
            ...prev,
            completedCount: prev.completedCount + 1,
            items: prev.items.map((it, idx) =>
              idx === i ? { ...it, status: 'completed' } : it
            ),
          }));
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Errore sconosciuto';
          const isAborted = error instanceof DOMException && error.name === 'AbortError';
          if (isAborted || abortRef.current) {
            break;
          }
          const isRateLimited = 
            errorMessage.toLowerCase().includes('rate limit') ||
            errorMessage.includes('429');

          // Mark as error
          setState((prev) => ({
            ...prev,
            errorCount: prev.errorCount + 1,
            items: prev.items.map((it, idx) =>
              idx === i
                ? { ...it, status: 'error', error: errorMessage, isRateLimited }
                : it
            ),
          }));

          if (isRateLimited) {
            toast({
              title: 'Rate limit rilevato',
              description: `Ritento automaticamente per ${item.walletLabel}...`,
              variant: 'destructive',
            });
            
            // Extra delay on rate limit
            await new Promise((resolve) => setTimeout(resolve, 3000));
          }
        }

        // Delay between wallets (skip on last)
        if (i < items.length - 1 && !abortRef.current) {
          await new Promise((resolve) =>
            setTimeout(resolve, DELAY_BETWEEN_WALLETS_MS)
          );
        }
      }

      controllerRef.current = null;

      // Complete
      setState((prev) => ({
        ...prev,
        isProcessing: false,
        currentIndex: -1,
      }));

      const finalState = items.reduce(
        (acc, item) => {
          if (item.status === 'completed') acc.completed++;
          if (item.status === 'error') acc.errors++;
          return acc;
        },
        { completed: 0, errors: 0 }
      );

      toast({
        title: 'Sincronizzazione completata',
        description: `${finalState.completed}/${wallets.length} wallet sincronizzati${
          finalState.errors > 0 ? `, ${finalState.errors} errori` : ''
        }.`,
      });
    },
    [state.isProcessing]
  );

  /**
   * Abort the current sync queue
   */
  const abortQueue = useCallback(() => {
    abortRef.current = true;
    controllerRef.current?.abort();
    controllerRef.current = null;
    setState((prev) => ({
      ...prev,
      isProcessing: false,
    }));
    toast({
      title: 'Sincronizzazione interrotta',
      description: 'La sincronizzazione è stata annullata.',
    });
  }, []);

  /**
   * Retry failed wallets
   */
  const retryFailed = useCallback(async () => {
    const failedWallets = state.items
      .filter((item) => item.status === 'error')
      .map((item) => ({ id: item.walletId, label: item.walletLabel }));

    if (failedWallets.length === 0) return;

    await startQueue(failedWallets);
  }, [state.items, startQueue]);

  /**
   * Get progress percentage
   */
  const getProgress = useCallback(() => {
    if (state.totalCount === 0) return 0;
    return Math.round(
      ((state.completedCount + state.errorCount) / state.totalCount) * 100
    );
  }, [state.completedCount, state.errorCount, state.totalCount]);

  /**
   * Get status text
   */
  const getStatusText = useCallback(() => {
    if (!state.isProcessing && state.totalCount === 0) return null;
    
    if (state.isProcessing) {
      const current = state.items[state.currentIndex];
      return `Sincronizzazione ${state.currentIndex + 1}/${state.totalCount}: ${current?.walletLabel || '...'}`;
    }
    
    return `Completato: ${state.completedCount}/${state.totalCount}${
      state.errorCount > 0 ? ` (${state.errorCount} errori)` : ''
    }`;
  }, [state]);

  return {
    state,
    startQueue,
    abortQueue,
    retryFailed,
    registerSyncFunction,
    getProgress,
    getStatusText,
  };
}
