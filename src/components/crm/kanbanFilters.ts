import { createContext, useContext } from "react";

/**
 * Estado compartilhado da barra de filtros do Kanban.
 *
 * Vive num contexto e não em props porque o cabeçalho (KanbanBoard) e as
 * colunas são mantidos em frentes separadas: a coluna consome
 * `useKanbanFilters()` sem que o cabeçalho conheça a assinatura dela.
 */

/** Par do `interval '15 days'` de get_pipeline_metrics (KPI "Parados"). */
export const STUCK_DAYS = 15;

/**
 * Fase por REGRA (`dynamic`/`auto_assign`): quem lista a coluna é a condição
 * sobre `client_metrics`/`orders`, e `client_pipeline` nunca é lido.
 *
 * Vale para dois usos que precisam concordar:
 *  - destino de "Mover para...": gravar `stage_id` apontando para uma delas
 *    faz o cliente sumir do quadro inteiro (sai da coluna de origem e não
 *    entra na de destino, que só olha a condição);
 *  - "Distribuição por fase": os vínculos gravados nessas fases não são o que
 *    o cabeçalho da coluna conta.
 */
export function isConditionalStage(stage: { stage_type?: string | null } | null | undefined): boolean {
  return stage?.stage_type === "dynamic" || stage?.stage_type === "auto_assign";
}

export const KANBAN_PERIODS: { value: string; label: string }[] = [
  { value: "all", label: "Todo período" },
  { value: "7", label: "Últimos 7 dias" },
  { value: "15", label: "Últimos 15 dias" },
  { value: "30", label: "Últimos 30 dias" },
  { value: "60", label: "Últimos 60 dias" },
  { value: "90", label: "Últimos 90 dias" },
];

export const KANBAN_RECENCY: { value: string; label: string }[] = [
  { value: "all", label: "Qualquer data" },
  { value: "30", label: "Comprou nos últimos 30 dias" },
  { value: "60", label: "Comprou nos últimos 60 dias" },
  { value: "90", label: "Comprou nos últimos 90 dias" },
  { value: "180", label: "Comprou nos últimos 180 dias" },
  { value: "365", label: "Comprou nos últimos 365 dias" },
];

/**
 * Só filtros que `get_pipeline_stage_clients` sabe responder.
 * O sheet equivalente do Segundo Pedido tem 26 campos e 10 deles contam no
 * badge sem filtrar nada — aqui cada campo tem um parâmetro correspondente.
 */
export interface KanbanAdvancedFilters {
  stateCode: string;
  city: string;
  minOrders: string;
  maxOrders: string;
  minSpent: string;
  maxSpent: string;
  recencyDays: string;
  /**
   * Data exata (ISO, início do dia) para "última compra a partir de" — o lado
   * "De" de um Calendar. Alimenta o MESMO `_last_order_from` da recência, por
   * isso os dois são mutuamente exclusivos na UI (escolher um zera o outro) e
   * contam como UM filtro só.
   *
   * Não existe "Até": a RPC get_pipeline_stage_clients só tem
   * `_last_order_from` (conferido em produção via pg_get_function_arguments).
   * `_period_start`/`_period_end` NÃO servem para isso — filtram
   * `coalesce(moved_at, created_at)` (entrada na fase) e já são ocupados pelo
   * período do quadro e pelo calendário da própria coluna.
   */
  lastOrderFrom: string;
  /**
   * Segmentos da matriz RFV, pelos nomes EXATOS de `rfv_segment_meta` ("Campeões",
   * "Não posso perdê-los"…). Vazio = não filtra; vários = OR entre eles, do lado
   * do banco (`cr.segment = any(_rfv_segments)` em get_pipeline_stage_clients).
   *
   * Saiu do sheet em 07/08/2026 (commit cc8be12c) e voltou em 29/08/2026 com o
   * resto do RFV. O parâmetro da RPC nunca chegou a ser removido — durante essas
   * três semanas o campo existia só para os chips do KanbanBoard tiparem, e ia
   * sempre null para o banco.
   */
  rfvSegments: string[];
  birthdayMonth: boolean;
  gender: string;
}

export function makeEmptyKanbanFilters(): KanbanAdvancedFilters {
  return {
    stateCode: "all",
    city: "",
    minOrders: "",
    maxOrders: "",
    minSpent: "",
    maxSpent: "",
    recencyDays: "all",
    lastOrderFrom: "",
    rfvSegments: [],
    birthdayMonth: false,
    gender: "all",
  };
}

export function countActiveKanbanFilters(f: KanbanAdvancedFilters): number {
  let n = 0;
  if (f.stateCode !== "all") n++;
  if (f.city.trim()) n++;
  if (f.minOrders.trim() || f.maxOrders.trim()) n++;
  if (f.minSpent.trim() || f.maxSpent.trim()) n++;
  // Preset de recência e data exata alimentam o mesmo parâmetro da RPC:
  // contar os dois seria prometer 2 filtros onde só 1 corte existe.
  if (f.recencyDays !== "all" || f.lastOrderFrom) n++;
  // O conjunto inteiro vale 1, mesmo com 3 segmentos marcados: na RPC é um
  // corte só (`segment = any(...)`). É a mesma conta do badge do grupo "Segmento
  // RFV" no sheet — assim os badges dos grupos somam exatamente este total.
  if (f.rfvSegments.length > 0) n++;
  if (f.birthdayMonth) n++;
  if (f.gender !== "all") n++;
  return n;
}

