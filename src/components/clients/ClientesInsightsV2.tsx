import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Cake,
  ChevronLeft,
  ChevronRight,
  DollarSign,
  MessagesSquare,
  RotateCw,
  ShoppingBag,
  TrendingUp,
  Users,
  type LucideIcon,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { useRfvSummary } from "@/hooks/useRfv";
import { ptBR } from "date-fns/locale";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Skeleton } from "@/components/ui/skeleton";
import { KpiPadrao } from "@/components/kpi/KpiPadrao";
import { Bloco, Bolinha, Linha, Secao } from "@/components/mobile/blocos";
import { tamanhoComum } from "@/components/mobile/tamanhoDoValor";
import { hexToRgba } from "@/components/clients/sections/shared";
import { useClientesKpis } from "@/hooks/useClientesKpis";
import type { ClientesFilterPayload } from "@/components/clients/clientesFilters";
import {
  useClientesDemografia,
  useGrowthSeries,
  useStoreDistribution,
  type AgeDistributionRow,
  type GenderDistributionRow,
  type GrowthSeriesPoint,
  type StoreDistributionRow,
} from "@/hooks/useClientesCharts";
import { useMarketplaceAliases } from "@/hooks/useMarketplaceAliases";
import { getMarketplaceColor } from "@/utils/marketplaceColors";
import { inkPair } from "@/utils/contrastInk";
import { formatCurrency, formatMarketplaceName } from "@/utils/formatters";
import { cn } from "@/lib/utils";

// Sem borda, como a barra de filtros e o painel da lista logo abaixo (e como o
// CardWrap de sections/shared e a tela de RFV). Com borda, no tema escuro estes
// cards eram os únicos contornados da página.
const CARD = "rounded-2xl bg-card shadow-sm p-5";

const STORE_PAGE_SIZE = 4;
const GROWTH_MONTHS = 6;

// As mesmas cores do gráfico de gênero do dashboard — a tela toda fala a mesma língua.
const GENDER_COLORS: Record<string, string> = {
  Masculino: "hsl(200 70% 55%)",
  Feminino: "hsl(330 75% 60%)",
};

// A RPC devolve as faixas em ordem arbitrária; a leitura só faz sentido crescente.
const AGE_RAMP = ["#09AF68", "#2FBF80", "#69D3A4", "#A6E6C7", "#D7F4E6"];
const AGE_ORDER = [
  { range: "-24", label: "Até 24 anos" },
  { range: "25-34", label: "25 a 34 anos" },
  { range: "35-49", label: "35 a 49 anos" },
  { range: "50-64", label: "50 a 64 anos" },
  { range: "65+", label: "65 anos ou mais" },
] as const;

const PRIMARY_HEX = "#09AF68";

// Identidade estável: `?? []` inline criaria um array novo a cada render e
// mexeria nas deps dos memos/efeitos deste card.
const NO_STORES: StoreDistributionRow[] = [];
const NO_GROWTH: GrowthSeriesPoint[] = [];
const NO_GENDER: GenderDistributionRow[] = [];
const NO_AGE: AgeDistributionRow[] = [];

type TabKey = "stores" | "growth" | "gender" | "age" | "rfv_r" | "rfv_f" | "rfv_v";

const TABS: { key: TabKey; label: string }[] = [
  { key: "stores", label: "Marketplaces" },
  { key: "growth", label: "Crescimento" },
  { key: "gender", label: "Gênero" },
  { key: "age", label: "Faixa Etária" },
  // Clientes por nota de RFV, vindos da aba Análise RFV aposentada. São a base
  // INTEIRA classificada (janela do RFV) — não seguem os filtros/período da
  // tela, e a legenda de cada aba diz isso.
  { key: "rfv_r", label: "Recência" },
  { key: "rfv_f", label: "Frequência" },
  { key: "rfv_v", label: "Valor" },
];

/** Ordem 5→1, como no Segundo Pedido: nota alta (melhor) primeiro. */
const RFV_BUCKETS = ["5", "4", "3", "2", "1"] as const;

const RFV_META: Record<"rfv_r" | "rfv_f" | "rfv_v", { prefixo: "R" | "F" | "V"; hint: string }> = {
  rfv_r: { prefixo: "R", hint: "R5 comprou há pouco tempo; R1 está há mais tempo sem comprar." },
  rfv_f: { prefixo: "F", hint: "F5 compra com mais frequência; F1 comprou poucas vezes." },
  rfv_v: { prefixo: "V", hint: "V5 gastou mais; V1 gastou menos." },
};

