import { useQuery, type QueryClient } from "@tanstack/react-query";
import { subMonths, subYears } from "date-fns";

import { supabase } from "@/integrations/supabase/client";

import type {
  CategoryDetailStats,
  CategoryProductRank,
  DetailOrder,
  MonthlyPoint,
  ProductDetailStats,
  TopClient,
  VariationVsPrevious,
  WeekdayBucket,
} from "./shared";

/**
 * Camada de dados dos sheets de detalhe da página Produtos.
 *
 * `src/integrations/supabase/types.ts` não conhece nenhuma destas RPCs nem as
 * tabelas novas (o arquivo não é regenerado nesta base), por isso todo acesso
 * passa por `(supabase as any)` — mesmo padrão de `lojaDetailQueries.ts`.
 *
 * PostgREST devolve `numeric` como número JSON, mas a coerção explícita evita
 * `NaN` silencioso se alguma RPC passar a serializar como texto.
 */

const n = (v: unknown) => Number(v ?? 0) || 0;

// ---------------------------------------------------------------------------
// Janela de comparação
// ---------------------------------------------------------------------------

export type CompareMode = "previous" | "last_month" | "last_year";

export interface CompareRange {
  from: string | null;
  to: string | null;
}

/**
 * Diferente do Segundo Pedido: lá, `p_compare_from` nulo fazia a RPC calcular o
 * período anterior sozinha. As RPCs daqui NÃO calculam nada — sem as duas
 * pontas elas devolvem `variation_vs_previous: null`. Então a janela anterior é
 * sempre montada aqui, inclusive no modo "previous".
 */
export function computeCompareRange(
  from: string | null | undefined,
  to: string | null | undefined,
  mode: CompareMode,
): CompareRange {
  if (!from || !to) return { from: null, to: null };

  const start = new Date(from);
  const end = new Date(to);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return { from: null, to: null };
  }

  if (mode === "previous") {
    const span = end.getTime() - start.getTime();
    // -1ms no fim: as RPCs filtram com `>=` e `<=` nas duas pontas, e terminar
    // exatamente em `from` contaria o pedido da fronteira nos dois períodos.
    return {
      from: new Date(start.getTime() - span).toISOString(),
      to: new Date(start.getTime() - 1).toISOString(),
    };
  }

  // subMonths/subYears do date-fns e NÃO `setMonth`: `setMonth` estoura quando
  // o dia não existe no mês anterior (31/05 -> 31/04 -> 01/05), e o fim da
  // comparação caía DENTRO da janela atual — os pedidos do dia da fronteira
  // entravam nos dois lados. Vale para 31/03, 31/05, 31/07, 31/10, 31/12 e
  // 29/30/31 de março.
  const shift = (d: Date) =>
    (mode === "last_month" ? subMonths(d, 1) : subYears(d, 1)).toISOString();

  return { from: shift(start), to: shift(end) };
}

// ---------------------------------------------------------------------------
// Normalização do payload
// ---------------------------------------------------------------------------

const asPairs = (v: unknown): [string, number][] =>
  Array.isArray(v)
    ? v
        .filter((row) => Array.isArray(row) && row.length >= 2)
        .map((row: any) => [String(row[0] ?? "—"), n(row[1])] as [string, number])
    : [];

const asWeekdays = (v: unknown): WeekdayBucket[] =>
  Array.isArray(v)
    ? v.map((w: any) => ({ dow: n(w?.dow), orders: n(w?.orders), revenue: n(w?.revenue) }))
    : [];

const asTopClients = (v: unknown): TopClient[] =>
  Array.isArray(v)
    ? v.map((c: any) => ({
        client_id: String(c?.client_id ?? ""),
        full_name: c?.full_name ?? null,
        total_orders: n(c?.total_orders),
        total_spent: n(c?.total_spent),
        last_order_at: c?.last_order_at,
      }))
    : [];

const asOrders = (v: unknown): DetailOrder[] =>
  Array.isArray(v)
    ? v.map((o: any) => ({
        id: String(o?.id ?? ""),
        acquired_at: o?.acquired_at,
        client_id: o?.client_id ?? null,
        client_name: o?.client_name ?? null,
        marketplace: o?.marketplace ?? null,
        product: o?.product ?? null,
        total_amount: n(o?.total_amount),
        order_status: o?.order_status ?? null,
      }))
    : [];

const asMonthly = (v: unknown): MonthlyPoint[] =>
  Array.isArray(v)
    ? v.map((m: any) => ({
        ym: String(m?.ym ?? ""),
        label: String(m?.label ?? ""),
        orders: n(m?.orders),
        revenue: n(m?.revenue),
      }))
    : [];

const asVariation = (v: any): VariationVsPrevious | null =>
  v
    ? {
        prev_orders: n(v.prev_orders),
        prev_revenue: n(v.prev_revenue),
        // null é informação: sem base anterior, "0%" mentiria.
        orders_variation_pct: v.orders_variation_pct === null ? null : n(v.orders_variation_pct),
        revenue_variation_pct: v.revenue_variation_pct === null ? null : n(v.revenue_variation_pct),
      }
    : null;

const asBase = (d: any) => ({
  total_orders: n(d?.total_orders),
  total_revenue: n(d?.total_revenue),
  unique_clients: n(d?.unique_clients),
  avg_ticket: n(d?.avg_ticket),
  first_order_at: d?.first_order_at ?? null,
  last_order_at: d?.last_order_at ?? null,
  marketplaces: asPairs(d?.marketplaces),
  weekday_breakdown: asWeekdays(d?.weekday_breakdown),
  shift_breakdown: {
    madrugada: n(d?.shift_breakdown?.madrugada),
    manha: n(d?.shift_breakdown?.manha),
    tarde: n(d?.shift_breakdown?.tarde),
    noite: n(d?.shift_breakdown?.noite),
  },
  top_clients: asTopClients(d?.top_clients),
  recent_orders: asOrders(d?.recent_orders),
  monthly_evolution: asMonthly(d?.monthly_evolution),
  variation_vs_previous: asVariation(d?.variation_vs_previous),
});

