import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase as supabaseClient } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Search, Loader2, Filter, Zap, ArrowUpDown, ArrowUp, ArrowDown,
  CalendarIcon, X, Download, MoreHorizontal,
  Trash2,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useSellerRfvMap } from "@/hooks/useRfv";
import { useKanbanFilters } from "./kanbanFilters";
import { ClientCard } from "./ClientCard";
import { EditableStageHeader } from "./EditableStageHeader";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import type { DateRange } from "react-day-picker";

type SortOption =
  | "moved_at_desc"
  | "moved_at_asc"
  | "name_asc"
  | "name_desc"
  | "order_value_desc"
  | "order_value_asc";

// ---------------------------------------------------------------------------
// Tetos do "Exportar CSV" desta coluna
// ---------------------------------------------------------------------------
// O CSV daqui saía com 1.000 linhas e ninguém era avisado. O `.limit(5000)` que
// estava no código NÃO era o teto: o PostgREST corta toda resposta no `max-rows`
// do projeto (1.000 é o padrão da Supabase e não há como lê-lo só com SELECT),
// e pedir 5.000 não muda isso. Medido em produção (ref fvyhjrqzklbfkmpajoyj):
//   "autoatribuição (+2)" do seller c5ccf5f3 → 1.036 clientes de verdade;
//   "Segunda Compra"      do seller 88596c37 → 1.699 clientes de verdade.
// O cabeçalho da coluna mostra 1.036/1.699 (ele usa count exact, que o max-rows
// não toca) e o CSV vinha com 1.000 linhas — a divergência que o dono reportou.
//
// A varredura abaixo pagina de 1.000 em 1.000 com `.range()` (mesmo padrão de
// src/hooks/useRfv.ts:134) e avança pelo que VOLTOU, não pelo que foi pedido:
// assim ela funciona sem depender de saber qual é o max-rows do projeto.
const LOTE_VARREDURA = 1000;

/** `.in()` com centenas de uuids estoura a URL antes de chegar no PostgREST —
 *  mesmo teto de BULK_CHUNK em KanbanBoard.tsx. Medido contra o endpoint de
 *  produção: 670 uuids (24.875 caracteres) passam, 680 (25.245) já voltam
 *  HTTP 400 "Bad Request" do gateway (não 414), e com os 1.036 ids desta
 *  coluna numa chamada só (37 KB) a exportação morria sem gerar arquivo.
 *  200 ids ≈ 7,5 KB deixa folga para o resto da querystring e para o JWT. */
const LOTE_IN = 200;

/** Teto duro do CSV no navegador. Quando morde, o número aparece no toast e no
 *  nome do arquivo — truncar calado é justamente o defeito que estamos tirando. */
const MAX_LINHAS_CSV = 20000;

/** Teto da busca. `search_kanban_clients` NÃO aceita offset (conferido com
 *  pg_get_functiondef) e ainda trava em `LIMIT LEAST(..., 5000)` por dentro,
 *  então aqui não dá para paginar: dá para avisar.
 *
 *  O número é 500 porque estes ids viram `.in()` na consulta seguinte, e o
 *  gateway da Supabase recusa a URL antes do PostgREST ver o pedido. Medido
 *  contra o endpoint de produção (GET /rest/v1/...?id=in.(N uuids)):
 *    670 uuids → 24.875 caracteres → HTTP 200
 *    680 uuids → 25.245 caracteres → HTTP 400 "Bad Request"
 *  1.000 uuids → 37.089 caracteres → HTTP 400 "Bad Request"
 *  Ou seja: com 1.000 a coluna quebrava numa busca larga (a consulta voltava
 *  400, o cabeçalho ficava 0 e a lista dizia "Nenhum cliente encontrado" para
 *  um termo com milhares de clientes). 500 ids ≈ 18,6 KB deixa margem para o
 *  resto da querystring e para o JWT do usuário, que também conta no limite. */
const LIMITE_BUSCA = 500;

/** Só o que o CSV lê de cada tabela — evita passear `any` pela exportação. */
interface LinhaMetrica {
  client_id: string;
  total_orders: number | null;
  total_spent: number | string | null;
  last_order_at: string | null;
}
interface LinhaCliente {
  id: string;
  full_name: string | null;
  whatsapp: string | null;
  email: string | null;
  city: string | null;
  state_code: string | null;
  document: string | null;
}
interface LinhaPedido {
  client_id: string;
  total_amount: number | null;
  product: string | null;
  marketplace: string | null;
}

/** Quebra uma lista em lotes — os `.in()` abaixo dependem disso. */
function emLotes<T>(itens: T[], tamanho: number): T[][] {
  const saida: T[][] = [];
  for (let i = 0; i < itens.length; i += tamanho) saida.push(itens.slice(i, i + tamanho));
  return saida;
}

/**
 * Varre uma consulta PostgREST inteira, em páginas de LOTE_VARREDURA.
 * `montar(de, ate)` devolve a consulta já com `.range(de, ate)` aplicado.
 * Para quando a página vem menor que o lote (fim real dos dados) ou quando
 * `maximo` é alcançado — e nesse caso devolve `truncado: true` para quem chamou
 * ter o que mostrar na tela.
 */
