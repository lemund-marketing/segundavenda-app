import { TrendingUp } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

import type { CompareMode } from "../produtoDetailQueries";
import {
  SectionCard,
  TREND_DOWN,
  TREND_UP,
  fmtInt,
  fmtPct,
  formatCurrency,
  type VariationVsPrevious,
} from "../shared";

/** Δ percentual com o mesmo verde/vermelho (e o mesmo par `dark:`) do resto. */
export function DiffPct({ value }: { value: number | null | undefined }) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return <span className="text-xs text-muted-foreground tabular-nums">—</span>;
  }
  const isUp = value > 0;
  const isDown = value < 0;
  return (
    <span
      className={cn(
        "text-xs font-medium tabular-nums",
        isUp && TREND_UP,
        isDown && TREND_DOWN,
        !isUp && !isDown && "text-muted-foreground",
      )}
    >
      {fmtPct(value)}
    </span>
  );
}

const fmtRange = (a?: string | null, b?: string | null) => {
  if (!a || !b) return "—";
  try {
    return `${format(new Date(a), "dd/MMM", { locale: ptBR })}–${format(new Date(b), "dd/MMM", { locale: ptBR })}`;
  } catch {
    return "—";
  }
};

export function CompareSelector({
  mode,
  onChange,
  currentFrom,
  currentTo,
  compareFrom,
  compareTo,
}: {
  mode: CompareMode;
  onChange: (m: CompareMode) => void;
  currentFrom?: string | null;
  currentTo?: string | null;
  compareFrom?: string | null;
  compareTo?: string | null;
}) {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <span className="text-sm text-muted-foreground">Comparar com:</span>
      <Select value={mode} onValueChange={(v) => onChange(v as CompareMode)}>
        <SelectTrigger className="h-9 w-[220px] rounded-xl bg-card shadow-sm border-0">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="previous">Período anterior</SelectItem>
          <SelectItem value="last_month">Mesmo período mês passado</SelectItem>
          <SelectItem value="last_year">Mesmo período ano passado</SelectItem>
        </SelectContent>
      </Select>
      <span className="text-xs text-muted-foreground tabular-nums">
        {fmtRange(currentFrom, currentTo)} vs {fmtRange(compareFrom, compareTo)}
      </span>
    </div>
  );
}

/** "Vs. período anterior" — idêntico nos dois sheets. */
export function VsPreviousCard({
  variation,
  totalOrders,
  totalRevenue,
}: {
  variation: VariationVsPrevious;
  totalOrders: number;
  totalRevenue: number;
}) {
  return (
    <SectionCard icon={TrendingUp} iconTone="emerald" title="Vs. período de comparação">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-muted-foreground border-b border-border">
              <th className="text-left font-medium py-2" />
              <th className="text-right font-medium py-2">Este período</th>
              <th className="text-right font-medium py-2">Comparação</th>
              <th className="text-right font-medium py-2 w-20">Variação</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-border/50">
              <td className="py-2 text-muted-foreground">Pedidos</td>
              <td className="py-2 text-right tabular-nums font-medium">{fmtInt(totalOrders)}</td>
              <td className="py-2 text-right tabular-nums text-muted-foreground">
                {fmtInt(variation.prev_orders)}
              </td>
              <td className="py-2 text-right">
                <DiffPct value={variation.orders_variation_pct} />
              </td>
            </tr>
            <tr>
              <td className="py-2 text-muted-foreground">Receita</td>
              <td className="py-2 text-right tabular-nums font-medium">
                {formatCurrency(totalRevenue)}
              </td>
              <td className="py-2 text-right tabular-nums text-muted-foreground">
                {formatCurrency(variation.prev_revenue)}
              </td>
              <td className="py-2 text-right">
                <DiffPct value={variation.revenue_variation_pct} />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}
