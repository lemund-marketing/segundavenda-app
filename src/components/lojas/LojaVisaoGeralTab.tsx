import { useMemo, useState, type ReactNode } from "react";
import {
  Activity,
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  DollarSign,
  Repeat,
  ShoppingCart,
  TrendingDown,
  TrendingUp,
  Trophy,
  UserPlus,
  Users,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { KpiPadrao } from "@/components/kpi/KpiPadrao";
import { BrazilChoropleth } from "@/components/regioes/BrazilChoropleth";
import { ALTURA_MAPA, METRICAS, type Metrica } from "@/components/regioes/metricasMapa";
import { TopStates } from "@/components/dashboard/TopStates";
import { EmptyState as DashEmptyState, PanelCard } from "@/components/dashboard/shared";
import RecentOrders from "@/components/RecentOrders";
import { useRegioes } from "@/hooks/useRegioes";
import { Map as MapIcon, ShoppingCart as CartIcon, Users as UsersIcon, TrendingUp as TrendIcon } from "lucide-react";
// Peça compartilhada de esqueleto: retângulo na altura exata do gráfico.
import { SkeletonGrafico } from "@/components/skeletons/PageSkeletons";
import { formatCurrency } from "@/utils/formatters";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { ClientDetailSheet } from "@/components/crm/ClientDetailSheet";
import { PedidoCardMobile } from "@/components/pedidos/PedidoCardMobile";
import { localDoCliente, parseOrderDate } from "@/components/pedidos/orderRowShared";
import type { OrderRow } from "@/components/pedidos/OrdersTableV2";
import { RankingEstados } from "@/components/regioes/RankingEstados";
import { Skeleton } from "@/components/ui/skeleton";
import { useIsMobile } from "@/hooks/use-mobile";
import { supabase } from "@/integrations/supabase/client";
import { Bloco, Bolinha, Linha, Secao, Selo, ValorPartes, textoPequeno } from "@/components/mobile/blocos";
import { tamanhoComum } from "@/components/mobile/tamanhoDoValor";

import {
  DeltaPosicional,
  EmptyBlock,
  ErrorBlock,
  INK_TEXT,
  LojaKpi,
  LojaPanel,
  NAO_PLATAFORMA,
  ShareBar,
  type LojaRange,
  barCursor,
  chartTooltipProps,
  fmtAxisCurrency,
  fmtInt,
  fmtPct,
  pctChange,
  useLojaInk,
} from "./lojaDetailShared";
import {
  positionOf,
  type LojaMetricsRow,
  useLojaOrders,
} from "./lojaDetailQueries";

interface Props {
  sellerId: string | undefined;
  slug: string;
  label: string;
  range: LojaRange;
  rows: LojaMetricsRow[];
  row: LojaMetricsRow | null;
  loading: boolean;
  active: boolean;
  /** Loja em foco: os números do `row` já vêm restritos a ela; rank e
   *  comparativos entre marketplaces são escondidos (comparariam a loja com
   *  plataformas inteiras — mentira visual). */
  storeId?: string | null;
  storeName?: string | null;
  /** Celular: o "Ver tudo" das seções leva para a aba correspondente. */
  onIrParaAba?: (aba: "pedidos" | "regioes") => void;
  /** Celular: o que entra logo abaixo dos números (as lojas do marketplace). */
  meioMobile?: ReactNode;
}


export function LojaVisaoGeralTab({
  sellerId,
  slug,
  label,
  range,
  rows,
  row,
  loading,
  active,
  storeId = null,
  storeName = null,
  onIrParaAba,
  meioMobile,
}: Props) {
  const [weekdayMode, setWeekdayMode] = useState<"pedidos" | "receita">("pedidos");
  const ink = useLojaInk(slug);
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const [clienteAberto, setClienteAberto] = useState<string | null>(null);

  // ---- Seção "Dashboard da loja" (21/08): o layout do Dashboard, recortado
  // por este marketplace. Mapa/estados vêm da MESMA RPC do Dashboard, que
  // ganhou o filtro _marketplace. Com uma LOJA selecionada dentro do
  // marketplace o mapa some: a RPC filtra por marketplace, não por loja, e
  // mostrar um mapa que ignora o filtro ativo seria mentir o recorte.
  const [metricaMapa, setMetricaMapa] = useState<Metrica>("orders");
  const [ufSelecionada, setUfSelecionada] = useState<string | null>(null);
  const regioesLoja = useRegioes(
    sellerId && active && !storeId ? [sellerId] : [],
    useMemo(() => new Date(range.start), [range.start]),
    useMemo(() => new Date(range.end), [range.end]),
    slug,
  );
  const ultimosPedidos = useLojaOrders(
    sellerId, slug, range.start, range.end, 1, active, "acquired_at", "desc", storeId,
  );

  // "Todo período" ancora em 2000-01-01: a janela anterior da RPC cai em 1974 e
  // volta zerada. Sem isto os 6 cards anunciam "Novo vs anterior" em verde para
  // uma loja com anos de histórico — e a grade de /lojas, que suprime, discorda.
  const semComparativo = !range.comparable;

  // useLojaSparkline e useLojaWeekday saíram junto com os gráficos que
  // alimentavam (29/08). Deixá-los aqui seriam duas consultas por abertura de
  // aba cujo resultado ninguém lê.

  const m = useMemo(() => {
    const orders = row?.total_orders ?? 0;
    const prevOrders = row?.prev_orders ?? 0;
    const revenue = row?.total_revenue ?? 0;
    const prevRevenue = row?.prev_revenue ?? 0;
    const clients = row?.unique_clients ?? 0;
    const prevClients = row?.prev_unique_clients ?? 0;
    const repeat = row?.repeat_clients ?? 0;
    const prevRepeat = row?.prev_repeat_clients ?? 0;

    const plataformas = rows.filter((r) => !NAO_PLATAFORMA.has(r.marketplace));
    const outras = plataformas.filter((r) => r.marketplace !== slug);

    const outrasRevenue = outras.reduce((s, r) => s + r.total_revenue, 0);
    const outrasOrders = outras.reduce((s, r) => s + r.total_orders, 0);
    const outrasClients = outras.reduce((s, r) => s + r.unique_clients, 0);
    const outrasRepeat = outras.reduce((s, r) => s + r.repeat_clients, 0);

    // Share sobre TODAS as origens (inclusive other/retroativo) para a soma dos
    // cards de /lojas fechar 100%; o ranking é que exclui as não-plataformas.
    const totalRevenueSeller = rows.reduce((s, r) => s + r.total_revenue, 0);

    return {
      orders,
      prevOrders,
      revenue,
      prevRevenue,
      clients,
      prevClients,
      newClients: row?.new_clients ?? 0,
      prevNewClients: row?.prev_new_clients ?? 0,
      ticket: orders > 0 ? revenue / orders : 0,
      prevTicket: prevOrders > 0 ? prevRevenue / prevOrders : 0,
      recompra: clients > 0 ? (repeat / clients) * 100 : 0,
      prevRecompra: prevClients > 0 ? (prevRepeat / prevClients) * 100 : 0,
      ordersPerClient: clients > 0 ? orders / clients : 0,
      sharePct: totalRevenueSeller > 0 ? (revenue / totalRevenueSeller) * 100 : 0,
      outrasCount: outras.length,
      mediaOutrasRevenue: outras.length ? outrasRevenue / outras.length : 0,
      mediaOutrasTicket: outrasOrders > 0 ? outrasRevenue / outrasOrders : 0,
      mediaOutrasOrdersPerClient: outrasClients > 0 ? outrasOrders / outrasClients : 0,
      mediaOutrasRecompra: outrasClients > 0 ? (outrasRepeat / outrasClients) * 100 : 0,
      totalPlataformas: plataformas.length,
    };
  }, [row, rows, slug]);

  // Cada card ranqueia pela PRÓPRIA métrica: o original mostra "#1 de 6" no card
  // de Pedidos usando a posição em receita, o que discorda do número ao lado.
  const posOrders = positionOf(rows, slug, "total_orders");
  const posRevenue = positionOf(rows, slug, "total_revenue");
  const posClients = positionOf(rows, slug, "unique_clients");

  // Com uma LOJA em foco, ranking e "vs as outras" compararam a loja com
  // marketplaces inteiros — números certos, conclusão errada. Ficam mudos.
  const multiLoja = !storeId && m.totalPlataformas > 1 && !NAO_PLATAFORMA.has(slug);


  const compareRows = [
    {
      label: "Receita",
      mine: formatCurrency(m.revenue),
      theirs: formatCurrency(m.mediaOutrasRevenue),
      delta: pctChange(m.revenue, m.mediaOutrasRevenue),
      pp: false,
    },
    {
      label: "Ticket Médio",
      mine: formatCurrency(m.ticket),
      theirs: formatCurrency(m.mediaOutrasTicket),
      delta: pctChange(m.ticket, m.mediaOutrasTicket),
      pp: false,
    },
    {
      label: "Pedidos / Cliente",
      mine: m.ordersPerClient.toFixed(2),
      theirs: m.mediaOutrasOrdersPerClient.toFixed(2),
      delta: pctChange(m.ordersPerClient, m.mediaOutrasOrdersPerClient),
      pp: false,
    },
    {
      label: "Recompra",
      mine: `${m.recompra.toFixed(1)}%`,
      theirs: `${m.mediaOutrasRecompra.toFixed(1)}%`,
      delta: m.mediaOutrasRecompra > 0 || m.recompra > 0 ? m.recompra - m.mediaOutrasRecompra : null,
      pp: true,
    },
  ];

  /*
   * Celular (23/10/2026), no desenho do Dashboard do app: o faturamento grande
   * com a variação, os outros números em blocos, os estados que mais compram,
   * os últimos pedidos e a comparação com os outros marketplaces. O mapa mora
   * na aba Regiões (aqui seria a mesma consulta, desenhada duas vezes).
   */
  if (isMobile) {
    const estados = [...(regioesLoja.data ?? [])].sort((a, b) => b.orders - a.orders);
    const pedidosEstados = estados.reduce((s, r) => s + r.orders, 0);
    const ultimos = (ultimosPedidos.data?.rows ?? []).slice(0, 5);
    const faturamento = formatCurrency(m.revenue);
    const tamanhoLinha1 = tamanhoComum(fmtInt(m.orders), fmtInt(m.clients));
    const tamanhoLinha2 = tamanhoComum(formatCurrency(m.ticket), fmtInt(m.newClients));
    const selo = (atual: number, anterior: number, base: string) =>
      semComparativo ? undefined : <Selo atual={atual} anterior={anterior} base={base} />;
    const icones = { Receita: DollarSign, "Ticket Médio": TrendingUp, "Pedidos / Cliente": ShoppingCart, Recompra: Repeat } as const;

    // Abre a conversa primeiro (o navegador só libera a janela no toque) e só
    // marca o pedido como chamado quando o banco confirma a gravação.
    const chamarNoWhatsApp = (o: OrderRow) => {
      const fone = o.clients?.whatsapp?.replace(/\D/g, "");
      if (!fone) return;
      window.open(`https://wa.me/${fone}`, "_blank");
      supabase
        .from("orders")
        .update({ whatsapp_contacted_at: new Date().toISOString() })
        .eq("id", o.id)
        .select("id")
        .then(({ data, error }) => {
          if (error || !data?.length) {
            if (error) console.error("Não foi possível marcar o contato de WhatsApp:", error);
            return;
          }
          queryClient.invalidateQueries({ queryKey: ["loja-orders"] });
        });
    };

    return (
      <div className="flex flex-col gap-7">
        <div className="flex flex-col gap-5">
          <section>
            <p className="text-sm font-medium text-muted-foreground">Faturamento · {range.rotulo}</p>
            {loading ? (
              <Skeleton className="mt-2 h-10 w-52" />
            ) : (
              <p
                className={cn(
                  "mt-1 font-semibold leading-tight tracking-tight tabular-nums text-foreground",
                  faturamento.length > 15 ? "text-[30px]/tight" : "text-[38px]/tight",
                )}
              >
                <ValorPartes valor={faturamento} />
              </p>
            )}
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
              {loading ? (
                <Skeleton className="h-5 w-44" />
              ) : semComparativo ? (
                <span className="text-sm text-muted-foreground">desde o primeiro pedido</span>
              ) : m.prevRevenue > 0 ? (
                <>
                  <span
                    className={cn(
                      "text-[15px] font-semibold tabular-nums",
                      m.revenue >= m.prevRevenue
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-rose-600 dark:text-rose-400",
                    )}
                  >
                    {m.revenue >= m.prevRevenue ? "+" : "−"}
                    {formatCurrency(Math.abs(m.revenue - m.prevRevenue))}
                  </span>
                  <Selo atual={m.revenue} anterior={m.prevRevenue} base={formatCurrency(m.prevRevenue)} />
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
                  icone={ShoppingCart}
                  rotulo="Pedidos"
                  valor={fmtInt(m.orders)}
                  selo={selo(m.orders, m.prevOrders, fmtInt(m.prevOrders))}
                />
                <Bloco
                  tamanho={tamanhoLinha1}
                  icone={Users}
                  rotulo="Clientes"
                  valor={fmtInt(m.clients)}
                  selo={selo(m.clients, m.prevClients, fmtInt(m.prevClients))}
                />
                <Bloco
                  tamanho={tamanhoLinha2}
                  icone={TrendingUp}
                  rotulo="Ticket médio"
                  valor={formatCurrency(m.ticket)}
                  selo={selo(m.ticket, m.prevTicket, formatCurrency(m.prevTicket))}
                />
                <Bloco
                  tamanho={tamanhoLinha2}
                  icone={UserPlus}
                  rotulo="Clientes novos"
                  valor={fmtInt(m.newClients)}
                  selo={selo(m.newClients, m.prevNewClients, fmtInt(m.prevNewClients))}
                />
              </>
            )}
          </div>
        </div>

        {meioMobile}

        {/* Com uma loja em foco a consulta de regiões não recorta por loja: some. */}
        {!storeId &&
          (regioesLoja.isLoading ? (
            <Skeleton className="h-[260px] rounded-3xl" />
          ) : estados.length > 0 ? (
            <Secao
              titulo="Regiões"
              aoVerTudo={onIrParaAba ? () => onIrParaAba("regioes") : undefined}
              semLista
            >
              <RankingEstados estados={estados.slice(0, 5)} totalPedidos={pedidosEstados} />
            </Secao>
          ) : null)}

        {ultimos.length > 0 && (
          <Secao titulo="Últimos pedidos" aoVerTudo={onIrParaAba ? () => onIrParaAba("pedidos") : undefined}>
            {ultimos.map((o) => (
              <li key={o.id} className="px-4 py-3.5">
                <PedidoCardMobile
                  nome={o.clients?.full_name || "Cliente não identificado"}
                  total={Number(o.total_amount) || 0}
                  produto={o.product || "Produto não especificado"}
                  data={parseOrderDate(o.acquired_at || o.created_at)}
                  local={localDoCliente(o.clients)}
                  // Todos são deste marketplace: o selo da loja só repetiria o cabeçalho.
                  status={o.order_status && o.order_status.toLowerCase() !== "approved" ? o.order_status : null}
                  onAbrir={o.client_id ? () => setClienteAberto(o.client_id) : undefined}
                  whatsapp={
                    o.clients?.whatsapp
                      ? { contatado: !!o.whatsapp_contacted_at, onClick: () => chamarNoWhatsApp(o) }
                      : null
                  }
                  onEmail={o.clients?.email ? () => window.open(`mailto:${o.clients!.email}`, "_blank") : null}
                />
              </li>
            ))}
          </Secao>
        )}

        {multiLoja && (
          <Secao
            titulo="Comparado aos outros"
            direita={textoPequeno(`${m.outrasCount} marketplace${m.outrasCount === 1 ? "" : "s"}`)}
            rodape={
              m.sharePct > 0 ? (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <span>Fatia da receita do período</span>
                    <span className={cn("font-semibold tabular-nums", INK_TEXT)}>
                      {m.sharePct.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%
                    </span>
                  </div>
                  <ShareBar pct={m.sharePct} className="h-2" />
                </div>
              ) : undefined
            }
          >
            {compareRows.map((r) => {
              const I = icones[r.label as keyof typeof icones] ?? Activity;
              const acima = r.delta !== null && r.delta >= 0;
              // Os números da tabela do computador saem com ponto (toFixed); aqui, em pt-BR.
              const br = (s: string) => (s.startsWith("R$") ? s : s.replace(".", ","));
              return (
                <Linha
                  key={r.label}
                  icone={
                    <Bolinha neutra>
                      <I className="h-[18px] w-[18px]" strokeWidth={2} />
                    </Bolinha>
                  }
                  titulo={r.label === "Ticket Médio" ? "Ticket médio" : r.label}
                  // "dos clientes": a Recompra da aba Regiões é outra conta (dos pedidos).
                  apoio={r.label === "Recompra" ? `dos clientes · média ${br(r.theirs)}` : `média ${br(r.theirs)}`}
                  valor={br(r.mine)}
                  rodape={
                    // Âmbar/rosa, não verde: estar acima da média é posição, não melhora.
                    <span
                      className={cn(
                        "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[12px] font-medium tabular-nums",
                        r.delta === null
                          ? "bg-muted text-muted-foreground"
                          : acima
                            ? "bg-amber-500/10 text-amber-700 dark:text-amber-400"
                            : "bg-rose-500/10 text-rose-700 dark:text-rose-400",
                      )}
                    >
                      {r.delta === null ? (
                        "—"
                      ) : (
                        <>
                          {acima ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                          {acima ? "+" : "−"}
                          {fmtPct(r.delta).replace(".", ",")}
                          {r.pp ? "pp" : "%"}
                        </>
                      )}
                    </span>
                  }
                />
              );
            })}
          </Secao>
        )}

        {clienteAberto && sellerId && (
          <ClientDetailSheet
            clientId={clienteAberto}
            sellerId={sellerId}
            open={!!clienteAberto}
            onOpenChange={(aberto) => {
              if (!aberto) setClienteAberto(null);
            }}
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4 2xl:space-y-6" style={ink.vars}>
      {/* ---------------- Dashboard da loja (padrão do Dashboard geral) ---- */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiPadrao
          titulo="Faturamento"
          valor={formatCurrency(m.revenue)}
          apoio={`${fmtInt(m.orders)} pedidos no período`}
          icone={DollarSign}
          destaque
          loading={loading}
          tooltip={`Soma do valor dos pedidos de ${label} no período${storeName ? `, na loja ${storeName}` : ""}. Pedido cancelado não entra.`}
        />
        <KpiPadrao
          titulo="Pedidos"
          valor={fmtInt(m.orders)}
          icone={CartIcon}
          loading={loading}
          tooltip="Pedidos do período neste marketplace. Aqui cada pedido conta individualmente — sem o agrupamento de compras da lista de Pedidos."
        />
        <KpiPadrao
          titulo="Clientes"
          valor={fmtInt(m.clients)}
          apoio="Compraram pelo menos uma vez no período"
          icone={UsersIcon}
          loading={loading}
          tooltip="Clientes únicos com pedido neste marketplace no período."
        />
        <KpiPadrao
          titulo="Ticket médio"
          valor={formatCurrency(m.orders > 0 ? m.revenue / m.orders : 0)}
          icone={TrendIcon}
          loading={loading}
          tooltip="Faturamento deste marketplace dividido pelos pedidos dele no período."
        />
      </div>

      {!storeId && (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-5">
          <PanelCard
            icon={MapIcon}
            title="Mapa do Brasil"
            subtitle={`Só pedidos de ${label} · cor proporcional à métrica`}
            className="xl:col-span-3"
            right={
              <div className="flex items-center gap-1 rounded-full bg-muted p-0.5">
                {METRICAS.map((mm) => (
                  <button
                    key={mm.key}
                    type="button"
                    onClick={() => setMetricaMapa(mm.key)}
                    className={cn(
                      "rounded-full px-3 py-1 text-[11px] font-semibold transition-colors",
                      metricaMapa === mm.key
                        ? "bg-foreground text-background"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {mm.label}
                  </button>
                ))}
              </div>
            }
          >
            {regioesLoja.isLoading ? (
              <DashEmptyState className={ALTURA_MAPA}>Carregando mapa…</DashEmptyState>
            ) : (
              <BrazilChoropleth
                rows={regioesLoja.data ?? []}
                metrica={metricaMapa}
                ufSelecionada={ufSelecionada}
                onSelecionar={setUfSelecionada}
              />
            )}
          </PanelCard>
          <TopStates data={regioesLoja.data ?? []} className="xl:col-span-2" right={null} />
        </div>
      )}

      {/* acquired_at é opcional no OrderRow; o RecentOrders exige. O fallback é
          o mesmo que a tabela usa (created_at). */}
      <RecentOrders
        orders={(ultimosPedidos.data?.rows ?? []).map((o) => ({
          ...o,
          acquired_at: o.acquired_at ?? o.created_at ?? "",
        }))}
      />

      {/* Removidos a pedido (29/08/2026): os 6 KPIs antigos, a tira de insights,
          os gráficos "Faturamento ao longo do tempo"/"Dias da semana" e o aviso
          "Loja única no período". Os quatro KPIs de cima já dizem Pedidos,
          Faturamento, Ticket médio e Clientes — a fileira de seis repetia os
          quatro e ainda usava o estilo anterior à padronização, com ícone
          colorido por métrica em vez do chip verde da casa. */}



      {/* ---------------- Esta loja vs as outras ---------------- */}
      {multiLoja && (
        <LojaPanel
          tone="amber"
          icon={<Trophy className="w-5 h-5" />}
          title="Esta loja vs as outras"
          subtitle={`Como ${label} se compara às outras ${m.outrasCount} loja${m.outrasCount === 1 ? "" : "s"}`}
        >
          <div className="overflow-x-auto -mx-6 px-6">
            <div className="min-w-[560px]">
              <div className="grid grid-cols-[1.4fr_1fr_1fr_auto] gap-4 px-2 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wide border-b border-border">
                <div>Métrica</div>
                <div className="text-right">Esta loja</div>
                <div className="text-right">Média das outras</div>
                <div className="text-right">Variação</div>
              </div>
              {compareRows.map((r) => {
                const acima = r.delta !== null && r.delta >= 0;
                // Paleta POSICIONAL (âmbar/rosa), não verde: estar acima da média
                // não é "melhorei", é "estou bem colocado".
                const badge =
                  r.delta === null
                    ? "bg-muted text-muted-foreground"
                    : acima
                      ? "bg-amber-500/10 text-amber-700 dark:text-amber-400"
                      : "bg-rose-500/10 text-rose-700 dark:text-rose-400";
                return (
                  <div
                    key={r.label}
                    className="grid grid-cols-[1.4fr_1fr_1fr_auto] gap-4 px-2 py-3 items-center border-b border-border/50 last:border-0 text-sm"
                  >
                    <div className="font-medium text-foreground">{r.label}</div>
                    <div className="text-right tabular-nums font-semibold text-foreground">{r.mine}</div>
                    <div className="text-right tabular-nums text-muted-foreground">{r.theirs}</div>
                    <div className="text-right">
                      <span
                        className={cn(
                          "inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-medium",
                          badge,
                        )}
                      >
                        {r.delta === null ? (
                          "—"
                        ) : (
                          <>
                            {acima ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                            {acima ? "+" : "−"}
                            {fmtPct(r.delta)}
                            {r.pp ? "pp" : "%"}
                          </>
                        )}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {m.sharePct > 0 && (
            <div className="mt-5 pt-5 border-t border-border">
              <div className="flex items-center justify-between mb-2 text-sm">
                <span className="font-medium text-foreground">% da receita do período</span>
                <span className={cn("tabular-nums font-semibold", INK_TEXT)}>
                  {m.sharePct.toFixed(1)}%
                </span>
              </div>
              <ShareBar pct={m.sharePct} className="h-2.5" />
            </div>
          )}
        </LojaPanel>
      )}

    </div>
  );
}

export default LojaVisaoGeralTab;
