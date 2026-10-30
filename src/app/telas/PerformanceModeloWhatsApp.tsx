import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye as EyeIcon,
  MailCheck,
  MessageCircleReply,
  Search,
  Send,
  Users,
  WifiOff,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useSellerContext } from "@/contexts/SellerContext";
import { Aviso, Pilulas } from "@/components/mobile/blocos";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DailyEvolutionChart, type DailyPoint } from "@/components/workflow-stats/DailyEvolutionChart";
import { AvgTimeKpi } from "@/components/workflow-stats/AvgTimeKpi";
import { ReadHeatmap } from "@/components/workflow-stats/ReadHeatmap";
import { ClientDetailSheet } from "@/components/crm/ClientDetailSheet";
import { isConditionalStage } from "@/components/crm/kanbanFilters";
import { ConversionFunnel } from "@/components/performance/ConversionFunnel";
import { ClassificacaoPorFluxo } from "@/components/template-performance/ClassificacaoPorFluxo";
import { TopFailureReasons } from "@/components/performance/TopFailureReasons";
import { DeltaCanalPill } from "@/components/performance/DeltaCanalPill";
import { KpiPadrao } from "@/components/kpi/KpiPadrao";
import { resolveTemplateTitle } from "@/utils/templateName";
import { categorizeTemplate, calculateTemplateHealth } from "@/utils/templateHealth";
import {
  useTemplateFailures,
  useTemplateDisplayName,
  usePerformanceStats,
  inicioNoMinuto,
  fimNoMinuto,
  type FailureReasonStat,
} from "@/hooks/useWorkflowStatsData";
import { LayoutApp } from "@/app/LayoutApp";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- a RPC e a resposta dela não estão nos tipos gerados do Supabase
type SemTipo = any;

const KPI_TOOLTIPS: Record<string, string> = {
  Disparos: "Tudo o que o sistema tentou enviar: as aceitas pela API do WhatsApp E as não entregues (número inválido, janela 24h, template rejeitado etc). É a base de todas as taxas — contar só as aceitas escondia as não entregues do denominador.",
  Entregues: "Mensagens efetivamente entregues no aparelho (status delivered/read ou delivered_at preenchido). % calculado sobre Disparos — a diferença são as não entregues e as aceitas ainda a caminho.",
  Lidas: "Mensagens com confirmação de leitura azul (status read ou read_at preenchido). % calculado sobre Entregues.",
  Responderam: "Clientes que enviaram pelo menos uma mensagem inbound após receber este template, na mesma conversa. % calculado sobre Entregues.",
  Falhas: "Mensagens que não foram entregues ao destinatário (número inválido, janela de 24h estourada, template rejeitado pela Meta, erro de conta etc). % calculado sobre o total de tentativas (Enviadas + Não entregues), pois cada não entregue é uma tentativa independente que não entra no contador de Enviadas.",
  "Total de destinatários": "Número de clientes únicos que receberam este template no período selecionado.",
};

const PERIODOS = [
  { value: "7", label: "7 dias" },
  { value: "30", label: "30 dias" },
  { value: "90", label: "90 dias" },
  { value: "365", label: "1 ano" },
];

type RecipientStatus = "sent" | "delivered" | "read" | "failed" | "replied";

interface Recipient {
  messageId: string;
  clientId: string | null;
  clientName: string;
  phone: string;
  sentAt: string;
  status: RecipientStatus;
  converted: boolean;
  failedReason: string | null;
}

const STATUS_LABEL: Record<RecipientStatus, string> = {
  sent: "Enviada",
  delivered: "Entregue",
  read: "Lida",
  failed: "Não entregue",
  replied: "Respondeu",
};

const STATUS_STYLE: Record<RecipientStatus, string> = {
  sent: "bg-muted text-muted-foreground",
  delivered: "bg-success/10 text-success",
  read: "bg-primary/10 text-primary",
  failed: "bg-muted text-muted-foreground",
  replied: "bg-warning/10 text-warning",
};

const PAGE_SIZE = 25;

/** `period` vem da URL e pode chegar não-numérico: cai em 30 dias (ver Performance). */
function periodToDays(p: string): number {
  const n = Number(p);
  return Number.isFinite(n) && n > 0 ? n : 30;
}

interface Kpis {
  sent: number; delivered: number; read: number; replied: number; failed: number;
  revenue: number; converted_clients: number; unique_recipients: number;
  avg_time_to_read_seconds: number; median_time_to_read_seconds: number;
  avg_time_to_reply_seconds: number; median_time_to_reply_seconds: number;
}

