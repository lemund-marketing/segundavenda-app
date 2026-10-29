import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Recorte da tela de Pedidos. O MESMO objeto alimenta os KPIs, o gráfico e
 * (quando a barra de filtros migrar) a lista — card e rodapé discordarem é o
 * bug que já aconteceu em Clientes.
 */
export interface PedidosDataFilters {
  /** valores crus de `orders.marketplace`; vazio = todas as lojas */
  marketplaces?: string[] | null;
  /** UF de `clients.state_code`; "all"/null = todas */
  stateCode?: string | null;
  /** `orders.order_status` cru; "all"/null = todos */
  orderStatus?: string | null;
  /** deep-link ?cliente= */
  clientId?: string | null;
  isSecondSale?: boolean | null;
  minAmount?: number | null;
  maxAmount?: number | null;
  whatsapp?: "yes" | "no" | null;
  search?: string | null;
  /** cancelado/reembolsado fica fora por padrão, como na /lojas */
  includeCancelled?: boolean;
  /** UFs (multi, do sheet). Quando presente, VENCE `stateCode` — regra do banco. */
  stateCodes?: string[] | null;
  /** grafia exata do banco (opções vêm da faceta) */
  cities?: string[] | null;
  /** 'cpf' | 'cnpj' (minúsculas) */
  documentTypes?: string[] | null;
  /** 'male' | 'female' | 'unknown' — normalização genero_norm */
  genders?: string[] | null;
  /** prefixos de CEP, só dígitos */
  cepPrefixes?: string[] | null;
  productText?: string | null;
  /** 'contains' | 'not-contains' | 'starts-with' | 'ends-with' | 'exact' */
  productOperator?: string | null;
}

export interface PedidosKpis {
  total_orders: number;
  prev_orders: number;
  total_revenue: number;
  prev_revenue: number;
  avg_ticket: number;
  prev_avg_ticket: number;
  second_sale_orders: number;
  second_sale_pct: number;
  orders_today: number;
  new_clients: number;
  prev_new_clients: number;
  /** Taxa de recompra por CLIENTE: dos que compraram no período, % com primeiro pedido anterior à janela. */
  period_clients: number;
  repeat_clients: number;
  repurchase_rate: number;
}

const EMPTY: PedidosKpis = {
  total_orders: 0,
  prev_orders: 0,
  total_revenue: 0,
  prev_revenue: 0,
  avg_ticket: 0,
  prev_avg_ticket: 0,
  second_sale_orders: 0,
  second_sale_pct: 0,
  orders_today: 0,
  new_clients: 0,
  prev_new_clients: 0,
  period_clients: 0,
  repeat_clients: 0,
  repurchase_rate: 0,
};

const norm = (v: string | null | undefined) => {
  const s = (v ?? "").trim();
  return s && s !== "all" ? s : null;
};

/** Argumentos das RPCs de Pedidos — um lugar só, para KPI e gráfico nunca divergirem. */
export function pedidosRpcArgs(
  sellerId: string,
  start: string,
  end: string,
  f: PedidosDataFilters,
): Record<string, unknown> {
  return {
    _seller_id: sellerId,
    _start: start,
    _end: end,
    _marketplaces: f.marketplaces?.length ? f.marketplaces : null,
    _state_code: norm(f.stateCode),
    _order_status: norm(f.orderStatus),
    _client_id: f.clientId || null,
    _is_second_sale: typeof f.isSecondSale === "boolean" ? f.isSecondSale : null,
    _min_amount: typeof f.minAmount === "number" ? f.minAmount : null,
    _max_amount: typeof f.maxAmount === "number" ? f.maxAmount : null,
    _whatsapp: f.whatsapp ?? null,
    _search: norm(f.search),
    _include_cancelled: !!f.includeCancelled,
    _state_codes: f.stateCodes?.length ? f.stateCodes : null,
    _cities: f.cities?.length ? f.cities : null,
    _document_types: f.documentTypes?.length ? f.documentTypes : null,
    _genders: f.genders?.length ? f.genders : null,
    _cep_prefixes: f.cepPrefixes?.length ? f.cepPrefixes : null,
    // `norm()` NÃO serve aqui: ele devolve null para o literal "all", que é
    // sentinela de select (stateCode/orderStatus) e não de campo livre — quem
    // digitasse "all" (começando "All Star") filtrava a lista e não filtrava os
    // cards. Texto livre só vira null quando está vazio.
    _product_text: f.productText?.trim() || null,
    _product_operator: f.productText?.trim() ? (f.productOperator || "contains") : null,
  };
}

/** Os 6 KPIs do topo, em uma chamada. Agregação no banco — são milhares de pedidos. */
export function usePedidosKpis(
  sellerId: string | null | undefined,
  start: string,
  end: string,
  filters: PedidosDataFilters = {},
) {
  const args = sellerId ? pedidosRpcArgs(sellerId, start, end, filters) : null;

  return useQuery<PedidosKpis>({
    queryKey: ["pedidos-kpis", args && JSON.stringify(args)],
    enabled: !!sellerId && !!start && !!end,
    staleTime: 60_000,
    queryFn: async (): Promise<PedidosKpis> => {
      // `types.ts` não conhece a RPC nova; o cast é o padrão dos hooks de Clientes.
      const { data, error } = await (supabase as any).rpc("get_pedidos_kpis", args);
      if (error) throw error;
      if (!data) return EMPTY;

      const raw = data as Record<string, unknown>;
      return {
        total_orders: Number(raw.total_orders ?? 0),
        prev_orders: Number(raw.prev_orders ?? 0),
        total_revenue: Number(raw.total_revenue ?? 0),
        prev_revenue: Number(raw.prev_revenue ?? 0),
        avg_ticket: Number(raw.avg_ticket ?? 0),
        prev_avg_ticket: Number(raw.prev_avg_ticket ?? 0),
        second_sale_orders: Number(raw.second_sale_orders ?? 0),
        second_sale_pct: Number(raw.second_sale_pct ?? 0),
        orders_today: Number(raw.orders_today ?? 0),
        new_clients: Number(raw.new_clients ?? 0),
        prev_new_clients: Number(raw.prev_new_clients ?? 0),
        period_clients: Number(raw.period_clients ?? 0),
        repeat_clients: Number(raw.repeat_clients ?? 0),
        repurchase_rate: Number(raw.repurchase_rate ?? 0),
      };
    },
  });
}
