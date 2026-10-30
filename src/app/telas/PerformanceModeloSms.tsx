import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle, ArrowLeft, BarChart3, Calendar as CalIcon, CheckCircle2, ChevronLeft, ChevronRight, DollarSign,
  Download, Eye, Flame, LineChart as LineChartIcon, MousePointerClick, Search, Send, Smartphone, Trophy, WifiOff,
} from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis,
} from "recharts";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

import { supabase } from "@/integrations/supabase/client";
import { useSellerContext } from "@/contexts/SellerContext";
import { cn } from "@/lib/utils";
import { Aviso } from "@/components/mobile/blocos";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MetricTooltip } from "@/components/ui/metric-tooltip";
import { SmsHealthBadge, computeSmsDeliveryHealth } from "@/components/sms/SmsHealthBadge";
import { KpiPadrao } from "@/components/kpi/KpiPadrao";
import { ConversionFunnel } from "@/components/performance/ConversionFunnel";
import { TopFailureReasons } from "@/components/performance/TopFailureReasons";
import { AvgTimeKpi } from "@/components/workflow-stats/AvgTimeKpi";
import { ClientDetailSheet } from "@/components/crm/ClientDetailSheet";
import { LayoutApp } from "@/app/LayoutApp";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- a RPC e as tabelas de SMS não estão nos tipos gerados do Supabase
type SemTipo = any;

const PERIOD_OPTIONS = [
  { value: "7", label: "Últimos 7 dias" },
  { value: "30", label: "Últimos 30 dias" },
  { value: "90", label: "Últimos 90 dias" },
  { value: "365", label: "Últimos 365 dias" },
];

const PAGE_SIZE = 25;

/** `period` vem da URL e pode chegar não-numérico: cai em 30 dias (ver Performance). */
function periodToDays(p: string): number {
  const n = Number(p);
  return Number.isFinite(n) && n > 0 ? n : 30;
}

const KPI_TOOLTIPS = {
  enviados: "Total de envios deste template no período (aceitos + não entregues).",
  aceitacao: "% de envios que a operadora aceitou no momento do disparo (status sent, delivered ou clicado). Não entregues iniciais (nº inválido, bloqueio) NÃO entram aqui.",
  entrega: "% de aceitos que tiveram confirmação de entrega (DLR) no aparelho do destinatário.",
  clique: "% de entregas em que pelo menos 1 cliente clicou no link rastreável. Requer tag <LINK> no template.",
  falha: "% dos envios que não foram aceitos pela operadora (nº inválido, bloqueio, rejeitado etc).",
  custo: "Custo total dos envios deste template no período. Considera segmentos cobrados (155 chars cada).",
} as const;

const fmtBRL = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtNum = (n: number) => n.toLocaleString("pt-BR");

interface Stats {
  template_name: string;
  kpis: {
    sent: number; delivered: number; failed: number; blocked: number;
    cost_cents_total: number; segments_total: number;
    avg_delivery_seconds?: number | null;
    sent_with_link?: number;
    unique_clicks?: number;
    total_clicks?: number;
    avg_seconds_to_first_click?: number | null;
  };
  daily: Array<{ day: string; sent: number; delivered: number; failed: number; cost_cents: number; clicked?: number }>;
  recipients: Array<{
    to_phone: string; client_id: string | null; client_name?: string | null; status: string;
    sent_via?: string | null;
    bhi_status_description?: string | null;
    message_text: string; cost_cents: number;
    sent_at: string | null; delivered_at: string | null;
    failed_at?: string | null; error_message: string | null;
    link_url?: string | null;
    first_clicked_at?: string | null;
    click_count?: number | null;
  }>;
}

