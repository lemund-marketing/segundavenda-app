import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Download, Loader2, ChevronDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatMarketplaceName } from "@/utils/formatters";
import { useSellerContext } from "@/contexts/SellerContext";
import { toast } from "sonner";
import { format } from "date-fns";
import { dataNascimentoBr, rotuloGenero } from "@/utils/genero";
import { ptBR } from "date-fns/locale";
import {
  ExportOrdersFilters,
  SentimentKey,
  defaultFilters,
  resolvePrefilters,
  buildOrdersExportQuery,
} from "@/lib/exportOrdersQuery";
import { mensagemDeErroDeFuncao } from "@/utils/functionError";

const BATCH_SIZE = 1000;
const LOCAL_CAP = 10000; // fast client-side path up to this many
const SERVER_CAP = 300000; // acompanha o HARD_CAP da edge function export-orders

const SENTIMENT_OPTIONS: { key: SentimentKey; label: string }[] = [
  { key: "positive", label: "Positivo" },
  { key: "neutral", label: "Neutro" },
  { key: "negative", label: "Negativo" },
  { key: "unclassified", label: "Não classificado" },
];

const RANGE_CHIPS = [
  { key: "7", label: "7 dias", days: 7 },
  { key: "30", label: "30 dias", days: 30 },
  { key: "90", label: "90 dias", days: 90 },
  { key: "365", label: "365 dias", days: 365 },
  { key: "custom", label: "Personalizado", days: 0 },
];

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function csvEscape(v: any): string {
  if (v == null) return "";
  const s = String(v);
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function fmtBRL(n: any): string {
  const num = Number(n);
  if (!Number.isFinite(num)) return "";
  return num.toFixed(2).replace(".", ",");
}

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    return format(new Date(iso), "dd/MM/yyyy HH:mm", { locale: ptBR });
  } catch {
    return "";
  }
}

const SENTIMENT_LABEL: Record<string, string> = {
  positive: "Positivo",
  neutral: "Neutro",
  negative: "Negativo",
};

