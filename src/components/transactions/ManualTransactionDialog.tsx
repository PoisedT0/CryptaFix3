import { useState } from "react";
import { motion } from "framer-motion";
import { Plus, Calendar, Coins, TrendingUp, TrendingDown, Send, Gift, DollarSign } from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { saveTransaction, generateId, type Transaction } from "@/lib/storage";

const transactionSchema = z.object({
  type: z.enum(["buy", "sell", "transfer", "stake", "airdrop"], {
    required_error: "Seleziona il tipo di transazione",
  }),
  asset: z.string().trim().min(1, "Inserisci il simbolo dell'asset").max(10, "Simbolo troppo lungo").toUpperCase(),
  amount: z.number({ required_error: "Inserisci la quantità" }).positive("La quantità deve essere positiva"),
  valueEur: z.number({ required_error: "Inserisci il valore in EUR" }).min(0, "Il valore non può essere negativo"),
  date: z.date({ required_error: "Seleziona la data" }),
  fee: z.number().min(0).optional(),
});

type TransactionFormData = z.infer<typeof transactionSchema>;

interface ManualTransactionDialogProps {
  walletId?: string;
  onTransactionAdded?: (tx: Transaction) => void;
}

const typeConfig = {
  buy: { icon: TrendingUp, label: "Acquisto", color: "text-success", description: "Hai comprato crypto" },
  sell: { icon: TrendingDown, label: "Vendita", color: "text-destructive", description: "Hai venduto crypto" },
  transfer: { icon: Send, label: "Trasferimento", color: "text-primary", description: "Hai spostato crypto" },
  stake: { icon: Coins, label: "Staking", color: "text-warning", description: "Ricompensa staking" },
  airdrop: { icon: Gift, label: "Airdrop", color: "text-primary", description: "Crypto ricevute gratis" },
};

export const ManualTransactionDialog = ({ walletId, onTransactionAdded }: ManualTransactionDialogProps) => {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();

  const form = useForm<TransactionFormData>({
    resolver: zodResolver(transactionSchema),
    defaultValues: {
      type: "buy",
      asset: "",
      amount: undefined,
      valueEur: undefined,
      date: new Date(),
      fee: 0,
    },
  });

  const onSubmit = (data: TransactionFormData) => {
    const transaction: Omit<Transaction, "id"> = {
      walletId: walletId || "manual",
      hash: `manual-${generateId()}`,
      type: data.type,
      asset: data.asset.toUpperCase(),
      amount: data.amount,
      valueEur: data.valueEur,
      timestamp: data.date.getTime(),
      fee: data.fee || 0,
      feeEur: data.fee || 0,
    };

    const savedTx = saveTransaction(transaction);

    toast({
      title: "Transazione aggiunta",
      description: `${typeConfig[data.type].label} di ${data.amount} ${data.asset} salvata.`,
    });

    if (onTransactionAdded) {
      onTransactionAdded(savedTx);
    }

    form.reset();
    setOpen(false);
  };

  const selectedType = form.watch("type");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Plus className="w-4 h-4" />
          Aggiungi Transazione
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Coins className="w-5 h-5 text-primary" />
            Nuova Transazione Manuale
          </DialogTitle>
          <DialogDescription>
            Inserisci una transazione storica per completare il calcolo del cost basis.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Transaction Type */}
            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipo di transazione</FormLabel>
                  <div className="grid grid-cols-5 gap-2">
                    {(Object.keys(typeConfig) as Array<keyof typeof typeConfig>).map((type) => {
                      const config = typeConfig[type];
                      const Icon = config.icon;
                      const isSelected = field.value === type;
                      return (
                        <motion.button
                          key={type}
                          type="button"
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => field.onChange(type)}
                          className={cn(
                            "flex flex-col items-center gap-1 p-3 rounded-lg border transition-all",
                            isSelected
                              ? "border-primary bg-primary/10"
                              : "border-border hover:border-primary/50"
                          )}
                        >
                          <Icon className={cn("w-5 h-5", config.color)} />
                          <span className="text-xs font-medium">{config.label}</span>
                        </motion.button>
                      );
                    })}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {typeConfig[selectedType || "buy"].description}
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Asset and Amount */}
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="asset"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Asset (simbolo)</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="BTC, ETH, SOL..."
                        {...field}
                        onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Quantità</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="any"
                        placeholder="0.00"
                        {...field}
                        value={field.value ?? ""}
                        onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Value and Fee */}
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="valueEur"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      <span className="flex items-center gap-1">
                        <DollarSign className="w-3 h-3" />
                        Valore totale (EUR)
                      </span>
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="any"
                        placeholder="0.00"
                        {...field}
                        value={field.value ?? ""}
                        onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="fee"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Commissione (EUR)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="any"
                        placeholder="0.00"
                        {...field}
                        value={field.value ?? ""}
                        onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Date */}
            <FormField
              control={form.control}
              name="date"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Data transazione</FormLabel>
                  <Popover>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full justify-start text-left font-normal",
                            !field.value && "text-muted-foreground"
                          )}
                        >
                          <Calendar className="mr-2 h-4 w-4" />
                          {field.value ? (
                            format(field.value, "PPP", { locale: it })
                          ) : (
                            <span>Seleziona data</span>
                          )}
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <CalendarComponent
                        mode="single"
                        selected={field.value}
                        onSelect={field.onChange}
                        disabled={(date) => date > new Date()}
                        initialFocus
                        className={cn("p-3 pointer-events-auto")}
                      />
                    </PopoverContent>
                  </Popover>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Cost basis info */}
            {selectedType === "buy" && (
              <div className="p-3 rounded-lg bg-success/10 border border-success/20 text-sm">
                <p className="text-success font-medium">Acquisto = Cost Basis</p>
                <p className="text-muted-foreground text-xs mt-1">
                  Il valore inserito sarà usato come costo di acquisto per calcolare le plusvalenze future.
                </p>
              </div>
            )}

            {selectedType === "sell" && (
              <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-sm">
                <p className="text-destructive font-medium">Vendita = Evento tassabile</p>
                <p className="text-muted-foreground text-xs mt-1">
                  La plusvalenza sarà calcolata usando il metodo FIFO confrontando con i tuoi acquisti.
                </p>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Annulla
              </Button>
              <Button type="submit">
                Salva Transazione
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
