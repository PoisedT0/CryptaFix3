// src/lib/etherscan-sync.ts
import { toast } from "@/hooks/use-toast";

const CHAIN_CONFIG: Record<string, { baseUrl: string; native: string }> = {
  ethereum: { baseUrl: "https://api.etherscan.io/api", native: "ETH" },
  polygon: { baseUrl: "https://api.polygonscan.com/api", native: "MATIC" },
  arbitrum: { baseUrl: "https://api.arbiscan.io/api", native: "ETH" },
};

export async function syncWallet(address: string, chain: string = "ethereum" ) {
  const apiKey = localStorage.getItem("etherscanApiKey") || "";
  if (!apiKey) throw new Error("Missing API key");

  const config = CHAIN_CONFIG[chain];
  if (!config) throw new Error("Chain non supportata");

  try {
    const params = new URLSearchParams({
      address,
      apikey: apiKey,
      sort: "desc",
      page: "1",
      offset: "1000",
    });

    const balanceRes = await fetch(`${config.baseUrl}?module=account&action=balance&${params}&tag=latest`);
    const balanceData = await balanceRes.json();
    const nativeBalance = balanceData.status === "1" 
      ? Number(BigInt(balanceData.result)) / 1e18
      : 0;

    const tokenRes = await fetch(`${config.baseUrl}?module=account&action=tokentx&${params}`);
    const tokenData = await tokenRes.json();

    const holdings: Record<string, number> = { [config.native]: nativeBalance };

    if (tokenData.status === "1" && Array.isArray(tokenData.result)) {
      tokenData.result.forEach((tx: any) => {
        const symbol = (tx.tokenSymbol || "UNKNOWN").toUpperCase();
        const decimals = parseInt(tx.tokenDecimal || "18");
        const amount = Number(BigInt(tx.value)) / Math.pow(10, decimals);
        
        const isIncoming = tx.to.toLowerCase() === address.toLowerCase();
        const isOutgoing = tx.from.toLowerCase() === address.toLowerCase();

        if (isIncoming) holdings[symbol] = (holdings[symbol] || 0) + amount;
        if (isOutgoing) holdings[symbol] = (holdings[symbol] || 0) - amount;
      });
    }

    Object.keys(holdings).forEach(key => {
      if (!Number.isFinite(holdings[key]) || holdings[key] < 1e-10) {
        delete holdings[key];
      }
    });

    toast({ title: "Sync completato", description: `Trovati ${Object.keys(holdings).length} asset` });
    return { holdings, nativeBalance };
  } catch (error) {
    console.error("Sync error:", error);
    toast({ variant: "destructive", title: "Errore sync", description: "Verifica key" });
    throw error;
  }
}
