import { forwardRef, useState, ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { LucideIcon, ChevronDown } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

interface StatCardProps {
  title: string;
  value: string;
  change?: string;
  changeType?: "positive" | "negative" | "neutral";
  icon: LucideIcon;
  delay?: number;
  expandableContent?: ReactNode;
}

export const StatCard = forwardRef<HTMLDivElement, StatCardProps>(
  ({ title, value, change, changeType = "neutral", icon: Icon, delay = 0, expandableContent }, ref) => {
    const [isOpen, setIsOpen] = useState(false);

    const changeColors = {
      positive: "text-success",
      negative: "text-destructive",
      neutral: "text-muted-foreground",
    };

    const hasExpandable = !!expandableContent;

    return (
      <motion.div
        ref={ref}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay }}
      >
        <Collapsible open={isOpen} onOpenChange={setIsOpen}>
          <Card 
            variant="gradient" 
            className={cn(
              "hover:shadow-elevated hover:-translate-y-1 transition-all duration-300",
              hasExpandable && "cursor-pointer"
            )}
          >
            <CollapsibleTrigger asChild disabled={!hasExpandable}>
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground font-medium">{title}</p>
                    <p className="text-2xl lg:text-3xl font-bold font-display tracking-tight">
                      {value}
                    </p>
                    {change && (
                      <p className={cn("text-sm font-medium", changeColors[changeType])}>
                        {change}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-center gap-2">
                    <div className="p-3 rounded-xl bg-primary/10">
                      <Icon className="w-6 h-6 text-primary" />
                    </div>
                    {hasExpandable && (
                      <ChevronDown 
                        className={cn(
                          "w-4 h-4 text-muted-foreground transition-transform duration-200",
                          isOpen && "rotate-180"
                        )} 
                      />
                    )}
                  </div>
                </div>
              </CardContent>
            </CollapsibleTrigger>
            
            <AnimatePresence>
              {hasExpandable && (
                <CollapsibleContent>
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                    className="px-6 pb-6 pt-0"
                  >
                    <div className="border-t border-border/50 pt-4">
                      {expandableContent}
                    </div>
                  </motion.div>
                </CollapsibleContent>
              )}
            </AnimatePresence>
          </Card>
        </Collapsible>
      </motion.div>
    );
  }
);

StatCard.displayName = "StatCard";
