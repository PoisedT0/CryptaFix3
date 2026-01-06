import { motion } from "framer-motion";
import { 
  Shield, 
  BookOpen, 
  Scale, 
  FileText, 
  ExternalLink, 
  AlertTriangle,
  CheckCircle,
  Calendar,
  ChevronDown
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const regulations = [
  {
    id: "mica",
    title: "MiCA - Markets in Crypto-Assets Regulation",
    badge: "UE 2023/1114",
    icon: Scale,
    description: "Regolamento europeo per la regolamentazione dei crypto-asset",
    points: [
      "Entrato in vigore a giugno 2023, pienamente applicabile da dicembre 2024",
      "Stabilisce regole uniformi UE per crypto-asset non regolati da altre normative finanziarie",
      "Richiede autorizzazioni per i Crypto-Asset Service Providers (CASPs)",
      "Enfatizza trasparenza, protezione consumatori e stabilità finanziaria",
      "Registro ESMA pubblico per white paper, CASPs autorizzati e entità non conformi",
      "Requisiti specifici per stablecoin (ART e EMT) e white paper in formato iXBRL",
    ],
    deadline: "Pienamente applicabile: Dicembre 2024",
    link: "https://www.esma.europa.eu/esmas-activities/digital-finance-and-innovation/markets-crypto-assets-regulation-mica",
  },
  {
    id: "dac8",
    title: "DAC8 - Cooperazione Amministrativa Fiscale",
    badge: "UE 2023/2226",
    icon: FileText,
    description: "Direttiva sullo scambio automatico di informazioni fiscali crypto",
    points: [
      "Dal 1° gennaio 2026, obbligo per i provider crypto (RCASPs) di raccogliere e scambiare dati",
      "Reporting automatico alle autorità fiscali di transazioni fiat-crypto, crypto-crypto e transfers",
      "Include dettagli utenti: nome, indirizzo, TIN, residenza fiscale",
      "Valori di fair market value per tutte le transazioni",
    ],
    deadline: "In vigore dal: 1 Gennaio 2026",
    link: "https://eur-lex.europa.eu/eli/dir/2023/2226",
  },
  {
    id: "carf",
    title: "CARF - Crypto-Asset Reporting Framework",
    badge: "OCSE",
    icon: BookOpen,
    description: "Framework internazionale per il reporting dei crypto-asset",
    points: [
      "Definisce transazioni reportabili: acquisizioni, disposizioni, transfers",
      "Soglia per retail: transazioni > $50.000 USD",
      "Obblighi di due diligence e self-certification",
      "Reporting annuale aggregato standardizzato",
    ],
    deadline: "Allineato con DAC8",
    link: "https://www.oecd.org/tax/exchange-of-tax-information/crypto-asset-reporting-framework-and-amendments-to-the-common-reporting-standard.htm",
  },
];

// MANDATORY TAX CASES - Based on EU regulations (MiCA, DAC8, CARF) and Italian tax law
const mandatoryTaxCases = [
  {
    id: "capital_gains",
    title: "Plusvalenze da Vendita/Scambio",
    description: "Vendita crypto per fiat o scambio crypto-crypto con realizzo guadagno",
    taxable: true,
    details: "Ogni volta che vendi crypto per euro (o altra valuta fiat) o scambi crypto con altra crypto realizzando un guadagno, devi pagare le tasse sulla plusvalenza. Dal 2025 non esiste più soglia di esenzione.",
    examples: ["Vendita BTC per EUR", "Scambio ETH per USDC con profitto", "Conversione in stablecoin con gain"],
    rate: "26% (2025) / 33% (dal 2026)",
  },
  {
    id: "staking_rewards",
    title: "Ricompense Staking e Validazione",
    description: "Token ricevuti come ricompensa per staking o validazione PoS",
    taxable: true,
    details: "Le ricompense da staking sono considerate redditi diversi. Tassate al valore di mercato (fair market value) al momento della ricezione. Non al momento della vendita!",
    examples: ["Ricompense ETH staking", "Rewards da validatori Solana", "Interest da lending DeFi"],
    rate: "26% (2025) / 33% (dal 2026)",
  },
  {
    id: "mining",
    title: "Proventi da Mining",
    description: "Crypto ricevute come ricompensa per mining (PoW)",
    taxable: true,
    details: "Il mining genera reddito tassabile al fair market value al momento della ricezione. Se l'attività è professionale/abituale, potrebbe configurarsi reddito d'impresa.",
    examples: ["BTC da mining", "ETH Classic mining", "Altcoin mining"],
    rate: "26%/33% o IRPEF se impresa",
  },
  {
    id: "airdrops",
    title: "Airdrop e Token Gratuiti",
    description: "Token ricevuti gratuitamente (airdrop, fork, giveaway)",
    taxable: true,
    details: "Gli airdrop sono tassati come redditi diversi al fair market value al momento della ricezione. Anche se non hai fatto nulla per ottenerli!",
    examples: ["Airdrop governance token", "Token da fork blockchain", "Reward programmi referral"],
    rate: "26% (2025) / 33% (dal 2026)",
  },
  {
    id: "nft_sales",
    title: "Vendita NFT con Plusvalenza",
    description: "Vendita di NFT a prezzo superiore all'acquisto",
    taxable: true,
    details: "Gli NFT sono considerati crypto-asset. La plusvalenza da vendita è tassabile come per qualsiasi altra crypto. Attenzione: anche lo scambio NFT-crypto genera evento tassabile.",
    examples: ["Vendita NFT su OpenSea", "Scambio NFT per ETH", "Royalties NFT (se creator)"],
    rate: "26% (2025) / 33% (dal 2026)",
  },
  {
    id: "defi_yields",
    title: "Rendimenti DeFi (Lending/Farming)",
    description: "Interest, yield farming, liquidity mining",
    taxable: true,
    details: "I rendimenti da protocolli DeFi (lending, farming, LP rewards) sono tassabili al momento della ricezione. Calcolo complesso per impermanent loss.",
    examples: ["Interest da Aave/Compound", "Farming rewards Uniswap", "LP fees"],
    rate: "26% (2025) / 33% (dal 2026)",
  },
  {
    id: "payments_received",
    title: "Pagamenti in Crypto (Lavoro/Servizi)",
    description: "Stipendi, compensi, pagamenti ricevuti in crypto",
    taxable: true,
    details: "Se ricevi crypto come pagamento per lavoro o servizi, il valore al momento della ricezione è reddito imponibile (lavoro dipendente o autonomo). Successiva vendita genera ulteriore evento tassabile.",
    examples: ["Stipendio in BTC", "Compenso freelance in ETH", "Mance/tips in crypto"],
    rate: "IRPEF + 26%/33% su plusvalenza",
  },
];

// Cases where taxes are NOT due
const nonTaxableCases = [
  {
    id: "holding",
    title: "Detenzione (HODL)",
    description: "Semplicemente possedere crypto senza venderle",
    taxable: false,
    details: "Tenere crypto in wallet non genera evento tassabile. Però obbligo dichiarativo Quadro RW per monitoraggio fiscale!",
  },
  {
    id: "transfer_own",
    title: "Trasferimento tra Wallet Propri",
    description: "Spostare crypto da un tuo wallet a un altro tuo wallet",
    taxable: false,
    details: "Trasferire crypto tra wallet di tua proprietà non è evento tassabile. Ma conserva documentazione per dimostrare proprietà.",
  },
  {
    id: "donations_received",
    title: "Donazioni Ricevute (sotto soglia)",
    description: "Crypto ricevute come regalo/donazione",
    taxable: false,
    details: "Donazioni ricevute non sono tassabili al momento della ricezione (sotto soglie imposta donazioni). Attenzione: la successiva vendita genera plusvalenza tassabile.",
  },
  {
    id: "losses",
    title: "Vendita in Perdita",
    description: "Vendere crypto a prezzo inferiore all'acquisto",
    taxable: false,
    details: "Le minusvalenze non generano tasse. Possono essere compensate con plusvalenze dello stesso anno o portate in avanti per 4 anni.",
  },
];

const italianTaxRules = [
  {
    category: "Capital Gains 2024",
    description: "Plusvalenze da vendita crypto (fino al 2024)",
    rate: "26%",
    threshold: "Soglia esenzione: €2.000/anno",
    notes: "Si applica solo sopra la soglia. Metodo FIFO consigliato.",
  },
  {
    category: "Capital Gains 2025",
    description: "Plusvalenze da vendita crypto (dal 2025)",
    rate: "26%",
    threshold: "ABOLITA soglia €2.000",
    notes: "Ogni plusvalenza è tassabile. Legge di Bilancio 2025.",
  },
  {
    category: "Capital Gains 2026+",
    description: "Plusvalenze da vendita crypto (dal 2026)",
    rate: "33%",
    threshold: "ABOLITA soglia €2.000",
    notes: "Aliquota aumentata al 33%. Legge di Bilancio 2025/2026.",
  },
  {
    category: "Staking/Mining",
    description: "Redditi da staking, mining, validazione",
    rate: "26% / 33%",
    threshold: "Tassato come reddito diverso",
    notes: "Valore al momento della ricezione. Aliquota dell'anno.",
  },
  {
    category: "Airdrop",
    description: "Token ricevuti gratuitamente",
    rate: "26% / 33%",
    threshold: "Tassato come reddito diverso",
    notes: "Fair market value alla ricezione. Aliquota dell'anno.",
  },
];

export const ComplianceEducation = () => {
  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <Card variant="glow">
          <CardContent className="p-6">
            <div className="flex items-start gap-4">
              <div className="p-3 rounded-xl bg-primary/10">
                <Shield className="w-8 h-8 text-primary" />
              </div>
              <div>
                <h2 className="text-2xl font-bold font-display mb-2">Compliance & Normative</h2>
                <p className="text-muted-foreground">
                  Informazioni sulle normative europee e italiane per la gestione fiscale delle crypto-attività.
                  Questa app non raccoglie dati personali e ti aiuta a generare report per le tue dichiarazioni.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Tax Changes Alert 2025/2026 */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
      >
        <Card variant="gradient" className="border-warning/30">
          <CardContent className="p-6">
            <div className="flex items-start gap-3">
              <Calendar className="w-6 h-6 text-warning flex-shrink-0" />
              <div>
                <h3 className="font-semibold font-display text-warning">Novità Fiscali 2025-2026</h3>
                <ul className="text-sm text-muted-foreground mt-2 space-y-1">
                  <li>• <strong>Dal 2025:</strong> non c'è più la soglia di esenzione. Le plusvalenze sono tassate al 26%.</li>
                  <li>• <strong>Dal 2026:</strong> l'aliquota sulle plusvalenze crypto sale al 33%.</li>
                  <li>• <strong>Obbligo dichiarativo:</strong> Quadro RW (monitoraggio) e Quadro RT (plusvalenze).</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Privacy Notice */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <Card variant="gradient" className="border-success/30">
          <CardContent className="p-6">
            <div className="flex items-start gap-3">
              <CheckCircle className="w-6 h-6 text-success flex-shrink-0" />
              <div>
                <h3 className="font-semibold font-display text-success">Privacy Garantita</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  CRYPTA non è un CASP né un RCASP. Non raccogliamo, trasmettiamo o condividiamo 
                  dati personali. Tutti i tuoi dati (wallet, transazioni, calcoli) sono salvati 
                  esclusivamente sul tuo dispositivo in formato crittografato.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Mandatory Tax Cases - Collapsible */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
      >
        <Accordion type="single" collapsible defaultValue="mandatory-taxes">
          <AccordionItem value="mandatory-taxes" className="border-0">
            <Card variant="gradient" className="border-destructive/20">
              <AccordionTrigger className="px-6 py-4 hover:no-underline [&[data-state=open]>div>svg]:rotate-180">
                <div className="flex items-center gap-3 w-full">
                  <AlertTriangle className="w-5 h-5 text-destructive flex-shrink-0" />
                  <span className="text-xl font-bold font-display text-left">Quando È OBBLIGATORIO Pagare le Tasse</span>
                  <ChevronDown className="w-5 h-5 ml-auto transition-transform duration-200" />
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-6 pb-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                  {mandatoryTaxCases.map((taxCase) => (
                    <Card key={taxCase.id} variant="gradient" className="border-destructive/20">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between mb-2">
                          <h4 className="font-semibold font-display">{taxCase.title}</h4>
                          <Badge variant="destructive">{taxCase.rate}</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mb-2">{taxCase.description}</p>
                        <p className="text-xs mb-2">{taxCase.details}</p>
                        <div className="flex flex-wrap gap-1">
                          {taxCase.examples.map((ex, i) => (
                            <Badge key={i} variant="outline" className="text-xs">{ex}</Badge>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </AccordionContent>
            </Card>
          </AccordionItem>
        </Accordion>
      </motion.div>

      {/* Non-Taxable Cases - Collapsible */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.18 }}
      >
        <Accordion type="single" collapsible defaultValue="non-taxable">
          <AccordionItem value="non-taxable" className="border-0">
            <Card variant="gradient" className="border-success/20">
              <AccordionTrigger className="px-6 py-4 hover:no-underline [&[data-state=open]>div>svg]:rotate-180">
                <div className="flex items-center gap-3 w-full">
                  <CheckCircle className="w-5 h-5 text-success flex-shrink-0" />
                  <span className="text-xl font-bold font-display text-left">Quando NON Si Pagano Tasse</span>
                  <ChevronDown className="w-5 h-5 ml-auto transition-transform duration-200" />
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-6 pb-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                  {nonTaxableCases.map((taxCase) => (
                    <Card key={taxCase.id} variant="gradient" className="border-success/20">
                      <CardContent className="p-4">
                        <h4 className="font-semibold font-display mb-1">{taxCase.title}</h4>
                        <p className="text-sm text-muted-foreground mb-2">{taxCase.description}</p>
                        <p className="text-xs">{taxCase.details}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </AccordionContent>
            </Card>
          </AccordionItem>
        </Accordion>
      </motion.div>

      {/* EU Regulations - Collapsible */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <Accordion type="single" collapsible>
          <AccordionItem value="eu-regulations" className="border-0">
            <Card variant="gradient">
              <AccordionTrigger className="px-6 py-4 hover:no-underline [&[data-state=open]>div>svg]:rotate-180">
                <div className="flex items-center gap-3 w-full">
                  <Scale className="w-5 h-5 text-primary flex-shrink-0" />
                  <span className="text-xl font-bold font-display text-left">Normative Europee</span>
                  <ChevronDown className="w-5 h-5 ml-auto transition-transform duration-200" />
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-6 pb-4">
                <div className="space-y-3 pt-2">
                  {regulations.map((reg) => (
                    <Card key={reg.id} variant="gradient" className="border-primary/10">
                      <CardContent className="p-4">
                        <div className="flex items-start gap-3 mb-3">
                          <div className="p-2 rounded-lg bg-primary/10">
                            <reg.icon className="w-4 h-4 text-primary" />
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold font-display">{reg.title}</span>
                              <Badge variant="outline" className="text-xs">{reg.badge}</Badge>
                            </div>
                            <p className="text-sm text-muted-foreground mt-1">{reg.description}</p>
                          </div>
                        </div>
                        <ul className="space-y-1.5 mb-3">
                          {reg.points.map((point, i) => (
                            <li key={i} className="flex items-start gap-2 text-xs">
                              <CheckCircle className="w-3 h-3 text-success flex-shrink-0 mt-0.5" />
                              <span>{point}</span>
                            </li>
                          ))}
                        </ul>
                        <div className="flex items-center justify-between pt-2 border-t border-border/30">
                          <Badge variant="warning" className="text-xs">{reg.deadline}</Badge>
                          <Button variant="ghost" size="sm" className="h-7 text-xs" asChild>
                            <a href={reg.link} target="_blank" rel="noopener noreferrer">
                              Approfondisci <ExternalLink className="w-3 h-3 ml-1" />
                            </a>
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </AccordionContent>
            </Card>
          </AccordionItem>
        </Accordion>
      </motion.div>

      {/* Italian Tax Rules - Collapsible */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <Accordion type="single" collapsible>
          <AccordionItem value="italian-taxes" className="border-0">
            <Card variant="gradient">
              <AccordionTrigger className="px-6 py-4 hover:no-underline [&[data-state=open]>div>svg]:rotate-180">
                <div className="flex items-center gap-3 w-full">
                  <FileText className="w-5 h-5 text-primary flex-shrink-0" />
                  <span className="text-xl font-bold font-display text-left">Tassazione Italia</span>
                  <ChevronDown className="w-5 h-5 ml-auto transition-transform duration-200" />
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-6 pb-4">
                <div className="space-y-3 pt-2">
                  {italianTaxRules.map((rule, index) => (
                    <div
                      key={index}
                      className="flex flex-col sm:flex-row sm:items-center justify-between py-3 border-b border-border/30 last:border-0 gap-3"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-semibold font-display text-sm">{rule.category}</h4>
                          <Badge variant={rule.rate === "33%" ? "destructive" : "outline"} className="text-xs">{rule.rate}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">{rule.description}</p>
                      </div>
                      <div className="text-right">
                        <p className={`text-xs font-medium ${rule.threshold.includes("ABOLITA") ? "text-warning" : ""}`}>
                          {rule.threshold}
                        </p>
                        <p className="text-xs text-muted-foreground">{rule.notes}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </AccordionContent>
            </Card>
          </AccordionItem>
        </Accordion>
      </motion.div>

      {/* Risk Warning */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
      >
        <Card variant="gradient" className="border-warning/30">
          <CardContent className="p-6">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-6 h-6 text-warning flex-shrink-0" />
              <div>
                <h3 className="font-semibold font-display text-warning">Avvertenza sui Rischi</h3>
                <ul className="text-sm text-muted-foreground mt-2 space-y-1">
                  <li>• I crypto-asset sono strumenti altamente volatili e speculativi</li>
                  <li>• Non esistono garanzie di rendimento o protezione del capitale</li>
                  <li>• Investi solo ciò che puoi permetterti di perdere</li>
                  <li>• Le informazioni fiscali sono indicative: consulta un professionista</li>
                  <li>• Le normative sono in evoluzione: verifica sempre gli aggiornamenti</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Resources */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
      >
        <h3 className="text-xl font-bold font-display mb-4">Risorse Utili</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card variant="gradient" className="hover:shadow-elevated transition-all">
            <CardContent className="p-4">
              <Button variant="ghost" className="w-full justify-start h-auto py-3" asChild>
                <a href="https://www.esma.europa.eu/esmas-activities/digital-finance-and-innovation/markets-crypto-assets-regulation-mica" target="_blank" rel="noopener noreferrer">
                  <div className="flex items-center gap-3">
                    <Scale className="w-5 h-5 text-primary" />
                    <div className="text-left">
                      <p className="font-semibold">ESMA - MiCA Hub</p>
                      <p className="text-xs text-muted-foreground">Documentazione ufficiale MiCA e registro CASPs</p>
                    </div>
                    <ExternalLink className="w-4 h-4 ml-auto" />
                  </div>
                </a>
              </Button>
            </CardContent>
          </Card>
          <Card variant="gradient" className="hover:shadow-elevated transition-all">
            <CardContent className="p-4">
              <Button variant="ghost" className="w-full justify-start h-auto py-3" asChild>
                <a href="https://www.agenziaentrate.gov.it" target="_blank" rel="noopener noreferrer">
                  <div className="flex items-center gap-3">
                    <FileText className="w-5 h-5 text-primary" />
                    <div className="text-left">
                      <p className="font-semibold">Agenzia delle Entrate</p>
                      <p className="text-xs text-muted-foreground">Guida fiscale italiana crypto</p>
                    </div>
                    <ExternalLink className="w-4 h-4 ml-auto" />
                  </div>
                </a>
              </Button>
            </CardContent>
          </Card>
          <Card variant="gradient" className="hover:shadow-elevated transition-all">
            <CardContent className="p-4">
              <Button variant="ghost" className="w-full justify-start h-auto py-3" asChild>
                <a href="https://eur-lex.europa.eu/eli/reg/2023/1114" target="_blank" rel="noopener noreferrer">
                  <div className="flex items-center gap-3">
                    <BookOpen className="w-5 h-5 text-primary" />
                    <div className="text-left">
                      <p className="font-semibold">Testo Ufficiale MiCA</p>
                      <p className="text-xs text-muted-foreground">Regolamento UE 2023/1114</p>
                    </div>
                    <ExternalLink className="w-4 h-4 ml-auto" />
                  </div>
                </a>
              </Button>
            </CardContent>
          </Card>
          <Card variant="gradient" className="hover:shadow-elevated transition-all">
            <CardContent className="p-4">
              <Button variant="ghost" className="w-full justify-start h-auto py-3" asChild>
                <a href="https://cryptobooks.tax/it/blog/tassazione-crypto-2025-2026-rimozione-soglia-aliquota-33" target="_blank" rel="noopener noreferrer">
                  <div className="flex items-center gap-3">
                    <Calendar className="w-5 h-5 text-primary" />
                    <div className="text-left">
                      <p className="font-semibold">Novità Fiscali 2025-2026</p>
                      <p className="text-xs text-muted-foreground">Approfondimento aliquote e soglie</p>
                    </div>
                    <ExternalLink className="w-4 h-4 ml-auto" />
                  </div>
                </a>
              </Button>
            </CardContent>
          </Card>
        </div>
      </motion.div>

    </div>
  );
};