const STATUS_LABEL: Record<string, string> = {
  pending: "Pendente", sent: "Aceito", delivered: "Entregue",
  failed: "Não entregue", blocked: "Bloqueado",
  expired: "Expirou", rejected: "Rejeitado", invalid_number: "Nº inválido",
};
const STATUS_STYLE: Record<string, string> = {
  pending: "bg-muted text-muted-foreground",
  sent: "bg-success/10 text-success",
  delivered: "bg-brand-blue/10 text-brand-blue",
  failed: "bg-muted text-muted-foreground",
  blocked: "bg-warning/10 text-warning",
  expired: "bg-brand-amber/10 text-brand-amber",
  rejected: "bg-muted text-muted-foreground",
  invalid_number: "bg-muted text-muted-foreground",
};

function maskPhone(p: string) {
  const d = (p || "").replace(/\D/g, "");
  if (d.length < 4) return p;
  return `+55 (${d.slice(2, 4) || "00"}) XXXX-${d.slice(-4)}`;
}

/**
 * Um template de SMS por dentro: a página do site
 * (src/pages/SmsTemplatePerformance.tsx) no tamanho de celular. Os custos dos
 * envios são relatório e ficam; compra de créditos não existe aqui.
 */
export default function PerformanceModeloSms() {
  const { templateName: raw } = useParams();
  const templateName = decodeURIComponent(raw || "");
  const navigate = useNavigate();
  const { activeSeller } = useSellerContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const period = searchParams.get("period") || "30";
  const setPeriod = (v: string) => {
    searchParams.set("period", v);
    setSearchParams(searchParams, { replace: true });
  };

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [originFilter, setOriginFilter] = useState("all");
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [clientSheetOpen, setClientSheetOpen] = useState(false);
  const handleOpenClient = (clientId: string | null) => {
    if (!clientId) return;
    setSelectedClientId(clientId);
    setClientSheetOpen(true);
  };

  const { startDate, endDate } = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - periodToDays(period));
    return { startDate: d, endDate: new Date() };
  }, [period]);

  const statsQ = useQuery({
    queryKey: ["sms-template-performance", activeSeller?.id, templateName, period],
    enabled: !!activeSeller?.id && !!templateName,
    queryFn: async (): Promise<Stats | null> => {
      const { data, error } = await (supabase.rpc as SemTipo)("get_sms_template_performance", {
        _seller_id: activeSeller!.id,
        _template_name: templateName,
        _start: startDate.toISOString(),
        _end: endDate.toISOString(),
      });
      if (error) throw error;
      return data as Stats;
    },
  });
  const data = statsQ.data;
  // Sem internet a consulta espera a conexão: os blocos ficam no esqueleto, não em zero.
  const isLoading = statsQ.isPending && statsQ.fetchStatus !== "idle";
  const semInternet = statsQ.isPending && statsQ.isPaused;

  const { data: tplMeta } = useQuery({
    queryKey: ["sms-template-meta", activeSeller?.id, templateName],
    enabled: !!activeSeller?.id && !!templateName,
    queryFn: async () => {
      const { data, error } = await (supabase as SemTipo)
        .from("sms_templates")
        .select("id,category:sms_template_categories(name,color)")
        .eq("seller_id", activeSeller!.id)
        .eq("name", templateName)
        .maybeSingle();
      if (error) return null;
      return data as { id: string; category: { name: string; color: string } | null } | null;
    },
  });

  const k = data?.kpis ?? {
    sent: 0, delivered: 0, failed: 0, blocked: 0, cost_cents_total: 0, segments_total: 0,
    avg_delivery_seconds: 0, sent_with_link: 0, unique_clicks: 0, total_clicks: 0, avg_seconds_to_first_click: 0,
  };
  const totalSent = k.sent + k.failed;
  const acceptanceRate = totalSent ? (k.sent / totalSent) * 100 : 0;
  const failureRate = totalSent ? (k.failed / totalSent) * 100 : 0;
  const deliveryRate = k.sent ? (k.delivered / k.sent) * 100 : 0;
  const avgCost = totalSent ? Math.round(k.cost_cents_total / totalSent) : 0;
  const uniqueClicks = k.unique_clicks ?? 0;
  const clickRate = k.delivered ? (uniqueClicks / k.delivered) * 100 : 0;
  const health = computeSmsDeliveryHealth(k.sent, k.delivered, k.failed);

  const recipients = useMemo(() => data?.recipients || [], [data]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return recipients.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (originFilter !== "all" && (r.sent_via || "") !== originFilter) return false;
      if (q) {
        const hay = `${r.client_name || ""} ${r.to_phone} ${r.message_text}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [recipients, search, statusFilter, originFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  useEffect(() => { setPage(1); }, [search, statusFilter, originFilter, period]);

  // Motivos de não entrega contados aqui mesmo (para o TopFailureReasons).
  const failureReasons = useMemo(() => {
    const m = new Map<string, number>();
    recipients.forEach((r) => {
      if (r.status !== "failed" || !r.error_message) return;
      m.set(r.error_message, (m.get(r.error_message) || 0) + 1);
    });
    return Array.from(m.entries())
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [recipients]);

  // Heatmap (dia da semana × hora). Reaproveita o formato sent/read: read = entregues.
  const heatmap = useMemo(() => {
    const cells = new Map<string, { dow: number; hour: number; sent: number; read: number }>();
    recipients.forEach((r) => {
      if (!r.sent_at) return;
      const d = new Date(r.sent_at);
      const dow = d.getDay(); // 0=Dom ... 6=Sáb (mesmo dow do Postgres)
      const hour = d.getHours();
      const key = `${dow}-${hour}`;
      const cell = cells.get(key) || { dow, hour, sent: 0, read: 0 };
      if (r.status === "sent" || r.status === "delivered") cell.sent += 1;
      if (r.status === "delivered" || r.delivered_at) cell.read += 1;
      cells.set(key, cell);
    });
    return Array.from(cells.values());
  }, [recipients]);

  const topClickers = useMemo(() => {
    return recipients
      .filter((r) => (r.click_count ?? 0) > 0)
      .sort((a, b) => (b.click_count ?? 0) - (a.click_count ?? 0))
      .slice(0, 10);
  }, [recipients]);

  const exportCsv = () => {
    const headers = ["telefone", "origem", "status", "status_bhi", "custo_cents", "enviado_em", "entregue_em", "clicou_em", "cliques", "mensagem", "erro"];
    const rows = filtered.map((r) => [
      r.to_phone, (r.sent_via || ""), r.status, (r.bhi_status_description || ""), r.cost_cents,
      r.sent_at || "", r.delivered_at || "", r.first_clicked_at || "", r.click_count ?? 0,
      (r.message_text || "").replace(/[\n\r,"]/g, " "),
      (r.error_message || "").replace(/[\n\r,"]/g, " "),
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sms-${templateName}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <LayoutApp>
      <div className="space-y-5 px-4 pb-6 pt-4">
        <button
          onClick={() => {
            if (((window.history.state as { idx?: number } | null)?.idx ?? 0) > 0) navigate(-1);
            else navigate("/workflow-stats?tab=sms");
          }}
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground transition hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Voltar para Performance SMS
        </button>

        <Card className="rounded-2xl border-0 bg-card shadow-sm">
          <CardContent className="p-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex min-w-0 flex-1 items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-secondary/10">
                  <Smartphone className="h-6 w-6 text-secondary" strokeWidth={2} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="break-words text-[21px] font-bold leading-tight tracking-tight text-foreground">
                      {templateName}
                    </h1>
                    {tplMeta?.category && (
                      <Badge
                        variant="outline"
                        className="border-0 text-[11px] font-medium"
                        style={{ background: `${tplMeta.category.color}1A`, color: tplMeta.category.color }}
                      >
                        {tplMeta.category.name}
                      </Badge>
                    )}
                    {!semInternet && <SmsHealthBadge health={health} />}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">SMS · Performance no período selecionado</p>
                </div>
              </div>

              {/* O período desce para uma linha própria, na largura toda, em vez
                  de espremer o título ao lado. */}
              <div className="flex w-full shrink-0 items-center gap-2 self-start">
                <CalIcon className="h-4 w-4 text-muted-foreground" />
                <Select value={period} onValueChange={(v) => { setPeriod(v); setPage(1); }}>
                  <SelectTrigger className="h-10 w-auto flex-1 rounded-xl text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PERIOD_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {semInternet ? (
          <Aviso tom="neutro" icone={WifiOff} titulo="Sem internet">
            Os números aparecem assim que a conexão voltar.
          </Aviso>
        ) : (
          <>
            {!isLoading && k.sent > 0 && k.delivered === 0 && (
              <div className="flex items-start gap-2 rounded-xl border border-warning/30 bg-warning/5 px-3 py-2.5 text-xs text-warning">
                <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-warning" />
                <div>
                  <p className="font-semibold">Métricas de entrega (DLR) sem dados</p>
                  <p className="mt-0.5 text-warning/90">
                    Os SMS foram aceitos pela operadora, mas ainda não recebemos o callback de entrega (DLR) da BHI.
                    Isso pode acontecer se o callback URL não estiver habilitado no painel da BHI, se o DLR não estiver ativo na conta,
                    ou se as mensagens foram enviadas há poucos minutos. Confirme com o suporte da BHI se o webhook está liberado.
                  </p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <KpiPadrao
                titulo="Enviados"
                valor={fmtNum(totalSent)}
                apoio="deste template no período"
                icone={Send}
                loading={isLoading}
                tooltip={KPI_TOOLTIPS.enviados}
              />
              <KpiPadrao
                titulo="Taxa de Aceitação"
                valor={`${acceptanceRate.toFixed(1)}%`}
                apoio={`${fmtNum(k.sent)} aceitos de ${fmtNum(totalSent)}`}
                icone={CheckCircle2}
                loading={isLoading}
                tooltip={KPI_TOOLTIPS.aceitacao}
              />
              <KpiPadrao
                titulo="Taxa de Entrega"
                valor={`${deliveryRate.toFixed(1)}%`}
                apoio={`${fmtNum(k.delivered)} entregues de ${fmtNum(k.sent)}`}
                icone={Eye}
                loading={isLoading}
                tooltip={KPI_TOOLTIPS.entrega}
              />
              <KpiPadrao
                titulo="Taxa de Clique"
                valor={`${clickRate.toFixed(1)}%`}
                apoio={`${fmtNum(uniqueClicks)} cliques únicos de ${fmtNum(k.delivered)}`}
                icone={MousePointerClick}
                loading={isLoading}
                tooltip={KPI_TOOLTIPS.clique}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <KpiPadrao
                titulo="Taxa de não entrega"
                valor={`${failureRate.toFixed(1)}%`}
                apoio={`${fmtNum(k.failed)} não entregues em ${fmtNum(totalSent)} envios`}
                icone={AlertCircle}
                loading={isLoading}
                tooltip={KPI_TOOLTIPS.falha}
              />
              <KpiPadrao
                titulo="Custo Total"
                valor={fmtBRL(k.cost_cents_total)}
                apoio={`${fmtNum(totalSent)} envio${totalSent === 1 ? "" : "s"} · ${fmtBRL(avgCost)}/envio em média · ${fmtNum(k.segments_total)} segmento${k.segments_total === 1 ? "" : "s"}`}
                icone={DollarSign}
                destaque
                loading={isLoading}
                tooltip={KPI_TOOLTIPS.custo}
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
                  steps={[
                    { label: "Enviadas", value: totalSent },
                    { label: "Aceitas", value: k.sent, pctLabel: "das enviadas" },
                    { label: "Entregues", value: k.delivered, pctLabel: "das aceitas" },
                    {
                      label: "Cliques únicos",
                      value: uniqueClicks,
                      pctLabel: "das entregues",
                      highlight: uniqueClicks > 0,
                      tooltip: "Destinatários únicos que clicaram pelo menos uma vez no link rastreável.",
                    },
                  ]}
                  loading={isLoading}
                  subtitle="Como suas mensagens SMS convertem em cliques"
                />
                <TopFailureReasons data={failureReasons} loading={isLoading} />
                <SmsDailyEvolutionChart data={data?.daily || []} loading={isLoading} />
              </TabsContent>

              <TabsContent value="recipients" className="mt-0">
                <Card className="rounded-2xl border-0 bg-card shadow-sm">
                  <CardContent className="space-y-4 p-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <h3 className="text-sm font-semibold text-foreground">Destinatários ({fmtNum(filtered.length)})</h3>
                      <Button size="sm" variant="outline" onClick={exportCsv} className="rounded-xl">
                        <Download className="mr-2 h-4 w-4" /> Exportar CSV
                      </Button>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <div className="relative min-w-[220px] flex-1 basis-full">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          placeholder="Buscar por nome, telefone ou mensagem"
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                          className="h-9 rounded-xl border-0 bg-muted/40 pl-9 shadow-sm"
                        />
                      </div>
                      <Select value={statusFilter} onValueChange={setStatusFilter}>
                        <SelectTrigger className="h-9 w-auto flex-1 rounded-xl border-0 bg-muted/40 text-sm shadow-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Todos status</SelectItem>
                          <SelectItem value="sent">Aceito</SelectItem>
                          <SelectItem value="delivered">Entregue</SelectItem>
                          <SelectItem value="failed">Não entregue</SelectItem>
                          <SelectItem value="blocked">Bloqueado</SelectItem>
                          <SelectItem value="rejected">Rejeitado</SelectItem>
                          <SelectItem value="invalid_number">Nº inválido</SelectItem>
                        </SelectContent>
                      </Select>
                      <Select value={originFilter} onValueChange={setOriginFilter}>
                        <SelectTrigger className="h-9 w-auto flex-1 rounded-xl border-0 bg-muted/40 text-sm shadow-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Origem (todas)</SelectItem>
                          <SelectItem value="workflow">Workflow</SelectItem>
                          <SelectItem value="manual_omnichannel">Omnichannel</SelectItem>
                          <SelectItem value="admin_panel">Admin</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="overflow-x-auto rounded-xl border-0 shadow-sm">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                          <tr>
                            <th className="px-4 py-2.5 text-left font-semibold">Cliente</th>
                            <th className="px-4 py-2.5 text-left font-semibold">Telefone</th>
                            <th className="px-4 py-2.5 text-left font-semibold">Status</th>
                            <th className="px-4 py-2.5 text-left font-semibold">Enviada em</th>
                            <th className="px-4 py-2.5 text-center font-semibold">Clicou</th>
                          </tr>
                        </thead>
                        <tbody>
                          {isLoading ? (
                            <tr><td colSpan={5} className="py-8 text-center text-muted-foreground">Carregando…</td></tr>
                          ) : pageItems.length === 0 ? (
                            <tr><td colSpan={5} className="py-8 text-center text-muted-foreground">Nenhum destinatário no filtro selecionado.</td></tr>
                          ) : (
                            pageItems.map((r, idx) => {
                              const clicks = r.click_count ?? 0;
                              const clickedFlag = !!r.first_clicked_at;
                              const clientName = (r.client_name || "").trim() || "Cliente sem cadastro";
                              const clickable = !!r.client_id;
                              return (
                                <tr
                                  key={`${r.to_phone}-${idx}`}
                                  className={cn("border-t hover:bg-muted/30", clickable ? "cursor-pointer" : "cursor-default")}
                                  onClick={() => handleOpenClient(r.client_id)}
                                >
                                  <td className="px-4 py-2.5 font-medium text-foreground">{clientName}</td>
                                  <td className="px-4 py-2.5 text-muted-foreground">{r.to_phone}</td>
                                  <td className="px-4 py-2.5">
                                    <div className="flex flex-col gap-0.5">
                                      <span className={cn("inline-flex w-fit items-center rounded-full px-2 py-0.5 text-xs font-semibold", STATUS_STYLE[r.status] || "bg-muted text-muted-foreground")}>
                                        {STATUS_LABEL[r.status] || r.status}
                                      </span>
                                      {r.status === "failed" && r.error_message && (
                                        <span className="max-w-[260px] truncate text-[11px] italic text-muted-foreground" title={r.error_message}>
                                          {r.error_message}
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                  <td className="px-4 py-2.5 text-xs tabular-nums text-muted-foreground">
                                    {r.sent_at ? format(new Date(r.sent_at), "dd/MM HH:mm", { locale: ptBR }) : "—"}
                                  </td>
                                  <td className="px-4 py-2.5 text-center">
                                    {!r.link_url ? (
                                      <span className="text-xs text-muted-foreground">—</span>
                                    ) : clickedFlag ? (
                                      <Badge className="border-0 bg-secondary/10 text-[11px] tabular-nums text-secondary hover:bg-secondary/10">
                                        ✓{clicks > 1 ? ` +${clicks - 1}` : ""}
                                      </Badge>
                                    ) : (
                                      <span className="text-xs text-muted-foreground">—</span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })
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
                    label="Tempo médio até entrega"
                    avgSeconds={k.avg_delivery_seconds || 0}
                    tone="primary"
                    loading={isLoading}
                    tooltip="Tempo entre o envio do SMS e a confirmação de entrega (DLR) na operadora. Considera apenas mensagens entregues."
                  />
                  <AvgTimeKpi
                    label="Tempo médio até 1º clique"
                    avgSeconds={k.avg_seconds_to_first_click || 0}
                    tone="info"
                    loading={isLoading}
                    tooltip="Tempo entre a entrega da mensagem e o primeiro clique no link rastreável. Considera apenas mensagens com clique."
                  />
                </div>
                <SmsDeliveryHeatmap data={heatmap} loading={isLoading} />
                <TopClickers data={topClickers} loading={isLoading} />
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

const DOW = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
const DISPLAY_TO_PG_DOW = [1, 2, 3, 4, 5, 6, 0];

function SmsDeliveryHeatmap({
  data,
  loading,
}: {
  data: Array<{ dow: number; hour: number; sent: number; read: number }>;
  loading?: boolean;
}) {
  const grid = new Map<string, { dow: number; hour: number; sent: number; read: number }>();
  data.forEach((c) => grid.set(`${c.dow}-${c.hour}`, c));
  const max = Math.max(1, ...data.map((c) => c.read));

  return (
    <Card className="rounded-2xl border-0 bg-card shadow-sm">
      <CardContent className="space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <Flame className="h-4 w-4 text-secondary" />
            <h3 className="text-sm font-semibold text-foreground">Heatmap de entregas</h3>
            <MetricTooltip text="Distribuição das entregas por dia da semana × hora do dia (TZ Brasília). Cada célula mostra quantas mensagens foram entregues naquele slot. Cores mais escuras = maior concentração." />
          </div>
          <span className="text-[11px] text-muted-foreground">Dia da semana × hora (TZ Brasília)</span>
        </div>

        {loading ? (
          <div className="h-40 animate-pulse rounded-xl bg-muted" />
        ) : (
          <div className="w-full overflow-x-auto">
            <table className="w-full min-w-[560px] table-fixed border-separate border-spacing-[2px] text-[10px]">
              <thead>
                <tr>
                  <th className="w-10" />
                  {Array.from({ length: 24 }, (_, h) => (
                    <th key={h} className="text-center font-medium text-muted-foreground">
                      {h % 3 === 0 ? h : ""}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {DOW.map((label, displayIdx) => {
                  const dow = DISPLAY_TO_PG_DOW[displayIdx];
                  return (
                    <tr key={dow}>
                      <td className="w-10 pr-2 text-right font-semibold text-muted-foreground">{label}</td>
                      {Array.from({ length: 24 }, (_, h) => {
                        const cell = grid.get(`${dow}-${h}`);
                        const reads = cell?.read || 0;
                        const sent = cell?.sent || 0;
                        const intensity = reads / max;
                        const rate = sent ? Math.round((reads / sent) * 100) : 0;
                        return (
                          <td
                            key={h}
                            title={`${label} ${h}h • ${reads} entregues / ${sent} aceitos (${rate}%)`}
                            className="h-8 rounded-[4px]"
                            style={{
                              backgroundColor:
                                reads === 0 ? "hsl(var(--muted))" : `hsl(var(--secondary) / ${0.15 + intensity * 0.85})`,
                            }}
                          />
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TopClickers({ data, loading }: { data: Stats["recipients"]; loading?: boolean }) {
  return (
    <Card className="rounded-2xl border-0 bg-card shadow-sm">
      <CardContent className="space-y-4 p-5">
        <div className="flex items-center gap-1.5">
          <Trophy className="h-4 w-4 text-warning" />
          <h3 className="text-sm font-semibold text-foreground">Top destinatários que clicaram</h3>
          <MetricTooltip text="Destinatários que mais clicaram no link rastreável deste template no período selecionado." />
          <span className="ml-auto text-[11px] text-muted-foreground">cliques no link rastreável</span>
        </div>

        {loading ? (
          <div className="h-40 animate-pulse rounded-xl bg-muted" />
        ) : data.length === 0 ? (
          <p className="py-8 text-center text-xs text-muted-foreground">Nenhum clique registrado neste período.</p>
        ) : (
          <div className="divide-y">
            {data.map((c, idx) => (
              <div key={`${c.to_phone}-${idx}`} className="-mx-2 flex w-full items-center gap-3 rounded-lg px-2 py-2.5">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                  {idx + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-sm font-semibold text-foreground">{maskPhone(c.to_phone)}</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {c.first_clicked_at
                      ? `1º clique em ${format(new Date(c.first_clicked_at), "dd/MM HH:mm", { locale: ptBR })}`
                      : "Sem timestamp"}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-bold tabular-nums text-secondary">
                    {fmtNum(c.click_count ?? 0)} {(c.click_count ?? 0) === 1 ? "clique" : "cliques"}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SmsDailyEvolutionChart({ data, loading }: { data: Stats["daily"]; loading?: boolean }) {
  const [chartType, setChartType] = useState<"bar" | "line">("bar");
  const series = [
    { key: "sent", name: "Aceitos", color: "hsl(var(--chart-1))" },
    { key: "delivered", name: "Entregues", color: "hsl(var(--chart-4))" },
    { key: "clicked", name: "Cliques", color: "hsl(var(--chart-2))" },
    { key: "failed", name: "Não entregues", color: "hsl(var(--muted-foreground))" },
  ];
  const chartData = data.map((d) => ({
    ...d,
    label: format(new Date(d.day), "dd/MM", { locale: ptBR }),
  }));

  return (
    <Card className="rounded-2xl border-0 bg-card shadow-sm">
      <CardContent className="p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            Evolução diária
            <MetricTooltip text="Quantidade de SMS aceitos, entregues, clicados e não entregues por dia (TZ Brasília) no período selecionado." />
          </h3>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Aceitos / Entregues / Cliques / Não entregues</span>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setChartType((t) => (t === "bar" ? "line" : "bar"))}
              title={chartType === "bar" ? "Ver como linha" : "Ver como barras"}
            >
              {chartType === "bar" ? <LineChartIcon className="h-3.5 w-3.5" /> : <BarChart3 className="h-3.5 w-3.5" />}
            </Button>
          </div>
        </div>
        <div className="h-[280px]">
          {loading ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Carregando…</div>
          ) : data.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Sem dados no período.</div>
          ) : chartType === "bar" ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <RTooltip contentStyle={{ borderRadius: 12, border: "1px solid hsl(var(--border))", fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" />
                {series.map((s) => (
                  <Bar key={s.key} dataKey={s.key} name={s.name} fill={s.color} radius={[4, 4, 0, 0]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <RTooltip contentStyle={{ borderRadius: 12, border: "1px solid hsl(var(--border))", fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" />
                {series.map((s) => (
                  <Line key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={2} dot={{ r: 2 }} activeDot={{ r: 4 }} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
