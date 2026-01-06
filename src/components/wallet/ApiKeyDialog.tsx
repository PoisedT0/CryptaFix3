import { useState, useEffect } from "react";
import { Key, Eye, EyeOff, Loader2, Check, AlertTriangle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import {
  type Provider,
  PROVIDER_LABELS,
  PROVIDER_KEY_LABELS,
  saveProviderConfig,
  getStoredProviders,
} from "@/lib/crypto-providers";

interface ApiKeyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  provider: Provider;
  walletId?: string;
  onKeySubmit: (apiKey: string) => void;
  onSkip?: () => void;
}

export const ApiKeyDialog = ({
  open,
  onOpenChange,
  provider,
  walletId,
  onKeySubmit,
  onSkip,
}: ApiKeyDialogProps) => {
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [saveKey, setSaveKey] = useState(false);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  // Check if we have a stored key
  useEffect(() => {
    if (open) {
      const configs = getStoredProviders();
      const existingConfig = configs.find(
        (c) => c.provider === provider && c.walletId === walletId
      );
      if (existingConfig?.apiKey) {
        setApiKey(existingConfig.apiKey);
        setSaveKey(true);
      } else {
        setApiKey("");
        setSaveKey(false);
      }
    }
  }, [open, provider, walletId]);

  const handleSubmit = async () => {
    if (!apiKey.trim()) {
      toast({
        title: "API Key richiesta",
        description: `Inserisci la ${PROVIDER_KEY_LABELS[provider]} per continuare.`,
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      // Save encrypted if user wants to
      if (saveKey) {
        saveProviderConfig({
          provider,
          apiKey: apiKey.trim(),
          walletId,
        });
        toast({
          title: "API Key salvata",
          description: "La chiave è stata salvata in modo sicuro (crittografata AES-256).",
        });
      }

      onKeySubmit(apiKey.trim());
      onOpenChange(false);
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = () => {
    onSkip?.();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Key className="w-5 h-5 text-primary" />
            {PROVIDER_KEY_LABELS[provider]}
          </DialogTitle>
          <DialogDescription>
            Inserisci la tua API key per {PROVIDER_LABELS[provider]}. La chiave
            è necessaria per sincronizzare i dati del wallet.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <Alert variant="default" className="bg-muted/50">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="text-xs">
              La chiave API sarà crittografata localmente con AES-256. Non verrà
              mai inviata a server esterni.
            </AlertDescription>
          </Alert>

          <div className="space-y-2">
            <Label htmlFor="apiKey">{PROVIDER_KEY_LABELS[provider]}</Label>
            <div className="relative">
              <Input
                id="apiKey"
                type={showKey ? "text" : "password"}
                placeholder={
                  provider === "infura" ? "Infura Project ID" : "API Key"
                }
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="font-mono text-sm pr-10"
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setShowKey(!showKey)}
              >
                {showKey ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="saveKey"
              checked={saveKey}
              onChange={(e) => setSaveKey(e.target.checked)}
              className="rounded border-border"
            />
            <Label htmlFor="saveKey" className="text-sm font-normal cursor-pointer">
              Salva chiave per sync futuri (crittografata)
            </Label>
          </div>

          <div className="text-xs text-muted-foreground">
            {provider === "infura" && (
              <p>
                Ottieni una API key gratuita su{" "}
                <a
                  href="https://infura.io"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  infura.io
                </a>
              </p>
            )}
            {provider === "etherscan" && (
              <p>
                Ottieni una API key gratuita su{" "}
                <a
                  href="https://etherscan.io/apis"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  etherscan.io
                </a>
              </p>
            )}
            {provider === "alchemy" && (
              <p>
                Ottieni una API key gratuita su{" "}
                <a
                  href="https://www.alchemy.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  alchemy.com
                </a>
              </p>
            )}
          </div>
        </div>

        <div className="flex gap-3">
          {onSkip && (
            <Button variant="outline" onClick={handleSkip} className="flex-1">
              Salta
            </Button>
          )}
          <Button
            variant="gradient"
            onClick={handleSubmit}
            disabled={loading || !apiKey.trim()}
            className="flex-1"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Check className="w-4 h-4 mr-2" />
            )}
            Conferma
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
