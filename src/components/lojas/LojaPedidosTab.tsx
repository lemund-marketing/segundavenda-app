import { useEffect, useMemo, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  DollarSign,
  Minus,
  Package,
  Repeat2,
  ShoppingCart,
  TrendingDown,
  TrendingUp,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useQueryClient } from "@tanstack/react-query";

import { ClientDetailSheet } from "@/components/crm/ClientDetailSheet";
import { OrderShipmentSheet } from "@/components/orders/OrderShipmentSheet";
import { OrdersTableV2, type OrderRow } from "@/components/pedidos/OrdersTableV2";
import { Skeleton } from "@/components/ui/skeleton";
import { useOrdersWithShipments } from "@/hooks/useOrderShipment";
import { useIsMobile } from "@/hooks/use-mobile";
import { Aviso, Bloco, Secao, Selo, pct1, textoPequeno } from "@/components/mobile/blocos";
import { tamanhoComum } from "@/components/mobile/tamanhoDoValor";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/utils/formatters";
import { groupOrdersByWindow, type OrderGroup } from "@/utils/groupOrdersByWindow";
import { cn } from "@/lib/utils";

import {
  ErrorBlock,
  INK_BG,
  INK_TEXT,
  type LojaRange,
  useLojaInk,
} from "./lojaDetailShared";
import {
  LOJA_ORDERS_PAGE_SIZE,
  useLojaHasStatusUpdates,
  useLojaOrders,
  useLojaPedidosHoje,
  useLojaSparkline,
  useLojaTopProducts,
  type LojaMetricsRow,
} from "./lojaDetailQueries";

/* ------------------------------------------------------------------ constantes */

// Painel é `2xl` (28px) — mesmo valor que o `Card` do shadcn já aplica e o mesmo
// que o Segundo Pedido usa, porque as duas bases têm a escala idêntica.
const CARD = "rounded-2xl bg-card shadow-sm";

const DAY_MS = 86_400_000;

/**
 * Quantos produtos a RPC devolve vs. quantos o gráfico desenha.
 *
 * `get_marketplace_top_products` recorta com `order by rec desc` (RECEITA) antes
 * de aplicar o `_limit`, e o teto dela é 200. Baixar tudo e cortar aqui é o que
 * faz o modo "Pedidos" mostrar o top-8 por QUANTIDADE de verdade.
 */
const PRODUTOS_FETCH_LIMIT = 200;
const PRODUTOS_VISIVEIS = 8;

const nf = (n: number) => n.toLocaleString("pt-BR");

/* ------------------------------------------------------------- comparativos */

/** null = sem base de comparação. Evita o "+100%" mentiroso quando o anterior é zero. */
function pctChange(cur: number, prev: number): number | null {
  if (!prev) return null;
  return ((cur - prev) / prev) * 100;
}

function fmtPct(v: number) {
  const abs = Math.abs(v).toFixed(1).replace(/\.0$/, "");
  return `${v > 0 ? "+" : v < 0 ? "−" : ""}${abs}%`;
}

function DeltaHint({
  cur,
  prev,
  label = "vs período anterior",
  suppressed,
}: {
  cur: number;
  prev: number;
  label?: string;
  /** "Todo período" não tem anterior: a RPC devolve zero e o zero viraria "Novo". */
  suppressed?: boolean;
}) {
  if (suppressed) return <span className="text-muted-foreground">no período</span>;

  const pct = pctChange(cur, prev);

  if (pct === null) {
    if (cur > 0) {
      return (
        <span className="font-medium text-emerald-600 dark:text-emerald-400">Novo {label}</span>
      );
    }
    return <span className="text-muted-foreground">—</span>;
  }

  const Icon: LucideIcon = pct > 0 ? TrendingUp : pct < 0 ? TrendingDown : Minus;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 font-medium",
        pct > 0
          ? "text-emerald-600 dark:text-emerald-400"
          : pct < 0
            ? "text-rose-600 dark:text-rose-400"
            : "text-muted-foreground",
      )}
    >
      <Icon className="w-3 h-3 shrink-0" />
      {fmtPct(pct)}
      <span className="font-normal text-muted-foreground">{label}</span>
    </span>
  );
}

/* ------------------------------------------------------------------ KPI card */

function Kpi({
  label,
  value,
  hint,
  icon: Icon,
  tone,
  delay,
  loading,
}: {
  label: string;
  value: string;
  hint: ReactNode;
  icon: LucideIcon;
  tone: string;
  delay: number;
  loading: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay, ease: [0.4, 0, 0.2, 1] }}
      className={cn(CARD, "p-4 2xl:p-5 h-full min-h-[112px] 2xl:min-h-[136px] min-w-0 flex flex-col justify-between gap-2 2xl:gap-3 transition-shadow hover:shadow-hover")}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-[13px] font-medium leading-tight text-muted-foreground">{label}</p>
        <div className={cn("w-8 h-8 2xl:w-10 2xl:h-10 rounded-md flex items-center justify-center shrink-0", tone)}>
          <Icon className="w-4 h-4 2xl:w-5 2xl:h-5" strokeWidth={2} />
        </div>
      </div>

      <div className="min-w-0">
        {loading ? (
          <Skeleton className="h-[22px] 2xl:h-[26px] w-24" />
        ) : (
          <p
            title={value}
            className="truncate text-[22px] 2xl:text-[26px] font-bold leading-none tracking-tight text-foreground font-tabular"
          >
            {value}
          </p>
        )}
        {/* `min-h` + skeleton no HINT também, como o KpiCard da /pedidos: sem
            isso "Segunda Venda" imprimia "0% dos pedidos da loja" como se fosse
            número final enquanto a RPC estava em voo, e a linha (de "—" para
            "↗ +12,3% vs período anterior") mudava de altura ao carregar. */}
        <div className="mt-2 flex min-h-[16px] items-center gap-1 text-xs text-muted-foreground">
          {loading ? <Skeleton className="h-3 w-32" /> : hint}
        </div>
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ tooltips */