const INITIAL_KPIS: Kpis = {
  sent: 0, delivered: 0, read: 0, replied: 0, failed: 0, revenue: 0,
  converted_clients: 0, unique_recipients: 0,
  avg_time_to_read_seconds: 0, median_time_to_read_seconds: 0,
  avg_time_to_reply_seconds: 0, median_time_to_reply_seconds: 0,
};

/** Quanto vale o resultado de um período: o mesmo staleTime das outras consultas da tela. */
const VALIDADE_MS = 5 * 60 * 1000;

/**
 * "Agora" da tela, estável por 5 min. As consultas irmãs levam a janela na
 * queryKey: com `new Date()` a cada troca de período, ir de 30 para 7 dias e
 * voltar refazia tudo no banco. Reaproveitar o mesmo instante enquanto o cache
 * vale faz a volta cair no cache. Fica fora do componente para valer também ao
 * sair e voltar à tela.
 */
let agoraDaTela = 0;
function agoraEstavel(): number {
  const agora = Date.now();
  if (agora - agoraDaTela >= VALIDADE_MS) agoraDaTela = agora;
  return agoraDaTela;
}

/**
 * Tentar de novo sozinho SÓ quando a falha é de tempo ou de rede: o timeout é
 * de cache frio, e a 2ª chamada encontra as páginas na memória. "Not
 * authorized" e erro de SQL não mudam numa segunda tentativa.
 */
function erroTransitorio(erro: unknown): boolean {
  const e = erro as { code?: string; status?: number; message?: string } | null;
  if (!e) return false;
  // 57014 = statement timeout; PGRST000–003 = PostgREST sem conexão / fila do pool.
  if (e.code === "57014" || /^PGRST00[0-3]$/.test(e.code ?? "")) return true;
  // status 0 = fetch nem completou (rede); 408/502/503/504/52x = gateway/Cloudflare.
  const s = e.status;
  if (typeof s === "number" && (s === 0 || s === 408 || s === 502 || s === 503 || s === 504 || (s >= 520 && s <= 524))) {
    return true;
  }
  const msg = (e.message ?? "").toLowerCase();
  return /failed to fetch|networkerror|load failed|timeout|timed out/.test(msg);
}

/**
 * Tentativa que falhou depois disto não se repete sozinha: a RPC tem
 * statement_timeout de 25 s, e repetir deixaria a tela ~51 s no esqueleto
 * antes do aviso. Falha rápida (rede) continua com a 2ª tentativa automática.
 */
const LIMITE_PARA_REPETIR_MS = 15_000;

/** Erro da RPC com o código, o status HTTP e quanto a tentativa levou, para o `retry` decidir. */
class ErroMetricas extends Error {
  code?: string;
  status?: number;
  duracaoMs?: number;
  constructor(erro: { message?: string; code?: string }, status?: number, duracaoMs?: number) {
    super(erro?.message || "Erro ao consultar as métricas");
    this.name = "ErroMetricas";
    this.code = erro?.code;
    this.status = status;
    this.duracaoMs = duracaoMs;
  }
}

/** Repete uma vez só: erro de tempo/rede E tentativa que falhou rápido. */
function deveRepetir(falhas: number, erro: unknown): boolean {
  const duracao = (erro as ErroMetricas | null)?.duracaoMs ?? 0;
  return falhas < 1 && erroTransitorio(erro) && duracao < LIMITE_PARA_REPETIR_MS;
}

interface DadosTemplate {
  kpis: Kpis;
  daily: DailyPoint[];
  heatmap: { dow: number; hour: number; sent: number; read: number }[];
  recipients: Recipient[];
  /** null = RPC antiga, sem `failure_reasons`: a tela cai no useTemplateFailures. */
  motivosFalha: FailureReasonStat[] | null;
  /** Quando o banco montou a resposta, se a RPC informar (`gerado_em`). */
  geradoEm: string | null;
}

/**
 * Motivos de falha vindos da própria RPC, no formato do hook: [{reason, count}],
 * top 5. Chave ausente = RPC antiga (null); presente mas nula = nenhuma falha ([]).
 */
