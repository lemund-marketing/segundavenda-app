import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ProductCategory {
  id: string;
  name: string;
  color: string;
  created_at: string;
}

export interface ProductStats {
  /**
   * Identidade do produto na tela: a chave normalizada que `public.product_key`
   * calcula a partir de `orders.product`. NÃO é um uuid — a linha em `products`
   * (que tem uuid) só nasce quando alguém categoriza/edita o produto.
   */
  key: string;
  /**
   * Grafia mais FREQUENTE dos pedidos, já sem espaço solto. Só ela pode ir para
   * as RPCs de escrita: é o que gera `products.name_key`.
   */
  name: string;
  /** Apelido do vendedor, quando existe. */
  display_name: string | null;
  /** uuid da anotação em `products`, ou null se ninguém anotou nada ainda. */
  product_id: string | null;
  /** O que a tela MOSTRA: a anotação, senão o SKU que veio nos pedidos. */
  sku: string | null;
  /**
   * Só a anotação. É este o valor que volta para `set_product_fields` — mandar
   * `sku` congelaria como anotação um SKU que o vendedor nunca digitou.
   */
  sku_annotated: string | null;
  active: boolean;
  category_id: string | null;
  category_name: string | null;
  category_color: string | null;
  total_orders: number;
  total_revenue: number;
  unique_clients: number;
  /**
   * Estreia e última venda REAIS do produto: sem recorte de período e sem
   * recorte de loja. Descrevem o produto, não a fatia — é o que sustenta os
   * status "Novo"/"Parado"/"Inativo".
   */
  first_order_at: string | null;
  last_order_at: string | null;
  main_marketplace: string | null;
  prev_orders: number;
  prev_revenue: number;
  shift_breakdown: { shift: string; count: number }[];
}

interface UseProductStatsArgs {
  sellerId: string | null | undefined;
  from: string;
  to: string;
  prevFrom: string;
  /** Recorte de loja = orders.marketplace. null = todas. */
  marketplace: string | null;
}

/**
 * A lista de produtos é derivada de `orders` na hora, e o join com a anotação
 * (`products` / `product_categories`) acontece dentro da RPC. Não existe
 * normalização de nome no cliente: a única implementação é `public.product_key`.
 *
 * A RPC devolve o CATÁLOGO INTEIRO do vendedor (recortado só pela loja), com as
 * métricas recortadas pela janela — produto sem venda no período vem com zeros.
 * É o que permite o banner de categorização, o "% do catálogo" e o card
 * "Inativos (30d+)" falarem do catálogo e não do mês.
 */
export function useProductStats({ sellerId, from, to, prevFrom, marketplace }: UseProductStatsArgs) {
  return useQuery({
    queryKey: ["product-stats", sellerId, from, to, prevFrom, marketplace],
    enabled: !!sellerId,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<ProductStats[]> => {
      if (!sellerId) return [];

      const { data, error } = await (supabase as any).rpc("get_product_ranking_stats", {
        p_seller_id: sellerId,
        p_from: from,
        p_to: to,
        p_prev_from: prevFrom,
        p_marketplace: marketplace,
      });
      if (error) throw error;

      const rows = (data as any[] | null) ?? [];
      return rows.map((row: any): ProductStats => ({
        key: row.key,
        name: row.name,
        display_name: row.display_name ?? null,
        product_id: row.product_id ?? null,
        sku: row.sku ?? null,
        sku_annotated: row.sku_annotated ?? null,
        active: row.active ?? true,
        category_id: row.category_id ?? null,
        category_name: row.category_name ?? null,
        category_color: row.category_color ?? null,
        total_orders: Number(row.total_orders) || 0,
        total_revenue: Number(row.total_revenue) || 0,
        unique_clients: Number(row.unique_clients) || 0,
        first_order_at: row.first_order_at ?? null,
        last_order_at: row.last_order_at ?? null,
        main_marketplace: row.main_marketplace ?? null,
        prev_orders: Number(row.prev_orders) || 0,
        prev_revenue: Number(row.prev_revenue) || 0,
        shift_breakdown: (row.shift_breakdown ?? []) as { shift: string; count: number }[],
      }));
    },
  });
}

/**
 * Lojas do CATÁLOGO — as lojas em que o vendedor já vendeu algo com título de
 * produto.
 *
 * Não sai de `get_marketplace_metrics`: aquela RPC conta todo pedido
 * não-cancelado, inclusive os que não têm `orders.product`. Medido nesta base:
 * o seller ef89ba77 tem 452 pedidos na loja `retroativo` e ZERO com produto —
 * a loja aparecia no seletor e escolhê-la deixava a página inteira vazia, com
 * o mesmo texto do vazio legítimo. Também não sai do ranking: lá cada produto
 * traz só a loja DOMINANTE, e uma loja que nunca é a dominante de ninguém
 * sumiria do seletor (4 sellers desta base).
 *
 * Sem recorte de data, igual ao catálogo.
 */
export function useAvailableMarketplaces(sellerId: string | null | undefined) {
  return useQuery({
    queryKey: ["product-available-marketplaces", sellerId],
    enabled: !!sellerId,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<string[]> => {
      if (!sellerId) return [];
      const { data, error } = await (supabase as any).rpc("get_product_marketplaces", {
        p_seller_id: sellerId,
      });
      if (error) throw error;
      return ((data as string[] | null) ?? []).filter(Boolean).map(String);
    },
  });
}

export function useProductCategories(sellerId: string | null | undefined) {
  return useQuery({
    queryKey: ["product-categories", sellerId],
    enabled: !!sellerId,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<ProductCategory[]> => {
      if (!sellerId) return [];
      const { data, error } = await (supabase as any)
        .from("product_categories")
        .select("id, name, color, created_at")
        .eq("seller_id", sellerId)
        .order("name");
      if (error) throw error;
      return (data ?? []) as ProductCategory[];
    },
  });
}