export const ExportOrdersDialog = () => {
  const { activeSeller } = useSellerContext();
  const [open, setOpen] = useState(false);
  const [filters, setFilters] = useState<ExportOrdersFilters>(() => {
    const f = defaultFilters();
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - 30);
    f.startDate = isoDate(start);
    f.endDate = isoDate(end);
    return f;
  });
  const [rangeChip, setRangeChip] = useState<string>("30");

  const [availableMarketplaces, setAvailableMarketplaces] = useState<string[]>([]);
  // order_status é texto livre: "enviado", "ENVIADO" e "shipped" convivem no
  // banco. Cada opção aqui é um grupo normalizado (label) com TODAS as
  // variantes cruas dele — o filtro manda as variantes e fica exato.
  const [availableStatuses, setAvailableStatuses] = useState<{ label: string; variants: string[] }[]>([]);
  const [availableStates, setAvailableStates] = useState<string[]>([]);
  const [availableWorkflows, setAvailableWorkflows] = useState<{ id: string; name: string }[]>([]);

  const [count, setCount] = useState<number | null>(null);
  const [countLoading, setCountLoading] = useState(false);

  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");

  const [capDialogOpen, setCapDialogOpen] = useState(false);
  const [capCount, setCapCount] = useState(0);

  // Histórico de exportações (7 dias). Nasceu do dia em que o navegador engoliu
  // a parte1 de um export em 2 arquivos: com o histórico, cada arquivo tem seu
  // botão e nada se perde — e dá para rebaixar sem gerar tudo de novo.
  const [historico, setHistorico] = useState<any[]>([]);

  const sellerId = activeSeller?.id;

  // Load filter options when dialog opens
  useEffect(() => {
    if (!open || !sellerId) return;
    (async () => {
      const [mpRes, stRes, wfRes, osRes] = await Promise.all([
        // RPC com DISTINCT de verdade, não amostra: a versão antiga lia 5.000
        // pedidos sem ordenação e, em sellers grandes (o maior tem 207 mil),
        // um marketplace inteiro podia ficar de fora do seletor — foi assim
        // que o "retroativo" sumiu da exportação.
        supabase.rpc("get_seller_marketplaces", { p_seller_id: sellerId }),
        supabase
          .from("clients_sellers")
          .select("clients!inner(state_code)")
          .eq("seller_id", sellerId)
          .not("clients.state_code", "is", null)
          .limit(10000),
        supabase
          .from("workflows")
          .select("id, name")
          .eq("seller_id", sellerId)
          .eq("active", true)
          .order("name"),
        // RPC com DISTINCT de verdade, pelo mesmo motivo do marketplace: uma
        // amostra deixaria status raros de fora do seletor. Tolerante a erro:
        // se a RPC ainda não existir neste ambiente, a seção some da tela e o
        // resto do diálogo segue funcionando.
        // `as any`: a RPC é nova e o types.ts gerado ainda não a conhece —
        // mesmo padrão dos outros usos de tabela/função recém-criada no repo.
        (supabase.rpc as any)("get_seller_order_statuses", { p_seller_id: sellerId }),
      ]);
      {
        if (osRes.error) {
          console.warn("[export] get_seller_order_statuses falhou:", osRes.error.message);
          setAvailableStatuses([]);
        } else {
          const grupos = new Map<string, string[]>();
          for (const r of (osRes.data || []) as any[]) {
            const cru = String(r.order_status ?? "").trim();
            if (!cru) continue;
            const chave = cru.toLowerCase();
            grupos.set(chave, [...(grupos.get(chave) ?? []), cru]);
          }
          setAvailableStatuses(
            Array.from(grupos.entries())
              .map(([chave, variants]) => ({
                label: chave.charAt(0).toUpperCase() + chave.slice(1).replace(/_/g, " "),
                variants,
              }))
              .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"))
          );
        }
      }
      setAvailableMarketplaces(
        Array.from(new Set((mpRes.data || []).map((o: any) => o.marketplace).filter(Boolean))).sort()
      );
      if (mpRes.error) console.warn("[export] get_seller_marketplaces falhou:", mpRes.error.message);
      setAvailableStates(
        Array.from(
          new Set(
            (stRes.data || [])
              .map((r: any) => r.clients?.state_code)
              .filter(Boolean)
          )
        ).sort()
      );
      setAvailableWorkflows((wfRes.data || []).map((w: any) => ({ id: w.id, name: w.name })));
    })();
  }, [open, sellerId]);

  // Recompute count debounced when filters change
  const debounceRef = useRef<number | null>(null);
  useEffect(() => {
    if (!open || !sellerId) return;
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    setCountLoading(true);
    debounceRef.current = window.setTimeout(async () => {
      try {
        const pre = await resolvePrefilters(sellerId, filters);
        const q = buildOrdersExportQuery(sellerId, filters, pre, "id", "exact");
        const { count: c, error } = await q;
        if (error) throw error;
        setCount(c || 0);
      } catch (e) {
        console.error("[ExportOrders] count error", e);
        setCount(null);
      } finally {
        setCountLoading(false);
      }
    }, 500);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [open, sellerId, JSON.stringify(filters)]);

  const carregarHistorico = async () => {
    if (!sellerId) return;
    const { data } = await (supabase.from as any)("order_exports")
      .select("id, rows, bytes, parts, created_at, expires_at")
      .eq("seller_id", sellerId)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(5);
    setHistorico(data ?? []);
  };

  useEffect(() => {
    if (open && sellerId) void carregarHistorico();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sellerId]);

  const sentimentDisabled = filters.clientResponded === "no";

  function setRange(chipKey: string) {
    setRangeChip(chipKey);
    const chip = RANGE_CHIPS.find((c) => c.key === chipKey);
    if (!chip || chip.key === "custom") return;
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - chip.days);
    setFilters((f) => ({ ...f, startDate: isoDate(start), endDate: isoDate(end) }));
  }

  function clearFilters() {
    const f = defaultFilters();
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - 30);
    f.startDate = isoDate(start);
    f.endDate = isoDate(end);
    setFilters(f);
    setRangeChip("30");
  }

  async function serverExport(totalCount: number) {
    if (!sellerId) return;
    if (totalCount > SERVER_CAP) {
      setCapCount(totalCount);
      setCapDialogOpen(true);
      return;
    }
    setStatus(`Gerando no servidor (${totalCount.toLocaleString("pt-BR")} pedidos)...`);
    setProgress(15);
    const { data, error } = await supabase.functions.invoke("export-orders", {
      body: { sellerId, filters, totalCount },
    });
    if (error) throw error;
    if ((data as any)?.error) throw new Error((data as any).error);
    setProgress(95);
    // Acima de 40 MB o servidor fatia em partes (limite global de upload do
    // Storage é 50 MiB): `urls` traz todas; `url` sozinha é o caso comum.
    const urls: string[] = ((data as any)?.urls as string[] | undefined)
      ?? ((data as any)?.url ? [(data as any).url] : []);
    if (urls.length === 0) throw new Error("Servidor não retornou URL do arquivo");
    const stamp = format(new Date(), "yyyy-MM-dd_HHmm");
    for (let i = 0; i < urls.length; i++) {
      const a = document.createElement("a");
      a.href = urls[i];
      a.download = urls.length > 1
        ? `pedidos_segundavenda_${stamp}_parte${i + 1}.csv`
        : `pedidos_segundavenda_${stamp}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      // Pausa entre cliques: disparar vários downloads no mesmo tick faz o
      // navegador engolir todos menos o último.
      if (i < urls.length - 1) await new Promise((r) => setTimeout(r, 1200));
    }
    setProgress(100);
    setStatus("Concluído");
    const totalRows = ((data as any)?.rows || totalCount).toLocaleString("pt-BR");
    void carregarHistorico();
    if (urls.length > 1) {
      // NÃO fecha: o navegador pode ter engolido parte dos downloads
      // automáticos (aconteceu em 25/08 — só a parte2 chegou). O histórico
      // logo abaixo tem um botão por arquivo; nada se perde.
      toast.success(`Exportados ${totalRows} pedidos em ${urls.length} arquivos — confira os downloads; se faltar algum, baixe pelo histórico abaixo`);
    } else {
      toast.success(`Exportados ${totalRows} pedidos`);
      setOpen(false);
    }
  }

  async function doExport() {
    if (!sellerId) return;
    if (filters.minAmount != null && filters.maxAmount != null && filters.maxAmount < filters.minAmount) {
      toast.error("Valor máximo deve ser maior ou igual ao mínimo");
      return;
    }
    setExporting(true);
    setProgress(0);
    setStatus("Resolvendo filtros...");
    try {
      const pre = await resolvePrefilters(sellerId, filters);

      setStatus("Contando pedidos...");
      const countQ = buildOrdersExportQuery(sellerId, filters, pre, "id", "exact");
      const { count: total, error: countErr } = await countQ;
      if (countErr) throw countErr;
      const totalCount = total || 0;

      if (totalCount === 0) {
        toast("Nenhum pedido encontrado para os filtros selecionados.");
        return;
      }

      if (totalCount > LOCAL_CAP) {
        // Big volume → delegate to server (edge function)
        await serverExport(totalCount);
        return;
      }

      const selectExpr = `
        id,
        external_order_id,
        acquired_at,
        marketplace,
        order_status,
        total_amount,
        product,
        is_second_sale,
        whatsapp_contacted_at,
        client_id,
        clients(full_name, document, email, whatsapp, gender, birthdate, street, city, state_code, zip_code)
      `;

      const rows: any[] = [];
      let offset = 0;
      while (offset < totalCount) {
        const q = buildOrdersExportQuery(sellerId, filters, pre, selectExpr);
        const { data, error } = await q
          .order("acquired_at", { ascending: false })
          .range(offset, offset + BATCH_SIZE - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        rows.push(...data);
        offset += BATCH_SIZE;
        setProgress(Math.min((rows.length / totalCount) * 100, 99));
        setStatus(`Carregando ${rows.length.toLocaleString("pt-BR")} de ${totalCount.toLocaleString("pt-BR")}...`);
      }

      // Resolve responded/sentiment/workflow per order_id from prefilters
      setStatus("Enriquecendo dados de resposta e workflow...");
      const respondedSet = pre.respondedOrderIds || new Set<string>();

      // Sentiment per order: re-run mini fetch using messages to get latest sentiment per order.
      const orderIds = rows.map((r) => r.id);
      const orderSentiment = new Map<string, string>(); // 'positive'|'neutral'|'negative'|'unclassified'|'-'
      const orderWorkflow = new Map<string, string>();

      // Build map exec_id -> order_id + workflow_name via workflow_executions
      if (orderIds.length > 0) {
        const chunks: string[][] = [];
        for (let i = 0; i < orderIds.length; i += 500) chunks.push(orderIds.slice(i, i + 500));
        const execRows: any[] = [];
        for (const chunk of chunks) {
          const { data: execs } = await supabase
            .from("workflow_executions")
            .select("id, order_id, workflow_id, workflows(name)")
            .in("order_id", chunk);
          if (execs) execRows.push(...execs);
        }
        const orderToExecs = new Map<string, string[]>();
        const execToOrder = new Map<string, string>();
        for (const e of execRows) {
          execToOrder.set(e.id, e.order_id);
          if (!orderToExecs.has(e.order_id)) orderToExecs.set(e.order_id, []);
          orderToExecs.get(e.order_id)!.push(e.id);
          if (e.workflows?.name && !orderWorkflow.has(e.order_id)) {
            orderWorkflow.set(e.order_id, e.workflows.name);
          }
        }

        const allExecIds = Array.from(execToOrder.keys());
        if (allExecIds.length > 0) {
          const execChunks: string[][] = [];
          for (let i = 0; i < allExecIds.length; i += 500)
            execChunks.push(allExecIds.slice(i, i + 500));
          const inboundMsgs: any[] = [];
          for (const chunk of execChunks) {
            const { data: msgs } = await supabase
              .from("messages")
              .select("workflow_execution_id, ai_analyzed, ai_sentiment, created_at")
              .eq("direction", "inbound")
              .in("workflow_execution_id", chunk)
              .order("created_at", { ascending: false });
            if (msgs) inboundMsgs.push(...msgs);
          }
          // Pick the most recent inbound per order
          const pickedExec = new Set<string>();
          for (const m of inboundMsgs) {
            const oid = execToOrder.get(m.workflow_execution_id);
            if (!oid || orderSentiment.has(oid)) continue;
            const classified = m.ai_analyzed === true && !!m.ai_sentiment;
            orderSentiment.set(oid, classified ? m.ai_sentiment : "unclassified");
            pickedExec.add(m.workflow_execution_id);
          }
        }
      }

      setStatus("Gerando CSV...");
      const headers = [
        "Data Pedido",
        "ID Pedido",
        "Marketplace",
        "Status Pedido",
        "Valor (BRL)",
        "Cliente",
        "Documento",
        "Email",
        "WhatsApp",
        "Gênero",
        "Data de Nascimento",
        "Endereço",
        "Cidade",
        "UF",
        "CEP",
        "Produto",
        "Segunda Venda",
        "WhatsApp Enviado",
        "Data Envio WhatsApp",
        "Cliente Respondeu",
        "Sentimento Resposta",
        "Workflow Disparado",
      ];

      const lines = [headers.join(",")];
      for (const o of rows) {
        const responded = respondedSet.has(o.id);
        const sentRaw = orderSentiment.get(o.id);
        const sentLabel = !responded
          ? "—"
          : sentRaw === "unclassified" || !sentRaw
            ? "Não classificado"
            : SENTIMENT_LABEL[sentRaw] || "Não classificado";
        lines.push(
          [
            csvEscape(fmtDateTime(o.acquired_at)),
            csvEscape(o.external_order_id || o.id),
            csvEscape(formatMarketplaceName(o.marketplace || "")),
            csvEscape(o.order_status || ""),
            csvEscape(fmtBRL(o.total_amount)),
            csvEscape(o.clients?.full_name || ""),
            csvEscape(o.clients?.document || ""),
            csvEscape(o.clients?.email || ""),
            csvEscape(o.clients?.whatsapp || ""),
            csvEscape(rotuloGenero(o.clients?.gender)),
            csvEscape(dataNascimentoBr(o.clients?.birthdate)),
            csvEscape(o.clients?.street || ""),
            csvEscape(o.clients?.city || ""),
            csvEscape(o.clients?.state_code || ""),
            csvEscape(o.clients?.zip_code || ""),
            csvEscape(o.product || ""),
            csvEscape(o.is_second_sale ? "Sim" : "Não"),
            csvEscape(o.whatsapp_contacted_at ? "Sim" : "Não"),
            csvEscape(fmtDateTime(o.whatsapp_contacted_at)),
            csvEscape(responded ? "Sim" : "Não"),
            csvEscape(sentLabel),
            csvEscape(orderWorkflow.get(o.id) || ""),
          ].join(",")
        );
      }

      const csv = lines.join("\n");
      const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const fname = `pedidos_segundavenda_${format(new Date(), "yyyy-MM-dd_HHmm")}.csv`;
      a.download = fname;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setProgress(100);
      setStatus("Concluído");
      toast.success(`Exportados ${rows.length.toLocaleString("pt-BR")} pedidos`);
      setOpen(false);
    } catch (e: any) {
      console.error("[ExportOrders] export error", e);
      // O supabase-js devolve sempre a mesma frase ("non-2xx status code") e
      // deixa o motivo no corpo da resposta. Sem desembrulhar, todo erro do
      // servidor chegava aqui como "erro de edge function" e não dava para
      // saber se foi permissão, sessão ou falha de verdade.
      const message = await mensagemDeErroDeFuncao(
        e,
        "Erro inesperado ao exportar pedidos.",
      );
      toast.error(`Erro ao exportar pedidos: ${message}`);
    } finally {
      setExporting(false);
      setProgress(0);
      setStatus("");
    }
  }

  const btnLabel = useMemo(() => {
    if (exporting) return "Exportando...";
    if (countLoading) return "Calculando...";
    if (count == null) return "Exportar";
    if (count === 0) return "Nenhum pedido encontrado";
    return `Exportar (${count.toLocaleString("pt-BR")} pedidos)`;
  }, [exporting, countLoading, count]);

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => !exporting && setOpen(v)}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm">
            <Download className="w-4 h-4 mr-2" />
            Exportar Dados
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Exportar pedidos</DialogTitle>
          </DialogHeader>

          <div className="space-y-5 py-2">
            {/* Período */}
            <div className="space-y-2">
              <Label>Período</Label>
              <div className="flex flex-wrap gap-2">
                {RANGE_CHIPS.map((c) => (
                  <Badge
                    key={c.key}
                    variant={rangeChip === c.key ? "default" : "outline"}
                    className="cursor-pointer"
                    onClick={() => setRange(c.key)}
                  >
                    {c.label}
                  </Badge>
                ))}
              </div>
              {rangeChip === "custom" && (
                <div className="grid grid-cols-2 gap-2 pt-2">
                  <div>
                    <Label className="text-xs">Início</Label>
                    <Input
                      type="date"
                      value={filters.startDate}
                      onChange={(e) => setFilters((f) => ({ ...f, startDate: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Fim</Label>
                    <Input
                      type="date"
                      value={filters.endDate}
                      onChange={(e) => setFilters((f) => ({ ...f, endDate: e.target.value }))}
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              {/* Marketplaces */}
              <div className="space-y-2">
                <Label>Marketplaces</Label>
                <MultiSelectPopover
                  options={availableMarketplaces.map((m) => ({
                    value: m,
                    label: formatMarketplaceName(m),
                  }))}
                  selected={filters.marketplaces}
                  onChange={(v) => setFilters((f) => ({ ...f, marketplaces: v }))}
                  placeholder="Todos os marketplaces"
                />
              </div>

              {/* UF */}
              <div className="space-y-2">
                <Label>Estado (UF)</Label>
                <MultiSelectPopover
                  options={availableStates.map((s) => ({ value: s, label: s }))}
                  selected={filters.states}
                  onChange={(v) => setFilters((f) => ({ ...f, states: v }))}
                  placeholder="Todos os estados"
                />
              </div>

              {/* Status do pedido — SEMPRE visível, como os filtros irmãos:
                  escondida quando vazia, a seção parecia não existir (conta sem
                  pedidos mostra "Nenhum disponível", igual Marketplaces/UF).
                  A seleção é por GRUPO normalizado; filters.statuses guarda as
                  variantes cruas do grupo, então a seleção é derivada, não
                  estado próprio — e o "Limpar filtros" a zera de graça. */}
              {(
                <div className="space-y-2 md:col-span-2">
                  <Label>Status do pedido</Label>
                  <MultiSelectPopover
                    options={availableStatuses.map((g) => ({
                      value: g.label,
                      label: g.variants.length > 1 ? `${g.label} (${g.variants.length} grafias)` : g.label,
                    }))}
                    selected={availableStatuses
                      .filter((g) => g.variants.every((v) => filters.statuses.includes(v)))
                      .map((g) => g.label)}
                    onChange={(labels) =>
                      setFilters((f) => ({
                        ...f,
                        statuses: availableStatuses
                          .filter((g) => labels.includes(g.label))
                          .flatMap((g) => g.variants),
                      }))
                    }
                    placeholder="Todos os status"
                  />
                </div>
              )}

              {/* Faixa de valor */}
              <div className="space-y-2">
                <Label>Faixa de valor (R$)</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    type="number"
                    placeholder="Mínimo"
                    value={filters.minAmount ?? ""}
                    onChange={(e) =>
                      setFilters((f) => ({
                        ...f,
                        minAmount: e.target.value === "" ? null : Number(e.target.value),
                      }))
                    }
                  />
                  <Input
                    type="number"
                    placeholder="Máximo"
                    value={filters.maxAmount ?? ""}
                    onChange={(e) =>
                      setFilters((f) => ({
                        ...f,
                        maxAmount: e.target.value === "" ? null : Number(e.target.value),
                      }))
                    }
                  />
                </div>
              </div>

              {/* Workflows */}
              <div className="space-y-2">
                <Label>Workflow disparado</Label>
                <MultiSelectPopover
                  options={availableWorkflows.map((w) => ({ value: w.id, label: w.name }))}
                  selected={filters.workflowIds}
                  onChange={(v) => setFilters((f) => ({ ...f, workflowIds: v }))}
                  placeholder="Todos os workflows"
                />
              </div>

              {/* WhatsApp enviado */}
              <div className="space-y-2">
                <Label>WhatsApp enviado</Label>
                <RadioGroup
                  value={filters.whatsappContacted}
                  onValueChange={(v) =>
                    setFilters((f) => ({ ...f, whatsappContacted: v as any }))
                  }
                  className="flex gap-4"
                >
                  {["all", "yes", "no"].map((v) => (
                    <label key={v} className="flex items-center gap-2 text-sm cursor-pointer">
                      <RadioGroupItem value={v} />
                      {v === "all" ? "Todos" : v === "yes" ? "Sim" : "Não"}
                    </label>
                  ))}
                </RadioGroup>
              </div>

              {/* Cliente respondeu */}
              <div className="space-y-2">
                <Label>Cliente respondeu</Label>
                <RadioGroup
                  value={filters.clientResponded}
                  onValueChange={(v) =>
                    setFilters((f) => ({ ...f, clientResponded: v as any }))
                  }
                  className="flex gap-4"
                >
                  {["all", "yes", "no"].map((v) => (
                    <label key={v} className="flex items-center gap-2 text-sm cursor-pointer">
                      <RadioGroupItem value={v} />
                      {v === "all" ? "Todos" : v === "yes" ? "Sim" : "Não"}
                    </label>
                  ))}
                </RadioGroup>
              </div>

              {/* Cliente vinculado */}
              <div className="space-y-2">
                <Label>Cliente vinculado</Label>
                <RadioGroup
                  value={filters.hasClient}
                  onValueChange={(v) => setFilters((f) => ({ ...f, hasClient: v as any }))}
                  className="flex gap-4"
                >
                  {["all", "yes", "no"].map((v) => (
                    <label key={v} className="flex items-center gap-2 text-sm cursor-pointer">
                      <RadioGroupItem value={v} />
                      {v === "all" ? "Todos" : v === "yes" ? "Sim" : "Não"}
                    </label>
                  ))}
                </RadioGroup>
              </div>

              {/* Sentimento */}
              <div className="space-y-2 md:col-span-2">
                <div className="flex items-center gap-2">
                  <Label className={sentimentDisabled ? "text-muted-foreground" : ""}>
                    Sentimento da resposta
                  </Label>
                  {sentimentDisabled && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="text-xs text-muted-foreground cursor-help">
                            (indisponível)
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          Disponível quando "Cliente respondeu" = Todos ou Sim
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {SENTIMENT_OPTIONS.map((opt) => {
                    const selected = filters.sentiments.includes(opt.key);
                    return (
                      <Badge
                        key={opt.key}
                        variant={selected ? "default" : "outline"}
                        className={`cursor-pointer ${sentimentDisabled ? "opacity-50 pointer-events-none" : ""}`}
                        onClick={() => {
                          setFilters((f) => ({
                            ...f,
                            sentiments: selected
                              ? f.sentiments.filter((s) => s !== opt.key)
                              : [...f.sentiments, opt.key],
                          }));
                        }}
                      >
                        {opt.label}
                      </Badge>
                    );
                  })}
                </div>
              </div>
            </div>

            {historico.length > 0 && (
              <div className="space-y-2 rounded-lg border p-3">
                <p className="text-sm font-medium">Exportações recentes <span className="text-xs font-normal text-muted-foreground">(links válidos por 7 dias)</span></p>
                <div className="space-y-1.5">
                  {historico.map((h) => (
                    <div key={h.id} className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="text-muted-foreground tabular-nums">
                        {format(new Date(h.created_at), "dd/MM HH:mm")}
                      </span>
                      <span className="tabular-nums">{Number(h.rows).toLocaleString("pt-BR")} pedidos</span>
                      <span className="flex gap-1.5 ml-auto">
                        {(Array.isArray(h.parts) ? h.parts : []).map((p: any, i: number) => (
                          <a
                            key={i}
                            href={p.url}
                            target="_blank"
                            rel="noopener"
                            className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs hover:bg-primary hover:border-primary hover:text-primary-foreground transition-colors"
                          >
                            <Download className="h-3 w-3" />
                            {h.parts.length > 1 ? `Parte ${i + 1}` : "Baixar"}
                            <span className="text-muted-foreground group-hover:text-inherit">
                              {p.bytes ? `· ${Math.round(p.bytes / 1048576)} MB` : ""}
                            </span>
                          </a>
                        ))}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {exporting && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{status}</span>
                  <span className="font-medium">{Math.round(progress)}%</span>
                </div>
                <Progress value={progress} className="h-2" />
              </div>
            )}
          </div>

          <DialogFooter className="flex sm:justify-between gap-2">
            <Button variant="ghost" onClick={clearFilters} disabled={exporting}>
              Limpar filtros
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setOpen(false)} disabled={exporting}>
                Cancelar
              </Button>
              <Button
                onClick={doExport}
                disabled={exporting || countLoading || (count != null && count === 0)}
              >
                {exporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
                {btnLabel}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={capDialogOpen} onOpenChange={setCapDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Volume excede o limite</AlertDialogTitle>
            <AlertDialogDescription>
              Sua seleção retornou {capCount.toLocaleString("pt-BR")} pedidos. O limite máximo de
              exportação é {SERVER_CAP.toLocaleString("pt-BR")} pedidos por arquivo. Refine os
              filtros (período, marketplace, etc.) e tente novamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setCapDialogOpen(false)}>
              Entendi
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

/* ---------------- helpers ---------------- */

interface MSOption {
  value: string;
  label: string;
}

const MultiSelectPopover = ({
  options,
  selected,
  onChange,
  placeholder,
}: {
  options: MSOption[];
  selected: string[];
  onChange: (v: string[]) => void;
  placeholder: string;
}) => {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          disabled={options.length === 0}
          className="justify-between font-normal w-full"
        >
          <span className="truncate">
            {selected.length === 0
              ? options.length === 0
                ? "Nenhum disponível"
                : placeholder
              : `${selected.length} selecionado(s)`}
          </span>
          <ChevronDown className="w-4 h-4 ml-2 opacity-50 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[340px] p-0" align="start">
        <div className="flex items-center justify-between p-2 border-b">
          <button
            type="button"
            className="text-xs text-primary hover:underline"
            onClick={() => onChange(options.map((o) => o.value))}
          >
            Selecionar todos
          </button>
          <button
            type="button"
            className="text-xs text-muted-foreground hover:underline"
            onClick={() => onChange([])}
          >
            Limpar
          </button>
        </div>
        <ScrollArea className="max-h-64">
          <div className="p-2 space-y-1">
            {options.map((opt) => {
              const checked = selected.includes(opt.value);
              return (
                <label
                  key={opt.value}
                  className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent cursor-pointer"
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(v) =>
                      onChange(v ? [...selected, opt.value] : selected.filter((s) => s !== opt.value))
                    }
                  />
                  <span className="text-sm">{opt.label}</span>
                </label>
              );
            })}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
};
