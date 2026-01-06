import { useState, useEffect, forwardRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, AlertCircle, EyeOff, Eye, Ban, ChevronDown, ChevronUp, MoreHorizontal, PieChart, Wallet } from "lucide-react";
import { getCurrentPrices, type PriceData, isEuroStablecoin } from "@/lib/coingecko-api";
import { getHiddenAssets, toggleHiddenAsset, getSpamAssets, toggleSpamAsset, isAssetSpam, isAssetHidden } from "@/lib/storage";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import { useToast } from "@/hooks/use-toast";

export interface WalletInfo {
  id: string;
  label: string;
  chain: string;
}

interface AssetRowProps {
  symbol: string;
  amount: number;
  priceData?: PriceData;
  delay?: number;
  isHidden: boolean;
  isSpam: boolean;
  onToggleHidden: (symbol: string) => void;
  onToggleSpam: (symbol: string) => void;
  walletLabel?: string;
}

const ASSET_ICONS: Record<string, string> = {
  ETH: '⟠',
  BTC: '₿',
  SOL: '◎',
  MATIC: '⬡',
  USDC: '$',
  USDT: '$',
  DAI: '◈',
  EURC: '€',
  EURS: '€',
  LINK: '⬡',
  UNI: '🦄',
  TLM: '👽',
};

const ASSET_NAMES: Record<string, string> = {
  ETH: 'Ethereum',
  BTC: 'Bitcoin',
  SOL: 'Solana',
  MATIC: 'Polygon',
  USDC: 'USD Coin',
  USDT: 'Tether',
  DAI: 'Dai',
  EURC: 'Euro Coin',
  EURS: 'Stasis Euro',
  LINK: 'Chainlink',
  UNI: 'Uniswap',
  TLM: 'Alien Worlds',
};

