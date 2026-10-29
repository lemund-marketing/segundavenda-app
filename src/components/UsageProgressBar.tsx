import { Progress } from "@/components/ui/progress";
import { AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface UsageProgressBarProps {
  current: number;
  limit: number;
  label?: string;
  showAlertIcon?: boolean;
  height?: "sm" | "md";
  className?: string;
}

/**
 * A régua de uso: quanto foi consumido do limite e que cor isso pinta.
 *
 * Fica exportada porque o mesmo indicador aparece em dois lugares com layouts
 * diferentes (o card de Minha Conta e o rodapé do menu lateral) — duas cópias da
 * escala divergiriam na primeira vez que um dos limiares mudasse, e a mesma
 * conta apareceria âmbar num canto e vermelha no outro.
 */
export const calcularUso = (current: number, limit: number) => {
  const percentage = limit > 0 ? (current / limit) * 100 : 0;
  const isOver = percentage > 100;

  let progressColorClass = "[&>div]:bg-primary";
  if (percentage >= 100) progressColorClass = "[&>div]:bg-destructive";
  else if (percentage >= 80) progressColorClass = "[&>div]:bg-warning";

  return {
    percentage,
    isOver,
    overageCount: isOver ? current - limit : 0,
    overagePercent: isOver ? percentage - 100 : 0,
    /** Passa dos 90%: é hora de avisar, não só de colorir. */
    alerta: percentage >= 90,
    progressColorClass,
    textColorClass: isOver ? "text-destructive" : percentage >= 80 ? "text-warning" : "text-foreground",
  };
};

/**
 * Barra de progresso padronizada para uso de pedidos/limite.
 * - <80% verde, 80-99% âmbar, 100%+ vermelho
 * - Quando excede 100%, mostra segmento extra com cor divergente + tooltip
 */
export const UsageProgressBar = ({
  current,
  limit,
  label = "Pedidos",
  showAlertIcon = true,
  height = "md",
  className,
}: UsageProgressBarProps) => {
  const { percentage, isOver, overageCount, overagePercent, progressColorClass } =
    calcularUso(current, limit);
  const overageBarWidth = Math.min(overagePercent, 50);

  const heightClass = height === "sm" ? "h-1.5" : "h-2";

  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <div className="flex items-center gap-2">
          <span className={cn("font-medium", isOver && "text-destructive")}>
            {current.toLocaleString("pt-BR")} / {limit.toLocaleString("pt-BR")}
            {isOver && (
              <span className="ml-1 text-destructive">
                (+{overageCount.toLocaleString("pt-BR")} •{" "}
                {overagePercent.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%)
              </span>
            )}
          </span>
          {showAlertIcon && percentage >= 90 && (
            <AlertCircle
              className={cn(
                "w-4 h-4 shrink-0",
                isOver ? "text-destructive" : "text-warning"
              )}
            />
          )}
        </div>
      </div>
      <div className="relative">
        <Progress
          value={Math.min(percentage, 100)}
          className={cn(heightClass, progressColorClass)}
        />
        {isOver && (
          <div
            className={cn(
              "absolute top-0 right-0 bg-destructive rounded-r-full border-l border-background",
              heightClass
            )}
            style={{ width: `${overageBarWidth}%` }}
            title={`Excedente: ${overageCount.toLocaleString("pt-BR")} pedidos acima do limite mensal`}
          />
        )}
      </div>
    </div>
  );
};
