import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase as supabaseClient } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CalendarIcon,
  Download,
  Loader2,
  LogIn,
  MoreHorizontal,
  Search,
  SlidersHorizontal,
  X,
  Trash2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { DateRange } from "react-day-picker";
import { useSellerRfvMap } from "@/hooks/useRfv";
import {
  advancedFiltersToRpcArgs,
  countActiveKanbanFilters,
  describeKanbanFilters,
  makeEmptyKanbanFilters,
  useKanbanFilters,
  type KanbanAdvancedFilters,
} from "./kanbanFilters";
import { ClientCard } from "./ClientCard";
import { EditableStageHeader } from "./EditableStageHeader";
import { KanbanMoreFiltersSheet } from "./KanbanMoreFiltersSheet";
import { useKanbanFilterOptions } from "./usePipelineMetrics";

/** Referência estável: um objeto novo a cada render faria o sheet ressincronizar
 *  o rascunho e apagar o que o usuário digitou. */
const VAZIO: KanbanAdvancedFilters = makeEmptyKanbanFilters();

export type SortOption =
  | "moved_at_desc"
  | "moved_at_asc"
  | "name_asc"
  | "name_desc"
  | "order_value_desc"
  | "order_value_asc"
  | "last_interaction_desc"
  | "last_interaction_asc";

/**
 * Recortes de "Mais filtros" já normalizados (o sheet guarda tudo como string).
 * Só entra aqui o que `get_pipeline_stage_clients` sabe responder: um campo a
 * mais nesta lista contaria no badge do topo sem filtrar coisa alguma.
 */
export interface KanbanServerFilters {
  stateCode?: string | null;
  city?: string | null;
  minOrders?: number | null;
  maxOrders?: number | null;
  minSpent?: number | null;
  maxSpent?: number | null;
  /** ISO — último pedido a partir de. */
  lastOrderFrom?: string | null;
  rfvSegments?: string[] | null;
  birthdayMonth?: boolean;
  gender?: string | null;
}

export function countKanbanServerFilters(f?: KanbanServerFilters | null): number {
  if (!f) return 0;
  let n = 0;
  if (f.stateCode && f.stateCode !== "all") n++;
  if (f.city && f.city !== "all") n++;
  if (f.minOrders != null || f.maxOrders != null) n++;
  if (f.minSpent != null || f.maxSpent != null) n++;
  if (f.lastOrderFrom) n++;
  if (f.rfvSegments && f.rfvSegments.length > 0) n++;
  if (f.birthdayMonth) n++;
  if (f.gender && f.gender !== "all") n++;
  return n;
}

function serverFiltersToRpcArgs(f: KanbanServerFilters) {
  return {
    _state_code: f.stateCode && f.stateCode !== "all" ? f.stateCode : null,
    _city: f.city && f.city !== "all" ? f.city : null,
    _min_orders: f.minOrders ?? null,
    _max_orders: f.maxOrders ?? null,
    _min_spent: f.minSpent ?? null,
    _max_spent: f.maxSpent ?? null,
    _last_order_from: f.lastOrderFrom ?? null,
    _rfv_segments: f.rfvSegments?.length ? f.rfvSegments : null,
    _birthday_month: !!f.birthdayMonth,
    _gender: f.gender && f.gender !== "all" ? f.gender : null,
  };
}

// Tokens que a RPC entende (ela usa 'value_*'/'interaction_*').
const RPC_SORT: Record<SortOption, string> = {
  moved_at_desc: "moved_at_desc",
  moved_at_asc: "moved_at_asc",
  name_asc: "name_asc",
  name_desc: "name_desc",
  order_value_desc: "value_desc",
  order_value_asc: "value_asc",
  last_interaction_desc: "interaction_desc",
  last_interaction_asc: "interaction_asc",
};

// Caminho PostgREST: os 8 critérios saem dos campos cacheados de
// client_pipeline, todos cobertos por índice (idx_client_pipeline_*).
const PG_SORT: Record<SortOption, { field: string; ascending: boolean }> = {
  moved_at_desc: { field: "moved_at", ascending: false },
  moved_at_asc: { field: "moved_at", ascending: true },
  name_asc: { field: "cached_client_name", ascending: true },
  name_desc: { field: "cached_client_name", ascending: false },
  order_value_desc: { field: "cached_order_value", ascending: false },
  order_value_asc: { field: "cached_order_value", ascending: true },
  last_interaction_desc: { field: "cached_last_interaction_at", ascending: false },
  last_interaction_asc: { field: "cached_last_interaction_at", ascending: true },
};

const SORT_GROUPS: [SortOption, string, LucideIcon][][] = [
  [
    ["moved_at_desc", "Entrada (Recente)", ArrowDown],
    ["moved_at_asc", "Entrada (Antigo)", ArrowUp],
  ],
  [
    ["name_asc", "Nome (A-Z)", ArrowUp],
    ["name_desc", "Nome (Z-A)", ArrowDown],
  ],
  [
    ["order_value_desc", "Valor (Maior)", ArrowDown],
    ["order_value_asc", "Valor (Menor)", ArrowUp],
  ],
  [
    ["last_interaction_desc", "Interação (Recente)", ArrowDown],
    ["last_interaction_asc", "Interação (Antigo)", ArrowUp],
  ],
];

const PAGE_SIZE = 20;

