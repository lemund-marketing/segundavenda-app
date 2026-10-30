import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface PipelineMetrics {
  /** Vínculos em client_pipeline — NÃO o total de clientes do seller. */
  total: number;
  byStage: Record<string, number>;
  avgDays: number;
  stuckCount: number;
  /** Clientes do seller sem nenhuma linha em client_pipeline. */
  noStageCount: number;
}

export interface KanbanFilterOptions {
  marketplaces: string[];
  stores: { id: string; name: string; platform: string | null }[];
  states: string[];
}

/**
 * Uma chamada por seller, agregada no servidor.
 * Os KPIs são do funil inteiro e de propósito NÃO acompanham a barra de
 * filtros (igual ao Segundo Pedido) — o card de distribuição explica isso.
 */
export function usePipelineMetrics(sellerId: string | undefined, enabled = true) {
  return useQuery<PipelineMetrics>({
    queryKey: ["crm-metrics", sellerId],
    enabled: !!sellerId && enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_pipeline_metrics", {
        _seller_id: sellerId,
      });
      if (error) throw error;
      const m = (data ?? {}) as any;
      return {
        total: Number(m.total ?? 0),
        byStage: (m.by_stage ?? {}) as Record<string, number>,
        avgDays: Number(m.avg_days ?? 0),
        stuckCount: Number(m.stuck_count ?? 0),
        noStageCount: Number(m.no_stage_count ?? 0),
      };
    },
  });
}

export function useKanbanFilterOptions(sellerId: string | undefined, enabled = true) {
  return useQuery<KanbanFilterOptions>({
    queryKey: ["crm-filter-options", sellerId],
    enabled: !!sellerId && enabled,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_kanban_filter_options", {
        _seller_id: sellerId,
      });
      if (error) throw error;
      const o = (data ?? {}) as any;
      return {
        marketplaces: (o.marketplaces ?? []) as string[],
        stores: (o.stores ?? []) as KanbanFilterOptions["stores"],
        states: (o.states ?? []) as string[],
      };
    },
  });
}
