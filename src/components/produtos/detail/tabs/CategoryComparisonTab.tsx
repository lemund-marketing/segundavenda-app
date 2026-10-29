import { Info, ListOrdered } from "lucide-react";

import { cn } from "@/lib/utils";

import type { CompareMode } from "../produtoDetailQueries";
import {
  SectionCard,
  fmtInt,
  formatCurrency,
  type CategoryDetailStats,
  type CategoryProductRank,
} from "../shared";
import { CompareSelector, VsPreviousCard } from "./comparisonShared";

interface Props {
  stats: CategoryDetailStats;
  compareMode: CompareMode;
  onCompareModeChange?: (m: CompareMode) => void;
  currentFrom?: string | null;
  currentTo?: string | null;
  compareFrom?: string | null;
  compareTo?: string | null;
  /** Wire para abrir o sheet do produto a partir do ranking. */
  onSelectProduct?: (p: CategoryProductRank) => void;
}

/**
 * Comparativo da categoria.
 *
 * Sem o bloco "Posição entre categorias" do Segundo Pedido: a
 * `get_category_detail_stats` desta base não devolve `category_comparison` —
 * inventar a posição no cliente exigiria buscar TODAS as categorias e refazer o
 * recorte de período, e um número quase-certo num cartão de ranking é pior do
 * que a ausência dele.
 */
export function CategoryComparisonTab({
  stats,
  compareMode,
  onCompareModeChange,
  currentFrom,
  currentTo,
  compareFrom,
  compareTo,
  onSelectProduct,
}: Props) {
  const ranking = stats.products_ranking ?? [];
  const variation = stats.variation_vs_previous;
  const maxOrders = Math.max(1, ...ranking.map((r) => r.orders));
  const cor = stats.category?.color || null;

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

      <SectionCard
        icon={ListOrdered}
        iconTone="blue"
        title="Ranking de produtos na categoria"
        subtitle={
          stats.product_count > ranking.length
            ? `${ranking.length} com venda no período · ${stats.product_count} na categoria`
            : `${ranking.length} produto${ranking.length === 1 ? "" : "s"}`
        }
      >
        {ranking.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum produto com pedidos no período.</p>
        ) : (
          <div className="space-y-2.5">
            {ranking.map((r, i) => {
              const linha = (
                <>
                  <span className="text-xs font-semibold text-muted-foreground w-5 shrink-0 tabular-nums">
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm truncate" title={r.name}>
                        {r.name}
                      </span>
                      <span className="text-sm font-medium tabular-nums shrink-0">
                        {formatCurrency(r.revenue)}
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${(r.orders / maxOrders) * 100}%`,
                          background: cor || "hsl(var(--primary))",
                        }}
                      />
                    </div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground tabular-nums">
                      {fmtInt(r.orders)} pedidos · ticket {formatCurrency(r.ticket)}
                    </div>
                  </div>
                </>
              );

              return onSelectProduct ? (
                <button
                  key={r.key}
                  type="button"
                  onClick={() => onSelectProduct(r)}
                  className={cn(
                    "w-full flex items-center gap-3 text-left rounded-xl -mx-2 px-2 py-1.5",
                    "hover:bg-muted/60 transition-colors",
                  )}
                >
                  {linha}
                </button>
              ) : (
                <div key={r.key} className="flex items-center gap-3">
                  {linha}
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>

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
