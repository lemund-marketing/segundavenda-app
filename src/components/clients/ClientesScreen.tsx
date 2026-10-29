import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowDownUp,
  ChevronLeft,
  ChevronRight,
  Lock,
  MapPin,
  RotateCw,
  Search,
  ShoppingBag,
  SlidersHorizontal,
  Sparkles,
  Store,
  Users,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  SkeletonKpi,
  SkeletonLinhas,
  SkeletonPageHeader,
  SkeletonTabela,
} from "@/components/skeletons/PageSkeletons";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";

import { ExportButton } from "@/components/ExportButton";
import { ClientDetailSheet } from "@/components/crm/ClientDetailSheet";
import {
  ClientesInsightsV2,
  type ClientesInsightsExtraTab,
} from "@/components/clients/ClientesInsightsV2";
import { ClientesTableV2, type ClienteRow } from "@/components/clients/ClientesTableV2";
import { BirthdayTodaySheet } from "@/components/clients/BirthdayTodaySheet";
import { ActiveConversationSheet } from "@/components/clients/ActiveConversationSheet";
import { OneTimeClientsSheet } from "@/components/clients/OneTimeClientsSheet";
import { ClientesMoreFiltersSheet } from "@/components/clients/ClientesMoreFiltersSheet";
import { ClientesFilterChips } from "@/components/clients/ClientesFilterChips";
import {
  clientesFiltersToPayload,
  countActiveClientesFilters,
  describeClientesFilters,
  makeEmptyClientesFilters,
  parseFiltersFromUrl,
  serializeFiltersToUrl,
  type ClientesAdvancedFilters,
  type ClientesFilterPayload,
} from "@/components/clients/clientesFilters";

import { cn } from "@/lib/utils";
import { useSellerContext } from "@/contexts/SellerContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useClientesPageExtras } from "@/hooks/useClientesPageExtras";
import {
  NO_FACET_FILTERS,
  useClientesFacet,
  usePipelineStageOptions,
} from "@/hooks/useClientesFacets";
import { useRfvFilterOptions, RFV_COLORS } from "@/hooks/useRfv";
import { formatMarketplaceName } from "@/utils/formatters";
import { useIsMobile } from "@/hooks/use-mobile";
import { CabecalhoTela, Pilulas } from "@/components/mobile/blocos";

const ITEMS_PER_PAGE = 50;

export const CLIENTES_PERIODO_PADRAO = "30";
/** O "todo período" desta tela — 9999 dias atrás, e não uma data âncora. */
export const CLIENTES_PERIODO_TUDO = "9999";

interface ClientMetricsRow {
  client_id: string;
  full_name: string | null;
  document: string | null;
  email: string | null;
  whatsapp: string | null;
  state_code: string | null;
  total_orders: number;
  total_spent: number;
  first_order_at: string | null;
  last_order_at: string | null;
  total_count: number;
}

/** Chave da coluna → valor de `_order_by` aceito pela RPC, nas duas direções. */
const SORT_MAP: Record<string, { asc: string; desc: string }> = {
  name: { asc: "name", desc: "name_desc" },
  orders: { asc: "orders_asc", desc: "orders_desc" },
  spent: { asc: "spent_asc", desc: "spent_desc" },
  ticket: { asc: "ticket_asc", desc: "ticket_desc" },
  last_order: { asc: "recent_asc", desc: "recent" },
};

// O caminho inverso: mudar o select "Ordenar por" tem de mover a setinha do cabeçalho.
const ORDER_TO_COL: Record<string, { col: string; dir: "asc" | "desc" }> = Object.entries(
  SORT_MAP,
).reduce((acc, [col, dirs]) => {
  acc[dirs.asc] = { col, dir: "asc" };
  acc[dirs.desc] = { col, dir: "desc" };
  return acc;
}, {} as Record<string, { col: string; dir: "asc" | "desc" }>);

const UFS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG",
  "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
];

const PERIODOS = [
  { value: "7", label: "Últimos 7 dias" },
  { value: "30", label: "Últimos 30 dias" },
  { value: "90", label: "Últimos 90 dias" },
  { value: "365", label: "Último ano" },
  { value: CLIENTES_PERIODO_TUDO, label: "Todo período" },
];

/** Período no celular: as mesmas opções do select, em pílulas. */
const PERIODOS_MOBILE = [
  { value: "7", label: "7 dias" },
  { value: "30", label: "30 dias" },
  { value: "90", label: "90 dias" },
  { value: "365", label: "1 ano" },
  { value: CLIENTES_PERIODO_TUDO, label: "Tudo" },
];

/**
 * Os filtros do celular, em pílula (fileira rolável acima da lista). Sem o
 * anel de foco: o Radix devolve o foco ao gatilho ao fechar a lista e, no
 * toque, o anel ficava preso na pílula escolhida.
 */
const PILULA_FILTRO =
  "h-9 w-auto shrink-0 gap-1.5 rounded-full border-border/60 bg-card px-3.5 text-[13px] font-semibold text-foreground shadow-none focus:ring-0 focus:ring-offset-0";
const PILULA_ATIVA = "border-transparent bg-primary/10 text-primary";

const MIN_PEDIDOS = [
  { value: "0", label: "Todos os clientes" },
  { value: "1", label: "1+ pedidos" },
  { value: "2", label: "2+ pedidos" },
  { value: "3", label: "3+ pedidos" },
  { value: "5", label: "5+ pedidos" },
  { value: "10", label: "10+ pedidos" },
];

// Precisa cobrir os 10 valores que SORT_MAP produz: clicar no cabeçalho grava o
// valor aqui e, sem o item correspondente, o Radix renderiza o gatilho VAZIO —
// nem rótulo nem placeholder.
const ORDENACOES = [
  { value: "orders_desc", label: "Mais pedidos" },
  { value: "orders_asc", label: "Menos pedidos" },
  { value: "spent_desc", label: "Maior valor gasto" },
  { value: "spent_asc", label: "Menor valor gasto" },
  { value: "ticket_desc", label: "Maior ticket médio" },
  { value: "ticket_asc", label: "Menor ticket médio" },
  { value: "recent", label: "Compra mais recente" },
  { value: "recent_asc", label: "Compra mais antiga" },
  { value: "name", label: "Nome (A-Z)" },
  { value: "name_desc", label: "Nome (Z-A)" },
];

/** Janela de páginas: primeira, última, atual ±2 e reticências nos buracos. */
function pageWindow(current: number, total: number): (number | "gap")[] {
  const wanted = new Set<number>([1, total]);
  for (let p = current - 2; p <= current + 2; p++) {
    if (p >= 1 && p <= total) wanted.add(p);
  }
  const out: (number | "gap")[] = [];
  let prev = 0;
  for (const p of [...wanted].sort((a, b) => a - b)) {
    if (prev && p - prev > 1) out.push("gap");
    out.push(p);
    prev = p;
  }
  return out;
}

/**
 * Larguras das 7 pílulas de aba do painel de insights, na ordem real
 * (Marketplaces, Crescimento, Gênero, Faixa Etária, Recência, Frequência,
 * Valor). Todas do mesmo tamanho, a fileira quebrava linha num ponto diferente
 * do painel de verdade — e é justamente a quebra que define a altura do bloco
 * abaixo de 1536px.
 */
const LARGURA_ABAS = ["w-[92px]", "w-[88px]", "w-[64px]", "w-[86px]", "w-[74px]", "w-[82px]", "w-[52px]"];

