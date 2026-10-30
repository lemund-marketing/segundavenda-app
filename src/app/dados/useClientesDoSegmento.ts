import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Um cliente do segmento, como a RPC `rfv_clients` devolve. */
export interface ClienteDoSegmento {
  client_id: string;
  full_name: string | null;
  total_orders: number;
  total_spent: number | string | null;
  recency_days: number;
  r: number;
  f: number;
  v: number;
}

/** A RPC não está nos tipos gerados: como no site, a chamada vai sem tipo. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SemTipo = any;

/**
 * Os clientes de um segmento do RFV: a mesma chamada que a página do site
 * (src/pages/RFV.tsx) faz ao tocar num segmento, os 100 primeiros. Lá ela
 * mora num handler solto que engole o erro e cai em "Nenhum cliente neste
 * segmento"; aqui passa pelo react-query para, sem internet, esperar a
 * conexão em vez de dizer que o segmento está vazio.
 */
export function useClientesDoSegmento(sellerId: string | undefined, segmento: string | null) {
  return useQuery<ClienteDoSegmento[]>({
    queryKey: ["rfv-clients", sellerId, segmento],
    enabled: !!sellerId && !!segmento,
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as SemTipo)("rfv_clients", {
        p_seller_id: sellerId,
        p_segments: [segmento],
        p_limit: 100,
        p_offset: 0,
      });
      if (error) throw error;
      return (data as ClienteDoSegmento[] | null) ?? [];
    },
  });
}
