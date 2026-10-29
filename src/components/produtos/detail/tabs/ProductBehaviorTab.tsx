import { useMemo, useState } from "react";
import { Store, TrendingUp, Users } from "lucide-react";
import { format, parse } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { StoreBadge } from "@/components/clients/StoreBadge";
import { ClientAvatar } from "@/components/crm/ClientAvatar";
import { relativeLabel } from "@/utils/relativeDate";
import { cn } from "@/lib/utils";

import {
  EmptyBlock,
  SectionCard,
  barCursor,
  chartTooltipProps,
  fmtAxisCurrency,
  fmtInt,
  formatCurrency,
  type DetailStatsBase,
} from "../shared";

interface Props {
  stats: DetailStatsBase;
  onSelectClient: (clientId: string) => void;
}

const TONE_RELATIVO: Record<"fresh" | "muted" | "stale", string> = {
  fresh: "text-primary",
  muted: "text-muted-foreground",
  stale: "text-amber-600 dark:text-amber-500",
};

/**
 * Uma lista de distribuição, não duas: onde o Segundo Pedido corta por
 * marketplace E por filial, esta base só tem loja (`orders.marketplace`) —
 * `orders.store_id` é nulo nos 16.075 pedidos.
 */
function LojaDistribution({ items }: { items: [string, number][] }) {
  const total = items.reduce((s, [, n]) => s + n, 0);
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground py-2">Sem dados no período</p>;
  }
  return (
    <div className="space-y-2.5">
      {items.slice(0, 6).map(([slug, count]) => {
        const pct = total > 0 ? (count / total) * 100 : 0;
        return (
          <div key={slug} className="min-w-0">
            <div className="flex items-center justify-between gap-2 mb-1">
              <StoreBadge storeKey={slug} />
              <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                {fmtInt(count)} ({pct.toFixed(0)}%)
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div className="h-full rounded-full bg-primary/70" style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function ProductBehaviorTab({ stats, onSelectClient }: Props) {
  const [evoMetric, setEvoMetric] = useState<"orders" | "revenue">("orders");

  const monthlyData = useMemo(
    () =>
      (stats.monthly_evolution ?? []).map((m) => ({
        ...m,
        // A RPC já manda `label` como "07/26"; reescrever a partir do `ym` só
        // para ter o mês por extenso em pt-BR ("jul/26").
        nome: (() => {
          try {
            return format(parse(m.ym, "yyyy-MM", new Date()), "MMM/yy", { locale: ptBR });
          } catch {
            return m.label;
          }
        })(),
      })),
    [stats.monthly_evolution],
  );

  return (
    <div className="space-y-5 pt-5">
      <SectionCard
        icon={Store}
        iconTone="blue"
        title="Distribuição por marketplace"
        subtitle="Onde este item é vendido"
      >
        <LojaDistribution items={stats.marketplaces} />
      </SectionCard>

      <SectionCard
        icon={Users}
        iconTone="amber"
        title="Top clientes"
        subtitle="Quem mais comprou no período"
      >
        {stats.top_clients.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">Sem clientes identificados.</p>
        ) : (
          <div className="space-y-2">
            {stats.top_clients.map((c) => {
              const quando = relativeLabel(c.last_order_at);
              return (
                <button
                  key={c.client_id}
                  type="button"
                  onClick={() => onSelectClient(c.client_id)}
                  className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-muted/60 transition-colors text-left"
                >
                  <ClientAvatar name={c.full_name} size={32} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-foreground truncate">
                      {c.full_name ?? "Cliente sem nome"}
                    </div>
                    <div className="text-xs text-muted-foreground tabular-nums">
                      {c.total_orders} pedido{c.total_orders === 1 ? "" : "s"} ·{" "}
                      {formatCurrency(c.total_spent)}
                    </div>
                  </div>
                  <span className={cn("text-xs shrink-0 tabular-nums", TONE_RELATIVO[quando.tone])}>
                    {quando.text}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </SectionCard>

      <SectionCard
        icon={TrendingUp}
        iconTone="primary"
        title="Evolução mensal"
        subtitle="Meses com venda dentro do período"
        right={
          <div className="flex items-center gap-1 rounded-full bg-muted p-0.5 shrink-0">
            {(["orders", "revenue"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setEvoMetric(mode)}
                className={cn(
                  "rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors",
                  evoMetric === mode
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
        {monthlyData.length === 0 ? (
          <EmptyBlock height={220}>Sem dados no período</EmptyBlock>
        ) : (
          <div className="h-[220px] text-primary">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
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
                  width={evoMetric === "revenue" ? 60 : 36}
                  tickFormatter={(v: number) =>
                    evoMetric === "revenue" ? fmtAxisCurrency(v) : fmtInt(v)
                  }
                />
                <Tooltip
                  {...chartTooltipProps}
                  cursor={barCursor}
                  formatter={(v: number) => [
                    evoMetric === "revenue" ? formatCurrency(v) : fmtInt(v),
                    evoMetric === "revenue" ? "Receita" : "Pedidos",
                  ]}
                />
                {/* O Segundo Pedido não passa isto e o gráfico fica em branco
                    quando a aba nasce escondida. */}
                <Bar
                  dataKey={evoMetric}
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
