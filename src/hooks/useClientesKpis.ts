import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { ClientesFilterPayload } from "@/components/clients/clientesFilters";

export interface ClientesKpis {
  total_clients: number;
  avg_ticket: number;
  avg_ltv: number;
  one_time_clients: number;
  birthday_today: number;
  active_conv: number;
}

const EMPTY_KPIS: ClientesKpis = {
  total_clients: 0,
  avg_ticket: 0,
  avg_ltv: 0,
  one_time_clients: 0,
  birthday_today: 0,
  active_conv: 0,
};

// Janela de conversa ativa: 24h é a regra da Meta, não uma preferência do usuário.
const WINDOW_HOURS = 24;

/** Chave estável para o react-query: o payload é montado sempre na mesma ordem. */
export const filtersKey = (f: ClientesFilterPayload): string => JSON.stringify(f ?? {});

/**
 * KPIs do topo da página de Clientes, numa RPC só.
 *
 * `filters` é o payload inteiro do recorte (período, busca, UF, tudo que o sheet
 * "Mais filtros" edita). Os argumentos legados vão nulos de propósito: o banco
 * funde argumento e jsonb numa fonte de verdade só, e mandar o mesmo filtro
 * pelos dois caminhos é como card e rodapé passam a discordar.
 */
export function useClientesKpis(
  sellerId: string | null | undefined,
  periodStart: string,
  filters: ClientesFilterPayload = {},
) {
  return useQuery<ClientesKpis>({
    queryKey: ["clientes-kpis", sellerId, periodStart, filtersKey(filters)],
    enabled: !!sellerId,
    staleTime: 60_000,
    queryFn: async (): Promise<ClientesKpis> => {
      const { data, error } = await (supabase as any).rpc("get_clientes_kpis", {
        _seller_id: sellerId,
        _period_start: periodStart,
        _min_orders: 0,
        _window_hours: WINDOW_HOURS,
        _state_code: null,
        _search: null,
        _rfv_segments: null,
        _filters: filters,
      });
      if (error) throw error;
      if (!data) return EMPTY_KPIS;

      const raw = data as Record<string, unknown>;
      return {
        total_clients: Number(raw.total_clients ?? 0),
        avg_ticket: Number(raw.avg_ticket ?? 0),
        avg_ltv: Number(raw.avg_ltv ?? 0),
        one_time_clients: Number(raw.one_time_clients ?? 0),
        birthday_today: Number(raw.birthday_today ?? 0),
        active_conv: Number(raw.active_conv ?? 0),
      };
    },
  });
}