/**
 * Esqueleto da PÁGINA de Clientes — mesma forma e MESMA ORDEM do que carrega:
 *
 *   1. régua do topo (PageHeader, sem ação à direita)
 *   2. insights: 6 KPIs em 3×2 + painel de gráfico, no grid 3fr/2fr
 *   3. barra de filtros: busca + até 6 selects + "Mais filtros"
 *   4. painel da lista: cabeçalho com título e exportar, tabela de 7 colunas,
 *      rodapé de paginação
 *
 * Peças de `@/components/skeletons/PageSkeletons` onde a forma bate. Onde não
 * há peça (as pílulas de aba, os controles da barra de filtros e a faixa de
 * título da lista), o desenho é local: `SkeletonPanel`, por exemplo, traz uma
 * faixa cinza com ícone que nenhum destes blocos tem — usá-la aqui prometeria
 * um cabeçalho que não vem depois.
 *
 * Nada de barra de topo ou lateral: o AppLayout já renderiza as de verdade.
 */
export function ClientesPaginaSkeleton({
  className = "w-full p-4 space-y-4 2xl:p-6 2xl:space-y-6",
  comHeader = true,
}: { className?: string; comHeader?: boolean }) {
  return (
    <>
      {/* Sem `comAcao`: a régua de /clientes é só título e subtítulo — o
          exportar mora no painel da lista e o período, na barra de filtros. */}
      {comHeader && <SkeletonPageHeader comAcao={false} />}

      <div className={className}>
        {/* 1º bloco — ClientesInsightsV2: coluna de KPIs (3fr) + painel (2fr).
            `items-stretch` + `auto-rows-fr`, como no real: é o piso do painel
            que estica os seis cards, e não o contrário. Sem repetir isso aqui,
            a página saltava ~50px por card ao trocar o esqueleto pelo bloco. */}
        <div className="grid grid-cols-1 xl:grid-cols-[3fr_2fr] gap-4 items-stretch">
          <div className="grid min-w-0 grid-cols-1 sm:grid-cols-3 sm:grid-rows-2 gap-4 auto-rows-fr">
            {/* SEIS: Total de Clientes, Ticket Médio, LTV Médio, Compraram 1
                Vez, Aniversariantes Hoje e Conversas Ativas. */}
            {Array.from({ length: 6 }, (_, i) => (
              <SkeletonKpi key={i} />
            ))}
          </div>

          <div className="flex flex-col rounded-2xl bg-card shadow-sm p-4 2xl:p-5 min-h-[248px] 2xl:min-h-[320px]">
            {/* Legenda "Recorte atual · N clientes" */}
            <Skeleton className="mb-3 h-3 w-40" />

            {/* As 7 abas do painel, com a mesma quebra de linha do real. */}
            <div className="flex flex-wrap 2xl:flex-nowrap items-center gap-1 mb-3 2xl:mb-4">
              {LARGURA_ABAS.map((w) => (
                <Skeleton key={w} className={cn("h-6 2xl:h-7 rounded-full", w)} />
              ))}
            </div>

            {/* Área do gráfico. Quatro linhas com marcador e barra porque é
                exatamente isso que aparece a seguir: o `LoadingChart` do painel
                e as abas de barras (Marketplaces, Faixa Etária, RFV). */}
            <div className="flex-1 min-h-[188px] 2xl:min-h-[240px]">
              <SkeletonLinhas quantidade={4} />
            </div>
          </div>
        </div>

        {/* 2º bloco — barra de filtros. Na ordem do JSX: busca larga +
            Período, Marketplace, Mínimo de pedidos, Estado, Segmento RFV,
            Ordenar por e o botão "Mais filtros". As larguras e o `flex-wrap`
            são os dos controles reais: sem isso o esqueleto sai numa linha e o
            conteúdo em duas, e a página SALTA quando o esqueleto sai.
            Sem fileira de chips: com os filtros zerados, `ClientesFilterChips`
            não renderiza nada. */}
        <div className="rounded-2xl bg-card shadow-sm p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <Skeleton className="h-10 flex-1 rounded-md lg:min-w-[320px]" />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:flex lg:flex-wrap lg:items-center lg:justify-end">
              <Skeleton className="h-10 w-full rounded-md lg:w-[168px]" />
              <Skeleton className="h-10 w-full rounded-md lg:w-[180px]" />
              <Skeleton className="h-10 w-full rounded-md lg:w-[168px]" />
              <Skeleton className="h-10 w-full rounded-md lg:w-[120px]" />
              <Skeleton className="h-10 w-full rounded-md lg:w-[180px]" />
              <Skeleton className="h-10 w-full rounded-md lg:w-[190px]" />
              <Skeleton className="col-span-2 h-10 w-full rounded-md sm:col-span-1 lg:w-[132px]" />
            </div>
          </div>
        </div>

        {/* 3º bloco — painel da lista. */}
        <div className="overflow-hidden rounded-2xl bg-card shadow-sm">
          {/* Faixa do título ("Lista de Clientes (…)") + botão Exportar. */}
          <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-2.5">
            <Skeleton className="h-4 w-44" />
            <Skeleton className="h-9 w-[104px] rounded-md" />
          </div>

          {/* SETE colunas: Cliente, Pedidos, Total Gasto, Ticket Médio, Última
              Compra, Loja e Estágio CRM — as mesmas de `ClientesTableV2`. E as
              mesmas 8 linhas que o skeleton da tabela mostra depois. */}
          <div className="px-4 py-3">
            <SkeletonTabela linhas={8} colunas={7} />
          </div>

          {/* Rodapé: "Mostrando 1–50 de N" + paginação. */}
          <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-4">
            <Skeleton className="h-3 w-44" />
            <Skeleton className="h-9 w-56 rounded-md" />
          </div>
        </div>
      </div>
    </>
  );
}

export interface ClientesScreenProps {
  /**
   * Slug de `orders.marketplace` que a tela impõe ao recorte inteiro.
   *
   * Não é um filtro: é o contexto de `/lojas/:marketplace`. Some do sheet, não
   * vira chip removível, sobrevive a todo "Limpar" e é reimposto na leitura da
   * URL — a trava mora no payload, não na interface.
   */
  lockedMarketplace?: string;
  /** Nome bonito da loja (alias do seller), para os rótulos. */
  lockedMarketplaceLabel?: string;
  /**
   * Período controlado por fora. Ausente, a tela usa o estado interno de
   * sempre; presente, quem manda é o dono da prop (dentro da loja, o seletor do
   * cabeçalho, que vale para as quatro abas).
   */
  period?: string;
  onPeriodChange?: (period: string) => void;
  /**
   * Some com o select "Período" da barra de filtros.
   *
   * Para quem já mostra o próprio seletor na mesma dobra: dentro da loja o
   * cabeçalho tem um, valendo para as quatro abas, e dois controles do mesmo
   * estado a 300px um do outro (com rótulos diferentes — "365 dias" x "Último
   * ano") fazem o usuário duvidar de qual comanda a tela. Some junto o poder
   * desta tela de mexer no período: um botão da lista de clientes não pode
   * mudar o que as abas Pedidos e Produtos mostram.
   */
  hidePeriodSelect?: boolean;
  /**
   * O export de clientes roda por intervalo de datas e ignora os filtros da
   * tela. Dentro de uma loja isso é um CSV do seller inteiro a um clique da
   * tela que promete estar travada.
   */
  showExport?: boolean;
  hideStoresTab?: boolean;
  insightsExtraTab?: ClientesInsightsExtraTab;
  /** A página tem padding próprio; dentro de uma aba, o padding é do pai. */
  className?: string;
  /**
   * Com título, a tela vira a versão de app no celular (22/10/2026): título
   * com ícone, período em pílulas, os números do topo no desenho do Dashboard
   * e a lista com busca + filtros em pílulas. A página /clientes passa; a aba
   * Clientes da loja usa `embutidaMobile`, sem título.
   */
  tituloMobile?: string;
  /**
   * A versão de app sem o título nem o respiro de página: para quando a tela
   * mora numa aba de outra (o detalhe do marketplace, 23/10/2026).
   */
  embutidaMobile?: boolean;
}

