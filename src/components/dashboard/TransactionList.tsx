import React, { forwardRef, useState, useEffect, useMemo, useRef } from "react";
import { motion } from "framer-motion";
import { ArrowUpRight, ArrowDownRight, Send, Coins, Gift, ArrowDownUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { MockTransaction } from "@/lib/crypto-data";
import { getCurrentPrices } from "@/lib/coingecko-api";
import { CollapsibleSection } from "@/components/ui/collapsible-section";

const typeConfig = {
  buy: { icon: ArrowDownRight, label: "Acquisto", color: "text-success", bgColor: "bg-success/10" },
  sell: { icon: ArrowUpRight, label: "Vendita", color: "text-destructive", bgColor: "bg-destructive/10" },
  transfer: { icon: Send, label: "Trasferimento", color: "text-primary", bgColor: "bg-primary/10" },
  stake: { icon: Coins, label: "Staking", color: "text-warning", bgColor: "bg-warning/10" },
  airdrop: { icon: Gift, label: "Airdrop", color: "text-primary", bgColor: "bg-primary/10" },
};

interface TransactionRowProps {
  transaction: MockTransaction;
  delay?: number;
  currentPrice?: number;
}

const TransactionRow = ({ transaction, delay = 0, currentPrice }: TransactionRowProps) => {
  const config = typeConfig[transaction.type];
  const Icon = config.icon;
  const date = new Date(transaction.timestamp);

  // Use valueEur if available, otherwise calculate from current price
  const displayValue = transaction.valueEur > 0 
    ? transaction.valueEur 
    : (currentPrice ? transaction.amount * currentPrice : 0);

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.4, delay }}
      className="flex items-center justify-between py-4 border-b border-border/50 last:border-0 group hover:bg-secondary/30 -mx-2 px-2 rounded-lg transition-colors"
    >
      <div className="flex items-center gap-4">
        <div className={`w-10 h-10 rounded-full ${config.bgColor} flex items-center justify-center`}>
          <Icon className={`w-5 h-5 ${config.color}`} />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <p className="font-semibold font-display">{config.label}</p>
            <Badge variant="outline" className="text-xs">{transaction.asset}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {date.toLocaleDateString("it-IT")} • {date.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}
          </p>
        </div>
      </div>
      <div className="text-right">
        <p className={`font-semibold font-display ${transaction.type === "sell" ? "text-destructive" : config.color}`}>
          {transaction.type === "sell" ? "-" : "+"}{transaction.amount.toFixed(4)} {transaction.asset}
        </p>
        <p className="text-sm text-muted-foreground">
          {displayValue > 0 
            ? `€${displayValue.toLocaleString("it-IT", { minimumFractionDigits: 2 })}`
            : <span className="italic">valore N/D</span>
          }
        </p>
      </div>
    </motion.div>
  );
};

interface TransactionListProps {
  transactions: MockTransaction[];
  limit?: number;
}

export const TransactionList = forwardRef<HTMLDivElement, TransactionListProps>(
  ({ transactions, limit }, ref) => {
    const displayTransactions = useMemo(() => 
      limit ? transactions.slice(0, limit) : transactions, 
      [transactions, limit]
    );
    const [prices, setPrices] = useState<Record<string, number>>({});
    const hasFetched = useRef(false);

    // Create stable dependency for assets that need prices
    const assetsNeedingPrices = useMemo(() => {
      const assets = displayTransactions
        .filter(tx => !tx.valueEur || tx.valueEur === 0)
        .map(tx => tx.asset.toUpperCase());
      return [...new Set(assets)].sort().join(',');
    }, [displayTransactions]);

    // Fetch current prices for transactions without valueEur
    useEffect(() => {
      if (!assetsNeedingPrices || hasFetched.current) return;
      
      const uniqueAssets = assetsNeedingPrices.split(',').filter(Boolean);
      
      if (uniqueAssets.length > 0) {
        hasFetched.current = true;
        getCurrentPrices(uniqueAssets).then(priceData => {
          const priceMap: Record<string, number> = {};
          Object.entries(priceData).forEach(([symbol, data]) => {
            priceMap[symbol] = data.eur;
          });
          setPrices(priceMap);
        });
      }
    }, [assetsNeedingPrices]);

    // Calculate total value of displayed transactions
    const totalValue = displayTransactions.reduce((sum, tx) => {
      const value = tx.valueEur > 0 ? tx.valueEur : (prices[tx.asset.toUpperCase()] ? tx.amount * prices[tx.asset.toUpperCase()] : 0);
      return sum + value;
    }, 0);

    return (
      <CollapsibleSection
        title="Transazioni Recenti"
        icon={<ArrowDownUp className="w-5 h-5 text-primary" />}
        badge={
          <div className="flex items-center gap-2">
            {totalValue > 0 && (
              <span className="text-sm font-normal text-muted-foreground">
                Totale: €{totalValue.toLocaleString("it-IT", { minimumFractionDigits: 2 })}
              </span>
            )}
            <Badge variant="outline">{transactions.length} totali</Badge>
          </div>
        }
      >
        <div ref={ref}>
          {displayTransactions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>Nessuna transazione trovata.</p>
              <p className="text-sm mt-1">Le transazioni appariranno qui.</p>
            </div>
          ) : (
            <div>
              {displayTransactions.map((tx, index) => (
                <TransactionRow
                  key={`${tx.hash}-${index}`}
                  transaction={tx}
                  delay={index * 0.05}
                  currentPrice={prices[tx.asset.toUpperCase()]}
                />
              ))}
            </div>
          )}
        </div>
      </CollapsibleSection>
    );
  }
);

TransactionList.displayName = "TransactionList";
