import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, ChevronLeft, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { StoreBadge } from "@/components/clients/StoreBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { CARD } from "@/components/pedidos/kpiCard";
import {
  usePedidosChart,
  DAY_BUCKET_MAX_DAYS,
  type PedidosGroupBy,
  type PedidosChartRow,
} from "@/hooks/usePedidosChart";
import type { PedidosDataFilters } from "@/hooks/usePedidosKpis";
import { useRfvSummary } from "@/hooks/useRfv";
import { formatCurrency } from "@/utils/formatters";
import { cn } from "@/lib/utils";

type Metric = "pedidos" | "receita";

/**
 * Abas de RFV — os mesmos "Clientes por Recência/Frequência/Valor" do Segundo
 * Pedido, encaixados neste card. São CONTAGENS DE CLIENTES da base inteira
 * classificada pelo RFV (janela própria do RFV): não seguem o filtro de
 * período nem o par Pedidos/Receita, e por isso o toggle some nessas abas.
 *
 * Saíram em 07/08/2026 (commit cc8be12c, "abas R/F/V vão para Clientes") e
 * voltam em 29/08/2026 com o resto do RFV. Continuam existindo também no
 * painel da tela Clientes — lá elas foram ACRESCENTADAS por aquele commit, e
 * tirar de lá seria outra remoção, não uma restauração.
 */
type RfvTabKey = "rfv_r" | "rfv_f" | "rfv_v";

// O `titulo` que existia aqui antes de 07/08/2026 nunca era lido em lugar
// nenhum do card; não voltou.
const RFV_TABS: { key: RfvTabKey; label: string; prefixo: "R" | "F" | "V" }[] = [
  { key: "rfv_r", label: "Recência", prefixo: "R" },
  { key: "rfv_f", label: "Frequência", prefixo: "F" },
  { key: "rfv_v", label: "Valor", prefixo: "V" },
];

/** Ordem 5→1, como no Segundo Pedido: nota alta (melhor) primeiro. */
const RFV_BUCKETS = ["5", "4", "3", "2", "1"] as const;

const RFV_HINT: Record<"R" | "F" | "V", string> = {
  R: "R5 comprou há pouco tempo; R1 está há mais tempo sem comprar.",
  F: "F5 compra com mais frequência; F1 comprou poucas vezes.",
  V: "V5 gastou mais; V1 gastou menos.",
};

/**
 * A 4ª aba.
 *
 * No Segundo Pedido ela é "Por Marketplace", separada de "Por Filial". Aqui não
 * existe filial, e a 2ª aba JÁ agrupa por `orders.marketplace` (store_id está
 * nulo em 16.075 de 16.075 pedidos) — ela só se chamava "Por Loja", o que era
 * o rótulo errado, corrigido em 21/08/2026. Uma aba "Por Marketplace" aqui
 * seria a mesma coluna duas vezes.
 *
 * O lugar vai para "Por Estado", que usa `clients.state_code` (92,9%
 * preenchido) e casa com o filtro de UF que a tela já tem.
 */
const FOURTH_TAB: { key: PedidosGroupBy; label: string } = { key: "state", label: "Por Estado" };

const TABS: { key: PedidosGroupBy; label: string }[] = [
  { key: "day", label: "Por Dia" },
  // "store" é o nome da chave na RPC, mas o que ela agrupa é
  // `orders.marketplace` — o rótulo agora diz a verdade (21/08/2026).
  { key: "store", label: "Por Marketplace" },
  FOURTH_TAB,
];

const STORE_PAGE_SIZE = 4;
const DONUT_TOP = 8;

/** Balde de "sem UF" devolvido pela RPC — travessão, não é um estado. */
const NO_STATE_BUCKET = "—";

// Tokens/HSL, nunca hex do Segundo Pedido: estas cores precisam sobreviver ao
// tema escuro.
const DONUT_PALETTE = [
  "hsl(var(--primary))",
  "hsl(205 75% 55%)",
  "hsl(38 92% 55%)",
  "hsl(280 60% 62%)",
  "hsl(340 70% 60%)",
  "hsl(165 55% 45%)",
  "hsl(20 85% 58%)",
  "hsl(225 60% 62%)",
  "hsl(220 9% 55%)",
];