/**
 * A tela de Clientes inteira, sem `AppLayout`: os 6 KPIs, o painel de gráficos,
 * a barra de filtros com "Mais filtros", os chips e a lista paginada.
 *
 * Existe para que a aba Clientes de `/lojas/:marketplace` SEJA esta tela, e não
 * uma cópia que diverge no primeiro ajuste. Todas as props de trava são
 * opcionais e o default reproduz `/clientes` sem nenhuma diferença.
 */
export function ClientesScreen({
  lockedMarketplace,
  lockedMarketplaceLabel,
  period,
  onPeriodChange,
  hidePeriodSelect = false,
  showExport = true,
  hideStoresTab = false,
  insightsExtraTab,
  tituloMobile,
  embutidaMobile = false,
  // Escala de container do produto: compacta por padrão (é o que o notebook
  // recebe) e generosa só a partir de 1536px. Tem de bater com o default do
  // `ClientesPaginaSkeleton` acima, senão a página desloca ao carregar.
  className = "w-full p-4 space-y-4 2xl:p-6 2xl:space-y-6",
}: ClientesScreenProps = {}) {
  const { activeSeller } = useSellerContext();
  const { toast } = useToast();
  const isMobile = useIsMobile();

  const [clients, setClients] = useState<ClienteRow[]>([]);
  const [totalClients, setTotalClients] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);

  const [searchInput, setSearchInput] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [periodoInterno, setPeriodoInterno] = useState(CLIENTES_PERIODO_PADRAO);
  const [filterMinOrders, setFilterMinOrders] = useState("0");
  const [orderBy, setOrderBy] = useState("orders_desc");
  const [colSort, setColSort] = useState<{ col: string; dir: "asc" | "desc" } | null>({
    col: "orders",
    dir: "desc",
  });

  // Controlado x interno, no padrão de um input do React: com a prop presente o
  // estado interno nem é lido, e mexer no select avisa quem manda.
  const controlado = period !== undefined;
  const filterPeriod = controlado ? period : periodoInterno;

  const [searchParams, setSearchParams] = useSearchParams();

  const lojaTravada = lockedMarketplace?.trim().toLowerCase() || "";
  const lojaLabel =
    lockedMarketplaceLabel?.trim() || (lojaTravada ? formatMarketplaceName(lojaTravada) : "");

  /**
   * O estado NUNCA guarda a loja travada.
   *
   * Duas razões: o `?f=` é JSON puro e editável à mão (`{"marketplaces":["shopee"]}`
   * é trivial de digitar), e o badge de "Mais filtros" conta o que o USUÁRIO
   * ligou. Com a trava fora do estado, a URL não anuncia uma chave removível, o
   * chip de loja não nasce e o contador não mente.
   */
  const semLojaEscolhida = useCallback(
    (f: ClientesAdvancedFilters): ClientesAdvancedFilters =>
      lojaTravada ? { ...f, marketplaces: [] } : f,
    [lojaTravada],
  );

  // UM objeto de estado para as dimensões do sheet, nunca um `useState` solto
  // por dimensão: é assim que o "limpar tudo" da referência esquece um campo e
  // o contador passa a discordar do que está filtrando.
  //
  // `?f=` é o estado completo; `?rfv=` continua sendo aceito porque é o deep
  // link da Análise RFV ("Ver na lista e disparar") — um segmento só, o nome
  // como está em `client_rfv.segment`.
  const [advFilters, setAdvFilters] = useState<ClientesAdvancedFilters>(() => {
    const bruto = searchParams.get("f");
    if (bruto) return semLojaEscolhida(parseFiltersFromUrl(bruto));
    const rfv = searchParams.get("rfv");
    if (rfv) return { ...makeEmptyClientesFilters(), rfvSegments: [rfv] };
    return makeEmptyClientesFilters();
  });
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(false);
  const rfvOptions = useRfvFilterOptions(activeSeller?.id);

  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [isClientSheetOpen, setIsClientSheetOpen] = useState(false);
  const [birthdayOpen, setBirthdayOpen] = useState(false);
  const [activeConvOpen, setActiveConvOpen] = useState(false);
  const [oneTimeOpen, setOneTimeOpen] = useState(false);

  const listaRef = useRef<HTMLDivElement>(null);
  // Só a resposta do pedido MAIS RECENTE pode escrever na tela: sem isto, uma
  // resposta atrasada de um filtro antigo sobrescreve a lista já renderizada.
  const reqSeq = useRef(0);

  // Memoizado: `Date.now()` a cada render mudaria a queryKey dos KPIs e gráficos
  // sem parar, e o número do card brigaria com o rodapé da paginação.
  const periodStart = useMemo(
    () => new Date(Date.now() - Number(filterPeriod) * 86400000).toISOString(),
    [filterPeriod],
  );

  // O recorte inteiro num payload só. Lista, KPIs, gráficos e as três sheets
  // recebem ESTE objeto — o invariante "mesmo recorte" não é copiado à mão em
  // cinco lugares (foi o que a migration 20260731130000 teve de consertar).
  // É também o único ponto onde a loja travada entra: uma injeção, oito
  // consultas.
  const filterPayload = useMemo(
    () =>
      clientesFiltersToPayload(advFilters, {
        periodStart,
        minOrders: Number(filterMinOrders),
        search: searchTerm,
        lockedMarketplaces: lojaTravada ? [lojaTravada] : undefined,
        // O período vai COLADO na trava, e não só no `periodStart`: sem isto o
        // predicado de canal é vitalício, o período recai sobre o último pedido
        // do cliente em qualquer loja, e a aba responde "já comprou aqui algum
        // dia E comprou em algum lugar no período" — 51 clientes onde o
        // cabeçalho da loja e a Visão Geral dizem 46.
        lockedMarketplacesFrom: lojaTravada ? periodStart : undefined,
      }),
    [advFilters, periodStart, filterMinOrders, searchTerm, lojaTravada],
  );

  /**
   * O recorte IMPOSTO, sozinho — é o que as facetas do sheet recebem.
   *
   * Só a trava: mandar o resto faria a faceta se auto-filtrar (marcar SP
   * deixaria SP como única UF ofertada). Sem trava vai `{}` e a faceta descreve
   * o seller inteiro, exatamente como antes.
   */
  const facetFilters = useMemo<ClientesFilterPayload>(
    () =>
      lojaTravada ? { marketplaces: [lojaTravada], marketplacesFrom: periodStart } : NO_FACET_FILTERS,
    [lojaTravada, periodStart],
  );

  /**
   * Opções do select de Marketplace da barra.
   *
   * Sai da MESMA faceta do sheet (`get_clientes_facetas`), com o mesmo recorte
   * imposto — não de uma lista fixa do enum. O enum tem 39 canais e este seller
   * usa 4: uma lista fixa ofertaria 35 opções que devolvem zero.
   *
   * O número ao lado de cada canal conta CLIENTES DISTINTOS de TODO o histórico
   * do seller — a faceta não recebe o período. Ele NÃO bate com a barra do
   * painel de Marketplaces à direita, que passa por
   * `get_clients_store_distribution(_period_start, _filters)` e é recortada
   * pelo período e pelos filtros da tela. Consequência prática: um canal pode
   * aparecer aqui com número e devolver lista vazia em "Últimos 30 dias".
   *
   * Desligada na loja travada: ali o canal é o contexto da página, não um
   * filtro, e o select nem é renderizado.
   */
  const { data: marketplaceOptions = [] } = useClientesFacet(
    activeSeller?.id,
    "marketplaces",
    "",
    !lojaTravada,
    facetFilters,
  );

  const advCount = countActiveClientesFilters(advFilters);

  // Só busca os nomes das fases quando há chip de funil para rotular.
  const { data: stageList = [] } = usePipelineStageOptions(
    activeSeller?.id,
    advFilters.stageIds.length > 0,
  );
  const stageNames = useMemo(
    () => Object.fromEntries(stageList.map((s) => [s.id, s.name])),
    [stageList],
  );
  const chips = useMemo(
    () => describeClientesFilters(advFilters, { stageNames }),
    [advFilters, stageNames],
  );

  // O período conta como filtro: a tela nasce em "Últimos 30 dias" sem o usuário
  // escolher nada, e é o que esconde a base de um seller que vendeu há 45 dias.
  // A loja travada conta pelo mesmo motivo: sem ela, uma loja sem pedido nenhum
  // em "Todo período" caía no texto de base vazia e afirmava que o seller não
  // tem cliente, com a pílula "Loja: amazon" na tela e 672 clientes na base.
  const hasFilters =
    !!lojaTravada ||
    filterPeriod !== CLIENTES_PERIODO_TUDO ||
    filterMinOrders !== "0" ||
    searchTerm !== "" ||
    advCount > 0;

  // O que ESTA tela consegue limpar. Dentro da loja o período é do cabeçalho e
  // a trava não sai: sem esta conta, o botão "Limpar filtros" do estado vazio
  // apareceria para não fazer nada.
  const temFiltroLimpavel =
    advCount > 0 ||
    searchTerm !== "" ||
    filterMinOrders !== "0" ||
    (!hidePeriodSelect && filterPeriod !== CLIENTES_PERIODO_TUDO);

  // Período e loja podem mudar POR FORA (o seletor do cabeçalho da loja, ou a
  // navegação de /lojas/mercado_livre para /lojas/shopee). `handlePeriodChange`
  // só cobre o select desta tela: sem isto a consulta refazia com o offset da
  // página antiga e devolvia zero linha — título "(0)", tabela vazia e o rodapé
  // da paginação sumindo, sem botão nenhum para voltar à página 1.
  useEffect(() => {
    setCurrentPage(1);
  }, [filterPeriod, lojaTravada]);

  // Busca aplicada com 250ms de atraso: o filtro roda enquanto o usuário digita.
  useEffect(() => {
    const t = setTimeout(() => {
      setSearchTerm(searchInput.trim());
      setCurrentPage(1);
    }, 250);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    let isMounted = true;
    // Cada disparo carimba sua ordem; respostas fora de ordem são descartadas.
    const seq = ++reqSeq.current;

    const loadClients = async () => {
      if (!activeSeller) {
        setLoading(false);
        return;
      }
      try {
        setLoading(true);

        // Nada de signOut aqui: se a sessão estiver mesmo inválida a própria RPC
        // devolve erro e o AuthContext cuida do refresh/redirect. Derrubar a sessão
        // neste ponto causava "tela vazia" com sessão válida e getSession lento.
        const from = (currentPage - 1) * ITEMS_PER_PAGE;
        const { data: metricsData, error: metricsError } = await (supabase.rpc as any)(
          "get_clients_with_deduped_metrics",
          {
            _seller_id: activeSeller.id,
            _period_start: periodStart,
            _client_id: null,
            _order_by: orderBy,
            _limit: ITEMS_PER_PAGE,
            _offset: from,
            // Os argumentos legados vão nulos: o recorte inteiro desce por
            // `_filters`. O banco funde os dois numa fonte de verdade só, e
            // mandar o mesmo filtro pelos dois caminhos é como a lista e os
            // cards do topo passam a discordar.
            _min_orders: 0,
            _state_code: null,
            _search: null,
            _rfv_segments: null,
            _filters: filterPayload,
          },
        ) as { data: ClientMetricsRow[] | null; error: unknown };

        if (!isMounted || seq !== reqSeq.current) return;

        // Erro não pode virar "lista antiga com filtro novo": limpa e avisa,
        // senão o usuário lê os 672 de "todo período" como sendo os de SP.
        if (metricsError) {
          console.error("[Clientes] Erro ao buscar métricas de clientes:", metricsError);
          setLoadError(true);
          setClients([]);
          setTotalClients(0);
          toast({
            variant: "destructive",
            title: "Não foi possível carregar os clientes",
            description: "A consulta falhou. Tente de novo em alguns instantes.",
          });
          return;
        }

        // Rede de baixo do efeito acima: qualquer caminho que encolha o recorte
        // com a lista numa página alta cai aqui. `total_count` viaja NAS LINHAS,
        // então sem linha o front gravaria 0 e a paginação sumiria da tela.
        if ((metricsData?.length ?? 0) === 0 && currentPage > 1) {
          setCurrentPage(1);
          return;
        }

        setLoadError(false);
        setTotalClients(Number(metricsData?.[0]?.total_count || 0));
        setClients(
          (metricsData || []).map((m) => ({
            id: m.client_id,
            full_name: m.full_name || "Cliente sem nome",
            document: m.document || "",
            email: m.email || "",
            whatsapp: m.whatsapp || "",
            state_code: m.state_code || "",
            total_orders: Number(m.total_orders || 0),
            total_spent: Number(m.total_spent || 0),
            last_order_date: m.last_order_at || "",
            first_order_date: m.first_order_at || "",
          })),
        );
      } catch (error) {
        console.error("[Clientes] Erro ao carregar clientes:", error);
        if (isMounted && seq === reqSeq.current) {
          setLoadError(true);
          setClients([]);
          setTotalClients(0);
        }
      } finally {
        if (isMounted && seq === reqSeq.current) setLoading(false);
      }
    };

    loadClients();
    return () => {
      isMounted = false;
    };
  }, [activeSeller, periodStart, filterPayload, orderBy, currentPage, reloadToken, toast]);

  const clientIds = useMemo(() => clients.map((c) => c.id), [clients]);
  const { data: extras = {} } = useClientesPageExtras(activeSeller?.id, clientIds);
  // Enquanto nenhum id da página atual tem extras, as colunas Loja/Estágio ainda
  // não sabem de nada — mostrar "—" e "Sem estágio" seria afirmar algo do banco
  // antes de perguntar. (A RPC devolve uma linha por id, sempre.)
  const extrasLoading = clientIds.length > 0 && !clientIds.some((id) => extras[id]);

  // Mantém a URL em dia: dá para compartilhar/voltar com o recorte inteiro.
  // JSON puro, sem base64 — quem recebe o link tem de conseguir ler o filtro.
  // `?rfv=` é consumido na inicialização e sai daqui em diante (o segmento já
  // vive dentro do `?f=`). A loja travada nunca chega aqui (não está no
  // estado), então a URL não a anuncia como algo que dá para apagar.
  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    const serializado = serializeFiltersToUrl(advFilters);
    if (serializado) next.set("f", serializado);
    else next.delete("f");
    next.delete("rfv");
    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true });
    }
  }, [advFilters, searchParams, setSearchParams]);

  // Todo filtro volta para a página 1 NO PRÓPRIO handler. Com um efeito separado
  // o fetch saía antes com o offset velho e o resultado era jogado fora — duas
  // chamadas por troca de filtro, e a resposta atrasada podia vencer.
  const handlePeriodChange = useCallback(
    (value: string) => {
      if (!controlado) setPeriodoInterno(value);
      onPeriodChange?.(value);
      setCurrentPage(1);
    },
    [controlado, onPeriodChange],
  );

  const handleMinOrdersChange = (value: string) => {
    setFilterMinOrders(value);
    setCurrentPage(1);
  };

  const applyAdvFilters = useCallback(
    (next: ClientesAdvancedFilters) => {
      setAdvFilters(semLojaEscolhida(next));
      setCurrentPage(1);
    },
    [semLojaEscolhida],
  );

  const handleColSort = (col: string) => {
    const dirs = SORT_MAP[col];
    if (!dirs) return;
    const newDir: "asc" | "desc" = colSort?.col === col && colSort.dir === "desc" ? "asc" : "desc";
    setColSort({ col, dir: newDir });
    setOrderBy(dirs[newDir]);
    setCurrentPage(1);
  };

  const handleOrderByChange = (value: string) => {
    setOrderBy(value);
    setColSort(ORDER_TO_COL[value] ?? null);
    setCurrentPage(1);
  };

  // Abre tudo o que É desta tela. `makeEmptyClientesFilters()` zera as
  // dimensões de uma vez — nenhuma sobra para trás porque nenhuma está escrita
  // à mão aqui. A loja travada não é uma delas: ela não vive no estado.
  //
  // O período entra junto SÓ quando o select é desta barra. Com o seletor no
  // cabeçalho da loja, abrir para "Todo período" daqui mudaria também as abas
  // Visão Geral, Pedidos e Produtos — um botão dentro da lista de clientes
  // reescrevendo a página inteira, sem nada no rótulo prometendo isso.
  const handleClearFilters = useCallback(() => {
    if (!hidePeriodSelect) handlePeriodChange(CLIENTES_PERIODO_TUDO);
    setFilterMinOrders("0");
    setAdvFilters(makeEmptyClientesFilters());
    setSearchInput("");
    setSearchTerm("");
    setCurrentPage(1);
  }, [handlePeriodChange, hidePeriodSelect]);

  const handleViewClient = (clientId: string) => {
    setSelectedClientId(clientId);
    setIsClientSheetOpen(true);
  };

  const totalPages = Math.max(1, Math.ceil(totalClients / ITEMS_PER_PAGE));
  const rangeStart = totalClients === 0 ? 0 : (currentPage - 1) * ITEMS_PER_PAGE + 1;
  const rangeEnd = Math.min(currentPage * ITEMS_PER_PAGE, totalClients);

  // Os três selects da barra que o sheet também edita são a MESMA fonte de
  // verdade (`advFilters`). Com dois estados para o mesmo predicado, é questão
  // de tempo até um recorte não bater com o outro. Quando o sheet escolhe mais
  // de um valor, o gatilho mostra um item-sentinela — sem ele o Radix
  // renderiza o gatilho VAZIO, nem rótulo nem placeholder.
  const barState =
    advFilters.states.length === 0
      ? "all"
      : advFilters.states.length === 1
        ? advFilters.states[0]
        : "__multi";

  // Mesma mecânica do select de Estado acima: o gatilho lê `advFilters`, e o
  // item-sentinela "__multi" existe só para o Radix não renderizar o gatilho
  // vazio quando o sheet marcou mais de um segmento — ou marcou "Sem
  // classificação", que não é nenhum dos 11 nomes da matriz.
  const rfvEscolhidos = advFilters.rfvSegments.length + (advFilters.rfvNone ? 1 : 0);
  const barRfv =
    rfvEscolhidos === 0
      ? "all"
      : advFilters.rfvSegments.length === 1 && !advFilters.rfvNone
        ? advFilters.rfvSegments[0]
        : "__multi";
  const barRfvMultiLabel =
    rfvEscolhidos === 1 && advFilters.rfvNone
      ? "Sem classificação"
      : `${rfvEscolhidos} segmentos`;

  // Mesma mecânica dos dois acima. O valor guardado é o slug em minúsculas
  // (`mercado_livre`), como a faceta devolve e como o predicado do banco
  // compara — `formatMarketplaceName` é só para exibir.
  const barMarketplace =
    advFilters.marketplaces.length === 0
      ? "all"
      : advFilters.marketplaces.length === 1
        ? advFilters.marketplaces[0]
        : "__multi";

  // Pílula sem "x" e fora do array de chips: é o recorte da tela, não um filtro
  // do usuário. Fica ao lado dos chips porque é ali que a tela responde "o que
  // está filtrando" — e é ali que a ausência do "x" fala.
  const semRecorteDePeriodo = filterPeriod === CLIENTES_PERIODO_TUDO;
  const periodoLabel = PERIODOS.find((p) => p.value === filterPeriod)?.label ?? "";

  /**
   * Ressalva SOB os seis cards, e não só no cabeçalho da lista.
   *
   * Dentro da loja "Ticket Médio R$ 852,53" nasce a poucos centímetros do
   * "R$ 402,78" da aba Visão Geral da MESMA loja, sob o mesmo período: os dois
   * estão certos (um é o histórico do cliente, o outro é o da loja) e sem esta
   * linha a diferença de 2,1x se lê como erro do sistema.
   */
  const notaEscopo = lojaTravada ? (
    <>
      Ticket, LTV, pedidos e total gasto somam o histórico do cliente em{" "}
      <strong className="font-semibold">todas as lojas</strong> — {lojaLabel} escolhe quem entra na
      conta, não os valores. O ticket e o faturamento de {lojaLabel} estão na aba Visão Geral.
    </>
  ) : undefined;

  const pilulaLoja = lojaTravada ? (
    <span
      className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-muted py-1 pl-2.5 pr-3 text-xs font-medium text-foreground"
      title="Você está dentro desta loja: o recorte não sai. Para comparar lojas, use a aba Clientes do menu."
    >
      <Lock className="h-3 w-3 shrink-0 text-muted-foreground" />
      <span className="truncate">Loja: {lojaLabel}</span>
    </span>
  ) : undefined;

  // A lista (ou o aviso de falha): a mesma no computador e no celular.
  const listaOuErro =
    loadError && !loading ? (
      <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
        <div className="w-12 h-12 rounded-2xl bg-destructive/10 flex items-center justify-center">
          <AlertTriangle className="w-6 h-6 text-destructive" />
        </div>
        <p className="text-sm font-medium text-foreground">
          Não foi possível carregar a lista.
        </p>
        <p className="text-xs text-muted-foreground max-w-[24rem] leading-relaxed">
          Os filtros acima já mudaram, mas a consulta falhou — nada do que estava na tela vale
          para este recorte.
        </p>
        <Button
          variant="outline"
          size="sm"
          className="mt-1"
          onClick={() => setReloadToken((t) => t + 1)}
        >
          <RotateCw className="w-3.5 h-3.5 mr-2" />
          Tentar de novo
        </Button>
      </div>
    ) : (
      <ClientesTableV2
        clients={clients}
        extras={extras}
        loading={loading}
        extrasLoading={extrasLoading}
        colSort={colSort}
        onSort={handleColSort}
        onSelectClient={handleViewClient}
        hasFilters={hasFilters}
        onClearFilters={temFiltroLimpavel ? handleClearFilters : undefined}
        hideStoreColumn={!!lojaTravada}
        emptyFilteredTitle={
          lojaTravada ? `Nenhum cliente de ${lojaLabel} com esses filtros.` : undefined
        }
        emptyFilteredHint={
          lojaTravada
            ? semRecorteDePeriodo
              ? `Ninguém da sua base tem pedido em ${lojaLabel} com esses filtros. A aba Clientes do menu mostra a base inteira.`
              : `A lista traz quem comprou em ${lojaLabel} dentro do período — amplie a janela no seletor do topo para ver quem comprou antes.`
            : semRecorteDePeriodo
              ? "Remova algum filtro para ampliar o recorte."
              : `A lista está em “${periodoLabel}” — quem comprou antes disso só aparece ampliando o período.`
        }
      />
    );

  // As folhas (mais filtros, as três listas dos cards e a ficha): as mesmas no computador e no celular.
  const folhas = (
    <>
      {activeSeller && (
        <ClientesMoreFiltersSheet
          open={moreFiltersOpen}
          onOpenChange={setMoreFiltersOpen}
          value={advFilters}
          onApply={applyAdvFilters}
          sellerId={activeSeller.id}
          // O sheet precisa do período da barra para avisar quando ele anula o
          // filtro de churn ("sem comprar há mais de N dias") — os dois são
          // ANDados no motor e qualquer N >= período devolve zero.
          periodDays={filterPeriod}
          onUseAllTime={() => handlePeriodChange(CLIENTES_PERIODO_TUDO)}
          lockedMarketplaceLabel={lojaTravada ? lojaLabel : undefined}
          facetFilters={facetFilters}
        />
      )}

      <BirthdayTodaySheet
        open={birthdayOpen}
        onOpenChange={setBirthdayOpen}
        sellerId={activeSeller?.id}
        // O card e a sheet que ele abre recebem o MESMO recorte: é o alinhamento
        // que a migration 20260731130000 garantiu, agora com os filtros dentro.
        filters={filterPayload}
        onSelectClient={handleViewClient}
      />

      <ActiveConversationSheet
        open={activeConvOpen}
        onOpenChange={setActiveConvOpen}
        sellerId={activeSeller?.id}
        filters={filterPayload}
        onSelectClient={handleViewClient}
      />

      <OneTimeClientsSheet
        open={oneTimeOpen}
        onOpenChange={setOneTimeOpen}
        sellerId={activeSeller?.id}
        periodStart={periodStart}
        filters={filterPayload}
        onSelectClient={handleViewClient}
        // A lista já está nesta tela: navegar seria um no-op, então o botão
        // fecha o painel e leva os olhos até a tabela.
        onClose={() => listaRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
      />

      {selectedClientId && activeSeller && (
        <ClientDetailSheet
          clientId={selectedClientId}
          sellerId={activeSeller.id}
          open={isClientSheetOpen}
          onOpenChange={setIsClientSheetOpen}
          // A tabela vive em useState (a consulta é montada à mão, com filtros e
          // paginação): sem recarregar, a linha atrás do sheet fica com o nome antigo.
          onClientSaved={() => setReloadToken((t) => t + 1)}
        />
      )}
    </>
  );

  if (isMobile && (tituloMobile || embutidaMobile)) {
    const rotuloPeriodo =
      filterPeriod === CLIENTES_PERIODO_TUDO
        ? "todo o período"
        : filterPeriod === "365"
          ? "último ano"
          : `últimos ${filterPeriod} dias`;
    const rotuloMarketplace =
      barMarketplace === "all"
        ? "Marketplace"
        : barMarketplace === "__multi"
          ? `${advFilters.marketplaces.length} marketplaces`
          : formatMarketplaceName(barMarketplace);
    const rotuloMinimo = MIN_PEDIDOS.find((m) => m.value === filterMinOrders);
    const rotuloEstado =
      barState === "all" ? "Estado" : barState === "__multi" ? `${advFilters.states.length} estados` : barState;
    const rotuloRfv = barRfv === "all" ? "Segmento" : barRfv === "__multi" ? barRfvMultiLabel : barRfv;
    const rotuloOrdem = ORDENACOES.find((o) => o.value === orderBy)?.label ?? "Ordenar";
    // O "Limpar" do título só aparece com filtro que o usuário ligou na lista, e
    // não mexe no período: ele tem as pílulas próprias no topo e vale para a
    // tela toda (como em Pedidos). Sem isto o botão nascia aceso em "30 dias"
    // e, tocado, trocava os números do topo para "Tudo" sem aviso.
    const temFiltroDaLista = advCount > 0 || searchInput !== "" || filterMinOrders !== "0";
    const limparFiltrosDaLista = () => {
      setFilterMinOrders("0");
      setAdvFilters(makeEmptyClientesFilters());
      setSearchInput("");
      setSearchTerm("");
      setCurrentPage(1);
    };

    return (
      <>
        <div className={cn("flex flex-col gap-7", !embutidaMobile && "px-4 pb-6 pt-4")}>
          {(tituloMobile || !hidePeriodSelect) && (
            <div className="flex flex-col gap-3">
              {tituloMobile && <CabecalhoTela icone={Users} titulo={tituloMobile} />}
              {!hidePeriodSelect && (
                <Pilulas rotulo="Período" opcoes={PERIODOS_MOBILE} valor={filterPeriod} onChange={handlePeriodChange} />
              )}
            </div>
          )}

          {activeSeller && (
            <ClientesInsightsV2
              mobile
              rotuloPeriodo={rotuloPeriodo}
              sellerId={activeSeller.id}
              periodStart={periodStart}
              filters={filterPayload}
              onOpenBirthday={() => setBirthdayOpen(true)}
              onOpenActiveConv={() => setActiveConvOpen(true)}
              onOpenOneTime={() => setOneTimeOpen(true)}
              hideStoresTab={hideStoresTab}
              extraTab={insightsExtraTab}
              scopeNote={notaEscopo}
            />
          )}

          <section ref={listaRef} className="flex scroll-mt-16 flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-[19px] font-bold tracking-tight text-foreground">
                {lojaTravada ? `Clientes de ${lojaLabel}` : "Clientes"}{" "}
                {loading || loadError ? (
                  <span className="font-semibold text-muted-foreground">(…)</span>
                ) : (
                  <span className="font-semibold tabular-nums text-muted-foreground">
                    ({totalClients.toLocaleString("pt-BR")})
                  </span>
                )}
              </h2>
              {temFiltroDaLista && (
                <button
                  type="button"
                  onClick={limparFiltrosDaLista}
                  className="flex items-center gap-1 rounded-full px-2 py-1 text-[13px] font-semibold text-primary active:bg-primary/10"
                >
                  <X className="h-3.5 w-3.5" strokeWidth={2.5} />
                  Limpar
                </button>
              )}
            </div>

            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Nome, CPF, e-mail ou telefone"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="h-11 rounded-full border-border/60 bg-card pl-10 pr-10 text-[15px]"
              />
              {searchInput && (
                <button
                  type="button"
                  onClick={() => setSearchInput("")}
                  aria-label="Limpar busca"
                  className="absolute right-2.5 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground active:bg-muted"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <div className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <Button
                variant="outline"
                onClick={() => setMoreFiltersOpen(true)}
                className={cn(PILULA_FILTRO, advCount > 0 && PILULA_ATIVA)}
              >
                <SlidersHorizontal className="h-4 w-4" />
                Filtros
                {advCount > 0 && (
                  <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-primary-foreground">
                    {advCount}
                  </span>
                )}
              </Button>

              {!lojaTravada &&
                (marketplaceOptions.length > 1 || advFilters.marketplaces.length > 0) && (
                <Select
                  value={barMarketplace}
                  onValueChange={(v) =>
                    v !== "__multi" &&
                    applyAdvFilters({ ...advFilters, marketplaces: v === "all" ? [] : [v] })
                  }
                >
                  <SelectTrigger aria-label="Marketplace" className={cn(PILULA_FILTRO, barMarketplace !== "all" && PILULA_ATIVA)}>
                    <Store className="h-4 w-4 shrink-0 opacity-70" />
                    <span>{rotuloMarketplace}</span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os marketplaces</SelectItem>
                    {advFilters.marketplaces.length > 1 && (
                      <SelectItem value="__multi" disabled>
                        {advFilters.marketplaces.length} marketplaces
                      </SelectItem>
                    )}
                    {advFilters.marketplaces.length === 1 &&
                      !marketplaceOptions.some((o) => o.value === advFilters.marketplaces[0]) && (
                        <SelectItem value={advFilters.marketplaces[0]}>
                          {formatMarketplaceName(advFilters.marketplaces[0])}
                        </SelectItem>
                      )}
                    {marketplaceOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        <span className="inline-flex items-center gap-2">
                          {formatMarketplaceName(opt.label || opt.value)}
                          <span className="text-xs text-muted-foreground tabular-nums">
                            {opt.total.toLocaleString("pt-BR")}
                          </span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              <Select value={filterMinOrders} onValueChange={handleMinOrdersChange}>
                <SelectTrigger aria-label="Mínimo de pedidos" className={cn(PILULA_FILTRO, filterMinOrders !== "0" && PILULA_ATIVA)}>
                  <ShoppingBag className="h-4 w-4 shrink-0 opacity-70" />
                  <span>{filterMinOrders === "0" ? "Pedidos" : rotuloMinimo?.label}</span>
                </SelectTrigger>
                <SelectContent>
                  {MIN_PEDIDOS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={barState}
                onValueChange={(v) =>
                  v !== "__multi" &&
                  applyAdvFilters({ ...advFilters, states: v === "all" ? [] : [v] })
                }
              >
                <SelectTrigger aria-label="Estado" className={cn(PILULA_FILTRO, barState !== "all" && PILULA_ATIVA)}>
                  <MapPin className="h-4 w-4 shrink-0 opacity-70" />
                  <span>{rotuloEstado}</span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os estados</SelectItem>
                  {advFilters.states.length > 1 && (
                    <SelectItem value="__multi" disabled>
                      {advFilters.states.length} estados
                    </SelectItem>
                  )}
                  {advFilters.states.length === 1 && !UFS.includes(advFilters.states[0]) && (
                    <SelectItem value={advFilters.states[0]}>{advFilters.states[0]}</SelectItem>
                  )}
                  {UFS.map((uf) => (
                    <SelectItem key={uf} value={uf}>
                      {uf}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {(rfvOptions.length > 0 || rfvEscolhidos > 0) && (
                <Select
                  value={barRfv}
                  onValueChange={(v) =>
                    v !== "__multi" &&
                    applyAdvFilters({
                      ...advFilters,
                      rfvSegments: v === "all" ? [] : [v],
                      rfvNone: false,
                    })
                  }
                >
                  <SelectTrigger aria-label="Segmento RFV" className={cn(PILULA_FILTRO, barRfv !== "all" && PILULA_ATIVA)}>
                    <Sparkles className="h-4 w-4 shrink-0 opacity-70" />
                    <span>{rotuloRfv}</span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os segmentos</SelectItem>
                    {barRfv === "__multi" && (
                      <SelectItem value="__multi" disabled>
                        {barRfvMultiLabel}
                      </SelectItem>
                    )}
                    {rfvOptions.map((opt) => (
                      <SelectItem key={opt.name} value={opt.name}>
                        <span className="inline-flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full" style={{ background: opt.color }} />
                          {opt.name}
                          <span className="text-xs text-muted-foreground tabular-nums">
                            {opt.clients}
                          </span>
                        </span>
                      </SelectItem>
                    ))}
                    {rfvOptions.length === 0 && advFilters.rfvSegments.length === 1 && (
                      <SelectItem value={advFilters.rfvSegments[0]}>
                        <span className="inline-flex items-center gap-2">
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{
                              background: RFV_COLORS[advFilters.rfvSegments[0]] ?? "#94a3b8",
                            }}
                          />
                          {advFilters.rfvSegments[0]}
                        </span>
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
              )}

              <Select value={orderBy} onValueChange={handleOrderByChange}>
                <SelectTrigger aria-label="Ordenar por" className={PILULA_FILTRO}>
                  <ArrowDownUp className="h-4 w-4 shrink-0 opacity-70" />
                  <span>{rotuloOrdem}</span>
                </SelectTrigger>
                <SelectContent>
                  {ORDENACOES.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <ClientesFilterChips
              className="flex flex-wrap items-center gap-2"
              chips={chips}
              onRemove={(chip) => applyAdvFilters(chip.clear(advFilters))}
              onClearAll={() => applyAdvFilters(makeEmptyClientesFilters())}
              leading={pilulaLoja}
            />

            {lojaTravada && (
              <p className="text-[12px] leading-snug text-muted-foreground">
                {semRecorteDePeriodo
                  ? `Quem já comprou em ${lojaLabel}.`
                  : `Quem comprou em ${lojaLabel} dentro do período.`}{" "}
                Pedidos e total gasto somam o histórico do cliente em todas as lojas.
              </p>
            )}

            <div className="overflow-hidden rounded-3xl border border-border/60 bg-card">
              {listaOuErro}
            </div>

            {!loading && !loadError && totalClients > 0 && (
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
                <p className="text-center text-[12px] tabular-nums text-muted-foreground">
                  {rangeStart.toLocaleString("pt-BR")}–{rangeEnd.toLocaleString("pt-BR")} de{" "}
                  {totalClients.toLocaleString("pt-BR")} clientes
                </p>
              </div>
            )}

            {showExport && (
              <div className="flex justify-center">
                <ExportButton
                  dataType="clients"
                  activeFilterCount={advCount}
                  className="h-9 rounded-full border-border/60 bg-card px-4 text-[13px] font-semibold"
                />
              </div>
            )}
          </section>
        </div>

        {folhas}
      </>
    );
  }

  return (
    <>
      <div className={className}>
        {activeSeller && (
          <ClientesInsightsV2
            sellerId={activeSeller.id}
            periodStart={periodStart}
            filters={filterPayload}
            onOpenBirthday={() => setBirthdayOpen(true)}
            onOpenActiveConv={() => setActiveConvOpen(true)}
            onOpenOneTime={() => setOneTimeOpen(true)}
            hideStoresTab={hideStoresTab}
            extraTab={insightsExtraTab}
            totalClientsHint={
              lojaTravada
                ? semRecorteDePeriodo
                  ? `com pedido em ${lojaLabel}`
                  : `com pedido em ${lojaLabel} no período`
                : undefined
            }
            scopeNote={notaEscopo}
          />
        )}

        {/* Barra de filtros */}
        <div className="rounded-2xl bg-card shadow-sm p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="relative flex-1 min-w-0 lg:min-w-[320px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Buscar por nome, CPF/CNPJ, e-mail ou telefone..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="h-10 pl-9 pr-9"
              />
              {searchInput && (
                <button
                  type="button"
                  onClick={() => setSearchInput("")}
                  aria-label="Limpar busca"
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* `lg:flex-wrap` e o piso da busca entraram junto com o select
                de Marketplace: eram 5 controles, viraram 6, e a soma não cabe
                numa linha nem a 1440px. Sem wrap a fileira não quebra — ela
                ESMAGA, porque a busca é `flex-1 min-w-0` e os controles eram
                `shrink-0`: a 1280px com o RFV ligado isso cortava a busca E o
                rótulo do próprio Período ("s 30 dias"). */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:flex lg:flex-wrap lg:items-center lg:justify-end">
              {!hidePeriodSelect && (
                <Select value={filterPeriod} onValueChange={handlePeriodChange}>
                  <SelectTrigger className="h-10 lg:w-[168px]">
                    <SelectValue placeholder="Período" />
                  </SelectTrigger>
                  <SelectContent>
                    {PERIODOS.map((p) => (
                      <SelectItem key={p.value} value={p.value}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {/* Marketplace — some na loja travada: ali o canal é o contexto
                  da página (a pílula ao lado dos chips já diz qual), e trocá-lo
                  aqui levaria o usuário para fora da loja que ele abriu. */}
              {!lojaTravada &&
                (marketplaceOptions.length > 1 || advFilters.marketplaces.length > 0) && (
                <Select
                  value={barMarketplace}
                  onValueChange={(v) =>
                    v !== "__multi" &&
                    applyAdvFilters({ ...advFilters, marketplaces: v === "all" ? [] : [v] })
                  }
                >
                  <SelectTrigger className="h-10 lg:w-[180px]">
                    <SelectValue placeholder="Marketplace" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os marketplaces</SelectItem>
                    {advFilters.marketplaces.length > 1 && (
                      <SelectItem value="__multi" disabled>
                        {advFilters.marketplaces.length} marketplaces
                      </SelectItem>
                    )}
                    {/* Deep link (`?f={"marketplaces":["x"]}`) com um canal que a
                        faceta não oferta — canal sem pedido no recorte, ou slug
                        digitado à mão. Sem este item o gatilho ficaria vazio com
                        o filtro ligado, o mesmo motivo do "EX" no select de UF. */}
                    {advFilters.marketplaces.length === 1 &&
                      !marketplaceOptions.some((o) => o.value === advFilters.marketplaces[0]) && (
                        <SelectItem value={advFilters.marketplaces[0]}>
                          {formatMarketplaceName(advFilters.marketplaces[0])}
                        </SelectItem>
                      )}
                    {marketplaceOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        <span className="inline-flex items-center gap-2">
                          {formatMarketplaceName(opt.label || opt.value)}
                          <span className="text-xs text-muted-foreground tabular-nums">
                            {opt.total.toLocaleString("pt-BR")}
                          </span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              <Select value={filterMinOrders} onValueChange={handleMinOrdersChange}>
                <SelectTrigger className="h-10 lg:w-[168px]">
                  <SelectValue placeholder="Mínimo de pedidos" />
                </SelectTrigger>
                <SelectContent>
                  {MIN_PEDIDOS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={barState}
                onValueChange={(v) =>
                  v !== "__multi" &&
                  applyAdvFilters({ ...advFilters, states: v === "all" ? [] : [v] })
                }
              >
                <SelectTrigger className="h-10 lg:w-[120px]">
                  <SelectValue placeholder="Estado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os estados</SelectItem>
                  {advFilters.states.length > 1 && (
                    <SelectItem value="__multi" disabled>
                      {advFilters.states.length} estados
                    </SelectItem>
                  )}
                  {/* A faceta lê `clients.state_code` como está no banco, e há
                      valor fora das 27 UFs (hoje, "EX"). Sem este item, escolher
                      esse valor no sheet deixaria o gatilho VAZIO. */}
                  {advFilters.states.length === 1 && !UFS.includes(advFilters.states[0]) && (
                    <SelectItem value={advFilters.states[0]}>{advFilters.states[0]}</SelectItem>
                  )}
                  {UFS.map((uf) => (
                    <SelectItem key={uf} value={uf}>
                      {uf}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Segmento RFV — só aparece quando a análise está liberada para
                  este seller, ou quando já veio um segmento pela URL. */}
              {(rfvOptions.length > 0 || rfvEscolhidos > 0) && (
                <Select
                  value={barRfv}
                  onValueChange={(v) =>
                    v !== "__multi" &&
                    applyAdvFilters({
                      ...advFilters,
                      rfvSegments: v === "all" ? [] : [v],
                      rfvNone: false,
                    })
                  }
                >
                  <SelectTrigger className="h-10 lg:w-[180px]">
                    <SelectValue placeholder="Segmento RFV" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os segmentos</SelectItem>
                    {barRfv === "__multi" && (
                      <SelectItem value="__multi" disabled>
                        {barRfvMultiLabel}
                      </SelectItem>
                    )}
                    {rfvOptions.map((opt) => (
                      <SelectItem key={opt.name} value={opt.name}>
                        <span className="inline-flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full" style={{ background: opt.color }} />
                          {opt.name}
                          <span className="text-xs text-muted-foreground tabular-nums">
                            {opt.clients}
                          </span>
                        </span>
                      </SelectItem>
                    ))}
                    {/* Deep link com a Análise RFV ainda travada: sem este item
                        o gatilho ficaria vazio com o filtro ligado. */}
                    {rfvOptions.length === 0 && advFilters.rfvSegments.length === 1 && (
                      <SelectItem value={advFilters.rfvSegments[0]}>
                        <span className="inline-flex items-center gap-2">
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{
                              background: RFV_COLORS[advFilters.rfvSegments[0]] ?? "#94a3b8",
                            }}
                          />
                          {advFilters.rfvSegments[0]}
                        </span>
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
              )}

              <Select value={orderBy} onValueChange={handleOrderByChange}>
                <SelectTrigger className="h-10 lg:w-[190px]">
                  <SelectValue placeholder="Ordenar por" />
                </SelectTrigger>
                <SelectContent>
                  {ORDENACOES.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button
                variant="outline"
                className="relative h-10 gap-2 col-span-2 sm:col-span-1"
                onClick={() => setMoreFiltersOpen(true)}
              >
                <SlidersHorizontal className="h-4 w-4" />
                Mais filtros
                {advCount > 0 && (
                  <span className="absolute -right-1.5 -top-1.5 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold tabular-nums text-primary-foreground">
                    {advCount}
                  </span>
                )}
              </Button>
            </div>
          </div>

          {/* Fora do sheet: fechado o painel, o badge sozinho não diz O QUE
              está filtrando, e um total menor lê como base sumindo. */}
          <ClientesFilterChips
            chips={chips}
            onRemove={(chip) => applyAdvFilters(chip.clear(advFilters))}
            onClearAll={() => applyAdvFilters(makeEmptyClientesFilters())}
            leading={pilulaLoja}
          />
        </div>

        {/* Lista */}
        <div ref={listaRef} className="rounded-2xl bg-card shadow-sm overflow-hidden">
          <div className="flex flex-col gap-3 px-5 py-2.5 border-b border-border sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h2 className="text-[15px] font-semibold text-foreground">
                {lojaTravada ? `Clientes de ${lojaLabel}` : "Lista de Clientes"}{" "}
                {/* Sem dado ainda não é "(0)": esse zero ficava visível durante todo
                    o primeiro carregamento e parecia base vazia. */}
                {loading || loadError ? (
                  <span className="text-muted-foreground font-normal">(…)</span>
                ) : (
                  <span className="text-muted-foreground font-normal tabular-nums">
                    ({totalClients.toLocaleString("pt-BR")})
                  </span>
                )}
              </h2>
              {/* A loja recorta QUEM aparece, não quanto: as colunas vêm de
                  client_metrics, que é o histórico do cliente no seller inteiro
                  e já deduplicado. Dizer "nesta loja" aqui seria mentira. */}
              {lojaTravada && (
                <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
                  {semRecorteDePeriodo
                    ? `Quem já comprou em ${lojaLabel}.`
                    : `Quem comprou em ${lojaLabel} dentro do período.`}{" "}
                  Pedidos, total gasto e ticket somam o histórico do cliente em todas as lojas — a
                  loja escolhe quem entra na lista, não os valores.
                </p>
              )}
            </div>
            {showExport && <ExportButton dataType="clients" activeFilterCount={advCount} />}
          </div>

          {listaOuErro}

          {!loading && !loadError && totalClients > 0 && (
            <div className="flex flex-col gap-3 px-5 py-4 border-t border-border sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-muted-foreground tabular-nums">
                Mostrando {rangeStart.toLocaleString("pt-BR")}–{rangeEnd.toLocaleString("pt-BR")} de{" "}
                {totalClients.toLocaleString("pt-BR")}
              </p>

              {totalPages > 1 && (
                <Pagination className="mx-0 w-auto justify-start sm:justify-end">
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious
                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                        className={
                          currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"
                        }
                      />
                    </PaginationItem>

                    {pageWindow(currentPage, totalPages).map((p, i) =>
                      p === "gap" ? (
                        <PaginationItem key={`gap-${i}`}>
                          <PaginationEllipsis />
                        </PaginationItem>
                      ) : (
                        <PaginationItem key={p}>
                          <PaginationLink
                            onClick={() => setCurrentPage(p)}
                            isActive={currentPage === p}
                            className="cursor-pointer tabular-nums"
                          >
                            {p}
                          </PaginationLink>
                        </PaginationItem>
                      ),
                    )}

                    <PaginationItem>
                      <PaginationNext
                        onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                        className={
                          currentPage === totalPages
                            ? "pointer-events-none opacity-50"
                            : "cursor-pointer"
                        }
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              )}
            </div>
          )}
        </div>
      </div>

      {folhas}
    </>
  );
}

export default ClientesScreen;
