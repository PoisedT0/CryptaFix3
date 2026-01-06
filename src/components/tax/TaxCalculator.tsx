import { useState, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Calculator, FileText, Info, TrendingUp, TrendingDown, AlertTriangle, Download, FileSpreadsheet, Loader2, AlertCircle, Wallet, Pencil, Trash2, Send, Gift, Coins, Package, EyeOff, Eye, Ban, ChevronDown, ChevronUp, MoreHorizontal, Shield, Lock, Unlock } from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import { useCryptoApi, type Transaction as ApiTransaction, type CryptoPrice } from "@/hooks/useCryptoApi";
import { type Transaction } from "@/lib/crypto-data";
import { calculateCostBasis, calculateCostBasisFIFO, filterTaxResultsByYear, calculateUnrealizedGains, type CostBasisMethod } from "@/lib/cost-basis";
import { 
  getItalianCryptoTaxRules, 
  getItalianCryptoTaxableAmount,
  DAC8_REPORTING_THRESHOLD,
  isDAC8Reportable,
  calculateLossCompensation,
  calculateSubstituteTax2025,
  generateQuadroRW,
  generateQuadroRT,
  SUBSTITUTE_TAX_RATE_2025
} from "@/lib/tax-rules";
import { isEuroStablecoin, getCurrentPrices, type PriceData } from "@/lib/coingecko-api";
import { getTransactions, saveTransactions, getHiddenAssets, toggleHiddenAsset, getSpamAssets, toggleSpamAsset, getSettings, type Wallet as WalletType, type Transaction as StorageTransaction } from "@/lib/storage";
import { CHAINS } from "@/lib/crypto-providers";
import { EditTransactionDialog } from "@/components/transactions/EditTransactionDialog";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import { cn } from "@/lib/utils";

interface WalletData {
  holdings: Record<string, number>;
  transactions: Transaction[];
  value: number;
}

interface TaxCalculatorProps {
  transactions: Transaction[];
  holdings?: Record<string, { amount: number; valueEur: number }>;
  portfolioValue?: number;
  wallets?: WalletType[];
  walletDataMap?: Record<string, WalletData>;
  onManualTransactionsChange?: (transactions: StorageTransaction[]) => void;
}

const txTypeConfig = {
  buy: { icon: TrendingUp, label: "Acquisto", color: "text-success", bg: "bg-success/10" },
  sell: { icon: TrendingDown, label: "Vendita", color: "text-destructive", bg: "bg-destructive/10" },
  transfer: { icon: Send, label: "Trasferimento", color: "text-primary", bg: "bg-primary/10" },
  stake: { icon: Coins, label: "Staking", color: "text-warning", bg: "bg-warning/10" },
  airdrop: { icon: Gift, label: "Airdrop", color: "text-primary", bg: "bg-primary/10" },
};