const nf = (n: number) => n.toLocaleString("pt-BR");
const fmt = (v: number, m: Metric) => (m === "receita" ? formatCurrency(v) : nf(v));

const TOOLTIP_STYLE = {
  borderRadius: 12,
  border: "1px solid hsl(var(--border))",
  background: "hsl(var(--card))",
  color: "hsl(var(--foreground))",
  fontSize: 12,
} as const;

const PILL = "px-3 py-1.5 rounded-full font-semibold whitespace-nowrap transition-colors";
const PILL_ON = "bg-foreground text-background";
const PILL_OFF = "bg-muted text-muted-foreground hover:text-foreground";

interface Props {
  sellerId: string | null | undefined;
  start: string;
  end: string;
  filters?: PedidosDataFilters;
  /** clicar num marketplace do gráfico filtra a lista — é o que "Por Filial" fazia */
  onStoreClick?: (storeKey: string) => void;
  onStateClick?: (stateCode: string) => void;
  /**
   * Desenho do celular (22/10/2026): cartão no padrão das seções do app
   * (cantos maiores, borda fina no lugar da sombra) e a aba ativa no verde a
   * 10%, como as pílulas do resto da tela. Os dados e as abas são os mesmos.
   */
  compacto?: boolean;
}

export const PedidosChartCard = ({
  sellerId,
  start,
  end,
  filters,
  onStoreClick,
  onStateClick,
  compacto = false,
}: Props) => {
  const pillOn = compacto ? "bg-primary/10 text-primary" : PILL_ON;
  const pillOff = compacto ? "bg-muted/70 text-muted-foreground" : PILL_OFF;
  const [tab, setTab] = useState<PedidosGroupBy | RfvTabKey>("day");
  const [metricaEscolhida, setMetric] = useState<Metric>("pedidos");
  const [storePage, setStorePage] = useState(0);

  const rfvTab = RFV_TABS.find((t) => t.key === tab) ?? null;
  const porEstado = tab === "state";

  // "Por Estado" é sempre em PEDIDOS (pedido de 29/08). O par Pedidos/Receita
  // some ali, e a métrica precisa voltar junto: quem tivesse "Receita"
  // selecionado em outra aba veria a rosca dos estados em dinheiro, com o
  // seletor escondido e nada na tela dizendo qual dos dois está no centro.
  // Sem resetar o ESTADO: ao voltar para "Por Dia" a escolha anterior continua
  // valendo, que é o que se espera de um seletor que só ficou oculto.
  const metric: Metric = porEstado ? "pedidos" : metricaEscolhida;

  // Nas abas RFV a consulta de pedidos continua apontada para "day" só para o
  // hook não receber um group_by que a RPC não conhece; o resultado fica no
  // cache e nada dele é lido enquanto o RFV está na tela.
  const { data, isLoading, isError, refetch, isFetching } = usePedidosChart(
    sellerId,
    start,
    end,
    rfvTab ? "day" : (tab as PedidosGroupBy),
    filters ?? {},
  );

  // `useRfvSummary` só dispara quando uma das três abas está aberta: nas abas
  // de pedidos o sellerId vai como null e a query fica desabilitada.
  const rfv = useRfvSummary(rfvTab ? sellerId : null);
  const rfvData = useMemo(() => {
    if (!rfvTab || !rfv.data) return [];
    const porNota =
      rfvTab.prefixo === "R" ? rfv.data.by_r : rfvTab.prefixo === "F" ? rfv.data.by_f : rfv.data.by_v;
    return RFV_BUCKETS.map((n) => ({
      label: `${rfvTab.prefixo}${n}`,
      clientes: Number(porNota?.[n] ?? 0),
    }));
  }, [rfvTab, rfv.data]);
  const rfvTotal = useMemo(() => rfvData.reduce((s, b) => s + b.clientes, 0), [rfvData]);
  const rows: PedidosChartRow[] = useMemo(() => data ?? [], [data]);

  /**
   * A query fica DESABILITADA enquanto falta seller ou enquanto o período
   * personalizado não tem as duas datas. No react-query v5
   * `isLoading = isPending && isFetching`, e query desabilitada não está
   * fetching — ou seja, `isLoading` é FALSE com `data` undefined, e o card
   * anunciava "Sem pedidos no período selecionado" para um recorte que ninguém
   * consultou ainda.
   * `waiting` (sem seller) vira skeleton; `rangeMissing` vira instrução.
   */
  const waiting = !sellerId;
  const rangeMissing = !waiting && (!start || !end);
  const notAsked = waiting || rangeMissing;

  useEffect(() => {
    setStorePage(0);
  }, [tab, rows.length]);

  // O balde de "Por Dia" vira mês acima do mesmo limite usado na RPC — daí sai
  // o formato do rótulo do eixo.
  const monthly = useMemo(() => {
    const days = (new Date(end).getTime() - new Date(start).getTime()) / 86400000;
    return days > DAY_BUCKET_MAX_DAYS;
  }, [start, end]);

  const dayData = useMemo(
    () =>
      rows.map((r) => {
        const [y, m, d] = r.bucket.split("-");
        const label = monthly
          ? format(new Date(Number(y), Number(m) - 1, 1), "MMM/yy", { locale: ptBR })
          : `${d}/${m}`;
        return { label, pedidos: r.pedidos, receita: r.receita };
      }),
    [rows, monthly],
  );

  const total = useMemo(
    () => rows.reduce((s, r) => s + (metric === "receita" ? r.receita : r.pedidos), 0),
    [rows, metric],
  );

  const withPct = useMemo(() => {
    return rows.map((r) => {
      const value = metric === "receita" ? r.receita : r.pedidos;
      return { ...r, value, pct: total > 0 ? (value / total) * 100 : 0 };
    });
  }, [rows, metric, total]);

  const storeTotalPages = Math.max(1, Math.ceil(withPct.length / STORE_PAGE_SIZE));
  const safeStorePage = Math.min(storePage, storeTotalPages - 1);
  const storeSlice = withPct.slice(
    safeStorePage * STORE_PAGE_SIZE,
    safeStorePage * STORE_PAGE_SIZE + STORE_PAGE_SIZE,
  );

  // Donut: top 8 + "Outros". 27 fatias não são um gráfico, são um confete.
  //
  // A RPC rotula pedido sem UF como '—' (`coalesce(nullif(btrim(state_code),''),'—')`).
  // Essa fatia NÃO é clicável: '—' não é uma UF, não existe SelectItem com esse
  // valor, e clicar aplicava `state_code = '—'` — a tela inteira zerava
  // enquanto o seletor de Estado voltava a exibir o placeholder, sem dizer por
  // quê. Há 450 pedidos sem UF na base e sellers em que essa é a maior fatia.
  const donutData = useMemo(() => {
    const top = withPct.slice(0, DONUT_TOP);
    const rest = withPct.slice(DONUT_TOP);
    const restValue = rest.reduce((s, r) => s + r.value, 0);
    const out = top.map((r) => ({
      name: r.bucket === NO_STATE_BUCKET ? "Sem UF" : r.bucket,
      value: r.value,
      state: r.bucket === NO_STATE_BUCKET ? null : r.bucket,
    }));
    if (restValue > 0) out.push({ name: "Outros", value: restValue, state: null });
    return out;
  }, [withPct]);

  /**
   * Vazio olha a MÉTRICA ativa, não só `pedidos`: existe seller com 60 pedidos e
   * receita 0,00 — ali o donut desenhava um arco invisível e as barras ficavam
   * com `width: 0%`, em vez de dizer que não há receita.
   * `isError`/`notAsked` saem fora daqui: `[].every()` é `true` e transformava
   * falha de RPC e query desabilitada em "sem pedidos".
   */
  const hasRows = rows.length > 0;
  const empty =
    !isLoading && !isError && !notAsked &&
    (!hasRows || rows.every((r) => (metric === "receita" ? r.receita : r.pedidos) === 0));
  const emptyByMetric = empty && hasRows && rows.some((r) => r.pedidos > 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.15, ease: [0.4, 0, 0.2, 1] }}
      className={cn(
        compacto ? "rounded-3xl border border-border/60 bg-card p-4" : CARD,
        "h-full flex flex-col",
      )}
    >
      <div className={cn("flex items-center justify-between gap-3 flex-wrap", compacto ? "mb-3" : "mb-4")}>
        <div
          className={cn(
            "flex items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
            // No celular as abas rolam de ponta a ponta do cartão.
            compacto ? "-mx-4 w-[calc(100%+2rem)] px-4" : "-mx-1 px-1",
          )}
        >
          {[...TABS, ...RFV_TABS].map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              // px-2.5/12px em vez de px-3/13px: as abas mais o par
              // Pedidos/Receita passavam de 480px e o cabeçalho quebrava em duas
              // linhas mesmo no card largo.
              className={cn(PILL, "px-2.5 text-[12px]", tab === t.key ? pillOn : pillOff)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Pedidos/Receita valem para as dimensões de pedidos: as duas métricas
            vêm na mesma linha da RPC, alternar não custa request. Nas abas RFV o
            par some — lá a contagem é de CLIENTES, e oferecer "Receita" seria
            prometer um número que a RPC do RFV não devolve por balde. Em "Por
            Estado" também some, a pedido (29/08): a leitura ali é de volume por
            praça, e a rosca com "TOTAL 3.127" no centro fica ambígua quando o
            número pode ser real ou pedido sem aviso na própria peça.
            `ml-auto` porque `justify-between` age POR LINHA: quando o par cai
            para a segunda linha ele ficava colado à esquerda, embaixo das abas,
            em vez de alinhado à direita como no resto do card. */}
        {!rfvTab && !porEstado && (
          <div className="flex items-center gap-1 ml-auto">
            {(["pedidos", "receita"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMetric(m)}
                className={cn(PILL, "text-[12px]", metric === m ? pillOn : pillOff)}
              >
                {m === "pedidos" ? "Pedidos" : "Receita"}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* O card é `h-full` e acompanha a altura da grade de KPIs ao lado; com
          altura fixa em px a sobra do stretch virava faixa branca em vez de
          área de gráfico. Aqui e nos estados de espera a altura é 100% do vão,
          com o piso de 260px garantido pelo `min-h` deste pai — assim a tela
          não pula quando o dado chega. O `minHeight={260}` dos
          ResponsiveContainer é o cinto de segurança: se a percentagem não
          resolver (grade empilhada abaixo de `xl`), o recharts volta aos 260px
          de antes em vez de colapsar para zero. */}
      <div className="flex-1 min-h-[260px]">
        {rfvTab ? (
          rfv.isLoading || waiting ? (
            <div className="h-full min-h-[260px] flex items-end gap-2 px-1">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="flex-1" style={{ height: `${30 + ((i * 37) % 60)}%` }} />
              ))}
            </div>
          ) : rfv.data && !rfv.data.availability?.ready ? (
            <div className="h-full min-h-[260px] flex items-center justify-center text-center px-6">
              <p className="text-sm text-muted-foreground">
                {rfv.data.availability?.reason === "historico_curto"
                  ? "Histórico ainda curto para classificar a base pelo RFV."
                  : "Poucos clientes recorrentes para classificar a base pelo RFV."}
              </p>
            </div>
          ) : rfvTotal === 0 ? (
            <div className="h-full min-h-[260px] flex items-center justify-center text-center px-6">
              <p className="text-sm text-muted-foreground">Sem clientes classificados pelo RFV ainda.</p>
            </div>
          ) : (
            /* O card virou `h-full` em 28/08/2026 (altura acompanha a grade de
               KPIs ao lado). Por isso o gráfico não volta com os 238px fixos que
               tinha antes de sair: ele ocupa o vão que sobra da nota de rodapé,
               com piso de 200px pelo mesmo motivo do `minHeight` das outras
               abas — se a percentagem não resolver, o recharts não colapsa. */
            <div className="h-full min-h-[260px] flex flex-col">
              <div className="flex-1 min-h-[200px]">
                <ResponsiveContainer width="100%" height="100%" minHeight={200}>
                  <BarChart data={rfvData} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis
                      dataKey="label"
                      stroke="hsl(var(--muted-foreground))"
                      tick={{ fontSize: 11 }}
                      interval={0}
                    />
                    <YAxis
                      stroke="hsl(var(--muted-foreground))"
                      tick={{ fontSize: 11 }}
                      tickFormatter={(v: number) => (Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}k` : nf(v))}
                    />
                    <Tooltip
                      cursor={{ fill: "hsl(var(--primary) / 0.06)" }}
                      contentStyle={TOOLTIP_STYLE}
                      labelStyle={{ color: "hsl(var(--foreground))" }}
                      itemStyle={{ color: "hsl(var(--foreground))" }}
                      formatter={(v: number) => [nf(v), "Clientes"]}
                    />
                    <Bar
                      dataKey="clientes"
                      name="Clientes"
                      fill="url(#pedidosBarGrad)"
                      radius={[6, 6, 0, 0]}
                      maxBarSize={48}
                      isAnimationActive={false}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              {/* O gradiente vive dentro do BarChart de "Por Dia"; quando aquele
                  gráfico não está montado, o fill some. Um defs próprio resolve. */}
              <svg width="0" height="0" aria-hidden="true">
                <defs>
                  <linearGradient id="pedidosBarGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.95} />
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.55} />
                  </linearGradient>
                </defs>
              </svg>
              <p className="text-[11px] text-muted-foreground pt-2 mt-1 border-t border-border">
                {nf(rfvTotal)} clientes da base inteira, classificados pelo RFV — não segue o
                filtro de período. {RFV_HINT[rfvTab.prefixo]}
              </p>
            </div>
          )
        ) : isLoading || waiting ? (
          <div className="h-full min-h-[260px] flex items-end gap-2 px-1">
            {Array.from({ length: 12 }).map((_, i) => (
              <Skeleton key={i} className="flex-1" style={{ height: `${30 + ((i * 37) % 60)}%` }} />
            ))}
          </div>
        ) : isError ? (
          <div className="h-full min-h-[260px] flex flex-col items-center justify-center gap-3 text-center px-6">
            <AlertTriangle className="w-6 h-6 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">Não foi possível carregar o gráfico.</p>
            <button
              type="button"
              onClick={() => refetch()}
              disabled={isFetching}
              className="text-xs font-semibold text-primary hover:underline disabled:opacity-50"
            >
              {isFetching ? "Tentando…" : "Tentar de novo"}
            </button>
          </div>
        ) : rangeMissing ? (
          <div className="h-full min-h-[260px] flex items-center justify-center text-center px-6">
            <p className="text-sm text-muted-foreground">
              Escolha as datas do período personalizado e toque em Aplicar.
            </p>
          </div>
        ) : empty ? (
          <div className="h-full min-h-[260px] flex items-center justify-center text-center px-6">
            <p className="text-sm text-muted-foreground">
              {emptyByMetric
                ? "Sem receita registrada no período selecionado."
                : "Sem pedidos no período selecionado."}
            </p>
          </div>
        ) : tab === "day" ? (
          <ResponsiveContainer width="100%" height="100%" minHeight={260}>
            <BarChart data={dayData} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
              <defs>
                <linearGradient id="pedidosBarGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.95} />
                  <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.55} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis
                dataKey="label"
                stroke="hsl(var(--muted-foreground))"
                tick={{ fontSize: 11 }}
                minTickGap={12}
                interval="preserveStartEnd"
              />
              <YAxis
                stroke="hsl(var(--muted-foreground))"
                tick={{ fontSize: 11 }}
                // "k" só a partir de mil: num seller pequeno o eixo inteiro
                // virava "0k" com o divisor fixo do original.
                tickFormatter={(v: number) =>
                  metric === "receita" && Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}k` : nf(v)
                }
              />
              <Tooltip
                cursor={{ fill: "hsl(var(--primary) / 0.06)" }}
                contentStyle={TOOLTIP_STYLE}
                labelStyle={{ color: "hsl(var(--foreground))" }}
                itemStyle={{ color: "hsl(var(--foreground))" }}
                formatter={(v: number) => [fmt(v, metric), metric === "receita" ? "Receita" : "Pedidos"]}
              />
              {/* Sem isAnimationActive={false} o recharts não desenha nada quando
                  a aba nasce oculta: o rAF da animação nunca roda. */}
              <Bar
                dataKey={metric}
                name={metric === "receita" ? "Receita" : "Pedidos"}
                fill="url(#pedidosBarGrad)"
                radius={[6, 6, 0, 0]}
                maxBarSize={22}
                isAnimationActive={false}
              />
            </BarChart>
          </ResponsiveContainer>
        ) : tab === "store" || tab === "marketplace" ? (
          <div className="space-y-2.5 pt-2">
            {storeSlice.map((r) => (
              <button
                key={r.bucket}
                type="button"
                onClick={() => onStoreClick?.(r.bucket)}
                disabled={!onStoreClick}
                className={cn(
                  "w-full flex items-center gap-3 text-left -mx-2 px-2 py-1.5 rounded-md transition-colors",
                  onStoreClick && "hover:bg-muted cursor-pointer",
                )}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-2 mb-1.5">
                    <StoreBadge storeKey={r.bucket} />
                    <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">
                      {fmt(r.value, metric)} · {r.pct.toFixed(0)}%
                    </span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${r.pct}%`, background: "hsl(var(--primary))" }}
                    />
                  </div>
                </div>
              </button>
            ))}

            {withPct.length > STORE_PAGE_SIZE && (
              <div className="flex items-center justify-between pt-2 mt-1 border-t border-border">
                <span className="text-[11px] text-muted-foreground tabular-nums">
                  Mostrando {safeStorePage * STORE_PAGE_SIZE + 1}–
                  {Math.min((safeStorePage + 1) * STORE_PAGE_SIZE, withPct.length)} de {withPct.length}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setStorePage((p) => Math.max(0, p - 1))}
                    disabled={safeStorePage === 0}
                    aria-label="Marketplaces anteriores"
                    className="w-7 h-7 inline-flex items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted disabled:opacity-40 transition-colors"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setStorePage((p) => Math.min(storeTotalPages - 1, p + 1))}
                    disabled={safeStorePage >= storeTotalPages - 1}
                    aria-label="Próximos marketplaces"
                    className="w-7 h-7 inline-flex items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted disabled:opacity-40 transition-colors"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="relative w-full h-full min-h-[260px]">
            <ResponsiveContainer width="100%" height="100%" minHeight={260}>
              <PieChart>
                <Pie
                  data={donutData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={60}
                  outerRadius={95}
                  paddingAngle={2}
                  stroke="none"
                  isAnimationActive={false}
                  onClick={(slice: any) => {
                    // `state` é null em "Outros" e em "Sem UF" — só fatias que
                    // correspondem a uma UF de verdade viram filtro.
                    const uf = slice?.state ?? slice?.payload?.state ?? slice?.payload?.payload?.state;
                    if (uf) onStateClick?.(uf);
                  }}
                  className={onStateClick ? "cursor-pointer" : undefined}
                >
                  {donutData.map((d, i) => (
                    <Cell key={d.name} fill={DONUT_PALETTE[i % DONUT_PALETTE.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  labelStyle={{ color: "hsl(var(--foreground))" }}
                  itemStyle={{ color: "hsl(var(--foreground))" }}
                  formatter={(v: number, name: string) => [
                    `${fmt(v, metric)} (${total > 0 ? ((v / total) * 100).toFixed(1) : "0"}%)`,
                    name,
                  ]}
                />
              </PieChart>
            </ResponsiveContainer>

            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Total</span>
              <span className="text-xl font-bold text-foreground font-tabular">{fmt(total, metric)}</span>
            </div>
          </div>
        )}
      </div>

      {/* Legenda do donut fora do SVG: dentro, com 9 fatias, o recharts come a
          altura do gráfico. */}
      {tab === FOURTH_TAB.key && FOURTH_TAB.key === "state" && !isLoading && !waiting && !isError && !notAsked && !empty && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 pt-3 mt-1 border-t border-border">
          {donutData.map((d, i) => (
            <span key={d.name} className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ background: DONUT_PALETTE[i % DONUT_PALETTE.length] }}
              />
              {d.name}
            </span>
          ))}
        </div>
      )}
    </motion.div>
  );
};

export default PedidosChartCard;
