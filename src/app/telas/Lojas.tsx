import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipProps } from "recharts";
import { AlertTriangle, PieChart, ShoppingCart, Store, TrendingUp, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useSellerContext } from "@/contexts/SellerContext";
import { useMarketplaceAliases } from "@/hooks/useMarketplaceAliases";
import { getInitials } from "@/components/clients/sections/shared";
import {
  Bloco,
  BolinhaMarca,
  CabecalhoTela,
  Distribuicao,
  Linha,
  Pilulas,
  Secao,
  Selo,
  ValorPartes,
  pct0,
  pct1,
  textoPequeno,
} from "@/components/mobile/blocos";
import { tamanhoComum } from "@/components/mobile/tamanhoDoValor";
import { useLojaMetrics, type LojaMetricsRow } from "@/components/lojas/lojaDetailQueries";
import { DEFAULT_PERIOD, LOJA_PERIODS, NAO_PLATAFORMA, fmtInt, periodToRange } from "@/components/lojas/lojaDetailShared";
import { getMarketplaceColor } from "@/utils/marketplaceColors";
import { inkPair } from "@/utils/contrastInk";
import { formatCurrency, formatMarketplaceName } from "@/utils/formatters";
import { cn } from "@/lib/utils";
import { LayoutApp } from "@/app/LayoutApp";
import { useResumoDaRede, useSerieDosMarketplaces, type PontoDaSerie } from "@/app/dados/useResumoMarketplaces";

/**
 * Marketplaces: o desenho de celular da tela do site (src/pages/Lojas.tsx).
 * O faturamento de todos os canais com a variação, os outros números em
 * blocos e uma seção por assunto: o ranking (cada linha abre o marketplace),
 * quem compra só numa loja e a receita mês a mês quando o período tem meses.
 */

/** Linha do ranking, já com o que é derivado (ticket, recompra, fatia, série). */
interface Loja extends LojaMetricsRow {
  ticket: number;
  prevTicket: number;
  recompra: number;
  share: number;
  spark: PontoDaSerie[];
  label: string;
  color: string;
  isPlataforma: boolean;
}

type Criterio = "revenue" | "orders" | "clients" | "ticket" | "recompra";

const CRITERIOS: { value: Criterio; label: string }[] = [
  { value: "revenue", label: "Receita" },
  { value: "orders", label: "Pedidos" },
  { value: "clients", label: "Clientes" },
  { value: "ticket", label: "Ticket" },
  { value: "recompra", label: "Recompra" },
];

/**
 * A barra de participação só faz sentido quando somar as lojas dá um total:
 * ticket e recompra são média e taxa.
 */
const CRITERIO_ADITIVO: Record<Criterio, boolean> = {
  revenue: true,
  orders: true,
  clients: true,
  ticket: false,
  recompra: false,
};

const PERIODOS = LOJA_PERIODS.map((p) => ({
  value: p.value as string,
  label: p.value === "365" ? "1 ano" : p.value === "all" ? "Tudo" : p.label,
}));

const ROTULO_PERIODO: Record<string, string> = {
  "7": "últimos 7 dias",
  "30": "últimos 30 dias",
  "90": "últimos 90 dias",
  "365": "últimos 365 dias",
  all: "todo o período",
};

const num = (v: unknown) => Number(v ?? 0) || 0;

/** "1 pedido", "3 pedidos". */
const contar = (n: number, um: string, varios: string) => `${fmtInt(n)} ${n === 1 ? um : varios}`;

function valorDe(l: Loja, c: Criterio): number {
  switch (c) {
    case "orders":
      return l.total_orders;
    case "clients":
      return l.unique_clients;
    case "ticket":
      return l.ticket;
    case "recompra":
      return l.recompra;
    default:
      return l.total_revenue;
  }
}

/** O valor com a unidade escrita: a linha não tem cabeçalho de coluna. */
function valorComUnidade(l: Loja, c: Criterio): string {
  switch (c) {
    case "orders":
      return contar(l.total_orders, "pedido", "pedidos");
    case "clients":
      return contar(l.unique_clients, "cliente", "clientes");
    case "ticket":
      return formatCurrency(l.ticket);
    case "recompra":
      return `${pct1(l.recompra)}%`;
    default:
      return formatCurrency(l.total_revenue);
  }
}

