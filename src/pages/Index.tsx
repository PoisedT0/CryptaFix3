import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { motion } from "framer-motion";
import { Wallet, TrendingUp, Calculator, ArrowDownRight, TrendingDown, BarChart3 } from "lucide-react";
import { Navigation, type Tab } from "@/components/layout/Navigation";
import { OnboardingScreen } from "@/components/onboarding/OnboardingScreen";
import { StatCard } from "@/components/dashboard/StatCard";
import { PortfolioList, type PortfolioAsset, type WalletInfo } from "@/components/dashboard/PortfolioList";
import { TransactionList } from "@/components/dashboard/TransactionList";
import { AddWalletDialog, WalletCard } from "@/components/wallet/WalletComponents";
import { SyncAllButton } from "@/components/wallet/SyncAllButton";
import { TaxCalculator } from "@/components/tax/TaxCalculator";
import { SimulationPanel } from "@/components/simulation/SimulationPanel";
import { ComplianceEducation } from "@/components/education/ComplianceEducation";
import { SettingsPanel } from "@/components/settings/SettingsPanel";
import { ManualTransactionDialog } from "@/components/transactions/ManualTransactionDialog";

import { Badge } from "@/components/ui/badge";
import { 
  isOnboardingComplete, 
  getWallets, 
  saveWallet, 
  deleteWallet,
  getTransactions as getManualTransactions,
  type Wallet as WalletType,
  type Transaction as StorageTransaction,
} from "@/lib/storage";
import { type Transaction } from "@/lib/crypto-data";
import { calculateCostBasisFIFO, filterTaxResultsByYear, calculateUnrealizedGains } from "@/lib/cost-basis";
import { getItalianCryptoTaxRules, getItalianCryptoTaxableAmount } from "@/lib/tax-rules";
import { useWalletSyncQueue } from "@/hooks/useWalletSyncQueue";

// Aggregated wallet data for dashboard sync
interface AggregatedData {
  holdings: Record<string, number>;
  transactions: Transaction[];
  totalValue: number;
}

