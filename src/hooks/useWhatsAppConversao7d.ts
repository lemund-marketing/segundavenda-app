import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * "Compraram em 7d" de TODOS os templates de WhatsApp do período (08/10/2026):
 * a mesma régua da tela do template (get_template_performance), somada. Ver
 * a migration 20261008190000_whatsapp_conversao_7d.
 */
export interface Conversao7d {
  unique_recipients: number;
  converted_clients: number;
  revenue: number;
}

export function useWhatsAppConversao7d(sellerId: string | null | undefined, start: string, end: string) {
  return useQuery<Conversao7d>({
    queryKey: ["whatsapp-conversao-7d", sellerId, start, end],
    enabled: !!sellerId && !!start && !!end,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    retry: false,
    queryFn: async () => {
      // RPC ainda fora do types.ts gerado: mesmo cast do useWhatsAppConsumo.
      const { data, error } = await supabase.rpc(
        "get_whatsapp_conversao_7d" as never,
        { _seller_id: sellerId, _start: start, _end: end } as never,
      );
      if (error) {
        console.error("[conversao7d] get_whatsapp_conversao_7d:", error.message);
        throw new Error(error.message);
      }
      const r = (data ?? {}) as Record<string, unknown>;
      return {
        unique_recipients: Number(r.unique_recipients ?? 0),
        converted_clients: Number(r.converted_clients ?? 0),
        revenue: Number(r.revenue ?? 0),
      };
    },
  });
}
