import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Mudanças de status dos pedidos do cliente neste seller (13/10/2026), para a aba
 * Histórico. Vem de order_status_history, que o seller-webhook grava em toda troca
 * de status, com ou sem fluxo. Ver a migration 20261013150000.
 */
export interface MudancaDeStatus {
  order_id: string;
  external_order_id: string | null;
  marketplace: string | null;
  product: string | null;
  old_status: string | null;
  new_status: string;
  changed_at: string;
}

export function useClientOrderStatusHistory(
  clientId: string | null | undefined,
  sellerId: string | null | undefined,
) {
  return useQuery<MudancaDeStatus[]>({
    queryKey: ["client-order-status-history", clientId, sellerId],
    enabled: !!clientId && !!sellerId,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    retry: false,
    queryFn: async () => {
      // RPC ainda fora do types.ts gerado: mesmo cast do useWhatsAppConsumo.
      const { data, error } = await supabase.rpc(
        "get_client_order_status_history" as never,
        { _client_id: clientId, _seller_id: sellerId } as never,
      );
      // Falha não derruba a aba: o resto do histórico continua aparecendo.
      if (error) {
        console.error("[historico] get_client_order_status_history:", error.message);
        return [];
      }
      return (data ?? []) as MudancaDeStatus[];
    },
  });
}