const Index = () => {
  const [showOnboarding, setShowOnboarding] = useState(!isOnboardingComplete());
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");
  const [wallets, setWallets] = useState<WalletType[]>([]);

  // Aggregated data from all wallets
  const [aggregatedData, setAggregatedData] = useState<AggregatedData>({
    holdings: {},
    transactions: [],
    totalValue: 0,
  });

  // Holdings with EUR values for TaxCalculator
  const [holdingsWithValues, setHoldingsWithValues] = useState<Record<string, { amount: number; valueEur: number }>>({});
  const [realTotalValue, setRealTotalValue] = useState(0);

  // Track wallet data as it loads
  const [walletDataMap, setWalletDataMap] = useState<Record<string, { holdings: Record<string, number>; transactions: Transaction[]; value: number }>>({});

  // Wallet sync queue
  const syncQueue = useWalletSyncQueue();
  const walletRefreshRefs = useRef<Record<string, (() => Promise<void>) | undefined>>({});

  // Manual transactions state
  const [manualTransactions, setManualTransactions] = useState<Transaction[]>([]);

  useEffect(() => {
    setWallets(getWallets());
    // Load manual transactions
    const manualTxs = getManualTransactions();
    const formattedManualTxs: Transaction[] = manualTxs.map(tx => ({
      hash: tx.hash,
      type: tx.type,
      asset: tx.asset,
      amount: tx.amount,
      timestamp: tx.timestamp,
      valueEur: tx.valueEur,
      fee: tx.fee || 0,
      feeEur: tx.feeEur || 0,
    }));
    setManualTransactions(formattedManualTxs);
  }, []);

  // Handle manual transaction added
  const handleManualTransactionAdded = useCallback((tx: StorageTransaction) => {
    const formattedTx: Transaction = {
      hash: tx.hash,
      type: tx.type,
      asset: tx.asset,
      amount: tx.amount,
      timestamp: tx.timestamp,
      valueEur: tx.valueEur,
      fee: tx.fee || 0,
      feeEur: tx.feeEur || 0,
    };
    setManualTransactions(prev => [...prev, formattedTx]);
  }, []);

  // Handle manual transactions change (edit/delete)
  const handleManualTransactionsChange = useCallback((updatedTxs: StorageTransaction[]) => {
    const formattedTxs: Transaction[] = updatedTxs
      .filter(tx => tx.hash?.startsWith("manual-"))
      .map(tx => ({
        hash: tx.hash,
        type: tx.type,
        asset: tx.asset,
        amount: tx.amount,
        timestamp: tx.timestamp,
        valueEur: tx.valueEur,
        fee: tx.fee || 0,
        feeEur: tx.feeEur || 0,
      }));
    setManualTransactions(formattedTxs);
  }, []);

  // Aggregate data whenever walletDataMap or manualTransactions change
  useEffect(() => {
    const allHoldings: Record<string, number> = {};
    const allTransactions: Transaction[] = [...manualTransactions];
    let totalValue = 0;

    Object.values(walletDataMap).forEach(data => {
      // Merge holdings
      Object.entries(data.holdings).forEach(([symbol, amount]) => {
        allHoldings[symbol] = (allHoldings[symbol] || 0) + amount;
      });
      // Merge transactions
      allTransactions.push(...data.transactions);
      // Sum value
      totalValue += data.value;
    });

    // Sort transactions by timestamp desc
    allTransactions.sort((a, b) => {
      const timeA = typeof a.timestamp === 'number' ? a.timestamp : new Date(a.timestamp).getTime();
      const timeB = typeof b.timestamp === 'number' ? b.timestamp : new Date(b.timestamp).getTime();
      return timeB - timeA;
    });

    setAggregatedData({
      holdings: allHoldings,
      transactions: allTransactions,
      totalValue,
    });
  }, [walletDataMap, manualTransactions]);

  const handleAddWallet = (wallet: Omit<WalletType, "id" | "addedAt">) => {
    const newWallet = saveWallet(wallet);
    setWallets([...wallets, newWallet]);
  };

  const handleDeleteWallet = (id: string) => {
    deleteWallet(id);
    setWallets(wallets.filter(w => w.id !== id));
    // Remove from walletDataMap
    setWalletDataMap(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const handleWalletDataLoaded = useCallback((walletId: string, holdings: Record<string, number>, transactions: any[], value: number) => {
    // Convert API transactions to Transaction format
    const formattedTxs: Transaction[] = transactions.map(tx => {
      // Parse timestamp - API returns ISO string, we need milliseconds
      let timestamp: number;
      if (typeof tx.timestamp === 'number') {
        // If already a number, check if it's seconds or milliseconds
        timestamp = tx.timestamp < 1e12 ? tx.timestamp * 1000 : tx.timestamp;
      } else if (typeof tx.timestamp === 'string') {
        timestamp = new Date(tx.timestamp).getTime();
      } else {
        timestamp = Date.now();
      }
      
      // Determine transaction type more accurately
      // If the API marked it as buy/sell based on from/to, keep it
      // But also consider 'transfer' for wallet-to-wallet moves
      let txType = tx.type as Transaction['type'];
      if (!['buy', 'sell', 'transfer', 'stake', 'airdrop'].includes(txType)) {
        txType = 'transfer'; // Default unknown types to transfer
      }
      
      return {
        hash: tx.hash,
        type: txType,
        asset: tx.asset,
        amount: tx.amount,
        timestamp,
        valueEur: tx.valueEur || 0,
        fee: tx.fee || 0,
        feeEur: tx.feeEur || 0,
      };
    });

    setWalletDataMap(prev => ({
      ...prev,
      [walletId]: { holdings, transactions: formattedTxs, value },
    }));
  }, []);

  // Register refresh function for wallet
  const registerWalletRefresh = useCallback((walletId: string, refreshFn: () => Promise<void>) => {
    walletRefreshRefs.current[walletId] = refreshFn;
  }, []);

  // Register sync function for queue
  useEffect(() => {
    syncQueue.registerSyncFunction(async (walletId: string) => {
      const refreshFn = walletRefreshRefs.current[walletId];
      if (refreshFn) {
        await refreshFn();
      }
    });
  }, [syncQueue]);

  // Handle sync all wallets
  const handleSyncAll = useCallback(() => {
    if (wallets.length === 0) return;
    syncQueue.startQueue(wallets.map(w => ({ id: w.id, label: w.label })));
  }, [wallets, syncQueue]);

  // Callback when PortfolioList finishes loading real prices
  const handlePricesLoaded = useCallback((assets: PortfolioAsset[], totalValue: number) => {
    const holdings: Record<string, { amount: number; valueEur: number }> = {};
    assets.forEach(asset => {
      holdings[asset.symbol] = { amount: asset.amount, valueEur: asset.valueEur };
    });
    setHoldingsWithValues(holdings);
    setRealTotalValue(totalValue);
  }, []);

  const handleDataCleared = () => {
    setWallets([]);
    setWalletDataMap({});
    setHoldingsWithValues({});
    setRealTotalValue(0);
    setShowOnboarding(true);
  };

  // Calculate stats using real cost basis
  const currentYear = new Date().getFullYear();
  const taxRules = getItalianCryptoTaxRules(currentYear);

  // Use real total value from CoinGecko prices
  const portfolioValue = realTotalValue > 0 ? realTotalValue : aggregatedData.totalValue;

  // Calculate real gains using cost basis FIFO
  const costBasisResult = useMemo(() => {
    if (aggregatedData.transactions.length === 0) return null;
    return calculateCostBasisFIFO(aggregatedData.transactions);
  }, [aggregatedData.transactions]);

  // Get current year's realized gains
  const yearTaxResult = useMemo(() => {
    if (!costBasisResult) return { totalGains: 0, totalLosses: 0, netGain: 0, taxableEvents: [] };
    return filterTaxResultsByYear(costBasisResult, currentYear);
  }, [costBasisResult, currentYear]);

  // Calculate unrealized gains with current prices
  const currentPricesMap = useMemo(() => {
    const prices: Record<string, number> = {};
    Object.entries(holdingsWithValues).forEach(([symbol, data]) => {
      if (data.amount > 0) {
        prices[symbol] = data.valueEur / data.amount;
      }
    });
    return prices;
  }, [holdingsWithValues]);

  const unrealizedResult = useMemo(() => {
    if (!costBasisResult) return { totalUnrealizedGain: 0, totalUnrealizedLoss: 0, byAsset: {} };
    return calculateUnrealizedGains(costBasisResult.unrealizedGains, currentPricesMap);
  }, [costBasisResult, currentPricesMap]);

  // Total estimated gain = realized + unrealized
  const realizedGain = yearTaxResult.netGain;
  const unrealizedGain = unrealizedResult.totalUnrealizedGain - unrealizedResult.totalUnrealizedLoss;
  const totalEstimatedGain = realizedGain + unrealizedGain;
  
  // Tax is only on realized gains
  const taxableAmount = getItalianCryptoTaxableAmount(realizedGain, currentYear);
  const estimatedTax = taxableAmount * taxRules.taxRate;

  const hasWallets = wallets.length > 0;
  const hasData = portfolioValue > 0 || aggregatedData.transactions.length > 0;
  const hasRealizedGains = yearTaxResult.taxableEvents.length > 0;

  // Early return AFTER all hooks
  if (showOnboarding) {
    return <OnboardingScreen onComplete={() => setShowOnboarding(false)} />;
  }

  // Expandable content for stat cards
  const portfolioExpandable = hasData && (
    <div className="space-y-2 text-sm">
      <p className="font-medium">Dettaglio asset:</p>
      {Object.entries(holdingsWithValues).slice(0, 5).map(([symbol, data]) => (
        <div key={symbol} className="flex justify-between text-muted-foreground">
          <span>{symbol}</span>
          <span>€{data.valueEur.toLocaleString("it-IT", { minimumFractionDigits: 2 })}</span>
        </div>
      ))}
      {Object.keys(holdingsWithValues).length > 5 && (
        <p className="text-muted-foreground text-xs">+{Object.keys(holdingsWithValues).length - 5} altri asset</p>
      )}
    </div>
  );

  // Expandable for realized gains
  const realizedGainExpandable = hasData && (
    <div className="space-y-2 text-sm">
      <div className="flex justify-between text-muted-foreground">
        <span>Plusvalenze</span>
        <span className="text-success">+€{yearTaxResult.totalGains.toLocaleString("it-IT", { minimumFractionDigits: 2 })}</span>
      </div>
      <div className="flex justify-between text-muted-foreground">
        <span>Minusvalenze</span>
        <span className="text-destructive">-€{yearTaxResult.totalLosses.toLocaleString("it-IT", { minimumFractionDigits: 2 })}</span>
      </div>
      <p className="text-xs text-muted-foreground mt-2 pt-2 border-t border-border/50">
        💡 Solo i guadagni realizzati (vendite) sono tassabili
      </p>
    </div>
  );

  // Expandable for unrealized gains
  const unrealizedGainExpandable = hasData && Object.keys(costBasisResult?.unrealizedGains || {}).length > 0 && (
    <div className="space-y-2 text-sm">
      <p className="font-medium text-muted-foreground">Dettaglio per asset:</p>
      {Object.entries(unrealizedResult.byAsset || {}).slice(0, 5).map(([symbol, data]: [string, { unrealizedGainLoss: number }]) => (
        <div key={symbol} className="flex justify-between text-muted-foreground">
          <span>{symbol}</span>
          <span className={data.unrealizedGainLoss >= 0 ? "text-success" : "text-destructive"}>
            {data.unrealizedGainLoss >= 0 ? '+' : ''}€{data.unrealizedGainLoss.toLocaleString("it-IT", { minimumFractionDigits: 2 })}
          </span>
        </div>
      ))}
      <p className="text-xs text-muted-foreground mt-2 pt-2 border-t border-border/50">
        📊 Guadagno potenziale se vendessi oggi (non tassabile fino alla vendita)
      </p>
    </div>
  );

  const taxExpandable = hasData && (
    <div className="space-y-2 text-sm">
      <div className="flex justify-between text-muted-foreground">
        <span>Imponibile</span>
        <span>€{taxableAmount.toLocaleString("it-IT", { minimumFractionDigits: 2 })}</span>
      </div>
      <div className="flex justify-between text-muted-foreground">
        <span>Aliquota applicata</span>
        <span>{taxRules.taxRateLabel}</span>
      </div>
      <div className="flex justify-between text-muted-foreground">
        <span>Soglia esenzione</span>
        <span>{taxRules.hasExemptionThreshold ? `€${taxRules.exemptionThresholdEur?.toLocaleString("it-IT")}` : "Nessuna"}</span>
      </div>
      <Badge variant="outline" className="mt-2">Anno fiscale {currentYear}</Badge>
    </div>
  );

  const transactionsExpandable = hasData && aggregatedData.transactions.length > 0 && (
    <div className="space-y-2 text-sm">
      <p className="font-medium">Ultime transazioni:</p>
      {aggregatedData.transactions.slice(0, 3).map(tx => (
        <div key={tx.hash} className="flex justify-between text-muted-foreground">
          <span>{tx.type === "buy" ? "📈" : tx.type === "sell" ? "📉" : "↔️"} {tx.asset}</span>
          <span>€{tx.valueEur.toLocaleString("it-IT", { minimumFractionDigits: 2 })}</span>
        </div>
      ))}
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      <Navigation activeTab={activeTab} onTabChange={setActiveTab} />
      
      <main className="lg:ml-64 pt-20 lg:pt-0 pb-24 lg:pb-8">
        <div className="p-4 lg:p-8 max-w-7xl mx-auto">
          {activeTab === "dashboard" && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-6"
            >
              <h1 className="text-3xl font-bold font-display">Dashboard</h1>
              
              {/* Row 1: Portfolio + 2 Gain cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <StatCard
                  title="Valore Portfolio"
                  value={hasData 
                    ? `€${portfolioValue.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                    : "€0,00"
                  }
                  change={hasWallets ? `${Object.keys(aggregatedData.holdings).length} asset` : "Aggiungi wallet per iniziare"}
                  changeType={hasData ? "positive" : "neutral"}
                  icon={Wallet}
                  delay={0}
                  expandableContent={portfolioExpandable}
                />
                <StatCard
                  title="Guadagno Realizzato"
                  value={hasData 
                    ? `€${realizedGain.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                    : "€0,00"
                  }
                  change={hasRealizedGains 
                    ? `${yearTaxResult.taxableEvents.length} vendite nel ${currentYear}` 
                    : "Nessuna vendita (non tassabile)"
                  }
                  changeType={realizedGain > 0 ? "positive" : realizedGain < 0 ? "negative" : "neutral"}
                  icon={TrendingUp}
                  delay={0.1}
                  expandableContent={realizedGainExpandable}
                />
                <StatCard
                  title="Guadagno Non Realizzato"
                  value={hasData 
                    ? `€${unrealizedGain.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                    : "€0,00"
                  }
                  change={hasData ? "Potenziale (se vendessi oggi)" : "Nessun asset"}
                  changeType={unrealizedGain > 0 ? "positive" : unrealizedGain < 0 ? "negative" : "neutral"}
                  icon={BarChart3}
                  delay={0.15}
                  expandableContent={unrealizedGainExpandable}
                />
              </div>

              {/* Row 2: Taxes + Transactions */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <StatCard
                  title="Imposte Stimate"
                  value={hasData 
                    ? `€${estimatedTax.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                    : "€0,00"
                  }
                  change={hasData ? `Solo su guadagni realizzati (${taxRules.taxRateLabel})` : "Nessuna transazione"}
                  changeType={estimatedTax > 0 ? "negative" : "neutral"}
                  icon={Calculator}
                  delay={0.2}
                  expandableContent={taxExpandable}
                />
                <StatCard
                  title="Transazioni"
                  value={aggregatedData.transactions.length.toString()}
                  change={hasData ? "Totali" : "Nessuna transazione"}
                  changeType="neutral"
                  icon={ArrowDownRight}
                  delay={0.25}
                  expandableContent={transactionsExpandable}
                />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <PortfolioList 
                  holdings={aggregatedData.holdings} 
                  onPricesLoaded={handlePricesLoaded}
                  wallets={wallets.map(w => ({ id: w.id, label: w.label, chain: w.chain }))}
                  walletHoldings={Object.fromEntries(
                    Object.entries(walletDataMap).map(([id, data]) => [id, data.holdings])
                  )}
                />
                <TransactionList transactions={aggregatedData.transactions} limit={5} />
              </div>
            </motion.div>
          )}

          {activeTab === "wallets" && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <h1 className="text-3xl font-bold font-display">I Miei Wallet</h1>
                <div className="flex items-center gap-2">
                  <AddWalletDialog onAddWallet={handleAddWallet} />
                </div>
              </div>

              {/* Sync All Button */}
              {wallets.length > 1 && (
                <SyncAllButton
                  state={syncQueue.state}
                  onSync={handleSyncAll}
                  onAbort={syncQueue.abortQueue}
                  onRetryFailed={syncQueue.retryFailed}
                  progress={syncQueue.getProgress()}
                  statusText={syncQueue.getStatusText()}
                  disabled={syncQueue.state.isProcessing}
                />
              )}
              
              {wallets.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground">
                  <Wallet className="w-16 h-16 mx-auto mb-4 opacity-50" />
                  <p className="text-lg">Nessun wallet aggiunto</p>
                  <p className="text-sm">Aggiungi il tuo primo wallet per iniziare il tracking</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {wallets.map((wallet) => (
                    <WalletCard 
                      key={wallet.id} 
                      wallet={wallet} 
                      onDelete={handleDeleteWallet}
                      onDataLoaded={handleWalletDataLoaded}
                      onRegisterRefresh={registerWalletRefresh}
                      syncStatus={syncQueue.state.items.find(i => i.walletId === wallet.id)?.status}
                    />
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {activeTab === "tax" && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <h1 className="text-3xl font-bold font-display">Calcolo Imposte</h1>
                <ManualTransactionDialog onTransactionAdded={handleManualTransactionAdded} />
              </div>
              <TaxCalculator 
                transactions={aggregatedData.transactions}
                holdings={holdingsWithValues}
                portfolioValue={portfolioValue}
                wallets={wallets}
                walletDataMap={walletDataMap}
                onManualTransactionsChange={handleManualTransactionsChange}
              />
            </motion.div>
          )}

          {activeTab === "simulation" && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
              <h1 className="text-3xl font-bold font-display">Simulazione Fiscale</h1>
              <SimulationPanel />
            </motion.div>
          )}

          {activeTab === "education" && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
              <h1 className="text-3xl font-bold font-display">Normative e Compliance</h1>
              <ComplianceEducation />
            </motion.div>
          )}

          {activeTab === "settings" && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
              <h1 className="text-3xl font-bold font-display">Impostazioni</h1>
              <SettingsPanel onDataCleared={handleDataCleared} />
            </motion.div>
          )}
        </div>
      </main>
    </div>
  );
};

export default Index;
