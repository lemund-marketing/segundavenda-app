import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { callRpc, callRpcScalar, num, str, type RpcRow } from "./rpc";

/**
 * Hooks do dashboard. Toda agregação acontece no banco — nada de baixar mil
 * pedidos e somar no browser, que era como a versão anterior produzia número
 * errado em seller grande.
 *
 * Nada aqui expõe métrica de recompra. `orders.is_second_sale` marca que o
 * pedido é de cliente que já comprou, mas não que a Segunda Venda causou a
 * recompra; usar isso como indicador de resultado afirma uma atribuição que o
 * dado não sustenta.
 */

export interface DashboardOverview {
  total_orders: number;
  total_revenue: number;
  unique_clients: number;
  avg_ticket: number;
  prev_total_orders: number;
  prev_total_revenue: number;
  prev_unique_clients: number;
  prev_avg_ticket: number;
}

export interface RevenuePoint {
  bucket: string;
  granularity: "day" | "week" | "month";
  orders: number;
  revenue: number;
}

export interface MarketplaceRow {
  marketplace: string;
  total_orders: number;
  prev_orders: number;
  total_revenue: number;
  prev_revenue: number;
  unique_clients: number;
  last_order_at: string | null;
}

export interface CrmStage {
  id: string;
  name: string;
  position: number;
  color: string;
  stage_type: string | null;
  clients: number;
  value: number;
}

export interface CrmFunnel {
  stages: CrmStage[];
  no_stage: number;
  total_base: number;
}

export interface RecentOrder {
  id: string;
  total_amount: number;
  product: string;
  marketplace: string;
  acquired_at: string;
  client_id?: string;
  /** A RPC devolve o status; o card do celular mostra quando não é "approved". */
  order_status?: string | null;
  /** city/state_code entraram na RPC em 28/08 para o bloco de últimos pedidos
   *  mostrar "Cidade — UF", como a lista da aba Pedidos. Podem vir nulos.
   *  whatsapp/email já vinham no mesmo objeto e alimentam os atalhos do card. */
  clients?: {
    full_name?: string;
    city?: string | null;
    state_code?: string | null;
    whatsapp?: string | null;
    email?: string | null;
  };
}

/**
 * Janela do período selecionado. Ancorada no dia (não no instante) para o
 * queryKey não mudar a cada render e derrubar o cache do React Query.
 */
export function usePeriodRange(days: string | number) {
  const d = Number(days) || 30;
  return useMemo(() => {
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    const start = new Date(end);
    start.setDate(start.getDate() - d);
    start.setHours(0, 0, 0, 0);
    return { startDate: start, endDate: end, days: d };
  }, [d]);
}

interface RangeArgs {
  sellerIds: string[];
  startDate: Date;
  endDate: Date;
}

const rangeKey = ({ sellerIds, startDate, endDate }: RangeArgs) => [
  sellerIds.join(","),
  startDate.toDateString(),
  endDate.toDateString(),
];

const rangeArgs = ({ sellerIds, startDate, endDate }: RangeArgs) => ({
  _seller_ids: sellerIds,
  _start: startDate.toISOString(),
  _end: endDate.toISOString(),
});

export function useDashboardOverview(range: RangeArgs) {
  return useQuery<DashboardOverview | null>({
    queryKey: ["dash-overview", ...rangeKey(range)],
    enabled: range.sellerIds.length > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const rows = await callRpc("get_dashboard_overview", rangeArgs(range));
      const r = rows[0];
      if (!r) return null;
      // A RPC ainda devolve os campos de 2ª venda; a tela ignora todos.
      return {
        total_orders: num(r.total_orders),
        total_revenue: num(r.total_revenue),
        unique_clients: num(r.unique_clients),
        avg_ticket: num(r.avg_ticket),
        prev_total_orders: num(r.prev_total_orders),
        prev_total_revenue: num(r.prev_total_revenue),
        prev_unique_clients: num(r.prev_unique_clients),
        prev_avg_ticket: num(r.prev_avg_ticket),
      };
    },
  });
}

/**
 * Série de faturamento. Soma as duas parcelas que a RPC separa.
 * `ativo` deixa quem só precisa dela em um caso (o gráfico do Dashboard do
 * celular) não pagar a consulta nos outros.
 */
export function useRevenueTimeseries(range: RangeArgs, ativo = true) {
  return useQuery<RevenuePoint[]>({
    queryKey: ["dash-revenue-ts", ...rangeKey(range)],
    enabled: ativo && range.sellerIds.length > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const rows = await callRpc("get_dashboard_revenue_timeseries", rangeArgs(range));
      return rows.map((r: RpcRow) => ({
        bucket: String(r.bucket ?? ""),
        granularity: (r.granularity as RevenuePoint["granularity"]) ?? "day",
        orders: num(r.first_sale_orders) + num(r.second_sale_orders),
        revenue: num(r.first_sale_revenue) + num(r.second_sale_revenue),
      }));
    },
  });
}

/** Funil do Kanban CRM: fases com nome, cor e contagem. */
export function useCrmFunnel(sellerIds: string[]) {
  return useQuery<CrmFunnel | null>({
    queryKey: ["dash-crm-funnel", sellerIds.join(",")],
    enabled: sellerIds.length > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const d = await callRpcScalar<CrmFunnel>("get_dashboard_crm_funnel", {
        _seller_ids: sellerIds,
      });
      if (!d) return null;
      return {
        stages: (d.stages ?? []).map((s) => ({
          id: String(s.id),
          name: String(s.name ?? ""),
          position: num(s.position),
          color: String(s.color ?? "#94a3b8"),
          stage_type: s.stage_type ?? null,
          clients: num(s.clients),
          value: num(s.value),
        })),
        no_stage: num(d.no_stage),
        total_base: num(d.total_base),
      };
    },
  });
}

/**
 * Lojas (marketplaces) do período. RPC antiga, assinatura de seller único —
 * o dashboard sempre opera sobre a loja ativa, então serve.
 */
export function useTopMarketplaces(range: RangeArgs) {
  return useQuery<MarketplaceRow[]>({
    queryKey: ["dash-marketplaces", ...rangeKey(range)],
    enabled: range.sellerIds.length > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const rows = await callRpc("get_marketplace_metrics", {
        _seller_id: range.sellerIds[0],
        _start: range.startDate.toISOString(),
        _end: range.endDate.toISOString(),
      });
      return rows
        .map((r: RpcRow) => ({
          marketplace: String(r.marketplace ?? ""),
          total_orders: num(r.total_orders),
          prev_orders: num(r.prev_orders),
          total_revenue: num(r.total_revenue),
          prev_revenue: num(r.prev_revenue),
          unique_clients: num(r.unique_clients),
          last_order_at: str(r.last_order_at),
        }))
        .sort((a, b) => b.total_revenue - a.total_revenue);
    },
  });
}

/**
 * Últimos pedidos via RPC dedicada. O embed PostgREST equivalente
 * (`orders?select=*,clients(...)`) estoura o timeout em seller grande.
 * Assinatura antiga (`_start_date`/`_end_date`), diferente das RPCs novas.
 */
export function useRecentOrders(range: RangeArgs, limit = 100) {
  return useQuery<RecentOrder[]>({
    queryKey: ["dash-recent-orders", ...rangeKey(range), limit],
    enabled: range.sellerIds.length > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const rows = await callRpc("get_dashboard_recent_orders", {
        _seller_ids: range.sellerIds,
        _start_date: range.startDate.toISOString(),
        _end_date: range.endDate.toISOString(),
        _limit: limit,
      });
      return rows as unknown as RecentOrder[];
    },
  });
}
