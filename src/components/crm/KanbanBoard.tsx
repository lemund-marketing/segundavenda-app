import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { KanbanColumn } from "./KanbanColumn";
import { DynamicKanbanColumn } from "./DynamicKanbanColumn";
import { ClientDetailSheet } from "./ClientDetailSheet";
import { AddStageColumn } from "./AddStageColumn";
import { ActiveFilterChips, type ActiveChip } from "./ActiveFilterChips";
import { BulkActionBar } from "./BulkActionBar";
import { KanbanFilterBar } from "./KanbanFilterBar";
import { KanbanMoreFiltersSheet } from "./KanbanMoreFiltersSheet";
import { NoStageSheet } from "./NoStageSheet";
import {
  PipelineKpis,
  PipelineKpisSkeleton,
  PipelineResumoMobile,
  PipelineResumoMobileSkeleton,
} from "./PipelineKpis";
import {
  KANBAN_PERIODS,
  KANBAN_RECENCY,
  KanbanFilterContext,
  countActiveKanbanFilters,
  isConditionalStage,
  isKanbanFiltersActive,
  makeEmptyKanbanFilters,
  type KanbanAdvancedFilters,
  type KanbanFilterState,
} from "./kanbanFilters";
import { useKanbanFilterOptions, usePipelineMetrics } from "./usePipelineMetrics";
import { formatMarketplaceName } from "@/utils/formatters";
import { toast } from "sonner";
import { GripHorizontal, Plus } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import type { EmbedClient } from "@/lib/embedClient";
import { useVoltarFecha } from "@/app/nativo/useVoltarFecha"; // app: o Voltar do Android mora em src/app

const STAGE_REORDER_MIME = "application/x-stage-reorder";

/** `.in()` com centenas de uuids estoura o tamanho da URL do PostgREST. */
const BULK_CHUNK = 200;

