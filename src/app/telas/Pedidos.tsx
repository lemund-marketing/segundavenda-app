import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  AlertTriangle, ArrowDownUp, CalendarRange, ChevronLeft, ChevronRight, MapPin, Search, ShoppingCart, SlidersHorizontal, X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { ClientDetailSheet } from "@/components/crm/ClientDetailSheet";
import { OrderShipmentSheet } from "@/components/orders/OrderShipmentSheet";
import { OrdersTableV2, type OrderRow } from "@/components/pedidos/OrdersTableV2";
import { LojaMultiSelect } from "@/components/pedidos/LojaMultiSelect";
import { PedidosChartCard } from "@/components/pedidos/PedidosChartCard";
import { PedidosKpisMobile } from "@/components/pedidos/PedidosKpisMobile";
import {
  PedidosFiltersSheet,
  DEFAULT_ADVANCED_FILTERS,
  countActiveAdvanced,
  MAX_VALUE_CAP,
  type AdvancedFilters,
} from "@/components/pedidos/PedidosFiltersSheet";
import { CabecalhoTela, Pilulas } from "@/components/mobile/blocos";
import { useSellerContext } from "@/contexts/SellerContext";
import { useOrdersWithShipments } from "@/hooks/useOrderShipment";
import type { PedidosDataFilters } from "@/hooks/usePedidosKpis";
import { UF_LIST } from "@/lib/ufs";
import { cn } from "@/lib/utils";
import { groupOrdersByWindow, type OrderGroup } from "@/utils/groupOrdersByWindow";
import { LayoutApp } from "@/app/LayoutApp";
import {
  useListaPedidos,
  useLojasDoPeriodo,
  useStatusDoPeriodo,
  useSugestoesBusca,
  useTemStatusAtualizado,
  marcarWhatsAppContatado,
  type Sugestao,
} from "@/app/dados/usePedidos";
import { useVoltarFecha } from "@/app/nativo/useVoltarFecha";

const SORT_OPTIONS = [
  { value: "acquired_at:desc", label: "↓ Mais recentes" },
  { value: "acquired_at:asc", label: "↑ Mais antigos" },
  { value: "total_amount:desc", label: "↓ Maior valor" },
  { value: "total_amount:asc", label: "↑ Menor valor" },
  { value: "full_name:asc", label: "Cliente A–Z" },
  { value: "full_name:desc", label: "Cliente Z–A" },
];

const PERIODOS_PEDIDOS_MOBILE = [
  { value: "7", label: "7 dias" },
  { value: "30", label: "30 dias" },
  { value: "90", label: "90 dias" },
  { value: "365", label: "1 ano" },
  { value: "custom", label: "Personalizado" },
];

/**
 * Os filtros em pílula (fileira rolável acima da lista). Sem o anel de foco: o
 * Radix devolve o foco ao gatilho ao fechar a lista e, no toque, o anel ficava
 * preso na pílula escolhida.
 */
const PILULA_FILTRO =
  "h-9 w-auto shrink-0 gap-1.5 rounded-full border-border/60 bg-card px-3.5 text-[13px] font-semibold text-foreground shadow-none focus:ring-0 focus:ring-offset-0";

const ITENS_POR_PAGINA = 50;

/**
 * Pedidos, no desenho do celular do site (22/10/2026): título com o ícone,
 * período em pílulas, o total de pedidos grande com os outros números em
 * blocos, o gráfico num cartão e a lista em linhas de app, com a busca e os
 * filtros (marketplace, estado, ordem e o "Filtros") numa fileira de pílulas.
 * Mesmo estado, mesmas consultas e mesmos filtros da página do site; as
 * consultas da lista moram em dados/usePedidos.
 */
