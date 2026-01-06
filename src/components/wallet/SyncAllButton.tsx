/**
 * Sync All Wallets Button with Progress Indicator
 */

import { forwardRef } from 'react';
import { RefreshCw, X, AlertTriangle, CheckCircle2, Clock, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { SyncQueueState, WalletSyncStatus } from '@/hooks/useWalletSyncQueue';

interface SyncAllButtonProps {
  state: SyncQueueState;
  onSync: () => void;
  onAbort: () => void;
  onRetryFailed: () => void;
  progress: number;
  statusText: string | null;
  disabled?: boolean;
}

const getStatusIcon = (status: WalletSyncStatus) => {
  switch (status) {
    case 'queued':
      return <Clock className="w-3 h-3 text-muted-foreground" />;
    case 'syncing':
      return <Loader2 className="w-3 h-3 text-primary animate-spin" />;
    case 'completed':
      return <CheckCircle2 className="w-3 h-3 text-green-500" />;
    case 'error':
      return <AlertTriangle className="w-3 h-3 text-destructive" />;
  }
};

interface StatusBadgeProps {
  status: WalletSyncStatus;
  isRateLimited?: boolean;
}

const StatusBadge = forwardRef<HTMLDivElement, StatusBadgeProps>(
  ({ status, isRateLimited }, ref) => {
    const variants: Record<WalletSyncStatus, string> = {
      queued: 'bg-muted text-muted-foreground',
      syncing: 'bg-primary/10 text-primary',
      completed: 'bg-green-500/10 text-green-600',
      error: 'bg-destructive/10 text-destructive',
    };

    const labels: Record<WalletSyncStatus, string> = {
      queued: 'In coda',
      syncing: 'In sync',
      completed: 'Completato',
      error: isRateLimited ? 'Rate limit' : 'Errore',
    };

    return (
      <Badge ref={ref} variant="outline" className={`text-xs ${variants[status]}`}>
        {getStatusIcon(status)}
        <span className="ml-1">{labels[status]}</span>
      </Badge>
    );
  }
);

StatusBadge.displayName = "StatusBadge";

export function SyncAllButton({
  state,
  onSync,
  onAbort,
  onRetryFailed,
  progress,
  statusText,
  disabled,
}: SyncAllButtonProps) {
  const hasErrors = state.errorCount > 0;
  const isProcessing = state.isProcessing;

  return (
    <div className="flex flex-col gap-3">
      {/* Main button row */}
      <div className="flex items-center gap-2">
        {isProcessing ? (
          <Button variant="outline" onClick={onAbort} className="gap-2">
            <X className="w-4 h-4" />
            Interrompi
          </Button>
        ) : (
          <Button variant="gradient" onClick={onSync} disabled={disabled} className="gap-2">
            <RefreshCw className="w-4 h-4" />
            Sync tutti i wallet
          </Button>
        )}

        {hasErrors && !isProcessing && (
          <Button variant="outline" onClick={onRetryFailed} className="gap-2">
            <AlertTriangle className="w-4 h-4" />
            Riprova falliti ({state.errorCount})
          </Button>
        )}
      </div>

      {/* Progress section */}
      {(isProcessing || state.totalCount > 0) && (
        <div className="space-y-2 p-3 rounded-lg bg-muted/30 border border-border/50">
          {/* Progress bar */}
          <div className="flex items-center gap-3">
            <Progress value={progress} className="flex-1 h-2" />
            <span className="text-sm text-muted-foreground min-w-[60px] text-right">
              {progress}%
            </span>
          </div>

          {/* Status text */}
          {statusText && (
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              {isProcessing && <Loader2 className="w-4 h-4 animate-spin" />}
              {statusText}
            </p>
          )}

          {/* Individual wallet status */}
          {state.items.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {state.items.map((item) => (
                <TooltipProvider key={item.walletId}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span>
                        <StatusBadge status={item.status} isRateLimited={item.isRateLimited} />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="font-medium">{item.walletLabel}</p>
                      {item.error && (
                        <p className="text-xs text-destructive mt-1">{item.error}</p>
                      )}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