// ---------------------------------------------------------------------------
// Tetos do "Exportar CSV" desta coluna
// ---------------------------------------------------------------------------
// O `EXPORT_LIMIT = 5000` de antes ia numa ÚNICA chamada, e uma chamada só nunca
// traz 5.000 linhas: o PostgREST corta toda resposta no `max-rows` do projeto
// (1.000 é o padrão da Supabase). Ou seja, o teto real era ~1.000 e ninguém
// avisava — o toast dizia "1000 clientes exportados" como se fosse o total.
//
// Medido em produção (ref fvyhjrqzklbfkmpajoyj): das 553 colunas de fase, 142
// passam de 1.000 clientes, 67 passam de 5.000 e 20 passam de 20.000; a maior é
// "Novos Clientes" do seller fee345e8, com 161.977.
//
// Agora a exportação pagina com o `_offset` da RPC até juntar o total que a
// própria RPC informa em `total_count`. O avanço é pelo que VOLTOU, não pelo
// que foi pedido — assim a varredura não depende de saber qual é o max-rows.
const EXPORT_PAGE = 1000;

// Teto duro, e ele APARECE na tela (menu, toast e nome do arquivo).
// Não é firula de memória: `get_pipeline_stage_clients` recalcula um
// `count(*) over()` sobre a fase INTEIRA a cada página, e na maior coluna só
// esse count medido com EXPLAIN ANALYZE leva 21 s — contra `statement_timeout`
// de 8 s no papel `authenticated`. Passar daqui não é lento, é erro garantido.
// Exportar 161.977 linhas tem que ser trabalho de servidor, não de aba.
const EXPORT_MAX_ROWS = 20000;

/** Teto da busca. `search_kanban_clients` não aceita offset (conferido com
 *  pg_get_functiondef) e ainda trava em `LIMIT LEAST(..., 5000)` por dentro,
 *  então paginar não é opção aqui: o que dá é avisar na tela.
 *
 *  O número é 500 porque estes ids viram `.in()` na consulta seguinte
 *  (fetchViaPostgrest e a contagem filtrada, os dois caminhos do embed), e o
 *  gateway da Supabase recusa a URL antes do PostgREST ver o pedido. Medido
 *  contra o endpoint de produção (GET /rest/v1/...?id=in.(N uuids)):
 *    670 uuids → 24.875 caracteres → HTTP 200
 *    680 uuids → 25.245 caracteres → HTTP 400 "Bad Request"
 *  1.000 uuids → 37.089 caracteres → HTTP 400 "Bad Request"
 *  Com 1.000 uma busca larga não voltava recortada: voltava 400, e a coluna
 *  dizia "Nenhum cliente encontrado" para um termo com milhares de clientes.
 *  500 ids ≈ 18,6 KB deixa margem para o resto da querystring e para o JWT do
 *  usuário, que também conta no limite. */
const SEARCH_MATCH_LIMIT = 500;

const EMPTY_ROWS: any[] = [];

interface KanbanColumnProps {
  stage: any;
  allStages: any[];
  onClientClick: (clientId: string) => void;
  onMoveClient: (clientId: string, newStageId: string, oldStageId?: string) => void;
  sellerId: string;
  dbClient?: any;
  /** Busca da barra do topo. A busca da própria coluna tem precedência. */
  globalSearch?: string;
  storeId?: string | null;
  marketplace?: string | null;
  /** ISO. Soma com o período escolhido dentro da coluna (vence o mais recente). */
  periodStart?: string | null;
  advancedFilters?: KanbanServerFilters | null;
  /** Filtros só desta coluna. O estado mora no KanbanBoard para que
   *  "Limpar todos" alcance também as colunas. */
  columnFilters?: KanbanAdvancedFilters | null;
  onColumnFiltersChange?: (stageId: string, next: KanbanAdvancedFilters | null) => void;
  movingClients?: Set<string>;
  selectionMode?: boolean;
  selectedClients?: Set<string>;
  onToggleSelected?: (clientId: string) => void;
  /**
   * Celular (22/10/2026): a coluna ocupa a largura da tela (uma fase por vez,
   * com as abas no topo do quadro), o cabeçalho vira cartão do app e os cards
   * ficam soltos no fundo. A busca da coluna some: a do topo está logo acima
   * e, com uma fase na tela, faz o mesmo papel.
   */
  mobile?: boolean;
  /** Avisa o quadro quando o período próprio da coluna liga/desliga (as abas do celular escondem a contagem). */
  onPeriodoDaColunaChange?: (stageId: string, ativo: boolean) => void;
}

