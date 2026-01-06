import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Shield, 
  Lock, 
  Database, 
  CheckCircle, 
  ArrowRight,
  Sparkles
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { completeOnboarding } from "@/lib/storage";

interface OnboardingScreenProps {
  onComplete: () => void;
}

const steps = [
  {
    icon: Shield,
    title: "Benvenuto in CRYPTA",
    description: "La tua app per il monitoraggio e la gestione fiscale delle crypto-attività, conforme alle normative europee MiCA e DAC8.",
    highlight: "100% Privacy • Dati Locali • Open Source",
  },
  {
    icon: Lock,
    title: "I Tuoi Dati, Solo Tuoi",
    description: "Tutti i dati vengono salvati esclusivamente sul tuo dispositivo. Non raccogliamo informazioni personali, non tracciamo, non condividiamo nulla.",
    highlight: "Nessun login • Nessun cloud • Nessun tracking",
  },
  {
    icon: Database,
    title: "Come Funziona",
    description: "Aggiungi i tuoi wallet pubblici per tracciarne il valore. Calcola le imposte con metodi FIFO/LIFO. Genera report per la tua dichiarazione fiscale.",
    highlight: "Traccia • Calcola • Esporta",
  },
];

export const OnboardingScreen = ({ onComplete }: OnboardingScreenProps) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [accepted, setAccepted] = useState(false);

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleComplete = () => {
    completeOnboarding();
    onComplete();
  };

  const isLastStep = currentStep === steps.length - 1;
  const step = steps[currentStep];
  const Icon = step.icon;

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      {/* Background decoration */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 -left-1/4 w-1/2 h-1/2 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 -right-1/4 w-1/2 h-1/2 bg-primary/5 rounded-full blur-3xl" />
      </div>

      <motion.div
        key={currentStep}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-lg relative z-10"
      >
        <Card variant="glass" className="shadow-elevated">
          <CardContent className="p-8 text-center">
            {/* Step indicator */}
            <div className="flex justify-center gap-2 mb-8">
              {steps.map((_, index) => (
                <div
                  key={index}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    index === currentStep
                      ? "w-8 bg-primary"
                      : index < currentStep
                      ? "w-4 bg-primary/50"
                      : "w-4 bg-muted"
                  }`}
                />
              ))}
            </div>

            {/* Icon */}
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.1 }}
              className="mb-6"
            >
              <div className="w-20 h-20 mx-auto rounded-2xl gradient-primary flex items-center justify-center shadow-glow">
                <Icon className="w-10 h-10 text-primary-foreground" />
              </div>
            </motion.div>

            {/* Title */}
            <motion.h1
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="text-2xl font-bold font-display mb-4"
            >
              {step.title}
            </motion.h1>

            {/* Description */}
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="text-muted-foreground mb-6"
            >
              {step.description}
            </motion.p>

            {/* Highlight */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium mb-8"
            >
              <Sparkles className="w-4 h-4" />
              {step.highlight}
            </motion.div>

            {/* Last step: Accept terms */}
            {isLastStep && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
                className="mb-6"
              >
                <label className="flex items-start gap-3 p-4 rounded-xl bg-secondary/50 cursor-pointer hover:bg-secondary/70 transition-colors">
                  <input
                    type="checkbox"
                    checked={accepted}
                    onChange={(e) => setAccepted(e.target.checked)}
                    className="mt-1 w-4 h-4 rounded border-border text-primary focus:ring-primary"
                  />
                  <span className="text-sm text-left text-muted-foreground">
                    Ho letto e compreso che i crypto-asset sono strumenti volatili, che questa app 
                    non fornisce consulenza fiscale e che tutti i dati rimangono sul mio dispositivo.
                  </span>
                </label>
              </motion.div>
            )}

            {/* Actions */}
            <div className="flex gap-3">
              {currentStep > 0 && (
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setCurrentStep(currentStep - 1)}
                >
                  Indietro
                </Button>
              )}
              
              {isLastStep ? (
                <Button
                  variant="gradient"
                  className="flex-1"
                  disabled={!accepted}
                  onClick={handleComplete}
                >
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Inizia
                </Button>
              ) : (
                <Button
                  variant="gradient"
                  className="flex-1"
                  onClick={handleNext}
                >
                  Continua
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Footer */}
        <p className="text-center text-xs text-muted-foreground mt-6">
          CRYPTA v1.0 • Compliant MiCA & DAC8 • Open Source
        </p>
      </motion.div>
    </div>
  );
};