async function varrerEmPaginas<T>(
  montar: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  maximo: number,
): Promise<{ linhas: T[]; truncado: boolean }> {
  const linhas: T[] = [];
  while (linhas.length < maximo) {
    const alvo = Math.min(LOTE_VARREDURA, maximo - linhas.length);
    const { data, error } = await montar(linhas.length, linhas.length + alvo - 1);
    if (error) throw error;
    const lote = (data || []) as T[];
    linhas.push(...lote);
    // Para só na página VAZIA, nunca na "menor que o pedido". Se o max-rows do
    // projeto for menor que LOTE_VARREDURA, toda página vem curta sem os dados
    // terem acabado — e parar aí seria repetir o mesmo corte calado que esta
    // função existe para tirar. O preço é uma requisição vazia no fim.
    if (lote.length === 0) return { linhas, truncado: false };
  }
  return { linhas, truncado: true };
}

interface DynamicKanbanColumnProps {
  stage: any;
  allStages: any[];
  onClientClick: (clientId: string) => void;
  onMoveClient: (clientId: string, newStageId: string, oldStageId?: string) => void;
  sellerId: string;
  dbClient?: any;
  /** Busca da barra do topo. A busca da própria coluna tem precedência. */
  globalSearch?: string;
  /**
   * Loja/Marketplace/Período/"Mais filtros" estão ativos no topo. Eles recortam
   * client_pipeline, e a fase por regra não lê client_pipeline (a fonte é
   * client_metrics/orders) — então aqui não se aplicam, e a coluna avisa na
   * tela em vez de deixar um filtro que conta no badge e não filtra nada.
   */
  boardFiltersActive?: boolean;
  movingClients?: Set<string>;
  /** Celular: largura da tela, cabeçalho em cartão e sem a busca da coluna (ver KanbanColumn). */
  mobile?: boolean;
  selectionMode?: boolean;
  selectedClients?: Set<string>;
  onToggleSelected?: (clientId: string) => void;
}

