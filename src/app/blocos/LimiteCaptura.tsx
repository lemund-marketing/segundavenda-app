import { AlertCircle } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { calcularUso } from "@/components/UsageProgressBar";
import { formatarCicloCaptura } from "@/lib/cicloCaptura";
import { cn } from "@/lib/utils";

/**
 * Pedidos capturados no mês, no topo do Menu. Mesma conta e mesmas cores do
 * site (LimiteCapturaMenu): o número vem do SubscriptionContext e a régua do
 * `calcularUso`. Aqui não é link: a tela de plano fica no site, e o app não
 * leva para compra de plano (regra da Play).
 *
 * Some quando não há teto que faça sentido medir (enterprise, limite zerado,
 * membro que não enxerga a assinatura).
 */
export function LimiteCaptura() {
  const {
    limite_mensal, current_client_count, captura_ciclo_inicio, captura_ciclo_fim,
    captura_total, is_enterprise, loading,
  } = useSubscription();

  const limite = Number(limite_mensal ?? 0);
  const usado = Number(current_client_count ?? 0);
  if (loading || is_enterprise || limite <= 0) return null;

  const { percentage, isOver, overageCount, overagePercent, alerta, progressColorClass, textColorClass } =
    calcularUso(usado, limite);
  const nf = (n: number) => n.toLocaleString("pt-BR");
  const pct1 = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const ciclo = formatarCicloCaptura(captura_ciclo_inicio, captura_ciclo_fim);
  const total = typeof captura_total === "number" ? captura_total : null;

  return (
    <div className="rounded-2xl border border-border bg-card px-4 py-3.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Pedidos capturados</span>
        {alerta && <AlertCircle className={cn("h-4 w-4 shrink-0", textColorClass)} />}
      </div>
      <div className="mt-1.5 flex items-baseline gap-1 tabular-nums">
        <span className={cn("text-lg font-semibold", textColorClass)}>{nf(usado)}</span>
        <span className="text-sm text-muted-foreground">/ {nf(limite)} neste mês</span>
      </div>
      <Progress value={Math.min(percentage, 100)} className={cn("mt-2 h-1.5 bg-muted", progressColorClass)} />
      <p className="mt-2 text-xs text-muted-foreground tabular-nums">
        {isOver
          ? `${nf(overageCount)} acima do limite (${pct1(overagePercent)}%)`
          : `${percentage.toFixed(0)}% do limite`}
        {ciclo && ` · ${ciclo.inicio} a ${ciclo.ultimoDia}`}
        {total !== null && ` · ${nf(total)} no total`}
      </p>
    </div>
  );
}