/**
 * Rótulos curtos do que está ativo. Um número sozinho ("2") não diz ao usuário
 * O QUE está filtrado — e no filtro por coluna não existe a linha de chips do
 * topo para consultar.
 */
export function describeKanbanFilters(f: KanbanAdvancedFilters): string[] {
  const out: string[] = [];
  if (f.stateCode !== "all") out.push(f.stateCode);
  if (f.city.trim()) out.push(f.city.trim());
  if (f.minOrders.trim() || f.maxOrders.trim()) {
    out.push(`pedidos ${f.minOrders.trim() || "0"}–${f.maxOrders.trim() || "∞"}`);
  }
  if (f.minSpent.trim() || f.maxSpent.trim()) {
    out.push(`gasto ${f.minSpent.trim() || "0"}–${f.maxSpent.trim() || "∞"}`);
  }
  if (f.lastOrderFrom) {
    out.push(`comprou desde ${new Date(f.lastOrderFrom).toLocaleDateString("pt-BR")}`);
  } else if (f.recencyDays !== "all") {
    out.push(`comprou em ${f.recencyDays}d`);
  }
  // Um rótulo só para todos os segmentos, e abreviado: os nomes da matriz são
  // longos ("Lealdade potencial", "Não posso perdê-los") e estes chips têm 10px
  // no cabeçalho da coluna — três deles por extenso empurrariam o resto para
  // fora. Sem esta linha, uma coluna filtrada SÓ por RFV mostraria o "1" no
  // ícone de filtro e nenhum rótulo: a linha de chips do cabeçalho só é
  // renderizada quando esta função devolve algo, e é nela que mora o "limpar"
  // da coluna (KanbanColumn, ~linha 854).
  if (f.rfvSegments.length > 0) {
    out.push(
      f.rfvSegments.length === 1
        ? `RFV: ${f.rfvSegments[0]}`
        : `RFV: ${f.rfvSegments[0]} +${f.rfvSegments.length - 1}`,
    );
  }
  if (f.birthdayMonth) out.push("aniversariantes");
  if (f.gender !== "all") out.push(f.gender === "male" ? "homens" : f.gender === "female" ? "mulheres" : f.gender);
  return out;
}

export function isKanbanFiltersActive(f: KanbanAdvancedFilters): boolean {
  return countActiveKanbanFilters(f) > 0;
}

/** Início do dia de N dias atrás — mesmo valor durante todo o dia. */
function recenciaEstavel(recencyDays: string): string | null {
  if (recencyDays === "all") return null;
  const dias = parseInt(recencyDays, 10);
  if (!Number.isFinite(dias)) return null;
  const d = new Date(Date.now() - dias * 86400_000);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

const toNum = (s: string): number | null => {
  const v = Number(String(s).replace(",", ".").trim());
  return Number.isFinite(v) && String(s).trim() !== "" ? v : null;
};

/** Traduz o rascunho do sheet nos parâmetros que a RPC da coluna aceita — nada além. */
export function advancedFiltersToRpcArgs(f: KanbanAdvancedFilters | null) {
  if (!f) return {};
  return {
    _state_code: f.stateCode !== "all" ? f.stateCode : null,
    _city: f.city.trim() || null,
    _min_orders: toNum(f.minOrders),
    _max_orders: toNum(f.maxOrders),
    _min_spent: toNum(f.minSpent),
    _max_spent: toNum(f.maxSpent),
    // Truncado no início do dia DE PROPÓSITO. Com Date.now() cru, este valor
    // muda a cada chamada (precisão de milissegundo) — e como ele entra na
    // queryKey da coluna via advKey, cada render criava uma query nova, que ao
    // resolver re-renderizava e criava outra: refetch em laço, uma requisição
    // por RTT, por coluna, enquanto a recência estivesse ativa.
    // A data exata (Calendar) tem precedência sobre o preset — na UI eles são
    // mutuamente exclusivos, isto aqui é só o cinto de segurança. A data já é
    // gravada no início do dia, então é tão estável quanto recenciaEstavel
    // (mesma preocupação de queryKey do comentário acima).
    _last_order_from: f.lastOrderFrom || recenciaEstavel(f.recencyDays),
    // Nomes de segmento como estão em client_rfv.segment — a RPC compara
    // literalmente (`cr.segment = any(v_rfv)`), sem normalizar acento. Vazio vira
    // null por convenção dos outros parâmetros daqui; a RPC também aceitaria
    // `{}` (ela faz nullif(coalesce(...),'{}')), mas null é o que os demais
    // filtros mandam quando estão desligados.
    _rfv_segments: f.rfvSegments.length > 0 ? f.rfvSegments : null,
    _birthday_month: f.birthdayMonth,
    _gender: f.gender !== "all" ? f.gender : null,
  };
}

export interface KanbanFilterState {
  /** Busca já debounced (300 ms). */
  search: string;
  marketplace: string | null;
  storeId: string | null;
  periodStart: string | null;
  /** `null` quando nenhum filtro avançado está ativo. */
  advanced: KanbanAdvancedFilters | null;
  selectionMode: boolean;
  selectedClients: Set<string>;
  toggleSelected: (clientId: string) => void;
}

const INERT: KanbanFilterState = {
  search: "",
  marketplace: null,
  storeId: null,
  periodStart: null,
  advanced: null,
  selectionMode: false,
  selectedClients: new Set(),
  toggleSelected: () => {},
};

export const KanbanFilterContext = createContext<KanbanFilterState>(INERT);

/** No embed não há provider — o valor inerte mantém a coluna funcionando. */
export function useKanbanFilters(): KanbanFilterState {
  return useContext(KanbanFilterContext);
}
