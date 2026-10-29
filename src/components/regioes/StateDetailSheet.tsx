import { useEffect, useId, useMemo, useRef, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangle,
  BarChart3,
  Building2,
  CalendarDays,
  DollarSign,
  Inbox,
  MapPin,
  Package,
  RotateCw,
  Scale,
  ShoppingCart,
  Store,
  TrendingUp,
  Trophy,
  Users,
} from "lucide-react";
import { differenceInCalendarDays, format } from "date-fns";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { KpiPadrao } from "@/components/kpi/KpiPadrao";
import { ClientAvatar } from "@/components/crm/ClientAvatar";
import { formatMarketplaceName } from "@/utils/formatters";
import { useRegioes, useStateDetail, type StateDetail } from "@/hooks/useRegioes";
import {
  ACCENT,
  barCursor,
  brl,
  brlAxis,
  int,
  pct,
  variacao,
} from "@/components/dashboard/shared";
import { ESTADO_POR_UF } from "./brazilStatePaths";
import {
  BarrasComparacao,
  Itens,
  LinhaRanking,
  MiniMapaEstado,
  NotaRodape,
  PilulaVsMedia,
  SecaoCard,
  VazioSecao,
} from "./stateDetailParts";

/**
 * Comportamento de compra de um estado, no molde do sheet do cliente
 * (ClientDetailSheet): cabeçalho centralizado com o "avatar" do estado, abas,
 * e cards de seção com ícone e título.
 *
 * Não tem taxa de 2ª venda: `is_second_sale` diz que o pedido é recompra, não
 * que a Segunda Venda a provocou. E não tem distribuição por turno, que saiu do
 * sheet de produtos a pedido — dia da semana ocupa o lugar.
 *
 * Tudo aqui sai de UMA chamada (`get_state_detail`). A posição do estado no
 * ranking vem de `useRegioes` com a mesma chave que a aba Regiões e o Dashboard
 * já carregaram — é leitura de cache, não consulta nova.
 */

const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
/** Nome por extenso para a frase do subtítulo — "vende mais na seg" fica truncado. */
const DIAS_EXTENSO = [
  "no domingo",
  "na segunda",
  "na terça",
  "na quarta",
  "na quinta",
  "na sexta",
  "no sábado",
];
/** Semana comercial: segunda primeiro, domingo no fim. A RPC devolve 0 = domingo. */
const ORDEM_SEMANA = [1, 2, 3, 4, 5, 6, 0];
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const MESES_LONGOS = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

const rotuloMes = (iso: string) => {
  const [y, m] = iso.split("-").map(Number);
  return `${MESES[(m ?? 1) - 1] ?? "?"}/${String(y ?? "").slice(2)}`;
};
const rotuloMesLongo = (iso: string) => {
  const [y, m] = iso.split("-").map(Number);
  return `${MESES_LONGOS[(m ?? 1) - 1] ?? "?"} de ${y ?? ""}`;
};

const umaCasa = (v: number) =>
  v.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

const plural = (n: number, um: string, varios: string) => `${int(n)} ${n === 1 ? um : varios}`;

/** Parte de um todo, já em "%". Sem todo, não inventa 0%. */
const parte = (valor: number, todo: number, casas = 1) =>
  todo > 0 ? pct((valor / todo) * 100, casas) : "—";

/** "01/09 – 30/09/26"; o ano só aparece uma vez quando os dois são do mesmo. */
function rotuloPeriodo(inicio: Date, fim: Date) {
  const mesmoAno = inicio.getFullYear() === fim.getFullYear();
  return `${format(inicio, mesmoAno ? "dd/MM" : "dd/MM/yy")} – ${format(fim, "dd/MM/yy")}`;
}

/**
 * "há 3 dias", em dias de CALENDÁRIO — a mesma conta do cabeçalho do sheet do
 * cliente, para o mesmo cliente não aparecer com dois números em duas telas.
 */
function haQuanto(iso: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const dias = differenceInCalendarDays(new Date(), d);
  if (dias <= 0) return "hoje";
  if (dias === 1) return "ontem";
  return `há ${int(dias)} dias`;
}