/**
 * Aba extra do painel, para quem monta esta tela num contexto que a aba "Lojas"
 * não serve (ver `hideStoresTab`). O conteúdo vem de fora: gráfico de loja não
 * é assunto do componente de clientes.
 */
export interface ClientesInsightsExtraTab {
  key: string;
  label: string;
  /**
   * Recebe o recorte JÁ MONTADO. É por isso que é função e não um nó pronto: a
   * aba de fora não tem como remontar o mesmo payload por conta própria, e um
   * gráfico com recorte próprio ao lado dos seis KPIs é exatamente o defeito
   * que a migration 20260731130000 existe para impedir.
   */
  render: (filters: ClientesFilterPayload) => ReactNode;
}

const nf = (n: number) => n.toLocaleString("pt-BR");

/* ------------------------------------------------------------------ KPI card */

interface KpiItem {
  titulo: string;
  valor: string;
  apoio: ReactNode;
  tooltip: string;
  icone: LucideIcon;
  onClick?: () => void;
}

function VerLista({ enabled }: { enabled: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 font-semibold",
        enabled ? "text-primary" : "text-muted-foreground",
      )}
    >
      Ver lista <ArrowRight className="w-3 h-3" />
    </span>
  );
}

/* --------------------------------------------------------------- chart shell */

/**
 * Piso da área de gráfico: 188px no notebook, 240px só a partir de 1536px
 * (`2xl`). É este piso, e não a coluna de KPIs, que define a altura do bloco
 * de insights inteiro — o painel é sempre o mais alto dos dois.
 */
const CHART_MIN_H = "min-h-[188px] 2xl:min-h-[240px]";

function EmptyChart({ message }: { message: string }) {
  return (
    <div className={cn("h-full flex items-center justify-center px-6 text-center", CHART_MIN_H)}>
      <p className="text-sm text-muted-foreground max-w-[18rem] leading-relaxed">{message}</p>
    </div>
  );
}

/** Erro tem de parecer erro: sem isto, RPC fora do ar virava "nenhum pedido". */
function ErrorChart({ onRetry }: { onRetry: () => void }) {
  return (
    <div className={cn("h-full flex flex-col items-center justify-center gap-3 px-6 text-center", CHART_MIN_H)}>
      <p className="text-sm text-destructive max-w-[18rem] leading-relaxed">
        Não foi possível carregar estes dados.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted transition-colors"
      >
        <RotateCw className="w-3.5 h-3.5" />
        Tentar de novo
      </button>
    </div>
  );
}

