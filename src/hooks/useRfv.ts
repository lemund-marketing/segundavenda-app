import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Um dos 11 segmentos da matriz clássica, já em português. */
export interface RfvSegmentMeta {
  name: string;
  color: string;
  order: number;
  acao: string;
}

export interface RfvSegmentRow {
  segment: string;
  clients: number;
  revenue: number;
  avg_ltv: number;
}

export interface RfvAvailability {
  ready: boolean;
  days_history: number;
  min_days: number;
  clients: number;
  repeat_clients: number;
  min_repeat_clients: number;
  reason: "historico_curto" | "poucos_recorrentes" | null;
}

export interface RfvSummary {
  thresholds: {
    median_repurchase_days: number;
    recency_days: number[];
    value_cuts: number[];
    window_months: number;
  };
  availability: RfvAvailability;
  meta: RfvSegmentMeta[];
  totals: { clients: number; revenue: number; orders: number; avg_ltv: number };
  by_r: Record<string, number>;
  by_f: Record<string, number>;
  by_v: Record<string, number>;
  matrix: { r: number; fv: number; clients: number; revenue: number; segment: string }[];
  segments: RfvSegmentRow[];
}

/**
 * Resumo completo do RFV do seller: régua, matriz, segmentos e o gate de
 * histórico. O cálculo roda no banco, sem materialização.
 */
export function useRfvSummary(sellerId: string | null | undefined) {
  return useQuery<RfvSummary | null>({
    queryKey: ["rfv-summary", sellerId],
    enabled: !!sellerId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("rfv_summary", {
        p_seller_id: sellerId,
      });
      if (error) throw error;
      return (data as RfvSummary) ?? null;
    },
  });
}

/** Só o gate — barato, para decidir se mostra a feature em outras telas. */
export function useRfvAvailability(sellerId: string | null | undefined) {
  return useQuery<RfvAvailability | null>({
    queryKey: ["rfv-availability", sellerId],
    enabled: !!sellerId,
    staleTime: 30 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("rfv_availability", {
        p_seller_id: sellerId,
      });
      if (error) return null;
      return (data as RfvAvailability) ?? null;
    },
  });
}

/**
 * Opções para o filtro por segmento: nome + cor + quantos clientes há hoje.
 * Devolve [] quando o seller ainda não passa no gate — assim o accordion
 * simplesmente não aparece.
 */
export function useRfvFilterOptions(sellerId: string | null | undefined) {
  const { data } = useRfvSummary(sellerId);
  if (!data || !data.availability?.ready) return [];
  const counts = new Map(data.segments.map((s) => [s.segment, s.clients]));
  return [...data.meta]
    .sort((a, b) => a.order - b.order)
    .map((m) => ({ name: m.name, color: m.color, clients: counts.get(m.name) ?? 0 }));
}

/**
 * Segmento de um cliente específico (para a etiqueta no sheet/cards).
 * Traz junto os três parâmetros que geraram as notas: refazer essa conta no
 * navegador daria outro número (o banco roda em UTC e o snapshot é do cron).
 */
export function useClientRfv(clientId: string | null | undefined, sellerId: string | null | undefined) {
  return useQuery<{
    segment: string; r: number; f: number; v: number;
    recency_days: number | null; total_orders: number | null; total_spent: number | null;
  } | null>({
    queryKey: ["client-rfv", clientId, sellerId],
    enabled: !!clientId && !!sellerId,
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("client_rfv")
        .select("segment, r, f, v, recency_days, total_orders, total_spent")
        .eq("client_id", clientId)
        .eq("seller_id", sellerId)
        .maybeSingle();
      return (data as any) ?? null;
    },
  });
}

/**
 * Mapa cliente → segmento da base inteira, em páginas de 1000.
 *
 * Existe para telas com MUITOS cartões na tela (Kanban): uma consulta por
 * cartão viraria dezenas de requisições. Como a chave do react-query é só o
 * seller, todos os cartões compartilham a mesma carga.
 */
export function useSellerRfvMap(sellerId: string | null | undefined) {
  return useQuery<Map<string, string>>({
    queryKey: ["seller-rfv-map", sellerId],
    enabled: !!sellerId,
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const mapa = new Map<string, string>();
      const PAGINA = 1000;
      for (let de = 0; ; de += PAGINA) {
        const { data, error } = await (supabase as any)
          .from("client_rfv")
          .select("client_id, segment")
          .eq("seller_id", sellerId)
          .range(de, de + PAGINA - 1);
        if (error) break;
        const linhas = (data as { client_id: string; segment: string }[]) ?? [];
        linhas.forEach((l) => mapa.set(l.client_id, l.segment));
        if (linhas.length < PAGINA) break;
      }
      return mapa;
    },
  });
}

/** Cor de cada segmento — espelha rfv_segment_meta() no banco. */
export const RFV_COLORS: Record<string, string> = {
  "Campeões": "#16a34a",
  "Leais": "#22c55e",
  "Lealdade potencial": "#84cc16",
  "Recentes": "#06b6d4",
  "Promissores": "#0ea5e9",
  "Precisam de atenção": "#eab308",
  "Prestes a dormir": "#f59e0b",
  "Em risco": "#f97316",
  "Não posso perdê-los": "#dc2626",
  "Hibernando": "#a855f7",
  "Perdidos": "#94a3b8",
};

/** Os 11 nomes na ordem da matriz — para listas que não dependem do resumo. */
export const RFV_SEGMENTS: string[] = Object.keys(RFV_COLORS);

/** Uma virada de segmento do cliente. `source` distingue log do dia a dia de passado reconstruído. */
export interface RfvTimelineEntry {
  segment: string;
  previous_segment: string | null;
  changed_at: string;
  source: string;
}

/**
 * Linha do tempo de segmento de um cliente, do mais antigo para o mais recente.
 * O trecho anterior à feature vem reconstruído dos pedidos (source "backfill") —
 * datas exatas, mas com a régua de hoje aplicada retroativamente; daí em diante
 * quem grava é o snapshot diário.
 */
export function useClientRfvTimeline(
  clientId: string | null | undefined,
  sellerId: string | null | undefined,
) {
  return useQuery<RfvTimelineEntry[]>({
    queryKey: ["client-rfv-timeline", clientId, sellerId],
    enabled: !!clientId && !!sellerId,
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("rfv_client_timeline", {
        p_seller_id: sellerId,
        p_client_id: clientId,
      });
      if (error) return [];
      return (data as RfvTimelineEntry[]) ?? [];
    },
  });
}
