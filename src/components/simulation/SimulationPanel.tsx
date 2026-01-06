import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Calculator,
  Plus,
  Sparkles,
  Trash2,
  TrendingDown,
  TrendingUp,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { useCryptoApi, type CryptoPrice } from "@/hooks/useCryptoApi";
import { getItalianCryptoTaxRules, getItalianCryptoTaxableAmount } from "@/lib/tax-rules";

// Available assets for simulation (fetched with real prices)
const SIMULATION_ASSETS = ["ETH", "BTC", "SOL", "MATIC", "LINK", "UNI", "USDC"] as const;

interface SimulationScenario {
  id: string;
  name: string;
  asset: string;
  action: "buy" | "sell";
  amount: number;
  priceChange: number; // percentuale
  holdingPeriod: number; // mesi (informativo)
  year: number;
  payTaxIn: "EUR" | "BTC" | "ETH" | "SOL";
}

type ScenarioResult = {
  currentValue: number;
  futureValue: number;
  gain: number;
  taxableAmount: number;
  taxEur: number;
  taxInAsset: number | null;
  isProfit: boolean;
};

const TAX_PAYMENT_ASSETS: Array<SimulationScenario["payTaxIn"]> = ["EUR", "BTC", "ETH", "SOL"];

export const SimulationPanel = () => {
  const { fetchPrices } = useCryptoApi();

  const currentYear = new Date().getFullYear();

  const [scenarios, setScenarios] = useState<SimulationScenario[]>([]);
  const [asset, setAsset] = useState("ETH");
  const [action, setAction] = useState<"buy" | "sell">("sell");
  const [amount, setAmount] = useState("");
  const [priceChange, setPriceChange] = useState("0");
  const [holdingPeriod, setHoldingPeriod] = useState("12");
  const [year, setYear] = useState<number>(currentYear);
  const [payTaxIn, setPayTaxIn] = useState<SimulationScenario["payTaxIn"]>("EUR");

  const [assetPrices, setAssetPrices] = useState<Record<string, CryptoPrice>>({});
  const [loadingPrices, setLoadingPrices] = useState(true);

  // Fetch real prices for simulation assets
  useEffect(() => {
    setLoadingPrices(true);
    fetchPrices([...SIMULATION_ASSETS]).then((data) => {
      if (data) {
        setAssetPrices(data);
      }
      setLoadingPrices(false);
    });
  }, [fetchPrices]);

  const taxRules = useMemo(() => getItalianCryptoTaxRules(year), [year]);

  const addScenario = () => {
    if (!amount || Number(amount) <= 0) return;

    const newScenario: SimulationScenario = {
      id: crypto.randomUUID(),
      name: `${action === "buy" ? "Acquisto" : "Vendita"} ${amount} ${asset}`,
      asset,
      action,
      amount: Number(amount),
      priceChange: Number(priceChange),
      holdingPeriod: Number.parseInt(holdingPeriod, 10),
      year,
      payTaxIn,
    };

    setScenarios((prev) => [...prev, newScenario]);
    setAmount("");
    setPriceChange("0");
  };

  const removeScenario = (id: string) => {
    setScenarios((prev) => prev.filter((s) => s.id !== id));
  };

  const calculateScenarioResult = (scenario: SimulationScenario): ScenarioResult => {
    const priceData = assetPrices[scenario.asset];
    const currentPrice = priceData?.price || 0;
    const futurePrice = currentPrice * (1 + scenario.priceChange / 100);
    const currentValue = scenario.amount * currentPrice;
    const futureValue = scenario.amount * futurePrice;
    const gain = futureValue - currentValue;

    // For buys, no immediate tax event
    if (scenario.action !== "sell") {
      return {
        currentValue,
        futureValue,
        gain,
        taxableAmount: 0,
        taxEur: 0,
        taxInAsset: null,
        isProfit: gain > 0,
      };
    }

    const taxableAmount = getItalianCryptoTaxableAmount(gain, scenario.year);
    const taxEur = taxableAmount * getItalianCryptoTaxRules(scenario.year).taxRate;

    // Calculate tax in alternative asset if selected
    const settlementPrice =
      scenario.payTaxIn === "EUR" ? null : assetPrices[scenario.payTaxIn]?.price || null;

    const taxInAsset = settlementPrice ? taxEur / settlementPrice : null;

    return {
      currentValue,
      futureValue,
      gain,
      taxableAmount,
      taxEur,
      taxInAsset,
      isProfit: gain > 0,
    };
  };

  const totals = scenarios.reduce(
    (acc, scenario) => {
      const r = calculateScenarioResult(scenario);
      return {
        gain: acc.gain + r.gain,
        taxEur: acc.taxEur + r.taxEur,
        net: acc.net + (r.gain - r.taxEur),
      };
    },
    { gain: 0, taxEur: 0, net: 0 }
  );

  return (
    <div className="space-y-6">
      <Card variant="gradient">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            Simulazione chiara e trasparente
          </CardTitle>
          <CardDescription>
            Imposta i dettagli e vedi subito: valore futuro, plus/minus e imposte stimate ({taxRules.taxRateLabel}).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
            <div className="space-y-2">
              <Label>Anno fiscale</Label>
              <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[currentYear, currentYear - 1, currentYear - 2].map((y) => (
                    <SelectItem key={y} value={String(y)}>
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Asset {loadingPrices && <Loader2 className="w-3 h-3 inline animate-spin ml-1" />}</Label>
              <Select value={asset} onValueChange={setAsset}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SIMULATION_ASSETS.map((symbol) => (
                    <SelectItem key={symbol} value={symbol}>
                      {symbol} {assetPrices[symbol] ? `(€${assetPrices[symbol].price.toLocaleString("it-IT", { minimumFractionDigits: 2 })})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Azione</Label>
              <Select value={action} onValueChange={(v) => setAction(v as "buy" | "sell")}> 
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sell">Vendita</SelectItem>
                  <SelectItem value="buy">Acquisto</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Quantità</Label>
              <Input type="number" placeholder="Es: 1.5" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label>Variazione prezzo %</Label>
              <Input type="number" placeholder="Es: 20" value={priceChange} onChange={(e) => setPriceChange(e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label>Periodo (mesi)</Label>
              <Input type="number" placeholder="12" value={holdingPeriod} onChange={(e) => setHoldingPeriod(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Pagare le tasse in</Label>
              <Select value={payTaxIn} onValueChange={(v) => setPayTaxIn(v as SimulationScenario["payTaxIn"])}> 
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TAX_PAYMENT_ASSETS.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Convertiamo l’imposta stimata in crypto usando il prezzo corrente (stima).
              </p>
            </div>

            <div className="md:col-span-2 rounded-xl bg-secondary/30 border border-border/50 p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Regola fiscale selezionata</p>
                  <p className="font-semibold">{taxRules.summary}</p>
                </div>
                <Badge variant="outline">Aliquota {taxRules.taxRateLabel}</Badge>
              </div>
              {taxRules.hasExemptionThreshold && typeof taxRules.exemptionThresholdEur === "number" && (
                <p className="text-xs text-muted-foreground mt-2">
                  Soglia applicata solo fino al 2024: €{taxRules.exemptionThresholdEur.toLocaleString("it-IT")}.
                </p>
              )}
            </div>
          </div>

          <Button onClick={addScenario} variant="gradient" className="w-full md:w-auto">
            <Plus className="w-4 h-4 mr-2" />
            Aggiungi scenario
          </Button>
        </CardContent>
      </Card>

      {scenarios.length > 0 ? (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold font-display">Scenari</h3>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {scenarios.map((scenario, index) => {
              const r = calculateScenarioResult(scenario);

              return (
                <motion.div key={scenario.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.06 }}>
                  <Card className="group">
                    <CardContent className="p-4 space-y-4">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center text-sm font-bold">
                            {scenario.asset.slice(0, 2)}
                          </div>
                          <div>
                            <p className="font-semibold">{scenario.name}</p>
                            <div className="flex items-center gap-2">
                              <Badge variant={scenario.action === "sell" ? "destructive" : "success"}>
                                {scenario.action === "sell" ? "Vendita" : "Acquisto"}
                              </Badge>
                              <span className="text-xs text-muted-foreground">Anno {scenario.year}</span>
                              <span className="text-xs text-muted-foreground">• {scenario.holdingPeriod} mesi</span>
                            </div>
                          </div>
                        </div>
                        <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => removeScenario(scenario.id)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>

                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <p className="text-muted-foreground">Valore attuale</p>
                          <p className="font-semibold">€{r.currentValue.toLocaleString("it-IT", { minimumFractionDigits: 2 })}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Valore futuro</p>
                          <p className="font-semibold">€{r.futureValue.toLocaleString("it-IT", { minimumFractionDigits: 2 })}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Risultato</p>
                          <p className={`font-semibold flex items-center gap-1 ${r.isProfit ? "text-success" : "text-destructive"}`}>
                            {r.isProfit ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                            €{Math.abs(r.gain).toLocaleString("it-IT", { minimumFractionDigits: 2 })}
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Imposta stimata</p>
                          {scenario.action === "sell" ? (
                            <div className="space-y-1">
                              <p className="font-semibold text-warning">€{r.taxEur.toLocaleString("it-IT", { minimumFractionDigits: 2 })}</p>
                              {scenario.payTaxIn !== "EUR" && (
                                <p className="text-xs text-muted-foreground">
                                  {r.taxInAsset === null ? (
                                    "Prezzo non disponibile"
                                  ) : (
                                    <span className="flex items-center gap-1">
                                      <ArrowRight className="w-3 h-3" />
                                      {r.taxInAsset.toFixed(6)} {scenario.payTaxIn}
                                    </span>
                                  )}
                                </p>
                              )}
                            </div>
                          ) : (
                            <p className="font-semibold text-muted-foreground">—</p>
                          )}
                        </div>
                      </div>

                      {scenario.action === "sell" && r.taxableAmount > 0 && (
                        <p className="text-xs text-muted-foreground">
                          Base imponibile: €{r.taxableAmount.toLocaleString("it-IT", { minimumFractionDigits: 2 })} • Aliquota {getItalianCryptoTaxRules(scenario.year).taxRateLabel}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </div>

          <Card variant="gradient" className="border-primary/30">
            <CardContent className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <Calculator className="w-5 h-5 text-primary" />
                <h3 className="text-lg font-semibold font-display">Riepilogo</h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <p className="text-sm text-muted-foreground">Plus/Minus totale</p>
                  <p className={`text-2xl font-bold font-display ${totals.gain >= 0 ? "text-success" : "text-destructive"}`}>
                    {totals.gain >= 0 ? "+" : "-"}€{Math.abs(totals.gain).toLocaleString("it-IT", { minimumFractionDigits: 2 })}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Imposte stimate</p>
                  <p className="text-2xl font-bold font-display text-warning">
                    €{totals.taxEur.toLocaleString("it-IT", { minimumFractionDigits: 2 })}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Risultato netto</p>
                  <p className={`text-2xl font-bold font-display ${totals.net >= 0 ? "text-success" : "text-destructive"}`}>
                    {totals.net >= 0 ? "+" : "-"}€{Math.abs(totals.net).toLocaleString("it-IT", { minimumFractionDigits: 2 })}
                  </p>
                </div>
              </div>

              <p className="text-xs text-muted-foreground mt-4">
                * Stima indicativa: usa prezzi correnti e non tiene conto di costo storico, commissioni reali e regole specifiche per ogni caso.
              </p>
            </CardContent>
          </Card>
        </div>
      ) : (
        <Card className="border-dashed">
          <CardContent className="p-8 text-center">
            <Sparkles className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <p className="text-muted-foreground">
              Aggiungi uno scenario per vedere subito imposte e risultato netto in modo leggibile.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