// ---------------------------------------------------------------------------
// Detalhe do produto
// ---------------------------------------------------------------------------

export interface DetailArgs {
  sellerId: string | null | undefined;
  /** Loja (`orders.marketplace`) travada pelo filtro da página; null = todas. */
  marketplace?: string | null;
  from?: string | null;
  to?: string | null;
  compareFrom?: string | null;
  compareTo?: string | null;
  enabled?: boolean;
}

export function useProductDetailStats({
  sellerId,
  productKey,
  marketplace = null,
  from = null,
  to = null,
  compareFrom = null,
  compareTo = null,
  enabled = true,
}: DetailArgs & { productKey: string | null }) {
  return useQuery<ProductDetailStats | null>({
    queryKey: [
      "product-detail-stats",
      sellerId,
      productKey,
      marketplace,
      from,
      to,
      compareFrom,
      compareTo,
    ],
    enabled: enabled && !!sellerId && !!productKey,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_product_detail_stats", {
        p_seller_id: sellerId,
        // A RPC normaliza sozinha (`public.product_key`), então tanto faz vir a
        // chave do ranking ou o nome cru do pedido. Não existe normalização em
        // TS nesta base — de propósito: duas implementações divergem e o sheet
        // volta zerado quando divergem.
        p_product_key: productKey,
        p_marketplace: marketplace,
        p_from: from,
        p_to: to,
        p_compare_from: compareFrom,
        p_compare_to: compareTo,
      });

      if (error) throw error;
      if (!data) return null;

      const d = data as any;
      return {
        ...asBase(d),
        key: String(d.key ?? productKey ?? ""),
        name: d.name ?? productKey ?? "",
        display_name: d.display_name ?? null,
        product_id: d.product_id ?? null,
        sku: d.sku ?? null,
        sku_annotated: d.sku_annotated ?? null,
        active: d.active ?? true,
        category: d.category ?? null,
        category_comparison: d.category_comparison
          ? {
              category_name: d.category_comparison.category_name,
              category_avg_orders: n(d.category_comparison.category_avg_orders),
              category_avg_revenue: n(d.category_comparison.category_avg_revenue),
              this_product_orders: n(d.category_comparison.this_product_orders),
              this_product_revenue: n(d.category_comparison.this_product_revenue),
              position_in_category: n(d.category_comparison.position_in_category),
              total_in_category: n(d.category_comparison.total_in_category),
            }
          : null,
      } satisfies ProductDetailStats;
    },
  });
}

// ---------------------------------------------------------------------------
// Detalhe da categoria
// ---------------------------------------------------------------------------

export function useCategoryDetailStats({
  sellerId,
  categoryId,
  marketplace = null,
  from = null,
  to = null,
  compareFrom = null,
  compareTo = null,
  enabled = true,
}: DetailArgs & { categoryId: string | null }) {
  return useQuery<CategoryDetailStats | null>({
    queryKey: [
      "category-detail-stats",
      sellerId,
      categoryId,
      marketplace,
      from,
      to,
      compareFrom,
      compareTo,
    ],
    enabled: enabled && !!sellerId && !!categoryId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_category_detail_stats", {
        p_seller_id: sellerId,
        p_category_id: categoryId,
        p_marketplace: marketplace,
        p_from: from,
        p_to: to,
        p_compare_from: compareFrom,
        p_compare_to: compareTo,
      });

      if (error) throw error;
      if (!data) return null;

      const d = data as any;
      const ranking: CategoryProductRank[] = Array.isArray(d.products_ranking)
        ? d.products_ranking.map((r: any) => ({
            key: String(r?.key ?? ""),
            name: r?.name ?? "",
            orders: n(r?.orders),
            revenue: n(r?.revenue),
            ticket: n(r?.ticket),
          }))
        : [];

      return {
        ...asBase(d),
        category: d.category ?? null,
        product_count: n(d.product_count),
        products_ranking: ranking,
      } satisfies CategoryDetailStats;
    },
  });
}

// ---------------------------------------------------------------------------
// Escrita
// ---------------------------------------------------------------------------

/**
 * Categoriza produtos pelo NOME. O frontend nunca conhece o uuid do produto: a
 * linha em `products` é anotação e pode nem existir ainda — a RPC faz
 * `ON CONFLICT (seller_id, name_key)` e cria na hora.
 *
 * `categoryId = null` remove a categoria.
 */
export async function setProductsCategory(
  sellerId: string,
  productNames: string[],
  categoryId: string | null,
): Promise<number> {
  const { data, error } = await (supabase as any).rpc("set_products_category", {
    p_seller_id: sellerId,
    p_product_names: productNames,
    p_category_id: categoryId,
  });
  if (error) throw error;
  return n(data);
}

/**
 * Fonte única do que uma escrita de produto invalida — a lista, o detalhe do
 * produto e o da categoria (categorizar muda os três). Quem grava de qualquer
 * tela chama isto, para nenhuma delas esquecer uma das três.
 */
export function invalidateProdutoQueries(qc: QueryClient) {
  ["product-stats", "product-detail-stats", "category-detail-stats"].forEach((k) =>
    qc.invalidateQueries({ queryKey: [k] }),
  );
}
