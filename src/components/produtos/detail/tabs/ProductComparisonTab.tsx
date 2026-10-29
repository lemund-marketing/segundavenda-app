import { Award, BarChart3, Info } from "lucide-react";

import { cn } from "@/lib/utils";

import type { CompareMode } from "../produtoDetailQueries";
import {
  CategoryPill,
  SectionCard,
  diffPct,
  fmtInt,
  formatCurrency,
  type ProductDetailStats,
} from "../shared";
import { CompareSelector, DiffPct, VsPreviousCard } from "./comparisonShared";

interface Props {
  stats: ProductDetailStats;
  compareMode: CompareMode;
  onCompareModeChange?: (m: CompareMode) => void;
  currentFrom?: string | null;
  currentTo?: string | null;
  compareFrom?: string | null;
  compareTo?: string | null;
}

export function ProductComparisonTab({
  stats,
  compareMode,
  onCompareModeChange,
  currentFrom,
  currentTo,
  compareFrom,
  compareTo,
}: Props) {
  const cmp = stats.category_comparison;
  const variation = stats.variation_vs_previous;
  const ticket = stats.avg_ticket;

  const catTicket = cmp && cmp.category_avg_orders > 0
    ? cmp.category_avg_revenue / cmp.category_avg_orders
    : 0;
  const acimaDaMedia = cmp ? cmp.this_product_orders > cmp.category_avg_orders : false;

  return (
    <div className="space-y-5 pt-5">
      {onCompareModeChange && (
        <CompareSelector
          mode={compareMode}
          onChange={onCompareModeChange}
          currentFrom={currentFrom}
          currentTo={currentTo}
          compareFrom={compareFrom}
          compareTo={compareTo}
        />
      )}

      {!cmp ? (
        <SectionCard icon={Info} iconTone="violet" title="Sem categoria">
          <p className="text-sm text-muted-foreground">
            Categorize este produto para comparar o desempenho dele com o dos outros
            produtos da mesma categoria.
          </p>
        </SectionCard>
      ) : (
        <>
          <SectionCard icon={Award} iconTone="violet" title="Posição na categoria">
            <div className="flex items-end gap-4 flex-wrap">
              <div>
                <div className="text-3xl font-bold tabular-nums text-foreground">
                  #{cmp.position_in_category}
                  <span className="text-lg text-muted-foreground font-normal">
                    {" "}
                    de {cmp.total_in_category}
                  </span>
                </div>
                <div className="mt-2">
                  <CategoryPill
                    name={cmp.category_name}
                    color={stats.category?.color ?? null}
                  />
                </div>
              </div>
              <div
                className={cn(
                  "ml-auto px-3 py-1.5 rounded-full text-xs font-medium",
                  acimaDaMedia
                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                    : "bg-amber-500/10 text-amber-600 dark:text-amber-400",
                )}
              >
                {acimaDaMedia ? "Acima da média da categoria" : "Abaixo da média da categoria"}
              </div>
            </div>
          </SectionCard>

          <SectionCard icon={BarChart3} iconTone="primary" title="Vs. média da categoria">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-muted-foreground border-b border-border">
                    <th className="text-left font-medium py-2" />
                    <th className="text-right font-medium py-2">Este produto</th>
                    <th className="text-right font-medium py-2">Média da categoria</th>
                    <th className="text-right font-medium py-2 w-20">Δ</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-border/50">
                    <td className="py-2 text-muted-foreground">Pedidos</td>
                    <td className="py-2 text-right tabular-nums font-medium">
                      {fmtInt(cmp.this_product_orders)}
                    </td>
                    <td className="py-2 text-right tabular-nums text-muted-foreground">
                      {cmp.category_avg_orders.toFixed(1).replace(/\.0$/, "")}
                    </td>
                    <td className="py-2 text-right">
                      <DiffPct value={diffPct(cmp.this_product_orders, cmp.category_avg_orders)} />
                    </td>
                  </tr>
                  <tr className="border-b border-border/50">
                    <td className="py-2 text-muted-foreground">Receita</td>
                    <td className="py-2 text-right tabular-nums font-medium">
                      {formatCurrency(cmp.this_product_revenue)}
                    </td>
                    <td className="py-2 text-right tabular-nums text-muted-foreground">
                      {formatCurrency(cmp.category_avg_revenue)}
                    </td>
                    <td className="py-2 text-right">
                      <DiffPct value={diffPct(cmp.this_product_revenue, cmp.category_avg_revenue)} />
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2 text-muted-foreground">Ticket médio</td>
                    <td className="py-2 text-right tabular-nums font-medium">
                      {formatCurrency(ticket)}
                    </td>
                    <td className="py-2 text-right tabular-nums text-muted-foreground">
                      {formatCurrency(catTicket)}
                    </td>
                    <td className="py-2 text-right">
                      <DiffPct value={diffPct(ticket, catTicket)} />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            {/* A média inclui produto da categoria SEM venda no período (a RPC
                conta o membro com zero), então ela é menor do que a média
                "entre quem vendeu" -- é o denominador certo para "o quanto
                este item puxa a categoria". */}
            <p className="text-[11px] text-muted-foreground mt-3">
              Média sobre os {cmp.total_in_category} produtos da categoria, incluindo os que não
              venderam no período.
            </p>
          </SectionCard>
        </>
      )}

      {variation ? (
        <VsPreviousCard
          variation={variation}
          totalOrders={stats.total_orders}
          totalRevenue={stats.total_revenue}
        />
      ) : (
        <SectionCard icon={Info} iconTone="blue" title="Sem período de comparação">
          <p className="text-sm text-muted-foreground">
            Escolha um período com data de início e fim para comparar com a janela anterior.
          </p>
        </SectionCard>
      )}
    </div>
  );
}
