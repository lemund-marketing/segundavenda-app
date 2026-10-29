import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { ClientesFilterPayload } from "@/components/clients/clientesFilters";
import { statusLabel } from "@/components/pedidos/statusPedido";

/**
 * Opções dos combobox do sheet "Mais filtros".
 *
 * As opções são do RECORTE IMPOSTO pela tela, nunca da página: são 401 cidades e
 * 393 produtos só no seller de teste, contra as ~50 que cabem numa página da
 * lista. Montar a lista com o que veio na página faria o combobox mentir sobre o
 * que existe.
 *
 * "Recorte imposto" é a loja travada de `/lojas/:marketplace` — nunca os filtros
 * que o próprio sheet edita, senão marcar SP faria SP virar a única UF ofertada.
 * Sem trava (`{}`), a faceta descreve o seller inteiro, como sempre.
 */

export interface FacetOption {
  /** O que vai no filtro — já com a grafia do banco (cidade casa por igualdade exata). */
  value: string;
  label: string;
  total: number;
}

/**
 * `regions`: `value` é a chave (`norte` … `sul`, `sem_regiao`) e `label` o
 * rótulo, na ordem fixa Norte → Sul com "Sem região informada" por último —
 * régua de `dash_regiao`, ver `@/lib/regioes`. Ao contrário das outras facetas
 * agrupadas, o banco devolve SEMPRE as 6 linhas (total 0 quando vazio); o
 * front não depende disso (lista fixa, região ausente = 0).
 */
export type FacetKind = "states" | "cities" | "marketplaces" | "products" | "regions";

const FACET_STALE = 10 * 60_000;

/** Identidade estável para quem não tem recorte: entra em deps e queryKey. */
export const NO_FACET_FILTERS: ClientesFilterPayload = {};

export function useClientesFacet(
  sellerId: string | null | undefined,
  kind: FacetKind,
  search = "",
  enabled = true,
  filters: ClientesFilterPayload = NO_FACET_FILTERS,
) {
  const termo = search.trim();
  const chave = JSON.stringify(filters ?? {});
  return useQuery<FacetOption[]>({
    queryKey: ["clientes-facetas", sellerId, kind, termo, chave],
    enabled: !!sellerId && enabled,
    staleTime: FACET_STALE,
    // Segura a lista anterior enquanto a busca nova carrega — sem isso o
    // combobox pisca "nenhum resultado" a cada tecla.
    placeholderData: (prev) => prev,
    queryFn: async (): Promise<FacetOption[]> => {
      const { data, error } = await (supabase as any).rpc("get_clientes_facetas", {
        _seller_id: sellerId,
        _kind: kind,
        _search: termo || null,
        _limit: 500,
        _filters: filters ?? {},
      });
      if (error) throw error;
      return ((data ?? []) as any[]).map((row) => ({
        value: String(row.value ?? ""),
        label: String(row.label ?? row.value ?? ""),
        total: Number(row.total ?? 0),
      }));
    },
  });
}

export interface PipelineStageOption {
  id: string;
  name: string;
  color: string | null;
  /** `dynamic`/`auto_assign` não leem `client_pipeline` — a UI precisa avisar. */
  stage_type: string | null;
}

/** Fases do funil para a seção CRM. Guardamos ID, não nome. */
export function usePipelineStageOptions(sellerId: string | null | undefined, enabled = true) {
  return useQuery<PipelineStageOption[]>({
    queryKey: ["clientes-pipeline-stages", sellerId],
    enabled: !!sellerId && enabled,
    staleTime: FACET_STALE,
    queryFn: async (): Promise<PipelineStageOption[]> => {
      const { data, error } = await (supabase as any)
        .from("pipeline_stages")
        .select("id, name, color, stage_type")
        .eq("seller_id", sellerId)
        .order("position");
      if (error) throw error;
      return ((data ?? []) as any[]).map((row) => ({
        id: String(row.id),
        name: String(row.name ?? ""),
        color: row.color ?? null,
        stage_type: row.stage_type ?? null,
      }));
    },
  });
}

/**
 * Grafias distintas de `orders.order_status` do seller, AGRUPADAS por
 * minúscula — 'Cancelled' e 'cancelled' viram uma opção só, e é a forma
 * minúscula que o filtro manda (clientes_filtro_base compara lower() dos
 * dois lados). Mesma RPC do Exportar Pedidos.
 */
export interface OrderStatusOption {
  /** chave minúscula — o que vai no payload `lastOrderStatuses` */
  value: string;
  label: string;
}

export function useSellerOrderStatusOptions(
  sellerId: string | null | undefined,
  enabled = true,
  /**
   * `incluirCancelados` existe para o gatilho "Status deste pedido"
   * (docs/GATILHO_FILTROS.md §S1.1): lá o status lido é o do pedido que ACABOU
   * de chegar, e um pedido pode chegar cancelado. Em Clientes o filtro é sobre
   * `last_order_status`, que sai do mesmo universo de `calculate_client_metrics`
   * — e esse exclui cancelado/reembolsado. Default mantém Clientes como está.
   */
  opcoes: { incluirCancelados?: boolean } = {},
) {
  const incluirCancelados = opcoes.incluirCancelados === true;
  return useQuery<OrderStatusOption[]>({
    queryKey: ["seller-order-statuses", sellerId, incluirCancelados],
    enabled: !!sellerId && enabled,
    staleTime: FACET_STALE,
    queryFn: async (): Promise<OrderStatusOption[]> => {
      const { data, error } = await (supabase.rpc as any)("get_seller_order_statuses", {
        p_seller_id: sellerId,
      });
      if (error) throw error;
      // Cancelado/reembolsado NÃO entra por padrão: `last_order_status` sai do
      // mesmo universo de calculate_client_metrics, que exclui esses status — o
      // chip existiria só para devolver zero cliente sempre. Com
      // `incluirCancelados` a lista vem inteira (ver o comentário da opção).
      const CANCELADOS = new Set([
        "cancelled", "cancelado", "canceled", "refunded", "reembolsado",
      ]);
      const chaves = new Set<string>();
      for (const r of (data ?? []) as any[]) {
        const cru = String(r.order_status ?? "").trim().toLowerCase();
        if (cru && (incluirCancelados || !CANCELADOS.has(cru))) chaves.add(cru);
      }
      return Array.from(chaves)
        .map((chave) => ({
          value: chave,
          // Rótulo amigável do dicionário de Pedidos ("approved" -> "Pago");
          // grafia desconhecida cai no capitalize.
          label:
            statusLabel(chave) !== chave
              ? statusLabel(chave)
              : chave.charAt(0).toUpperCase() + chave.slice(1).replace(/_/g, " "),
        }))
        .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
    },
  });
}