function DiaTooltip({
  active,
  payload,
  modo,
}: {
  active?: boolean;
  payload?: any[];
  modo: "pedidos" | "receita";
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload as { label: string; pedidos: number; receita: number };
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2 shadow-lg">
      <p className="text-xs font-semibold text-foreground">{p.label}</p>
      <p className="text-xs tabular-nums text-muted-foreground">
        {modo === "receita"
          ? formatCurrency(p.receita)
          : `${nf(p.pedidos)} pedido${p.pedidos === 1 ? "" : "s"}`}
      </p>
    </div>
  );
}

/* ---------------------------------------------------------------- pill tabs */

function Pill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        // px-2.5/12px, a mesma dieta do PedidosChartCard: na coluna estreita
        // (2/5) as 4 pílulas em 13px empurravam o par Pedidos/Receita para uma
        // segunda linha.
        "px-2.5 py-1.5 rounded-full text-[12px] font-semibold whitespace-nowrap transition-colors",
        active
          ? "bg-foreground text-background"
          : "bg-muted text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

/* -------------------------------------------------------------- componente */

interface Props {
  sellerId: string | undefined;
  marketplace: string;
  range: LojaRange;
  /** Linha de métricas que a página-mãe já baixou — a aba não refaz a agregação. */
  row: LojaMetricsRow | null;
  loading: boolean;
  active: boolean;
  /** Loja em foco (orders.store_id) — filtra a lista e o "hoje"; os gráficos
   *  seguem sendo do marketplace inteiro e a tela avisa isso. */
  storeId?: string | null;
  storeName?: string | null;
}

