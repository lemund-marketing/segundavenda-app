import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ClientExtras {
  store_key: string | null;
  store_name: string | null;
  extra_stores: number;
  stage_name: string | null;
  stage_color: string | null;
  rfv_segment: string | null;
  city: string | null;
}

interface ClientExtrasRow extends ClientExtras {
  client_id: string;
}

/**
 * Dados de apoio (loja, fase do Kanban, RFV, cidade) dos clientes da página
 * atual. Buscado depois da lista, só para os ids visíveis.
 */
export function useClientesPageExtras(
  sellerId: string | null | undefined,
  clientIds: string[],
) {
  return useQuery<Record<string, ClientExtras>>({
    queryKey: ["clientes-extras", sellerId, clientIds.join(",")],
    enabled: !!sellerId && clientIds.length > 0,
    staleTime: 60_000,
    // Mantém os extras da página anterior enquanto a nova carrega, senão a tabela pisca.
    placeholderData: (prev) => prev,
    queryFn: async (): Promise<Record<string, ClientExtras>> => {
      const { data, error } = await (supabase as any).rpc("get_clients_page_extras", {
        _seller_id: sellerId,
        _client_ids: clientIds,
      });
      if (error) throw error;

      const rows = (data ?? []) as ClientExtrasRow[];
      const map: Record<string, ClientExtras> = {};
      for (const row of rows) {
        map[row.client_id] = {
          store_key: row.store_key ?? null,
          store_name: row.store_name ?? null,
          extra_stores: Number(row.extra_stores ?? 0),
          stage_name: row.stage_name ?? null,
          stage_color: row.stage_color ?? null,
          rfv_segment: row.rfv_segment ?? null,
          city: row.city ?? null,
        };
      }
      return map;
    },
  });
}
