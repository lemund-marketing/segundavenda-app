import { useState, useMemo } from "react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as ChartTooltip,
} from "recharts";
import {
  DollarSign, Star, ShoppingBag, MessagesSquare, Target,
  Calendar as CalendarIco, LineChart as LineChartIcon, Mail, Smartphone,
} from "lucide-react";
import WhatsAppIcon from "@/components/WhatsAppIcon";
import { formatCurrency } from "@/utils/formatters";
import { format, subMonths, startOfMonth, differenceInCalendarDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useClientRfv, useClientRfvTimeline, RFV_COLORS } from "@/hooks/useRfv";
import { RfvBadge } from "@/components/rfv/RfvBadge";
import { CardWrap, DAY_NAMES, PERIOD_OPTIONS, hexToRgba } from "./shared";
import { groupOrdersByWindow } from "@/utils/groupOrdersByWindow";

/** Verde da marca — o mesmo lugar que o vermelho ocupa no Segundo Pedido. */
const ACCENT = "#09AF68";

/** Ação recomendada por segmento — espelha public.rfv_segment_meta(). */
const RFV_ACOES: Record<string, string> = {
  "Campeões": "Recompense. Peça indicação e avaliação.",
  "Leais": "Ofereça programa de recorrência e novidades.",
  "Lealdade potencial": "Empurre o próximo pedido com cupom de recompra.",
  "Recentes": "Boas-vindas e segundo pedido com incentivo.",
  "Promissores": "Mostre o catálogo completo e o canal próprio.",
  "Precisam de atenção": "Reative com oferta limitada no tempo.",
  "Prestes a dormir": "Última oferta antes de esfriar de vez.",
  "Em risco": "Prioridade alta: era bom cliente e sumiu.",
  "Não posso perdê-los": "Urgente. Contato humano, não só automação.",
  "Hibernando": "Campanha de win-back agressiva.",
  "Perdidos": "Baixo retorno. Teste barato ou deixe de lado.",
};

/**
 * A mensagem mais recente da lista, procurada pela DATA e não pela posição.
 *
 * As listas chegam de fontes com ordenações opostas (o useClientDetail devolve do
 * mais novo para o mais velho; a thread do Omnichannel, do mais velho para o mais
 * novo, com o realtime empurrando no fim). Ler `[0]` mostrava a PRIMEIRA mensagem
 * da relação como se fosse a última, com meses de diferença.
 */
const maisRecente = (lista: any[]) => {
  let maior: any = null;
  for (const item of lista) {
    if (!item?.created_at) continue;
    if (!maior || new Date(item.created_at).getTime() > new Date(maior.created_at).getTime()) maior = item;
  }
  return maior;
};

interface Props {
  client: any;
  orders: any[];
  messages?: any[];
  wflows?: any[];
  smsMessages?: any[];
  emailLogs?: any[];
  sellerId: string;
  /**
   * Coluna estreita: quebra as grades de 4 colunas em 2 e rareia os rótulos do
   * gráfico. No painel lateral do Omnichannel sobram ~307px DENTRO do bloco
   * (403 de painel − 32 de px-4 − 40 do p-5 do CardWrap − 24 do p-3 do bloco).
   * O sheet de 600px não passa esta prop e continua igual.
   */
  compact?: boolean;
}

