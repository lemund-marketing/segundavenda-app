import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { pedidosRpcArgs, type PedidosDataFilters } from "@/hooks/usePedidosKpis";

/** 'store' e 'marketplace' agrupam a MESMA coluna (`orders.marketplace`) — ver a migration. */
export type PedidosGroupBy = "day" | "shift" | "store" | "marketplace" | "state";

export interface PedidosChartRow {
  /** '2026-07-28' | 'tarde' | 'mercado_livre' | 'SP' */
  bucket: string;
  ord: number;
  pedidos: number;
  receita: number;
}

/**
 * Acima disso o balde de "Por Dia" vira MÊS — o mesmo corte que a RPC faz.
 * Os dois números têm de andar juntos: é ele que decide se o rótulo do eixo é
 * "28/07" ou "jul/26".
 */
export const DAY_BUCKET_MAX_DAYS = 400;

const CHART_STALE_TIME = 5 * 60_000;

/**
 * Uma série por dimensão, agregada no banco. As duas métricas (pedidos e
 * receita) vêm na mesma linha, então alternar Pedidos/Receita no card não
 * refaz request — e trocar de aba e voltar também não, por causa do cache.
 */
export function usePedidosChart(
  sellerId: string | null | undefined,
  start: string,
  end: string,
  groupBy: PedidosGroupBy,
  filters: PedidosDataFilters = {},
) {
  const args = sellerId
    ? { ...pedidosRpcArgs(sellerId, start, end, filters), _group_by: groupBy }
    : null;

  return useQuery<PedidosChartRow[]>({
    queryKey: ["pedidos-chart", args && JSON.stringify(args)],
    enabled: !!sellerId && !!start && !!end,
    staleTime: CHART_STALE_TIME,
    queryFn: async (): Promise<PedidosChartRow[]> => {
      const { data, error } = await (supabase as any).rpc("get_pedidos_chart_series", args);
      if (error) throw error;
      return ((data ?? []) as any[]).map((row) => ({
        bucket: String(row.bucket ?? ""),
        ord: Number(row.ord ?? 0),
        pedidos: Number(row.pedidos ?? 0),
        receita: Number(row.receita ?? 0),
      }));
    },
  });
}