export function DynamicKanbanColumn({
  stage, allStages, onClientClick, onMoveClient, sellerId, dbClient,
  globalSearch: globalSearchProp,
  boardFiltersActive: boardFiltersActiveProp,
  movingClients,
  selectionMode: selectionModeProp,
  selectedClients: selectedClientsProp,
  onToggleSelected,
  mobile = false,
}: DynamicKanbanColumnProps) {
  const db: any = dbClient || supabaseClient;
  const isEmbed = !!dbClient;

  // Mesma dupla porta da KanbanColumn: prop quando o topo passa, contexto
  // quando não passa, inerte no embed.
  const board = useKanbanFilters();
  const globalSearch = globalSearchProp ?? board.search;
  const selectionMode = selectionModeProp ?? board.selectionMode;
  const selectedClients = selectedClientsProp ?? board.selectedClients;
  const toggleSelected = onToggleSelected ?? board.toggleSelected;
  const boardFiltersActive =
    boardFiltersActiveProp ??
    !!(board.storeId || board.marketplace || board.periodStart || board.advanced);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [loadedClients, setLoadedClients] = useState<any[]>([]);
  const [page, setPage] = useState(0);
  const [hasMoreData, setHasMoreData] = useState(true);
  const [sortOption, setSortOption] = useState<SortOption>("moved_at_desc");
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [periodOpen, setPeriodOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  /** Quantas linhas o último CSV levou e quantas existiam. Fica na tela depois
   *  da exportação: o toast some, o aviso de corte não pode sumir com ele. */
  const [ultimoCorte, setUltimoCorte] = useState<
    { saiu: number; total: number; piso?: boolean } | null
  >(null);
  /** A busca bateu em LIMITE_BUSCA — a coluna passa a dizer isso embaixo do
   *  campo, em vez de mostrar um recorte parcial como se fosse o resultado. */
  const [buscaTruncada, setBuscaTruncada] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isLoadingMoreRef = useRef(false);
  const pageSize = 20;

  const { data: rfvMap } = useSellerRfvMap(isEmbed ? null : sellerId);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm), 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // A busca da coluna vence a global, como no resto do quadro.
  const effectiveSearch = debouncedSearch.trim() || (globalSearch || "").trim();

  const normalizeDigits = (value: string = "") => value.replace(/\D/g, "");

  const formatCpfCnpj = (digits: string) => {
    if (digits.length === 11) {
      return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
    }
    if (digits.length === 14) {
      return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
    }
    return digits;
  };

  const digitsIlikePattern = (digits: string) => digits.split('').join('%');

  const condition = stage.condition as { type: string; value: number | string } | null;
  const isOrderStatusCondition = condition?.type === "order_status_equals";
  const isDynamic = stage.stage_type === "dynamic";
  const hasDateFilter = !!(dateRange?.from || dateRange?.to);
  const hasSearchFilter = effectiveSearch.length > 0;
  const hasActiveFilter = hasDateFilter || hasSearchFilter;

  // Build metrics query filter based on condition
  const applyConditionFilter = (query: any) => {
    if (!condition || isOrderStatusCondition) return query;
    const numValue = Number(condition.value);
    switch (condition.type) {
      case "min_orders":
        return query.gte("total_orders", numValue);
      case "exact_orders":
        return query.eq("total_orders", numValue);
      case "min_spent":
        return query.gte("total_spent", numValue);
      case "last_order_within_days": {
        const since = new Date();
        since.setDate(since.getDate() - numValue);
        return query.gte("last_order_at", since.toISOString());
      }
      case "no_order_days": {
        const before = new Date();
        before.setDate(before.getDate() - numValue);
        return query.lte("last_order_at", before.toISOString());
      }
    }
    return query;
  };

  // Status aliases for order_status_equals matching
  const getStatusAliases = (statusValue: string): string[] => {
    const aliases: Record<string, string[]> = {
      'enviado': ['enviado', 'shipped'],
      'entregue': ['entregue', 'delivered'],
      'preparando_envio': ['preparando_envio', 'preparing', 'preparando envio'],
    };
    return aliases[statusValue] || [statusValue];
  };

  const getSearchMatchingClientIds = async (search: string) => {
    const trimmed = search.trim();
    if (!trimmed) {
      setBuscaTruncada(false);
      return null;
    }

    const { data: rpcData, error: rpcError } = await db.rpc("search_kanban_clients", {
      _seller_id: sellerId,
      _search: trimmed,
      _limit: LIMITE_BUSCA,
    });

    if (!rpcError) {
      const ids = Array.from(new Set((rpcData || []).map((row: any) => String(row.client_id || row))));
      // A RPC devolveu exatamente o teto: quase certamente há mais gente casando
      // com o termo. Não dá para pedir a página seguinte (a função não tem
      // offset), então o que dá é contar isso na tela.
      setBuscaTruncada((rpcData || []).length >= LIMITE_BUSCA);
      return ids;
    }

    console.warn("search_kanban_clients RPC failed, using fallback search:", rpcError);

    const digits = normalizeDigits(trimmed);
    // Mesmo teto do caminho da RPC, pelo mesmo motivo: o resultado vira `.in()`
    // logo adiante e a URL do PostgREST não carrega mais que isso.
    const queries = [
      db
        .from("clients")
        .select("id")
        .ilike("full_name", `%${trimmed}%`)
        .limit(LIMITE_BUSCA),
    ];

    if (digits.length >= 3) {
      const documentPatterns = Array.from(new Set([digits, digitsIlikePattern(digits), formatCpfCnpj(digits), trimmed]));
      documentPatterns.forEach((pattern) => {
        queries.push(
          db
            .from("clients")
            .select("id")
            .ilike("document", `%${pattern}%`)
            .limit(LIMITE_BUSCA)
        );
      });
      queries.push(
        db
          .from("clients")
          .select("id")
          .ilike("whatsapp", `%${digitsIlikePattern(digits)}%`)
          .limit(LIMITE_BUSCA)
      );
    }

    const results = await Promise.all(queries);
    const errored = results.find((result) => result.error);

    if (errored?.error) {
      console.error("Error searching dynamic clients:", errored.error);
      return [];
    }

    // O corte tem que valer para a UNIÃO, não para cada consulta: são até 6
    // consultas (nome + 4 padrões de documento + WhatsApp) e somando os `.limit()`
    // individuais a lista chegava a 6x LIMITE_BUSCA ids — o `.in()` seguinte
    // estouraria a URL do mesmo jeito (400 "Bad Request" acima de ~24,9 KB).
    const unicos = Array.from(
      new Set(results.flatMap((result) => (result.data || []).map((c: any) => String(c.id)))),
    );
    // `>=` e não `>`: com a união batendo exatamente no teto, cada consulta já
    // veio no próprio `.limit()` e quase certamente sobrou gente. Mesmo critério
    // do caminho da RPC — avisar a mais é melhor que calar.
    setBuscaTruncada(unicos.length >= LIMITE_BUSCA);
    return unicos.slice(0, LIMITE_BUSCA);
  };

  const fetchDynamicClients = async (pageNumber: number) => {
    if (!condition) return [];
    const offset = pageNumber * pageSize;

    let clientIds: string[] = [];
    const searchClientIds = hasSearchFilter ? await getSearchMatchingClientIds(effectiveSearch) : null;
    if (searchClientIds && searchClientIds.length === 0) return [];

    if (isOrderStatusCondition) {
      // For order_status_equals, query orders table directly
      const matchStatuses = getStatusAliases(String(condition.value).toLowerCase());
      let ordersQuery = db
        .from("orders")
        .select("client_id")
        .eq("seller_id", sellerId)
        .in("order_status", matchStatuses)
        .not("client_id", "is", null);

      if (searchClientIds) {
        ordersQuery = ordersQuery.in("client_id", searchClientIds);
      }

      if (dateRange?.from) {
        ordersQuery = ordersQuery.gte("updated_at", dateRange.from.toISOString());
      }
      if (dateRange?.to) {
        const toEnd = new Date(dateRange.to);
        toEnd.setHours(23, 59, 59, 999);
        ordersQuery = ordersQuery.lte("updated_at", toEnd.toISOString());
      }

      const { data: matchingOrders, error: ordersError } = await ordersQuery;
      if (ordersError) throw ordersError;
      if (!matchingOrders || matchingOrders.length === 0) return [];

      const allIds: string[] = matchingOrders.map((o: any) => String(o.client_id));
      const seen = new Set<string>();
      const uniqueIds = allIds.filter((id) => { if (seen.has(id)) return false; seen.add(id); return true; });
      clientIds = uniqueIds.slice(offset, offset + pageSize);
      if (clientIds.length === 0) return [];
    } else {
      let metricsQuery = db
        .from("client_metrics")
        .select("client_id")
        .eq("seller_id", sellerId);

      metricsQuery = applyConditionFilter(metricsQuery);

      if (searchClientIds) {
        metricsQuery = metricsQuery.in("client_id", searchClientIds);
      }

      if (dateRange?.from) {
        metricsQuery = metricsQuery.gte("last_order_at", dateRange.from.toISOString());
      }
      if (dateRange?.to) {
        const toEnd = new Date(dateRange.to);
        toEnd.setHours(23, 59, 59, 999);
        metricsQuery = metricsQuery.lte("last_order_at", toEnd.toISOString());
      }

      metricsQuery = metricsQuery
        .order("client_id", { ascending: true })
        .range(offset, offset + pageSize - 1);

      const { data: metricsData, error: metricsError } = await metricsQuery;
      if (metricsError) throw metricsError;
      if (!metricsData || metricsData.length === 0) return [];

      clientIds = metricsData.map((m: any) => m.client_id);
    }

    const { data: clients, error: clientsError } = await db
      .from("clients")
      .select("id, full_name, document, whatsapp, email, city, state_code")
      .in("id", clientIds);
    if (clientsError) throw clientsError;

    const { data: orders } = await db
      .from("orders")
      .select("client_id, total_amount, acquired_at, product, marketplace")
      .eq("seller_id", sellerId)
      .in("client_id", clientIds)
      .order("acquired_at", { ascending: false });

    const orderMap = new Map();
    orders?.forEach((o: any) => {
      if (!orderMap.has(o.client_id)) orderMap.set(o.client_id, o);
    });

    const { data: metricsForDisplay } = await db
      .from("client_metrics")
      .select("client_id, total_orders, total_spent, last_order_at")
      .eq("seller_id", sellerId)
      .in("client_id", clientIds);

    const metricsMap = new Map();
    metricsForDisplay?.forEach((m: any) => metricsMap.set(m.client_id, m));

    const result = clientIds.map((clientId: string) => {
      const client = clients?.find((c: any) => c.id === clientId);
      if (!client) return null;
      const metrics = metricsMap.get(clientId);
      return {
        id: `dynamic-${clientId}`,
        client_id: clientId,
        stage_id: stage.id,
        seller_id: sellerId,
        moved_at: metrics?.last_order_at || new Date().toISOString(),
        clients: client,
        orders: orderMap.get(clientId) || null,
        interactions: [],
        _metrics: metrics,
      };
    }).filter(Boolean);

    // Client-side sorting
    return sortClients(result);
  };

  const sortClients = (clients: any[]) => {
    return [...clients].sort((a, b) => {
      switch (sortOption) {
        case "moved_at_desc":
          return new Date(b.moved_at).getTime() - new Date(a.moved_at).getTime();
        case "moved_at_asc":
          return new Date(a.moved_at).getTime() - new Date(b.moved_at).getTime();
        case "name_asc":
          return (a.clients?.full_name || "").localeCompare(b.clients?.full_name || "", "pt-BR");
        case "name_desc":
          return (b.clients?.full_name || "").localeCompare(a.clients?.full_name || "", "pt-BR");
        case "order_value_desc":
          return (b.orders?.total_amount || 0) - (a.orders?.total_amount || 0);
        case "order_value_asc":
          return (a.orders?.total_amount || 0) - (b.orders?.total_amount || 0);
        default:
          return 0;
      }
    });
  };

  // Contagem do cabeçalho. O `dateRange` precisa entrar na chave E nas duas
  // consultas: fetchDynamicClients já recorta por data, e sem isso o cabeçalho
  // contava a fase inteira enquanto a lista mostrava só a faixa — "(6)" em cima
  // de "Nenhum cliente encontrado" assim que alguém usa "Filtrar por período".
  const { data: totalCount = 0 } = useQuery({
    queryKey: [
      "dynamic-count",
      sellerId,
      stage.id,
      condition?.type,
      condition?.value,
      effectiveSearch,
      dateRange?.from?.toISOString(),
      dateRange?.to?.toISOString(),
    ],
    queryFn: async () => {
      if (!condition) return 0;

      const searchClientIds = hasSearchFilter ? await getSearchMatchingClientIds(effectiveSearch) : null;
      if (searchClientIds && searchClientIds.length === 0) return 0;

      // Mesmo limite superior de fetchDynamicClients: o dia escolhido conta inteiro.
      const rangeEnd = dateRange?.to ? new Date(dateRange.to) : null;
      rangeEnd?.setHours(23, 59, 59, 999);

      if (isOrderStatusCondition) {
        const matchStatuses = getStatusAliases(String(condition.value).toLowerCase());
        let query = db
          .from("orders")
          .select("client_id")
          .eq("seller_id", sellerId)
          .in("order_status", matchStatuses)
          .not("client_id", "is", null);

        if (searchClientIds) {
          query = query.in("client_id", searchClientIds);
        }
        if (dateRange?.from) query = query.gte("updated_at", dateRange.from.toISOString());
        if (rangeEnd) query = query.lte("updated_at", rangeEnd.toISOString());

        const { data: matchingOrders, error } = await query;
        if (error) throw error;
        if (!matchingOrders) return 0;
        const seen = new Set<string>();
        matchingOrders.forEach((o: any) => seen.add(String(o.client_id)));
        return seen.size;
      }

      let query = db
        .from("client_metrics")
        .select("*", { count: "exact", head: true })
        .eq("seller_id", sellerId);
      query = applyConditionFilter(query);
      if (searchClientIds) {
        query = query.in("client_id", searchClientIds);
      }
      if (dateRange?.from) query = query.gte("last_order_at", dateRange.from.toISOString());
      if (rangeEnd) query = query.lte("last_order_at", rangeEnd.toISOString());
      const { count, error } = await query;
      if (error) throw error;
      return count || 0;
    },
  });

  // Load initial data
  const { isLoading } = useQuery({
    queryKey: ["dynamic-initial", sellerId, stage.id, condition?.type, condition?.value, sortOption, dateRange?.from?.toISOString(), dateRange?.to?.toISOString(), effectiveSearch],
    queryFn: async () => {
      const data = await fetchDynamicClients(0);
      setLoadedClients(data);
      setPage(0);
      setHasMoreData(data.length === pageSize);
      return data;
    },
  });

  // Reset on sort/date change
  useEffect(() => {
    setLoadedClients([]);
    setPage(0);
    setHasMoreData(true);
  }, [sortOption, dateRange, effectiveSearch]);

  const loadMoreData = useCallback(async () => {
    if (isLoadingMoreRef.current || !hasMoreData) return;
    isLoadingMoreRef.current = true;
    setIsLoadingMore(true);
    const nextPage = page + 1;
    try {
      const newData = await fetchDynamicClients(nextPage);
      if (newData.length > 0) {
        setLoadedClients((prev) => [...prev, ...newData]);
        setPage(nextPage);
        setHasMoreData(newData.length === pageSize);
      } else {
        setHasMoreData(false);
      }
    } finally {
      isLoadingMoreRef.current = false;
      setIsLoadingMore(false);
    }
  }, [hasMoreData, page, condition, sortOption, dateRange, effectiveSearch]);

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

  // Sem refiltro no navegador: a busca já é resolvida no servidor por
  // search_kanban_clients, que casa também e-mail — refiltrar aqui por
  // nome/documento/WhatsApp descartava justamente essas linhas e deixava a
  // coluna vazia com a contagem acima de zero.

  // ---------------------------------------------------------------- Export CSV
  //
  // O `.limit(5000)` que estava aqui NÃO era o teto que mordia. Quem cortava era
  // o max-rows do PostgREST (1.000 por requisição no padrão da Supabase): a
  // coluna "autoatribuição (+2)" do seller c5ccf5f3 tem 1.036 clientes medidos
  // em produção, o cabeçalho mostrava 1.036 (ele usa count exact, que o max-rows
  // não toca), o CSV vinha com 1.000 linhas e o toast ainda dizia "1000 clientes
  // exportados" como se fosse o total. Em "Segunda Compra" (88596c37) são 1.699
  // reais para as mesmas 1.000 linhas.
  //
  // Junto do teto, três perdas silenciosas que também saíam daqui:
  //  - `clientIds.slice(0, 500)` nas métricas: da linha 501 em diante as colunas
  //    Total Pedidos / Total Gasto / Último Pedido saíam EM BRANCO. Agora as
  //    métricas vêm da própria varredura, e não há segunda consulta para cortar.
  //  - `.in()` com a lista inteira: 1.036 uuids passam de 38 KB de URL e o
  //    PostgREST recusa — em coluna grande não saía arquivo nenhum, só erro.
  //  - busca e período da coluna não entravam no CSV: a tela mostrava um recorte
  //    e o arquivo trazia a condição inteira, sem nada indicando a troca.
  const handleExport = async () => {
    if (!condition) return;
    setIsExporting(true);
    const idToast = `export-${stage.id}`;
    toast.loading("Montando o CSV...", { id: idToast });
    try {
      // Mesmo limite superior do cabeçalho e da lista: o dia escolhido conta inteiro.
      const rangeEnd = dateRange?.to ? new Date(dateRange.to) : null;
      rangeEnd?.setHours(23, 59, 59, 999);

      const searchClientIds = hasSearchFilter
        ? await getSearchMatchingClientIds(effectiveSearch)
        : null;
      if (searchClientIds && searchClientIds.length === 0) {
        toast.info("Nenhum cliente para exportar", { id: idToast });
        return;
      }

      let clientIds: string[] = [];
      let totalReal = 0;
      let truncado = false;
      /** `totalReal` é um PISO, não o total: a varredura parou antes de ver a
       *  última linha e ninguém sabe quantos existem. Muda o texto do aviso —
       *  "de 3.000" quando saíram 3.000 seria mentira com cara de conferência. */
      let totalEhPiso = false;
      const metricsMap = new Map<string, LinhaMetrica>();

      if (isOrderStatusCondition) {
        const matchStatuses = getStatusAliases(String(condition.value).toLowerCase());
        const montarPedidos = (de: number, ate: number) => {
          let q = db
            .from("orders")
            .select("client_id")
            .eq("seller_id", sellerId)
            .in("order_status", matchStatuses)
            .not("client_id", "is", null);
          if (searchClientIds) q = q.in("client_id", searchClientIds);
          if (dateRange?.from) q = q.gte("updated_at", dateRange.from.toISOString());
          if (rangeEnd) q = q.lte("updated_at", rangeEnd.toISOString());
          // Ordem fixa: `.range()` sem ordenação devolve página instável, e o
          // mesmo pedido podia vir duas vezes enquanto outro nunca aparecia.
          return q.order("client_id", { ascending: true }).range(de, ate);
        };
        // Aqui a linha é PEDIDO, não cliente: o mesmo cliente ocupa várias, por
        // isso o orçamento de linhas é maior que o teto de clientes.
        const { linhas, truncado: pedidosCortados } = await varrerEmPaginas<{ client_id: string }>(
          montarPedidos,
          MAX_LINHAS_CSV * 5,
        );
        const vistos = new Set<string>();
        linhas.forEach((o) => vistos.add(String(o.client_id)));
        totalReal = vistos.size;
        clientIds = [...vistos].slice(0, MAX_LINHAS_CSV);
        // `pedidosCortados` não pode ser descartado: se a varredura parou no
        // orçamento de linhas, `vistos` é um piso, não o total — sem isso o CSV
        // sairia sem os clientes do fim e o toast diria "N exportados" como se
        // fosse tudo, que é exatamente o defeito original.
        truncado = pedidosCortados || clientIds.length < totalReal;
        totalEhPiso = pedidosCortados;
      } else {
        const montarMetrics = (de: number, ate: number) => {
          let q = db
            .from("client_metrics")
            .select("client_id, total_orders, total_spent, last_order_at")
            .eq("seller_id", sellerId);
          q = applyConditionFilter(q);
          if (searchClientIds) q = q.in("client_id", searchClientIds);
          if (dateRange?.from) q = q.gte("last_order_at", dateRange.from.toISOString());
          if (rangeEnd) q = q.lte("last_order_at", rangeEnd.toISOString());
          return q.order("client_id", { ascending: true }).range(de, ate);
        };
        const { linhas, truncado: bateuNoTeto } = await varrerEmPaginas<LinhaMetrica>(
          montarMetrics,
          MAX_LINHAS_CSV,
        );
        clientIds = linhas.map((m) => String(m.client_id));
        linhas.forEach((m) => metricsMap.set(String(m.client_id), m));
        // `totalCount` é count exact da MESMA consulta (mesmos filtros), então é
        // ele quem sabe o "de quantos" honesto quando a varredura para antes.
        totalReal = Math.max(totalCount, clientIds.length);
        // `bateuNoTeto` sozinho dá falso positivo no limite exato: uma coluna com
        // exatamente MAX_LINHAS_CSV clientes sai INTEIRA e o laço para no
        // orçamento do mesmo jeito — o arquivo viria batizado de
        // "_20000-de-20000" e o toast avisaria um corte que não houve. Quem
        // decide é o count exact do cabeçalho; ele só não vale se não respondeu
        // (fica 0), e aí "bateu no teto" volta a valer, porque avisar a mais é
        // melhor que calar.
        truncado = clientIds.length < totalReal || (bateuNoTeto && totalCount === 0);
        totalEhPiso = bateuNoTeto && totalCount === 0;
      }

      if (clientIds.length === 0) {
        toast.info("Nenhum cliente para exportar", { id: idToast });
        return;
      }

      toast.loading(
        `Montando o CSV (${clientIds.length.toLocaleString("pt-BR")} clientes)...`,
        { id: idToast },
      );

      // Daqui para baixo tudo vai em lotes de LOTE_IN: é o `.in()` que estourava
      // a URL quando recebia a lista inteira.
      const clientesPorId = new Map<string, Partial<LinhaCliente>>();
      for (const lote of emLotes(clientIds, LOTE_IN)) {
        const { data, error } = await db
          .from("clients")
          .select("id, full_name, whatsapp, email, city, state_code, document")
          .in("id", lote);
        if (error) throw error;
        (data as LinhaCliente[] | null)?.forEach((c) => clientesPorId.set(String(c.id), c));
      }

      const orderMap = new Map<string, LinhaPedido>();
      for (const lote of emLotes(clientIds, LOTE_IN)) {
        // Paginado também: 200 clientes juntos passam de 1.000 pedidos com
        // folga, e uma página cortada deixaria Produto/Marketplace em branco
        // exatamente como o slice das métricas deixava. Só o primeiro pedido de
        // cada cliente é usado — e ele só é o primeiro se a ordem vier inteira.
        const { linhas } = await varrerEmPaginas<LinhaPedido>(
          (de, ate) =>
            db
              .from("orders")
              .select("client_id, total_amount, product, marketplace")
              .eq("seller_id", sellerId)
              .in("client_id", lote)
              .order("acquired_at", { ascending: false })
              .order("id", { ascending: false })
              .range(de, ate),
          MAX_LINHAS_CSV,
        );
        linhas.forEach((o) => {
          const cid = String(o.client_id);
          if (!orderMap.has(cid)) orderMap.set(cid, o);
        });
      }

      // Só o ramo de status de pedido chega aqui sem métricas: no outro elas já
      // vieram da varredura, para todas as linhas e não só para as 500 primeiras.
      if (metricsMap.size === 0) {
        for (const lote of emLotes(clientIds, LOTE_IN)) {
          const { data } = await db
            .from("client_metrics")
            .select("client_id, total_orders, total_spent, last_order_at")
            .eq("seller_id", sellerId)
            .in("client_id", lote);
          (data as LinhaMetrica[] | null)?.forEach((m) => metricsMap.set(String(m.client_id), m));
        }
      }

      const headers = ["Nome", "WhatsApp", "E-mail", "Cidade", "UF", "Documento", "Total Pedidos", "Total Gasto (R$)", "Último Pedido", "Produto", "Marketplace"];
      // Map em vez do `clients.find()` de antes: com 20.000 linhas o find fazia
      // 400 milhões de comparações e travava a aba antes de salvar o arquivo.
      const rows = clientIds.map((cid) => {
        const c = clientesPorId.get(cid) || {};
        const o = orderMap.get(cid);
        const m = metricsMap.get(cid);
        return [
          c.full_name || "",
          c.whatsapp || "",
          c.email || "",
          c.city || "",
          c.state_code || "",
          c.document || "",
          m?.total_orders || 0,
          m?.total_spent ? Number(m.total_spent).toFixed(2) : "",
          m?.last_order_at ? new Date(m.last_order_at).toLocaleDateString("pt-BR") : "",
          o?.product || "",
          o?.marketplace || "",
        ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",");
      });

      const csvContent = [headers.join(","), ...rows].join("\n");
      const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      // O corte vai no NOME do arquivo: o toast some em segundos, o CSV fica no
      // computador de alguém por meses sendo tratado como a lista completa.
      const deQuantos = `${totalEhPiso ? "mais-de-" : ""}${totalReal}`;
      const sufixo = truncado ? `_${clientIds.length}-de-${deQuantos}` : "";
      link.download = `${stage.name.replace(/\s+/g, "_")}_clientes${sufixo}.csv`;
      link.click();
      URL.revokeObjectURL(url);

      if (truncado) {
        setUltimoCorte({ saiu: clientIds.length, total: totalReal, piso: totalEhPiso });
        toast.warning(
          `Exportados os primeiros ${clientIds.length.toLocaleString("pt-BR")} de ${totalEhPiso ? "mais de " : ""}${totalReal.toLocaleString("pt-BR")} clientes`,
          { id: idToast, duration: 12000 },
        );
      } else {
        setUltimoCorte(null);
        toast.success(
          `${clientIds.length.toLocaleString("pt-BR")} clientes exportados`,
          { id: idToast },
        );
      }
    } catch (err) {
      console.error("Export error:", err);
      // Explícito que NADA foi baixado: sem isso o usuário procura um arquivo
      // parcial que não existe, ou pior, acha que baixou.
      toast.error("Erro ao exportar clientes — nenhum arquivo foi baixado", { id: idToast });
    } finally {
      setIsExporting(false);
    }
  };

  const statusDisplayNames: Record<string, string> = {
    'enviado': 'Enviado',
    'entregue': 'Entregue',
    'preparando_envio': 'Prep. Envio',
  };

  const conditionLabel = condition
    ? {
        min_orders: `${condition.value}+ compras`,
        exact_orders: `Exato ${condition.value} compras`,
        min_spent: `R$${condition.value}+ gasto`,
        last_order_within_days: `Comprou há ${condition.value}d`,
        no_order_days: `Inativo ${condition.value}d+`,
        order_status_equals: `Status: ${statusDisplayNames[String(condition.value)] || condition.value}`,
      }[condition.type] || ""
    : "";

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
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuLabel>Ordenar por</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setSortOption("moved_at_desc")} className={sortOption === "moved_at_desc" ? "bg-accent" : ""}>
            <ArrowDown className="h-3 w-3 mr-2" /> Último Pedido (Recente)
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setSortOption("moved_at_asc")} className={sortOption === "moved_at_asc" ? "bg-accent" : ""}>
            <ArrowUp className="h-3 w-3 mr-2" /> Último Pedido (Antigo)
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setSortOption("name_asc")} className={sortOption === "name_asc" ? "bg-accent" : ""}>
            <ArrowUp className="h-3 w-3 mr-2" /> Nome (A-Z)
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setSortOption("name_desc")} className={sortOption === "name_desc" ? "bg-accent" : ""}>
            <ArrowDown className="h-3 w-3 mr-2" /> Nome (Z-A)
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setSortOption("order_value_desc")} className={sortOption === "order_value_desc" ? "bg-accent" : ""}>
            <ArrowDown className="h-3 w-3 mr-2" /> Valor (Maior)
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setSortOption("order_value_asc")} className={sortOption === "order_value_asc" ? "bg-accent" : ""}>
            <ArrowUp className="h-3 w-3 mr-2" /> Valor (Menor)
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

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
          <DropdownMenuItem onClick={handleExport} disabled={isExporting || totalCount === 0}>
            {isExporting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Download className="h-4 w-4 mr-2" />
            )}
            {/* O teto aparece ANTES do clique, não só no toast depois: quem
                tem coluna maior que MAX_LINHAS_CSV já lê no menu que o
                arquivo vai sair cortado. */}
            {totalCount > MAX_LINHAS_CSV
              ? `Exportar CSV (${MAX_LINHAS_CSV.toLocaleString("pt-BR")} de ${totalCount.toLocaleString("pt-BR")})`
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
      {/* Cabeçalho: fundo neutro, a cor da fase vive só na bolinha. */}
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
          clientCount={totalCount}
          sellerId={sellerId}
          hasClients={totalCount > 0}
          isEntry={!!stage.is_entry}
          direita={mobile ? <div className="flex shrink-0 items-center gap-1.5">{ferramentas}</div> : undefined}
          semMargem={mobile}
          pedidoExcluir={pedidoExcluir}
        />

        <div className="flex items-center gap-1.5 -mt-1 mb-2">
          <Badge
            variant="outline"
            className="text-[10px] h-4 gap-1 border-warning/40 text-warning bg-warning/10"
          >
            {isDynamic ? <Filter className="h-2.5 w-2.5" /> : <Zap className="h-2.5 w-2.5" />}
            {isDynamic ? "Dinâmica" : "Auto"}
          </Badge>
          {conditionLabel && (
            <Badge
              variant="outline"
              className="text-[10px] h-4 border-muted-foreground/30 text-muted-foreground"
            >
              {conditionLabel}
            </Badge>
          )}
        </div>

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

        {hasDateFilter && dateRangeLabel && (
          <div className="flex items-center gap-1 mt-2">
            <Badge variant="outline" className="text-xs h-5 gap-1 border-primary/40 text-primary bg-primary/5 pr-1">
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

        {boardFiltersActive && (
          <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
            Fase por regra: a lista sai da condição, então os filtros de Loja,
            Marketplace e Período do topo não se aplicam a esta coluna.
          </p>
        )}

        {/* A busca bateu no teto da RPC. Sem esta linha a coluna mostraria um
            recorte parcial com cara de resultado completo — o mesmo silêncio
            que fazia o CSV parecer inteiro. */}
        {buscaTruncada && (
          <p className="mt-2 text-[11px] leading-snug text-warning">
            Busca limitada aos {LIMITE_BUSCA.toLocaleString("pt-BR")} primeiros
            clientes que casam com o termo. Refine a busca para ver o resto.
          </p>
        )}

        {/* Fica na tela depois que o toast some: o CSV que está na pasta de
            downloads não tem tudo, e o número diz exatamente o quanto falta. */}
        {ultimoCorte && (
          <p className="mt-2 text-[11px] leading-snug text-warning">
            Último CSV: {ultimoCorte.saiu.toLocaleString("pt-BR")} de{" "}
            {ultimoCorte.piso ? "mais de " : ""}
            {ultimoCorte.total.toLocaleString("pt-BR")} clientes.
          </p>
        )}
      </Card>

      {/* Lista. Sem drop: quem entra nesta fase é a condição, não o arrasto. */}
      <Card
        ref={scrollContainerRef}
        data-kanban-column-list
        className={
          mobile
            ? `flex-1 min-h-0 overflow-y-auto rounded-none border-0 bg-transparent px-0 pt-3 shadow-none space-y-2 ${
                // Espaço para a barra de seleção flutuante não cobrir o último card.
                selectionMode ? "pb-20" : "pb-4"
              }`
            : "flex-1 min-h-0 overflow-y-auto rounded-t-none bg-muted/40 p-3 space-y-2"
        }
      >
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : loadedClients.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-8">
            {hasActiveFilter ? "Nenhum cliente encontrado" : "Nenhum cliente atende à condição"}
          </p>
        ) : (
          <>
            {loadedClients.map((client) => (
              <ClientCard
                key={client.id}
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
            <DialogDescription>Data do último pedido.</DialogDescription>
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
    </div>
  );
}
