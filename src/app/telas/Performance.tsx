import { useMemo, useState, useSyncExternalStore } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { DateRange } from "react-day-picker";
import {
  AlertTriangle, BarChart3, Calendar, LayoutTemplate, Mail, Repeat, Send, Smartphone, Wallet, WifiOff,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarUI } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import WhatsAppIcon from "@/components/WhatsAppIcon";
import { Aviso, CabecalhoTela, Pilulas } from "@/components/mobile/blocos";
import { KpiPadrao } from "@/components/kpi/KpiPadrao";
import { WorkflowStatsSkeleton } from "@/components/skeletons/WorkflowStatsSkeleton";
import { PerformanceAlerts } from "@/components/workflow-stats/PerformanceAlerts";
import { CompactFunnel } from "@/components/workflow-stats/CompactFunnel";
import { ChannelSummaryCards, type ChannelSummary } from "@/components/workflow-stats/v2/ChannelSummaryCards";
import { WhatsAppKpis } from "@/components/workflow-stats/v2/WhatsAppKpis";
import { WhatsAppChartTabs } from "@/components/workflow-stats/v2/WhatsAppChartTabs";
import { EmailKpis } from "@/components/workflow-stats/v2/EmailKpis";
import { EmailFunnel } from "@/components/workflow-stats/v2/EmailFunnel";
import { EmailChart } from "@/components/workflow-stats/v2/EmailChart";
import { SmsWorkflowTab } from "@/components/workflow-stats/v2/SmsWorkflowTab";
import { TemplatesList, type Template } from "@/components/performance/TemplatesList";
import { TopTemplatesByEngagement } from "@/components/workflow-stats/TopTemplatesByEngagement";
import { TopEmailTemplatesByEngagement } from "@/components/workflow-stats/TopEmailTemplatesByEngagement";
import { useSellerContext } from "@/contexts/SellerContext";
import { usePedidosKpis } from "@/hooks/usePedidosKpis";
import { useEmailPerformance } from "@/hooks/useEmailPerformance";
import {
  usePerformanceStats,
  usePerformanceAlerts,
  useWhatsAppFailures,
  useWhatsAppAvgReadTime,
} from "@/hooks/useWorkflowStatsData";
import { LayoutApp } from "@/app/LayoutApp";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- as RPCs da tela não estão nos tipos gerados do Supabase
type SemTipo = any;
const rpc = (fn: string, args: Record<string, unknown>) => (supabase.rpc as SemTipo)(fn, args);

type TabKey = "overview" | "whatsapp" | "email" | "sms";

/**
 * O valor "custom" (e qualquer lixo vindo da URL) NÃO é numérico: Number("custom")
 * é NaN e `d.setDate(d.getDate() - NaN)` produz um Date inválido, que derruba a
 * tela no `toISOString()` da queryKey. Todo período não-numérico cai em 30 dias.
 */
function periodToDays(p: string): number {
  const n = Number(p);
  return Number.isFinite(n) && n > 0 ? n : 30;
}

/** O que vem na URL não é escolha nossa: aba desconhecida volta para a visão geral. */
const TABS_VALIDAS: TabKey[] = ["overview", "whatsapp", "email", "sms"];

const PERIODOS = [
  { value: "7", label: "7 dias" },
  { value: "30", label: "30 dias" },
  { value: "90", label: "90 dias" },
  { value: "365", label: "1 ano" },
  { value: "custom", label: "Personalizado" },
];
const ABAS: { value: TabKey; label: string }[] = [
  { value: "overview", label: "Visão geral" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "email", label: "Email" },
  { value: "sms", label: "SMS" },
];

/**
 * Sem internet a consulta fica em espera (nem dado, nem erro, nem carregando)
 * e volta sozinha com a conexão. O e-mail é consultado dentro do
 * useEmailPerformance (cópia do site), que não mostra essa espera: aqui se lê o
 * estado da mesma consulta no cache, sem buscar de novo.
 */
function useConsultaEmEspera(queryKey: readonly unknown[]): boolean {
  const cache = useQueryClient().getQueryCache();
  return useSyncExternalStore(
    (avisar) => cache.subscribe(avisar),
    () => {
      const q = cache.find({ queryKey, exact: true });
      return !!q && q.state.status === "pending" && q.state.fetchStatus === "paused";
    },
  );
}