export const TaxCalculator = ({ 
  transactions, 
  holdings = {}, 
  portfolioValue = 0,
  wallets = [],
  walletDataMap = {},
  onManualTransactionsChange,
}: TaxCalculatorProps) => {
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [method, setMethod] = useState<"FIFO" | "LIFO" | "HIFO">("FIFO");
  const [selectedWalletId, setSelectedWalletId] = useState<string>("all");
  const [loadingPrices, setLoadingPrices] = useState(false);
  const [realPrices, setRealPrices] = useState<Record<string, CryptoPrice>>({});
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editTransaction, setEditTransaction] = useState<StorageTransaction | null>(null);
  const [hiddenAssets, setHiddenAssets] = useState<string[]>(getHiddenAssets());
  const [spamAssets, setSpamAssets] = useState<string[]>(getSpamAssets());
  const [showHiddenHoldings, setShowHiddenHoldings] = useState(false);
  
  // New: Tax options state
  const [enableLossCompensation, setEnableLossCompensation] = useState(true);
  const [useSubstituteTax, setUseSubstituteTax] = useState(false);
  const [previousYearLosses] = useState<Record<number, number>>({}); // Would load from storage
  const [exportEncrypted, setExportEncrypted] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [exportPassphrase, setExportPassphrase] = useState("");
  
  const { exportReport, loading, fetchPrices } = useCryptoApi();
  const { toast } = useToast();
  const settings = getSettings();

  // Handle toggle hidden asset
  const handleToggleHidden = (symbol: string) => {
    const isNowHidden = toggleHiddenAsset(symbol);
    setHiddenAssets(getHiddenAssets());
    toast({
      title: isNowHidden ? "Asset nascosto" : "Asset visibile",
      description: `${symbol} è ora ${isNowHidden ? 'nascosto' : 'visibile'}.`,
    });
  };

  // Handle toggle spam asset
  const handleToggleSpam = (symbol: string) => {
    const isNowSpam = toggleSpamAsset(symbol);
    setSpamAssets(getSpamAssets());
    toast({
      title: isNowSpam ? "Segnato come spam" : "Rimosso da spam",
      description: `${symbol} è stato ${isNowSpam ? 'segnato come spam' : 'rimosso dalla lista spam'}.`,
    });
  };

  // Handle delete manual transaction
  const handleDeleteManualTx = (id: string) => {
    const allTxs = getTransactions();
    const updated = allTxs.filter(tx => tx.id !== id);
    saveTransactions(updated);
    onManualTransactionsChange?.(updated);
    toast({
      title: "Transazione eliminata",
      description: "La transazione è stata rimossa.",
    });
    setDeleteId(null);
  };

  // Handle edit manual transaction
  const handleEditManualTx = (updatedTx: StorageTransaction) => {
    const allTxs = getTransactions();
    const updated = allTxs.map(tx => tx.id === updatedTx.id ? updatedTx : tx);
    saveTransactions(updated);
    onManualTransactionsChange?.(updated);
    toast({
      title: "Transazione modificata",
      description: "Le modifiche sono state salvate.",
    });
    setEditTransaction(null);
  };

  // Get filtered data based on selected wallet
  const filteredData = useMemo(() => {
    if (selectedWalletId === "all") {
      return {
        transactions,
        holdings,
        portfolioValue,
      };
    }

    const walletData = walletDataMap[selectedWalletId];
    if (!walletData) {
      return {
        transactions: [],
        holdings: {},
        portfolioValue: 0,
      };
    }

    // Convert holdings to expected format
    const holdingsWithValues: Record<string, { amount: number; valueEur: number }> = {};
    Object.entries(walletData.holdings).forEach(([symbol, amount]) => {
      const price = realPrices[symbol]?.price || 0;
      holdingsWithValues[symbol] = {
        amount,
        valueEur: amount * price,
      };
    });

    return {
      transactions: walletData.transactions,
      holdings: holdingsWithValues,
      portfolioValue: walletData.value,
    };
  }, [selectedWalletId, transactions, holdings, portfolioValue, walletDataMap, realPrices]);

  // Fetch real prices for holdings
  const loadPrices = async () => {
    const assets = Object.keys(filteredData.holdings);
    if (assets.length === 0) return;
    
    setLoadingPrices(true);
    try {
      const prices = await fetchPrices(assets);
      if (prices) {
        setRealPrices(prices);
      }
    } catch (err) {
      console.error('Failed to fetch prices:', err);
    }
    setLoadingPrices(false);
  };

  useEffect(() => {
    loadPrices();
  }, [filteredData.holdings, fetchPrices]);

  // Auto-refresh prices every 90 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      if (Object.keys(filteredData.holdings).length > 0) {
        loadPrices();
      }
    }, 90000);
    
    return () => clearInterval(interval);
  }, [filteredData.holdings]);

  // Calculate real cost basis using selected method
  const costBasisResult = useMemo(() => {
    if (filteredData.transactions.length === 0) return null;
    return calculateCostBasis(filteredData.transactions, method as CostBasisMethod);
  }, [filteredData.transactions, method]);

  const taxResult = useMemo(() => {
    if (!costBasisResult) return { totalGains: 0, totalLosses: 0, netGain: 0, taxableEvents: [] };
    return filterTaxResultsByYear(costBasisResult, selectedYear);
  }, [costBasisResult, selectedYear]);

  const taxRules = useMemo(() => getItalianCryptoTaxRules(selectedYear), [selectedYear]);

  // Count euro stablecoins in holdings for special tax treatment info
  const euroStablecoinHoldings = Object.keys(filteredData.holdings).filter(isEuroStablecoin);

  const years = Array.from({ length: 5 }, (_, i) => currentYear - i);

  // Get selected wallet info
  const selectedWallet = wallets.find(w => w.id === selectedWalletId);
  const selectedChainInfo = selectedWallet ? CHAINS.find(c => c.value === selectedWallet.chain) : null;

  // Calculate real-time values for holdings
  const holdingsWithRealValues = useMemo(() => {
    const result: Array<{
      symbol: string;
      amount: number;
      valueEur: number;
      change24h: number;
      priceEur: number;
    }> = [];

    Object.entries(filteredData.holdings).forEach(([symbol, data]) => {
      const amount = typeof data === 'object' ? data.amount : data;
      const price = realPrices[symbol];
      const priceEur = price?.price || 0;
      const valueEur = amount * priceEur;
      const change24h = price?.change24h || 0;

      result.push({
        symbol,
        amount,
        valueEur,
        change24h,
        priceEur,
      });
    });

    // Sort by value descending
    return result.sort((a, b) => b.valueEur - a.valueEur);
  }, [filteredData.holdings, realPrices]);

  const totalRealValue = holdingsWithRealValues.reduce((acc, h) => acc + h.valueEur, 0);

  // Calculate unrealized gains with current prices
  const currentPricesMap = useMemo(() => {
    const prices: Record<string, number> = {};
    holdingsWithRealValues.forEach(h => {
      prices[h.symbol] = h.priceEur;
    });
    return prices;
  }, [holdingsWithRealValues]);

  const unrealizedResult = useMemo(() => {
    if (!costBasisResult) return { totalUnrealizedGain: 0, totalUnrealizedLoss: 0, byAsset: {} };
    return calculateUnrealizedGains(costBasisResult.unrealizedGains, currentPricesMap);
  }, [costBasisResult, currentPricesMap]);

  // Real gains/losses from transactions
  const hasRealTaxableEvents = taxResult.taxableEvents.length > 0;
  const effectiveTotalGains = taxResult.totalGains;
  const effectiveTotalLosses = taxResult.totalLosses;
  const effectiveNetGain = taxResult.netGain;

  const taxableAmount = getItalianCryptoTaxableAmount(effectiveNetGain, selectedYear);
  const estimatedTax = taxableAmount * taxRules.taxRate;
  const isTaxable = taxableAmount > 0;
  const hasData = filteredData.transactions.length > 0 || totalRealValue > 0;

  const handleExport = async (format: 'csv' | 'pdf') => {
    const exportTransactions: ApiTransaction[] = filteredData.transactions
      .filter(tx => tx.type === 'buy' || tx.type === 'sell' || tx.type === 'transfer')
      .map(tx => ({
        hash: tx.hash,
        type: tx.type as 'buy' | 'sell' | 'transfer',
        asset: tx.asset,
        amount: tx.amount,
        timestamp: typeof tx.timestamp === 'number' ? new Date(tx.timestamp).toISOString() : String(tx.timestamp),
        valueEur: tx.valueEur,
        fee: tx.fee,
      }));

    await exportReport(
      format,
      exportTransactions,
      filteredData.holdings as Record<string, { amount: number; valueEur: number }>,
      {
        totalValue: totalRealValue || filteredData.portfolioValue,
        totalGain: taxResult.netGain,
        estimatedTax: estimatedTax,
        year: selectedYear,
      }
    );

    toast({
      title: `Report ${format.toUpperCase()} generato`,
      description: `Il tuo report fiscale ${selectedYear} è stato scaricato.`,
    });
  };

  return (
    <div className="space-y-6">
      {/* Controls */}
      <CollapsibleSection
        title="Calcolatore Imposte"
        icon={<Calculator className="w-5 h-5 text-primary" />}
        badge={
          <span className="text-sm font-normal text-muted-foreground">
            {taxRules.summary}
          </span>
        }
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => handleExport('csv')}
              disabled={loading}
            >
              {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileSpreadsheet className="w-4 h-4 mr-2" />}
              CSV
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => handleExport('pdf')}
              disabled={loading}
            >
              {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
              PDF
            </Button>
          </div>
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Wallet Selection */}
          <div>
            <label className="text-sm text-muted-foreground mb-2 block">
              <Wallet className="w-3 h-3 inline mr-1" />
              Wallet
            </label>
            <Select value={selectedWalletId} onValueChange={setSelectedWalletId}>
              <SelectTrigger>
                <SelectValue placeholder="Seleziona wallet" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  <span className="flex items-center gap-2">
                    <span>📊</span>
                    <span>Tutti i wallet</span>
                  </span>
                </SelectItem>
                {wallets.map((wallet) => {
                  const chainInfo = CHAINS.find(c => c.value === wallet.chain);
                  return (
                    <SelectItem key={wallet.id} value={wallet.id}>
                      <span className="flex items-center gap-2">
                        <span>{chainInfo?.icon || '💼'}</span>
                        <span>{wallet.label}</span>
                        <span className={`text-xs ${chainInfo?.color || ''}`}>({wallet.chain})</span>
                      </span>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          {/* Year Selection */}
          <div>
            <label className="text-sm text-muted-foreground mb-2 block">Anno fiscale</label>
            <Select value={selectedYear.toString()} onValueChange={(v) => setSelectedYear(Number(v))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {years.map((year) => (
                  <SelectItem key={year} value={year.toString()}>
                    {year}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Method Selection */}
          <div>
            <label className="text-sm text-muted-foreground mb-2 block">
              Metodo di calcolo
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex items-center ml-1 cursor-help">
                    <Info className="w-3 h-3" />
                  </span>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p><strong>FIFO:</strong> First In, First Out - le prime crypto acquistate sono le prime vendute</p>
                  <p className="mt-1"><strong>LIFO:</strong> Last In, First Out - le ultime acquistate sono le prime vendute</p>
                  <p className="mt-1"><strong>HIFO:</strong> Highest In, First Out - vende prima quelle con costo più alto</p>
                </TooltipContent>
              </Tooltip>
            </label>
            <Select value={method} onValueChange={(v) => setMethod(v as typeof method)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="FIFO">FIFO (Consigliato)</SelectItem>
                <SelectItem value="LIFO">LIFO</SelectItem>
                <SelectItem value="HIFO">HIFO</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CollapsibleSection>

      {/* Selected Wallet Info */}
      {selectedWalletId !== "all" && selectedWallet && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <Card variant="gradient" className="border-primary/30">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-xl`}>
                  {selectedChainInfo?.icon || '💼'}
                </div>
                <div className="flex-1">
                  <p className="font-semibold">{selectedWallet.label}</p>
                  <p className="text-xs text-muted-foreground font-mono">
                    {selectedWallet.address.slice(0, 12)}...{selectedWallet.address.slice(-8)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-muted-foreground">Valore totale</p>
                  <p className="font-bold text-primary">
                    {loadingPrices ? (
                      <Loader2 className="w-4 h-4 animate-spin inline" />
                    ) : (
                      `€${totalRealValue.toLocaleString("it-IT", { minimumFractionDigits: 2 })}`
                    )}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Manual Transactions List with Edit/Delete */}
      {(() => {
        // Get manual transactions from storage for edit/delete
        const storedTxs = getTransactions();
        const manualStoredTxs = storedTxs.filter(tx => tx.hash?.startsWith('manual-'));
        
        // Filter only manual transactions from props (hash starts with 'manual-')
        const manualTxs = filteredData.transactions.filter(tx => 
          tx.hash && tx.hash.startsWith('manual-')
        );
        
        if (manualTxs.length === 0) {
          return (
            <CollapsibleSection
              title="Transazioni Manuali"
              icon={<FileText className="w-5 h-5 text-primary" />}
              badge={<Badge variant="secondary">0</Badge>}
              className="border-dashed"
            >
              <div className="text-center py-6">
                <Coins className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
                <p className="text-muted-foreground">Nessuna transazione manuale inserita</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Usa il pulsante "Aggiungi Transazione" per inserire transazioni storiche
                </p>
              </div>
            </CollapsibleSection>
          );
        }

        // Sort by timestamp descending
        const sortedTxs = [...manualTxs].sort((a, b) => b.timestamp - a.timestamp);

        return (
          <CollapsibleSection
            title="Transazioni Manuali"
            icon={<FileText className="w-5 h-5 text-primary" />}
            badge={<Badge variant="secondary">{manualTxs.length}</Badge>}
          >
            <div className="space-y-2">
              <AnimatePresence mode="popLayout">
                {sortedTxs.map((tx, idx) => {
                  const config = txTypeConfig[tx.type as keyof typeof txTypeConfig] || txTypeConfig.transfer;
                  const Icon = config.icon;
                  // Find matching stored tx for edit
                  const storedTx = manualStoredTxs.find(stx => stx.hash === tx.hash);
                  
                  return (
                    <motion.div
                      key={tx.hash}
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: -50 }}
                      transition={{ delay: idx * 0.02 }}
                      className="flex items-center justify-between p-3 rounded-lg border border-border/30 hover:border-border/60 transition-colors group"
                    >
                      <div className="flex items-center gap-3">
                        <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center", config.bg)}>
                          <Icon className={cn("w-5 h-5", config.color)} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold">{tx.asset}</span>
                            <Badge variant="outline" className="text-xs">
                              {config.label}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(tx.timestamp), "d MMM yyyy", { locale: it })}
                          </p>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <p className={cn("font-medium", tx.type === "sell" ? "text-destructive" : "text-success")}>
                            {tx.type === "sell" ? "-" : "+"}{tx.amount.toFixed(6)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            €{tx.valueEur.toLocaleString("it-IT", { minimumFractionDigits: 2 })}
                          </p>
                        </div>
                        
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {storedTx && (
                            <>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => setEditTransaction(storedTx)}
                              >
                                <Pencil className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive hover:text-destructive"
                                onClick={() => setDeleteId(storedTx.id)}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          </CollapsibleSection>
        );
      })()}

      {/* Holdings Section - Assets still held (unrealized) */}
      {costBasisResult && Object.keys(costBasisResult.unrealizedGains).length > 0 && (() => {
        // Split visible and hidden/spam assets
        const allHoldings = Object.entries(unrealizedResult.byAsset)
          .map(([asset, data]) => ({
            asset,
            data,
            unrealizedData: costBasisResult.unrealizedGains[asset],
            isHidden: hiddenAssets.includes(asset.toUpperCase()),
            isSpam: spamAssets.includes(asset.toUpperCase()),
          }))
          .sort((a, b) => b.data.currentValue - a.data.currentValue);

        const visibleHoldings = allHoldings.filter(h => !h.isHidden && !h.isSpam);
        const hiddenHoldings = allHoldings.filter(h => h.isHidden || h.isSpam);
        
        const visibleTotalValue = visibleHoldings.reduce((acc, h) => acc + h.data.currentValue, 0);
        const hiddenTotalValue = hiddenHoldings.reduce((acc, h) => acc + h.data.currentValue, 0);

        const renderHoldingRow = (h: typeof allHoldings[0], showActions = true) => {
          const isProfit = h.data.unrealizedGainLoss >= 0;
          const percentChange = h.data.costBasis > 0 
            ? ((h.data.unrealizedGainLoss / h.data.costBasis) * 100) 
            : 0;
          
          return (
            <motion.div
              key={h.asset}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="p-4 rounded-lg border border-border/30 hover:border-border/60 transition-colors group"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <span className="font-bold text-primary text-sm">{h.asset.slice(0, 3)}</span>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold">{h.asset}</p>
                      {h.isSpam && (
                        <Badge variant="destructive" className="text-xs">SPAM</Badge>
                      )}
                      {h.isHidden && !h.isSpam && (
                        <Badge variant="outline" className="text-xs">Nascosto</Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {h.data.amount.toFixed(6)} unità
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div className="flex items-center gap-2 justify-end">
                      {loadingPrices ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <p className="font-bold text-lg">
                          €{h.data.currentValue.toLocaleString("it-IT", { minimumFractionDigits: 2 })}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 justify-end mt-1">
                      {isProfit ? (
                        <TrendingUp className="w-3 h-3 text-success" />
                      ) : (
                        <TrendingDown className="w-3 h-3 text-destructive" />
                      )}
                      <span className={cn(
                        "text-sm font-medium",
                        isProfit ? "text-success" : "text-destructive"
                      )}>
                        {isProfit ? "+" : ""}{h.data.unrealizedGainLoss.toLocaleString("it-IT", { minimumFractionDigits: 2 })}€
                        <span className="text-xs ml-1">
                          ({isProfit ? "+" : ""}{percentChange.toFixed(1)}%)
                        </span>
                      </span>
                    </div>
                  </div>
                  
                  {showActions && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="bg-popover">
                        <DropdownMenuItem onClick={() => handleToggleHidden(h.asset)}>
                          {h.isHidden ? (
                            <>
                              <Eye className="w-4 h-4 mr-2" />
                              Mostra asset
                            </>
                          ) : (
                            <>
                              <EyeOff className="w-4 h-4 mr-2" />
                              Nascondi asset
                            </>
                          )}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleToggleSpam(h.asset)}>
                          {h.isSpam ? (
                            <>
                              <Eye className="w-4 h-4 mr-2" />
                              Non è spam
                            </>
                          ) : (
                            <>
                              <Ban className="w-4 h-4 mr-2" />
                              Segna come spam
                            </>
                          )}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </div>
              
              <div className="mt-3 pt-3 border-t border-border/20 grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Costo medio acquisto</p>
                  <p className="font-medium">
                    €{h.unrealizedData?.avgCost?.toLocaleString("it-IT", { minimumFractionDigits: 2 }) || "0.00"}/unità
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Costo base totale</p>
                  <p className="font-medium">
                    €{h.data.costBasis.toLocaleString("it-IT", { minimumFractionDigits: 2 })}
                  </p>
                </div>
              </div>
            </motion.div>
          );
        };

        return (
          <CollapsibleSection
            title="Holdings (Asset Non Venduti)"
            icon={<Package className="w-5 h-5 text-primary" />}
            badge={
              <div className="flex items-center gap-2">
                <Badge variant="secondary">
                  {visibleHoldings.length} asset
                </Badge>
                {hiddenHoldings.length > 0 && (
                  <Badge variant="outline" className="text-xs">
                    +{hiddenHoldings.length} nascosti
                  </Badge>
                )}
              </div>
            }
          >
            <p className="text-sm text-muted-foreground mb-4">
              Asset ancora in tuo possesso con plusvalenze/minusvalenze non realizzate
            </p>
            
            <div className="space-y-3">
              <AnimatePresence mode="popLayout">
                {visibleHoldings.map((h) => renderHoldingRow(h))}
              </AnimatePresence>
            </div>
            
            {/* Hidden/Spam Holdings Collapsible */}
            {hiddenHoldings.length > 0 && (
              <Collapsible open={showHiddenHoldings} onOpenChange={setShowHiddenHoldings}>
                <CollapsibleTrigger asChild>
                  <Button
                    variant="ghost"
                    className="w-full mt-4 flex items-center justify-between text-muted-foreground hover:text-foreground"
                  >
                    <div className="flex items-center gap-2">
                      <EyeOff className="w-4 h-4" />
                      <span>{hiddenHoldings.length} asset nascosti/spam</span>
                      <span className="text-xs">
                        (€{hiddenTotalValue.toLocaleString("it-IT", { minimumFractionDigits: 2 })})
                      </span>
                    </div>
                    {showHiddenHoldings ? (
                      <ChevronUp className="w-4 h-4" />
                    ) : (
                      <ChevronDown className="w-4 h-4" />
                    )}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-2 pt-2 border-t border-border/30">
                  <div className="space-y-3">
                    <AnimatePresence mode="popLayout">
                      {hiddenHoldings.map((h) => renderHoldingRow(h))}
                    </AnimatePresence>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            )}
            
            {/* Holdings Summary */}
            <div className="mt-4 p-4 rounded-xl bg-secondary/50 border border-border/30">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Valore Totale Holdings</p>
                  <p className="text-xl font-bold text-primary">
                    {loadingPrices ? (
                      <Loader2 className="w-4 h-4 animate-spin inline" />
                    ) : (
                      `€${visibleTotalValue.toLocaleString("it-IT", { minimumFractionDigits: 2 })}`
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Plusvalenza Non Realizzata</p>
                  <p className="text-xl font-bold text-success">
                    +€{visibleHoldings.reduce((acc, h) => acc + Math.max(0, h.data.unrealizedGainLoss), 0).toLocaleString("it-IT", { minimumFractionDigits: 2 })}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Minusvalenza Non Realizzata</p>
                  <p className="text-xl font-bold text-destructive">
                    -€{Math.abs(visibleHoldings.reduce((acc, h) => acc + Math.min(0, h.data.unrealizedGainLoss), 0)).toLocaleString("it-IT", { minimumFractionDigits: 2 })}
                  </p>
                </div>
              </div>
            </div>
            
            <p className="text-xs text-muted-foreground mt-3 text-center">
              Le plusvalenze/minusvalenze diventano realizzate (tassabili) solo quando vendi gli asset
            </p>
          </CollapsibleSection>
        );
      })()}
      {selectedYear >= 2025 && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <Card variant="gradient" className="border-warning/30">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-semibold text-warning">
                    {selectedYear === 2025 ? "Novità 2025" : "Novità 2026+"}
                  </p>
                  <p className="text-muted-foreground mt-1">
                    {selectedYear === 2025 
                      ? "Dal 2025 non c'è più la soglia di esenzione: le plusvalenze sono tassate al 26%."
                      : "Dal 2026 l'aliquota sulle plusvalenze crypto sale al 33% (senza soglia di esenzione)."
                    }
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Euro stablecoin info */}
      {euroStablecoinHoldings.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <Card variant="gradient" className="border-primary/30">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-semibold text-primary">
                    Stablecoin euro-ancorate rilevate
                  </p>
                  <p className="text-muted-foreground mt-1">
                    Hai {euroStablecoinHoldings.join(', ')} nel tuo portafoglio. 
                    Le plusvalenze su stablecoin ancorate all'euro sono tassate al 26% 
                    (art. 67 TUIR, come crypto-asset standard).
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Results - Interactive Summary */}
      <Card variant="gradient">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calculator className="w-5 h-5 text-primary" />
            Risultato Calcolo {selectedYear}
            {!hasRealTaxableEvents && hasData && (
              <Badge variant="secondary" className="ml-2 text-xs">
                Nessuna vendita
              </Badge>
            )}
            {selectedWalletId !== "all" && selectedWallet && (
              <Badge variant="outline" className="ml-2 text-xs">
                {selectedWallet.label}
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            {hasRealTaxableEvents
              ? `Basato su ${taxResult.taxableEvents.length} vendite realizzate • Metodo ${method}`
              : (hasData ? "Nessuna vendita rilevata nel periodo selezionato" : "Aggiungi un wallet per iniziare")
            }
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="p-4 rounded-xl bg-success/10 border border-success/20"
            >
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="w-4 h-4 text-success" />
                <span className="text-sm text-muted-foreground">Plusvalenze Realizzate</span>
              </div>
              <p className="text-xl font-bold font-display text-success">
                +€{effectiveTotalGains.toLocaleString("it-IT", { minimumFractionDigits: 2 })}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Da vendite crypto (FIFO)
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="p-4 rounded-xl bg-destructive/10 border border-destructive/20"
            >
              <div className="flex items-center gap-2 mb-1">
                <TrendingDown className="w-4 h-4 text-destructive" />
                <span className="text-sm text-muted-foreground">Minusvalenze</span>
              </div>
              <p className="text-xl font-bold font-display text-destructive">
                -€{effectiveTotalLosses.toLocaleString("it-IT", { minimumFractionDigits: 2 })}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Compensabili per 4 anni
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className={`p-4 rounded-xl ${effectiveNetGain >= 0 ? 'bg-primary/10 border-primary/20' : 'bg-muted border-muted'} border`}
            >
              <div className="flex items-center gap-2 mb-1">
                <Calculator className="w-4 h-4 text-primary" />
                <span className="text-sm text-muted-foreground">Guadagno Netto</span>
              </div>
              <p className={`text-xl font-bold font-display ${effectiveNetGain >= 0 ? "text-primary" : "text-muted-foreground"}`}>
                €{effectiveNetGain.toLocaleString("it-IT", { minimumFractionDigits: 2 })}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Plusvalenze - Minusvalenze
              </p>
            </motion.div>
          </div>

          {/* Tax calculation details */}
          <div className="space-y-3 pt-4 border-t border-border/50">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Soglia di esenzione {selectedYear}</span>
              <span className="font-medium">
                {taxRules.hasExemptionThreshold && typeof taxRules.exemptionThresholdEur === "number"
                  ? `€${taxRules.exemptionThresholdEur.toLocaleString("it-IT")}`
                  : <Badge variant="warning" className="text-xs">Non prevista</Badge>
                }
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Importo tassabile</span>
              <span className="font-semibold">
                €{taxableAmount.toLocaleString("it-IT", { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Aliquota {selectedYear}</span>
              <Badge variant={isTaxable ? "warning" : "success"}>
                {taxRules.taxRateLabel}
              </Badge>
            </div>
          </div>

          {/* Tax result */}
          <div className="mt-6 p-4 rounded-xl bg-secondary/50">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-semibold text-lg">Imposta Stimata</span>
                <p className="text-xs text-muted-foreground">
                  {isTaxable ? `${taxableAmount.toLocaleString("it-IT")} × ${taxRules.taxRateLabel}` : "Nessuna imposta dovuta"}
                </p>
              </div>
              <span className="text-2xl font-bold font-display text-primary">
                €{estimatedTax.toLocaleString("it-IT", { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          {isTaxable && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-start gap-3 p-4 rounded-xl bg-warning/10 border border-warning/30 mt-4"
            >
              <AlertTriangle className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-semibold text-warning">Obbligo Dichiarativo</p>
                <p className="text-muted-foreground mt-1">
                  Hai plusvalenze tassabili. Compila il Quadro RW (monitoraggio) e RT (plusvalenze).
                </p>
              </div>
            </motion.div>
          )}
        </CardContent>
      </Card>

      {/* Disclaimer */}
      <div className="text-xs text-muted-foreground p-4 rounded-lg bg-secondary/30">
        <p><strong>Disclaimer:</strong> Questo calcolo è indicativo. Consulta un commercialista per la dichiarazione dei redditi.</p>
        <p className="mt-2"><strong>Riferimenti:</strong> Legge di Bilancio 2025 (L. 207/2024) • Prezzi: CoinGecko</p>
      </div>

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive" />
              Eliminare transazione?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Questa azione non può essere annullata. La transazione verrà rimossa dal calcolo del cost basis.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteId && handleDeleteManualTx(deleteId)}
            >
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit transaction dialog */}
      {editTransaction && (
        <EditTransactionDialog
          transaction={editTransaction}
          open={!!editTransaction}
          onOpenChange={(open) => !open && setEditTransaction(null)}
          onSave={handleEditManualTx}
        />
      )}
    </div>
  );
};