const ABA =
  "rounded-lg py-2 text-[12px] data-[state=active]:bg-foreground data-[state=active]:text-background";
const CONTEUDO_ABA = "mt-0 space-y-5 px-4 py-5 sm:px-6";

/* ------------------------------------------------------------------ *
 * Cabeçalho — molde do ClientHeader
 * ------------------------------------------------------------------ */

type Posicao = { pos: number; total: number };

function CabecalhoEstado({
  uf,
  d,
  periodo,
  posicao,
  carregando = false,
  onVerPedidos,
}: {
  uf: string;
  /** Ausente enquanto carrega (ou na falha): nome, região, período e botão já
   *  aparecem, porque só dependem da UF e da tela. */
  d?: StateDetail;
  periodo?: { inicio: Date; fim: Date };
  posicao?: Posicao | null;
  /** Sem `d`: true desenha esqueleto nos números; false (falha) não desenha nada. */
  carregando?: boolean;
  onVerPedidos: () => void;
}) {
  const geo = ESTADO_POR_UF[uf];
  const nome = geo?.name ?? uf;
  const regiao = d?.regiao ?? geo?.regiao ?? null;
  const semPedidos = d ? d.orders === 0 : false;

  return (
    // pt-8: o X do Sheet fica em top-2/right-2 e não esbarra no conteúdo centralizado.
    <div className="flex flex-col items-center border-b px-4 pb-5 pt-8 text-center sm:px-6">
      <MiniMapaEstado uf={uf} />
      <h2 className="mt-4 text-[24px] font-bold leading-tight text-foreground">{nome}</h2>

      <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
        {regiao && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 text-[12px] font-semibold text-muted-foreground">
            <MapPin className="h-3.5 w-3.5" />
            Região {regiao}
          </span>
        )}
        {!d ? (
          carregando && <Skeleton className="h-[30px] w-32 rounded-full" />
        ) : semPedidos ? (
          <span className="rounded-full bg-muted px-3 py-1.5 text-[12px] font-semibold text-muted-foreground">
            Sem pedidos no período
          </span>
        ) : (
          posicao && (
            <span
              className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1.5 text-[12px] font-semibold text-primary"
              title={`Posição por número de pedidos entre os ${posicao.total} estados com venda no período`}
            >
              <Trophy className="h-3.5 w-3.5" />
              {posicao.pos}º de {posicao.total} em pedidos
            </span>
          )
        )}
      </div>

      {/* Sem o "·" do cabeçalho do cliente: aqui a linha quebra no celular, e o
          separador ficava pendurado no fim da primeira linha. Os ícones já
          separam um item do outro. */}
      <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[13px] font-medium text-muted-foreground">
        {!d && carregando ? (
          <Skeleton className="h-4 w-64" />
        ) : (
          <>
            {d && !semPedidos && (
              <>
                <span
                  className="inline-flex items-center gap-1 tabular-nums"
                  title="Fatia deste estado nos pedidos do período (só pedidos com estado identificado)"
                >
                  <ShoppingCart className="h-3.5 w-3.5" />
                  {pct(d.share_orders_pct, 1)} dos pedidos
                </span>
                <span
                  className="inline-flex items-center gap-1 tabular-nums"
                  title="Fatia deste estado na receita do período (só pedidos com estado identificado)"
                >
                  <DollarSign className="h-3.5 w-3.5" />
                  {pct(d.share_revenue_pct, 1)} da receita
                </span>
              </>
            )}
            {periodo && (
              <span className="inline-flex items-center gap-1 tabular-nums">
                <CalendarDays className="h-3.5 w-3.5" />
                {rotuloPeriodo(periodo.inicio, periodo.fim)}
              </span>
            )}
          </>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
        <Button size="sm" onClick={onVerPedidos} className="h-9 rounded-md px-4">
          <ShoppingCart className="mr-1.5 h-4 w-4" /> Ver pedidos deste estado
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Aba Visão Geral
 * ------------------------------------------------------------------ */

/**
 * Apoio de KPI preso a UMA linha. O KpiPadrao ancora valor + apoio no fundo do
 * card: num par lado a lado, um apoio que quebra em 2 linhas sobe o valor do
 * seu card 16px em relação ao vizinho (era o "7,2% dos pedidos do período" a
 * 375px). Os textos já são curtos para caber; o corte com reticências é só a
 * rede de segurança para telas de 320px, com o texto inteiro no `title`.
 */
function ApoioUmaLinha({ texto }: { texto: string }) {
  return (
    <span className="block truncate" title={texto}>
      {texto}
    </span>
  );
}

function KpisEstado({ d }: { d: StateDetail }) {
  const vsTicket = variacao(d.avg_ticket, d.national.avg_ticket);
  // Contagens em cima, dinheiro embaixo. Abaixo de `sm` o sheet ocupa a tela
  // inteira e meia largura não comporta "R$ 287.456,78" em 24px (cortava em
  // "R$ 287.45…"): os dois cards de dinheiro passam a ocupar a linha toda.
  const dinheiro = "p-4 sm:p-5 max-sm:col-span-2";
  return (
    <div className="grid grid-cols-2 gap-3">
      <KpiPadrao
        titulo="Pedidos"
        valor={int(d.orders)}
        icone={ShoppingCart}
        className="p-4 sm:p-5"
        apoio={<ApoioUmaLinha texto={`${pct(d.share_orders_pct, 1)} do total`} />}
        tooltip="Pedidos não-cancelados do período de clientes com endereço neste estado. Cada pedido conta individualmente — esta tela não usa o agrupamento de compras da lista de Pedidos."
      />
      <KpiPadrao
        titulo="Clientes"
        valor={int(d.clients)}
        icone={Users}
        className="p-4 sm:p-5"
        apoio={
          d.clients > 0 ? (
            <ApoioUmaLinha
              texto={`${umaCasa(d.orders_per_client)} ${d.orders_per_client >= 2 ? "pedidos" : "pedido"} por cliente`}
            />
          ) : undefined
        }
        tooltip="Clientes diferentes com endereço neste estado e pelo menos um pedido não-cancelado no período."
      />
      <KpiPadrao
        titulo="Receita"
        valor={brl(d.revenue)}
        icone={DollarSign}
        className={dinheiro}
        apoio={<ApoioUmaLinha texto={`${pct(d.share_revenue_pct, 1)} do total`} />}
        tooltip="Soma do valor dos pedidos não-cancelados deste estado no período."
      />
      <KpiPadrao
        titulo="Ticket médio"
        valor={brl(d.avg_ticket)}
        icone={TrendingUp}
        className={dinheiro}
        tooltip="Receita do estado dividida pelos pedidos dele. A comparação é com o ticket médio de todos os estados no mesmo período."
      >
        {/* Sem média nacional não há comparação: a pílula padrão diria "sem
            base anterior", que aqui não faz sentido — melhor não dizer nada. */}
        {/* `flex` e não bloco: num bloco, a linha herda a altura do texto de
            16px do card (24px de entrelinha) e o valor do Ticket subia 8px em
            relação ao da Receita, que fica ao lado do `sm` para cima. */}
        {vsTicket !== null && (
          <div className="mt-1 flex">
            <PilulaVsMedia valor={vsTicket} />
          </div>
        )}
      </KpiPadrao>
    </div>
  );
}

function ComparacaoPais({ d, nome }: { d: StateDetail; nome: string }) {
  return (
    <SecaoCard
      icon={Scale}
      titulo="Como se compara ao país"
      subtitulo="Mesmo período, contra a média de todos os estados"
    >
      <div className="space-y-5">
        <BarrasComparacao
          titulo="Ticket médio"
          nomeEstado={nome}
          valorEstado={d.avg_ticket}
          valorPais={d.national.avg_ticket}
          formatar={brl}
          variacao={variacao(d.avg_ticket, d.national.avg_ticket)}
        />
        <BarrasComparacao
          titulo="Pedidos por cliente"
          nomeEstado={nome}
          valorEstado={d.orders_per_client}
          valorPais={d.national.orders_per_client}
          formatar={umaCasa}
          variacao={variacao(d.orders_per_client, d.national.orders_per_client)}
        />
      </div>
      {d.national.orders > 0 && (
        <NotaRodape>
          A média nacional soma {plural(d.national.orders, "pedido", "pedidos")} e{" "}
          {brl(d.national.revenue)} de todos os estados com venda no período, este incluído.
        </NotaRodape>
      )}
    </SecaoCard>
  );
}

type PontoMes = {
  month: string;
  orders: number;
  revenue: number;
  nome: string;
  parcial: boolean;
};

function TooltipMes({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: PontoMes }[];
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 shadow-lg">
      {/* Maiúscula só na 1ª letra: `capitalize` faria "Agosto De 2026". */}
      <p className="text-[12px] font-bold text-foreground">
        {rotuloMesLongo(p.month).replace(/^./, (c) => c.toUpperCase())}
        {p.parcial && <span className="font-medium text-muted-foreground"> (parcial)</span>}
      </p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">
        {plural(p.orders, "pedido", "pedidos")}
      </p>
      <p className="text-[12px] font-semibold tabular-nums text-foreground">{brl(p.revenue)}</p>
    </div>
  );
}

function EvolucaoReceita({ d, fim }: { d: StateDetail; fim?: Date }) {
  const gradId = `evo-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;

  const dados = useMemo<PontoMes[]>(() => {
    // A série termina no FIM do período: se ele cai no meio do mês, a última
    // barra é um mês pela metade e não pode parecer uma queda.
    const mesFim = fim ? format(fim, "yyyy-MM") : null;
    const fimDoMes = fim
      ? fim.getDate() === new Date(fim.getFullYear(), fim.getMonth() + 1, 0).getDate()
      : true;
    const ultimo = d.revenue_evolution.length - 1;
    return d.revenue_evolution.map((m, i) => ({
      ...m,
      nome: rotuloMes(m.month),
      parcial: i === ultimo && m.month === mesFim && !fimDoMes,
    }));
  }, [d.revenue_evolution, fim]);

  const total = dados.reduce((s, m) => s + m.revenue, 0);
  const parcial = dados.find((m) => m.parcial);

  return (
    <SecaoCard
      icon={BarChart3}
      titulo="Evolução de receita"
      subtitulo="Últimos 6 meses — não segue o período da tela"
    >
      {total <= 0 ? (
        <VazioSecao>Nenhum pedido deste estado nos últimos 6 meses.</VazioSecao>
      ) : (
        <div className="h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={dados} margin={{ top: 4, right: 4, left: -8, bottom: 0 }}>
              <defs>
                <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={ACCENT} stopOpacity={0.95} />
                  <stop offset="100%" stopColor={ACCENT} stopOpacity={0.55} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis
                dataKey="nome"
                tick={{ fontSize: 11 }}
                stroke="hsl(var(--muted-foreground))"
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11 }}
                stroke="hsl(var(--muted-foreground))"
                axisLine={false}
                tickLine={false}
                width={58}
                tickFormatter={(v: number) => brlAxis(v)}
              />
              <Tooltip cursor={barCursor} content={<TooltipMes />} />
              <Bar dataKey="revenue" radius={[6, 6, 0, 0]} maxBarSize={44} isAnimationActive={false}>
                {dados.map((m) => (
                  <Cell key={m.month} fill={m.parcial ? `${ACCENT}59` : `url(#${gradId})`} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      {total > 0 && parcial && fim && (
        <NotaRodape>
          A última barra é parcial: {rotuloMesLongo(parcial.month)} só até{" "}
          {format(fim, "dd/MM")}.
        </NotaRodape>
      )}
    </SecaoCard>
  );
}

