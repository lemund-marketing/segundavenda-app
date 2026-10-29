import { useMemo, useState } from "react";
import { CalendarDays, DollarSign, Receipt, ShoppingCart, Users } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { cn } from "@/lib/utils";

import {
  EmptyBlock,
  KPICard,
  SectionCard,
  WEEKDAY_LABELS,
  barCursor,
  chartTooltipProps,
  fmtAxisCurrency,
  fmtInt,
  formatCurrency,
  type DetailStatsBase,
} from "../shared";

interface Props {
  stats: DetailStatsBase;
}

/**
 * Visão geral do produto (e da categoria — o payload das duas RPCs coincide
 * neste recorte).
 *
 * No lugar do heatmap 7×24 do Segundo Pedido entra a distribuição por dia da
 * semana: o produto campeão do seller de teste tem 200 pedidos para 168 células,
 * e um "pico" com n=1 é ruído apresentado como padrão.
 */
export function ProductOverviewTab({ stats }: Props) {
  const [weekdayMode, setWeekdayMode] = useState<"orders" | "revenue">("orders");
  const variation = stats.variation_vs_previous;

  const weekdayData = useMemo(
    () =>
      (stats.weekday_breakdown ?? []).map((w) => ({
        nome: WEEKDAY_LABELS[w.dow] ?? String(w.dow),
        orders: w.orders,
        revenue: w.revenue,
      })),
    [stats.weekday_breakdown],
  );

  const temWeekday = weekdayData.some((w) => w.orders > 0);

  const melhorDia = useMemo(() => {
    if (!temWeekday) return null;
    return weekdayData.reduce((best, cur) => (cur[weekdayMode] > best[weekdayMode] ? cur : best));
  }, [weekdayData, weekdayMode, temWeekday]);

  return (
    <div className="space-y-5 pt-5">
      {/* 2 colunas fixas: o sheet tem 600px e os breakpoints do Tailwind medem a
          JANELA, não o contêiner — `lg:grid-cols-4` abria 4 colunas de ~130px
          aqui dentro e cortava "R$ 34.963,50" no meio. */}
      <div className="grid grid-cols-2 gap-3">
        <KPICard
          icon={ShoppingCart}
          tone="primary"
          label="Pedidos no período"
          value={fmtInt(stats.total_orders)}
          variation={variation?.orders_variation_pct ?? null}
        />
        <KPICard
          icon={DollarSign}
          tone="emerald"
          label="Receita"
          value={formatCurrency(stats.total_revenue)}
          variation={variation?.revenue_variation_pct ?? null}
        />
        <KPICard
          icon={Users}
          tone="violet"
          label="Clientes únicos"
          value={fmtInt(stats.unique_clients)}
        />
        <KPICard
          icon={Receipt}
          tone="amber"
          label="Ticket médio"
          value={formatCurrency(stats.avg_ticket)}
        />
      </div>

      <SectionCard
        icon={CalendarDays}
        iconTone="rose"
        title="Dias da semana"
        subtitle={melhorDia ? `Vende mais na ${melhorDia.nome}` : "Sem dados suficientes"}
        right={
          <div className="flex items-center gap-1 rounded-full bg-muted p-0.5 shrink-0">
            {(["orders", "revenue"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setWeekdayMode(mode)}
                className={cn(
                  "rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors",
                  weekdayMode === mode
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {mode === "orders" ? "Pedidos" : "Receita"}
              </button>
            ))}
          </div>
        }
      >
        {!temWeekday ? (
          <EmptyBlock height={220}>Sem dados no período</EmptyBlock>
        ) : (
          <div className="h-[220px] text-primary">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weekdayData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis
                  dataKey="nome"
                  tick={{ fontSize: 11 }}
                  stroke="hsl(var(--muted-foreground))"
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11 }}
                  stroke="hsl(var(--muted-foreground))"
                  axisLine={false}
                  tickLine={false}
                  width={weekdayMode === "revenue" ? 60 : 36}
                  tickFormatter={(v: number) =>
                    weekdayMode === "revenue" ? fmtAxisCurrency(v) : fmtInt(v)
                  }
                />
                <Tooltip
                  {...chartTooltipProps}
                  cursor={barCursor}
                  formatter={(v: number) => [
                    weekdayMode === "revenue" ? formatCurrency(v) : fmtInt(v),
                    weekdayMode === "revenue" ? "Receita" : "Pedidos",
                  ]}
                />
                {/* Sem animação: a aba nasce oculta e o rAF parado deixa a barra
                    em 0px para sempre quando o usuário troca de aba. */}
                <Bar
                  dataKey={weekdayMode}
                  radius={[6, 6, 0, 0]}
                  barSize={26}
                  fill="currentColor"
                  isAnimationActive={false}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