const AssetRow = ({ symbol, amount, priceData, delay = 0, isHidden, isSpam, onToggleHidden, onToggleSpam, walletLabel }: AssetRowProps) => {
  const value = priceData ? amount * priceData.eur : 0;
  const isPositive = priceData ? priceData.eur_24h_change > 0 : false;
  const change = priceData?.eur_24h_change || 0;
  const icon = ASSET_ICONS[symbol.toUpperCase()] || '●';
  const name = ASSET_NAMES[symbol.toUpperCase()] || symbol;
  const isEuroStable = isEuroStablecoin(symbol);
  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20, height: 0 }}
      transition={{ duration: 0.4, delay }}
      className="flex items-center justify-between py-4 border-b border-border/50 last:border-0 group"
    >
      <div className="flex items-center gap-4">
        <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center text-xl">
          {icon}
        </div>
        <div>
          <p className="font-semibold font-display flex items-center gap-2">
            {symbol.toUpperCase()}
            {isEuroStable && (
              <Badge variant="outline" className="text-xs">EUR</Badge>
            )}
            {isSpam && (
              <Badge variant="destructive" className="text-xs">SPAM</Badge>
            )}
          </p>
          <div className="flex items-center gap-2">
            <p className="text-sm text-muted-foreground">{name}</p>
            {walletLabel && (
              <Badge variant="outline" className="text-xs">
                {walletLabel}
              </Badge>
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <div className="text-right">
          <p className="font-semibold font-display">
            €{value.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <div className="flex items-center gap-2 justify-end">
            <span className="text-sm text-muted-foreground">
              {amount.toFixed(4)} {symbol.toUpperCase()}
            </span>
            {priceData && (
              <Badge variant={isPositive ? "success" : "destructive"} className="text-xs">
                {isPositive ? "+" : ""}{change.toFixed(2)}%
              </Badge>
            )}
          </div>
        </div>
        
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
            <DropdownMenuItem onClick={() => onToggleHidden(symbol)}>
              {isHidden ? (
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
            <DropdownMenuItem onClick={() => onToggleSpam(symbol)}>
              {isSpam ? (
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
      </div>
    </motion.div>
  );
};

export interface PortfolioAsset {
  symbol: string;
  amount: number;
  valueEur: number;
  priceData?: PriceData;
}

interface PortfolioListProps {
  holdings: Record<string, number>;
  onPricesLoaded?: (assets: PortfolioAsset[], totalValue: number) => void;
  wallets?: WalletInfo[];
  walletHoldings?: Record<string, Record<string, number>>; // walletId -> {symbol: amount}
}

export const PortfolioList = forwardRef<HTMLDivElement, PortfolioListProps>(
  ({ holdings, onPricesLoaded, wallets = [], walletHoldings = {} }, ref) => {
    const [prices, setPrices] = useState<Record<string, PriceData>>({});
    const [loading, setLoading] = useState(true);
    const [usingFallback, setUsingFallback] = useState(false);
    const [hiddenAssets, setHiddenAssets] = useState<string[]>(getHiddenAssets());
    const [spamAssets, setSpamAssets] = useState<string[]>(getSpamAssets());
    const [showHidden, setShowHidden] = useState(false);
    const [selectedWallet, setSelectedWallet] = useState<string>("all");
    const { toast } = useToast();

    const fetchPricesData = async () => {
      const assets = Object.keys(holdings);
      if (assets.length === 0) {
        setLoading(false);
        return;
      }

      setLoading(true);
      const priceData = await getCurrentPrices(assets);
      setPrices(priceData);
      setUsingFallback(Object.keys(priceData).length < assets.length);
      setLoading(false);
    };

    // Initial fetch
    useEffect(() => {
      fetchPricesData();
    }, [holdings]);

    // Auto-refresh prices every 90 seconds
    useEffect(() => {
      const interval = setInterval(() => {
        if (Object.keys(holdings).length > 0) {
          fetchPricesData();
        }
      }, 90000);
      
      return () => clearInterval(interval);
    }, [holdings]);

    const handleToggleHidden = (symbol: string) => {
      const isNowHidden = toggleHiddenAsset(symbol);
      setHiddenAssets(getHiddenAssets());
      toast({
        title: isNowHidden ? "Asset nascosto" : "Asset visibile",
        description: `${symbol} è ora ${isNowHidden ? 'nascosto' : 'visibile'}.`,
      });
    };

    const handleToggleSpam = (symbol: string) => {
      const isNowSpam = toggleSpamAsset(symbol);
      setSpamAssets(getSpamAssets());
      toast({
        title: isNowSpam ? "Segnato come spam" : "Rimosso da spam",
        description: `${symbol} è stato ${isNowSpam ? 'segnato come spam' : 'rimosso dalla lista spam'}.`,
      });
    };

    // Get holdings based on selected wallet filter
    const currentHoldings = useMemo(() => {
      if (selectedWallet === "all") {
        return holdings;
      }
      return walletHoldings[selectedWallet] || {};
    }, [holdings, walletHoldings, selectedWallet]);

    const allAssets = useMemo(() => {
      return Object.entries(currentHoldings)
        .map(([symbol, amount]) => {
          const normalized = symbol.toUpperCase();
          const priceData = prices[normalized];
          const valueEur = priceData ? amount * priceData.eur : 0;
          return {
            symbol: normalized,
            amount,
            valueEur,
            priceData,
            isHidden: hiddenAssets.includes(normalized),
            isSpam: spamAssets.includes(normalized),
          };
        })
        .sort((a, b) => b.valueEur - a.valueEur);
    }, [currentHoldings, prices, hiddenAssets, spamAssets]);

    // Filter visible and hidden assets
    const visibleAssets = allAssets.filter(a => !a.isHidden && !a.isSpam);
    const hiddenAndSpamAssets = allAssets.filter(a => a.isHidden || a.isSpam);

    const totalValue = visibleAssets.reduce((sum, a) => sum + a.valueEur, 0);
    const hiddenValue = hiddenAndSpamAssets.reduce((sum, a) => sum + a.valueEur, 0);

    // Notify parent when prices are loaded (only visible assets from aggregated view)
    useEffect(() => {
      if (!loading && onPricesLoaded && selectedWallet === "all") {
        onPricesLoaded(visibleAssets, totalValue);
      }
    }, [loading, prices, holdings, hiddenAssets, spamAssets, selectedWallet]);

    // Get the selected wallet info
    const selectedWalletInfo = wallets.find(w => w.id === selectedWallet);

    return (
      <CollapsibleSection
        title="I tuoi Asset"
        icon={<PieChart className="w-5 h-5 text-primary" />}
        badge={
          <div className="flex items-center gap-2">
            {usingFallback && (
              <Badge variant="outline" className="text-xs flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                Prezzi stimati
              </Badge>
            )}
            <span className="text-lg font-bold text-primary">
              €{totalValue.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <Badge variant="outline">{visibleAssets.length} asset</Badge>
          </div>
        }
      >
        <div ref={ref}>
          {/* Wallet Filter */}
          {wallets.length > 1 && (
            <div className="mb-4 pb-4 border-b border-border/50">
              <div className="flex items-center gap-3">
                <Wallet className="w-4 h-4 text-muted-foreground" />
                <Select value={selectedWallet} onValueChange={setSelectedWallet}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Seleziona wallet" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">
                      <span className="flex items-center gap-2">
                        <span>🌐</span>
                        <span>Tutti i wallet</span>
                      </span>
                    </SelectItem>
                    {wallets.map((wallet) => (
                      <SelectItem key={wallet.id} value={wallet.id}>
                        <span className="flex items-center gap-2">
                          <span>{wallet.chain === 'BTC' ? '₿' : wallet.chain === 'ETH' ? '⟠' : '●'}</span>
                          <span>{wallet.label}</span>
                          <span className="text-xs text-muted-foreground">({wallet.chain})</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedWalletInfo && (
                  <Badge variant="secondary" className="text-xs">
                    {selectedWalletInfo.chain}
                  </Badge>
                )}
              </div>
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>Caricamento prezzi...</span>
            </div>
          ) : visibleAssets.length === 0 && hiddenAndSpamAssets.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>Nessun asset trovato.</p>
              <p className="text-sm mt-1">
                {selectedWallet === "all" 
                  ? "Aggiungi un wallet per iniziare."
                  : "Questo wallet non contiene asset."}
              </p>
            </div>
          ) : (
            <>
              <AnimatePresence mode="popLayout">
                {visibleAssets.map((asset, index) => (
                  <AssetRow
                    key={asset.symbol}
                    symbol={asset.symbol}
                    amount={asset.amount}
                    priceData={asset.priceData}
                    delay={index * 0.05}
                    isHidden={asset.isHidden}
                    isSpam={asset.isSpam}
                    onToggleHidden={handleToggleHidden}
                    onToggleSpam={handleToggleSpam}
                  />
                ))}
              </AnimatePresence>
              
              {/* Hidden/Spam Assets Collapsible */}
              {hiddenAndSpamAssets.length > 0 && (
                <Collapsible open={showHidden} onOpenChange={setShowHidden}>
                  <CollapsibleTrigger asChild>
                    <Button
                      variant="ghost"
                      className="w-full mt-4 flex items-center justify-between text-muted-foreground hover:text-foreground"
                    >
                      <div className="flex items-center gap-2">
                        <EyeOff className="w-4 h-4" />
                        <span>{hiddenAndSpamAssets.length} asset nascosti/spam</span>
                        <span className="text-xs">
                          (€{hiddenValue.toLocaleString("it-IT", { minimumFractionDigits: 2 })})
                        </span>
                      </div>
                      {showHidden ? (
                        <ChevronUp className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-2 pt-2 border-t border-border/30">
                    <AnimatePresence mode="popLayout">
                      {hiddenAndSpamAssets.map((asset, index) => (
                        <AssetRow
                          key={asset.symbol}
                          symbol={asset.symbol}
                          amount={asset.amount}
                          priceData={asset.priceData}
                          delay={index * 0.05}
                          isHidden={asset.isHidden}
                          isSpam={asset.isSpam}
                          onToggleHidden={handleToggleHidden}
                          onToggleSpam={handleToggleSpam}
                        />
                      ))}
                    </AnimatePresence>
                  </CollapsibleContent>
                </Collapsible>
              )}

              <div className="mt-4 pt-4 border-t border-border/50 text-xs text-muted-foreground text-center">
                Prezzi da CoinGecko (pubblici) • Aggiornati ogni 5 min
              </div>
            </>
          )}
        </div>
      </CollapsibleSection>
    );
  }
);

PortfolioList.displayName = "PortfolioList";
