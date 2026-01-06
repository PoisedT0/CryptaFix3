import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface CollapsibleSectionProps {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  className?: string;
  headerClassName?: string;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
}

export const CollapsibleSection = React.forwardRef<HTMLDivElement, CollapsibleSectionProps>(
  function CollapsibleSection({
    title,
    children,
    defaultOpen = true,
    className,
    headerClassName,
    icon,
    badge,
  }, ref) {
    const [isOpen, setIsOpen] = React.useState(defaultOpen);

    return (
      <div ref={ref} className={cn("rounded-xl border bg-card", className)}>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className={cn(
            "w-full flex items-center justify-between p-4 lg:p-6 text-left hover:bg-muted/50 transition-colors rounded-xl",
            !isOpen && "rounded-xl",
            isOpen && "rounded-t-xl rounded-b-none border-b",
            headerClassName
          )}
        >
          <div className="flex items-center gap-3">
            {icon}
            <h2 className="text-xl font-semibold font-display">{title}</h2>
            {badge}
          </div>
          <motion.div
            animate={{ rotate: isOpen ? 180 : 0 }}
            transition={{ duration: 0.2 }}
          >
            <ChevronDown className="h-5 w-5 text-muted-foreground" />
          </motion.div>
        </button>
        <AnimatePresence initial={false}>
          {isOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="p-4 lg:p-6 pt-0 lg:pt-0">
                {children}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }
);

CollapsibleSection.displayName = "CollapsibleSection";
