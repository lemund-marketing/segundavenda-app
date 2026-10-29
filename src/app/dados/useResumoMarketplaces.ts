import { useQuery } from "@tanstack/react-query";
import { callRpc } from "@/hooks/rpc";
import { trimZeroEdges } from "@/components/lojas/lojaDetailShared";

/**
 * As duas consultas da tela Marketplaces que só ela faz (a de métricas por
 * marketplace, `useLojaMetrics`, é dividida com o detalhe). Mesmas RPCs,
 * parâmetros e chaves de cache da página do site (src/pages/Lojas.tsx).
 */

export interface ResumoDaRede {
  total_marketplaces: number;
  prev_marketplaces: number;
  total_orders: number;
  prev_orders: number;
  total_revenue: number;
  prev_revenue: number;
  unique_clients: number;
  prev_unique_clients: number;
  shared_clients: number;
  avg_ticket: number;
  prev_avg_ticket: number;
  top_marketplace: string | null;
  top_marketplace_share: number;
}

export interface PontoDaSerie {
  dia: string;
  receita: number;
  pedidos: number;
}

const num = (v: unknown) => Number(v ?? 0) || 0;

export function useResumoDaRede(sellerId: string | undefined, start: string, end: string) {
  return useQuery<ResumoDaRede | null>({
    queryKey: ["lojas-network-summary", sellerId, start, end],
    enabled: !!sellerId,
    staleTime: 60_000,
    queryFn: async () => {
      const linhas = await callRpc("get_marketplace_network_summary", {
        _seller_id: sellerId,
        _start: start,
        _end: end,
      });
      return (linhas[0] as unknown as ResumoDaRede | undefined) ?? null;
    },
  });
}

/** Receita e pedidos de todos os marketplaces de uma vez, por dia ou por mês. */
export function useSerieDosMarketplaces(
  sellerId: string | undefined,
  start: string,
  end: string,
  bucket: "day" | "month",
) {
  return useQuery<Record<string, PontoDaSerie[]>>({
    queryKey: ["lojas-sparkline", sellerId, start, end, bucket],
    enabled: !!sellerId,
    staleTime: 60_000,
    queryFn: async () => {
      const linhas = await callRpc("get_marketplace_revenue_sparkline", {
        _seller_id: sellerId,
        _start: start,
        _end: end,
        _bucket: bucket,
      });
      const out: Record<string, PontoDaSerie[]> = {};
      for (const r of linhas) {
        const mp = String(r.marketplace);
        (out[mp] ||= []).push({ dia: String(r.dia), receita: num(r.receita), pedidos: num(r.pedidos) });
      }
      // Em "Tudo" o servidor preenche com zero desde 1999-12: sem cortar as
      // pontas vazias, a receita mês a mês vira centenas de meses zerados.
      for (const mp of Object.keys(out)) {
        out[mp] = trimZeroEdges(out[mp], (p) => p.receita === 0 && p.pedidos === 0);
      }
      return out;
    },
  });
}