/**
 * Performance: o desenho de celular da página do site
 * (src/pages/WorkflowStats.tsx). Título, período em pílulas (com as datas do
 * personalizado), os canais como abas e, em cada aba, os blocos do site. Mesmas
 * consultas, mesma janela e as mesmas chaves de cache.
 */
export default function Performance() {
  const navigate = useNavigate();
  const { activeSeller } = useSellerContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const period = searchParams.get("period") || "30";
  const tabDaUrl = searchParams.get("tab") as TabKey | null;
  const tab: TabKey = tabDaUrl && TABS_VALIDAS.includes(tabDaUrl) ? tabDaUrl : "overview";
  const [customRange, setCustomRange] = useState<DateRange | undefined>(undefined);
  const [datePickerOpen, setDatePickerOpen] = useState(false);

  const startDate = useMemo(() => {
    if (period === "custom" && customRange?.from) return customRange.from;
    const d = new Date();
    d.setDate(d.getDate() - periodToDays(period));
    return d;
  }, [period, customRange]);
  const endDate = useMemo(() => {
    if (period === "custom" && customRange?.to) {
      return new Date(customRange.to.getTime() + 86400000 - 1);
    }
    return new Date();
  }, [period, customRange]);

  const sellerId = activeSeller?.id;

  const statsQ = usePerformanceStats(sellerId, startDate, endDate);
  const {
    data: stats, isLoading: statsLoading, isError: statsErro, refetch: recarregarStats, isFetching: statsBuscando,
  } = statsQ;
  const { data: alerts = [] } = usePerformanceAlerts(sellerId);
  const { data: failures = [], isLoading: failuresLoading } = useWhatsAppFailures(sellerId, startDate);
  const { data: avgReadTime = null, isLoading: avgLoading } = useWhatsAppAvgReadTime(sellerId, startDate);
  const { data: emailData, loading: emailLoading } = useEmailPerformance({
    sellerId, start: startDate, end: endDate, includeTest: false,
  });
  // A mesma chave que o useEmailPerformance monta.
  const emailEmEspera = useConsultaEmEspera([
    "email-performance", sellerId, startDate.toISOString(), endDate.toISOString(), false,
  ]);

  // SMS da visão geral: a queryKey é a MESMA do SmsWorkflowTab de propósito,
  // as duas partes dividem o cache.
  const smsQ = useQuery({
    queryKey: ["sms-performance-stats", sellerId, startDate.toISOString(), endDate.toISOString()],
    enabled: !!sellerId,
    queryFn: async () => {
      const { data, error } = await rpc("get_sms_performance_stats", {
        _seller_id: sellerId,
        _start: startDate.toISOString(),
        _end: endDate.toISOString(),
      });
      if (error) throw error;
      return data as {
        kpis: { sent: number; delivered: number; failed: number; cost_cents_total: number; unique_clicks?: number };
        daily: Array<{ day: string; sent: number; delivered: number; failed: number; cost_cents: number }>;
      };
    },
  });
  const { data: smsOverview, isLoading: smsLoading } = smsQ;

  const { data: templateCounts } = useQuery({
    queryKey: ["active-template-counts", sellerId],
    enabled: !!sellerId,
    queryFn: async () => {
      const { data, error } = await rpc("get_active_template_counts", { _seller_id: sellerId });
      if (error) throw error;
      return data as { whatsapp: number; email: number; sms: number; total: number };
    },
  });

  // Recompra: a MESMA RPC (get_pedidos_kpis) e o MESMO recorte da tela de
  // Pedidos, sem filtros extras, para os dois números nunca discordarem.
  const { data: pedidosKpis, isLoading: recompraLoading } = usePedidosKpis(
    sellerId,
    startDate.toISOString(),
    endDate.toISOString(),
  );

  // Gasto por canal no período (price_cents = valor cobrado ao cliente; WhatsApp = por conversa/0).
  const { data: channelSummary } = useQuery({
    queryKey: ["seller-channel-summary", sellerId, startDate.toISOString(), endDate.toISOString()],
    enabled: !!sellerId,
    queryFn: async () => {
      const { data, error } = await rpc("admin_seller_channel_summary", {
        _seller_id: sellerId, _start: startDate.toISOString(), _end: endDate.toISOString(),
      });
      if (error) throw error;
      return (data as { channel: string; price_cents: number | string | null }[]) || [];
    },
  });

  const smsKpis = smsOverview?.kpis ?? { sent: 0, delivered: 0, failed: 0, cost_cents_total: 0, unique_clicks: 0 };
  const smsDaily = (smsOverview?.daily ?? []).map((d) => ({ date: d.day, sent: d.sent }));
  const smsDeliveryRate = smsKpis.sent ? (smsKpis.delivered / smsKpis.sent) * 100 : 0;
  const smsClickRate = smsKpis.delivered ? ((smsKpis.unique_clicks ?? 0) / smsKpis.delivered) * 100 : 0;

  const s = stats ?? {
    sent: 0, delivered: 0, read: 0, replied: 0, repliedPeople: 0, deliveredPeople: 0, failed: 0,
    templates: [], daily: [], hourly: [],
  };
  const ready = !statsLoading;

  const setTab = (next: TabKey) => {
    const params = new URLSearchParams(searchParams);
    params.set("tab", next);
    setSearchParams(params, { replace: true });
  };
  const setPeriod = (next: string) => {
    const params = new URLSearchParams(searchParams);
    params.set("period", next);
    setSearchParams(params, { replace: true });
  };

  const deliveryRate = s.sent ? Math.round((s.delivered / s.sent) * 100) : 0;
  const readRate = s.delivered ? Math.round((s.read / s.delivered) * 100) : 0;

  const emailTotals = emailData?.totals;
  const emailSent = emailTotals?.sent || 0;
  const emailDelivered = emailTotals?.delivered || 0;
  const emailOpened = emailTotals?.opened || 0;
  const emailDeliveryRate = emailSent ? (emailDelivered / emailSent) * 100 : 0;
  const emailOpenRate = emailDelivered ? (emailOpened / emailDelivered) * 100 : 0;
  const emailFailed = emailTotals?.failed || 0;

  const brl = (cents: number) => ((cents || 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const tpl = templateCounts ?? { whatsapp: 0, email: 0, sms: 0, total: 0 };
  const totalSent = s.sent + emailSent + smsKpis.sent;
  const gastoCents = (channelSummary ?? [])
    .filter((r) => r.channel === "sms" || r.channel === "email")
    .reduce((acc, r) => acc + (Number(r.price_cents) || 0), 0);
  const pct1 = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  const periodoLegivel = `${format(startDate, "dd 'de' MMM yyyy", { locale: ptBR })} → ${format(endDate, "dd 'de' MMM yyyy", { locale: ptBR })}`;

  // Cada aba segura o esqueleto pela consulta de que depende. A de SMS fica
  // de fora: as consultas dela moram no SmsWorkflowTab, que tem o próprio
  // esqueleto (e assim as auxiliares partem junto com a principal).
  const carregandoAba = tab === "email" ? emailLoading : tab === "sms" ? false : statsLoading;
  const semInternet =
    tab === "email"
      ? emailEmEspera
      : tab === "sms"
        ? smsQ.isPending && smsQ.isPaused
        : statsQ.isPending && statsQ.isPaused;

  const channelBlocks: ChannelSummary[] = [
    {
      key: "whatsapp",
      title: "WhatsApp",
      icon: WhatsAppIcon,
      iconColor: "text-primary",
      iconBg: "bg-primary/10",
      sparkColor: "hsl(var(--chart-1))",
      active: s.sent > 0,
      daily: s.daily.map((d) => Number(d.sent || 0)),
      // Com erro, "—" e não "0": zero é um número, e aqui ele seria mentira.
      kpis: statsErro ? [
        { label: "Enviadas", value: "—" },
        { label: "Entrega", value: "—" },
        { label: "Leitura", value: "—" },
      ] : [
        { label: "Enviadas", value: s.sent.toLocaleString("pt-BR") },
        { label: "Entrega", value: `${deliveryRate}%` },
        { label: "Leitura", value: `${readRate}%` },
      ],
      footer: statsErro
        ? "Não foi possível carregar os números do WhatsApp"
        : `${tpl.whatsapp} templates ativos · ${s.failed.toLocaleString("pt-BR")} não entregues`,
    },
    {
      key: "email",
      title: "Email",
      icon: Mail,
      iconColor: "text-brand-blue",
      iconBg: "bg-brand-blue/10",
      sparkColor: "hsl(var(--chart-4))",
      active: emailSent > 0,
      daily: (emailData?.daily || []).map((d) => Number(d.sent || 0)),
      kpis: [
        { label: "Enviados", value: emailSent.toLocaleString("pt-BR") },
        { label: "Entrega", value: `${Math.round(emailDeliveryRate)}%` },
        { label: "Abertura", value: `${Math.round(emailOpenRate)}%` },
      ],
      footer: `${tpl.email} templates ativos · ${emailFailed.toLocaleString("pt-BR")} não entregues`,
    },
    {
      key: "sms",
      title: "SMS",
      icon: Smartphone,
      iconColor: "text-secondary",
      iconBg: "bg-secondary/10",
      sparkColor: "hsl(var(--chart-2))",
      active: smsKpis.sent > 0,
      daily: smsDaily.map((d) => Number(d.sent || 0)),
      kpis: [
        { label: "Enviados", value: smsKpis.sent.toLocaleString("pt-BR") },
        { label: "Entrega", value: `${Math.round(smsDeliveryRate)}%` },
        { label: "Clique", value: `${Math.round(smsClickRate)}%` },
      ],
      footer: `${tpl.sms} templates ativos · ${smsKpis.failed.toLocaleString("pt-BR")} não entregues`,
    },
  ];

  return (
    <LayoutApp>
      <div className="flex flex-col gap-3 px-4 pt-4">
        <CabecalhoTela icone={BarChart3} titulo="Performance" />
        <Pilulas rotulo="Período" opcoes={PERIODOS} valor={period} onChange={setPeriod} />
        {period === "custom" && (
          <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-10 w-full justify-start rounded-full border-border/60 bg-card px-4 text-[13px]"
              >
                <Calendar className="mr-1.5 h-3.5 w-3.5" />
                {customRange?.from
                  ? `${format(customRange.from, "dd/MM", { locale: ptBR })}${customRange.to ? ` - ${format(customRange.to, "dd/MM", { locale: ptBR })}` : ""}`
                  : "Escolher as datas"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <CalendarUI
                mode="range"
                selected={customRange}
                onSelect={(range) => {
                  setCustomRange(range);
                  if (range?.from && range?.to) setDatePickerOpen(false);
                }}
                numberOfMonths={1}
                locale={ptBR}
                className="pointer-events-auto p-3"
              />
            </PopoverContent>
          </Popover>
        )}
        <p className="text-[12px] text-muted-foreground">{periodoLegivel}</p>
        {/* Os canais como abas: no celular substituem o "Voltar para visão geral". */}
        <div className="-mx-4 flex gap-2 overflow-x-auto border-t border-border/60 px-4 pt-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {ABAS.map((a) => (
            <button
              key={a.value}
              type="button"
              onClick={() => setTab(a.value)}
              aria-pressed={tab === a.value}
              className={
                tab === a.value
                  ? "h-9 shrink-0 rounded-full bg-primary/10 px-4 text-sm font-semibold text-primary"
                  : "h-9 shrink-0 rounded-full border border-border/60 bg-card px-4 text-sm font-semibold text-muted-foreground active:bg-muted"
              }
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>

      <div className="w-full space-y-4 p-4">
        <PerformanceAlerts alerts={alerts} sellerId={sellerId} />

        {semInternet ? (
          <Aviso tom="neutro" icone={WifiOff} titulo="Sem internet">
            Os números aparecem assim que a conexão voltar.
          </Aviso>
        ) : carregandoAba ? (
          <WorkflowStatsSkeleton aba={tab} />
        ) : (
          <>
            {tab === "overview" && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <KpiPadrao
                    titulo="Mensagens enviadas"
                    valor={totalSent.toLocaleString("pt-BR")}
                    apoio="WhatsApp + Email + SMS no período"
                    icone={Send}
                    loading={!ready}
                    tooltip="Soma dos disparos de WhatsApp, Email e SMS feitos no período, contando cada mensagem uma vez. Entregas e falhas aparecem no detalhe de cada canal."
                  />
                  <KpiPadrao
                    titulo="Templates ativos"
                    valor={tpl.total.toLocaleString("pt-BR")}
                    apoio={`${tpl.whatsapp} WhatsApp · ${tpl.email} Email · ${tpl.sms} SMS`}
                    icone={LayoutTemplate}
                    tooltip="Templates prontos para disparo hoje: os de WhatsApp aprovados pela Meta e os de Email e SMS marcados como ativos. Esta contagem não depende do período selecionado."
                  />
                  <KpiPadrao
                    titulo="Gasto no período"
                    valor={brl(gastoCents)}
                    apoio="SMS + Email (WhatsApp é cobrado por conversa)"
                    icone={Wallet}
                    loading={!ready}
                    tooltip="Valor estimado dos disparos de SMS e Email no período. O WhatsApp é cobrado por conversa pela Meta e aparece por categoria no detalhe do canal."
                  />
                  <KpiPadrao
                    titulo="Recompra"
                    valor={`${pct1(pedidosKpis?.repurchase_rate ?? 0)}%`}
                    apoio={`${(pedidosKpis?.repeat_clients ?? 0).toLocaleString("pt-BR")} de ${(pedidosKpis?.period_clients ?? 0).toLocaleString("pt-BR")} clientes do período`}
                    icone={Repeat}
                    loading={recompraLoading}
                    tooltip="Dos clientes que compraram no período, a parcela que já era cliente antes — o primeiro pedido deles é anterior à janela selecionada. Pedidos cancelados ficam de fora. É o mesmo número da Taxa de Recompra da tela de Pedidos."
                  />
                </div>

                <div className="space-y-3">
                  <h2 className="text-sm font-semibold text-muted-foreground">Desempenho por canal</h2>
                  <ChannelSummaryCards
                    channels={channelBlocks}
                    onSelect={setTab}
                    loading={!ready || smsLoading || emailLoading}
                  />
                </div>
              </div>
            )}

            {tab === "whatsapp" && statsErro && (
              <div className="flex flex-col items-center gap-3 rounded-2xl bg-card p-6 text-center shadow-sm">
                <AlertTriangle className="h-6 w-6 text-amber-600" />
                <div>
                  <p className="font-medium">Não foi possível carregar os números do WhatsApp</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    A consulta demorou mais que o limite. Os disparos existem — tente de novo ou escolha um período menor.
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={() => recarregarStats()} disabled={statsBuscando}>
                  {statsBuscando ? "Carregando…" : "Tentar de novo"}
                </Button>
              </div>
            )}

            {tab === "whatsapp" && !statsErro && (
              <div className="space-y-4">
                <WhatsAppKpis
                  sent={s.sent}
                  delivered={s.delivered}
                  read={s.read}
                  replied={s.replied}
                  repliedPeople={s.repliedPeople}
                  deliveredPeople={s.deliveredPeople}
                  failed={s.failed}
                  avgReadTimeMin={avgReadTime}
                  loading={!ready || avgLoading}
                />
                <CompactFunnel
                  sent={s.sent}
                  delivered={s.delivered}
                  read={s.read}
                  replied={s.replied}
                  failed={s.failed}
                  loading={!ready}
                />
                <WhatsAppChartTabs
                  daily={s.daily}
                  hourly={s.hourly}
                  failures={failures}
                  loading={!ready || failuresLoading}
                />
                <TopTemplatesByEngagement templates={s.templates} loading={!ready} />
                <TemplatesList
                  templates={s.templates as Template[]}
                  channel="whatsapp"
                  isLoading={!ready}
                  onTemplateClick={(t) => navigate(`/workflow-stats/template/${encodeURIComponent(t.name)}`)}
                />
              </div>
            )}

            {tab === "email" && (
              <div className="space-y-4">
                <EmailKpis
                  sent={emailSent}
                  delivered={emailDelivered}
                  opened={emailOpened}
                  clicked={emailTotals?.clicked || 0}
                  bounced={emailTotals?.bounced || 0}
                  failed={emailTotals?.failed || 0}
                  loading={emailLoading}
                />
                <EmailFunnel
                  sent={emailSent}
                  delivered={emailDelivered}
                  opened={emailOpened}
                  clicked={emailTotals?.clicked || 0}
                  loading={emailLoading}
                />
                <EmailChart daily={emailData?.daily || []} loading={emailLoading} />
                <TopEmailTemplatesByEngagement templates={emailData?.templates || []} loading={emailLoading} />
                <TemplatesList
                  templates={(emailData?.templates || []).map((t) => ({
                    id: t.template_id ?? undefined,
                    name: t.name,
                    category: t.category,
                    sent: t.sent,
                    delivered: t.delivered,
                    opened: t.opened,
                    clicked: t.clicked,
                    bounced: t.bounced,
                    complained: t.complained,
                    failed: t.failed,
                  }))}
                  channel="email"
                  isLoading={emailLoading}
                  onTemplateClick={(t) => {
                    if (t.id) navigate(`/workflow-stats/email-template/${t.id}`);
                  }}
                />
              </div>
            )}

            {tab === "sms" && <SmsWorkflowTab sellerId={sellerId} startDate={startDate} endDate={endDate} />}
          </>
        )}
      </div>
    </LayoutApp>
  );
}
