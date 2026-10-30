import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertCircle, ArrowLeft, Calendar as CalIcon, CheckCircle2, ChevronLeft, ChevronRight, Download,
  Eye as EyeIcon, FlaskConical, Link2, Mail, MailCheck, MousePointerClick, Search, Send, Users, WifiOff, XCircle,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useSellerContext } from "@/contexts/SellerContext";
import { useEmailPerformance } from "@/hooks/useEmailPerformance";
import { checkAdminAccess } from "@/utils/security";
import { formatCurrency } from "@/utils/formatters";
import { calculateEmailTemplateHealth } from "@/utils/emailTemplateHealth";
import { Aviso } from "@/components/mobile/blocos";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MetricTooltip } from "@/components/ui/metric-tooltip";
import { DailyEvolutionChart, type DailyPoint } from "@/components/workflow-stats/DailyEvolutionChart";
import { AvgTimeKpi } from "@/components/workflow-stats/AvgTimeKpi";
import { ReadHeatmap } from "@/components/workflow-stats/ReadHeatmap";
import { ConversionFunnel } from "@/components/performance/ConversionFunnel";
import { TopFailureReasons } from "@/components/performance/TopFailureReasons";
import { DeltaCanalPill } from "@/components/performance/DeltaCanalPill";
import { KpiPadrao } from "@/components/kpi/KpiPadrao";
import { ClientDetailSheet } from "@/components/crm/ClientDetailSheet";
import { LayoutApp } from "@/app/LayoutApp";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- a RPC e a tabela de templates de e-mail não estão nos tipos gerados do Supabase
type SemTipo = any;

const PERIOD_OPTIONS = [
  { value: "7", label: "Últimos 7 dias" },
  { value: "30", label: "Últimos 30 dias" },
  { value: "90", label: "Últimos 90 dias" },
  { value: "365", label: "Últimos 365 dias" },
];

const KPI_TOOLTIPS = {
  Enviadas: "Emails enviados no período (status ≠ suppressed). Inclui pendentes, entregues, abertos, clicados, bounces e não entregues.",
  Entrega: "Entregues / Enviados. Emails que o provedor do destinatário aceitou (delivered_at preenchido).",
  Abertura: "Aberturas / Entregues. Considera destinatários únicos que abriram o email.",
  Clique: "Cliques (CTR) / Entregues. Destinatários únicos que clicaram em algum link.",
  Falha: "(Não entregues + Bounces) / Enviados. Denominador é o total de tentativas (Enviados) — bounces são e-mails devolvidos, que degradam a reputação do domínio.",
  Conversao: "Destinatários que fizeram um pedido válido (exclui cancelados/reembolsados) em até 7 dias após o envio.",
};

const PAGE_SIZE = 25;

/** `period` vem da URL e pode chegar não-numérico: cai em 30 dias (ver Performance). */
function periodToDays(p: string): number {
  const n = Number(p);
  return Number.isFinite(n) && n > 0 ? n : 30;
}

type RecStatus = "sent" | "delivered" | "opened" | "clicked" | "bounced" | "complained" | "failed" | "suppressed";

const STATUS_LABEL: Record<RecStatus, string> = {
  sent: "Enviada", delivered: "Entregue", opened: "Aberta", clicked: "Clicou",
  bounced: "Bounce", complained: "Spam", failed: "Não entregue", suppressed: "Suprimida",
};
const STATUS_STYLE: Record<RecStatus, string> = {
  sent: "bg-muted text-muted-foreground",
  delivered: "bg-success/10 text-success",
  opened: "bg-success/10 text-success",
  clicked: "bg-primary/10 text-primary",
  bounced: "bg-muted text-muted-foreground",
  complained: "bg-warning/10 text-warning",
  failed: "bg-muted text-muted-foreground",
  suppressed: "bg-muted text-muted-foreground",
};

interface Kpis {
  sent: number; delivered: number; opened: number; clicked: number;
  bounced: number; complained: number; failed: number; suppressed: number;
  unique_recipients: number; converted_clients: number; revenue: number;
  avg_time_to_open_seconds: number; median_time_to_open_seconds: number;
}
const ZERO_KPIS: Kpis = {
  sent: 0, delivered: 0, opened: 0, clicked: 0,
  bounced: 0, complained: 0, failed: 0, suppressed: 0,
  unique_recipients: 0, converted_clients: 0, revenue: 0,
  avg_time_to_open_seconds: 0, median_time_to_open_seconds: 0,
};