export default function Pedidos() {
  const { activeSeller } = useSellerContext();
  const sellerId = activeSeller?.id;
  const [searchParams, setSearchParams] = useSearchParams();
  const clienteId = searchParams.get("cliente");
  const estadoFilter = searchParams.get("estado");
  const [currentPage, setCurrentPage] = useState(1);

  const [searchInput, setSearchInput] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [filterPeriod, setFilterPeriod] = useState("30");
  /** [] = todos os marketplaces. Loja aqui é `orders.marketplace` (store_id nunca é preenchido). */
  const [filterLojas, setFilterLojas] = useState<string[]>([]);
  const [filterState, setFilterState] = useState(estadoFilter || "all");
  const [customDateFrom, setCustomDateFrom] = useState<Date | undefined>(undefined);
  const [customDateTo, setCustomDateTo] = useState<Date | undefined>(undefined);
  const [pendingDateFrom, setPendingDateFrom] = useState<Date | undefined>(undefined);
  const [pendingDateTo, setPendingDateTo] = useState<Date | undefined>(undefined);
  const [isCustomPeriod, setIsCustomPeriod] = useState(false);

  const [sortField, setSortField] = useState<string>(() => searchParams.get("ordem") || "acquired_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">(
    () => (searchParams.get("dir") === "asc" ? "asc" : "desc"),
  );
  const [advanced, setAdvanced] = useState<AdvancedFilters>(DEFAULT_ADVANCED_FILTERS);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [isClientSheetOpen, setIsClientSheetOpen] = useState(false);
  const [shipmentOrder, setShipmentOrder] = useState<{ id: string; external: string | null } | null>(null);

  /**
   * Sobe quando o app volta do segundo plano: a janela é memorizada (senão cada
   * desenho geraria um `to` novo e refaria KPIs e gráfico), e sem isto o teto
   * ficava no instante em que o período foi escolhido e o pedido que chegou
   * depois não aparecia.
   */
  const [refreshTick, setRefreshTick] = useState(0);

  /** Janela de datas do recorte — a mesma que alimenta lista, KPIs e gráfico. */
  const dateRange = useMemo(() => {
    const from = isCustomPeriod && customDateFrom
      ? customDateFrom.toISOString()
      : new Date(Date.now() - Number(filterPeriod) * 24 * 60 * 60 * 1000).toISOString();
    const to = isCustomPeriod && customDateTo
      ? new Date(customDateTo.getTime() + 86400000).toISOString()
      : new Date().toISOString();
    return { from, to };
    // refreshTick move o teto da janela para "agora" — ver comentário acima.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterPeriod, isCustomPeriod, customDateFrom, customDateTo, refreshTick]);

  // Em período personalizado a janela só existe depois do "Aplicar".
  const rangeReady = !isCustomPeriod || (!!customDateFrom && !!customDateTo);

  /** O recorte das RPCs de KPI, gráfico e contagem: os mesmos filtros da lista. */
  const dataFilters = useMemo<PedidosDataFilters>(() => ({
    marketplaces: filterLojas.length ? filterLojas : null,
    stateCode: filterState,
    orderStatus: advanced.status,
    clientId: clienteId,
    isSecondSale: advanced.type === "all" ? null : advanced.type === "second",
    minAmount: advanced.minValue > 0 ? advanced.minValue : null,
    // O topo do slider é "sem teto", não "R$ 1.000".
    maxAmount: advanced.maxValue < MAX_VALUE_CAP ? advanced.maxValue : null,
    whatsapp: advanced.whatsappContacted === "all" ? null : advanced.whatsappContacted,
    search: searchTerm,
    includeCancelled: advanced.includeCancelled,
    stateCodes: advanced.states.length ? advanced.states : null,
    cities: advanced.cities.length ? advanced.cities : null,
    documentTypes: advanced.documentType !== "all" ? [advanced.documentType] : null,
    genders: advanced.genders.length ? advanced.genders : null,
    cepPrefixes: advanced.cepPrefix.replace(/\D/g, "") ? [advanced.cepPrefix.replace(/\D/g, "")] : null,
    productText: advanced.productText.trim() || null,
    productOperator: advanced.productOperator,
  }), [filterLojas, filterState, advanced, clienteId, searchTerm]);

  const { orders, setOrders, totalOrders, loading, firstLoadDone, erro: erroLista, tentarDeNovo } = useListaPedidos({
    sellerId, dateRange, rangeReady, clienteId, filterLojas, filterState, advanced, searchTerm,
    sortField, sortDir, currentPage, itemsPerPage: ITENS_POR_PAGINA, dataFilters,
  });
  const hasStatusUpdates = useTemStatusAtualizado(sellerId);
  const { suggestions, showSuggestions, setShowSuggestions, escolherSugestao } = useSugestoesBusca(sellerId, searchInput, dateRange);
  const lojaOptions = useLojasDoPeriodo(sellerId, dateRange, rangeReady, advanced.includeCancelled);
  const availableStatuses = useStatusDoPeriodo(sellerId, hasStatusUpdates, dateRange, rangeReady);

  // As sugestões da busca são uma lista solta sobre a tela: o Voltar fecha.
  useVoltarFecha(showSuggestions && suggestions.length > 0, () => setShowSuggestions(false));

  // Solta marketplaces que deixaram de ter pedidos no período novo.
  useEffect(() => {
    setFilterLojas((cur) => {
      if (cur.length === 0) return cur;
      const valid = new Set(lojaOptions.map((o) => o.value));
      const next = cur.filter((v) => valid.has(v));
      return next.length === cur.length ? cur : next;
    });
  }, [lojaOptions]);

  // Status escolhido que não existe no período novo volta a "todos".
  useEffect(() => {
    if (!availableStatuses) return;
    setAdvanced((cur) =>
      cur.status !== "all" && !availableStatuses.includes(cur.status) ? { ...cur, status: "all" } : cur,
    );
  }, [availableStatuses]);

  // Agrupa pedidos da mesma compra (janela de 3 min, a mesma conta do banco).
  // Só em ordem cronológica decrescente: o agrupamento reordena por data e
  // desfaria "maior valor" e "cliente A–Z".
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const orderGroups = useMemo<OrderGroup<OrderRow>[]>(() => {
    if (sortField !== "acquired_at" || sortDir !== "desc") {
      return orders.map((o) => ({
        id: o.id,
        orders: [o],
        count: 1,
        acquired_at: o.acquired_at,
        total_amount: Number(o.total_amount) || 0,
        primary: o,
      }));
    }
    return groupOrdersByWindow<OrderRow>(orders, 3);
  }, [orders, sortField, sortDir]);
  /** Quantos pedidos a página colapsou em grupos — 0 quando nada foi agrupado. */
  const groupedRows = orders.length - orderGroups.length;
  const visibleOrderIds = useMemo(() => orders.map((o) => o.id).filter(Boolean), [orders]);
  const { data: orderIdsWithShipment } = useOrdersWithShipments(visibleOrderIds);
  const toggleGroup = (id: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Busca enquanto digita, não só no Enter.
  useEffect(() => {
    const timer = setTimeout(() => {
      const nextSearch = searchInput.trim();
      setSearchTerm((current) => (current === nextSearch ? current : nextSearch));
      setCurrentPage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Voltar ao app pega pedidos novos: move o teto da janela (ver refreshTick).
  useEffect(() => {
    const aoVoltar = () => {
      if (document.visibilityState === "visible") setRefreshTick((t) => t + 1);
    };
    document.addEventListener("visibilitychange", aoVoltar);
    return () => document.removeEventListener("visibilitychange", aoVoltar);
  }, []);

  // Filtro mudou: volta à página 1.
  useEffect(() => {
    setCurrentPage(1);
  }, [filterPeriod, filterLojas, searchTerm, clienteId, filterState, advanced, sortField, sortDir, isCustomPeriod, customDateFrom, customDateTo]);

  // Ordenação na URL, como no site. `replace` em toda troca de parâmetro desta
  // tela: um passo novo no histórico faria o Voltar do Android ficar em Pedidos.
  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    if (sortField === "acquired_at") next.delete("ordem"); else next.set("ordem", sortField);
    if (sortDir === "desc") next.delete("dir"); else next.set("dir", sortDir);
    if (next.toString() !== searchParams.toString()) setSearchParams(next, { replace: true });
    // searchParams fora das deps de propósito: ele muda a cada setSearchParams
    // e reentraria no efeito.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortField, sortDir]);

  const handleSearchSelect = (suggestion: Sugestao) => {
    const searchText = (suggestion.originalText || suggestion.text).trim();
    escolherSugestao(searchText);
    setSearchInput(searchText);
    setSearchTerm(searchText);
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      setSearchTerm(searchInput.trim());
      setShowSuggestions(false);
    }
    if (e.key === "Escape") setShowSuggestions(false);
  };

  const handleSearchClear = () => {
    setSearchInput("");
    setSearchTerm("");
    setShowSuggestions(false);
  };

  const totalPages = Math.ceil(totalOrders / ITENS_POR_PAGINA);
  const startItem = (currentPage - 1) * ITENS_POR_PAGINA + 1;
  const endItem = Math.min(currentPage * ITENS_POR_PAGINA, totalOrders);

  const handleViewClient = (clientId: string) => {
    setSelectedClientId(clientId);
    setIsClientSheetOpen(true);
  };

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir(field === "full_name" ? "asc" : "desc");
    }
  };

  const sortValue = `${sortField}:${sortDir}`;
  const handleSortChange = (v: string) => {
    const [f, d] = v.split(":");
    setSortField(f);
    setSortDir(d === "asc" ? "asc" : "desc");
  };

  const advancedActive = countActiveAdvanced(advanced);
  const hasAnyFilter =
    filterLojas.length > 0 || filterState !== "all" || !!searchTerm || !!clienteId ||
    advancedActive > 0 || isCustomPeriod;

  /**
   * UM caminho para a UF, usado pela pílula de estado e pelo toque no gráfico
   * "Por estado". Ela e o multi do "Filtros" não ficam ligados ao mesmo tempo:
   * a lista aplicaria os dois e as RPCs só ouviriam o multi, e card e lista
   * contariam conjuntos diferentes.
   */
  const aplicarUfDaBarra = (uf: string) => {
    setFilterState(uf);
    setCurrentPage(1);
    if (uf !== "all") setAdvanced((p) => (p.states.length ? { ...p, states: [] } : p));
    const next = new URLSearchParams(searchParams);
    if (uf === "all") next.delete("estado");
    else next.set("estado", uf);
    setSearchParams(next, { replace: true });
  };

  const clearAllFilters = () => {
    setFilterLojas([]);
    setFilterState("all");
    setAdvanced(DEFAULT_ADVANCED_FILTERS);
    setSearchInput("");
    setSearchTerm("");
    setIsCustomPeriod(false);
    setFilterPeriod("30");
    setCustomDateFrom(undefined);
    setCustomDateTo(undefined);
    setPendingDateFrom(undefined);
    setPendingDateTo(undefined);
    setSortField("acquired_at");
    setSortDir("desc");
    setSearchParams(new URLSearchParams(), { replace: true });
  };

  const handleWhatsAppClick = async (order: OrderRow) => {
    try {
      const quando = new Date().toISOString();
      const updateError = await marcarWhatsAppContatado(order.id, quando);
      if (updateError) {
        console.error("Error updating order:", updateError);
        return;
      }
      setOrders((prev) => prev.map((o) => (o.id === order.id ? { ...o, whatsapp_contacted_at: quando } : o)));
      // No app, endereço de fora abre no WhatsApp (ou no navegador).
      if (order.clients?.whatsapp) {
        window.open(`https://wa.me/${order.clients.whatsapp.replace(/\D/g, "")}`, "_blank");
      }
    } catch (error) {
      console.error("Error handling WhatsApp click:", error);
    }
  };

  const handleEmailClick = (order: OrderRow) => {
    if (order.clients?.email) window.open(`mailto:${order.clients.email}`, "_blank");
  };

  const periodLabel = isCustomPeriod && customDateFrom
    ? `${format(customDateFrom, "dd/MM", { locale: ptBR })} – ${customDateTo ? format(customDateTo, "dd/MM", { locale: ptBR }) : "..."}`
    : null;

  const escolherPeriodo = (val: string) => {
    if (val === "custom") {
      setIsCustomPeriod(true);
      setPendingDateFrom(undefined);
      setPendingDateTo(undefined);
    } else {
      setFilterPeriod(val);
      setIsCustomPeriod(false);
      setCustomDateFrom(undefined);
      setCustomDateTo(undefined);
      setPendingDateFrom(undefined);
      setPendingDateTo(undefined);
    }
  };

  /** Datas do período personalizado: só busca depois do Aplicar. */
  const campoData = (
    valor: Date | undefined,
    vazio: string,
    onSelect: (d: Date | undefined) => void,
    disabled: (d: Date) => boolean,
  ) => (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "h-10 w-full justify-start rounded-full border-border/60 bg-card text-left font-normal",
            !valor && "text-muted-foreground",
          )}
        >
          <CalendarRange className="mr-2 h-4 w-4" />
          {valor ? format(valor, "dd/MM/yyyy", { locale: ptBR }) : vazio}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <CalendarComponent mode="single" selected={valor} onSelect={onSelect} disabled={disabled} initialFocus className="pointer-events-auto p-3" />
      </PopoverContent>
    </Popover>
  );

  const rotuloPeriodo = isCustomPeriod
    ? (periodLabel ? `de ${periodLabel}` : "período personalizado")
    : filterPeriod === "365" ? "último ano" : `últimos ${filterPeriod} dias`;
  const rotuloComparacao = isCustomPeriod ? "o período anterior" : `${filterPeriod} dias antes`;
  const ordemAtual = SORT_OPTIONS.find((o) => o.value === sortValue);

  /**
   * Só a primeira carga mostra esqueleto, e só na lista: o site troca a página
   * inteira pelo esqueleto do computador; aqui os números e o gráfico já têm o
   * deles. Troca de página, de filtro ou volta ao app mantêm a lista na tela.
   */
  const primeiraCarga = loading && !firstLoadDone;

  return (
    <LayoutApp>
      <div className="flex flex-col gap-7 px-4 pb-6 pt-4">
        <div className="flex flex-col gap-3">
          <CabecalhoTela icone={ShoppingCart} titulo="Pedidos" />
          <Pilulas
            rotulo="Período"
            opcoes={PERIODOS_PEDIDOS_MOBILE}
            valor={isCustomPeriod ? "custom" : filterPeriod}
            onChange={escolherPeriodo}
          />
          {isCustomPeriod && (
            <div className="flex flex-col gap-2">
              <div className="grid grid-cols-2 gap-2">
                {campoData(pendingDateFrom, "De", setPendingDateFrom, (d) => d > new Date())}
                {campoData(pendingDateTo, "Até", setPendingDateTo, (d) => d > new Date() || (pendingDateFrom ? d < pendingDateFrom : false))}
              </div>
              <Button
                className="h-10 w-full rounded-full"
                disabled={!pendingDateFrom || !pendingDateTo}
                onClick={() => {
                  setCustomDateFrom(pendingDateFrom);
                  setCustomDateTo(pendingDateTo);
                  setCurrentPage(1);
                }}
              >
                Aplicar
              </Button>
            </div>
          )}
        </div>

        <PedidosKpisMobile
          sellerId={sellerId}
          start={rangeReady ? dateRange.from : ""}
          end={rangeReady ? dateRange.to : ""}
          filters={dataFilters}
          rotuloPeriodo={rotuloPeriodo}
          rotuloComparacao={rotuloComparacao}
        />

        <section className="flex flex-col gap-3">
          <h2 className="text-[19px] font-bold tracking-tight text-foreground">Vendas no período</h2>
          <PedidosChartCard
            compacto
            sellerId={sellerId}
            start={rangeReady ? dateRange.from : ""}
            end={rangeReady ? dateRange.to : ""}
            filters={dataFilters}
            onStoreClick={(key) => { setFilterLojas([key]); setCurrentPage(1); }}
            onStateClick={aplicarUfDaBarra}
          />
        </section>

        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-[19px] font-bold tracking-tight text-foreground">
              Pedidos{" "}
              {!erroLista && (
                <span className="font-semibold tabular-nums text-muted-foreground">
                  ({totalOrders.toLocaleString("pt-BR")})
                </span>
              )}
            </h2>
            {hasAnyFilter && (
              <button
                type="button"
                onClick={clearAllFilters}
                className="flex items-center gap-1 rounded-full px-2 py-1 text-[13px] font-semibold text-primary active:bg-primary/10"
              >
                <X className="h-3.5 w-3.5" strokeWidth={2.5} />
                Limpar
              </button>
            )}
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar pedido, produto, cliente ou CPF"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              onFocus={() => searchInput.length >= 2 && setShowSuggestions(true)}
              className="h-11 rounded-full border-border/60 bg-card pl-10 pr-9 text-[15px]"
            />
            {searchInput && (
              <button
                onClick={handleSearchClear}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label="Limpar busca"
              >
                ×
              </button>
            )}

            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-60 overflow-y-auto rounded-2xl border border-border bg-popover shadow-lg">
                {suggestions.map((suggestion, index) => (
                  <button
                    key={`${suggestion.id}-${index}`}
                    onClick={() => handleSearchSelect(suggestion)}
                    className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left hover:bg-muted"
                  >
                    <span className="truncate text-sm">{suggestion.text}</span>
                    <Badge variant="outline" className="shrink-0 text-xs">
                      {suggestion.type}
                    </Badge>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <Button
              variant="outline"
              onClick={() => setAdvancedOpen(true)}
              className={cn(PILULA_FILTRO, advancedActive > 0 && "border-transparent bg-primary/10 text-primary")}
            >
              <SlidersHorizontal className="h-4 w-4" />
              Filtros
              {advancedActive > 0 && (
                <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-primary-foreground">
                  {advancedActive}
                </span>
              )}
            </Button>

            <LojaMultiSelect
              options={lojaOptions}
              selected={filterLojas}
              onChange={(next) => { setFilterLojas(next); setCurrentPage(1); }}
              rotuloTodos="Marketplaces"
              triggerClassName={cn(
                PILULA_FILTRO,
                "justify-start [&>svg:last-child]:ml-0.5",
                filterLojas.length > 0 && "border-transparent bg-primary/10 text-primary [&_svg]:text-primary [&_span]:text-primary",
              )}
            />

            <Select value={filterState} onValueChange={aplicarUfDaBarra}>
              <SelectTrigger
                aria-label="Estado"
                className={cn(PILULA_FILTRO, filterState !== "all" && "border-transparent bg-primary/10 text-primary")}
              >
                <MapPin className="h-4 w-4 shrink-0 opacity-70" />
                <span>{filterState === "all" ? "Estado" : filterState}</span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos estados</SelectItem>
                {UF_LIST.map((uf) => (
                  <SelectItem key={uf} value={uf}>{uf}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={sortValue} onValueChange={handleSortChange}>
              <SelectTrigger aria-label="Ordenar" className={PILULA_FILTRO}>
                <ArrowDownUp className="h-4 w-4 shrink-0 opacity-70" />
                <span>{ordemAtual ? ordemAtual.label.replace(/^[↓↑]\s*/, "") : "Ordenar"}</span>
              </SelectTrigger>
              <SelectContent>
                {SORT_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {clienteId && (
            <p className="text-[13px] text-muted-foreground">
              Mostrando só os pedidos de um cliente específico.
            </p>
          )}

          <div className="overflow-hidden rounded-3xl border border-border/60 bg-card">
            {erroLista ? (
              <div className="flex flex-col items-center gap-3 px-6 py-8 text-center">
                <AlertTriangle className="h-6 w-6 text-muted-foreground" />
                <p className="text-sm font-medium text-foreground">Não foi possível carregar os pedidos.</p>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Confira a internet do celular e tente de novo.
                </p>
                <Button variant="outline" size="sm" className="rounded-full" onClick={tentarDeNovo} disabled={loading}>
                  {loading ? "Tentando…" : "Tentar de novo"}
                </Button>
              </div>
            ) : (
              <OrdersTableV2
                groups={orderGroups}
                loading={primeiraCarga}
                hasStatusUpdates={hasStatusUpdates}
                expandedGroups={expandedGroups}
                onToggleGroup={toggleGroup}
                sortField={sortField}
                sortDir={sortDir}
                onSort={handleSort}
                onViewClient={handleViewClient}
                onWhatsApp={handleWhatsAppClick}
                onEmail={handleEmailClick}
                onShipment={(o) => setShipmentOrder({ id: o.id, external: o.external_order_id })}
                orderIdsWithShipment={orderIdsWithShipment}
                hasFilters={hasAnyFilter}
                onClearFilters={clearAllFilters}
              />
            )}
          </div>

          {totalOrders > 0 && !erroLista && (
            <div className="flex flex-col items-center gap-3 pt-1">
              {totalPages > 1 && (
                <div className="flex w-full items-center justify-between gap-2">
                  <Button
                    variant="outline"
                    className="h-10 rounded-full border-border/60 bg-card px-4"
                    disabled={currentPage <= 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  >
                    <ChevronLeft className="mr-1 h-4 w-4" />
                    Anterior
                  </Button>
                  <span className="text-[13px] font-medium tabular-nums text-muted-foreground">
                    Página {currentPage} de {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    className="h-10 rounded-full border-border/60 bg-card px-4"
                    disabled={currentPage >= totalPages}
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  >
                    Próxima
                    <ChevronRight className="ml-1 h-4 w-4" />
                  </Button>
                </div>
              )}
              <p className="text-center text-[12px] text-muted-foreground">
                {startItem}–{endItem} de {totalOrders.toLocaleString("pt-BR")} pedidos
                {groupedRows > 0 && ` em ${orderGroups.length} linha${orderGroups.length === 1 ? "" : "s"} (compras agrupadas)`}
              </p>
            </div>
          )}
        </section>
      </div>

      <PedidosFiltersSheet
        open={advancedOpen}
        onOpenChange={setAdvancedOpen}
        filters={advanced}
        onChange={(next) => {
          setAdvanced(next);
          // O multi de UF do "Filtros" assume: a pílula de estado volta a "Estado".
          if (next.states.length > 0 && filterState !== "all") {
            setFilterState("all");
            const newParams = new URLSearchParams(searchParams);
            newParams.delete("estado");
            setSearchParams(newParams, { replace: true });
          }
        }}
        statusOptions={hasStatusUpdates ? availableStatuses ?? [] : []}
        sellerId={sellerId ?? null}
      />

      {activeSeller && (
        <ClientDetailSheet
          clientId={selectedClientId}
          sellerId={activeSeller.id}
          open={isClientSheetOpen}
          onOpenChange={setIsClientSheetOpen}
        />
      )}

      <OrderShipmentSheet
        orderId={shipmentOrder?.id ?? null}
        externalOrderId={shipmentOrder?.external ?? null}
        open={!!shipmentOrder}
        onOpenChange={(o) => { if (!o) setShipmentOrder(null); }}
      />
    </LayoutApp>
  );
}