export function KanbanColumn({
  stage,
  allStages,
  onClientClick,
  onMoveClient,
  sellerId,
  dbClient,
  globalSearch: globalSearchProp,
  storeId: storeIdProp,
  marketplace: marketplaceProp,
  periodStart: periodStartProp,
  advancedFilters,
  columnFilters = null,
  onColumnFiltersChange,
  movingClients,
  selectionMode: selectionModeProp,
  selectedClients: selectedClientsProp,
  onToggleSelected,
  mobile = false,
  onPeriodoDaColunaChange,
}: KanbanColumnProps) {
  const supabase: any = dbClient || supabaseClient;
  const isEmbed = !!dbClient;

  // A barra do topo pode chegar por prop OU pelo contexto do KanbanBoard — as
  // duas portas existem porque cabeçalho e colunas são mantidos em frentes
  // separadas. A prop vence quando é passada; no embed não há nenhuma das duas
  // e o contexto devolve o valor inerte.
  const board = useKanbanFilters();
  const globalSearch = globalSearchProp ?? board.search;
  const storeId = storeIdProp ?? board.storeId;
  const marketplace = marketplaceProp ?? board.marketplace;
  const periodStart = periodStartProp ?? board.periodStart;
  const selectionMode = selectionModeProp ?? board.selectionMode;
  const selectedClients = selectedClientsProp ?? board.selectedClients;
  const toggleSelected = onToggleSelected ?? board.toggleSelected;

  // Filtros SÓ desta coluna. Quando existem, substituem o "Mais filtros" do
  // quadro nesta coluna (e só nela) — em vez de somar com ele. Somar deixaria
  // dois conjuntos invisíveis se cruzando e o resultado vazio sem explicação;
  // o sheet abre preenchido com o que já vale aqui, então "substituir" é o que
  // o usuário vê acontecer.
  const [sheetFiltrosAberto, setSheetFiltrosAberto] = useState(false);
  const filtrosDaColuna = columnFilters;
  const qtdFiltrosDaColuna = filtrosDaColuna ? countActiveKanbanFilters(filtrosDaColuna) : 0;
  const rotulosDaColuna = useMemo(
    () => (filtrosDaColuna ? describeKanbanFilters(filtrosDaColuna) : []),
    [filtrosDaColuna],
  );

  // "Mais filtros" chega normalizado pela prop ou como rascunho do sheet no
  // contexto; os dois viram exatamente os mesmos parâmetros da RPC. Os filtros
  // da coluna, quando existem, substituem o do quadro AQUI (e só aqui).
  //
  // useMemo não é enfeite: advArgs alimenta advKey, que entra na queryKey. Um
  // objeto novo a cada render vira chave nova a cada render — foi assim que a
  // recência entrou em laço de refetch.
  const advArgs = useMemo(
    () =>
      filtrosDaColuna
        ? advancedFiltersToRpcArgs(filtrosDaColuna)
        : advancedFilters
        ? serverFiltersToRpcArgs(advancedFilters)
        : advancedFiltersToRpcArgs(board.advanced),
    [filtrosDaColuna, advancedFilters, board.advanced],
  );
  const advActive = filtrosDaColuna
    ? qtdFiltrosDaColuna > 0
    : advancedFilters
    ? countKanbanServerFilters(advancedFilters) > 0
    : !!board.advanced;

  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sortOption, setSortOption] = useState<SortOption>("moved_at_desc");
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [periodOpen, setPeriodOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  /** Quantas linhas o último CSV levou e quantas existiam. Fica na tela depois
   *  que o toast some: o arquivo cortado continua na pasta de downloads. */
  const [ultimoCorte, setUltimoCorte] = useState<{ saiu: number; total: number } | null>(null);
  /** A busca bateu em SEARCH_MATCH_LIMIT — a coluna passa a dizer isso em vez de
   *  mostrar um recorte parcial como se fosse o resultado inteiro. */
  const [buscaTruncada, setBuscaTruncada] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [loadedClients, setLoadedClients] = useState<any[]>(EMPTY_ROWS);
  const [page, setPage] = useState(0);
  const [hasMoreData, setHasMoreData] = useState(true);
  // Estado, não ref: mudar um ref não re-renderiza e o spinner de "carregando
  // mais" nunca aparecia. O ref segue existindo só como trava de reentrada.
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const loadingMoreRef = useRef(false);
  const generationRef = useRef(0);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  // "Definir como fase de entrada": clientes novos do marketplace passam a
  // cair aqui. É uma marca (pipeline_stages.is_entry), não a posição — por
  // isso arrastar colunas não a move. RPC SECURITY INVOKER: a policy de
  // manager decide; sem permissão ela lança e o toast mostra.
  const [definindoEntrada, setDefinindoEntrada] = useState(false);
  const handleDefinirEntrada = async () => {
    setDefinindoEntrada(true);
    try {
      const { error } = await supabaseClient.rpc("definir_fase_de_entrada", {
        _seller_id: sellerId,
        _stage_id: stage.id,
      });
      if (error) throw error;
      toast.success(`"${stage.name}" agora é a fase de entrada`);
      queryClient.invalidateQueries({ queryKey: ["pipeline-stages", sellerId] });
    } catch (e: any) {
      console.error("Error setting entry stage:", e);
      toast.error(`Não foi possível definir a fase de entrada: ${e?.message ?? "erro"}`);
    } finally {
      setDefinindoEntrada(false);
    }
  };

  // Um fetch por seller, compartilhado por todas as colunas (e desligado no
  // embed, onde não há sessão para ler client_rfv).
  const { data: rfvMap } = useSellerRfvMap(isEmbed ? null : sellerId);
  // Mesma queryKey que o quadro usa: o react-query compartilha o fetch, então
  // N colunas não viram N requisições.
  const { data: opcoesFiltro } = useKanbanFilterOptions(sellerId, !isEmbed);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm), 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const columnSearch = debouncedSearch.trim();
  const effectiveSearch = columnSearch || (globalSearch || "").trim();

  const columnFrom = useMemo(() => {
    if (!dateRange?.from) return null;
    const d = new Date(dateRange.from);
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }, [dateRange?.from]);

  const columnTo = useMemo(() => {
    if (!dateRange?.to) return null;
    const d = new Date(dateRange.to);
    d.setHours(23, 59, 59, 999);
    return d.toISOString();
  }, [dateRange?.to]);

  // Período da coluna e período da barra do topo se somam: vale o começo mais
  // recente dos dois, senão a coluna mostraria gente fora do recorte do quadro.
  const effectivePeriodStart = useMemo(() => {
    if (periodStart && columnFrom) {
      return Date.parse(periodStart) > Date.parse(columnFrom) ? periodStart : columnFrom;
    }
    return periodStart || columnFrom || null;
  }, [periodStart, columnFrom]);

  const advKey = advActive ? JSON.stringify(advArgs) : "";

  // No embed as RPCs novas não estão liberadas no embed-proxy, então lá o
  // caminho é sempre o PostgREST (busca via search_kanban_clients, que já é).
  const useServerFilter =
    !isEmbed &&
    (!!storeId ||
      !!marketplace ||
      !!effectivePeriodStart ||
      !!columnTo ||
      !!effectiveSearch ||
      advActive);

  const hasLegacyFilter = isEmbed && (!!effectiveSearch || !!columnFrom || !!columnTo);
  const hasDateFilter = !!(dateRange?.from || dateRange?.to);
  useEffect(() => {
    onPeriodoDaColunaChange?.(stage.id, hasDateFilter);
  }, [onPeriodoDaColunaChange, stage.id, hasDateFilter]);
  const hasAnyFilter = useServerFilter || hasLegacyFilter;

  // ---------------------------------------------------------------- fetching

  const reshapeRpcRow = useCallback(
    (r: any) => ({
      id: `${stage.id}-${r.client_id}`,
      client_id: r.client_id,
      stage_id: r.stage_id,
      seller_id: sellerId,
      created_at: r.created_at,
      moved_at: r.moved_at,
      notes: r.notes,
      cached_order_value: r.cached_order_value,
      cached_last_interaction_at: r.cached_last_interaction_at,
      clients: {
        id: r.client_id,
        full_name: r.full_name,
        document: r.document,
        whatsapp: r.whatsapp,
        email: r.email,
        city: r.city,
        state_code: r.state_code,
        birthdate: r.birthdate,
      },
      orders: r.last_marketplace
        ? {
            marketplace: r.last_marketplace,
            store_id: r.last_store_id,
            store_name: r.last_store_name,
          }
        : null,
    }),
    [sellerId, stage.id],
  );

  const fetchViaRpc = useCallback(
    async (offset: number, limit: number) => {
      const { data, error } = await (supabaseClient as any).rpc("get_pipeline_stage_clients", {
        _seller_id: sellerId,
        _stage_id: stage.id,
        _store_id: storeId || null,
        _marketplace: marketplace || null,
        _period_start: effectivePeriodStart,
        _period_end: columnTo,
        _search: effectiveSearch || null,
        _sort: RPC_SORT[sortOption],
        _limit: limit,
        _offset: offset,
        ...advArgs,
      });

      if (error) throw error;
      const rows = (data || []) as any[];
      return {
        rows: rows.map(reshapeRpcRow),
        total: rows.length > 0 ? Number(rows[0].total_count) : 0,
      };
    },
    [
      sellerId,
      stage.id,
      storeId,
      marketplace,
      effectivePeriodStart,
      columnTo,
      effectiveSearch,
      sortOption,
      advKey,
      reshapeRpcRow,
    ],
  );

  // Busca no embed: a RPC search_kanban_clients já está liberada no proxy e
  // casa nome, e-mail, CPF/CNPJ e WhatsApp.
  const getSearchMatchingClientIds = useCallback(
    async (search: string): Promise<string[]> => {
      const { data, error } = await supabase.rpc("search_kanban_clients", {
        _seller_id: sellerId,
        _search: search,
        _limit: SEARCH_MATCH_LIMIT,
      });
      if (error) {
        console.error("search_kanban_clients falhou:", error);
        return [];
      }
      // Veio exatamente o teto: quase certamente há mais gente casando com o
      // termo, e não dá para pedir a página seguinte (a função não tem offset).
      // Então a coluna conta isso na tela em vez de entregar o recorte calado.
      setBuscaTruncada((data || []).length >= SEARCH_MATCH_LIMIT);
      return Array.from(new Set((data || []).map((row: any) => String(row.client_id || row))));
    },
    [supabase, sellerId],
  );

  // Sem busca não há corte de busca: se este reset não existisse, o aviso ficava
  // grudado na coluna depois de limpar o campo.
  useEffect(() => {
    if (!effectiveSearch) setBuscaTruncada(false);
  }, [effectiveSearch]);

  const enrichWithLastOrder = useCallback(
    async (rows: any[]) => {
      if (rows.length === 0) return rows;
      const ids = rows.map((r) => r.client_id);
      const { data: orders } = await supabase
        .from("orders")
        .select("client_id, marketplace, total_amount, acquired_at")
        .eq("seller_id", sellerId)
        .in("client_id", ids)
        .order("acquired_at", { ascending: false });

      const lastOrder = new Map<string, any>();
      (orders || []).forEach((o: any) => {
        if (!lastOrder.has(o.client_id)) lastOrder.set(o.client_id, o);
      });

      return rows.map((r) => ({ ...r, orders: lastOrder.get(r.client_id) || null }));
    },
    [supabase, sellerId],
  );

  const fetchViaPostgrest = useCallback(
    async (offset: number, limit: number) => {
      const { field, ascending } = PG_SORT[sortOption];

      let query = supabase
        .from("client_pipeline")
        .select("*, clients ( id, full_name, document, whatsapp, email, city, state_code, birthdate )")
        .eq("seller_id", sellerId)
        .eq("stage_id", stage.id);

      if (effectiveSearch) {
        const ids = await getSearchMatchingClientIds(effectiveSearch);
        if (ids.length === 0) return { rows: [] as any[], total: 0 };
        query = query.in("client_id", ids);
      }
      if (columnFrom) query = query.gte("moved_at", columnFrom);
      if (columnTo) query = query.lte("moved_at", columnTo);

      const { data, error } = await query
        .order(field, { ascending, nullsFirst: false })
        .range(offset, offset + limit - 1);

      if (error) throw error;
      const rows = (data || []) as any[];
      return { rows: await enrichWithLastOrder(rows), total: null as number | null };
    },
    [
      supabase,
      sellerId,
      stage.id,
      sortOption,
      effectiveSearch,
      columnFrom,
      columnTo,
      getSearchMatchingClientIds,
      enrichWithLastOrder,
    ],
  );

  const fetchPage = useCallback(
    (pageNumber: number) =>
      useServerFilter
        ? fetchViaRpc(pageNumber * PAGE_SIZE, PAGE_SIZE)
        : fetchViaPostgrest(pageNumber * PAGE_SIZE, PAGE_SIZE),
    [useServerFilter, fetchViaRpc, fetchViaPostgrest],
  );

  // ----------------------------------------------------------------- queries

  // Contagem da fase inteira. Continua sendo buscada mesmo sob filtro porque é
  // ela que autoriza (ou não) apagar a fase — com a contagem filtrada uma fase
  // cheia pareceria vazia, e a FK de client_pipeline é ON DELETE CASCADE.
  const { data: totalCount = 0 } = useQuery({
    queryKey: ["column-count", sellerId, stage.id],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("client_pipeline")
        .select("*", { count: "exact", head: true })
        .eq("seller_id", sellerId)
        .eq("stage_id", stage.id);
      if (error) throw error;
      return count || 0;
    },
  });

  const { data: legacyFilteredCount = 0 } = useQuery({
    queryKey: ["column-filtered-count", sellerId, stage.id, effectiveSearch, columnFrom, columnTo],
    enabled: hasLegacyFilter,
    queryFn: async () => {
      let query = supabase
        .from("client_pipeline")
        .select("*", { count: "exact", head: true })
        .eq("seller_id", sellerId)
        .eq("stage_id", stage.id);

      if (effectiveSearch) {
        const ids = await getSearchMatchingClientIds(effectiveSearch);
        if (ids.length === 0) return 0;
        query = query.in("client_id", ids);
      }
      if (columnFrom) query = query.gte("moved_at", columnFrom);
      if (columnTo) query = query.lte("moved_at", columnTo);

      const { count, error } = await query;
      if (error) throw error;
      return count || 0;
    },
  });

  const { data: firstPage, isLoading: isInitialLoading } = useQuery({
    queryKey: [
      "column-initial",
      sellerId,
      stage.id,
      sortOption,
      effectiveSearch,
      storeId,
      marketplace,
      effectivePeriodStart,
      columnTo,
      advKey,
    ],
    queryFn: () => fetchPage(0),
    // Mantém a página anterior na tela enquanto a nova chega, senão cada tecla
    // digitada pisca "Nenhum lead nesta fase".
    placeholderData: (prev) => prev,
  });

  useEffect(() => {
    const rows = firstPage?.rows ?? EMPTY_ROWS;
    // Cada primeira página é uma "geração": uma busca por mais páginas que
    // estivesse voando quando o filtro mudou não pode emendar linhas do
    // recorte antigo na lista nova.
    generationRef.current += 1;
    setLoadedClients(rows);
    setPage(0);
    setHasMoreData(rows.length === PAGE_SIZE);
  }, [firstPage]);

  // Troca de filtro zera a paginação NA HORA. Com `placeholderData: prev`, a
  // query nova devolve a MESMA referência enquanto o fetch não volta — o efeito
  // de [firstPage] não dispara, e um scroll nessa janela pediria a página
  // seguinte do recorte NOVO com offset da lista ANTIGA, emendando os dois.
  useEffect(() => {
    generationRef.current += 1;
    setPage(0);
    setHasMoreData(true);
  }, [advKey]);

  const loadMoreData = useCallback(async () => {
    if (loadingMoreRef.current || !hasMoreData || isInitialLoading) return;
    loadingMoreRef.current = true;
    setIsLoadingMore(true);
    const nextPage = page + 1;
    const generation = generationRef.current;

    try {
      const { rows } = await fetchPage(nextPage);
      if (generation !== generationRef.current) return;
      if (rows.length > 0) {
        setLoadedClients((prev) => [...prev, ...rows]);
        setPage(nextPage);
        setHasMoreData(rows.length === PAGE_SIZE);
      } else {
        setHasMoreData(false);
      }
    } catch (error) {
      console.error("Erro ao carregar mais clientes:", error);
    } finally {
      loadingMoreRef.current = false;
      setIsLoadingMore(false);
    }
  }, [hasMoreData, isInitialLoading, page, fetchPage]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      if (scrollHeight - scrollTop - clientHeight < 200) loadMoreData();
    };
    container.addEventListener("scroll", handleScroll);
    return () => container.removeEventListener("scroll", handleScroll);
  }, [loadMoreData]);

  // Realtime (fora do embed, que não tem sessão), com debounce de 1s.
  useEffect(() => {
    if (isEmbed) return;
    let timeout: ReturnType<typeof setTimeout> | null = null;

    const debouncedInvalidate = () => {
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["column-initial", sellerId, stage.id] });
        queryClient.invalidateQueries({ queryKey: ["column-count", sellerId, stage.id] });
        queryClient.invalidateQueries({ queryKey: ["column-filtered-count", sellerId, stage.id] });
        queryClient.invalidateQueries({ queryKey: ["crm-metrics", sellerId] });
      }, 1000);
    };

    const channel = supabaseClient
      .channel(`column-${stage.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "client_pipeline", filter: `seller_id=eq.${sellerId}` },
        (payload: any) => {
          const row: any = payload.new || payload.old;
          if (row?.stage_id === stage.id || (payload.old as any)?.stage_id === stage.id) {
            debouncedInvalidate();
          }
        },
      )
      .subscribe();

    return () => {
      if (timeout) clearTimeout(timeout);
      supabaseClient.removeChannel(channel);
    };
  }, [sellerId, stage.id, queryClient, isEmbed]);

  // ------------------------------------------------------------------ export

  // Antes: UMA chamada com `_limit: 5000`. Uma chamada só nunca traz 5.000
  // linhas — o PostgREST corta no `max-rows` do projeto (1.000 no padrão da
  // Supabase) —, então o CSV saía com ~1.000 linhas e o toast dizia
  // "1000 clientes exportados" como se fosse a fase inteira.
  // Agora: pagina pelo `_offset` da RPC até completar o `total_count` que a
  // própria RPC devolve, e o que sobrar do teto vai para a tela e para o nome
  // do arquivo.
  const handleExport = async () => {
    setIsExporting(true);
    const idToast = `export-${stage.id}`;
    toast.loading("Montando o CSV...", { id: idToast });
    try {
      // No embed o lote é menor: fetchViaPostgrest passa por enrichWithLastOrder,
      // que joga a página inteira num `.in()`. Medido contra o endpoint de
      // produção, o gateway aceita 670 uuids (24.875 caracteres) e devolve
      // HTTP 400 "Bad Request" a partir de 680 (25.245) — com 1.000 (37 KB) a
      // chamada nem chega ao PostgREST. 200 é o mesmo lote que o BULK_CHUNK do
      // KanbanBoard usa pelo mesmo motivo.
      const lotePagina = isEmbed ? 200 : EXPORT_PAGE;
      const buscarPagina = isEmbed ? fetchViaPostgrest : fetchViaRpc;

      const linhas: any[] = [];
      let totalDaRpc: number | null = null;

      while (linhas.length < EXPORT_MAX_ROWS) {
        const alvo = Math.min(lotePagina, EXPORT_MAX_ROWS - linhas.length);
        const pagina = await buscarPagina(linhas.length, alvo);
        if (totalDaRpc === null && pagina.total != null) totalDaRpc = pagina.total;
        linhas.push(...pagina.rows);
        // Para só na página VAZIA, nunca na "menor que o pedido": se o max-rows
        // do projeto for menor que o lote, toda página vem curta sem os dados
        // terem acabado, e parar aí repetiria o corte calado que este laço
        // existe para tirar. Com o total conhecido nem chega a pedir a vazia.
        if (pagina.rows.length === 0) break;
        if (totalDaRpc != null && linhas.length >= totalDaRpc) break;
        toast.loading(
          `Montando o CSV (${linhas.length.toLocaleString("pt-BR")} clientes)...`,
          { id: idToast },
        );
      }

      if (linhas.length === 0) {
        toast.info("Nenhum cliente para exportar", { id: idToast });
        return;
      }

      // O caminho PostgREST (embed) não devolve total; lá quem sabe o tamanho do
      // recorte é a contagem do cabeçalho, que é count exact e o max-rows não toca.
      const totalReal = Math.max(
        totalDaRpc ?? (hasLegacyFilter ? legacyFilteredCount : totalCount),
        linhas.length,
      );
      const truncado = linhas.length < totalReal;

      const headers = [
        "Nome",
        "WhatsApp",
        "E-mail",
        "Cidade",
        "UF",
        "Documento",
        "Valor do último pedido (R$)",
        "Marketplace",
        "Loja",
        "Entrada na fase",
        "Observações",
      ];

      const escape = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
      const lines = linhas.map((r: any) => {
        const c = r.clients || {};
        return [
          c.full_name,
          c.whatsapp,
          c.email,
          c.city,
          c.state_code,
          c.document,
          r.cached_order_value != null ? Number(r.cached_order_value).toFixed(2) : "",
          r.orders?.marketplace,
          r.orders?.store_name,
          r.moved_at ? new Date(r.moved_at).toLocaleDateString("pt-BR") : "",
          r.notes,
        ]
          .map(escape)
          .join(",");
      });

      const csv = [headers.join(","), ...lines].join("\n");
      const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      // O corte vai no NOME do arquivo: o toast some em segundos, o CSV fica no
      // computador de alguém por meses sendo tratado como a lista completa.
      const sufixo = truncado ? `_${linhas.length}-de-${totalReal}` : "";
      link.download = `${String(stage.name).replace(/\s+/g, "_")}_clientes${sufixo}.csv`;
      link.click();
      URL.revokeObjectURL(url);

      if (truncado) {
        setUltimoCorte({ saiu: linhas.length, total: totalReal });
        toast.warning(
          `Exportados os primeiros ${linhas.length.toLocaleString("pt-BR")} de ${totalReal.toLocaleString("pt-BR")} clientes`,
          { id: idToast, duration: 12000 },
        );
      } else {
        setUltimoCorte(null);
        toast.success(
          `${linhas.length.toLocaleString("pt-BR")} clientes exportados`,
          { id: idToast },
        );
      }
    } catch (err) {
      console.error("Erro ao exportar:", err);
      // Explícito que NADA foi baixado: sem isso o usuário procura um arquivo
      // parcial que não existe, ou pior, acha que baixou.
      //
      // O timeout ganha texto próprio porque em fase grande ele é o caso comum,
      // e "erro ao exportar" mandaria o usuário tentar de novo para sempre.
      // Medido em produção com EXPLAIN ANALYZE na maior fase ("Novos Clientes"
      // do seller fee345e8, 161.977 clientes): UMA página de 1.000 linhas leva
      // 34,9 s com cache frio e 1,76 s com cache quente, contra os 8 s de
      // `statement_timeout` do papel `authenticated` (pg_roles.rolconfig).
      // O custo é da fase INTEIRA a cada página — get_pipeline_stage_clients
      // refaz `count(*) over()` sobre ela toda —, então baixar o teto de 20.000
      // não ajudaria: quem decide é o tamanho da fase, não o da fatia.
      const codigo = (err as { code?: string } | null)?.code;
      const mensagem = String((err as { message?: string } | null)?.message ?? "");
      const foiTimeout = codigo === "57014" || /statement timeout|canceling statement/i.test(mensagem);
      toast.error(
        foiTimeout
          ? "Esta fase é grande demais para exportar pelo navegador (o banco cancelou em 8 s) — nenhum arquivo foi baixado"
          : "Erro ao exportar clientes — nenhum arquivo foi baixado",
        { id: idToast },
      );
    } finally {
      setIsExporting(false);
    }
  };

  // ------------------------------------------------------------------ drag

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setIsDragOver(true);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const clientId = e.dataTransfer.getData("clientId");
    const fromStageId = e.dataTransfer.getData("currentStageId");
    if (clientId && fromStageId !== stage.id) onMoveClient(clientId, stage.id, fromStageId);
  };

  // ------------------------------------------------------------------ render

  // `total` só vem `null` do caminho PostgREST, que fora do embed roda apenas
  // sem filtro nenhum — ou seja, quando ele é null os cards na tela são a fase
  // inteira e `totalCount` é exatamente a contagem deles. É esse o instante em
  // que `useServerFilter` já virou true e `firstPage` ainda é o placeholder da
  // consulta anterior: com `?? 0` o cabeçalho piscava "(0)" sobre os cards
  // antigos até a RPC responder.
  const displayCount = useServerFilter
    ? firstPage?.total ?? totalCount
    : hasLegacyFilter
      ? legacyFilteredCount
      : totalCount;

  const dateRangeLabel = hasDateFilter
    ? dateRange?.from && dateRange?.to
      ? `${format(dateRange.from, "dd/MM", { locale: ptBR })} – ${format(dateRange.to, "dd/MM", { locale: ptBR })}`
      : dateRange?.from
        ? `A partir de ${format(dateRange.from, "dd/MM", { locale: ptBR })}`
        : `Até ${format(dateRange!.to!, "dd/MM", { locale: ptBR })}`
    : null;

  // "Excluir fase" do menu do celular: abre a confirmação do EditableStageHeader.
  const [pedidoExcluir, setPedidoExcluir] = useState(0);

  // Ordenar, filtros da coluna e o menu: na 2ª linha do cabeçalho no computador,
  // na mesma linha do nome no celular (via `direita` do EditableStageHeader).
  const ferramentas = (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-9 px-2" title="Ordenar">
            <ArrowUpDown className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuLabel>Ordenar por</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {SORT_GROUPS.map((group, i) => (
            <div key={i}>
              {i > 0 && <DropdownMenuSeparator />}
              {group.map(([value, label, Icon]) => (
                <DropdownMenuItem
                  key={value}
                  onClick={() => setSortOption(value)}
                  className={sortOption === value ? "bg-accent" : ""}
                >
                  <Icon className="h-3 w-3 mr-2" />
                  {label}
                </DropdownMenuItem>
              ))}
            </div>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Filtros só desta coluna. Escondido no embed: lá o caminho servidor
          está desligado (useServerFilter exige !isEmbed), então o botão
          existiria filtrando nada — falha silenciosa. */}
      {!isEmbed && (
        <Button
          variant="outline"
          size="sm"
          className="h-9 px-2 relative"
          title="Filtrar só esta coluna"
          onClick={() => setSheetFiltrosAberto(true)}
        >
          <SlidersHorizontal className="h-4 w-4" />
          {qtdFiltrosDaColuna > 0 && (
            <span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-none text-primary-foreground">
              {qtdFiltrosDaColuna}
            </span>
          )}
        </Button>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-9 px-2 relative" title="Mais ações">
            <MoreHorizontal className="h-4 w-4" />
            {hasDateFilter && (
              <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-primary" />
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem onClick={() => setPeriodOpen(true)}>
            <CalendarIcon className="h-4 w-4 mr-2" />
            Filtrar por período
          </DropdownMenuItem>
          {/* Sem isso não haveria volta: uma coluna com filtro próprio VAZIO
              é diferente de uma coluna que segue o quadro, e as duas se
              parecem na tela. */}
          {filtrosDaColuna && (
            <DropdownMenuItem onClick={() => onColumnFiltersChange?.(stage.id, null)}>
              <X className="h-4 w-4 mr-2" />
              Limpar filtros desta coluna
            </DropdownMenuItem>
          )}
          {/* Escondido no embed (sem sessão para a RPC) e na própria entrada
              (o badge no cabeçalho já diz). */}
          {!isEmbed && !stage.is_entry && (
            <DropdownMenuItem onClick={handleDefinirEntrada} disabled={definindoEntrada}>
              {definindoEntrada ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <LogIn className="h-4 w-4 mr-2" />
              )}
              Definir como fase de entrada
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={handleExport} disabled={isExporting || totalCount === 0}>
            {isExporting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Download className="h-4 w-4 mr-2" />
            )}
            {/* O teto aparece ANTES do clique, não só no toast depois: numa
                fase acima de EXPORT_MAX_ROWS o usuário já lê no menu que o
                arquivo vai sair cortado, e em quanto. */}
            {displayCount > EXPORT_MAX_ROWS
              ? `Exportar CSV (${EXPORT_MAX_ROWS.toLocaleString("pt-BR")} de ${displayCount.toLocaleString("pt-BR")})`
              : "Exportar CSV"}
          </DropdownMenuItem>
          {mobile && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => setPedidoExcluir((n) => n + 1)}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Excluir fase
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );

  return (
    <div className={`flex flex-col flex-shrink-0 group h-full ${mobile ? "w-full" : "w-80"}`}>
      {/* Cabeçalho: a cor da fase vive só na bolinha do EditableStageHeader. */}
      <Card
        className={
          mobile
            ? "flex-shrink-0 rounded-3xl border-border/60 p-4 shadow-none"
            : "rounded-b-none p-3 flex-shrink-0"
        }
      >
        <EditableStageHeader
          stageId={stage.id}
          stageName={stage.name}
          stageColor={stage.color}
          clientCount={displayCount}
          sellerId={sellerId}
          hasClients={totalCount > 0}
          isEntry={!!stage.is_entry}
          direita={mobile ? <div className="flex shrink-0 items-center gap-1.5">{ferramentas}</div> : undefined}
          semMargem={mobile}
          pedidoExcluir={pedidoExcluir}
        />

        {!mobile && (
          <div className="flex gap-2">
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8 h-9 text-sm"
              />
            </div>
            {ferramentas}
          </div>
        )}

        {/* O que ESTA coluna está filtrando. Um número no ícone não diz o quê, e
            aqui não existe a linha de chips do topo para consultar. */}
        {rotulosDaColuna.length > 0 && (
          <div className="flex flex-wrap items-center gap-1">
            {rotulosDaColuna.map((r) => (
              <span
                key={r}
                className="rounded-full bg-muted px-2 py-0.5 text-[10px] leading-tight text-muted-foreground"
              >
                {r}
              </span>
            ))}
            <button
              type="button"
              onClick={() => onColumnFiltersChange?.(stage.id, null)}
              className="rounded-full px-1.5 py-0.5 text-[10px] leading-tight text-muted-foreground underline underline-offset-2 hover:text-foreground"
            >
              limpar
            </button>
          </div>
        )}

        {/* A busca bateu no teto da RPC. Sem esta linha a coluna mostra um
            recorte parcial com cara de resultado completo — o mesmo silêncio
            que fazia o CSV parecer inteiro. */}
        {buscaTruncada && (
          <p className="mt-2 text-[11px] leading-snug text-warning">
            Busca limitada aos {SEARCH_MATCH_LIMIT.toLocaleString("pt-BR")} primeiros
            clientes que casam com o termo. Refine a busca para ver o resto.
          </p>
        )}

        {/* Fica na tela depois que o toast some: o CSV que está na pasta de
            downloads não tem tudo, e o número diz exatamente o quanto falta. */}
        {ultimoCorte && (
          <p className="mt-2 text-[11px] leading-snug text-warning">
            Último CSV: {ultimoCorte.saiu.toLocaleString("pt-BR")} de{" "}
            {ultimoCorte.total.toLocaleString("pt-BR")} clientes.
          </p>
        )}

        {hasDateFilter && dateRangeLabel && (
          <div className="flex items-center gap-1 mt-2">
            <Badge
              variant="outline"
              className="text-xs h-5 gap-1 border-primary/40 text-primary bg-primary/5 pr-1"
            >
              <CalendarIcon className="h-2.5 w-2.5" />
              {dateRangeLabel}
              <button
                onClick={() => setDateRange(undefined)}
                className="ml-0.5 hover:opacity-70 transition-opacity"
                aria-label="Limpar período"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </Badge>
          </div>
        )}
      </Card>

      {/* Lista. O data-kanban-column-list é o que impede o quadro de sequestrar
          a roda do mouse e de iniciar o arrasto horizontal daqui de dentro. */}
      <Card
        ref={scrollContainerRef}
        data-kanban-column-list
        className={
          mobile
            ? // Celular: os cards soltos no fundo da tela, rolando por baixo do cabeçalho.
              `flex-1 min-h-0 overflow-y-auto rounded-none border-0 bg-transparent px-0 pt-3 shadow-none space-y-2 ${
                // Espaço para a barra de seleção flutuante não cobrir o último card.
                selectionMode ? "pb-20" : "pb-4"
              }`
            : `flex-1 min-h-0 overflow-y-auto rounded-t-none bg-card p-3 space-y-2 transition-colors ${
                isDragOver ? "ring-2 ring-primary/40" : ""
              }`
        }
        onDragOver={handleDragOver}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
      >
        {isInitialLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : loadedClients.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-8">
            {hasAnyFilter ? "Nenhum cliente encontrado" : "Nenhum lead nesta fase"}
          </p>
        ) : (
          <>
            {loadedClients.map((client: any) => (
              <ClientCard
                key={client.client_id}
                client={client}
                allStages={allStages}
                currentStageId={stage.id}
                sellerId={sellerId}
                onClientClick={onClientClick}
                onMoveClient={onMoveClient}
                rfvSegment={rfvMap?.get(client.client_id)}
                isMoving={movingClients?.has(client.client_id)}
                selectionMode={selectionMode}
                selected={selectedClients.has(client.client_id)}
                onToggleSelected={toggleSelected}
                embedded={isEmbed}
                mobile={mobile}
              />
            ))}
            {isLoadingMore && (
              <div className="flex justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            )}
          </>
        )}
      </Card>

      <Dialog open={periodOpen} onOpenChange={setPeriodOpen}>
        <DialogContent className="w-auto max-w-fit">
          <DialogHeader>
            <DialogTitle>Filtrar por período</DialogTitle>
            <DialogDescription>Data de entrada nesta fase.</DialogDescription>
          </DialogHeader>
          <Calendar
            mode="range"
            selected={dateRange}
            onSelect={setDateRange}
            locale={ptBR}
            numberOfMonths={1}
            className="p-0 pointer-events-auto"
          />
          <div className="flex justify-between gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              disabled={!hasDateFilter}
              onClick={() => setDateRange(undefined)}
            >
              <X className="h-3 w-3 mr-1" />
              Limpar
            </Button>
            <Button size="sm" onClick={() => setPeriodOpen(false)}>
              Pronto
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {!isEmbed && (
        <KanbanMoreFiltersSheet
          open={sheetFiltrosAberto}
          onOpenChange={setSheetFiltrosAberto}
          // Só os filtros DESTA coluna — sem herdar os do quadro. Pré-preencher
          // com os do quadro gravava uma cópia congelada deles: mudanças
          // posteriores no topo não alcançavam mais a coluna, e nada na tela
          // dizia por qual valor ela ainda estava filtrando.
          value={filtrosDaColuna ?? VAZIO}
          onApply={(next) => onColumnFiltersChange?.(stage.id, next)}
          sellerId={sellerId}
          states={opcoesFiltro?.states ?? []}
          titulo={`Filtros — ${stage.name}`}
          descricao="Valem só para esta coluna. As outras seguem os filtros do quadro."
        />
      )}
    </div>
  );
}