interface Recipient {
  log_id: string;
  client_id: string | null;
  client_name: string | null;
  to_email: string;
  sent_at: string;
  status: RecStatus;
  converted: boolean;
  failed_reason: string | null;
  opened_at: string | null;
  clicked_at: string | null;
}

interface FailureReason { reason: string; count: number }
interface TopLink { url: string; clicks: number }
interface HeatmapCell { dow: number; hour: number; sent: number; opened: number }

interface RpcOut {
  kpis: Kpis;
  daily: Array<{ date: string; sent: number; delivered: number; opened: number; clicked: number }>;
  heatmap: HeatmapCell[];
  failure_reasons: FailureReason[];
  top_links: TopLink[];
  top_clients: Array<{ client_id: string; full_name: string; email: string | null; orders_count: number; revenue: number }>;
  recipients: Recipient[];
}
const ZERO_RPC: RpcOut = {
  kpis: ZERO_KPIS, daily: [], heatmap: [], failure_reasons: [],
  top_links: [], top_clients: [], recipients: [],
};

interface TemplateMeta {
  id: string;
  display_name: string | null;
  name: string | null;
  category: string | null;
}

/**
 * Um template de e-mail por dentro: a página do site
 * (src/pages/EmailTemplatePerformance.tsx) no tamanho de celular. Mesmas
 * consultas; aqui elas passam pelo react-query, para a tela esperar a conexão
 * ("Sem internet") em vez de mostrar zeros.
 */