function LoadingChart() {
  return (
    <div className={cn("h-full space-y-3", CHART_MIN_H)}>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="w-7 h-7 rounded-full shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-1.5 w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Barra horizontal — usada pelas abas Lojas (com avatar) e Faixa Etária (com ponto).
 * `fill` é a largura da barra em % e `meta` o texto da direita: nas Lojas os dois
 * não são a mesma coisa (ver comentário do storeMax).
 */
function BarRow({
  initial,
  label,
  meta,
  fill,
  color,
}: {
  initial?: string;
  label: string;
  meta: string;
  fill: number;
  color: string;
}) {
  const ink = inkPair(color);
  const inkVars = {
    "--row-ink": ink.light,
    "--row-ink-dark": ink.dark,
  } as CSSProperties;

  return (
    <div className="flex items-center gap-3 -mx-2 px-2 py-1.5 rounded-lg hover:bg-muted transition-colors" style={inkVars}>
      {initial ? (
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 text-[color:var(--row-ink)] dark:text-[color:var(--row-ink-dark)]"
          style={{ background: hexToRgba(color, 0.16) }}
        >
          {initial}
        </div>
      ) : (
        <span className="w-2.5 h-2.5 rounded-full shrink-0 bg-[color:var(--row-ink)] dark:bg-[color:var(--row-ink-dark)]" />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2 mb-1">
          <span className="text-[12px] font-semibold text-foreground truncate">{label}</span>
          <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">{meta}</span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full transition-all bg-[color:var(--row-ink)] dark:bg-[color:var(--row-ink-dark)]"
            style={{ width: `${fill <= 0 ? 0 : Math.max(fill, 2)}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function GrowthTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload as { label: string; novos: number; acumulado: number };
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-lg">
      <p className="text-xs font-semibold text-foreground capitalize">{p.label}</p>
      <p className="text-xs text-muted-foreground tabular-nums">
        {nf(p.novos)} novos · {nf(p.acumulado)} no total
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ component */

const EMPTY_PAYLOAD: ClientesFilterPayload = {};

export function ClientesInsightsV2({
  sellerId,
  periodStart,
  filters = EMPTY_PAYLOAD,
  onOpenBirthday,
  onOpenActiveConv,
  onOpenOneTime,
  hideStoresTab = false,
  extraTab,
  totalClientsHint,
  scopeNote,
  mobile = false,
  rotuloPeriodo = "no período",
}: {
  sellerId: string;
  periodStart: string;
  /**
   * O recorte inteiro da tela (período, busca, e tudo que o sheet "Mais
   * filtros" edita). Os seis cards, os quatro gráficos e a lista bebem da mesma
   * fonte — é o que a migration 20260731130000 teve de corrigir depois.
   */
  filters?: ClientesFilterPayload;
  onOpenBirthday: () => void;
  onOpenActiveConv: () => void;
  onOpenOneTime: () => void;
  /**
   * Some com a aba "Lojas". Serve a quem já entrou com `marketplaces` travado
   * no recorte: a RPC repete o predicado de canal de propósito, então o gráfico
   * degenera para UMA barra em 100% — sem informação, no lugar mais nobre.
   */
  hideStoresTab?: boolean;
  /** Aba de fora, que assume o lugar da "Lojas" quando ela é escondida. */
  extraTab?: ClientesInsightsExtraTab;
  /** Substitui "com pedido no período" no card "Total de Clientes". */
  totalClientsHint?: string;
  /**
   * Linha de ressalva SOB os seis cards.
   *
   * Existe porque a ressalva sobre a origem dos valores estava só no cabeçalho
   * da lista, três cards abaixo do primeiro número da tela: dentro de uma loja,
   * "Ticket Médio R$ 852,53" fica a poucos centímetros do "R$ 402,78" da aba
   * Visão Geral, e sem uma linha aqui os dois se leem como erro do sistema.
   */
  scopeNote?: ReactNode;
  /**
   * Desenho do celular (22/10/2026), no padrão do Dashboard e de Pedidos: o
   * total de clientes grande, ticket e LTV em blocos, as três listas de ação
   * (1 vez, aniversariantes, conversas) como linhas de uma seção e o painel de
   * gráficos num cartão com as abas no verde a 10%. Mesmos dados e textos.
   */
  mobile?: boolean;
  /** "últimos 30 dias", "todo o período"… — rótulo do número grande no celular. */
  rotuloPeriodo?: string;
}) {
  const tabs = useMemo<{ key: string; label: string }[]>(() => {
    const base = hideStoresTab ? TABS.filter((t) => t.key !== "stores") : [...TABS];
    // Na frente: é a aba que abre, e o painel nasce respondendo à pergunta que
    // só existe neste contexto.
    return extraTab ? [{ key: extraTab.key, label: extraTab.label }, ...base] : base;
  }, [hideStoresTab, extraTab]);

  const [tab, setTab] = useState<string>(() => tabs[0]?.key ?? "growth");
  const [storePage, setStorePage] = useState(0);

  const {
    data: kpis,
    isLoading: kpisLoading,
    isError: kpisError,
  } = useClientesKpis(sellerId, periodStart, filters);

  const storesQuery = useStoreDistribution(sellerId, periodStart, filters, !hideStoresTab);
  const growthQuery = useGrowthSeries(sellerId, GROWTH_MONTHS, filters);
  const demografiaQuery = useClientesDemografia(sellerId, filters);

  // Só consulta o RFV quando uma das três abas está aberta — a classificação
  // varre a base inteira e não deve custar nada para quem fica no Crescimento.
  const rfvMeta = RFV_META[tab as "rfv_r" | "rfv_f" | "rfv_v"] ?? null;
  const rfvQuery = useRfvSummary(rfvMeta ? sellerId : null);
  const rfvData = useMemo(() => {
    if (!rfvMeta || !rfvQuery.data) return [] as { label: string; clientes: number }[];
    const porNota =
      rfvMeta.prefixo === "R" ? rfvQuery.data.by_r
      : rfvMeta.prefixo === "F" ? rfvQuery.data.by_f
      : rfvQuery.data.by_v;
    return RFV_BUCKETS.map((n) => ({
      label: `${rfvMeta.prefixo}${n}`,
      clientes: Number(porNota?.[n] ?? 0),
    }));
  }, [rfvMeta, rfvQuery.data]);
  const rfvTotal = useMemo(() => rfvData.reduce((s2, b) => s2 + b.clientes, 0), [rfvData]);
  const rfvMax = useMemo(() => rfvData.reduce((m, b) => Math.max(m, b.clientes), 0), [rfvData]);

  const stores = storesQuery.data ?? NO_STORES;
  const growth = growthQuery.data ?? NO_GROWTH;
  const genderRows = demografiaQuery.data?.gender ?? NO_GENDER;
  const ageRows = demografiaQuery.data?.age ?? NO_AGE;

  const { getDisplayName } = useMarketplaceAliases(sellerId);

  useEffect(() => {
    setStorePage(0);
  }, [stores]);

  // A aba selecionada tem de existir: se o conjunto mudar (a tela passa a
  // esconder "Lojas"), o painel ficaria com o corpo em branco e nenhuma pílula
  // marcada.
  useEffect(() => {
    if (!tabs.some((t) => t.key === tab)) setTab(tabs[0]?.key ?? "growth");
  }, [tabs, tab]);

  // A RPC conta clientes DISTINTOS por marketplace: quem comprou em duas lojas
  // entra nas duas, então somar as linhas dá pares cliente-loja, não clientes —
  // as barras nunca fechariam 100%. A barra passa a ser relativa à maior loja e
  // o texto mostra o número absoluto.
  const storeMax = useMemo(
    () => stores.reduce((m, r) => Math.max(m, r.client_count), 0),
    [stores],
  );

  const growthData = useMemo(
    () =>
      growth.map((p) => ({
        // `mes` é um `date` puro; parseISO o lê como meia-noite local e evita o
        // recuo de um dia (e portanto de um mês) que `new Date()` causaria em UTC-3.
        label: format(parseISO(p.mes), "MMM", { locale: ptBR }).replace(".", ""),
        novos: p.novos,
        acumulado: p.acumulado,
      })),
    [growth],
  );

  const genderData = useMemo(
    () =>
      genderRows
        .filter((r) => r.client_count > 0)
        .map((r) => ({
          name: r.gender,
          value: r.client_count,
          color: GENDER_COLORS[r.gender] ?? "hsl(var(--muted-foreground))",
        })),
    [genderRows],
  );
  const genderTotal = useMemo(() => genderData.reduce((s, g) => s + g.value, 0), [genderData]);

  const ageData = useMemo(() => {
    const byRange = new Map<string, number>(ageRows.map((r) => [r.age_range, r.client_count]));
    return AGE_ORDER.map((f, i) => ({
      range: f.range,
      label: f.label,
      count: byRange.get(f.range) ?? 0,
      color: AGE_RAMP[i],
    }));
  }, [ageRows]);
  const ageTotal = useMemo(() => ageData.reduce((s, a) => s + a.count, 0), [ageData]);

  const totalPages = Math.ceil(stores.length / STORE_PAGE_SIZE);
  const safePage = Math.min(storePage, Math.max(0, totalPages - 1));
  const storeStart = safePage * STORE_PAGE_SIZE;
  const pagedStores = stores.slice(storeStart, storeStart + STORE_PAGE_SIZE);

  const k = kpis ?? {
    total_clients: 0,
    avg_ticket: 0,
    avg_ltv: 0,
    one_time_clients: 0,
    birthday_today: 0,
    active_conv: 0,
  };

  // Sem isto, RPC com erro vira "0 / R$ 0,00" e o usuário lê como base vazia.
  const falhou = <span className="text-destructive">Não foi possível carregar</span>;
  const valor = (v: string) => (kpisError ? "—" : v);
  const dica = (n: ReactNode) => (kpisError ? falhou : n);

  // Textos de origem escritos do que a RPC get_clientes_kpis faz DE VERDADE:
  // o recorte é clientes_filtro_base (última compra no período + filtros da
  // tela), e ticket/LTV/1 vez usam os totais VITALÍCIOS de client_metrics —
  // pedidos a menos de 3 minutos viram uma compra só, cancelado/reembolsado
  // fica fora. Conversas Ativas ignora o recorte desde a migration de 10/08.
  const kpiCards: KpiItem[] = [
    {
      titulo: "Total de Clientes",
      valor: valor(nf(k.total_clients)),
      // O número sai de quem tem pedido no período (e nos filtros da lista), não
      // do tamanho da base — dizer "na sua base" fazia o usuário achar que
      // tinha perdido clientes ao comparar com o Dashboard. Dentro de uma loja
      // quem chama qualifica ("em Mercado Livre no período"), porque o
      // cabeçalho da loja mostra o mesmo número a 90px daqui.
      apoio: dica(totalClientsHint ?? "com pedido no período"),
      tooltip:
        "Clientes que compraram no período escolhido, já com os filtros da tela aplicados. Pedido cancelado ou reembolsado não conta.",
      icone: Users,
    },
    {
      titulo: "Ticket Médio",
      valor: valor(formatCurrency(k.avg_ticket)),
      apoio: dica("por pedido"),
      tooltip:
        "Tudo o que os clientes deste recorte já gastaram dividido pelo total de compras deles — o histórico inteiro de cada um, não só o período. Pedidos feitos em até 3 minutos contam como uma compra só; cancelados ficam de fora.",
      icone: DollarSign,
    },
    {
      titulo: "LTV Médio",
      valor: valor(formatCurrency(k.avg_ltv)),
      apoio: dica("valor médio por cliente"),
      tooltip:
        "Quanto cada cliente deste recorte já gastou na loja, em média — considera o histórico inteiro do cliente, não só o período da tela.",
      icone: TrendingUp,
    },
    {
      titulo: "Compraram 1 Vez",
      valor: valor(nf(k.one_time_clients)),
      apoio: dica(<VerLista enabled={k.one_time_clients > 0} />),
      tooltip:
        "Clientes do recorte com uma única compra em todo o histórico. Pedidos feitos em até 3 minutos contam como uma compra só; cancelados não contam.",
      icone: ShoppingBag,
      onClick: onOpenOneTime,
    },
    {
      titulo: "Aniversariantes Hoje",
      valor: valor(nf(k.birthday_today)),
      // "no recorte" é obrigatório aqui: com o período padrão de 30 dias este
      // número cai perto de zero, e sem o rótulo isso lê como defeito.
      apoio: dica(
        <span className="flex items-center gap-1">
          <span>no recorte</span>
          <span className="opacity-40">·</span>
          <VerLista enabled={k.birthday_today > 0} />
        </span>,
      ),
      tooltip:
        "Clientes do recorte que fazem aniversário na data de hoje (horário de Brasília). Só entra quem tem data de nascimento cadastrada.",
      icone: Cake,
      onClick: onOpenBirthday,
    },
    {
      titulo: "Conversas Ativas",
      valor: valor(nf(k.active_conv)),
      apoio: dica(
        <span className="flex items-center gap-1">
          <span>janela de 24h</span>
          <span className="opacity-40">·</span>
          <VerLista enabled={k.active_conv > 0} />
        </span>,
      ),
      tooltip:
        "Clientes que mandaram mensagem no WhatsApp nas últimas 24 horas — a janela em que a Meta permite responder. Conta a caixa de entrada inteira, sem seguir os filtros nem o período da tela.",
      icone: MessagesSquare,
      onClick: onOpenActiveConv,
    },
  ];

  // O corpo do painel (legenda, abas e gráfico): o mesmo no computador e no celular.
  const corpoPainel = (
    <>
      {/* Três dos quatro gráficos leem o MESMO recorte da lista, e dizer isso
          em uma linha evita a leitura de que o painel fala da base inteira.
          Crescimento é a exceção DE PROPÓSITO — `useGrowthSeries` manda
          `withoutPeriod(filters)`, senão a curva histórica desabaria —, e com
          o rótulo comum em cima ele afirmava 64 clientes um centímetro acima
          de uma curva terminando em 672. */}
      <p className="mb-3 text-[11px] font-medium text-muted-foreground">
        {tab === "growth" ? (
          <>
            Crescimento da base <span className="opacity-60">· sem recorte de período</span>
          </>
        ) : (
          <>
            Recorte atual
            {!kpisLoading && !kpisError && (
              <span className="tabular-nums"> · {nf(k.total_clients)} clientes</span>
            )}
          </>
        )}
      </p>

      {/* As pílulas somam mais que a largura do painel no notebook, e a barra
          de rolagem estava escondida de propósito — as últimas abas sumiam sem
          nenhuma pista. Abaixo de 1536px elas quebram linha; a partir daí,
          onde o painel é largo o bastante, voltam a ficar numa fileira só. */}
      <div
        className={cn(
          "flex items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          // No celular as abas rolam de lado, de ponta a ponta do cartão.
          mobile
            ? "-mx-4 mb-3 w-[calc(100%+2rem)] flex-nowrap px-4"
            : "flex-wrap 2xl:flex-nowrap mb-3 2xl:mb-4 -mx-1 px-1",
        )}
      >
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              "rounded-full font-semibold whitespace-nowrap transition-colors",
              mobile ? "px-3 py-1.5 text-[12px]" : "px-2.5 py-1 2xl:px-3 2xl:py-1.5 text-[12px] 2xl:text-[13px]",
              tab === t.key
                ? mobile ? "bg-primary/10 text-primary" : "bg-foreground text-background"
                : mobile ? "bg-muted/70 text-muted-foreground" : "bg-muted text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className={cn("flex-1", CHART_MIN_H)}>
        {extraTab && tab === extraTab.key && extraTab.render(filters)}

        {tab === "stores" &&
          (storesQuery.isLoading ? (
            <LoadingChart />
          ) : storesQuery.isError ? (
            <ErrorChart onRetry={() => storesQuery.refetch()} />
          ) : stores.length === 0 ? (
            <EmptyChart message="Nenhum pedido no período." />
          ) : (
            <div className="space-y-2.5">
              {pagedStores.map((s) => {
                const key = s.store_key ?? "";
                const color = getMarketplaceColor(key);
                const label = getDisplayName(key) || formatMarketplaceName(key);
                return (
                  <BarRow
                    key={s.store_key ?? "sem-loja"}
                    initial={(label[0] || "?").toUpperCase()}
                    label={label}
                    meta={`${nf(s.client_count)} ${s.client_count === 1 ? "cliente" : "clientes"}`}
                    fill={storeMax > 0 ? (s.client_count / storeMax) * 100 : 0}
                    color={color}
                  />
                );
              })}

              {/* As outras três abas têm legenda; esta não tinha, e é a única
                  que conta MAIS que o total impresso no cabeçalho do painel
                  ("63 clientes" com 46 + 20 desenhados logo abaixo). */}
              <p className="pt-1 text-[11px] leading-snug text-muted-foreground">
                Quem compra em duas lojas conta nas duas — por isso a soma das barras passa do
                total do recorte, e cada barra é relativa à maior.
              </p>

              {stores.length > STORE_PAGE_SIZE && (
                <div className="flex items-center justify-between pt-2 mt-1 border-t border-border">
                  <span className="text-[11px] text-muted-foreground tabular-nums">
                    Mostrando {storeStart + 1}–{Math.min(storeStart + STORE_PAGE_SIZE, stores.length)} de{" "}
                    {stores.length}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setStorePage((p) => Math.max(0, p - 1))}
                      disabled={safePage === 0}
                      className="w-7 h-7 inline-flex items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      aria-label="Lojas anteriores"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setStorePage((p) => Math.min(totalPages - 1, p + 1))}
                      disabled={safePage >= totalPages - 1}
                      className="w-7 h-7 inline-flex items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      aria-label="Próximas lojas"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}

        {tab === "growth" &&
          (growthQuery.isLoading ? (
            <LoadingChart />
          ) : growthQuery.isError ? (
            <ErrorChart onRetry={() => growthQuery.refetch()} />
          ) : !growthData.some((g) => g.acumulado > 0) ? (
            <EmptyChart message="Ainda não há histórico suficiente." />
          ) : (
            <>
            {/* Altura em classe (e não no prop `height` do Recharts) para o
                gráfico acompanhar o mesmo degrau do resto do painel. */}
            <div className="w-full h-[188px] 2xl:h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={growthData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <defs>
                  <linearGradient id="clientesGrowthFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={PRIMARY_HEX} stopOpacity={0.4} />
                    <stop offset="100%" stopColor={PRIMARY_HEX} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip content={<GrowthTooltip />} cursor={{ stroke: "hsl(var(--border))" }} />
                {/* Num card que monta com largura 0 a animação não completa e a área some. */}
                <Area
                  type="monotone"
                  dataKey="acumulado"
                  stroke={PRIMARY_HEX}
                  strokeWidth={2}
                  fill="url(#clientesGrowthFill)"
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
            </div>
            {/* As abas Gênero e Idade já explicam por que contam MENOS que o
                card ao lado. Esta conta MAIS, e ficava sem legenda nenhuma. */}
            <p className="pt-1 text-[11px] leading-snug text-muted-foreground">
              Toda a base do recorte, mês a mês — o período da barra não entra aqui, senão a
              curva histórica desabaria. Os outros filtros valem.
            </p>
            </>
          ))}

        {tab === "gender" &&
          (demografiaQuery.isLoading ? (
            <LoadingChart />
          ) : demografiaQuery.isError ? (
            <ErrorChart onRetry={() => demografiaQuery.refetch()} />
          ) : genderTotal === 0 ? (
            <EmptyChart message="Seus pedidos ainda não trazem essa informação." />
          ) : (
            <div className="flex flex-col items-center gap-3">
              <div className="relative w-[200px] h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={genderData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={92}
                      paddingAngle={3}
                      dataKey="value"
                      startAngle={90}
                      endAngle={450}
                      isAnimationActive={false}
                    >
                      {genderData.map((g) => (
                        <Cell key={g.name} fill={g.color} stroke="hsl(var(--card))" strokeWidth={3} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                {/* O centro NÃO repete "clientes": a aba conta só quem tem
                    gênero cadastrado, então o número fica ABAIXO do card
                    "Total de Clientes" ao lado mesmo com o recorte igual.
                    Dois totais diferentes com o mesmo rótulo, lado a lado,
                    leem como erro do sistema. */}
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none px-6 text-center">
                  <span className="text-2xl font-bold text-foreground tabular-nums">
                    {nf(genderTotal)}
                  </span>
                  <span className="text-[10px] leading-tight text-muted-foreground">
                    com gênero<br />cadastrado
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap justify-center gap-x-5 gap-y-2">
                {genderData.map((g) => (
                  <div key={g.name} className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: g.color }} />
                    <span className="text-xs font-medium text-foreground">{g.name}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {nf(g.value)} · {((g.value / genderTotal) * 100).toFixed(0)}%
                    </span>
                  </div>
                ))}
              </div>

              <p className="text-[11px] text-muted-foreground text-center leading-snug">
                Só quem tem gênero cadastrado — o resto da base não some, apenas não entra nesta
                conta.
              </p>
            </div>
          ))}

        {tab === "age" &&
          (demografiaQuery.isLoading ? (
            <LoadingChart />
          ) : demografiaQuery.isError ? (
            <ErrorChart onRetry={() => demografiaQuery.refetch()} />
          ) : ageTotal === 0 ? (
            <EmptyChart message="Seus pedidos ainda não trazem essa informação." />
          ) : (
            <div className="space-y-2.5">
              {ageData.map((a) => {
                // Faixa etária é exclusiva: aqui a soma FECHA 100% e o % é honesto.
                const pct = ageTotal > 0 ? (a.count / ageTotal) * 100 : 0;
                return (
                  <BarRow
                    key={a.range}
                    label={a.label}
                    meta={`${nf(a.count)} · ${pct.toFixed(0)}%`}
                    fill={pct}
                    color={a.color}
                  />
                );
              })}
              <p className="pt-1 text-[11px] text-muted-foreground leading-snug">
                Só quem tem idade ou data de nascimento cadastrada.
              </p>
            </div>
          ))}

        {rfvMeta &&
          (rfvQuery.isLoading ? (
            <LoadingChart />
          ) : rfvQuery.isError ? (
            <ErrorChart onRetry={() => rfvQuery.refetch()} />
          ) : rfvQuery.data && !rfvQuery.data.availability?.ready ? (
            <EmptyChart
              message={
                rfvQuery.data.availability?.reason === "historico_curto"
                  ? "Histórico ainda curto para classificar a base."
                  : "Poucos clientes recorrentes para classificar a base."
              }
            />
          ) : rfvTotal === 0 ? (
            <EmptyChart message="Sem clientes classificados ainda." />
          ) : (
            <div className="space-y-2.5">
              {rfvData.map((b, i) => (
                <BarRow
                  key={b.label}
                  label={b.label}
                  meta={`${nf(b.clientes)} · ${rfvTotal > 0 ? ((b.clientes / rfvTotal) * 100).toFixed(0) : 0}%`}
                  fill={rfvMax > 0 ? (b.clientes / rfvMax) * 100 : 0}
                  color={AGE_RAMP[i] ?? AGE_RAMP[AGE_RAMP.length - 1]}
                />
              ))}
              <p className="pt-1 text-[11px] text-muted-foreground leading-snug">
                {nf(rfvTotal)} clientes da base inteira — este recorte não segue os filtros
                nem o período da tela. {rfvMeta.hint}
              </p>
            </div>
          ))}
      </div>
    </>
  );

  if (mobile) {
    const atalho = (I: LucideIcon) => (
      <Bolinha neutra>
        <I className="h-5 w-5" strokeWidth={2} />
      </Bolinha>
    );
    // <span> e não <Skeleton>: o valor da Linha mora dentro de um <p>.
    const valorCarregando = <span className="inline-block h-4 w-10 animate-pulse rounded-md bg-muted align-middle" />;
    const verLista = (n: number) =>
      kpisError || n <= 0 ? undefined : <span className="text-[12px] font-semibold text-primary">Ver lista</span>;

    return (
      <div className="flex flex-col gap-7">
        {/* O número da tela e os dois valores médios. */}
        <div className="flex flex-col gap-5">
          <section>
            <p className="text-sm font-medium text-muted-foreground">Clientes · {rotuloPeriodo}</p>
            {kpisLoading ? (
              <Skeleton className="mt-2 h-10 w-36" />
            ) : (
              <p className="mt-1 text-[38px] font-semibold leading-tight tracking-tight tabular-nums text-foreground">
                {valor(nf(k.total_clients))}
              </p>
            )}
            <p className="mt-1 text-[13px] text-muted-foreground">{dica(totalClientsHint ?? "com pedido no período")}</p>
          </section>

          <div className="grid grid-cols-2 gap-2">
            {kpisLoading ? (
              <>
                <Skeleton className="h-[104px] rounded-2xl" />
                <Skeleton className="h-[104px] rounded-2xl" />
              </>
            ) : (
              <>
                <Bloco tamanho={tamanhoComum(valor(formatCurrency(k.avg_ticket)), valor(formatCurrency(k.avg_ltv)))} icone={DollarSign} rotulo="Ticket médio" valor={valor(formatCurrency(k.avg_ticket))} apoio="por pedido" />
                <Bloco tamanho={tamanhoComum(valor(formatCurrency(k.avg_ticket)), valor(formatCurrency(k.avg_ltv)))} icone={TrendingUp} rotulo="LTV médio" valor={valor(formatCurrency(k.avg_ltv))} apoio="por cliente" />
              </>
            )}
          </div>
          {scopeNote && <p className="text-[12px] leading-snug text-muted-foreground">{scopeNote}</p>}
        </div>

        {/* As três listas que os cards abriam viram linhas: tocar abre a mesma folha. */}
        <Secao titulo="Para agir agora">
          <Linha
            onClick={onOpenOneTime}
            icone={atalho(ShoppingBag)}
            titulo="Compraram 1 vez"
            apoio="uma compra só em todo o histórico"
            valor={kpisLoading ? valorCarregando : valor(nf(k.one_time_clients))}
            rodape={verLista(k.one_time_clients)}
          />
          <Linha
            onClick={onOpenBirthday}
            icone={atalho(Cake)}
            titulo="Aniversariantes hoje"
            apoio="no recorte da tela"
            valor={kpisLoading ? valorCarregando : valor(nf(k.birthday_today))}
            rodape={verLista(k.birthday_today)}
          />
          <Linha
            onClick={onOpenActiveConv}
            icone={atalho(MessagesSquare)}
            titulo="Conversas ativas"
            apoio="janela de 24h para responder"
            valor={kpisLoading ? valorCarregando : valor(nf(k.active_conv))}
            rodape={verLista(k.active_conv)}
          />
        </Secao>

        <Secao titulo="Perfil da base" semLista>
          <div className="p-4">{corpoPainel}</div>
        </Secao>
      </div>
    );
  }

  return (
    // ATUALIZADO (11/08, a pedido): volta a `items-stretch`. Com `items-start` a
    // coluna de KPIs terminava acima do painel ao lado e sobrava uma faixa branca
    // desalinhada. Esticando, o `auto-rows-fr` do grid divide a altura entre as
    // duas fileiras — cada card fica com ~116px, logo acima do piso de 112px do
    // padrão, então alinha sem voltar a inchar como antes.
    // (comentário anterior) `items-start`: esticado, o painel de gráfico ditava
    // a altura da coluna de KPIs e cada card ganhava ~50px de vazio só para
    // acompanhar o vizinho. Agora cada coluna tem a altura do próprio conteúdo.
    <div className="grid grid-cols-1 xl:grid-cols-[3fr_2fr] gap-4 items-stretch">
      <div className="flex min-w-0 flex-col gap-3">
        <div className="grid flex-1 grid-cols-1 sm:grid-cols-3 sm:grid-rows-2 gap-4 auto-rows-fr">
          {kpiCards.map((c) => {
            const card = (
              <KpiPadrao
                titulo={c.titulo}
                valor={c.valor}
                apoio={c.apoio}
                tooltip={c.tooltip}
                icone={c.icone}
                loading={kpisLoading}
                className="h-full"
              />
            );
            // O clique fica num <button> POR FORA do card: o TooltipTrigger
            // asChild do KpiPadrao aceita um filho só, então o card em si não
            // pode virar trigger de tooltip e botão ao mesmo tempo.
            return c.onClick ? (
              <button
                key={c.titulo}
                type="button"
                onClick={c.onClick}
                className="w-full h-full text-left rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {card}
              </button>
            ) : (
              <div key={c.titulo} className="h-full">
                {card}
              </div>
            );
          })}
        </div>
        {scopeNote && (
          <p className="text-[11px] leading-snug text-muted-foreground">{scopeNote}</p>
        )}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.25, ease: [0.4, 0, 0.2, 1] }}
        className={cn(CARD, "p-4 2xl:p-5 flex flex-col h-full min-h-[248px] 2xl:min-h-[320px]")}
      >
        {corpoPainel}
      </motion.div>
    </div>
  );
}

export default ClientesInsightsV2;
