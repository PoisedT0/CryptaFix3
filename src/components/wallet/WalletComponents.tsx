import { useState, useEffect, forwardRef } from "react";
import { motion } from "framer-motion";
import { Plus, Wallet, X, Check, Loader2, RefreshCw, AlertCircle, Info, WifiOff, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { useCryptoApi, type CryptoPrice } from "@/hooks/useCryptoApi";
import type { Wallet as WalletType } from "@/lib/storage";
import {
  type Provider,
  PROVIDER_LABELS,
  PROVIDER_KEY_LABELS,
  PROVIDER_DESCRIPTIONS,
  CHAINS,
  type SupportedUIChain,
  getBestProviderForChain,
  fetchWalletData as fetchWithProvider,
  fetchWalletDataWithFallback,
  getStoredProviders,
  saveProviderConfig,
} from "@/lib/crypto-providers";
import {
  getCachedHoldings,
  getCachedTransactions,
  setCachedHoldings,
  setCachedTransactions,
  setCacheMetadata,
  getCacheMetadata,
  isOnline,
} from "@/lib/cache-db";

// Filter providers by chain
const getProvidersForChain = (chain: string): Provider[] => {
  if (chain === 'BTC') {
    return ['bitcoin'];
  }
  if (chain === 'SOL') {
    return ['solana'];
  }
  if (chain === 'LINEA') {
    return ['lineascan'];
  }
  if (chain === 'BSC') {
    return ['bscscan'];
  }
  if (chain === 'MATIC') {
    return ['polygonscan', 'infura', 'alchemy'];
  }
  if (chain === 'ARB') {
    return ['arbiscan', 'infura', 'alchemy'];
  }
  if (['ETH', 'BASE', 'OP'].includes(chain)) {
    return ['etherscan', 'infura', 'alchemy'];
  }
  // zkSync uses Alchemy or RPC
  if (chain === 'ZK') {
    return ['alchemy', 'infura'];
  }
  return ['etherscan', 'infura', 'alchemy'];
};

interface AddWalletDialogProps {
  onAddWallet: (wallet: Omit<WalletType, "id" | "addedAt">) => void;
}

export const AddWalletDialog = forwardRef<HTMLDivElement, AddWalletDialogProps>(({ onAddWallet }, ref) => {
  const [open, setOpen] = useState(false);
  const [address, setAddress] = useState("");
  const [chain, setChain] = useState<SupportedUIChain>("ETH");
  const [label, setLabel] = useState("");
  const [provider, setProvider] = useState<Provider>("etherscan");
  const [apiKey, setApiKey] = useState("");
  const { toast } = useToast();

  // Get available providers for selected chain
  const availableProviders = getProvidersForChain(chain);

  // Auto-select appropriate provider when chain changes
  useEffect(() => {
    if (chain === 'BTC') {
      setProvider('bitcoin');
      setApiKey('');
    } else if (chain === 'SOL') {
      setProvider('solana');
      setApiKey('');
    } else if (chain === 'LINEA') {
      setProvider('lineascan');
    } else if (chain === 'BSC') {
      setProvider('bscscan');
    } else if (chain === 'MATIC') {
      setProvider('polygonscan');
    } else if (chain === 'ARB') {
      setProvider('arbiscan');
    } else if (provider === 'bitcoin') {
      const chainConfig = CHAINS.find(c => c.value === chain);
      const bestProvider = getBestProviderForChain(chainConfig?.apiChain || 'ethereum');
      setProvider(bestProvider);
    }
  }, [chain]);

  // Load saved API key for selected provider
  useEffect(() => {
    if (provider === 'bitcoin' || provider === 'solana') {
      setApiKey('');
      return;
    }
    const configs = getStoredProviders();
    const config = configs.find(c => c.provider === provider && !c.walletId);
    if (config) {
      setApiKey(config.apiKey);
    } else {
      setApiKey("");
    }
  }, [provider]);

  const validateAddress = (addr: string, selectedChain: string): boolean => {
    if (selectedChain === "BTC") {
      return /^(bc1|[13])[a-zA-HJ-NP-Z0-9]{25,39}$/.test(addr);
    }
    if (selectedChain === 'SOL') {
      // Base58 32-44 chars
      return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(addr);
    }
    // Ethereum-compatible address (all EVM chains)
    return /^0x[a-fA-F0-9]{40}$/.test(addr);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const trimmedAddress = address.trim();
    
    if (!trimmedAddress) {
      toast({
        title: "Indirizzo richiesto",
        description: "Inserisci un indirizzo wallet valido.",
        variant: "destructive",
      });
      return;
    }

    if (!validateAddress(trimmedAddress, chain)) {
      toast({
        title: "Indirizzo non valido",
        description:
          chain === "BTC"
            ? "L'indirizzo Bitcoin deve iniziare con bc1, 1 o 3"
            : chain === "SOL"
              ? "L'indirizzo Solana deve essere un public key base58 valido"
              : "L'indirizzo deve essere un indirizzo Ethereum valido (0x...)",
        variant: "destructive",
      });
      return;
    }

    // Save provider config if API key provided
    if (apiKey.trim()) {
      saveProviderConfig({
        provider,
        apiKey: apiKey.trim(),
      });
    }

    onAddWallet({
      address: trimmedAddress,
      chain,
      label: label.trim() || `${chain} Wallet`,
      provider,
      apiKey: apiKey.trim() || undefined,
    });

    toast({
      title: "Wallet aggiunto!",
      description: `Caricamento dati via ${PROVIDER_LABELS[provider]}...`,
    });

    setAddress("");
    setLabel("");
    setChain("ETH");
    setOpen(false);
  };

  const selectedChainInfo = CHAINS.find(c => c.value === chain);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="gradient" size="lg" className="gap-2">
          <Plus className="w-5 h-5" />
          Aggiungi Wallet
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md bg-card border-border">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">Aggiungi Wallet</DialogTitle>
          <DialogDescription>
            Inserisci l'indirizzo pubblico del tuo wallet per tracciarne il valore e le transazioni.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label htmlFor="chain">Blockchain</Label>
            <Select value={chain} onValueChange={(v) => setChain(v as SupportedUIChain)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CHAINS.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    <span className="flex items-center gap-2">
                      <span className="text-lg">{c.icon}</span>
                      <span>{c.label}</span>
                      <span className={`text-xs ${c.color}`}>({c.value})</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="address">Indirizzo Wallet</Label>
            <Input
              id="address"
              placeholder={
                chain === 'BTC' ? 'bc1...' : chain === 'SOL' ? 'Solana address...' : '0x...'
              }
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="font-mono text-sm"
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="label">Etichetta (opzionale)</Label>
            <Input
              id="label"
              placeholder={`Es: ${selectedChainInfo?.label || 'Main'} Wallet`}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="provider" className="flex items-center gap-2">
              Provider API
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="cursor-help"><Info className="w-4 h-4 text-muted-foreground" /></span>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p>Scegli quale servizio usare per leggere i dati blockchain. Tutti sono read-only e privacy-safe.</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </Label>
            <Select 
              value={provider} 
              onValueChange={(v) => setProvider(v as Provider)}
              disabled={chain === 'BTC' || chain === 'SOL'}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {availableProviders.map((p) => (
                  <SelectItem key={p} value={p}>
                    <span className="flex items-center gap-2">
                      <span>{PROVIDER_LABELS[p]}</span>
                      <span className="text-xs text-muted-foreground">- {PROVIDER_DESCRIPTIONS[p]}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {chain === 'BTC' && (
              <p className="text-xs text-muted-foreground">
                Bitcoin usa API pubbliche (Blockstream/Mempool) - nessuna chiave richiesta
              </p>
            )}
            {chain === 'SOL' && (
              <p className="text-xs text-muted-foreground">
                Solana usa RPC pubbliche (read-only) - nessuna chiave richiesta
              </p>
            )}
          </div>

          {provider !== "etherscan" && provider !== "bitcoin" && provider !== "solana" && (
            <div className="space-y-2">
              <Label htmlFor="apiKey">{PROVIDER_KEY_LABELS[provider]}</Label>
              <Input
                id="apiKey"
                placeholder={provider === "infura" ? "Infura Project ID" : "API Key"}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="font-mono text-sm"
              />
              {provider === "infura" && (
                <p className="text-xs text-muted-foreground">
                  Gratuito su <a href="https://infura.io" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">infura.io</a>
                </p>
              )}
            </div>
          )}

          <Alert variant="default" className="bg-muted/50">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="text-xs">
              Per sync stabile multi-chain, prova Infura (gratuito su infura.io)
            </AlertDescription>
          </Alert>

          <div className="flex gap-3 pt-4">
            <Button type="button" variant="outline" className="flex-1" onClick={() => setOpen(false)}>
              Annulla
            </Button>
            <Button type="submit" variant="gradient" className="flex-1">
              <Check className="w-4 h-4 mr-2" />
              Aggiungi
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
});

AddWalletDialog.displayName = "AddWalletDialog";

import type { WalletSyncStatus } from "@/hooks/useWalletSyncQueue";

interface WalletCardProps {
  wallet: WalletType;
  onDelete: (id: string) => void;
  onDataLoaded?: (walletId: string, holdings: Record<string, number>, transactions: any[], value: number, provider: Provider) => void;
  onRegisterRefresh?: (walletId: string, refreshFn: () => Promise<void>) => void;
  syncStatus?: WalletSyncStatus;
}

export const WalletCard = forwardRef<HTMLDivElement, WalletCardProps>(({ wallet, onDelete, onDataLoaded, onRegisterRefresh, syncStatus }, ref) => {
  const chainInfo = CHAINS.find((c) => c.value === wallet.chain);
  const { fetchWalletData: fetchEtherscan, fetchPrices, loading: apiLoading, error: apiError } = useCryptoApi();
  const [holdings, setHoldings] = useState<Record<string, number>>({});
  const [prices, setPrices] = useState<Record<string, CryptoPrice>>({});
  const [totalValue, setTotalValue] = useState(0);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeProvider, setActiveProvider] = useState<Provider>(wallet.provider || "etherscan");
  const [isOffline, setIsOffline] = useState(!isOnline());
  const [lastSync, setLastSync] = useState<number | null>(null);
  const [isFromCache, setIsFromCache] = useState(false);
  const { toast } = useToast();

  // Monitor online status
  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Load from cache only (for initial mount / navigation)
  const loadFromCache = async (): Promise<boolean> => {
    const network = chainInfo?.apiChain || "ethereum";
    
    try {
      const cachedHoldings = await getCachedHoldings(wallet.id, network);
      const cachedTxs = await getCachedTransactions(wallet.id, network);
      const metadata = await getCacheMetadata(wallet.id);
      
      if (cachedHoldings && Object.keys(cachedHoldings).length > 0) {
        setHoldings(cachedHoldings);
        setIsFromCache(true);
        setLastSync(metadata?.lastSync || null);
        setHasLoaded(true);
        
        // Notify parent with cached data
        const txs = cachedTxs || [];
        onDataLoaded?.(wallet.id, cachedHoldings, txs, 0, activeProvider);
        
        return true;
      }
    } catch (err) {
      console.log('[WalletCard] Cache load failed:', err);
    }
    
    return false;
  };

  // Full refresh from API
  const loadWalletData = async (showToast = false) => {
    setLoading(true);
    setError(null);
    setIsFromCache(false);

    const network = chainInfo?.apiChain || "ethereum";

    // If offline, use cache
    if (!isOnline()) {
      const loaded = await loadFromCache();
      if (loaded) {
        setLoading(false);
        toast({
          title: "Modalità offline",
          description: "Dati caricati dalla cache locale.",
        });
        return;
      }
    }

    try {
      let walletData = null;
      let usedProvider = activeProvider;

      // Bitcoin uses dedicated provider
      if (wallet.chain === "BTC") {
        try {
          walletData = await fetchWithProvider('bitcoin', 'bitcoin', wallet.address, '');
          usedProvider = 'bitcoin';
        } catch (err) {
          console.log('[WalletCard] Bitcoin fetch failed:', err);
          throw err;
        }
      } else {
        // Try with configured provider first for EVM chains
        if (wallet.provider && wallet.apiKey) {
          try {
            walletData = await fetchWithProvider(wallet.provider, network, wallet.address, wallet.apiKey);
            usedProvider = wallet.provider;
          } catch (err) {
            console.log(`[WalletCard] ${wallet.provider} failed, trying fallback...`);
          }
        }

        // Fallback to Etherscan via edge function
        if (!walletData) {
          const etherscanData = await fetchEtherscan(wallet.address, network);
          if (etherscanData) {
            walletData = {
              holdings: etherscanData.holdings,
              transactions: etherscanData.transactions,
              valueEur: 0,
              address: etherscanData.address,
              chain: etherscanData.chain,
              provider: 'etherscan' as Provider,
            };
            usedProvider = 'etherscan';
          }
        }
      }

      if (walletData) {
        setHoldings(walletData.holdings);
        setActiveProvider(usedProvider);

        // Cache the data
        await setCachedHoldings(wallet.id, network, walletData.holdings);
        if (walletData.transactions.length > 0) {
          await setCachedTransactions(wallet.id, network, walletData.transactions);
        }
        await setCacheMetadata(wallet.id, {
          lastSync: Date.now(),
          provider: usedProvider,
          chain: network,
        });
        setLastSync(Date.now());

        // Fetch prices for holdings
        const symbols = Object.keys(walletData.holdings);
        let calculatedValue = walletData.valueEur || 0;

        if (symbols.length > 0 && calculatedValue === 0) {
          const priceData = await fetchPrices(symbols);
          if (priceData) {
            setPrices(priceData);

            // Calculate total value
            for (const [symbol, amt] of Object.entries(walletData.holdings)) {
              const numAmt = typeof amt === 'number' ? amt : 0;
              if (priceData[symbol]) {
                calculatedValue += numAmt * priceData[symbol].price;
              }
            }
          }
        }

        setTotalValue(calculatedValue);
        onDataLoaded?.(wallet.id, walletData.holdings, walletData.transactions, calculatedValue, usedProvider);
        setHasLoaded(true);
      }
    } catch (err) {
      // Try cache on error
      const cachedHoldings = await getCachedHoldings(wallet.id, network);
      if (cachedHoldings) {
        setHoldings(cachedHoldings);
        setIsFromCache(true);
        const metadata = await getCacheMetadata(wallet.id);
        setLastSync(metadata?.lastSync || null);
        setHasLoaded(true);
        
        toast({
          title: "Usando cache",
          description: "Errore di rete, dati caricati dalla cache.",
        });
      } else {
        const message = err instanceof Error ? err.message : 'Errore caricamento dati';
        setError(message);
      }
      console.error('[WalletCard] Error:', err);
    } finally {
      setLoading(false);
    }
  };

  // On mount: try cache first, only fetch from API if no cache
  useEffect(() => {
    const initLoad = async () => {
      if (hasLoaded) return;
      
      // Try cache first
      const cachedLoaded = await loadFromCache();
      
      if (!cachedLoaded) {
        // No cache, need to fetch from API
        await loadWalletData(false);
      }
    };
    
    initLoad();
  }, [wallet.address]);

  // Register refresh function for parent queue
  useEffect(() => {
    if (onRegisterRefresh) {
      onRegisterRefresh(wallet.id, () => loadWalletData(false));
    }
  }, [wallet.id, onRegisterRefresh]);

  const handleRefresh = async () => {
    await loadWalletData(true);
    if (!error) {
      toast({
        title: "Dati aggiornati",
        description: `Sincronizzato via ${PROVIDER_LABELS[activeProvider]}.`,
      });
    }
  };

  // Get sync status indicator
  const getSyncStatusBadge = () => {
    if (!syncStatus) return null;
    
    const statusConfig: Record<WalletSyncStatus, { label: string; className: string }> = {
      queued: { label: 'In coda', className: 'bg-muted text-muted-foreground' },
      syncing: { label: 'In sync', className: 'bg-primary/10 text-primary' },
      completed: { label: 'Completato', className: 'bg-green-500/10 text-green-600' },
      error: { label: 'Errore', className: 'bg-destructive/10 text-destructive' },
    };
    
    const config = statusConfig[syncStatus];
    return (
      <Badge variant="outline" className={`text-xs ${config.className}`}>
        {syncStatus === 'syncing' && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
        {config.label}
      </Badge>
    );
  };

  const isLoading = loading || apiLoading;
  const currentError = error || apiError;

  const formatLastSync = (ts: number | null) => {
    if (!ts) return null;
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    
    if (days > 0) return `${days}g fa`;
    if (hours > 0) return `${hours}h fa`;
    if (mins > 0) return `${mins}min fa`;
    return 'ora';
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      layout
    >
      <Card variant="gradient" className="group hover:shadow-elevated transition-all duration-300">
        <CardContent className="p-4">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-2xl`}>
                {chainInfo?.icon}
              </div>
              <div>
                <p className="font-semibold font-display">{wallet.label}</p>
                <p className="text-xs text-muted-foreground font-mono">
                  {wallet.address.slice(0, 8)}...{wallet.address.slice(-6)}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {getSyncStatusBadge()}
              {isOffline && (
                <Badge variant="outline" className="text-xs flex items-center gap-1">
                  <WifiOff className="w-3 h-3" />
                  Offline
                </Badge>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={handleRefresh}
                disabled={isLoading}
              >
                <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={() => onDelete(wallet.id)}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Provider and Cache Status */}
          {hasLoaded && !currentError && (
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className="text-xs">
                via {PROVIDER_LABELS[activeProvider]}
              </Badge>
              <Badge variant="outline" className={`text-xs ${chainInfo?.color}`}>
                {chainInfo?.label}
              </Badge>
              {isFromCache && lastSync && (
                <Badge variant="secondary" className="text-xs flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  Cache: {formatLastSync(lastSync)}
                </Badge>
              )}
            </div>
          )}
          
          {isLoading && !hasLoaded ? (
            <div className="mt-4 py-6 text-center text-muted-foreground">
              <Loader2 className="w-6 h-6 mx-auto mb-2 animate-spin" />
              <p className="text-sm">Caricamento dati blockchain...</p>
            </div>
          ) : currentError ? (
            <div className="mt-4 py-4 text-center text-destructive text-sm">
              <p>Errore: {currentError}</p>
              <Button variant="outline" size="sm" className="mt-2" onClick={handleRefresh}>
                Riprova
              </Button>
            </div>
          ) : Object.keys(holdings).length === 0 ? (
            <div className="mt-4 py-4 text-center text-muted-foreground text-sm">
              <p>Nessun asset trovato</p>
              <p className="text-xs mt-1">Il wallet potrebbe essere vuoto</p>
              <Button variant="outline" size="sm" className="mt-2" onClick={handleRefresh}>
                <RefreshCw className="w-3 h-3 mr-1" />
                Riprova
              </Button>
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Valore Totale</span>
                <span className="text-lg font-bold font-display text-primary">
                  €{totalValue.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              
              <div className="space-y-2 pt-2 border-t border-border/50">
                {Object.entries(holdings).slice(0, 5).map(([symbol, amount]) => {
                  const price = prices[symbol];
                  const numAmount = typeof amount === 'number' ? amount : 0;
                  const value = price ? numAmount * price.price : 0;
                  return (
                    <div key={symbol} className="flex items-center justify-between text-sm">
                      <span className="font-medium">{symbol}</span>
                      <div className="text-right">
                        <p className="font-mono">{numAmount.toFixed(6)}</p>
                        <p className="text-xs text-muted-foreground">
                          €{value.toLocaleString("it-IT", { minimumFractionDigits: 2 })}
                        </p>
                      </div>
                    </div>
                  );
                })}
                {Object.keys(holdings).length > 5 && (
                  <p className="text-xs text-muted-foreground text-center pt-1">
                    +{Object.keys(holdings).length - 5} altri asset
                  </p>
                )}
              </div>
            </div>
          )}
          
          <div className="mt-4 pt-4 border-t border-border/50">
            <p className="text-xs text-muted-foreground">
              Aggiunto il {new Date(wallet.addedAt).toLocaleDateString("it-IT")}
            </p>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
});

WalletCard.displayName = "WalletCard";