export function LojaPedidosTab({ sellerId, marketplace, range, row, loading, active, storeId = null, storeName = null }: Props) {
  const [chartTab, setChartTab] = useState<"dia" | "produto">("dia");
  const [modo, setModo] = useState<"pedidos" | "receita">("pedidos");
  const [page, setPage] = useState(1);
  const [clientId, setClientId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sortField, setSortField] = useState("acquired_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [shipmentOrder, setShipmentOrder] = useState<{ id: string; external: string } | null>(null);

  const ink = useLojaInk(marketplace);
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();

  useEffect(() => {
    setPage(1);
  }, [sellerId, marketplace, range.start, range.end, sortField, sortDir, storeId]);

  /* ------------------------------------------------------------------ dados */

  // Mesmas chaves do resto da tela (`useLojaSparkline`/`useLojaTopProducts`), com
  // `_start` E `_end`: chave de tamanho diferente é entrada de cache diferente, e
  // omitir `_end` deixava o servidor recortar uma janela ligeiramente distinta.
  const sparkQ = useLojaSparkline(sellerId, marketplace, range.start, range.end, range.bucket, active, storeId);
  // 200 (o teto da RPC), não 8: `get_marketplace_top_products` corta com
  // `order by rec desc`, então pedir 8 já devolvia o top-8 POR RECEITA e o
  // reordenamento local só embaralhava esses 8 — no modo "Pedidos" o 3º e o 5º
  // produtos mais vendidos sumiam do "ranking por quantidade". Mesmo limite da
  // aba Produtos, o que ainda faz as duas dividirem a entrada de cache.
  const produtosQ = useLojaTopProducts(
    sellerId,
    marketplace,
    range.start,
    range.end,
    active,
    PRODUTOS_FETCH_LIMIT,
    storeId,
  );
  const hojeQ = useLojaPedidosHoje(sellerId, marketplace, active, storeId);
  const ordersQ = useLojaOrders(
    sellerId,
    marketplace,
    range.start,
    range.end,
    page,
    active,
    sortField,
    sortDir,
    storeId,
  );
  const statusQ = useLojaHasStatusUpdates(sellerId, marketplace, range.start, range.end, active);

  /* ------------------------------------------------------------- derivados */

  const pontos = sparkQ.data ?? [];

  const serie = useMemo(
    () =>
      pontos.map((p) => ({
        label:
          range.bucket === "month"
            ? format(parseISO(p.dia), "MMM/yy", { locale: ptBR })
            : format(parseISO(p.dia), "dd/MM", { locale: ptBR }),
        pedidos: p.pedidos,
        receita: p.receita,
      })),
    [pontos, range.bucket],
  );

  // Ordena TODAS as linhas pela métrica escolhida e só então corta o top-8: é a
  // ordem que decide quem aparece, não o recorte que o servidor já fez.
  const produtos = useMemo(() => {
    const valor = (r: { pedidos: number; receita: number }) =>
      modo === "receita" ? r.receita : r.pedidos;
    const top = [...(produtosQ.data ?? [])]
      .sort((a, b) => valor(b) - valor(a))
      .slice(0, PRODUTOS_VISIVEIS);
    const max = Math.max(1, ...top.map(valor));
    return top.map((r) => ({
      produto: r.produto,
      pedidos: r.pedidos,
      receita: r.receita,
      fill: (valor(r) / max) * 100,
    }));
  }, [produtosQ.data, modo]);

  /**
   * A RPC devolve no máximo 200 linhas, sempre as de maior receita. Só o modo
   * "Pedidos" sofre com isso (o top por receita é exato por construção), e só
   * quando a loja passa de 200 produtos distintos — nos sellers desta base o
   * teto fica em ~300, então o aviso é raro mas honesto.
   */
  const produtosTruncados = useMemo(() => {
    const rows = produtosQ.data ?? [];
    const total = rows.length > 0 ? rows[0].total_produtos || rows.length : 0;
    return total > rows.length ? total : 0;
  }, [produtosQ.data]);

  const totalOrders = row?.total_orders ?? 0;
  const totalRevenue = row?.total_revenue ?? 0;
  const prevOrders = row?.prev_orders ?? 0;
  const prevRevenue = row?.prev_revenue ?? 0;
  const ticket = totalOrders > 0 ? totalRevenue / totalOrders : 0;
  const prevTicket = prevOrders > 0 ? prevRevenue / prevOrders : 0;
  const segunda = row?.second_sale_orders ?? 0;
  const segundaPct = totalOrders > 0 ? (segunda / totalOrders) * 100 : 0;

  const diasJanela = useMemo(() => {
    const ms = new Date(range.end).getTime() - new Date(range.start).getTime();
    return Math.max(1, Math.round(ms / DAY_MS));
  }, [range.start, range.end]);

  /**
   * Denominador da média diária: os dias em que a loja REALMENTE pôde vender, não
   * o tamanho da janela. Em "Todo período" a janela tem ~9.700 dias contra 133 de
   * histórico, e 1.395/9.708 = 0,14 pedido/dia faria qualquer dia normal parecer
   * um recorde de +2.000%. A série já vem cortada no primeiro bucket com venda.
   */
  const diasBase = useMemo(() => {
    const primeiro = pontos[0]?.dia;
    if (!primeiro) return diasJanela;
    const dias = Math.round((Date.now() - parseISO(primeiro).getTime()) / DAY_MS) + 1;
    return Math.max(1, Math.min(diasJanela, dias));
  }, [pontos, diasJanela]);

  const mediaDiaria = totalOrders / diasBase;
  const hoje = hojeQ.data ?? 0;

  const total = ordersQ.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / LOJA_ORDERS_PAGE_SIZE));
  const inicio = total === 0 ? 0 : (page - 1) * LOJA_ORDERS_PAGE_SIZE + 1;
  const fim = Math.min(page * LOJA_ORDERS_PAGE_SIZE, total);

  /* --------------------------------------------------- lista (OrdersTableV2) */

  const pedidos = useMemo(() => ordersQ.data?.rows ?? [], [ordersQ.data]);

  // Mesmo agrupamento por janela de 3 min da lista principal (espelha
  // `count_deduplicated_orders` no banco). Só vale em ordem cronológica
  // decrescente: `groupOrdersByWindow` reordena por data e desfaria "maior
  // valor" / "cliente A–Z". O agrupamento acontece DENTRO da página carregada,
  // então uma compra na borda entre páginas pode aparecer partida.
  const orderGroups = useMemo<OrderGroup<OrderRow>[]>(() => {
    if (sortField !== "acquired_at" || sortDir !== "desc") {
      return pedidos.map((o) => ({
        id: o.id,
        orders: [o],
        count: 1,
        acquired_at: o.acquired_at,
        total_amount: Number(o.total_amount) || 0,
        primary: o,
      }));
    }
    return groupOrdersByWindow<OrderRow>(pedidos, 3);
  }, [pedidos, sortField, sortDir]);

  /** Quantos pedidos a página colapsou em grupos — 0 quando nada foi agrupado. */
  const groupedRows = pedidos.length - orderGroups.length;

  const visibleOrderIds = useMemo(() => pedidos.map((o) => o.id).filter(Boolean), [pedidos]);
  const { data: orderIdsWithShipment } = useOrdersWithShipments(visibleOrderIds);

  const toggleGroup = (id: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir(field === "full_name" ? "asc" : "desc");
    }
  };

  /**
   * Só MARCA o contato e abre a conversa: `wa.me` sem `?text=` não envia nada.
   * A lista vem do react-query (não há `setOrders` local como em /pedidos), então
   * a marca só reaparece depois de invalidar a chave.
   */
  const handleWhatsApp = async (order: OrderRow) => {
    const { error } = await supabase
      .from("orders")
      .update({ whatsapp_contacted_at: new Date().toISOString() })
      .eq("id", order.id);
    if (error) {
      console.error("Não foi possível marcar o contato de WhatsApp:", error);
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["loja-orders"] });
    if (order.clients?.whatsapp) {
      window.open(`https://wa.me/${order.clients.whatsapp.replace(/\D/g, "")}`, "_blank");
    }
  };

  const handleEmail = (order: OrderRow) => {
    if (order.clients?.email) window.open(`mailto:${order.clients.email}`, "_blank");
  };

  // Sem base anterior o comparativo é inventado — a grade de /lojas suprime no
  // mesmo preset, e as duas telas não podem se contradizer.
  const semComparativo = !range.comparable;

  /* -------------------------------------------------------------- render */

  // As duas gavetas valem para os dois desenhos.
  const folhas = (
    <>
      {/* `open` num estado PRÓPRIO, e não derivado de `clientId`: zerar o id no
          `onOpenChange` desmontava a ficha no mesmo commit em que ela fechava e
          o Radix nunca rodava a animação de saída. Mesmo par da aba Clientes. */}
      {clientId && sellerId && (
        <ClientDetailSheet
          clientId={clientId}
          sellerId={sellerId}
          open={sheetOpen}
          onOpenChange={setSheetOpen}
        />
      )}

      <OrderShipmentSheet
        orderId={shipmentOrder?.id ?? null}
        externalOrderId={shipmentOrder?.external ?? null}
        open={!!shipmentOrder}
        onOpenChange={(o) => {
          if (!o) setShipmentOrder(null);
        }}
      />
    </>
  );

  const lista = (
    <OrdersTableV2
      groups={orderGroups}
      loading={ordersQ.isLoading}
      hasStatusUpdates={statusQ.data ?? false}
      expandedGroups={expandedGroups}
      onToggleGroup={toggleGroup}
      sortField={sortField}
      sortDir={sortDir}
      onSort={handleSort}
      onViewClient={(id) => {
        setClientId(id);
        setSheetOpen(true);
      }}
      onWhatsApp={handleWhatsApp}
      onEmail={handleEmail}
      onShipment={(o) => setShipmentOrder({ id: o.id, external: o.external_order_id })}
      orderIdsWithShipment={orderIdsWithShipment}
      /* Aqui a query tem `.eq("marketplace", slug)`: TODAS as linhas são
         da mesma loja por construção. O badge repetido a cada linha só
         consome os 150px que Cliente e Produto usam melhor — a
         identidade da loja já está no cabeçalho, na URL e na cor do
         gráfico logo acima. */
      hideStoreColumn
    />
  );

  /*
   * Celular (23/10/2026), no desenho da aba Pedidos do app: os pedidos grandes
   * com a variação, receita, ticket, hoje e novos em blocos, a Segunda Venda
   * numa faixa com a barra da fatia, o gráfico num cartão com as pílulas e a
   * lista em cartões de pedido.
   */
  if (isMobile) {
    const novos = row?.new_clients ?? 0;
    const tamanhoLinha1 = tamanhoComum(formatCurrency(totalRevenue), formatCurrency(ticket));
    const tamanhoLinha2 = tamanhoComum(hojeQ.isError ? "—" : nf(hoje), nf(novos));
    const selo = (atual: number, anterior: number, base: string) =>
      semComparativo ? undefined : <Selo atual={atual} anterior={anterior} base={base} />;
    const pilula = (ativa: boolean, onClick: () => void, texto: string) => (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={ativa}
        className={cn(
          "shrink-0 rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors",
          ativa ? "bg-primary/10 text-primary" : "bg-muted/70 text-muted-foreground",
        )}
      >
        {texto}
      </button>
    );

    return (
      <div className="flex flex-col gap-7" style={ink.vars}>
        <div className="flex flex-col gap-5">
          <section>
            <p className="text-sm font-medium text-muted-foreground">Pedidos · {range.rotulo}</p>
            {loading ? (
              <Skeleton className="mt-2 h-10 w-32" />
            ) : (
              <p className="mt-1 text-[38px] font-semibold leading-tight tracking-tight tabular-nums text-foreground">
                {nf(totalOrders)}
              </p>
            )}
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
              {loading ? (
                <Skeleton className="h-5 w-44" />
              ) : semComparativo ? (
                <span className="text-sm text-muted-foreground">desde o primeiro pedido</span>
              ) : prevOrders > 0 ? (
                <>
                  <span
                    className={cn(
                      "text-[15px] font-semibold tabular-nums",
                      totalOrders >= prevOrders
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-rose-600 dark:text-rose-400",
                    )}
                  >
                    {totalOrders >= prevOrders ? "+" : "−"}
                    {nf(Math.abs(totalOrders - prevOrders))}
                  </span>
                  <Selo atual={totalOrders} anterior={prevOrders} base={nf(prevOrders)} />
                  <span className="text-[13px] text-muted-foreground">vs. {range.label} antes</span>
                </>
              ) : (
                <span className="text-sm text-muted-foreground">Sem base no período anterior</span>
              )}
            </div>
          </section>

          <div className="grid grid-cols-2 gap-2">
            {loading ? (
              [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[118px] rounded-3xl" />)
            ) : (
              <>
                <Bloco
                  tamanho={tamanhoLinha1}
                  icone={DollarSign}
                  rotulo="Receita"
                  valor={formatCurrency(totalRevenue)}
                  selo={selo(totalRevenue, prevRevenue, formatCurrency(prevRevenue))}
                />
                <Bloco
                  tamanho={tamanhoLinha1}
                  icone={TrendingUp}
                  rotulo="Ticket médio"
                  valor={formatCurrency(ticket)}
                  selo={selo(ticket, prevTicket, formatCurrency(prevTicket))}
                />
                <Bloco
                  tamanho={tamanhoLinha2}
                  icone={CalendarDays}
                  rotulo="Pedidos hoje"
                  valor={hojeQ.isError ? "—" : hojeQ.isLoading ? "…" : nf(hoje)}
                  selo={
                    !hojeQ.isError && !hojeQ.isLoading && mediaDiaria > 0 ? (
                      <Selo atual={hoje} anterior={mediaDiaria} />
                    ) : undefined
                  }
                  apoio={
                    hojeQ.isError
                      ? "não foi possível carregar"
                      : mediaDiaria > 0
                        ? "vs. média diária"
                        : "sem média do período"
                  }
                />
                <Bloco
                  tamanho={tamanhoLinha2}
                  icone={UserPlus}
                  rotulo="Clientes novos"
                  valor={nf(novos)}
                  selo={selo(novos, row?.prev_new_clients ?? 0, nf(row?.prev_new_clients ?? 0))}
                />
              </>
            )}
          </div>

          {!loading && (
            <div className="flex items-center gap-3 rounded-2xl border border-border/60 bg-card p-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Repeat2 className="h-5 w-5" strokeWidth={2} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[12px] font-medium text-muted-foreground">Segunda Venda</p>
                <div className="mt-1 flex items-center gap-3">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                    <span
                      className="block h-full rounded-full bg-primary"
                      style={{ width: `${Math.min(100, segundaPct)}%` }}
                    />
                  </div>
                  <p className="shrink-0 text-[17px] font-bold tabular-nums text-foreground">{nf(segunda)}</p>
                </div>
                <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
                  {pct1(segundaPct)}% dos pedidos da loja
                </p>
              </div>
            </div>
          )}
        </div>

        <Secao titulo="Vendas no período" semLista>
          <div className="p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex gap-1.5">
                {pilula(chartTab === "dia", () => setChartTab("dia"), range.bucket === "month" ? "Por mês" : "Por dia")}
                {pilula(chartTab === "produto", () => setChartTab("produto"), "Por produto")}
              </div>
              <div className="flex gap-1.5">
                {pilula(modo === "pedidos", () => setModo("pedidos"), "Pedidos")}
                {pilula(modo === "receita", () => setModo("receita"), "Receita")}
              </div>
            </div>

            {chartTab === "dia" &&
              (sparkQ.isError ? (
                <Aviso
                  tom="vermelho"
                  titulo="Não foi possível carregar a série de vendas"
                  acao={{ rotulo: "Tentar de novo", onClick: () => sparkQ.refetch() }}
                />
              ) : sparkQ.isLoading ? (
                <Skeleton className="h-[200px] w-full rounded-xl" />
              ) : serie.length === 0 ? (
                <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
                  Sem pedidos nesta loja no período.
                </div>
              ) : (
                <div className={INK_TEXT}>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={serie} margin={{ top: 8, right: 4, left: -18, bottom: 0 }}>
                      <defs>
                        <linearGradient id={`loja-dia-m-${marketplace}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="currentColor" stopOpacity={0.95} />
                          <stop offset="100%" stopColor="currentColor" stopOpacity={0.5} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                      <XAxis
                        dataKey="label"
                        stroke="hsl(var(--border))"
                        tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                        tickLine={false}
                        interval="preserveStartEnd"
                        minTickGap={16}
                      />
                      <YAxis
                        stroke="hsl(var(--border))"
                        tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                        tickLine={false}
                        axisLine={false}
                        width={44}
                        tickFormatter={(v: number) =>
                          modo === "receita" ? (v >= 1000 ? `${Math.round(v / 1000)}k` : String(Math.round(v))) : nf(v)
                        }
                      />
                      <Tooltip cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }} content={<DiaTooltip modo={modo} />} />
                      <Bar
                        dataKey={modo}
                        fill={`url(#loja-dia-m-${marketplace})`}
                        radius={[4, 4, 0, 0]}
                        maxBarSize={14}
                        isAnimationActive={false}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ))}

            {chartTab === "produto" &&
              (produtosQ.isError ? (
                <Aviso
                  tom="vermelho"
                  titulo="Não foi possível carregar os produtos"
                  acao={{ rotulo: "Tentar de novo", onClick: () => produtosQ.refetch() }}
                />
              ) : produtosQ.isLoading ? (
                <div className="space-y-3">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <div key={i} className="space-y-2">
                      <Skeleton className="h-3 w-1/2" />
                      <Skeleton className="h-1.5 w-full" />
                    </div>
                  ))}
                </div>
              ) : produtos.length === 0 ? (
                <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
                  Sem produtos nesta loja no período.
                </div>
              ) : (
                <div className="space-y-3">
                  {modo === "pedidos" && produtosTruncados > 0 && (
                    <p className="text-[12px] leading-snug text-muted-foreground">
                      Ranking sobre os {nf(PRODUTOS_FETCH_LIMIT)} produtos de maior receita — a loja tem{" "}
                      {nf(produtosTruncados)}.
                    </p>
                  )}
                  {produtos.map((p) => (
                    <div key={p.produto} className="min-w-0">
                      <div className="mb-1 flex items-baseline justify-between gap-2">
                        <span className="truncate text-[14px] font-medium text-foreground">{p.produto}</span>
                        <span className="shrink-0 text-[13px] tabular-nums text-muted-foreground">
                          {modo === "receita" ? formatCurrency(p.receita) : `${nf(p.pedidos)} ped.`}
                        </span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div className={cn("h-full rounded-full", INK_BG)} style={{ width: `${Math.max(p.fill, 2)}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              ))}
          </div>
        </Secao>

        <Secao
          titulo={storeId && storeName ? `Pedidos — ${storeName}` : "Pedidos da loja"}
          direita={textoPequeno(ordersQ.isLoading || ordersQ.isError ? "—" : `${nf(total)} no período`)}
          semLista
        >
          {ordersQ.isError ? (
            <div className="p-4">
              <Aviso
                tom="vermelho"
                titulo="Não foi possível carregar os pedidos desta loja"
                acao={{ rotulo: "Tentar de novo", onClick: () => ordersQ.refetch() }}
              />
            </div>
          ) : !ordersQ.isLoading && total === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
              <Package className="h-8 w-8 text-muted-foreground/40" />
              <p className="text-[15px] font-medium text-foreground">Nenhum pedido nesta loja no período</p>
              <p className="text-[13px] leading-relaxed text-muted-foreground">
                Amplie o período no topo — a loja pode ter vendido antes desta janela.
              </p>
            </div>
          ) : (
            <>
              <div className={cn(ordersQ.isFetching && !ordersQ.isLoading && "opacity-60 transition-opacity")}>
                {lista}
              </div>
              {total > 0 && (
                <div className="flex items-center justify-between gap-3 border-t border-border/60 px-4 py-3">
                  <span className="text-[12px] tabular-nums text-muted-foreground">
                    {inicio}–{fim} de {nf(total)}
                    {groupedRows > 0 && <> · compras agrupadas</>}
                  </span>
                  {totalPages > 1 && (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={page === 1 || ordersQ.isFetching}
                        aria-label="Página anterior"
                        className="flex h-9 w-9 items-center justify-center rounded-full border border-border/60 bg-card text-muted-foreground active:bg-muted disabled:opacity-40"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </button>
                      <span className="px-1 text-[12px] tabular-nums text-muted-foreground">
                        {page}/{totalPages}
                      </span>
                      <button
                        type="button"
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                        disabled={page >= totalPages || ordersQ.isFetching}
                        aria-label="Próxima página"
                        className="flex h-9 w-9 items-center justify-center rounded-full border border-border/60 bg-card text-muted-foreground active:bg-muted disabled:opacity-40"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </Secao>

        {folhas}
      </div>
    );
  }

  return (
    <div className="space-y-4" style={ink.vars}>
      {/*
        Mesmo arranjo do topo de /pedidos: 6 KPIs em duas linhas de 3 à esquerda
        e o card de gráfico ocupando a altura das duas linhas à direita.
        `items-stretch` aqui, `h-full` na grade dos KPIs e `h-full flex flex-col`
        no card são as três peças que fazem o gráfico ACOMPANHAR a altura em vez
        de flutuar no topo — sozinho, o `items-stretch` estica só o wrapper.

        A /pedidos só faz o lado a lado a partir de `2xl`, e `2xl` aqui é 1536px
        (o `screens: { '2xl': '1400px' }` do tailwind.config vale só para a
        classe `.container`, não para a variante). Num MacBook Pro 14" (1512px)
        ou num laptop de 1440p isso deixava o gráfico EMBAIXO dos KPIs — que é
        exatamente a queixa que este arranjo veio resolver.

        A saída é descer para `xl` (1280px). As TRÊS colunas de KPI também
        descem para `xl`: em 2xl os 6 cards viravam 2 fileiras no monitor grande
        e 3 fileiras no notebook — mais altura justamente onde há menos. Nos
        ~644px da coluna esquerda cada card fica com ~204px e, com o `p-4` do
        padrão, sobram ~172px de conteúdo: "R$ 1.243.869,95" em 22px pede ~171px
        e cabe; se não coubesse, o `truncate` + `title` corta com reticências em
        vez de vazar (o NBSP do Intl torna a string inquebrável). O cabeçalho
        deste gráfico tem 4 pílulas de 12px e cabe nos ~380px da coluna direita
        — a /pedidos, com 4 abas + o par Pedidos/Receita, não caberia.
      */}
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-4 items-stretch">
        {/* ---------------------------------------------------------- KPIs */}
        <div className="xl:col-span-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 h-full">
            <Kpi
              label="Total de Pedidos"
              value={nf(totalOrders)}
              icon={ShoppingCart}
              tone="bg-blue-500/10 text-blue-600 dark:bg-blue-400/15 dark:text-blue-300"
              delay={0}
              loading={loading}
              hint={<DeltaHint cur={totalOrders} prev={prevOrders} suppressed={semComparativo} />}
            />
            <Kpi
              label="Receita"
              value={formatCurrency(totalRevenue)}
              icon={DollarSign}
              tone="bg-emerald-500/10 text-emerald-600 dark:bg-emerald-400/15 dark:text-emerald-300"
              delay={0.05}
              loading={loading}
              hint={<DeltaHint cur={totalRevenue} prev={prevRevenue} suppressed={semComparativo} />}
            />
            <Kpi
              label="Ticket Médio"
              value={formatCurrency(ticket)}
              icon={TrendingUp}
              tone="bg-violet-500/10 text-violet-600 dark:bg-violet-400/15 dark:text-violet-300"
              delay={0.1}
              loading={loading}
              hint={<DeltaHint cur={ticket} prev={prevTicket} suppressed={semComparativo} />}
            />
            <Kpi
              label="Pedidos Hoje"
              value={hojeQ.isError ? "—" : nf(hoje)}
              icon={CalendarDays}
              tone="bg-amber-500/10 text-amber-600 dark:bg-amber-400/15 dark:text-amber-300"
              delay={0.15}
              loading={hojeQ.isLoading}
              hint={
                hojeQ.isError ? (
                  <span className="text-muted-foreground">não foi possível carregar</span>
                ) : mediaDiaria > 0 ? (
                  <DeltaHint cur={hoje} prev={mediaDiaria} label="vs média diária" />
                ) : (
                  <span className="text-muted-foreground">sem base de comparação</span>
                )
              }
            />
            <Kpi
              label="Clientes Novos"
              value={nf(row?.new_clients ?? 0)}
              icon={UserPlus}
              tone="bg-primary/10 text-primary"
              delay={0.2}
              loading={loading}
              hint={
                <DeltaHint
                  cur={row?.new_clients ?? 0}
                  prev={row?.prev_new_clients ?? 0}
                  suppressed={semComparativo}
                />
              }
            />
            <Kpi
              label="Segunda Venda"
              value={nf(segunda)}
              icon={Repeat2}
              tone="bg-cyan-500/10 text-cyan-600 dark:bg-cyan-400/15 dark:text-cyan-300"
              delay={0.25}
              loading={loading}
              hint={<span>{segundaPct.toFixed(1).replace(/\.0$/, "")}% dos pedidos da loja</span>}
            />
          </div>
        </div>

        {/* ------------------------------------------------------- gráfico */}
        <div className="xl:col-span-2">
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.3, ease: [0.4, 0, 0.2, 1] }}
            className={cn(CARD, "p-4 2xl:p-5 h-full flex flex-col")}
          >
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-1 overflow-x-auto -mx-1 px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <Pill active={chartTab === "dia"} onClick={() => setChartTab("dia")}>
                  {range.bucket === "month" ? "Por Mês" : "Por Dia"}
                </Pill>
                <Pill active={chartTab === "produto"} onClick={() => setChartTab("produto")}>
                  Por Produto
                </Pill>
              </div>
              {/* `ml-auto` porque `justify-between` age POR LINHA: quando o par cai
                  para a segunda linha ele ficava colado à esquerda, sob as abas. */}
              <div className="flex items-center gap-1 ml-auto">
                <Pill active={modo === "pedidos"} onClick={() => setModo("pedidos")}>
                  Pedidos
                </Pill>
                <Pill active={modo === "receita"} onClick={() => setModo("receita")}>
                  Receita
                </Pill>
              </div>
            </div>

            {/* `flex-1 min-h-[260px]`: o corpo é quem estica para preencher a altura
                que a grade de KPIs impõe — sem ele o card fica com a altura do
                conteúdo e o `items-stretch` do avô não tem efeito visível. */}
            <div className="flex-1 min-h-[260px]">
            {chartTab === "dia" &&
              (sparkQ.isError ? (
                <ErrorBlock
                  title="Não foi possível carregar a série de vendas."
                  onRetry={() => sparkQ.refetch()}
                />
              ) : sparkQ.isLoading ? (
                <Skeleton className="h-[260px] w-full rounded-md" />
              ) : serie.length === 0 ? (
                <div className="flex h-[260px] items-center justify-center text-sm text-muted-foreground">
                  Sem pedidos nesta loja no período.
                </div>
              ) : (
                // `currentColor` no gradiente: a tinta da loja vem por CSS e troca
                // sozinha entre claro e escuro. Hex em JS não responde ao tema.
                <div className={INK_TEXT}>
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={serie} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                      <defs>
                        {/* id pelo slug da loja, não pelo índice: com a ordenação mudando,
                            o React reusa o DOM e os gradientes trocariam de card. */}
                        <linearGradient id={`loja-dia-${marketplace}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="currentColor" stopOpacity={0.95} />
                          <stop offset="100%" stopColor="currentColor" stopOpacity={0.5} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                      <XAxis
                        dataKey="label"
                        stroke="hsl(var(--border))"
                        tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                        tickLine={false}
                        interval="preserveStartEnd"
                        minTickGap={12}
                      />
                      <YAxis
                        stroke="hsl(var(--border))"
                        tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                        tickLine={false}
                        axisLine={false}
                        width={48}
                        tickFormatter={(v: number) =>
                          modo === "receita"
                            ? v >= 1000
                              ? `${Math.round(v / 1000)}k`
                              : String(Math.round(v))
                            : nf(v)
                        }
                      />
                      <Tooltip
                        cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }}
                        content={<DiaTooltip modo={modo} />}
                      />
                      {/* Sem isAnimationActive={false} o card monta com largura 0 e a
                          animação de entrada não completa: o gráfico fica vazio. */}
                      <Bar
                        dataKey={modo}
                        fill={`url(#loja-dia-${marketplace})`}
                        radius={[6, 6, 0, 0]}
                        maxBarSize={22}
                        isAnimationActive={false}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ))}

            {chartTab === "produto" &&
              (produtosQ.isError ? (
                <ErrorBlock
                  title="Não foi possível carregar os produtos."
                  onRetry={() => produtosQ.refetch()}
                />
              ) : produtosQ.isLoading ? (
                <div className="space-y-3">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <div key={i} className="space-y-2">
                      <Skeleton className="h-3 w-1/2" />
                      <Skeleton className="h-1.5 w-full" />
                    </div>
                  ))}
                </div>
              ) : produtos.length === 0 ? (
                <div className="flex h-[240px] items-center justify-center text-sm text-muted-foreground">
                  Sem produtos nesta loja no período.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {modo === "pedidos" && produtosTruncados > 0 && (
                    <p className="text-[10px] leading-snug text-muted-foreground">
                      Ranking sobre os {nf(PRODUTOS_FETCH_LIMIT)} produtos de maior receita — a loja
                      tem {nf(produtosTruncados)}.
                    </p>
                  )}
                  {produtos.map((p) => (
                    <div key={p.produto} className="min-w-0">
                      <div className="mb-1 flex items-baseline justify-between gap-2">
                        <span className="truncate text-[12px] font-semibold text-foreground" title={p.produto}>
                          {p.produto}
                        </span>
                        <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                          {modo === "receita" ? formatCurrency(p.receita) : `${nf(p.pedidos)} ped.`}
                        </span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className={cn("h-full rounded-full", INK_BG)}
                          style={{ width: `${Math.max(p.fill, 2)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </div>

      {/* ---------------------------------------------------------- tabela */}
      {/* Mesmo painel da lista de /pedidos, e não o `CARD` (2xl/28px) das outras
          abas: raio `lg` (20px), cabeçalho `px-6 py-5` em 18px bold e a
          `border-b` que separa o título do `<thead>`. É a mesma tabela das duas
          telas; ficar com moldura e cabeçalho diferentes era a queixa. */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.35, ease: [0.4, 0, 0.2, 1] }}
        className="overflow-hidden rounded-lg bg-card shadow-sm"
      >
        <div className="flex items-center justify-between gap-3 border-b border-border px-6 py-5">
          <h3 className="text-[18px] font-bold text-foreground">
            {storeId && storeName ? `Pedidos — ${storeName}` : "Pedidos da loja"}
          </h3>
          <span className="text-xs tabular-nums text-muted-foreground">
            {ordersQ.isLoading || ordersQ.isError ? "—" : `${nf(total)} no período`}
          </span>
        </div>

        {/* Erro ANTES do estado vazio: "amplie o período" numa falha de rede manda
            o usuário mexer numa janela que não tem nada a ver com o problema. */}
        {ordersQ.isError ? (
          <div className="px-6 py-5">
            <ErrorBlock
              title="Não foi possível carregar os pedidos desta loja."
              onRetry={() => ordersQ.refetch()}
            />
          </div>
        ) : !ordersQ.isLoading && total === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-md bg-muted">
              <Package className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-foreground">Nenhum pedido nesta loja no período.</p>
            <p className="max-w-[22rem] text-xs leading-relaxed text-muted-foreground">
              Amplie o período no topo da página — a loja pode ter vendido antes desta janela.
            </p>
          </div>
        ) : (
          <>
            {/* Dimming durante refetch: a OrdersTableV2 não tem estado
                intermediário próprio e a lista trocaria de conteúdo sem aviso. */}
            <div
              className={cn(
                ordersQ.isFetching && !ordersQ.isLoading && "opacity-60 transition-opacity",
              )}
            >
              {lista}
            </div>

            {total > 0 && (
              <div className="flex items-center justify-between gap-3 border-t border-border px-6 py-4">
                <span className="text-[11px] tabular-nums text-muted-foreground">
                  {inicio}–{fim} de {nf(total)}
                  {/* A tabela desenha GRUPOS (pedidos do mesmo cliente em 3 min),
                      então a contagem de linhas não bate com a de pedidos. Sem
                      esta nota, "1–50 de 300" acima de 40 linhas parece erro. */}
                  {groupedRows > 0 && (
                    <>
                      {" "}
                      em {orderGroups.length} linha{orderGroups.length === 1 ? "" : "s"} (compras
                      agrupadas)
                    </>
                  )}
                </span>
                {/* Só quando há para onde ir: com uma página só, o par de setas
                    nascia cinza e inerte em volta de um "1/1" — a /pedidos
                    mantém o "Mostrando X–Y de N" e esconde o paginador. */}
                {totalPages > 1 && (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1 || ordersQ.isFetching}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label="Página anterior"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </button>
                  <span className="px-1 text-[11px] tabular-nums text-muted-foreground">
                    {page}/{totalPages}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages || ordersQ.isFetching}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label="Próxima página"
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
                )}
              </div>
            )}
          </>
        )}
      </motion.div>

      {folhas}
    </div>
  );
}

export default LojaPedidosTab;
