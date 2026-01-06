// src/pages/Wallets.tsx (o il file che mostra la lista wallet)
import { useEffect } from "react";
import { useWalletSyncQueue } from "@/hooks/useWalletSyncQueue";
import { SyncAllButton } from "@/components/SyncAllButton"; // il tuo bottone
import { syncWallet } from "@/lib/etherscan-sync"; // la tua nuova logica

// Supponi di avere uno state o storage per wallets
import { getWallets } from "@/lib/storage"; // o dove salvi wallets

export function WalletsPage() {
  const wallets = getWallets(); // recupera wallets salvati
  const { registerSyncFunction, state, startQueue, abortQueue, retryFailed, getProgress, getStatusText } = useWalletSyncQueue();

  // REGISTRA LA NUOVA SYNC FUNCTION QUI
  useEffect(() => {
    registerSyncFunction(async (walletId: string) => {
      const wallet = wallets.find((w: any) => w.id === walletId);
      if (!wallet) throw new Error("Wallet non trovato");

      // Usa la tua nuova logica client-side
      const result = await syncWallet(wallet.address, wallet.chain);

      // Salva holdings in localStorage (o context globale)
      const allHoldings = JSON.parse(localStorage.getItem("holdings") || "{}");
      allHoldings[walletId] = result.holdings;
      localStorage.setItem("holdings", JSON.stringify(allHoldings));

      // Opzionale: Aggiorna totale valore con CoinGecko
      // ... chiama getPrices e calcola €

      console.log("Sync completato per", wallet.label, result.holdings); // Debug
    });
  }, [registerSyncFunction, wallets]);

  return (
    <div>
      <h1>I Miei Wallet</h1>
      {/* Lista wallet + bottone aggiungi */}
      <SyncAllButton 
        state={state}
        onSync={() => startQueue(wallets.map(w => ({ id: w.id, label: w.label })))}
        onAbort={abortQueue}
        onRetryFailed={retryFailed}
        progress={getProgress()}
        statusText={getStatusText()}
      />
      {/* Lista wallet cards */}
    </div>
  );
}
