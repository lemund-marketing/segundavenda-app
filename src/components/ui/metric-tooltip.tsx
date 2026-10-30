import { Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface MetricTooltipProps {
  text: string;
  className?: string;
  iconClassName?: string;
}

/**
 * Pequeno ícone (i) com tooltip explicativo.
 * Use ao lado do título de qualquer KPI/bloco de métrica para explicar como o cálculo é feito.
 */
export function MetricTooltip({ text, className, iconClassName }: MetricTooltipProps) {
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={(e) => e.stopPropagation()}
            className={cn(
              "inline-flex items-center justify-center text-muted-foreground/70 hover:text-foreground transition-colors cursor-help",
              className
            )}
            aria-label="Como esta métrica é calculada"
          >
            <Info className={cn("w-3.5 h-3.5", iconClassName)} strokeWidth={2.25} />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-xs leading-relaxed">
          {text}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