function lerMotivosFalha(r: SemTipo): FailureReasonStat[] | null {
  if (!r || !Object.prototype.hasOwnProperty.call(r, "failure_reasons")) return null;
  const lista: SemTipo[] = Array.isArray(r.failure_reasons) ? r.failure_reasons : [];
  return lista
    .map((x) => ({ reason: String(x?.reason ?? "Desconhecido"), count: Number(x?.count) || 0 }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
}

function lerResposta(data: SemTipo): DadosTemplate {
  const r: SemTipo = data || {};
  return {
    kpis: { ...INITIAL_KPIS, ...(r.kpis || {}) },
    daily: r.daily || [],
    heatmap: r.heatmap || [],
    recipients: ((r.recipients || []) as SemTipo[]).map((x) => ({
      messageId: x.message_id,
      clientId: x.client_id,
      clientName: x.client_name,
      phone: x.phone,
      sentAt: x.sent_at,
      status: x.status as RecipientStatus,
      converted: !!x.converted,
      failedReason: x.failed_reason ?? null,
    })),
    motivosFalha: lerMotivosFalha(r),
    geradoEm: typeof r.gerado_em === "string" ? r.gerado_em : null,
  };
}

/** Referências fixas: `[]` novo a cada render quebraria o useMemo dos filtros. */
const SEM_DESTINATARIOS: Recipient[] = [];
const SEM_PONTOS: DailyPoint[] = [];
const SEM_CELULAS: DadosTemplate["heatmap"] = [];
/** Um toast só, substituído a cada falha — retry e troca de período não empilham avisos. */
const TOAST_ERRO_ID = "template-performance-erro";

/**
 * Um template de WhatsApp por dentro: o desenho de celular da página do site
 * (src/pages/TemplatePerformance.tsx). Cartão do template, período em pílulas,
 * KPIs em duas colunas, abas na largura toda e os destinatários em linhas, com
 * a mesma seleção para mover clientes de fase no CRM.
 */
export default function PerformanceModeloWhatsApp() {
  const { templateName: rawName } = useParams();
  const templateName = decodeURIComponent(rawName || "");
  const navigate = useNavigate();
  const { activeSeller } = useSellerContext();
  const [searchParams, setSearchParams] = useSearchParams();

  const period = searchParams.get("period") || "30";
  const setPeriod = (v: string) => {
    searchParams.set("period", v);
    setSearchParams(searchParams, { replace: true });
  };

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [convertedFilter, setConvertedFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [clientSheetOpen, setClientSheetOpen] = useState(false);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkStageId, setBulkStageId] = useState<string>("");
  const [movingBulk, setMovingBulk] = useState(false);

  const queryClient = useQueryClient();
  const sellerId = activeSeller?.id;

  // A chave é a mesma do KanbanBoard, do ChatHeader e da ficha: o formato tem
  // de ser o deles (*). Só com id/nome, o CRM aberto em seguida lia do cache
  // fases sem stage_type nem is_entry, e a fase por regra virava coluna manual.
  const { data: stages = [] } = useQuery({
    queryKey: ["pipeline-stages", sellerId],
    enabled: !!sellerId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pipeline_stages")
        .select("*")
        .eq("seller_id", sellerId!)
        .order("position");
      if (error) throw error;
      return data ?? [];
    },
  });

  const handleOpenClient = (clientId: string | null) => {
    if (!clientId) return;
    setSelectedClientId(clientId);
    setClientSheetOpen(true);
  };

  const toggleSelect = (clientId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(clientId)) next.delete(clientId);
      else next.add(clientId);
      return next;
    });
  };

  const handleBulkMoveStage = async () => {
    if (!sellerId || !bulkStageId || selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    setMovingBulk(true);
    try {
      const { data: existing, error: selErr } = await supabase
        .from("client_pipeline")
        .select("client_id, stage_id")
        .eq("seller_id", sellerId)
        .in("client_id", ids);
      if (selErr) throw selErr;
      const existingMap = new Map<string, string>((existing ?? []).map((r) => [r.client_id, r.stage_id]));
      const toInsert = ids.filter((id) => !existingMap.has(id));
      const toUpdate = ids.filter((id) => existingMap.has(id) && existingMap.get(id) !== bulkStageId);

      if (toUpdate.length > 0) {
        const { error: upErr } = await supabase
          .from("client_pipeline")
          .update({
            stage_id: bulkStageId,
            moved_at: new Date().toISOString(),
          })
          .eq("seller_id", sellerId)
          .in("client_id", toUpdate);
        if (upErr) throw upErr;
      }
      if (toInsert.length > 0) {
        // `client_pipeline` na Segunda Venda não tem coluna `position`.
        const rows = toInsert.map((cid) => ({
          client_id: cid, seller_id: sellerId, stage_id: bulkStageId,
        }));
        const { error: insErr } = await supabase.from("client_pipeline").insert(rows);
        if (insErr) throw insErr;
      }

      const userId = (await supabase.auth.getUser()).data.user?.id;
      // A coluna aqui é `interaction_type` (mesmo padrão do KanbanBoard).
      const interactions = ids.map((cid) => ({
        client_id: cid, seller_id: sellerId, interaction_type: "stage_changed",
        content: "Cliente movido para nova fase", created_by: userId,
      }));
      if (interactions.length > 0) {
        await supabase.from("client_interactions").insert(interactions);
      }

      queryClient.invalidateQueries({ queryKey: ["column-initial", sellerId] });
      queryClient.invalidateQueries({ queryKey: ["column-count", sellerId] });
      queryClient.invalidateQueries({ queryKey: ["crm-metrics", sellerId] });

      const stage = stages.find((st) => st.id === bulkStageId);
      toast.success(`${ids.length} cliente(s) movidos para ${stage?.name ?? "fase"}`);
      setSelectedIds(new Set());
      setBulkStageId("");
    } catch (e) {
      console.error(e);
      toast.error("Erro ao mover clientes em massa");
    } finally {
      setMovingBulk(false);
    }
  };

  const dias = periodToDays(period);

  // Janela das consultas irmãs: "agora" estável por 5 min e os hooks ancoram
  // no minuto — trocar de período e voltar cai no cache.
  const { startDate, endDate } = useMemo(() => {
    const fim = new Date(agoraEstavel());
    const inicio = new Date(fim);
    inicio.setDate(inicio.getDate() - dias);
    return { startDate: inicio, endDate: fim };
  }, [dias]);

  // Média do canal (seller inteiro, mesma janela) para comparar os KPIs.
  const { data: channelStats } = usePerformanceStats(sellerId, startDate, endDate, {
    refetchOnMount: true,
  });
  const { data: displayName } = useTemplateDisplayName(sellerId, templateName, "whatsapp");
  const humanTitle = resolveTemplateTitle({ displayName, name: templateName });
  const category = categorizeTemplate(templateName);

  // Chave SEM datas: o período define a janela, e as datas saem dentro da
  // queryFn, ancoradas no minuto, na hora em que a consulta roda.
  const {
    data: dados,
    error: erroMetricas,
    isError: metricasComErro,
    isPending: metricasPendentes,
    isPaused: metricasEmEspera,
    isFetching: metricasBuscando,
    refetch: recarregarMetricas,
    dataUpdatedAt,
    errorUpdatedAt,
  } = useQuery<DadosTemplate>({
    queryKey: ["template-performance", sellerId, templateName, dias],
    enabled: !!sellerId && !!templateName,
    staleTime: VALIDADE_MS,
    // Sair da tela e voltar em menos de 5 min usa o cache.
    refetchOnMount: true,
    retry: deveRepetir,
    // Sem placeholderData de propósito: os números do período anterior sob o
    // rótulo do período novo seriam mentira enquanto carrega.
    queryFn: async () => {
      const agora = new Date();
      const inicio = new Date(agora);
      inicio.setDate(inicio.getDate() - dias);
      // Sem filiais na Segunda Venda: a RPC tem 4 argumentos, sem _branch.
      const t0 = Date.now();
      const { data, error, status } = await (supabase.rpc as SemTipo)("get_template_performance", {
        _seller_id: sellerId,
        _template: templateName,
        _start: inicioNoMinuto(inicio),
        _end: fimNoMinuto(agora),
      });
      if (error) throw new ErroMetricas(error, status, Date.now() - t0);
      return lerResposta(data);
    },
  });

  // Esqueleto enquanto não há número — inclusive no "Tentar de novo" depois de
  // um erro e sem internet (a consulta espera a conexão). Com dados no cache,
  // a atualização é silenciosa.
  const loading = metricasPendentes || (metricasBuscando && !dados);
  const semInternet = metricasPendentes && metricasEmEspera;
  const kpis = dados?.kpis ?? INITIAL_KPIS;
  const daily = dados?.daily ?? SEM_PONTOS;
  const heatmap = dados?.heatmap ?? SEM_CELULAS;
  const recipients = dados?.recipients ?? SEM_DESTINATARIOS;

  // Motivos de falha: da própria RPC quando ela os devolve. Sem a chave (RPC
  // antiga ainda no ar), liga a consulta antiga.
  const rpcSemMotivos = !!dados && dados.motivosFalha === null;
  const { data: motivosDoHook, isLoading: motivosDoHookCarregando } = useTemplateFailures(
    sellerId,
    templateName,
    startDate,
    endDate,
    { enabled: rpcSemMotivos, refetchOnMount: true },
  );
  const failureReasons = dados?.motivosFalha ?? (rpcSemMotivos ? motivosDoHook : undefined);
  const failuresLoading = loading || (rpcSemMotivos && motivosDoHookCarregando);

  // Erro que aconteceu ANTES desta montagem não vira aviso de novo: reabrir em
  // menos de 5 min usa o cache, e repetir o toast velho a cada volta só fazia
  // barulho.
  const montadoEm = useRef(Date.now());

  // Toast de erro com "Tentar de novo". Só chega aqui depois do retry
  // automático; o erro não apaga o que já estava na tela.
  useEffect(() => {
    // Durante uma nova tentativa o erro antigo ainda está no estado: espera o resultado.
    if (!metricasComErro || metricasBuscando) return;
    if (errorUpdatedAt < montadoEm.current) return;
    const e = erroMetricas as ErroMetricas | null;
    console.error("[TemplatePerformance]", e);
    toast.error(
      dados
        ? "Não foi possível atualizar as métricas do template"
        : "Não foi possível carregar as métricas do template",
      {
        id: TOAST_ERRO_ID,
        description: e?.message || "Tente novamente em instantes.",
        // Sem número na tela, o botão do toast é o único caminho para tentar de novo.
        duration: dados ? 10_000 : Infinity,
        action: { label: "Tentar de novo", onClick: () => { void recarregarMetricas(); } },
      },
    );
    // errorUpdatedAt muda a cada falha nova; as demais dependências andam junto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metricasComErro, metricasBuscando, errorUpdatedAt]);

  // Deu certo depois (retry manual ou outro período): o aviso sai da tela.
  useEffect(() => {
    if (dataUpdatedAt) toast.dismiss(TOAST_ERRO_ID);
  }, [dataUpdatedAt]);
  useEffect(() => () => { toast.dismiss(TOAST_ERRO_ID); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return recipients.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (convertedFilter === "yes" && !r.converted) return false;
      if (convertedFilter === "no" && r.converted) return false;
      if (q) {
        const hay = `${r.clientName} ${r.phone}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [recipients, search, statusFilter, convertedFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => { setPage(1); }, [search, statusFilter, convertedFilter, period]);

  const exportCsv = () => {
    const rows = [
      ["Cliente", "Telefone", "Enviada em", "Status", "Motivo da não entrega", "Converteu em 7d"],
      ...filtered.map((r) => [
        r.clientName, r.phone,
        new Date(r.sentAt).toLocaleString("pt-BR"),
        STATUS_LABEL[r.status],
        r.status === "failed" ? (r.failedReason ?? "") : "",
        r.converted ? "Sim" : "Não",
      ]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${templateName}-destinatarios.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Tentativas (disparos) = aceitas + falhas: a base de TODA taxa do topo.
  const attempts = kpis.sent + kpis.failed;
  const deliveryRate = attempts ? (kpis.delivered / attempts) * 100 : 0;
  const readRate = kpis.delivered ? (kpis.read / kpis.delivered) * 100 : 0;
  const replyRate = kpis.delivered ? (kpis.replied / kpis.delivered) * 100 : 0;
  const failureRate = attempts ? (kpis.failed / attempts) * 100 : 0;

  // Médias do canal inteiro para comparação
  const chAttempts = (channelStats?.sent ?? 0) + (channelStats?.failed ?? 0);
  const chDeliveryAvg = chAttempts ? ((channelStats?.delivered ?? 0) / chAttempts) * 100 : undefined;
  const chReadAvg = channelStats?.delivered ? (channelStats.read / channelStats.delivered) * 100 : undefined;
  const chReplyAvg = channelStats?.delivered ? (channelStats.replied / channelStats.delivered) * 100 : undefined;
  const chFailureAvg = chAttempts ? (channelStats!.failed / chAttempts) * 100 : undefined;

  const health = calculateTemplateHealth({ sent: kpis.sent, delivered: kpis.delivered, failed: kpis.failed });
  const CategoryIcon = category.icon;

  const selecionaveis = pageItems.filter((r) => !!r.clientId);
  const todosSelecionados = selecionaveis.every((r) => selectedIds.has(r.clientId!));

  return (
    <LayoutApp>
      <div className="space-y-5 px-4 pb-6 pt-4">
        <button
          onClick={() => {
            if (((window.history.state as { idx?: number } | null)?.idx ?? 0) > 0) navigate(-1);
            else navigate("/workflow-stats?tab=whatsapp");
          }}
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground transition hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Voltar
        </button>

        <Card className="rounded-2xl border-0 bg-card shadow-sm">
          <CardContent className="p-4">
            <div className="flex min-w-0 items-start gap-4">
              <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${category.iconBgClass}`}>
                <CategoryIcon className={`h-6 w-6 ${category.iconColorClass}`} strokeWidth={2} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="break-words text-[21px] font-bold leading-tight tracking-tight text-foreground">
                    {humanTitle || templateName}
                  </h1>
                  {!semInternet && (
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${health.pillClass}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${health.dotClass}`} />
                      {health.label}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">WhatsApp · {category.label}</p>
                <p className="mt-1 break-all font-mono text-xs text-muted-foreground/70" title="Identificador técnico do template">
                  {templateName}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Pilulas rotulo="Período" opcoes={PERIODOS} valor={period} onChange={setPeriod} />

        {semInternet ? (
          <Aviso tom="neutro" icone={WifiOff} titulo="Sem internet">
            Os números aparecem assim que a conexão voltar.
          </Aviso>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <KpiPadrao
                titulo="Disparos"
                valor={attempts.toLocaleString("pt-BR")}
                apoio={`${kpis.sent.toLocaleString("pt-BR")} aceitas · ${kpis.failed.toLocaleString("pt-BR")} não entregues`}
                icone={Send}
                loading={loading}
                tooltip={KPI_TOOLTIPS.Disparos}
              />
              <KpiPadrao
                titulo="Taxa de Entrega"
                valor={`${deliveryRate.toFixed(1)}%`}
                apoio={`${kpis.delivered.toLocaleString("pt-BR")} de ${attempts.toLocaleString("pt-BR")} disparos`}
                icone={MailCheck}
                loading={loading}
                tooltip={KPI_TOOLTIPS.Entregues}
              >
                {!loading && <DeltaCanalPill pct={deliveryRate} mediaPct={chDeliveryAvg} />}
              </KpiPadrao>
              <KpiPadrao
                titulo="Taxa de Leitura"
                valor={`${readRate.toFixed(1)}%`}
                apoio={`${kpis.read.toLocaleString("pt-BR")} lidas`}
                icone={EyeIcon}
                loading={loading}
                tooltip={KPI_TOOLTIPS.Lidas}
              >
                {!loading && <DeltaCanalPill pct={readRate} mediaPct={chReadAvg} />}
              </KpiPadrao>
              <KpiPadrao
                titulo="Taxa de Resposta"
                valor={`${replyRate.toFixed(1)}%`}
                apoio={`${kpis.replied.toLocaleString("pt-BR")} responderam`}
                icone={MessageCircleReply}
                loading={loading}
                tooltip={KPI_TOOLTIPS.Responderam}
              >
                {!loading && <DeltaCanalPill pct={replyRate} mediaPct={chReplyAvg} />}
              </KpiPadrao>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <KpiPadrao
                titulo="Taxa de não entrega"
                valor={`${failureRate.toFixed(1)}%`}
                apoio={`${kpis.failed.toLocaleString("pt-BR")} de ${attempts.toLocaleString("pt-BR")} tentativas`}
                icone={AlertCircle}
                loading={loading}
                tooltip={KPI_TOOLTIPS.Falhas}
              >
                {!loading && <DeltaCanalPill pct={failureRate} mediaPct={chFailureAvg} inverso />}
              </KpiPadrao>
              <KpiPadrao
                titulo="Total de Destinatários"
                valor={kpis.unique_recipients.toLocaleString("pt-BR")}
                apoio={`${kpis.converted_clients.toLocaleString("pt-BR")} de ${kpis.unique_recipients.toLocaleString("pt-BR")} cliente${kpis.unique_recipients === 1 ? "" : "s"} converte${kpis.converted_clients === 1 ? "u" : "ram"} em 7 dias`}
                icone={Users}
                destaque
                loading={loading}
                tooltip={KPI_TOOLTIPS["Total de destinatários"]}
              />
            </div>

            <Tabs defaultValue="overview" className="space-y-4">
              <TabsList className="w-full rounded-xl bg-muted/50">
                <TabsTrigger value="overview" className="flex-1 rounded-lg">Visão geral</TabsTrigger>
                <TabsTrigger value="recipients" className="flex-1 rounded-lg">Destinatários</TabsTrigger>
                <TabsTrigger value="insights" className="flex-1 rounded-lg">Insights</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="mt-0 space-y-4">
                {/* Distribuição das respostas pelas saídas do classificador de cada
                    fluxo — some sozinho quando nenhum fluxo classifica. */}
                <ClassificacaoPorFluxo
                  sellerId={sellerId}
                  templateName={templateName}
                  start={startDate.toISOString()}
                  end={endDate.toISOString()}
                />
                <ConversionFunnel
                  steps={[
                    {
                      label: "Disparos",
                      value: attempts,
                      tooltip: "Tudo o que o sistema tentou enviar, incluindo as não entregues. É a base do funil — 'Enviadas' escondia as não entregues e o topo ficava menor que a realidade.",
                    },
                    { label: "Entregues", value: kpis.delivered, pctLabel: "dos disparos" },
                    { label: "Lidas", value: kpis.read, pctLabel: "das entregues" },
                    {
                      label: "Respondidas",
                      value: kpis.replied,
                      pctOf: kpis.delivered,
                      pctLabel: "das entregues",
                      // Sobre ENTREGUES, não sobre Lidas: responder não exige recibo de leitura.
                      tooltip: "Clientes que responderam na mesma conversa. % calculado sobre Entregues — responder não exige recibo de leitura, então há quem responda sem contar como 'Lida' (recibos desativados).",
                    },
                    {
                      label: "Compraram em 7d",
                      value: kpis.converted_clients,
                      highlight: true,
                      pctOf: kpis.unique_recipients,
                      pctLabel: "dos destinatários",
                      tooltip: "Destinatários que fizeram um pedido válido (exclui cancelados/reembolsados) em até 7 dias após o envio. % calculado sobre o total de destinatários (não sobre 'Responderam'), pois a compra não depende de resposta.",
                    },
                  ]}
                  loading={loading}
                />
                {/* Os motivos vêm da mesma RPC: se ela falhou e não há dado, o card
                    diria "Todos os disparos foram entregues". Some até a próxima
                    tentativa (o toast avisa). */}
                {(failuresLoading || failureReasons !== undefined) && (
                  <TopFailureReasons data={failureReasons} loading={failuresLoading} />
                )}
                <DailyEvolutionChart data={daily} loading={loading} />
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

                    <div className="flex flex-wrap gap-2">
                      <div className="relative min-w-[220px] flex-1 basis-full">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          placeholder="Buscar por nome ou telefone"
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                          className="h-9 rounded-xl border-0 bg-muted/40 pl-9 shadow-sm"
                        />
                      </div>
                      <Select value={statusFilter} onValueChange={setStatusFilter}>
                        <SelectTrigger className="h-9 w-auto flex-1 rounded-xl border-0 bg-muted/40 text-sm shadow-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Todos status</SelectItem>
                          <SelectItem value="sent">Enviada</SelectItem>
                          <SelectItem value="delivered">Entregue</SelectItem>
                          <SelectItem value="read">Lida</SelectItem>
                          <SelectItem value="replied">Respondeu</SelectItem>
                          <SelectItem value="failed">Não entregue</SelectItem>
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

                    {selectedIds.size > 0 && (
                      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/20 bg-primary/5 p-3">
                        <span className="text-sm font-medium text-foreground">{selectedIds.size} selecionado(s)</span>
                        <div className="flex-1" />
                        <Select value={bulkStageId} onValueChange={setBulkStageId}>
                          <SelectTrigger className="h-9 w-full rounded-xl bg-background text-sm">
                            <SelectValue placeholder="Mover para fase do CRM…" />
                          </SelectTrigger>
                          <SelectContent>
                            {/* Fase por regra não é destino, como no menu Mover do CRM: o
                                vínculo gravado nela tira o cliente do quadro. */}
                            {stages.filter((st) => !isConditionalStage(st)).map((st) => (
                              <SelectItem key={st.id} value={st.id}>
                                <span className="inline-flex items-center gap-2">
                                  <span
                                    className="inline-block h-2.5 w-2.5 rounded-full bg-muted-foreground"
                                    style={st.color ? { backgroundColor: st.color } : undefined}
                                  />
                                  {st.name}
                                </span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button size="sm" onClick={handleBulkMoveStage} disabled={!bulkStageId || movingBulk} className="rounded-xl">
                          {movingBulk ? "Movendo…" : "Mover"}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => { setSelectedIds(new Set()); setBulkStageId(""); }}
                          className="rounded-xl"
                        >
                          Cancelar
                        </Button>
                      </div>
                    )}

                    {/* Os destinatários em linhas (a tabela de 6 colunas rolava de
                        lado). Mesmo filtro, mesma seleção e o toque abre a ficha. */}
                    <div className="divide-y divide-border/60 overflow-hidden rounded-2xl border border-border/60">
                      {!loading && selecionaveis.length > 0 && (
                        <label className="flex items-center gap-3 bg-muted/40 px-3 py-2.5 text-[13px] font-medium text-muted-foreground">
                          <Checkbox
                            checked={todosSelecionados}
                            onCheckedChange={(v) => {
                              setSelectedIds((prev) => {
                                const next = new Set(prev);
                                if (v) selecionaveis.forEach((r) => next.add(r.clientId!));
                                else selecionaveis.forEach((r) => next.delete(r.clientId!));
                                return next;
                              });
                            }}
                            aria-label="Selecionar todos da página"
                          />
                          Selecionar todos desta página
                        </label>
                      )}
                      {loading ? (
                        <p className="py-8 text-center text-sm text-muted-foreground">Carregando…</p>
                      ) : pageItems.length === 0 ? (
                        <p className="py-8 text-center text-sm text-muted-foreground">Nenhum destinatário no filtro selecionado.</p>
                      ) : (
                        pageItems.map((r) => (
                          <div key={r.messageId} className="flex items-start gap-3 px-3 py-3">
                            <div className="pt-0.5">
                              {r.clientId ? (
                                <Checkbox
                                  checked={selectedIds.has(r.clientId)}
                                  onCheckedChange={() => toggleSelect(r.clientId!)}
                                  aria-label={`Selecionar ${r.clientName}`}
                                />
                              ) : (
                                <span className="block h-4 w-4" />
                              )}
                            </div>
                            <button
                              type="button"
                              disabled={!r.clientId}
                              onClick={() => handleOpenClient(r.clientId)}
                              className="min-w-0 flex-1 text-left"
                            >
                              <div className="flex items-baseline justify-between gap-2">
                                <p className="truncate text-[15px] font-medium text-foreground">{r.clientName}</p>
                                {r.converted ? (
                                  <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold text-success">
                                    <CheckCircle2 className="h-3.5 w-3.5" /> comprou
                                  </span>
                                ) : null}
                              </div>
                              <p className="truncate text-[12px] text-muted-foreground">
                                {r.phone} · {new Date(r.sentAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                              </p>
                              <span className={`mt-1 inline-flex w-fit items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_STYLE[r.status]}`}>
                                {STATUS_LABEL[r.status]}
                              </span>
                              {r.status === "failed" && r.failedReason && (
                                <p className="mt-0.5 truncate text-[11px] italic text-muted-foreground" title={r.failedReason}>
                                  {r.failedReason}
                                </p>
                              )}
                            </button>
                          </div>
                        ))
                      )}
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
                    label="Tempo médio até leitura"
                    avgSeconds={kpis.avg_time_to_read_seconds}
                    medianSeconds={kpis.median_time_to_read_seconds}
                    tone="primary"
                    loading={loading}
                    tooltip="Tempo entre o envio da mensagem e a confirmação de leitura (ticks azuis). Considera apenas mensagens lidas. Mediana é menos sensível a outliers que a média."
                  />
                  <AvgTimeKpi
                    label="Tempo médio até resposta"
                    avgSeconds={kpis.avg_time_to_reply_seconds}
                    medianSeconds={kpis.median_time_to_reply_seconds}
                    tone="warning"
                    loading={loading}
                    tooltip="Tempo entre a leitura da mensagem e a primeira resposta do cliente. Considera apenas mensagens que foram lidas E receberam resposta posterior. Reflete a reação real após visualizar."
                  />
                </div>
                <ReadHeatmap data={heatmap} loading={loading} />
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