interface KanbanBoardProps {
  sellerId: string;
  dbClient?: EmbedClient;
  onClientSelected?: (clientId: string) => void;
  onClientMoved?: (clientId: string, stageId: string, stageName: string) => void;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

const csvEscape = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;

export function KanbanBoard({ sellerId, dbClient, onClientSelected, onClientMoved }: KanbanBoardProps) {
  const db: any = dbClient || supabase;
  const isEmbed = !!dbClient;
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [draggingStageId, setDraggingStageId] = useState<string | null>(null);
  const [overStageId, setOverStageId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const boardScrollRef = useRef<HTMLDivElement>(null);
  const dragScrollRef = useRef({ active: false, startX: 0, startScroll: 0 });

  // Celular (22/10/2026): uma fase por vez, com abas no topo do quadro e
  // deslizar de lado entre as fases. O embed fica como está.
  const isMobile = useIsMobile();
  const mobile = isMobile && !isEmbed;
  const carrosselRef = useRef<HTMLDivElement>(null);
  const abasRef = useRef<HTMLDivElement>(null);
  const secaoQuadroRef = useRef<HTMLElement>(null);
  const [faseAtiva, setFaseAtiva] = useState(0);
  /** Fases cuja coluna tem período próprio ligado (a contagem da aba some nelas). */
  const [colunasComPeriodo, setColunasComPeriodo] = useState<Set<string>>(() => new Set());
  const aoMudarPeriodoDaColuna = useCallback((stageId: string, ativo: boolean) => {
    setColunasComPeriodo((prev) => {
      if (prev.has(stageId) === ativo) return prev;
      const next = new Set(prev);
      if (ativo) next.add(stageId);
      else next.delete(stageId);
      return next;
    });
  }, []);

  // ---------------------------------------------------------------------------
  // Filtros do topo
  // ---------------------------------------------------------------------------
  const [globalSearch, setGlobalSearch] = useState("");
  const [debouncedGlobalSearch, setDebouncedGlobalSearch] = useState("");
  const [filterMarketplace, setFilterMarketplace] = useState("all");
  // A UI do filtro de loja saiu (orders.store_id nulo em toda a base), mas o
  // `_store_id` continua indo para a RPC: no dia em que a integração gravar a
  // loja, basta devolver o dropdown.
  const [filterStoreId, setFilterStoreId] = useState("all");
  const [filterPeriod, setFilterPeriod] = useState("all");
  const [advancedFilters, setAdvancedFilters] = useState<KanbanAdvancedFilters>(makeEmptyKanbanFilters);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [noStageOpen, setNoStageOpen] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedClients, setSelectedClients] = useState<Set<string>>(new Set());
  /** Cards em trânsito: o card mostra spinner e trava o arrasto enquanto isso. */
  const [movingClients, setMovingClients] = useState<Set<string>>(new Set());

  useEffect(() => {
    const t = setTimeout(() => setDebouncedGlobalSearch(globalSearch), 300);
    return () => clearTimeout(t);
  }, [globalSearch]);

  const periodStart = useMemo(() => {
    if (filterPeriod === "all") return null;
    return new Date(Date.now() - parseInt(filterPeriod, 10) * 86400_000).toISOString();
  }, [filterPeriod]);

  const advActive = isKanbanFiltersActive(advancedFilters);
  const advCount = countActiveKanbanFilters(advancedFilters);

  const toggleSelected = useCallback((clientId: string) => {
    setSelectedClients((prev) => {
      const next = new Set(prev);
      if (next.has(clientId)) next.delete(clientId);
      else next.add(clientId);
      return next;
    });
  }, []);

  const exitSelection = useCallback(() => {
    setSelectionMode(false);
    setSelectedClients(new Set());
  }, []);
  // app: a barra de seleção flutua sobre o quadro; o Voltar a fecha antes de trocar de tela.
  useVoltarFecha(selectionMode, exitSelection);

  // As colunas leem daqui em vez de receber props: o cabeçalho e as colunas são
  // mantidos em frentes separadas, e o contexto evita mexer na assinatura delas.
  const filterState = useMemo<KanbanFilterState>(
    () => ({
      search: debouncedGlobalSearch,
      marketplace: filterMarketplace !== "all" ? filterMarketplace : null,
      storeId: filterStoreId !== "all" ? filterStoreId : null,
      periodStart,
      advanced: advActive ? advancedFilters : null,
      selectionMode,
      selectedClients,
      toggleSelected,
    }),
    [
      debouncedGlobalSearch,
      filterMarketplace,
      filterStoreId,
      periodStart,
      advActive,
      advancedFilters,
      selectionMode,
      selectedClients,
      toggleSelected,
    ],
  );

  // ---------------------------------------------------------------------------
  // Rolagem horizontal do quadro (roda + arrasto no fundo)
  // ---------------------------------------------------------------------------
  // A lista de cards da coluna precisa continuar rolando sozinha; como o
  // atributo `data-kanban-column-list` ainda não existe em toda coluna, a
  // checagem cai num teste genérico de ancestral rolável.
  const insideColumnList = useCallback((target: HTMLElement | null) => {
    let el: HTMLElement | null = target;
    const board = boardScrollRef.current;
    while (el && el !== board) {
      if (el.hasAttribute("data-kanban-column-list")) return true;
      const oy = getComputedStyle(el).overflowY;
      if ((oy === "auto" || oy === "scroll") && el.scrollHeight > el.clientHeight) return true;
      el = el.parentElement;
    }
    return false;
  }, []);

  const handleBoardWheel = useCallback(
    (e: React.WheelEvent<HTMLDivElement>) => {
      const el = boardScrollRef.current;
      if (!el) return;
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      if (insideColumnList(e.target as HTMLElement)) return;
      el.scrollLeft += e.deltaY;
    },
    [insideColumnList],
  );

  const handleBoardMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      const target = e.target as HTMLElement;
      // `[draggable='true']` é obrigatório: sem ele, arrastar um card pana o quadro.
      if (
        target.closest(
          "[data-kanban-column-list],button,a,input,textarea,select,[role='button'],[draggable='true']",
        )
      ) {
        return;
      }
      if (insideColumnList(target)) return;
      const el = boardScrollRef.current;
      if (!el) return;
      dragScrollRef.current = { active: true, startX: e.clientX, startScroll: el.scrollLeft };
      // Classe direto no nó: o cursor "grabbing" precisa valer só quando o pan
      // realmente começou, e um estado de React aqui re-renderizaria o quadro
      // inteiro a cada início e fim de arrasto.
      el.classList.add("is-panning");
    },
    [insideColumnList],
  );

  const handleBoardMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const st = dragScrollRef.current;
    if (!st.active) return;
    const el = boardScrollRef.current;
    if (!el) return;
    el.scrollLeft = st.startScroll - (e.clientX - st.startX);
  }, []);

  const handleBoardMouseUp = useCallback(() => {
    dragScrollRef.current.active = false;
    boardScrollRef.current?.classList.remove("is-panning");
  }, []);

  // ---------------------------------------------------------------------------
  // Dados
  // ---------------------------------------------------------------------------
  // Fetch pipeline stages
  const { data: stages = [], isPending: fasesPendentes } = useQuery({
    queryKey: ['pipeline-stages', sellerId],
    queryFn: async () => {
      const { data, error } = await db
        .from('pipeline_stages')
        .select('*')
        .eq('seller_id', sellerId)
        .order('position');

      if (error) throw error;

      // Initialize default stages if none exist
      if (!data || data.length === 0) {
        await db.rpc('initialize_default_pipeline_stages', { _seller_id: sellerId });
        const { data: newData } = await db
          .from('pipeline_stages')
          .select('*')
          .eq('seller_id', sellerId)
          .order('position');
        return newData || [];
      }

      return data;
    },
  });

  // O cabeçalho não existe no embed: nenhuma dessas RPCs está no allowlist do
  // embed-proxy e o embed não tem sessão para o gate de seller_members.
  const { data: metrics } = usePipelineMetrics(sellerId, !isEmbed);
  const { data: filterOptions } = useKanbanFilterOptions(sellerId, !isEmbed);

  const invalidateMetrics = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['crm-metrics', sellerId] });
    // Um cliente que ganhou a primeira fase sai do KPI "Sem fase"; sem isto o
    // tile e o sheet continuavam mostrando o número anterior.
    queryClient.invalidateQueries({ queryKey: ['crm-no-stage', sellerId] });
    // Colunas por regra: o cliente pode ter entrado ou saído da condição.
    queryClient.invalidateQueries({ queryKey: ['dynamic-initial', sellerId] });
    queryClient.invalidateQueries({ queryKey: ['dynamic-count', sellerId] });
  }, [queryClient, sellerId]);

  const handleMoveClient = async (clientId: string, newStageId: string, oldStageId?: string) => {
    setMovingClients((prev) => new Set(prev).add(clientId));
    try {
      const { data: updated, error } = await db
        .from('client_pipeline')
        .update({
          stage_id: newStageId,
          previous_stage_id: oldStageId || null,
          moved_at: new Date().toISOString()
        })
        .eq('client_id', clientId)
        .eq('seller_id', sellerId)
        .select('client_id');

      if (error) throw error;

      // Um cliente listado por coluna de regra (DynamicKanbanColumn lê
      // client_metrics/orders) pode não ter linha em client_pipeline. O update
      // então casa ZERO linhas e o PostgREST devolve `error: null` — daí o
      // antigo "Cliente movido com sucesso" sem nada mudar. O `.select()` acima
      // é o que denuncia isso, e o vínculo é criado aqui.
      if ((updated || []).length === 0) {
        const { error: insertError } = await db.from('client_pipeline').insert({
          client_id: clientId,
          seller_id: sellerId,
          stage_id: newStageId,
          previous_stage_id: oldStageId || null,
          moved_at: new Date().toISOString(),
        });
        if (insertError) throw insertError;
      }

      // Log interaction
      await db.from('client_interactions').insert({
        client_id: clientId,
        seller_id: sellerId,
        interaction_type: 'stage_changed',
        content: 'Cliente movido para nova fase',
        created_by: dbClient ? 'embed' : (await supabase.auth.getUser()).data.user?.id,
      });

      // Invalidate queries to refresh both columns
      queryClient.invalidateQueries({ queryKey: ['column-initial', sellerId, newStageId] });
      queryClient.invalidateQueries({ queryKey: ['column-count', sellerId, newStageId] });
      if (oldStageId) {
        queryClient.invalidateQueries({ queryKey: ['column-initial', sellerId, oldStageId] });
        queryClient.invalidateQueries({ queryKey: ['column-count', sellerId, oldStageId] });
      }
      invalidateMetrics();

      // Notify embed parent
      if (onClientMoved) {
        const stage = stages.find(s => s.id === newStageId);
        onClientMoved(clientId, newStageId, stage?.name || '');
      }

      toast.success('Cliente movido com sucesso');
    } catch (error) {
      queryClient.invalidateQueries({ queryKey: ['column-initial', sellerId] });
      queryClient.invalidateQueries({ queryKey: ['column-count', sellerId] });
      toast.error('Erro ao mover cliente');
    } finally {
      setMovingClients((prev) => {
        const next = new Set(prev);
        next.delete(clientId);
        return next;
      });
    }
  };

  const maxPosition = stages.reduce((max, stage) => Math.max(max, stage.position), -1);

  const aoClicarCliente = (clientId: string) => {
    if (selectionMode) {
      toggleSelected(clientId);
      return;
    }
    setSelectedClientId(clientId);
    onClientSelected?.(clientId);
  };

  const handleReorderStages = async (fromStageId: string, toStageId: string) => {
    if (fromStageId === toStageId) return;
    const fromIdx = stages.findIndex(s => s.id === fromStageId);
    const toIdx = stages.findIndex(s => s.id === toStageId);
    if (fromIdx < 0 || toIdx < 0) return;

    const reordered = [...stages];
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);

    // Optimistic update
    queryClient.setQueryData(['pipeline-stages', sellerId], reordered);

    // Uma chamada só, atômica no banco. Antes eram N updates independentes em
    // Promise.all — e pipeline_stages tem UNIQUE (seller_id, position): mover
    // a fase 2 para a 0 esbarrava em quem ainda ocupava a 0. Como o supabase-js
    // NÃO lança em erro de PostgREST, o Promise.all resolvia, o toast dizia
    // "Fases reordenadas" e o refetch trazia a ordem antiga. Nunca funcionou.
    const { error } = await db.rpc('reordenar_pipeline_stages', {
      _seller_id: sellerId,
      _stage_ids: reordered.map((s) => s.id),
    });

    queryClient.invalidateQueries({ queryKey: ['pipeline-stages', sellerId] });

    if (error) {
      console.error('Error reordering stages:', error);
      toast.error(`Erro ao reordenar fases: ${error.message}`);
      return;
    }
    toast.success('Fases reordenadas');
  };

  // ---------------------------------------------------------------------------
  // Ações em massa (não enfileiram workflow nenhum — client_pipeline não tem
  // gatilho de disparo nesta base, e isso é para continuar assim)
  // ---------------------------------------------------------------------------
  const handleBulkMove = async (stageId: string) => {
    const ids = [...selectedClients];
    if (ids.length === 0) return;
    try {
      // Lê a fase de origem antes do update para preservar previous_stage_id: o
      // "há X" do card e o desfazer da exclusão de fase dependem dele.
      const origin = new Map<string, string>();
      for (const part of chunk(ids, BULK_CHUNK)) {
        const { data } = await supabase
          .from('client_pipeline')
          .select('client_id, stage_id')
          .eq('seller_id', sellerId)
          .in('client_id', part);
        (data || []).forEach((r: any) => origin.set(r.client_id, r.stage_id));
      }

      // Um grupo por fase de origem, para cada update poder gravar o
      // previous_stage_id certo. Quem NÃO tem linha em client_pipeline fica de
      // fora e é tratado logo abaixo: essa é a origem do bug do "N clientes
      // movidos" sem nada mudar — clientes listados por coluna de regra vêm de
      // client_metrics/orders e podem nunca ter tido vínculo.
      const byOrigin = new Map<string, string[]>();
      const semVinculo: string[] = [];
      ids.forEach((id) => {
        const from = origin.get(id);
        if (from === undefined) {
          semVinculo.push(id);
          return;
        }
        if (from === stageId) return;
        byOrigin.set(from, [...(byOrigin.get(from) || []), id]);
      });

      const movedAt = new Date().toISOString();
      let moved = 0;
      for (const [from, group] of byOrigin) {
        for (const part of chunk(group, BULK_CHUNK)) {
          // `.select()` no fim: sem ele o retorno não diz quantas linhas o
          // update casou, e somar `part.length` inventava o número do toast.
          const { data, error } = await supabase
            .from('client_pipeline')
            .update({ stage_id: stageId, previous_stage_id: from, moved_at: movedAt })
            .eq('seller_id', sellerId)
            .in('client_id', part)
            .select('client_id');
          if (error) throw error;
          moved += (data || []).length;
        }
      }

      for (const part of chunk(semVinculo, BULK_CHUNK)) {
        // UNIQUE (client_id, seller_id) faz o upsert ser o insert seguro aqui.
        const { data, error } = await supabase
          .from('client_pipeline')
          .upsert(
            part.map((client_id) => ({
              client_id,
              seller_id: sellerId,
              stage_id: stageId,
              moved_at: movedAt,
            })),
            { onConflict: 'client_id,seller_id' },
          )
          .select('client_id');
        if (error) throw error;
        moved += (data || []).length;
      }

      queryClient.invalidateQueries({ queryKey: ['column-initial', sellerId] });
      queryClient.invalidateQueries({ queryKey: ['column-count', sellerId] });
      invalidateMetrics();
      exitSelection();
      toast.success(`${moved} cliente${moved === 1 ? '' : 's'} movido${moved === 1 ? '' : 's'}`);
    } catch {
      toast.error('Erro ao mover os clientes selecionados');
    }
  };

  const handleBulkExport = async () => {
    const ids = [...selectedClients];
    if (ids.length === 0) return;
    try {
      const rows: any[] = [];
      for (const part of chunk(ids, BULK_CHUNK)) {
        // BULK_CHUNK = 200 é o que a URL do PostgREST aguenta, não um teto de
        // resultado: o laço cobre a seleção inteira. Este CSV não tem limite de
        // 1.000 — quem tinha eram os "Exportar CSV" das colunas.
        const { data, error } = await supabase
          .from('clients')
          .select('full_name, document, whatsapp, email, city, state_code')
          .in('id', part);
        if (error) throw error;
        rows.push(...(data || []));
      }
      const header = ['Nome', 'Documento', 'WhatsApp', 'E-mail', 'Cidade', 'UF'];
      const body = rows.map((r) =>
        [r.full_name, r.document, r.whatsapp, r.email, r.city, r.state_code].map(csvEscape).join(','),
      );
      // BOM: sem ele o Excel em pt-BR come os acentos.
      const csv = '﻿' + [header.map(csvEscape).join(','), ...body].join('\n');
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `kanban-selecionados-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);

      // Antes não havia toast nenhum: o arquivo caía na pasta e ninguém
      // conferia se as linhas batiam com o que estava selecionado. Se a
      // consulta devolver menos clientes do que os ids marcados (um cliente
      // apagado entre a seleção e o clique, por exemplo), o número aparece.
      if (rows.length < ids.length) {
        toast.warning(
          `${rows.length} de ${ids.length} clientes selecionados foram para o CSV`,
        );
      } else {
        toast.success(`${rows.length} cliente${rows.length === 1 ? '' : 's'} exportado${rows.length === 1 ? '' : 's'}`);
      }
    } catch {
      toast.error('Erro ao exportar');
    }
  };

  // ---------------------------------------------------------------------------
  // Chips de filtro ativo
  // ---------------------------------------------------------------------------
  const activeChips = useMemo<ActiveChip[]>(() => {
    const chips: ActiveChip[] = [];
    if (debouncedGlobalSearch) {
      chips.push({
        key: 'search',
        label: `Busca: ${debouncedGlobalSearch}`,
        onRemove: () => setGlobalSearch(''),
      });
    }
    if (filterMarketplace !== 'all') {
      chips.push({
        key: 'mkt',
        label: `Marketplace: ${formatMarketplaceName(filterMarketplace)}`,
        onRemove: () => setFilterMarketplace('all'),
      });
    }
    if (filterStoreId !== 'all') {
      const name = filterOptions?.stores.find((s) => s.id === filterStoreId)?.name || 'loja';
      chips.push({ key: 'store', label: `Loja: ${name}`, onRemove: () => setFilterStoreId('all') });
    }
    if (filterPeriod !== 'all') {
      const label = KANBAN_PERIODS.find((p) => p.value === filterPeriod)?.label || filterPeriod;
      chips.push({ key: 'period', label, onRemove: () => setFilterPeriod('all') });
    }

    const a = advancedFilters;
    // Data exata e preset de recência são mutuamente exclusivos no sheet
    // (alimentam o mesmo _last_order_from), então no máximo UM chip aparece.
    if (a.lastOrderFrom) {
      chips.push({
        key: 'recency',
        label: `Comprou desde ${new Date(a.lastOrderFrom).toLocaleDateString('pt-BR')}`,
        onRemove: () => setAdvancedFilters((p) => ({ ...p, lastOrderFrom: '' })),
      });
    } else if (a.recencyDays !== 'all') {
      chips.push({
        key: 'recency',
        label: KANBAN_RECENCY.find((r) => r.value === a.recencyDays)?.label || 'Recência',
        onRemove: () => setAdvancedFilters((p) => ({ ...p, recencyDays: 'all' })),
      });
    }
    if (a.minOrders.trim() || a.maxOrders.trim()) {
      chips.push({
        key: 'orders',
        label: `Pedidos: ${a.minOrders || '0'}–${a.maxOrders || '∞'}`,
        onRemove: () => setAdvancedFilters((p) => ({ ...p, minOrders: '', maxOrders: '' })),
      });
    }
    if (a.minSpent.trim() || a.maxSpent.trim()) {
      chips.push({
        key: 'spent',
        label: `Gasto: ${a.minSpent || '0'}–${a.maxSpent || '∞'}`,
        onRemove: () => setAdvancedFilters((p) => ({ ...p, minSpent: '', maxSpent: '' })),
      });
    }
    if (a.birthdayMonth) {
      chips.push({
        key: 'bday',
        label: 'Aniversariantes do mês',
        onRemove: () => setAdvancedFilters((p) => ({ ...p, birthdayMonth: false })),
      });
    }
    if (a.gender !== 'all') {
      chips.push({
        key: 'gender',
        label: a.gender === 'male' ? 'Masculino' : 'Feminino',
        onRemove: () => setAdvancedFilters((p) => ({ ...p, gender: 'all' })),
      });
    }
    if (a.stateCode !== 'all') {
      chips.push({
        key: 'uf',
        label: `UF: ${a.stateCode}`,
        onRemove: () => setAdvancedFilters((p) => ({ ...p, stateCode: 'all' })),
      });
    }
    if (a.city.trim()) {
      chips.push({
        key: 'city',
        label: `Cidade: ${a.city}`,
        onRemove: () => setAdvancedFilters((p) => ({ ...p, city: '' })),
      });
    }
    a.rfvSegments.forEach((seg) => {
      chips.push({
        key: `rfv-${seg}`,
        label: `RFV: ${seg}`,
        onRemove: () =>
          setAdvancedFilters((p) => ({
            ...p,
            rfvSegments: p.rfvSegments.filter((s) => s !== seg),
          })),
      });
    });
    return chips;
  }, [
    debouncedGlobalSearch,
    filterMarketplace,
    filterStoreId,
    filterPeriod,
    advancedFilters,
    filterOptions,
  ]);

  /**
   * Filtros próprios de cada coluna, por stage_id.
   *
   * Mora AQUI, e não dentro da coluna, por um motivo concreto: "Limpar todos"
   * precisa alcançá-los. Com o estado escondido na coluna, o usuário limpava os
   * chips do topo, via tudo sumir e as colunas continuavam filtradas — filtro
   * invisível é a pior espécie.
   *
   * Ausência da chave = a coluna segue os filtros do quadro. Aplicar um
   * conjunto vazio remove a chave, em vez de criar um terceiro estado
   * ("própria, porém vazia") que ficaria indistinguível na tela.
   */
  const [filtrosPorColuna, setFiltrosPorColuna] = useState<Record<string, KanbanAdvancedFilters>>({});

  const definirFiltrosDaColuna = useCallback(
    (stageId: string, next: KanbanAdvancedFilters | null) => {
      setFiltrosPorColuna((prev) => {
        const copia = { ...prev };
        if (!next || countActiveKanbanFilters(next) === 0) delete copia[stageId];
        else copia[stageId] = next;
        return copia;
      });
    },
    [],
  );

  const clearAllFilters = useCallback(() => {
    setGlobalSearch('');
    setFilterMarketplace('all');
    setFilterStoreId('all');
    setFilterPeriod('all');
    setAdvancedFilters(makeEmptyKanbanFilters());
    setFiltrosPorColuna({});
  }, []);

  // "Sem fase → mover para a primeira": a primeira é a FASE DE ENTRADA
  // (is_entry), não a coluna da esquerda — reordenar não pode trocar o destino.
  // Fallback para a manual de menor posição cobre seller ainda sem marca.
  const entryStage = stages.find((s) => s.is_entry) ?? stages.find((s) => !isConditionalStage(s)) ?? null;
  const firstStage = entryStage ? { id: entryStage.id, name: entryStage.name } : null;

  // Destinos válidos de "Mover para...": gravar client_pipeline.stage_id numa
  // fase por regra faz o cliente sumir do quadro — ela lista pela condição e
  // nunca lê client_pipeline, então ele sai da origem e não chega ao destino.
  const movableStages = useMemo(() => stages.filter((s) => !isConditionalStage(s)), [stages]);

  // Folhas (mais filtros, sem fase e a ficha do cliente): as mesmas no computador e no celular.
  const folhas = (
    <>
      {!isEmbed && (
        <>
          <KanbanMoreFiltersSheet
            open={advancedOpen}
            onOpenChange={setAdvancedOpen}
            value={advancedFilters}
            onApply={setAdvancedFilters}
            sellerId={sellerId}
            states={filterOptions?.states ?? []}
          />
          <NoStageSheet
            open={noStageOpen}
            onOpenChange={setNoStageOpen}
            sellerId={sellerId}
            firstStage={firstStage}
            onClientClick={(clientId) => {
              setNoStageOpen(false);
              setSelectedClientId(clientId);
              onClientSelected?.(clientId);
            }}
          />
        </>
      )}

      {/* Client Detail Sheet */}
      <ClientDetailSheet
        clientId={selectedClientId}
        sellerId={sellerId}
        open={!!selectedClientId}
        onOpenChange={(open) => !open && setSelectedClientId(null)}
      />
    </>
  );

  // ---------------------------------------------------------------------------
  // Celular: abas das fases + carrossel com uma fase por tela
  // ---------------------------------------------------------------------------
  const totalSlides = stages.length + 1; // + "Nova fase"
  useEffect(() => {
    if (faseAtiva > totalSlides - 1) setFaseAtiva(Math.max(0, totalSlides - 1));
  }, [faseAtiva, totalSlides]);

  // A aba ativa sempre à vista na fileira de abas (que rola de lado).
  useEffect(() => {
    if (!mobile) return;
    const fileira = abasRef.current;
    const aba = fileira?.children[faseAtiva] as HTMLElement | undefined;
    if (!fileira || !aba) return;
    fileira.scrollTo({ left: aba.offsetLeft - (fileira.clientWidth - aba.offsetWidth) / 2, behavior: "smooth" });
  }, [faseAtiva, mobile]);

  // Carrossel novo (girar o aparelho e voltar, ou a primeira montagem) nasce
  // em scrollLeft 0: posiciona na fase que a aba já marca, sem animação.
  useLayoutEffect(() => {
    const el = carrosselRef.current;
    if (!mobile || fasesPendentes || !el) return;
    el.scrollLeft = faseAtiva * el.clientWidth;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só quando o carrossel monta
  }, [mobile, fasesPendentes]);

  const irParaFase = (i: number) => {
    const el = carrosselRef.current;
    if (!el) return;
    setFaseAtiva(i);
    el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
    // Tocar numa aba traz o quadro inteiro para a tela (as abas no topo).
    secaoQuadroRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  };

  const aoRolarCarrossel = () => {
    const el = carrosselRef.current;
    if (!el || el.clientWidth === 0) return;
    const i = Math.round(el.scrollLeft / el.clientWidth);
    if (i !== faseAtiva) setFaseAtiva(i);
  };

  // Contagem nas abas = funil inteiro (as mesmas métricas do resumo). Com algum
  // filtro ligado ela some: a coluna mostra o número filtrado, e duas contagens
  // diferentes para a mesma fase, uma em cima da outra, leem como erro.
  const algumFiltro =
    !!debouncedGlobalSearch ||
    filterMarketplace !== "all" ||
    filterPeriod !== "all" ||
    advActive ||
    Object.keys(filtrosPorColuna).length > 0;

  if (mobile) {
    return (
      <KanbanFilterContext.Provider value={filterState}>
        <div className="flex min-h-full flex-col">
          {metrics ? (
            <PipelineResumoMobile metrics={metrics} stages={stages} onNoStageClick={() => setNoStageOpen(true)} />
          ) : (
            <PipelineResumoMobileSkeleton />
          )}

          <KanbanFilterBar
            mobile
            search={globalSearch}
            onSearchChange={setGlobalSearch}
            marketplace={filterMarketplace}
            onMarketplaceChange={setFilterMarketplace}
            period={filterPeriod}
            onPeriodChange={setFilterPeriod}
            options={filterOptions}
            advancedCount={advCount}
            onOpenAdvanced={() => setAdvancedOpen(true)}
            selectionMode={selectionMode}
            onToggleSelection={() => (selectionMode ? exitSelection() : setSelectionMode(true))}
          />

          <ActiveFilterChips chips={activeChips} onClearAll={clearAllFilters} />

          {/* O quadro tem a altura exata da área que rola (100cqh — o contêiner
              de CRM.tsx é `container-type: size` no celular): rolando a página
              até ele, as abas encostam no topo e a fase ocupa a tela, com a
              lista de cards rolando por dentro. */}
          {/* Só monta depois da primeira resposta das fases: o carrossel tem
              scroll-snap, e fases chegando DEPOIS do slide "Nova fase" fazem o
              navegador manter esse slide encaixado — a tela abria no
              "Adicionar fase". `isPending` e não `isSuccess`: um refetch que
              falha mantém as fases em cache, e o quadro não pode sumir. */}
          {fasesPendentes ? (
            <div className="mt-4 flex flex-col gap-3 px-4" aria-hidden>
              <div className="flex gap-2">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-9 w-28 animate-pulse rounded-full bg-muted" />
                ))}
              </div>
              <div className="h-[72px] animate-pulse rounded-3xl bg-muted" />
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-[84px] animate-pulse rounded-2xl bg-muted" />
              ))}
            </div>
          ) : (
          <section ref={secaoQuadroRef} className="mt-4 flex h-[100cqh] shrink-0 flex-col">
            <div
              ref={abasRef}
              role="tablist"
              aria-label="Fases do funil"
              className="flex shrink-0 gap-2 overflow-x-auto px-4 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {stages.map((stage, i) => (
                <button
                  key={stage.id}
                  type="button"
                  role="tab"
                  aria-selected={i === faseAtiva}
                  onClick={() => irParaFase(i)}
                  className={cn(
                    "flex h-9 shrink-0 items-center gap-2 rounded-full px-3.5 text-[13px] font-semibold transition-colors",
                    i === faseAtiva
                      ? "bg-primary/10 text-primary"
                      : "border border-border/60 bg-card text-muted-foreground active:bg-muted",
                  )}
                >
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: stage.color || "#6366f1" }} />
                  {stage.name}
                  {!algumFiltro && !colunasComPeriodo.has(stage.id) && metrics && !isConditionalStage(stage) && (
                    <span className="tabular-nums opacity-70">{(metrics.byStage[stage.id] || 0).toLocaleString("pt-BR")}</span>
                  )}
                </button>
              ))}
              <button
                type="button"
                role="tab"
                aria-selected={faseAtiva === stages.length}
                onClick={() => irParaFase(stages.length)}
                className={cn(
                  "flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold transition-colors",
                  faseAtiva === stages.length
                    ? "bg-primary/10 text-primary"
                    : "border border-dashed border-border bg-card text-muted-foreground active:bg-muted",
                )}
              >
                <Plus className="h-4 w-4" />
                Nova fase
              </button>
            </div>

            <div
              ref={carrosselRef}
              onScroll={aoRolarCarrossel}
              className="flex min-h-0 flex-1 snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {stages.map((stage) => (
                <div key={stage.id} className="h-full w-full shrink-0 snap-start snap-always px-4">
                  {isConditionalStage(stage) ? (
                    <DynamicKanbanColumn
                      mobile
                      stage={stage}
                      allStages={stages}
                      onClientClick={aoClicarCliente}
                      onMoveClient={handleMoveClient}
                      sellerId={sellerId}
                      dbClient={dbClient}
                      movingClients={movingClients}
                    />
                  ) : (
                    <KanbanColumn
                      mobile
                      stage={stage}
                      allStages={stages}
                      onClientClick={aoClicarCliente}
                      onMoveClient={handleMoveClient}
                      sellerId={sellerId}
                      dbClient={dbClient}
                      movingClients={movingClients}
                      columnFilters={filtrosPorColuna[stage.id] ?? null}
                      onColumnFiltersChange={definirFiltrosDaColuna}
                      onPeriodoDaColunaChange={aoMudarPeriodoDaColuna}
                    />
                  )}
                </div>
              ))}
              <div className="h-full w-full shrink-0 snap-start snap-always overflow-y-auto px-4">
                <AddStageColumn sellerId={sellerId} maxPosition={maxPosition} larguraCheia />
              </div>
            </div>
          </section>
          )}

          {selectionMode && (
            <BulkActionBar
              mobile
              count={selectedClients.size}
              stages={movableStages}
              onMoveTo={handleBulkMove}
              onExport={handleBulkExport}
              onCancel={exitSelection}
            />
          )}

          {folhas}
        </div>
      </KanbanFilterContext.Provider>
    );
  }

  return (
    <KanbanFilterContext.Provider value={filterState}>
    {/* `min-h-full` e não `h-full`: com o cabeçalho novo o conteúdo pode passar
        da altura de /crm, e aí quem rola é o contêiner da página (ver CRM.tsx).
        Com `h-full` o excedente era simplesmente cortado da lista de cards. */}
    <div className="min-h-full flex flex-col">
      {/* Cabeçalho: fora do embed apenas — nenhuma RPC daqui está no allowlist
          do embed-proxy, e EmbedCRM não deve mudar por causa deste trabalho. */}
      {!isEmbed && (
        <div className="flex-shrink-0">
          {/* Esqueleto de mesma altura enquanto get_pipeline_metrics não volta:
              sem ele o bloco era inserido depois e empurrava barra, chips e
              quadro para baixo de uma vez. */}
          {metrics ? (
            <PipelineKpis
              metrics={metrics}
              stages={stages}
              onNoStageClick={() => setNoStageOpen(true)}
            />
          ) : (
            <PipelineKpisSkeleton />
          )}

          <KanbanFilterBar
            search={globalSearch}
            onSearchChange={setGlobalSearch}
            marketplace={filterMarketplace}
            onMarketplaceChange={setFilterMarketplace}
            period={filterPeriod}
            onPeriodChange={setFilterPeriod}
            options={filterOptions}
            advancedCount={advCount}
            onOpenAdvanced={() => setAdvancedOpen(true)}
            selectionMode={selectionMode}
            onToggleSelection={() => (selectionMode ? exitSelection() : setSelectionMode(true))}
          />

          {/* Abaixo da barra de filtros, que é onde fica o botão "Selecionar":
              antes a barra entrava ACIMA dos KPIs e cada entrada/saída do modo
              de seleção sacudia a página inteira. */}
          {selectionMode && (
            <BulkActionBar
              count={selectedClients.size}
              stages={movableStages}
              onMoveTo={handleBulkMove}
              onExport={handleBulkExport}
              onCancel={exitSelection}
            />
          )}

          <ActiveFilterChips chips={activeChips} onClearAll={clearAllFilters} />
        </div>
      )}

      {/* Kanban Columns */}
      {/* No embed não há cabeçalho e `min-h-0` deixa a coluna caber inteira no
          iframe. Em /crm o cabeçalho come ~340px (e cresce com os chips, com a
          barra de seleção e com a legenda de 9 fases quebrando linha): sem um
          piso, num notebook de 768px sobravam ~2 cards visíveis por coluna. O
          piso é o que faz o contêiner de CRM.tsx rolar em vez de espremer. */}
      <div
        ref={boardScrollRef}
        // O piso vale 16rem no notebook e volta aos 24rem só em `2xl` (1536px):
        // com 384px fixos, um chip de filtro ativo ou o modo de seleção já
        // estouravam a soma e o contêiner de CRM.tsx passava a rolar a PÁGINA —
        // dois scrolls verticais aninhados disputando a mesma roda.
        className={`flex-1 ${isEmbed ? "min-h-0" : "min-h-[16rem] 2xl:min-h-[24rem]"} overflow-x-auto p-3 2xl:p-4 overflow-y-hidden kanban-scroll`}
        onWheel={handleBoardWheel}
        onMouseDown={handleBoardMouseDown}
        onMouseMove={handleBoardMouseMove}
        onMouseUp={handleBoardMouseUp}
        onMouseLeave={handleBoardMouseUp}
      >
        <div className="flex gap-4 h-full min-w-max">
          {stages.map((stage) => {
            const isConditional = stage.stage_type === 'dynamic' || stage.stage_type === 'auto_assign';
            const isDragging = draggingStageId === stage.id;
            const isOver = overStageId === stage.id && draggingStageId && draggingStageId !== stage.id;

            const wrapperProps = {
              // `data-kanban-column`: par do reset de cursor em index.css — o
              // `cursor: grab` do quadro é herdado e não pode vazar para dentro
              // da coluna, onde o pan está desativado.
              'data-kanban-column': true,
              className: `group relative flex flex-col h-full transition-opacity ${isDragging ? 'opacity-40' : ''} ${isOver ? 'ring-2 ring-primary rounded-lg' : ''}`,
              onDragOverCapture: (e: React.DragEvent) => {
                if (draggingStageId && draggingStageId !== stage.id) {
                  e.preventDefault();
                  e.stopPropagation();
                  e.dataTransfer.dropEffect = 'move';
                  if (overStageId !== stage.id) setOverStageId(stage.id);
                }
              },
              onDragLeave: () => {
                if (overStageId === stage.id) setOverStageId(null);
              },
              onDropCapture: (e: React.DragEvent) => {
                if (draggingStageId) {
                  e.preventDefault();
                  e.stopPropagation();
                  const fromId = draggingStageId;
                  const toId = stage.id;
                  setDraggingStageId(null);
                  setOverStageId(null);
                  if (fromId && fromId !== toId) {
                    handleReorderStages(fromId, toId);
                  }
                }
              },
            };

            const dragHandle = (
              <button
                type="button"
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = 'move';
                  e.dataTransfer.setData(STAGE_REORDER_MIME, stage.id);
                  e.dataTransfer.setData('text/plain', `stage:${stage.id}`);
                  setDraggingStageId(stage.id);
                }}
                onDragEnd={() => {
                  setDraggingStageId(null);
                  setOverStageId(null);
                }}
                className="absolute top-1 left-1/2 -translate-x-1/2 z-10 h-5 w-8 flex items-center justify-center rounded bg-background/70 backdrop-blur-sm border border-border/50 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing hover:bg-background"
                title="Arraste para reordenar a fase"
                aria-label="Reordenar fase"
              >
                <GripHorizontal className="h-3 w-3 text-muted-foreground" />
              </button>
            );

            if (isConditional) {
              return (
                <div key={stage.id} {...wrapperProps}>
                  {dragHandle}
                  <DynamicKanbanColumn
                    stage={stage}
                    allStages={stages}
                    onClientClick={aoClicarCliente}
                    onMoveClient={handleMoveClient}
                    sellerId={sellerId}
                    dbClient={dbClient}
                    movingClients={movingClients}
                  />
                </div>
              );
            }

            return (
              <div key={stage.id} {...wrapperProps}>
                {dragHandle}
                <KanbanColumn
                  stage={stage}
                  allStages={stages}
                  onClientClick={aoClicarCliente}
                  onMoveClient={handleMoveClient}
                  sellerId={sellerId}
                  dbClient={dbClient}
                  movingClients={movingClients}
                  columnFilters={filtrosPorColuna[stage.id] ?? null}
                  onColumnFiltersChange={definirFiltrosDaColuna}
                />
              </div>
            );
          })}

          <AddStageColumn sellerId={sellerId} maxPosition={maxPosition} />
        </div>
      </div>

      {folhas}
    </div>
    </KanbanFilterContext.Provider>
  );
}
