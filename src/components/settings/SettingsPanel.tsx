import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { 
  Trash2, 
  Shield, 
  Globe, 
  Calculator,
  AlertTriangle,
  Check,
  Lock,
  Key,
  Eye,
  EyeOff
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { getSettings, saveSettings, clearAllData, type AppSettings } from "@/lib/storage";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useVault } from "@/contexts/VaultContext";
import { applyBackup, createEncryptedBackup, restoreEncryptedBackup } from "@/lib/backup";
import { deleteProviderConfig, getStoredProviders, saveProviderConfig } from "@/lib/crypto-providers";

interface SettingsPanelProps {
  onDataCleared: () => void;
}

export const SettingsPanel = ({ onDataCleared }: SettingsPanelProps) => {
  const [settings, setSettings] = useState<AppSettings>(getSettings());
  const { toast } = useToast();
  const { lock, isConfigured, setupNewVault } = useVault();

  // Provider API keys (stored encrypted via provider configs)
  const storedProviders = getStoredProviders();
  const [etherscanKey, setEtherscanKey] = useState(
    storedProviders.find((p) => p.provider === 'etherscan' && !p.walletId)?.apiKey || ''
  );
  const [polygonscanKey, setPolygonscanKey] = useState(
    storedProviders.find((p) => p.provider === 'polygonscan' && !p.walletId)?.apiKey || ''
  );
  const [arbiscanKey, setArbiscanKey] = useState(
    storedProviders.find((p) => p.provider === 'arbiscan' && !p.walletId)?.apiKey || ''
  );
  const [lineascanKey, setLineascanKey] = useState(
    storedProviders.find((p) => p.provider === 'lineascan' && !p.walletId)?.apiKey || ''
  );
  const [bscscanKey, setBscscanKey] = useState(
    storedProviders.find((p) => p.provider === 'bscscan' && !p.walletId)?.apiKey || ''
  );

  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({
    etherscan: false,
    polygonscan: false,
    arbiscan: false,
    lineascan: false,
    bscscan: false,
  });
  const [savingProviders, setSavingProviders] = useState(false);

  const [exportOpen, setExportOpen] = useState(false);
  const [exportPass, setExportPass] = useState("");
  const [exportConfirm, setExportConfirm] = useState("");

  const [importOpen, setImportOpen] = useState(false);
  const [importPass, setImportPass] = useState("");
  const [importFileText, setImportFileText] = useState<string | null>(null);
  const importFileRef = useRef<HTMLInputElement | null>(null);

  const handleSettingChange = <K extends keyof AppSettings>(
    key: K,
    value: AppSettings[K]
  ) => {
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);
    saveSettings(newSettings);
    toast({
      title: "Impostazione salvata",
      description: "Le modifiche sono state applicate.",
    });
  };

  const handleClearData = () => {
    clearAllData();
    toast({
      title: "Dati eliminati",
      description: "Tutti i dati locali sono stati rimossi.",
      variant: "destructive",
    });
    onDataCleared();
  };

  const saveProviderKeys = async () => {
    setSavingProviders(true);
    try {
      const e = etherscanKey.trim();
      const p = polygonscanKey.trim();
      const a = arbiscanKey.trim();
      const l = lineascanKey.trim();
      const b = bscscanKey.trim();

      if (e) {
        saveProviderConfig({ provider: 'etherscan', apiKey: e });
      } else {
        deleteProviderConfig('etherscan');
      }

      if (p) {
        saveProviderConfig({ provider: 'polygonscan', apiKey: p });
      } else {
        deleteProviderConfig('polygonscan');
      }

      if (a) {
        saveProviderConfig({ provider: 'arbiscan', apiKey: a });
      } else {
        deleteProviderConfig('arbiscan');
      }

      if (l) {
        saveProviderConfig({ provider: 'lineascan', apiKey: l });
      } else {
        deleteProviderConfig('lineascan');
      }

      if (b) {
        saveProviderConfig({ provider: 'bscscan', apiKey: b });
      } else {
        deleteProviderConfig('bscscan');
      }

      toast({
        title: 'Provider salvati',
        description: 'Le API key sono state salvate in modo sicuro (cifratura locale).',
      });
    } catch (err) {
      toast({
        title: 'Salvataggio fallito',
        description: err instanceof Error ? err.message : 'Errore durante il salvataggio',
        variant: 'destructive',
      });
    } finally {
      setSavingProviders(false);
    }
  };

  const isValidApiKey = (key: string): boolean => {
    const v = key.trim();
    if (!v) return true; // optional keys allowed
    // Most "scan" keys are alphanumeric and 32+ chars.
    return v.length >= 32 && /^[A-Za-z0-9]+$/.test(v);
  };

  const KeyInput = (props: {
    id: string;
    label: string;
    placeholder: string;
    value: string;
    onChange: (v: string) => void;
    providerKey: keyof typeof showKeys;
    optional?: boolean;
  }) => {
    const valid = isValidApiKey(props.value);
    const show = showKeys[props.providerKey];
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor={props.id}>{props.label}{props.optional ? " (opzionale)" : ""}</Label>
          {props.value.trim() ? (
            <Badge variant={valid ? "secondary" : "destructive"} className="gap-1">
              {valid ? <Check className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
              {valid ? "OK" : "Formato"}
            </Badge>
          ) : null}
        </div>
        <div className="relative">
          <Input
            id={props.id}
            type={show ? "text" : "password"}
            value={props.value}
            onChange={(e) => props.onChange(e.target.value)}
            placeholder={props.placeholder}
            className="font-mono text-sm pr-10"
            autoComplete="off"
            spellCheck={false}
            inputMode="text"
          />
          <button
            type="button"
            aria-label={show ? "Nascondi" : "Mostra"}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            onClick={() => setShowKeys((s) => ({ ...s, [props.providerKey]: !s[props.providerKey] }))}
          >
            {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        {!valid && props.value.trim() ? (
          <p className="text-xs text-destructive">Inserisci una key valida (tipicamente 32+ caratteri alfanumerici).</p>
        ) : null}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Tax Settings */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <Card variant="gradient">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calculator className="w-5 h-5 text-primary" />
              Impostazioni Fiscali
            </CardTitle>
            <CardDescription>
              Configura le impostazioni per il calcolo delle imposte
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 py-3 border-b border-border/50">
              <div>
                <p className="font-medium">Paese di Residenza</p>
                <p className="text-sm text-muted-foreground">Per il calcolo delle aliquote fiscali</p>
              </div>
              <Select
                value={settings.country}
                onValueChange={(v) => handleSettingChange("country", v)}
              >
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="IT">🇮🇹 Italia</SelectItem>
                  <SelectItem value="DE">🇩🇪 Germania</SelectItem>
                  <SelectItem value="FR">🇫🇷 Francia</SelectItem>
                  <SelectItem value="ES">🇪🇸 Spagna</SelectItem>
                  <SelectItem value="AT">🇦🇹 Austria</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 py-3 border-b border-border/50">
              <div>
                <p className="font-medium">Metodo di Calcolo</p>
                <p className="text-sm text-muted-foreground">Per determinare il costo base</p>
              </div>
              <Select
                value={settings.taxMethod}
                onValueChange={(v) => handleSettingChange("taxMethod", v as "FIFO" | "LIFO" | "HIFO")}
              >
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="FIFO">FIFO (Consigliato)</SelectItem>
                  <SelectItem value="LIFO">LIFO</SelectItem>
                  <SelectItem value="HIFO">HIFO</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 py-3">
              <div>
                <p className="font-medium">Valuta di Riferimento</p>
                <p className="text-sm text-muted-foreground">Per i calcoli e report</p>
              </div>
              <Select
                value={settings.currency}
                onValueChange={(v) => handleSettingChange("currency", v as "EUR" | "USD")}
              >
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="EUR">€ EUR</SelectItem>
                  <SelectItem value="USD">$ USD</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Providers API */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
      >
        <Card variant="gradient">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Key className="w-5 h-5 text-primary" />
              Providers API
            </CardTitle>
            <CardDescription>
              Inserisci le tue API key read-only per sincronizzare transazioni e holdings.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <KeyInput
              id="etherscanKey"
              label="Etherscan API Key"
              placeholder="Inserisci key gratuita da etherscan.io"
              value={etherscanKey}
              onChange={setEtherscanKey}
              providerKey="etherscan"
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <KeyInput
                id="polygonscanKey"
                label="Polygonscan API Key"
                placeholder="Key gratuita da polygonscan.com"
                value={polygonscanKey}
                onChange={setPolygonscanKey}
                providerKey="polygonscan"
                optional
              />
              <KeyInput
                id="arbiscanKey"
                label="Arbiscan API Key"
                placeholder="Key gratuita da arbiscan.io"
                value={arbiscanKey}
                onChange={setArbiscanKey}
                providerKey="arbiscan"
                optional
              />
              <KeyInput
                id="lineascanKey"
                label="Lineascan API Key"
                placeholder="Key gratuita da lineascan.build"
                value={lineascanKey}
                onChange={setLineascanKey}
                providerKey="lineascan"
                optional
              />
              <KeyInput
                id="bscscanKey"
                label="BscScan API Key"
                placeholder="Key gratuita da bscscan.com"
                value={bscscanKey}
                onChange={setBscscanKey}
                providerKey="bscscan"
                optional
              />
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                variant="gradient"
                disabled={savingProviders}
                onClick={saveProviderKeys}
              >
                Salva
              </Button>

              <Button
                variant="outline"
                onClick={() => {
                  // Re-load from storage
                  const providers = getStoredProviders();
                  setEtherscanKey(providers.find((p) => p.provider === 'etherscan' && !p.walletId)?.apiKey || '');
                  setPolygonscanKey(providers.find((p) => p.provider === 'polygonscan' && !p.walletId)?.apiKey || '');
                  setArbiscanKey(providers.find((p) => p.provider === 'arbiscan' && !p.walletId)?.apiKey || '');
                  setLineascanKey(providers.find((p) => p.provider === 'lineascan' && !p.walletId)?.apiKey || '');
                  setBscscanKey(providers.find((p) => p.provider === 'bscscan' && !p.walletId)?.apiKey || '');
                  toast({ title: 'Aggiornato', description: 'Valori ricaricati dallo storage.' });
                }}
              >
                Ricarica
              </Button>
            </div>

            <p className="text-xs text-muted-foreground">
              Le chiavi vengono salvate solo localmente e cifrate con il Vault. Non vengono mai inviate a server esterni.
            </p>
          </CardContent>
        </Card>
      </motion.div>

      {/* Privacy & Security */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <Card variant="gradient">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-primary" />
              Privacy & Sicurezza
            </CardTitle>
            <CardDescription>
              Informazioni sulla gestione dei tuoi dati
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start gap-3 p-4 rounded-xl bg-success/10 border border-success/20">
              <Check className="w-5 h-5 text-success flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-success">Storage Locale</p>
                <p className="text-sm text-muted-foreground">
                  Tutti i dati sono salvati solo sul tuo dispositivo. Nessuna informazione viene 
                  trasmessa a server esterni.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-4 rounded-xl bg-success/10 border border-success/20">
              <Check className="w-5 h-5 text-success flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-success">Nessun Tracking</p>
                <p className="text-sm text-muted-foreground">
                  Non utilizziamo cookies di tracciamento, analytics, o strumenti di profilazione.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-4 rounded-xl bg-success/10 border border-success/20">
              <Check className="w-5 h-5 text-success flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-success">Read-Only API</p>
                <p className="text-sm text-muted-foreground">
                  Accediamo solo a dati pubblici blockchain. Non chiediamo mai chiavi private.
                </p>
              </div>
            </div>

            {/* Auto-lock + Backup */}
            <div className="p-4 rounded-xl bg-muted/30 border border-border/40 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <p className="font-medium">Blocco automatico</p>
                  <p className="text-sm text-muted-foreground">Blocca l'app dopo inattività per proteggere i dati</p>
                </div>
                <div className="flex items-center gap-3">
                  <Switch
                    checked={settings.autoLockEnabled !== false}
                    onCheckedChange={(v) => handleSettingChange("autoLockEnabled", v)}
                  />
                  <Select
                    value={String(settings.autoLockMinutes ?? 15)}
                    onValueChange={(v) => handleSettingChange("autoLockMinutes", Number(v))}
                    disabled={settings.autoLockEnabled === false}
                  >
                    <SelectTrigger className="w-36">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="5">5 min</SelectItem>
                      <SelectItem value="10">10 min</SelectItem>
                      <SelectItem value="15">15 min</SelectItem>
                      <SelectItem value="30">30 min</SelectItem>
                      <SelectItem value="60">60 min</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button variant="outline" className="gap-2" onClick={() => {
                    lock();
                    toast({ title: "App bloccata", description: "Inserisci la passphrase per sbloccare." });
                  }}>
                    <Lock className="w-4 h-4" />
                    Blocca adesso
                  </Button>
                </div>
              </div>

              <div className="flex flex-col md:flex-row gap-3">
                <Dialog open={exportOpen} onOpenChange={setExportOpen}>
                  <DialogTrigger asChild>
                    <Button variant="secondary" className="flex-1">Esporta backup cifrato</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Esporta backup cifrato</DialogTitle>
                      <DialogDescription>
                        Il backup verrà cifrato con una passphrase. Conservala con cura: senza non potrai ripristinare.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3">
                      <div className="space-y-1">
                        <p className="text-sm font-medium">Passphrase</p>
                        <Input type="password" value={exportPass} onChange={(e) => setExportPass(e.target.value)} placeholder="Minimo 8 caratteri" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm font-medium">Conferma passphrase</p>
                        <Input type="password" value={exportConfirm} onChange={(e) => setExportConfirm(e.target.value)} placeholder="Ripeti la passphrase" />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button
                        onClick={async () => {
                          try {
                            if (exportPass.length < 8) throw new Error("Passphrase troppo corta");
                            if (exportPass !== exportConfirm) throw new Error("Le passphrase non coincidono");
                            const json = await createEncryptedBackup(exportPass);
                            const blob = new Blob([json], { type: "application/json" });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement("a");
                            a.href = url;
                            const date = new Date().toISOString().slice(0, 10);
                            a.download = `crypta-backup-${date}.json`;
                            a.click();
                            URL.revokeObjectURL(url);
                            setExportOpen(false);
                            setExportPass("");
                            setExportConfirm("");
                            toast({ title: "Backup esportato", description: "File scaricato con successo." });
                          } catch (err) {
                            toast({
                              title: "Export fallito",
                              description: err instanceof Error ? err.message : "Errore durante l'export",
                              variant: "destructive",
                            });
                          }
                        }}
                      >
                        Esporta
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>

                <Dialog open={importOpen} onOpenChange={setImportOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" className="flex-1">Importa backup</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Importa backup</DialogTitle>
                      <DialogDescription>
                        Seleziona un file di backup cifrato ed inserisci la passphrase. Questo sovrascriverà i dati locali.
                      </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-3">
                      <input
                        ref={importFileRef}
                        type="file"
                        accept="application/json,.json"
                        className="hidden"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          const text = await file.text();
                          setImportFileText(text);
                        }}
                      />

                      <Button
                        variant="secondary"
                        onClick={() => importFileRef.current?.click()}
                      >
                        Seleziona file
                      </Button>

                      <div className="space-y-1">
                        <p className="text-sm font-medium">Passphrase</p>
                        <Input type="password" value={importPass} onChange={(e) => setImportPass(e.target.value)} placeholder="Passphrase del backup" />
                      </div>

                      <p className="text-xs text-muted-foreground">
                        File: {importFileText ? "caricato" : "non selezionato"}
                      </p>
                    </div>

                    <DialogFooter>
                      <Button
                        variant="destructive"
                        onClick={async () => {
                          try {
                            if (!importFileText) throw new Error("Seleziona un file di backup");
                            if (importPass.length < 8) throw new Error("Passphrase troppo corta");

                            // If vault isn't configured on this device, initialize it using the provided passphrase.
                            if (!isConfigured) {
                              const ok = await setupNewVault(importPass);
                              if (!ok) throw new Error("Impossibile inizializzare il vault");
                            }

                            const data = await restoreEncryptedBackup(importFileText, importPass);
                            await applyBackup(data);
                            toast({ title: "Backup importato", description: "Dati ripristinati con successo." });
                            setImportOpen(false);
                            setImportPass("");
                            setImportFileText(null);
                            onDataCleared();
                          } catch (err) {
                            toast({
                              title: "Import fallito",
                              description: err instanceof Error ? err.message : "Errore durante l'import",
                              variant: "destructive",
                            });
                          }
                        }}
                      >
                        Importa e sovrascrivi
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Danger Zone */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <Card variant="gradient" className="border-destructive/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              Zona Pericolosa
            </CardTitle>
            <CardDescription>
              Azioni irreversibili
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-destructive/10 border border-destructive/20">
              <div>
                <p className="font-medium">Elimina Tutti i Dati</p>
                <p className="text-sm text-muted-foreground">
                  Rimuove wallet, transazioni e impostazioni. Azione irreversibile.
                </p>
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" className="gap-2">
                    <Trash2 className="w-4 h-4" />
                    Elimina
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Sei sicuro?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Questa azione eliminerà permanentemente tutti i tuoi wallet, transazioni, 
                      calcoli fiscali e impostazioni. Non sarà possibile recuperare i dati.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Annulla</AlertDialogCancel>
                    <AlertDialogAction onClick={handleClearData} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                      Elimina Tutto
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* API Provider Information */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <Card variant="gradient">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="w-5 h-5 text-primary" />
              Provider API Supportati
            </CardTitle>
            <CardDescription>
              CRYPTA supporta multiple API read-only per dati pubblici blockchain
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 rounded-lg bg-muted/50">
                <h4 className="font-semibold mb-1">Etherscan</h4>
                <p className="text-xs text-muted-foreground">Ottimo per transazioni dettagliate. Supporta Ethereum, Polygon, Arbitrum.</p>
              </div>
              <div className="p-4 rounded-lg bg-muted/50">
                <h4 className="font-semibold mb-1">Infura</h4>
                <p className="text-xs text-muted-foreground">Stabile per multi-chain. Gratuito su infura.io. Consigliato.</p>
              </div>
              <div className="p-4 rounded-lg bg-muted/50">
                <h4 className="font-semibold mb-1">Alchemy</h4>
                <p className="text-xs text-muted-foreground">Veloce e affidabile per grandi volumi di richieste.</p>
              </div>
            </div>
            <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
              <p className="text-sm text-primary flex items-center gap-2">
                <Lock className="w-4 h-4" />
                Tutti i provider sono read-only: possono solo leggere dati pubblici, mai muovere fondi.
              </p>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* App Info */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
      >
        <Card variant="gradient">
          <CardContent className="p-6">
            <div className="text-center">
              <div className="w-16 h-16 mx-auto rounded-2xl gradient-primary flex items-center justify-center mb-4">
                <Shield className="w-8 h-8 text-primary-foreground" />
              </div>
              <h3 className="font-bold font-display text-lg">CRYPTA</h3>
              <p className="text-sm text-muted-foreground mt-1">Versione 1.0.0</p>
              <div className="flex justify-center gap-2 mt-3">
                <Badge variant="outline">MiCA Compliant</Badge>
                <Badge variant="outline">DAC8 Ready</Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-4">
                © 2024 CRYPTA • Open Source • Privacy First
              </p>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
};