function AvisoSemPedidos() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg bg-card px-6 py-10 text-center shadow-sm">
      <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-muted">
        <Inbox className="h-6 w-6 text-muted-foreground" />
      </div>
      <div>
        <p className="font-medium text-foreground">Nenhum pedido deste estado no período</p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
          Troque o período no topo da tela para ver outro recorte. A evolução abaixo cobre os
          últimos 6 meses e não depende dele.
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Aba Comportamento
 * ------------------------------------------------------------------ */

function DiaDaSemana({ d }: { d: StateDetail }) {
  const linhas = useMemo(() => {
    const porDia = new Map(d.weekday.map((w) => [w.dow, w]));
    return ORDEM_SEMANA.map((dow) => porDia.get(dow) ?? { dow, orders: 0, revenue: 0 });
  }, [d.weekday]);

  const total = linhas.reduce((s, w) => s + w.orders, 0);
  const maior = linhas.reduce((m, w) => Math.max(m, w.orders), 0);
  const melhor = linhas.find((w) => w.orders === maior && maior > 0) ?? null;

  const grade = "grid grid-cols-[2.25rem_1fr_3.5rem_3rem] items-center gap-3 sm:grid-cols-[2.25rem_1fr_3.5rem_3rem_7.5rem]";

  return (
    <SecaoCard
      icon={CalendarDays}
      titulo="Pedidos por dia da semana"
      iconClasse="bg-secondary/10 text-secondary"
      subtitulo={
        melhor
          ? `Vende mais ${DIAS_EXTENSO[melhor.dow] ?? ""} (${parte(melhor.orders, total, 0)} dos pedidos)`
          : "Sem pedidos no período"
      }
    >
      {total === 0 ? (
        <VazioSecao>Sem pedidos no período.</VazioSecao>
      ) : (
        <div className="space-y-2">
          <div
            className={`${grade} text-[10px] font-medium uppercase tracking-wide text-muted-foreground`}
          >
            <span />
            <span />
            <span className="text-right">Pedidos</span>
            <span className="text-right">%</span>
            <span className="hidden text-right sm:block">Receita</span>
          </div>
          {linhas.map((w) => {
            const top = melhor?.dow === w.dow;
            return (
              <div key={w.dow} className={grade}>
                <span
                  className={`text-xs ${top ? "font-semibold text-foreground" : "text-muted-foreground"}`}
                >
                  {DIAS[w.dow]}
                </span>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full transition-[width] duration-500 ease-out"
                    style={{
                      width: maior > 0 && w.orders > 0 ? `${(w.orders / maior) * 100}%` : "0%",
                      background: top ? ACCENT : `${ACCENT}66`,
                    }}
                  />
                </div>
                <span className="text-right text-xs font-semibold tabular-nums text-foreground">
                  {int(w.orders)}
                </span>
                <span className="text-right text-xs tabular-nums text-muted-foreground">
                  {parte(w.orders, total, 0)}
                </span>
                <span className="hidden text-right text-xs tabular-nums text-muted-foreground sm:block">
                  {brl(w.revenue)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </SecaoCard>
  );
}

function Canais({ d }: { d: StateDetail }) {
  const lider = d.marketplaces.reduce((m, c) => Math.max(m, c.orders), 0);
  return (
    <SecaoCard
      icon={Store}
      titulo="De onde vêm os pedidos"
      subtitulo="Canal de venda dos pedidos do estado"
      iconClasse="bg-blue-500/10 text-blue-600 dark:text-blue-400"
    >
      {!d.marketplaces.length ? (
        <VazioSecao>Sem canal identificado.</VazioSecao>
      ) : (
        <ul className="space-y-1">
          {d.marketplaces.map((m, i) => (
            <LinhaRanking
              key={m.name}
              pos={i}
              share={lider > 0 ? m.orders / lider : 0}
              titulo={formatMarketplaceName(m.name)}
              sub={
                <Itens
                  itens={[brl(m.revenue), m.orders > 0 && `ticket ${brl(m.revenue / m.orders)}`]}
                />
              }
              valor={plural(m.orders, "pedido", "pedidos")}
              valorSub={`${parte(m.orders, d.orders)} dos pedidos`}
            />
          ))}
        </ul>
      )}
    </SecaoCard>
  );
}

/* ------------------------------------------------------------------ *
 * Aba Cidades
 * ------------------------------------------------------------------ */

function Cidades({ d }: { d: StateDetail }) {
  const lider = d.top_cities[0]?.orders ?? 0;
  const somaTop = d.top_cities.reduce((s, c) => s + c.orders, 0);
  const resto = Math.max(0, d.orders - somaTop);
  const primeira = d.top_cities[0];

  return (
    <SecaoCard
      icon={Building2}
      titulo="Cidades que mais compram"
      subtitulo={
        primeira && d.orders > 0
          ? `${primeira.city} concentra ${parte(primeira.orders, d.orders, 0)} dos pedidos do estado`
          : "Por número de pedidos no período"
      }
    >
      {!d.top_cities.length ? (
        <VazioSecao>Sem cidade identificada nos pedidos.</VazioSecao>
      ) : (
        <ul className="space-y-1">
          {d.top_cities.map((c, i) => (
            <LinhaRanking
              key={c.city}
              pos={i}
              share={lider > 0 ? c.orders / lider : 0}
              titulo={c.city}
              sub={
                <Itens
                  itens={[
                    plural(c.clients, "cliente", "clientes"),
                    brl(c.revenue),
                    c.orders > 0 && `ticket ${brl(c.revenue / c.orders)}`,
                  ]}
                />
              }
              valor={plural(c.orders, "pedido", "pedidos")}
              valorSub={`${parte(c.orders, d.orders)} do estado`}
            />
          ))}
        </ul>
      )}
      {d.top_cities.length > 0 && resto > 0 && (
        <NotaRodape>
          {d.top_cities.length >= 8 ? "Mostrando as 8 cidades com mais pedidos. " : ""}
          Mais {plural(resto, "pedido", "pedidos")} ({parte(resto, d.orders)}) em outras cidades ou
          de clientes sem cidade no cadastro.
        </NotaRodape>
      )}
    </SecaoCard>
  );
}

/* ------------------------------------------------------------------ *
 * Aba Produtos e clientes
 * ------------------------------------------------------------------ */

function Produtos({ d }: { d: StateDetail }) {
  const lider = d.top_products[0]?.revenue ?? 0;
  return (
    <SecaoCard
      icon={Package}
      titulo="Produtos mais vendidos no estado"
      subtitulo="Os que mais faturaram no período"
      iconClasse="bg-amber-500/10 text-amber-600 dark:text-amber-400"
    >
      {!d.top_products.length ? (
        <VazioSecao>Sem dados de produto.</VazioSecao>
      ) : (
        <ul className="space-y-1">
          {d.top_products.map((p, i) => (
            <LinhaRanking
              key={`${p.name}-${i}`}
              pos={i}
              share={lider > 0 ? p.revenue / lider : 0}
              titulo={p.name}
              sub={
                <Itens
                  itens={[
                    plural(p.orders, "pedido", "pedidos"),
                    p.orders > 0 && `ticket ${brl(p.revenue / p.orders)}`,
                  ]}
                />
              }
              valor={brl(p.revenue)}
              valorSub={`${parte(p.revenue, d.revenue)} da receita`}
              destaque
            />
          ))}
        </ul>
      )}
    </SecaoCard>
  );
}

function Clientes({ d }: { d: StateDetail }) {
  const lider = d.top_clients[0]?.revenue ?? 0;
  return (
    <SecaoCard
      icon={Users}
      titulo="Maiores clientes do estado"
      subtitulo="Os que mais compraram no período"
      iconClasse="bg-blue-500/10 text-blue-600 dark:text-blue-400"
    >
      {!d.top_clients.length ? (
        <VazioSecao>Sem clientes no período.</VazioSecao>
      ) : (
        <ul className="space-y-1">
          {d.top_clients.map((c, i) => {
            const quando = haQuanto(c.last_order_at);
            return (
              <LinhaRanking
                key={c.client_id || `${c.name}-${i}`}
                pos={i}
                share={lider > 0 ? c.revenue / lider : 0}
                inicio={<ClientAvatar name={c.name} size={28} fontSize={11} className="shrink-0" />}
                titulo={c.name}
                sub={
                  <Itens
                    itens={[
                      plural(c.orders, "pedido", "pedidos"),
                      quando && c.last_order_at && (
                        <span title={format(new Date(c.last_order_at), "dd/MM/yyyy HH:mm")}>
                          última compra {quando}
                        </span>
                      ),
                    ]}
                  />
                }
                valor={brl(c.revenue)}
                valorSub={`${parte(c.revenue, d.revenue)} da receita`}
                destaque
              />
            );
          })}
        </ul>
      )}
    </SecaoCard>
  );
}

/* ------------------------------------------------------------------ *
 * Conteúdo e sheet
 * ------------------------------------------------------------------ */

/** Exportado sem o Sheet em volta: é puro apresentacional e dá para renderizar
 *  isolado numa conferência visual, sem sessão nem provider. */
export function StateDetailContent({
  d,
  onVerPedidos,
  periodo,
  posicao,
}: {
  d: StateDetail;
  onVerPedidos: () => void;
  /** Período da tela, para o cabeçalho e para marcar o mês parcial na evolução. */
  periodo?: { inicio: Date; fim: Date };
  /** Posição do estado no ranking de pedidos (vem do cache de useRegioes). */
  posicao?: Posicao | null;
}) {
  const nome = ESTADO_POR_UF[d.uf]?.name ?? d.uf;
  const semPedidos = d.orders === 0;

  return (
    <>
      <CabecalhoEstado
        uf={d.uf}
        d={d}
        periodo={periodo}
        posicao={posicao}
        onVerPedidos={onVerPedidos}
      />

      <Tabs defaultValue="geral" className="w-full">
        <div className="px-4 pt-5 sm:px-6">
          <TabsList className="grid h-auto w-full grid-cols-2 gap-1 rounded-xl bg-muted p-1 sm:grid-cols-4">
            <TabsTrigger value="geral" className={ABA}>
              Visão Geral
            </TabsTrigger>
            <TabsTrigger value="comportamento" className={ABA}>
              Comportamento
            </TabsTrigger>
            <TabsTrigger value="cidades" className={ABA}>
              Cidades
            </TabsTrigger>
            <TabsTrigger value="produtos" className={ABA}>
              Produtos e clientes
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="geral" className={CONTEUDO_ABA}>
          {/* Sem pedido no período, KPIs zerados e "-100% vs. média" só fariam
              barulho vermelho. A evolução continua: cobre 6 meses, não o período. */}
          {semPedidos ? (
            <AvisoSemPedidos />
          ) : (
            <>
              <KpisEstado d={d} />
              <ComparacaoPais d={d} nome={nome} />
            </>
          )}
          <EvolucaoReceita d={d} fim={periodo?.fim} />
        </TabsContent>

        <TabsContent value="comportamento" className={CONTEUDO_ABA}>
          <DiaDaSemana d={d} />
          <Canais d={d} />
        </TabsContent>

        <TabsContent value="cidades" className={CONTEUDO_ABA}>
          <Cidades d={d} />
        </TabsContent>

        <TabsContent value="produtos" className={CONTEUDO_ABA}>
          <Produtos d={d} />
          <Clientes d={d} />
        </TabsContent>
      </Tabs>
    </>
  );
}

function EsqueletoCorpo() {
  return (
    <>
      <div className="px-4 pt-5 sm:px-6">
        <Skeleton className="h-[76px] w-full rounded-xl sm:h-10" />
      </div>
      <div className="space-y-5 px-4 py-5 sm:px-6">
        <div className="grid grid-cols-2 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-48 rounded-2xl" />
        <Skeleton className="h-48 rounded-2xl" />
      </div>
    </>
  );
}

function FalhaCarregar({ mensagem, onTentar }: { mensagem: ReactNode; onTentar: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-destructive/10">
        <AlertTriangle className="h-6 w-6 text-destructive" />
      </div>
      <div>
        <p className="font-medium text-foreground">Não foi possível carregar os dados</p>
        <p className="mx-auto mt-1 max-w-xs text-sm text-muted-foreground">{mensagem}</p>
      </div>
      <Button variant="outline" size="sm" onClick={onTentar}>
        <RotateCw className="mr-2 h-4 w-4" /> Tentar novamente
      </Button>
    </div>
  );
}

export function StateDetailSheet({
  sellerIds,
  uf,
  startDate,
  endDate,
  onClose,
}: {
  sellerIds: string[];
  uf: string | null;
  startDate: Date;
  endDate: Date;
  onClose: () => void;
}) {
  const navigate = useNavigate();

  const {
    data: dataAtual,
    isError,
    error,
    refetch,
    isFetching,
  } = useStateDetail(sellerIds, uf, startDate, endDate);

  // O Sheet anima a saída por 300 ms depois de `uf` virar null, e nesse meio
  // tempo a consulta já trocou de chave: o painel virava esqueleto enquanto
  // deslizava para fora. Guarda a última UF e o último payload só para essa
  // saída — a consulta continua presa a `uf`, então painel fechado não dispara
  // RPC quando o período da tela muda. Ref (e não estado): guardar não pode
  // provocar render — com estado, um payload que viesse com identidade nova a
  // cada render entrava em laço ("Too many re-renders").
  const ultimo = useRef<{ uf: string; data: StateDetail | null | undefined } | null>(null);
  useEffect(() => {
    if (uf) ultimo.current = { uf, data: dataAtual };
  }, [uf, dataAtual]);
  const ufMostrada = uf ?? ultimo.current?.uf ?? null;
  const data = uf ? dataAtual : (ultimo.current?.data ?? undefined);
  // Mesma chave da aba Regiões e do Dashboard: lê do cache, não abre consulta.
  const { data: linhas } = useRegioes(sellerIds, startDate, endDate);

  const posicao = useMemo<Posicao | null>(() => {
    if (!ufMostrada || !linhas?.length) return null;
    const minha = linhas.find((r) => r.uf === ufMostrada);
    if (!minha || minha.orders <= 0) return null;
    const comVenda = linhas.filter((r) => r.orders > 0);
    // Empate divide a posição ("2º" para os dois), como em qualquer ranking.
    return { pos: 1 + comVenda.filter((r) => r.orders > minha.orders).length, total: comVenda.length };
  }, [linhas, ufMostrada]);

  const periodo = useMemo(() => ({ inicio: startDate, fim: endDate }), [startDate, endDate]);
  const verPedidos = () => {
    const alvo = data?.uf ?? ufMostrada;
    if (alvo) navigate(`/pedidos?estado=${alvo}`);
  };
  const nome = ufMostrada ? (ESTADO_POR_UF[ufMostrada]?.name ?? ufMostrada) : "Estado";

  return (
    <Sheet open={!!uf} onOpenChange={(aberto) => !aberto && onClose()}>
      {/* Sem classe de background aqui: o SheetContent já traz `bg-background`
          sólido, e um `bg-muted/30` por cima vence no merge e deixa o painel
          translúcido — dava para ler o ranking através dele.
          p-0: cada seção cuida do próprio gutter, como no sheet do cliente.
          720px: a MESMA largura do sheet de produto (padronização de 01/10 — o
          dono pediu os dois mais largos que o do cliente, de 600px). */}
      <SheetContent side="right" className="w-full overflow-y-auto p-0 sm:max-w-[720px]">
        <SheetHeader className="sr-only">
          <SheetTitle>{nome}</SheetTitle>
          <SheetDescription>Comportamento de compra do estado no período</SheetDescription>
        </SheetHeader>

        {!ufMostrada ? null : data ? (
          <StateDetailContent
            d={data}
            onVerPedidos={verPedidos}
            periodo={periodo}
            posicao={posicao}
          />
        ) : (
          <>
            <CabecalhoEstado
              uf={ufMostrada}
              periodo={periodo}
              carregando={!((isError || data === null) && !isFetching)}
              onVerPedidos={verPedidos}
            />
            {isError || data === null ? (
              // Antes a condição era `isLoading || !data`: consulta que falhava
              // (ou voltava null por falta de acesso) deixava o esqueleto na
              // tela para sempre.
              isFetching ? (
                <EsqueletoCorpo />
              ) : (
                <FalhaCarregar
                  mensagem={
                    isError
                      ? ((error as Error | null)?.message ?? "Tente novamente em instantes.")
                      : "A consulta não devolveu dados para esta loja. Confira se você tem acesso a ela."
                  }
                  onTentar={() => refetch()}
                />
              )
            ) : (
              <EsqueletoCorpo />
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