export function ClientBehaviorTab({
  client, orders, messages = [], wflows = [], smsMessages = [], emailLogs = [], sellerId,
  compact = false,
}: Props) {
  const [period, setPeriod] = useState<string>("all");
  const grade4 = compact ? "grid grid-cols-2 gap-3" : "grid grid-cols-2 gap-3 sm:grid-cols-4";

  const periodOrders = useMemo(() => {
    if (period === "all") return orders;
    const cutoff = Date.now() - Number(period) * 30 * 24 * 60 * 60 * 1000;
    return orders.filter((o) => new Date(o.acquired_at).getTime() >= cutoff);
  }, [orders, period]);

  const totalOrders = orders.length;

  const behavior = useMemo(() => {
    // Uma COMPRA por grupo (janela de 3 min): sem isso o desdobro do Bling
    // diluía o ticket médio (soma certa / denominador inflado), puxava o
    // "intervalo médio" para perto de zero (gap de ~1 min entre as metades) e
    // contava a mesma compra duas vezes nos histogramas e nos produtos.
    const oo = groupOrdersByWindow(periodOrders).map((g) => ({
      acquired_at: g.acquired_at ?? g.primary.acquired_at,
      total_amount: g.total_amount,
      product: g.primary.product,
      sku: g.primary.sku,
    }));
    const spent = oo.reduce((s, o) => s + Number(o.total_amount || 0), 0);
    const count = oo.length;
    const avg = count > 0 ? spent / count : 0;

    const sortedTs = [...oo].map((o) => new Date(o.acquired_at).getTime()).sort((a, b) => a - b);
    let avgGap: number | null = null, maxGap: number | null = null;
    if (sortedTs.length > 1) {
      const diffs: number[] = [];
      for (let i = 1; i < sortedTs.length; i++) diffs.push((sortedTs[i] - sortedTs[i - 1]) / 86400000);
      avgGap = Math.round(diffs.reduce((a, b) => a + b, 0) / diffs.length);
      maxGap = Math.round(Math.max(...diffs));
    }

    const dow = [0, 0, 0, 0, 0, 0, 0];
    for (const o of oo) dow[new Date(o.acquired_at).getDay()]++;
    const dowMax = Math.max(...dow, 1);
    const topDow = dow.indexOf(Math.max(...dow));

    // Sem tabela de produtos aqui: o nome vem do próprio pedido, agrupado por SKU
    // quando existe (o mesmo item chega com descrição ligeiramente diferente
    // dependendo do marketplace).
    const pmap: Record<string, { name: string; count: number; total: number }> = {};
    for (const o of oo) {
      if (!o.product && !o.sku) continue;
      const key = o.sku || o.product;
      const name = o.product || o.sku || "Produto";
      if (!pmap[key]) pmap[key] = { name, count: 0, total: 0 };
      pmap[key].count++;
      pmap[key].total += Number(o.total_amount || 0);
    }
    const top5 = Object.values(pmap).sort((a, b) => b.count - a.count || b.total - a.total).slice(0, 5);

    const monthsBack = period === "all" ? 12 : Math.min(Number(period), 12);
    const monthsArr: { label: string; key: string; count: number; total: number }[] = [];
    const now = new Date();
    for (let i = monthsBack - 1; i >= 0; i--) {
      const d = startOfMonth(subMonths(now, i));
      monthsArr.push({ label: format(d, "MMM", { locale: ptBR }), key: format(d, "yyyy-MM"), count: 0, total: 0 });
    }
    for (const o of oo) {
      const k = format(new Date(o.acquired_at), "yyyy-MM");
      const m = monthsArr.find((x) => x.key === k);
      if (m) { m.count++; m.total += Number(o.total_amount || 0); }
    }
    return { spent, count, avg, avgGap, maxGap, dow, dowMax, topDow, top5, monthsArr };
  }, [periodOrders, period]);

  const { data: rfv } = useClientRfv(client?.id, sellerId);
  const { data: rfvTimeline } = useClientRfvTimeline(client?.id, sellerId);

  /** A última entrada da linha do tempo é o estado atual do cliente. */
  const rfvCurrent = rfvTimeline?.length ? rfvTimeline[rfvTimeline.length - 1] : null;

  const commStats = useMemo(() => {
    const sent = messages.filter((m: any) => m.direction === "outbound").length;
    const recv = messages.filter((m: any) => m.direction === "inbound").length;
    const last = maisRecente(messages);
    const wflowCount = wflows.length;
    const responseRate = sent > 0 ? Math.round((recv / sent) * 100) : null;

    const smsSent = smsMessages.length;
    const smsDelivered = smsMessages.filter((s: any) => !!s.delivered_at || s.status === "delivered" || s.status === "clicked").length;
    const smsClicked = smsMessages.filter((s: any) => !!s.clicked_at || (s.click_count || 0) > 0).length;
    const smsLast = maisRecente(smsMessages);

    const emailSent = emailLogs.length;
    const emailOpened = emailLogs.filter((e: any) => !!e.opened_at).length;
    const emailClicked = emailLogs.filter((e: any) => !!e.clicked_at).length;
    const emailLast = maisRecente(emailLogs);

    return { sent, recv, last, wflowCount, responseRate, smsSent, smsDelivered, smsClicked, smsLast, emailSent, emailOpened, emailClicked, emailLast };
  }, [messages, wflows, smsMessages, emailLogs]);

  const hasComm = messages.length > 0 || wflows.length > 0 || smsMessages.length > 0 || emailLogs.length > 0;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 bg-muted rounded-md p-1 max-w-full flex-wrap">
        {PERIOD_OPTIONS.map((p) => (
          <button
            key={p.value}
            onClick={() => setPeriod(p.value)}
            className={`px-3 py-1.5 rounded-sm text-[12px] font-semibold transition-colors ${
              period === p.value ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {totalOrders === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
          <ShoppingBag className="h-10 w-10 opacity-30" />
          <p className="text-sm">Nenhum pedido para análise</p>
        </div>
      ) : (
        <>
          {/* RFV — sempre a janela de 12 meses do banco, então ignora o filtro
              de período das pílulas acima. */}
          {rfv?.segment && (() => {
            const segColor = RFV_COLORS[rfv.segment] ?? "#94a3b8";
            // Os parâmetros vêm do próprio snapshot: são exatamente os números
            // que geraram as notas ao lado. Refazer a conta aqui divergiria —
            // o banco fecha o dia em UTC e o retrato é o do último cron.
            const dias = rfv.recency_days ?? null;
            const pedidos = rfv.total_orders ?? null;
            const eixos = [
              { letra: "R", nota: rfv.r, nome: "Recência", param: dias === null ? "—" : dias === 0 ? "hoje" : `há ${dias} dia${dias === 1 ? "" : "s"}` },
              { letra: "F", nota: rfv.f, nome: "Frequência", param: pedidos === null ? "—" : `${pedidos} pedido${pedidos === 1 ? "" : "s"}` },
              { letra: "V", nota: rfv.v, nome: "Valor", param: formatCurrency(Number(rfv.total_spent ?? 0)) },
            ];
            const desde = rfvCurrent?.changed_at ? new Date(rfvCurrent.changed_at) : null;
            const desdeDias = desde ? differenceInCalendarDays(new Date(), desde) : null;
            const veioDe = rfvCurrent?.previous_segment && rfvCurrent.previous_segment !== rfv.segment
              ? rfvCurrent.previous_segment
              : null;

            return (
              <CardWrap icon={<Target className="h-4 w-4" />} title="Análise RFV">
                <div className="flex items-start gap-2.5 flex-wrap">
                  <RfvBadge segment={rfv.segment} />
                  <p className="text-[12px] text-muted-foreground leading-snug flex-1 min-w-[180px]">
                    {RFV_ACOES[rfv.segment] ?? ""}
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-2 sm:gap-3">
                  {eixos.map((e) => (
                    <div key={e.letra} className="rounded-md bg-muted/60 p-2 sm:p-3">
                      <div className="flex items-baseline gap-1">
                        <span className="text-[12px] font-bold" style={{ color: segColor }}>{e.letra}</span>
                        <span className="text-[18px] font-bold tabular-nums leading-none">{e.nota}</span>
                        <span className="text-[10px] text-muted-foreground">/5</span>
                      </div>
                      <p className="text-[10px] text-muted-foreground uppercase font-medium mt-1">{e.nome}</p>
                      <div className="flex gap-1 mt-2">
                        {[1, 2, 3, 4, 5].map((n) => (
                          <span
                            key={n}
                            className="h-1.5 flex-1 rounded-full"
                            style={{ background: n <= e.nota ? segColor : hexToRgba(segColor, 0.18) }}
                          />
                        ))}
                      </div>
                      <p className="text-[11px] font-medium mt-2 tabular-nums truncate">{e.param}</p>
                    </div>
                  ))}
                </div>

                {(desde || veioDe) && (
                  <div className="space-y-1.5 pt-1">
                    {desde && (
                      <p className="text-[11px] text-muted-foreground">
                        Neste segmento desde{" "}
                        <span className="font-medium text-foreground tabular-nums">
                          {format(desde, "dd/MM/yyyy", { locale: ptBR })}
                        </span>
                        {desdeDias !== null && ` (${desdeDias} dia${desdeDias === 1 ? "" : "s"})`}
                      </p>
                    )}
                    {veioDe && (
                      <p className="text-[11px] text-muted-foreground inline-flex items-center gap-1.5">
                        Veio de <RfvBadge segment={veioDe} />
                      </p>
                    )}
                  </div>
                )}
              </CardWrap>
            );
          })()}

          <CardWrap icon={<DollarSign className="h-4 w-4" />} title="Visão Financeira" iconBg="bg-primary/10 text-primary">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <div>
                <p className="text-[11px] text-muted-foreground uppercase font-medium">Gasto Total</p>
                <p className="text-[14px] font-semibold tabular-nums">{formatCurrency(behavior.spent)}</p>
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground uppercase font-medium">Gasto Médio</p>
                <p className="text-[14px] font-semibold tabular-nums">{formatCurrency(behavior.avg)}</p>
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground uppercase font-medium">Cliente desde</p>
                <p className="text-[14px] font-semibold">
                  {client?.created_at ? format(new Date(client.created_at), "dd/MM/yyyy", { locale: ptBR }) : "—"}
                </p>
              </div>
            </div>
          </CardWrap>

          <CardWrap icon={<CalendarIco className="h-4 w-4" />} title="Frequência e Sazonalidade" iconBg="bg-secondary/10 text-secondary">
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-[11px] text-muted-foreground uppercase font-medium">Intervalo médio</p>
                  <p className="font-bold tabular-nums">{behavior.avgGap !== null ? `${behavior.avgGap} dias` : "—"}</p>
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground uppercase font-medium">Maior intervalo</p>
                  <p className="font-bold tabular-nums">{behavior.maxGap !== null ? `${behavior.maxGap} dias` : "—"}</p>
                </div>
              </div>

              <div>
                <p className="text-[11px] text-muted-foreground uppercase font-medium mb-2">Dia da semana</p>
                <div className="space-y-1.5">
                  {DAY_NAMES.map((d, i) => (
                    <div key={d} className="flex items-center gap-2">
                      <span className="text-xs w-8 shrink-0 text-muted-foreground">{d}</span>
                      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{
                          width: `${(behavior.dow[i] / behavior.dowMax) * 100}%`,
                          background: i === behavior.topDow ? ACCENT : hexToRgba(ACCENT, 0.4),
                        }} />
                      </div>
                      <span className="text-xs w-6 text-right tabular-nums">{behavior.dow[i]}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </CardWrap>

          {behavior.top5.length > 0 && (
            <CardWrap icon={<Star className="h-4 w-4" />} title="Produtos Favoritos" iconBg="bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <div className="space-y-2">
                {behavior.top5.map((p, i) => {
                  const pct = behavior.spent > 0 ? Math.round((p.total / behavior.spent) * 100) : 0;
                  return (
                    <div key={p.name + i} className="flex items-center gap-3 text-sm py-1.5">
                      <span className="w-6 h-6 rounded-md bg-muted text-[11px] font-bold inline-flex items-center justify-center shrink-0">#{i + 1}</span>
                      <p className="flex-1 font-semibold truncate">{p.name}</p>
                      <div className="text-right text-[12px] text-muted-foreground tabular-nums whitespace-nowrap">
                        {p.count}× · {formatCurrency(p.total)} · {pct}%
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardWrap>
          )}

          <CardWrap icon={<LineChartIcon className="h-4 w-4" />} title="Histórico de Compras">
            {/* Altura FIXA em px: o card vive numa coluna flex sem altura
                definida, e com altura percentual o ResponsiveContainer colapsa. */}
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={behavior.monthsArr} margin={{ top: 8, right: 4, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="clientHistGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={ACCENT} stopOpacity={0.95} />
                    <stop offset="100%" stopColor={ACCENT} stopOpacity={0.55} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis
                  dataKey="label"
                  stroke="hsl(var(--muted-foreground))"
                  tick={{ fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  // Numa coluna estreita os 12 rótulos de mês viram uma faixa ilegível.
                  interval={compact ? 1 : "preserveEnd"}
                  tickFormatter={(v: string) => v.charAt(0).toUpperCase() + v.slice(1)}
                />
                <YAxis allowDecimals={false} stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <ChartTooltip
                  cursor={{ fill: "rgba(9,175,104,0.06)" }}
                  content={({ active, payload }: any) => {
                    if (!active || !payload?.length) return null;
                    const m = payload[0].payload;
                    return (
                      <div className="rounded-md bg-popover border border-border px-3 py-2 shadow-lg">
                        <p className="text-[12px] font-bold text-foreground capitalize">{m.label}</p>
                        <p className="text-[11px] text-muted-foreground tabular-nums mt-0.5">
                          {m.count} pedido{m.count === 1 ? "" : "s"}
                        </p>
                        <p className="text-[12px] font-semibold text-foreground tabular-nums">{formatCurrency(m.total)}</p>
                      </div>
                    );
                  }}
                />
                {/* isAnimationActive={false}: dentro do sheet o gráfico monta com
                    largura 0 e a animação de entrada não completa — as barras
                    ficam vazias. */}
                <Bar
                  dataKey="count"
                  fill="url(#clientHistGrad)"
                  radius={[6, 6, 0, 0]}
                  maxBarSize={34}
                  isAnimationActive={false}
                />
              </BarChart>
            </ResponsiveContainer>
          </CardWrap>
        </>
      )}

      {/* Fora do ramo "tem pedido": um cliente sem nenhum pedido ainda pode ter
          recebido SMS, e-mail e WhatsApp — a Comunicação não depende de compra. */}
      {hasComm && (
        <CardWrap icon={<MessagesSquare className="h-4 w-4" />} title="Comunicação" iconBg="bg-primary/10 text-primary">
          <div className="space-y-4">
            <div className="rounded-md border border-border/60 p-3">
              <div className="flex items-center gap-2 mb-2">
                <div className="size-7 rounded-lg bg-primary/10 text-primary inline-flex items-center justify-center">
                  <WhatsAppIcon className="h-3.5 w-3.5" />
                </div>
                <p className="text-[13px] font-semibold">WhatsApp</p>
              </div>
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase font-medium">Enviadas</p>
                  <p className="text-[16px] font-bold tabular-nums">{commStats.sent}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase font-medium">Taxa resposta</p>
                  <p className="text-[16px] font-bold tabular-nums">{commStats.responseRate !== null ? `${commStats.responseRate}%` : "—"}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase font-medium">Última</p>
                  <p className="text-[12px] font-medium">{commStats.last ? format(new Date(commStats.last.created_at), "dd/MM/yyyy", { locale: ptBR }) : "—"}</p>
                </div>
              </div>
              {commStats.last?.content && (
                <p className="mt-2 text-xs text-muted-foreground italic line-clamp-2">"{String(commStats.last.content).slice(0, 80)}"</p>
              )}
            </div>

            <div className="rounded-md border border-border/60 p-3">
              <div className="flex items-center gap-2 mb-2">
                {/* Sem o `dark:` o blue-600 sobre o card escuro fica em ~2,4:1 e o ícone some. */}
                <div className="size-7 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 inline-flex items-center justify-center">
                  <Smartphone className="h-3.5 w-3.5" />
                </div>
                <p className="text-[13px] font-semibold">SMS</p>
              </div>
              <div className={`${grade4} text-sm`}>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase font-medium">Enviados</p>
                  <p className="text-[16px] font-bold tabular-nums">{commStats.smsSent}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase font-medium">Entregues</p>
                  <p className="text-[16px] font-bold tabular-nums">{commStats.smsDelivered}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase font-medium">Cliques</p>
                  <p className="text-[16px] font-bold tabular-nums">{commStats.smsClicked}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase font-medium">Último</p>
                  <p className="text-[12px] font-medium">{commStats.smsLast ? format(new Date(commStats.smsLast.created_at), "dd/MM/yyyy", { locale: ptBR }) : "—"}</p>
                </div>
              </div>
            </div>

            <div className="rounded-md border border-border/60 p-3">
              <div className="flex items-center gap-2 mb-2">
                <div className="size-7 rounded-lg bg-secondary/10 text-secondary inline-flex items-center justify-center">
                  <Mail className="h-3.5 w-3.5" />
                </div>
                <p className="text-[13px] font-semibold">E-mail</p>
              </div>
              <div className={`${grade4} text-sm`}>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase font-medium">Enviados</p>
                  <p className="text-[16px] font-bold tabular-nums">{commStats.emailSent}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase font-medium">Abertos</p>
                  <p className="text-[16px] font-bold tabular-nums">{commStats.emailOpened}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase font-medium">Cliques</p>
                  <p className="text-[16px] font-bold tabular-nums">{commStats.emailClicked}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase font-medium">Último</p>
                  <p className="text-[12px] font-medium">{commStats.emailLast ? format(new Date(commStats.emailLast.created_at), "dd/MM/yyyy", { locale: ptBR }) : "—"}</p>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between text-sm pt-1">
              <span className="text-[11px] text-muted-foreground uppercase font-medium">Workflows executados</span>
              <span className="text-[16px] font-bold tabular-nums">{commStats.wflowCount}</span>
            </div>
          </div>
        </CardWrap>
      )}
    </div>
  );
}