/** Selo do critério contra o período anterior (recompra é taxa: fica sem selo). */
function seloDoCriterio(l: Loja, c: Criterio): ReactNode {
  switch (c) {
    case "orders":
      return <Selo atual={l.total_orders} anterior={l.prev_orders} base={fmtInt(l.prev_orders)} />;
    case "clients":
      return <Selo atual={l.unique_clients} anterior={l.prev_unique_clients} base={fmtInt(l.prev_unique_clients)} />;
    case "ticket":
      return <Selo atual={l.ticket} anterior={l.prevTicket} base={formatCurrency(l.prevTicket)} />;
    case "recompra":
      return textoPequeno("de recompra");
    default:
      return <Selo atual={l.total_revenue} anterior={l.prev_revenue} base={formatCurrency(l.prev_revenue)} />;
  }
}

/**
 * A cor de cada linha do gráfico é um valor JS, que o `dark:` não alcança: a
 * tela precisa saber o tema (a classe `dark` no <html>, como no site).
 */
function useTemaEscuro() {
  const [escuro, setEscuro] = useState(() => document.documentElement.classList.contains("dark"));
  useEffect(() => {
    const el = document.documentElement;
    const obs = new MutationObserver(() => setEscuro(el.classList.contains("dark")));
    obs.observe(el, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);
  return escuro;
}

export default function Lojas() {
  const { activeSeller } = useSellerContext();
  const navigate = useNavigate();
  const sellerId = activeSeller?.id;

  const [period, setPeriod] = useState<string>(DEFAULT_PERIOD);
  const [criterio, setCriterio] = useState<Criterio>("revenue");

  const { getDisplayName, aliases } = useMarketplaceAliases(sellerId);
  const escuro = useTemaEscuro();
  const tinta = (cor: string) => (escuro ? inkPair(cor).dark : inkPair(cor).light);

  // `periodToRange` chama `new Date()`: sem o memo a chave da consulta mudaria
  // a cada render. Mesma função do detalhe, para os dois recortarem a mesma janela.
  const { start, end, bucket } = useMemo(() => periodToRange(period), [period]);
  const tudo = period === "all";

  const resumoQ = useResumoDaRede(sellerId, start, end);
  const metricasQ = useLojaMetrics(sellerId, start, end);
  const serieQ = useSerieDosMarketplaces(sellerId, start, end, bucket);

  const resumo = resumoQ.data ?? null;
  const carregando = resumoQ.isLoading || metricasQ.isLoading;
  const erro = resumoQ.isError || metricasQ.isError;
  const tentando = resumoQ.isFetching || metricasQ.isFetching;
  const receitaTotal = num(resumo?.total_revenue);

  const lojas: Loja[] = useMemo(() => {
    const series = serieQ.data ?? {};
    return (metricasQ.data ?? []).map((r) => ({
      ...r,
      ticket: r.total_orders > 0 ? r.total_revenue / r.total_orders : 0,
      prevTicket: r.prev_orders > 0 ? r.prev_revenue / r.prev_orders : 0,
      recompra: r.unique_clients > 0 ? (r.repeat_clients / r.unique_clients) * 100 : 0,
      share: receitaTotal > 0 ? (r.total_revenue / receitaTotal) * 100 : 0,
      spark: series[r.marketplace] ?? [],
      label: getDisplayName(r.marketplace) ?? formatMarketplaceName(r.marketplace),
      color: getMarketplaceColor(r.marketplace),
      isPlataforma: !NAO_PLATAFORMA.has(r.marketplace),
    }));
    // `aliases` no lugar de `getDisplayName`: o hook devolve uma função nova a
    // cada render; a lista de apelidos é estável.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metricasQ.data, serieQ.data, receitaTotal, aliases]);

  // As origens sem plataforma (`other`, `retroativo`) vão para o fim, mas
  // continuam na lista e na fatia: as linhas têm de somar o total do topo.
  const ordenadas = useMemo(
    () =>
      [...lojas].sort((a, b) =>
        a.isPlataforma !== b.isPlataforma ? (a.isPlataforma ? -1 : 1) : valorDe(b, criterio) - valorDe(a, criterio),
      ),
    [lojas, criterio],
  );

  const plataformas = useMemo(
    () => lojas.filter((l) => l.isPlataforma).sort((a, b) => valorDe(b, criterio) - valorDe(a, criterio)),
    [lojas, criterio],
  );

  const crescimento = useMemo(() => {
    const meses = new Set<string>();
    const porLoja: Record<string, Record<string, number>> = {};
    for (const l of plataformas) {
      porLoja[l.marketplace] = {};
      for (const p of l.spark) {
        const m = p.dia.slice(0, 7);
        meses.add(m);
        porLoja[l.marketplace][m] = (porLoja[l.marketplace][m] ?? 0) + p.receita;
      }
    }
    return Array.from(meses)
      .sort()
      .map((m) => {
        const linha: Record<string, string | number> = { mes: m.slice(5) + "/" + m.slice(2, 4) };
        for (const l of plataformas) linha[l.marketplace] = porLoja[l.marketplace][m] ?? 0;
        return linha;
      });
  }, [plataformas]);

  // O período vai junto: sem ele o detalhe abre em 30 dias e mostra outro
  // faturamento do que a linha que acabou de ser tocada.
  const abrir = (slug: string) => {
    navigate(period !== DEFAULT_PERIOD ? `/lojas/${slug}?periodo=${period}` : `/lojas/${slug}`);
  };

  const receitaAnterior = num(resumo?.prev_revenue);
  const compartilhados = num(resumo?.shared_clients);
  const nomeLider = resumo?.top_marketplace
    ? getDisplayName(resumo.top_marketplace) ?? formatMarketplaceName(resumo.top_marketplace)
    : null;
  const tamanhoLinha1 = tamanhoComum(fmtInt(num(resumo?.total_orders)), formatCurrency(num(resumo?.avg_ticket)));
  const tamanhoLinha2 = tamanhoComum(fmtInt(num(resumo?.unique_clients)), `${pct1(num(resumo?.top_marketplace_share))}%`);

  return (
    <LayoutApp>
      <div className="flex flex-col gap-7 px-4 pb-6 pt-4">
        <div className="flex flex-col gap-3">
          <CabecalhoTela icone={Store} titulo="Marketplaces" />
          <Pilulas rotulo="Período" opcoes={PERIODOS} valor={period} onChange={(v) => setPeriod(v)} />
        </div>

        {erro ? (
          <div className="flex flex-col items-center gap-3 rounded-3xl border border-border/60 bg-card px-6 py-8 text-center">
            <AlertTriangle className="h-6 w-6 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">Não foi possível carregar os marketplaces.</p>
            <Button
              variant="outline"
              size="sm"
              className="rounded-full"
              disabled={tentando}
              onClick={() => {
                resumoQ.refetch();
                metricasQ.refetch();
              }}
            >
              {tentando ? "Tentando…" : "Tentar de novo"}
            </Button>
          </div>
        ) : carregando ? (
          <div className="flex flex-col gap-5">
            <div className="space-y-2">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-10 w-56" />
              <Skeleton className="h-5 w-52" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-[118px] rounded-3xl" />
              ))}
            </div>
            <Skeleton className="h-[280px] rounded-3xl" />
          </div>
        ) : lojas.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-3xl border border-border/60 bg-card px-6 py-10 text-center">
            <Store className="h-9 w-9 text-muted-foreground/40" />
            <p className="text-[15px] font-semibold text-foreground">Nenhum pedido neste período</p>
            <p className="text-sm leading-relaxed text-muted-foreground">
              As lojas aparecem aqui assim que houver pedidos importados.
            </p>
            {!tudo && (
              <Button variant="outline" size="sm" className="mt-2 rounded-full" onClick={() => setPeriod("all")}>
                Ver todo o período
              </Button>
            )}
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-5">
              <section>
                <p className="text-sm font-medium text-muted-foreground">Faturamento · {ROTULO_PERIODO[period] ?? ""}</p>
                <p className="mt-1 text-[38px] font-semibold leading-tight tracking-tight tabular-nums text-foreground">
                  <ValorPartes valor={formatCurrency(receitaTotal)} />
                </p>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                  {tudo ? (
                    <span className="text-sm text-muted-foreground">
                      em {contar(num(resumo?.total_marketplaces), "canal", "canais")}, desde o primeiro pedido
                    </span>
                  ) : receitaAnterior > 0 ? (
                    <>
                      <span
                        className={cn(
                          "text-[15px] font-semibold tabular-nums",
                          receitaTotal >= receitaAnterior ? "text-emerald-600" : "text-rose-600",
                        )}
                      >
                        {receitaTotal >= receitaAnterior ? "+" : "−"}
                        {formatCurrency(Math.abs(receitaTotal - receitaAnterior))}
                      </span>
                      <Selo atual={receitaTotal} anterior={receitaAnterior} base={formatCurrency(receitaAnterior)} />
                      <span className="text-[13px] text-muted-foreground">vs. {period} dias antes</span>
                    </>
                  ) : (
                    <span className="text-sm text-muted-foreground">Sem base no período anterior</span>
                  )}
                </div>
              </section>

              <div className="grid grid-cols-2 gap-2">
                <Bloco
                  tamanho={tamanhoLinha1}
                  icone={ShoppingCart}
                  rotulo="Pedidos"
                  valor={fmtInt(num(resumo?.total_orders))}
                  selo={
                    tudo ? undefined : (
                      <Selo
                        atual={num(resumo?.total_orders)}
                        anterior={num(resumo?.prev_orders)}
                        base={fmtInt(num(resumo?.prev_orders))}
                      />
                    )
                  }
                />
                <Bloco
                  tamanho={tamanhoLinha1}
                  icone={TrendingUp}
                  rotulo="Ticket médio"
                  valor={formatCurrency(num(resumo?.avg_ticket))}
                  selo={
                    tudo ? undefined : (
                      <Selo
                        atual={num(resumo?.avg_ticket)}
                        anterior={num(resumo?.prev_avg_ticket)}
                        base={formatCurrency(num(resumo?.prev_avg_ticket))}
                      />
                    )
                  }
                />
                <Bloco
                  tamanho={tamanhoLinha2}
                  icone={Users}
                  rotulo="Clientes únicos"
                  valor={fmtInt(num(resumo?.unique_clients))}
                  selo={
                    tudo ? undefined : (
                      <Selo
                        atual={num(resumo?.unique_clients)}
                        anterior={num(resumo?.prev_unique_clients)}
                        base={fmtInt(num(resumo?.prev_unique_clients))}
                      />
                    )
                  }
                />
                <Bloco
                  tamanho={tamanhoLinha2}
                  icone={PieChart}
                  rotulo="Concentração"
                  valor={`${pct1(num(resumo?.top_marketplace_share))}%`}
                  apoio={nomeLider ? `em ${nomeLider}` : "sem receita no período"}
                />
              </div>
            </div>

            <Secao
              titulo="Ranking"
              topo={
                <div className="flex flex-col gap-3 pb-2">
                  <Pilulas rotulo="Ordenar por" opcoes={CRITERIOS} valor={criterio} onChange={(v) => setCriterio(v)} />
                  {CRITERIO_ADITIVO[criterio] && (
                    <Distribuicao
                      partes={ordenadas.map((l) => ({ chave: l.marketplace, cor: l.color, valor: valorDe(l, criterio) }))}
                    />
                  )}
                </div>
              }
            >
              {ordenadas.map((l) => (
                <Linha
                  key={l.marketplace}
                  onClick={() => abrir(l.marketplace)}
                  icone={<BolinhaMarca cor={l.color}>{getInitials(l.label)}</BolinhaMarca>}
                  titulo={l.label}
                  apoio={
                    !l.isPlataforma
                      ? `origem sem plataforma · ${pct0(l.share)} da receita`
                      : criterio === "revenue"
                        ? `${contar(l.total_orders, "pedido", "pedidos")} · ${pct0(l.share)}`
                        : `${pct0(l.share)} da receita`
                  }
                  valor={valorComUnidade(l, criterio)}
                  rodape={tudo && criterio !== "recompra" ? undefined : seloDoCriterio(l, criterio)}
                />
              ))}
            </Secao>

            {plataformas.length > 1 && (
              <Secao
                titulo="Clientes exclusivos"
                semLista
                rodape={
                  compartilhados > 0
                    ? `${contar(compartilhados, "cliente comprou", "clientes compraram")} em mais de um marketplace no período`
                    : "Nenhum cliente comprou em mais de um marketplace no período"
                }
              >
                <div className="flex flex-col gap-4 p-4">
                  <p className="text-[13px] leading-snug text-muted-foreground">
                    Quem compra só nesta loja e quem também compra em outra, dentro do período.
                  </p>
                  {plataformas.map((l) => {
                    const ink = inkPair(l.color);
                    const exclusivos = Math.min(l.exclusive_clients, l.unique_clients);
                    const compart = Math.max(0, l.unique_clients - exclusivos);
                    const pctExc = l.unique_clients > 0 ? (exclusivos / l.unique_clients) * 100 : 0;
                    const vars = { "--row-ink": ink.light, "--row-ink-dark": ink.dark } as CSSProperties;
                    return (
                      <div key={l.marketplace} style={vars}>
                        <div className="mb-1.5 flex items-baseline justify-between gap-2">
                          <span className="truncate text-[15px] font-medium text-foreground">{l.label}</span>
                          <span className="shrink-0 text-[13px] font-semibold tabular-nums text-foreground">
                            {pct0(pctExc)} só aqui
                          </span>
                        </div>
                        <div className="flex h-2 w-full gap-[3px] overflow-hidden rounded-full bg-muted">
                          {pctExc > 0 && (
                            <div
                              className="h-full rounded-full bg-[color:var(--row-ink)] dark:bg-[color:var(--row-ink-dark)]"
                              style={{ width: `${pctExc}%` }}
                            />
                          )}
                          {compart > 0 && (
                            <div className="h-full flex-1 rounded-full bg-[color:var(--row-ink)] opacity-30 dark:bg-[color:var(--row-ink-dark)]" />
                          )}
                        </div>
                        <p className="mt-1 text-[12px] tabular-nums text-muted-foreground">
                          {fmtInt(exclusivos)} só aqui · {fmtInt(compart)} também em outra
                        </p>
                      </div>
                    );
                  })}
                </div>
              </Secao>
            )}

            {/* Com 2 meses a "evolução" é um segmento entre dois meses
                quebrados: a seção aparece a partir de 3 (90 dias em diante). */}
            {crescimento.length >= 3 && (
              <Secao
                titulo="Receita mês a mês"
                semLista
                topo={
                  <div className="flex flex-wrap gap-x-3 gap-y-1">
                    {plataformas.map((l) => (
                      <span key={l.marketplace} className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground">
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: tinta(l.color) }} />
                        {l.label}
                      </span>
                    ))}
                  </div>
                }
              >
                <div className="h-[220px] px-2 pb-3 pt-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={crescimento} margin={{ top: 8, right: 12, left: -14, bottom: 0 }}>
                      <XAxis
                        dataKey="mes"
                        tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis
                        tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
                      />
                      <Tooltip
                        cursor={{ stroke: "hsl(var(--border))" }}
                        content={({ active, payload, label }: TooltipProps<number, string>) => {
                          if (!active || !payload?.length) return null;
                          return (
                            <div className="rounded-xl border border-border bg-card px-3 py-2 shadow-lg">
                              <p className="mb-1 text-xs font-semibold text-foreground">{label}</p>
                              {payload.map((p) => (
                                <p key={String(p.dataKey)} className="text-[11px] tabular-nums text-muted-foreground">
                                  {plataformas.find((l) => l.marketplace === p.dataKey)?.label ?? String(p.dataKey)}:{" "}
                                  {formatCurrency(Number(p.value) || 0)}
                                </p>
                              ))}
                            </div>
                          );
                        }}
                      />
                      {plataformas.map((l) => (
                        <Line
                          key={l.marketplace}
                          type="monotone"
                          dataKey={l.marketplace}
                          stroke={tinta(l.color)}
                          strokeWidth={2}
                          dot={{ r: 2 }}
                          isAnimationActive={false}
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </Secao>
            )}
          </>
        )}
      </div>
    </LayoutApp>
  );
}