export default function PerformanceModeloEmail() {
  const { templateId = "" } = useParams();
  const navigate = useNavigate();
  const { activeSeller } = useSellerContext();
  const [searchParams, setSearchParams] = useSearchParams();

  const period = searchParams.get("period") || "30";
  const setPeriod = (v: string) => {
    searchParams.set("period", v);
    setSearchParams(searchParams, { replace: true });
  };

  const [isAdmin, setIsAdmin] = useState(false);
  const [includeTest, setIncludeTest] = useState(false);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [convertedFilter, setConvertedFilter] = useState<string>("all");
  const [page, setPage] = useState(1);

  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [clientSheetOpen, setClientSheetOpen] = useState(false);

  useEffect(() => { checkAdminAccess().then(setIsAdmin); }, []);

  const startDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - periodToDays(period));
    return d;
  }, [period]);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- o fim da janela anda junto com o período
  const endDate = useMemo(() => new Date(), [period]);

  // Totais do seller no mesmo período (para as pílulas de comparação nos KPIs).
  const { data: emailAgg } = useEmailPerformance({
    sellerId: activeSeller?.id,
    start: startDate,
    end: endDate,
    includeTest,
  });

  // Metadados do template (display_name, categoria)
  const metaQ = useQuery({
    queryKey: ["email-template-meta", activeSeller?.id, templateId],
    enabled: !!activeSeller && !!templateId,
    queryFn: async (): Promise<TemplateMeta | null> => {
      const { data, error } = await (supabase as SemTipo)
        .from("email_templates")
        .select("id, display_name, name, category")
        .eq("id", templateId)
        .maybeSingle();
      if (error || !data) return null;
      return data as TemplateMeta;
    },
  });
  const tpl = metaQ.data ?? null;
  const tplNotFound = metaQ.isSuccess && !metaQ.data;

  const perfQ = useQuery({
    queryKey: ["email-template-performance", activeSeller?.id, templateId, period, includeTest],
    enabled: !!activeSeller && !!templateId,
    queryFn: async (): Promise<RpcOut> => {
      const { data, error } = await (supabase.rpc as SemTipo)("get_email_template_performance", {
        _seller_id: activeSeller!.id,
        _template_id: templateId,
        _start: startDate.toISOString(),
        _end: endDate.toISOString(),
        _include_test: includeTest,
      });
      if (error) throw error;
      const r: SemTipo = data || {};
      return {
        kpis: { ...ZERO_KPIS, ...(r.kpis || {}) },
        daily: r.daily || [],
        heatmap: r.heatmap || [],
        failure_reasons: r.failure_reasons || [],
        top_links: r.top_links || [],
        top_clients: r.top_clients || [],
        recipients: r.recipients || [],
      };
    },
  });
  const rpc = perfQ.data ?? ZERO_RPC;
  const semInternet = perfQ.isPending && perfQ.isPaused;
  // Sem internet a consulta espera a conexão: os blocos ficam no esqueleto, não em zero.
  const loading = perfQ.isPending && perfQ.fetchStatus !== "idle";

  useEffect(() => {
    if (!perfQ.isError) return;
    const e = perfQ.error as { message?: string } | null;
    console.error("[EmailTemplatePerformance]", e);
    toast.error("Não foi possível carregar as métricas do template", {
      description: e?.message || "Tente novamente em instantes.",
    });
  }, [perfQ.isError, perfQ.error]);

  const k = rpc.kpis;

  // ---- Taxas (todas protegidas contra divisão por zero) ----
  const deliveryRate = k.sent ? (k.delivered / k.sent) * 100 : 0;
  const openRate = k.delivered ? (k.opened / k.delivered) * 100 : 0;
  // CTR: cliques / entregas — mais estável que cliques/aberturas.
  const clickRate = k.delivered ? (k.clicked / k.delivered) * 100 : 0;
  // Denominador SENT (total de tentativas). Bounces contam como falha.
  const failureRate = k.sent ? ((k.failed + k.bounced) / k.sent) * 100 : 0;
  const conversionRate = k.unique_recipients ? (k.converted_clients / k.unique_recipients) * 100 : 0;

  // Médias do seller (totals de get_email_performance_stats)
  const t = emailAgg?.totals;
  const chDeliveryAvg = t?.sent ? (t.delivered / t.sent) * 100 : undefined;
  const chOpenAvg = t?.delivered ? (t.opened / t.delivered) * 100 : undefined;
  const chClickAvg = t?.delivered ? (t.clicked / t.delivered) * 100 : undefined;
  const chFailAvg = t?.sent ? ((t.failed + t.bounced) / t.sent) * 100 : undefined;

  const health = calculateEmailTemplateHealth({
    sent: k.sent, delivered: k.delivered, opened: k.opened,
    bounced: k.bounced, complained: k.complained,
  });

  // Diário no formato do DailyEvolutionChart (read = opened, replied = clicked)
  const dailyPoints: DailyPoint[] = useMemo(
    () => rpc.daily.map((d) => ({
      date: d.date, sent: d.sent, delivered: d.delivered,
      read: d.opened, replied: d.clicked,
    })),
    [rpc.daily],
  );

  // Heatmap no formato reutilizado (sent/read): opened → read
  const heatmapCells = useMemo(
    () => rpc.heatmap.map((c) => ({ dow: c.dow, hour: c.hour, sent: c.sent, read: c.opened })),
    [rpc.heatmap],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rpc.recipients.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (convertedFilter === "yes" && !r.converted) return false;
      if (convertedFilter === "no" && r.converted) return false;
      if (q) {
        const hay = `${r.client_name ?? ""} ${r.to_email}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rpc.recipients, search, statusFilter, convertedFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  useEffect(() => { setPage(1); }, [search, statusFilter, convertedFilter, period]);

  const exportCsv = () => {
    const rows = [
      ["Cliente", "Email", "Enviada em", "Status", "Motivo da não entrega", "Converteu em 7d"],
      ...filtered.map((r) => [
        r.client_name || "",
        r.to_email,
        new Date(r.sent_at).toLocaleString("pt-BR"),
        STATUS_LABEL[r.status] ?? r.status,
        r.failed_reason ?? "",
        r.converted ? "Sim" : "Não",
      ]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(tpl?.display_name || tpl?.name || "template")}-destinatarios.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const humanTitle = tpl?.display_name || tpl?.name || (tplNotFound ? "Template não encontrado" : "Template de email");

  return (
    <LayoutApp>
      <div className="space-y-5 px-4 pb-6 pt-4">
        <button
          onClick={() => {
            if (((window.history.state as { idx?: number } | null)?.idx ?? 0) > 0) navigate(-1);
            else navigate("/workflow-stats?tab=email");
          }}
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground transition hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Voltar
        </button>

        <Card className="rounded-2xl border-0 bg-card shadow-sm">
          <CardContent className="p-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex min-w-0 flex-1 items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-blue/10">
                  <Mail className="h-6 w-6 text-brand-blue" strokeWidth={2} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="break-words text-[21px] font-bold leading-tight tracking-tight text-foreground">
                      {humanTitle}
                    </h1>
                    {!tplNotFound && !semInternet && (
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${health.pillClass}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${health.dotClass}`} />
                        {health.label}
                      </span>
                    )}
                    {includeTest && isAdmin && (
                      <Badge variant="outline" className="gap-1 border-warning/40 bg-warning/5 text-warning">
                        <FlaskConical className="h-3 w-3" /> Modo debug
                      </Badge>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Email{tpl?.category ? ` · ${tpl.category}` : ""}
                  </p>
                  {tpl?.name && (
                    <p className="mt-1 break-all font-mono text-xs text-muted-foreground/70" title="Identificador técnico">
                      {tpl.name}
                    </p>
                  )}
                </div>
              </div>

              {/* O período desce para uma linha própria, na largura toda, em vez
                  de espremer o título ao lado. */}
              <div className="flex w-full shrink-0 items-center gap-2 self-start">
                <CalIcon className="h-4 w-4 text-muted-foreground" />
                <Select value={period} onValueChange={setPeriod}>
                  <SelectTrigger className="h-10 w-auto flex-1 rounded-xl text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PERIOD_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {isAdmin && (
          <div className="flex max-w-md items-center justify-between rounded-xl border border-warning/30 bg-warning/5 px-4 py-2.5">
            <div className="flex items-center gap-2">
              <FlaskConical className="h-4 w-4 text-warning" />
              <Label htmlFor="include-test-detail" className="cursor-pointer text-sm font-medium text-foreground">
                Incluir dados de teste (admin)
              </Label>
            </div>
            <Switch id="include-test-detail" checked={includeTest} onCheckedChange={setIncludeTest} />
          </div>
        )}

        {semInternet ? (
          <Aviso tom="neutro" icone={WifiOff} titulo="Sem internet">
            Os números aparecem assim que a conexão voltar.
          </Aviso>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <KpiPadrao
                titulo="Enviadas"
                valor={k.sent.toLocaleString("pt-BR")}
                icone={Send}
                loading={loading}
                tooltip={KPI_TOOLTIPS.Enviadas}
              />
              <KpiPadrao
                titulo="Taxa de Entrega"
                valor={`${deliveryRate.toFixed(1)}%`}
                apoio={`${k.delivered.toLocaleString("pt-BR")} de ${k.sent.toLocaleString("pt-BR")}`}
                icone={MailCheck}
                loading={loading}
                tooltip={KPI_TOOLTIPS.Entrega}
              >
                {!loading && <DeltaCanalPill pct={deliveryRate} mediaPct={chDeliveryAvg} />}
              </KpiPadrao>
              <KpiPadrao
                titulo="Taxa de Abertura"
                valor={`${openRate.toFixed(1)}%`}
                apoio={`${k.opened.toLocaleString("pt-BR")} abertos`}
                icone={EyeIcon}
                loading={loading}
                tooltip={KPI_TOOLTIPS.Abertura}
              >
                {!loading && <DeltaCanalPill pct={openRate} mediaPct={chOpenAvg} />}
              </KpiPadrao>
              <KpiPadrao
                titulo="Taxa de Clique"
                valor={`${clickRate.toFixed(1)}%`}
                apoio={`${k.clicked.toLocaleString("pt-BR")} cliques`}
                icone={MousePointerClick}
                loading={loading}
                tooltip={KPI_TOOLTIPS.Clique}
              >
                {!loading && <DeltaCanalPill pct={clickRate} mediaPct={chClickAvg} />}
              </KpiPadrao>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <KpiPadrao
                titulo="Taxa de não entrega"
                valor={`${failureRate.toFixed(1)}%`}
                apoio={`${(k.failed + k.bounced).toLocaleString("pt-BR")} de ${k.sent.toLocaleString("pt-BR")} envios`}
                icone={AlertCircle}
                loading={loading}
                tooltip={KPI_TOOLTIPS.Falha}
              >
                {!loading && <DeltaCanalPill pct={failureRate} mediaPct={chFailAvg} inverso />}
              </KpiPadrao>
              <KpiPadrao
                titulo="Compraram em 7 dias"
                valor={`${k.converted_clients.toLocaleString("pt-BR")} de ${k.unique_recipients.toLocaleString("pt-BR")}`}
                apoio={loading ? undefined : `${conversionRate.toFixed(1)}% de conversão · ${formatCurrency(k.revenue)} em receita`}
                icone={Users}
                destaque
                loading={loading}
                tooltip={KPI_TOOLTIPS.Conversao}
              />
            </div>

            <Tabs defaultValue="overview" className="space-y-4">
              <TabsList className="w-full rounded-xl bg-muted/50">
                <TabsTrigger value="overview" className="flex-1 rounded-lg">Visão geral</TabsTrigger>
                <TabsTrigger value="recipients" className="flex-1 rounded-lg">Destinatários</TabsTrigger>
                <TabsTrigger value="insights" className="flex-1 rounded-lg">Insights</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="mt-0 space-y-4">
                <ConversionFunnel
                  title="Funil de Entrega"
                  subtitle="Como seus emails progridem até a abertura"
                  steps={[
                    { label: "Enviadas", value: k.sent },
                    { label: "Entregues", value: k.delivered, pctLabel: "das enviadas" },
                    { label: "Abertas", value: k.opened, pctLabel: "das entregues" },
                  ]}
                  loading={loading}
                />
                <TopFailureReasons data={rpc.failure_reasons} loading={loading} />
                <DailyEvolutionChart data={dailyPoints} loading={loading} />
              </TabsContent>

              <TabsContent value="recipients" className="mt-0">
                <Card className="rounded-2xl border-0 bg-card shadow-sm">
                  <CardContent className="space-y-4 p-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <h3 className="text-sm font-semibold text-foreground">
                        Destinatários ({filtered.length.toLocaleString("pt-BR")})
                      </h3>
                      <Button size="sm" variant="outline" onClick={exportCsv} className="rounded-xl">
                        <Download className="mr-2 h-4 w-4" /> Exportar CSV
                      </Button>
                    </div>

                    <p className="text-[11px] text-muted-foreground">Exibindo os 500 envios mais recentes do período.</p>

                    <div className="flex flex-wrap gap-2">
                      <div className="relative min-w-[220px] flex-1 basis-full">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          placeholder="Buscar por nome ou email"
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                          className="h-9 rounded-xl border-0 bg-muted/40 pl-9 shadow-sm"
                        />
                      </div>
                      <Select value={statusFilter} onValueChange={setStatusFilter}>
                        <SelectTrigger className="h-9 w-auto flex-1 rounded-xl border-0 bg-muted/40 text-sm shadow-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Todos status</SelectItem>
                          <SelectItem value="delivered">Entregue</SelectItem>
                          <SelectItem value="opened">Aberta</SelectItem>
                          <SelectItem value="clicked">Clicou</SelectItem>
                          <SelectItem value="bounced">Bounce</SelectItem>
                          <SelectItem value="failed">Não entregue</SelectItem>
                          <SelectItem value="suppressed">Suprimida</SelectItem>
                        </SelectContent>
                      </Select>
                      <Select value={convertedFilter} onValueChange={setConvertedFilter}>
                        <SelectTrigger className="h-9 w-auto flex-1 rounded-xl border-0 bg-muted/40 text-sm shadow-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Conversão (todos)</SelectItem>
                          <SelectItem value="yes">Comprou em 7d</SelectItem>
                          <SelectItem value="no">Não comprou</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="overflow-x-auto rounded-xl border-0 shadow-sm">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                          <tr>
                            <th className="px-4 py-2.5 text-left font-semibold">Cliente</th>
                            <th className="px-4 py-2.5 text-left font-semibold">Email</th>
                            <th className="px-4 py-2.5 text-left font-semibold">Enviada em</th>
                            <th className="px-4 py-2.5 text-left font-semibold">Status</th>
                            <th className="px-4 py-2.5 text-center font-semibold">Comprou 7d</th>
                          </tr>
                        </thead>
                        <tbody>
                          {loading ? (
                            <tr><td colSpan={5} className="py-8 text-center text-muted-foreground">Carregando…</td></tr>
                          ) : pageItems.length === 0 ? (
                            <tr><td colSpan={5} className="py-8 text-center text-muted-foreground">Nenhum destinatário no filtro selecionado.</td></tr>
                          ) : (
                            pageItems.map((r) => (
                              <tr
                                key={r.log_id}
                                className={`border-t hover:bg-muted/30 ${r.client_id ? "cursor-pointer" : "cursor-default"}`}
                                onClick={() => {
                                  if (!r.client_id) return;
                                  setSelectedClientId(r.client_id);
                                  setClientSheetOpen(true);
                                }}
                              >
                                <td className="px-4 py-2.5 font-medium text-foreground">
                                  {r.client_name || <span className="italic text-muted-foreground">—</span>}
                                </td>
                                <td className="px-4 py-2.5 text-muted-foreground">{r.to_email}</td>
                                <td className="px-4 py-2.5 text-muted-foreground">
                                  {new Date(r.sent_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                                </td>
                                <td className="px-4 py-2.5">
                                  <div className="flex flex-col gap-0.5">
                                    <span className={`inline-flex w-fit items-center rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[r.status] ?? "bg-muted text-muted-foreground"}`}>
                                      {STATUS_LABEL[r.status] ?? r.status}
                                    </span>
                                    {r.failed_reason && (r.status === "failed" || r.status === "bounced") && (
                                      <span className="max-w-[260px] truncate text-[11px] italic text-muted-foreground" title={r.failed_reason}>
                                        {r.failed_reason}
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="px-4 py-2.5 text-center">
                                  {r.converted
                                    ? <CheckCircle2 className="inline h-4 w-4 text-success" />
                                    : <XCircle className="inline h-4 w-4 text-muted-foreground/50" />}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>

                    {totalPages > 1 && (
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>Página {page} de {totalPages}</span>
                        <div className="flex gap-1">
                          <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage((p) => p - 1)} className="h-8 rounded-lg">
                            <ChevronLeft className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="outline" disabled={page === totalPages} onClick={() => setPage((p) => p + 1)} className="h-8 rounded-lg">
                            <ChevronRight className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="insights" className="mt-0 space-y-4">
                <div className="grid grid-cols-1 gap-4">
                  <AvgTimeKpi
                    label="Tempo médio até abertura"
                    avgSeconds={k.avg_time_to_open_seconds}
                    medianSeconds={k.median_time_to_open_seconds}
                    tone="primary"
                    loading={loading}
                    tooltip="Tempo entre o envio e a primeira abertura registrada. Considera apenas emails abertos. Mediana é menos sensível a outliers."
                  />
                  <TopLinksCard links={rpc.top_links} loading={loading} />
                </div>
                <ReadHeatmap data={heatmapCells} loading={loading} />
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>

      {activeSeller && (
        <ClientDetailSheet
          clientId={selectedClientId}
          sellerId={activeSeller.id}
          open={clientSheetOpen}
          onOpenChange={setClientSheetOpen}
        />
      )}
    </LayoutApp>
  );
}

/** Os links mais clicados do template (só e-mail). O link abre no navegador do celular. */
function TopLinksCard({ links, loading }: { links: TopLink[]; loading?: boolean }) {
  return (
    <Card className="rounded-2xl border-0 bg-card shadow-sm">
      <CardContent className="space-y-3 p-5">
        <div className="flex items-center gap-1.5">
          <Link2 className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Top links clicados</h3>
          <MetricTooltip text="URLs mais clicadas neste template no período. Contagem de cliques por link." />
        </div>
        {loading ? (
          <div className="h-40 animate-pulse rounded-xl bg-muted" />
        ) : links.length === 0 ? (
          <p className="py-8 text-center text-xs text-muted-foreground">Nenhum clique registrado no período.</p>
        ) : (
          <div className="divide-y">
            {links.map((l, idx) => (
              <div key={`${l.url}-${idx}`} className="flex items-center gap-3 py-2.5">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                  {idx + 1}
                </span>
                <a
                  href={l.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="min-w-0 flex-1 truncate text-sm text-foreground hover:text-primary"
                  title={l.url}
                >
                  {l.url}
                </a>
                <span className="shrink-0 text-sm font-bold tabular-nums text-foreground">
                  {l.clicks.toLocaleString("pt-BR")}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
