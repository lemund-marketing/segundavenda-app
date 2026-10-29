import { useQuery } from "@tanstack/react-query";
import { callRpc, callRpcScalar, num, str, type RpcRow } from "./rpc";

/** Uma linha por UF com pedido no período. UF sem venda não volta da RPC. */
export interface RegionRow {
  uf: string;
  regiao: string | null;
  orders: number;
  revenue: number;
  clients: number;
  second_sale_orders: number;
  second_sale_revenue: number;
  second_sale_rate: number;
  avg_ticket: number;
  top_city: string | null;
  top_city_orders: number;
}

export function useRegioes(
  sellerIds: string[],
  startDate: Date,
  endDate: Date,
  /** Slug do marketplace para recortar o mapa (aba Dashboard da loja). Null = tudo. */
  marketplace: string | null = null,
) {
  return useQuery<RegionRow[]>({
    queryKey: [
      "regioes-overview",
      sellerIds.join(","),
      startDate.toDateString(),
      endDate.toDateString(),
      marketplace,
    ],
    enabled: sellerIds.length > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const rows = await callRpc("get_regions_overview", {
        _seller_ids: sellerIds,
        _start: startDate.toISOString(),
        _end: endDate.toISOString(),
        ...(marketplace ? { _marketplace: marketplace } : {}),
      });
      return rows.map((r: RpcRow) => ({
        uf: String(r.uf ?? ""),
        regiao: str(r.regiao),
        orders: num(r.orders),
        revenue: num(r.revenue),
        clients: num(r.clients),
        second_sale_orders: num(r.second_sale_orders),
        second_sale_revenue: num(r.second_sale_revenue),
        second_sale_rate: num(r.second_sale_rate),
        avg_ticket: num(r.avg_ticket),
        top_city: str(r.top_city),
        top_city_orders: num(r.top_city_orders),
      }));
    },
  });
}

/* -------------------------------------------------------------------------
 * Detalhe de um estado — payload do sheet da aba Regiões
 * ---------------------------------------------------------------------- */

export interface StateCity {
  city: string;
  orders: number;
  revenue: number;
  clients: number;
}
export interface StateProduct {
  name: string;
  orders: number;
  revenue: number;
}
export interface StateClient {
  client_id: string;
  name: string;
  orders: number;
  revenue: number;
  last_order_at: string | null;
}
export interface StateChannel {
  name: string;
  orders: number;
  revenue: number;
}
export interface StateWeekday {
  dow: number;
  orders: number;
  revenue: number;
}
export interface StateMonth {
  month: string;
  orders: number;
  revenue: number;
}

export interface StateDetail {
  uf: string;
  regiao: string | null;
  orders: number;
  revenue: number;
  clients: number;
  avg_ticket: number;
  orders_per_client: number;
  national: {
    avg_ticket: number;
    orders_per_client: number;
    orders: number;
    revenue: number;
  };
  share_orders_pct: number;
  share_revenue_pct: number;
  top_cities: StateCity[];
  top_products: StateProduct[];
  top_clients: StateClient[];
  marketplaces: StateChannel[];
  weekday: StateWeekday[];
  revenue_evolution: StateMonth[];
}

/**
 * Um payload só para o sheet inteiro. Abrir um estado dispararia seis
 * requisições se cada bloco tivesse a sua.
 */
export function useStateDetail(
  sellerIds: string[],
  uf: string | null,
  startDate: Date,
  endDate: Date,
) {
  return useQuery<StateDetail | null>({
    queryKey: [
      "state-detail",
      sellerIds.join(","),
      uf ?? "",
      startDate.toDateString(),
      endDate.toDateString(),
    ],
    enabled: sellerIds.length > 0 && !!uf,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const d = await callRpcScalar<StateDetail>("get_state_detail", {
        _seller_ids: sellerIds,
        _uf: uf,
        _start: startDate.toISOString(),
        _end: endDate.toISOString(),
      });
      if (!d) return null;
      return {
        ...d,
        orders: num(d.orders),
        revenue: num(d.revenue),
        clients: num(d.clients),
        avg_ticket: num(d.avg_ticket),
        orders_per_client: num(d.orders_per_client),
        national: {
          avg_ticket: num(d.national?.avg_ticket),
          orders_per_client: num(d.national?.orders_per_client),
          orders: num(d.national?.orders),
          revenue: num(d.national?.revenue),
        },
        share_orders_pct: num(d.share_orders_pct),
        share_revenue_pct: num(d.share_revenue_pct),
        top_cities: (d.top_cities ?? []).map((c) => ({
          city: String(c.city ?? ""),
          orders: num(c.orders),
          revenue: num(c.revenue),
          clients: num(c.clients),
        })),
        top_products: (d.top_products ?? []).map((p) => ({
          name: String(p.name ?? ""),
          orders: num(p.orders),
          revenue: num(p.revenue),
        })),
        top_clients: (d.top_clients ?? []).map((c) => ({
          client_id: String(c.client_id ?? ""),
          name: String(c.name ?? "Sem nome"),
          orders: num(c.orders),
          revenue: num(c.revenue),
          last_order_at: str(c.last_order_at),
        })),
        marketplaces: (d.marketplaces ?? []).map((m) => ({
          name: String(m.name ?? "other"),
          orders: num(m.orders),
          revenue: num(m.revenue),
        })),
        weekday: (d.weekday ?? []).map((w) => ({
          dow: num(w.dow),
          orders: num(w.orders),
          revenue: num(w.revenue),
        })),
        revenue_evolution: (d.revenue_evolution ?? []).map((m) => ({
          month: String(m.month ?? ""),
          orders: num(m.orders),
          revenue: num(m.revenue),
        })),
      };
    },
  });
}
