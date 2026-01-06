import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Calendar, Coins, TrendingUp, TrendingDown, Send, Gift, DollarSign } from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { cn } from "@/lib/utils";
import { type Transaction } from "@/lib/storage";

const transactionSchema = z.object({
  type: z.enum(["buy", "sell", "transfer", "stake", "airdrop"]),
  asset: z.string().trim().min(1, "Inserisci il simbolo dell'asset").max(10, "Simbolo troppo lungo").toUpperCase(),
  amount: z.number({ required_error: "Inserisci la quantità" }).positive("La quantità deve essere positiva"),
  valueEur: z.number({ required_error: "Inserisci il valore in EUR" }).min(0, "Il valore non può essere negativo"),
  date: z.date({ required_error: "Seleziona la data" }),
  fee: z.number().min(0).optional(),
});

type TransactionFormData = z.infer<typeof transactionSchema>;

interface EditTransactionDialogProps {
  transaction: Transaction;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (tx: Transaction) => void;
}

const typeConfig = {
  buy: { icon: TrendingUp, label: "Acquisto", color: "text-success" },
  sell: { icon: TrendingDown, label: "Vendita", color: "text-destructive" },
  transfer: { icon: Send, label: "Trasferimento", color: "text-primary" },
  stake: { icon: Coins, label: "Staking", color: "text-warning" },
  airdrop: { icon: Gift, label: "Airdrop", color: "text-primary" },
};

export const EditTransactionDialog = ({ transaction, open, onOpenChange, onSave }: EditTransactionDialogProps) => {
  const form = useForm<TransactionFormData>({
    resolver: zodResolver(transactionSchema),
    defaultValues: {
      type: transaction.type,
      asset: transaction.asset,
      amount: transaction.amount,
      valueEur: transaction.valueEur,
      date: new Date(transaction.timestamp),
      fee: transaction.fee || 0,
    },
  });

  useEffect(() => {
    form.reset({
      type: transaction.type,
      asset: transaction.asset,
      amount: transaction.amount,
      valueEur: transaction.valueEur,
      date: new Date(transaction.timestamp),
      fee: transaction.fee || 0,
    });
  }, [transaction, form]);

  const onSubmit = (data: TransactionFormData) => {
    const updatedTx: Transaction = {
      ...transaction,
      type: data.type,
      asset: data.asset.toUpperCase(),
      amount: data.amount,
      valueEur: data.valueEur,
      timestamp: data.date.getTime(),
      fee: data.fee || 0,
      feeEur: data.fee || 0,
    };

    onSave(updatedTx);
  };

  const selectedType = form.watch("type");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Coins className="w-5 h-5 text-primary" />
            Modifica Transazione
          </DialogTitle>
          <DialogDescription>
            Modifica i dettagli della transazione manuale.
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

            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Annulla
              </Button>
              <Button type="submit">
                Salva Modifiche
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
