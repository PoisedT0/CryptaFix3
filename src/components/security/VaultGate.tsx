import { useMemo, useState } from 'react';
import { useVault } from '@/contexts/VaultContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, LockKeyhole } from 'lucide-react';

type Mode = 'unlock' | 'setup';

export function VaultGate({ children }: { children: React.ReactNode }) {
  const vault = useVault();
  const [passphrase, setPassphrase] = useState('');
  const [passphrase2, setPassphrase2] = useState('');
  const mode: Mode = useMemo(() => (vault.isConfigured ? 'unlock' : 'setup'), [vault.isConfigured]);

  if (vault.isUnlocked) return <>{children}</>;

  const busy = vault.isInitializing;
  const canSubmit = mode === 'unlock' ? passphrase.length > 0 : passphrase.length >= 8 && passphrase === passphrase2;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    if (mode === 'unlock') {
      await vault.unlock(passphrase);
    } else {
      await vault.setupNewVault(passphrase);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <Card className="w-full max-w-md">
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <LockKeyhole className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-semibold font-display">
                {mode === 'unlock' ? 'Sblocca CRYPTA' : 'Configura la cifratura'}
              </h1>
              <p className="text-sm text-muted-foreground">
                {mode === 'unlock'
                  ? 'Inserisci la passphrase per accedere ai dati locali cifrati.'
                  : 'Imposta una passphrase per cifrare i dati locali. Non viene salvata: ricordala.'}
              </p>
            </div>
          </div>

          {vault.error && (
            <Alert variant="destructive">
              <AlertDescription>{vault.error}</AlertDescription>
            </Alert>
          )}

          <form className="space-y-4" onSubmit={onSubmit}>
            <div className="space-y-2">
              <Label htmlFor="passphrase">Passphrase</Label>
              <Input
                id="passphrase"
                type="password"
                autoComplete="current-password"
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                placeholder={mode === 'unlock' ? '••••••••' : 'Minimo 8 caratteri'}
              />
            </div>

            {mode === 'setup' && (
              <div className="space-y-2">
                <Label htmlFor="passphrase2">Conferma passphrase</Label>
                <Input
                  id="passphrase2"
                  type="password"
                  autoComplete="new-password"
                  value={passphrase2}
                  onChange={(e) => setPassphrase2(e.target.value)}
                  placeholder="Ripeti passphrase"
                />
                <p className="text-xs text-muted-foreground">
                  Suggerimento: usa una frase lunga (es. 4-5 parole) invece di una password corta.
                </p>
              </div>
            )}

            <Button type="submit" className="w-full" disabled={!canSubmit || busy}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {mode === 'unlock' ? 'Sblocca' : 'Imposta e sblocca'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
