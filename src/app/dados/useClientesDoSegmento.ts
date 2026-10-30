import { useQuery } from "@tanstack/react-query";
import { callRpc } from "@/hooks/rpc";

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

/**
 * Os clientes de um segmento do RFV: a mesma chamada que a página do site
 * (src/pages/RFV.tsx) faz ao tocar num segmento, os 100 primeiros. Lá ela
 * mora num handler solto que engole o erro e cai em "Nenhum cliente neste
 * segmento"; aqui passa pelo react-query para, sem internet, esperar a
 * conexão em vez de dizer que o segmento está vazio.
 *
 * `aberta`: só consulta com a folha aberta, como o site (que só chama ao
 * tocar). Fechada, a lista continua em cache para a animação de saída, mas a
 * volta da conexão não refaz a chamada.
 */
export function useClientesDoSegmento(sellerId: string | undefined, segmento: string | null, aberta: boolean) {
  return useQuery<ClienteDoSegmento[]>({
    queryKey: ["rfv-clients", sellerId, segmento],
    enabled: aberta && !!sellerId && !!segmento,
    queryFn: async () =>
      (await callRpc("rfv_clients", {
        p_seller_id: sellerId,
        p_segments: [segmento],
        p_limit: 100,
        p_offset: 0,
      })) as unknown as ClienteDoSegmento[],
  });
}
