import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Brain,
  CalendarClock,
  CheckCircle2,
  Clock,
  DatabaseZap,
  FileText,
  GitBranch,
  Hourglass,
  Image as ImageIcon,
  Mail,
  MailCheck,
  MessageSquarePlus,
  MessageSquareText,
  MoveRight,
  PhoneOff,
  RefreshCw,
  Shuffle,
  Smartphone,
  Sparkles,
  Target,
  Timer,
  Truck,
  Video,
  Webhook,
  Zap,
} from "lucide-react";
import WhatsAppIcon from "@/components/WhatsAppIcon";
import { Badge } from "@/components/ui/badge";
import { BaseNode, type BaseNodeProps } from "@/components/workflow/nodes/BaseNode";
import { nodeLabel } from "@/components/workflow/nodeCatalog";
import { supabase } from "@/integrations/supabase/client";
import { isNodeConfigured } from "@/utils/nodeValidation";
import { summarizeSms } from "@/utils/sms";
import { getNodeStyle } from "@/utils/workflowColors";
import type { WorkflowNode, WorkflowNodeType } from "@/types/workflow";
import { cn } from "@/lib/utils";

/**
 * O cartão de uma etapa no fluxo aberto, com o cabeçalho que cada nó do editor
 * do site desenha (src/components/workflow/*Node.tsx): ícone, título, linha de
 * apoio, etiqueta, largura e o aviso de configuração. Os nós de lá não vêm
 * para o app porque dependem do React Flow; o corpo de cada cartão (resumo da
 * config, rótulos das saídas) fica de fora.
 */
export function CartaoDaEtapa({ no }: { no: WorkflowNode }) {
  const estilo = getNodeStyle(no.type);
  const c = (CABECALHOS as Partial<Record<string, (data: Dados) => Cabecalho>>)[no.type]?.(no.data);
  if (!c) return <BaseNode icon={IconeDesconhecido} title={no.data?.label || nodeLabel(no.type)} style={estilo} />;
  return (
    <BaseNode
      icon={c.icone}
      title={c.titulo}
      subtitle={c.subtitulo}
      headerBadge={c.selo}
      width={c.largura}
      style={estilo}
      isConfigured={c.configurada}
      showStatus={c.mostrarStatus}
    />
  );
}

type Cabecalho = {
  icone: BaseNodeProps["icon"];
  titulo: string;
  subtitulo?: ReactNode;
  selo?: ReactNode;
  largura?: number;
  configurada: boolean;
  mostrarStatus?: boolean;
};

type Dados = WorkflowNode["data"] | undefined;
// A config é um union de ~30 formatos; cada tipo lê só os campos dele.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const cfgDe = (data: Dados): any => data?.config ?? {};

const seloGatilho = (
  <span className="flex-shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">Gatilho</span>
);

const ESTRATEGIA: Record<string, string> = {
  balanced: "Balanceado por volume",
  "round-robin": "Revezamento (round-robin)",
  weighted: "Por pesos customizados",
};

const minutosCurto = (minutos: number) => {
  if (minutos < 60) return `${minutos}min`;
  if (minutos < 1440) return `${Math.floor(minutos / 60)}h`;
  return `${Math.floor(minutos / 1440)}d`;
};

/** Só o nome do arquivo: o caminho no bucket começa com o seller_id. */
const origemDoArquivo = (cfg: { mediaPath?: string; mediaUrl?: string }) =>
  cfg.mediaPath
    ? cfg.mediaPath.split("/").pop()
    : cfg.mediaUrl
      ? `${cfg.mediaUrl.replace(/^https?:\/\//i, "").slice(0, 32)}…`
      : undefined;

const CABECALHOS: Record<WorkflowNodeType, (data: Dados) => Cabecalho> = {
  trigger: (d) => ({ icone: Zap, titulo: d?.label || "Novo Pedido", configurada: isNodeConfigured("trigger", d) }),
  "retroactive-trigger": () => ({
    icone: DatabaseZap,
    titulo: "Disparo Retroativo",
    // No app o cartão não abre o disparo (é o botão Disparar): vale o texto
    // que o site usa para o cartão sem clique.
    subtitulo: "Público e cadência no sheet de disparo",
    configurada: true,
    mostrarStatus: false,
    selo: (
      <Badge
        variant="outline"
        className="border-amber-500/40 px-1.5 text-[10px] text-amber-700 dark:border-amber-400/40 dark:text-amber-300"
      >
        Gatilho
      </Badge>
    ),
  }),
  schedule: (d) => ({ icone: Clock, titulo: d?.label || "Programação", configurada: isNodeConfigured("schedule", d) }),
  whatsapp: (d) => ({
    icone: WhatsAppIcon,
    titulo: d?.label || "WhatsApp",
    configurada: isNodeConfigured("whatsapp", d),
    selo: (
      <span className="flex-shrink-0 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300">
        não oficial
      </span>
    ),
  }),
  "whatsapp-reply": (d) => ({
    icone: WhatsAppIcon,
    titulo: d?.label || "Responder WhatsApp",
    subtitulo: cfgDe(d).segundaSaida === true ? "Duas saídas em paralelo" : "Responde na conversa ativa",
    configurada: isNodeConfigured("whatsapp-reply", d),
  }),
  "message-received": (d) => ({
    icone: MessageSquareText,
    titulo: d?.label || "Mensagem Recebida",
    configurada: isNodeConfigured("message-received", d),
    selo: seloGatilho,
  }),
  "pipeline-stage-change": (d) => ({
    icone: GitBranch,
    titulo: "Mudança de Fase",
    configurada: isNodeConfigured("pipeline-stage-change", d),
  }),
  "rfv-segment-change": (d) => ({
    icone: Target,
    titulo: "Mudou de Segmento RFV",
    configurada: isNodeConfigured("rfv-segment-change", d),
  }),
  "move-to-stage": (d) => {
    const faseId: string | undefined = cfgDe(d).targetStageId;
    return {
      icone: MoveRight,
      titulo: "Mover para Fase",
      subtitulo: faseId ? <FaseDestino id={faseId} /> : undefined,
      configurada: isNodeConfigured("move-to-stage", d),
    };
  },
  "add-interaction": (d) => ({
    icone: MessageSquarePlus,
    titulo: d?.label || "Adicionar Notas",
    subtitulo: cfgDe(d).interactionType,
    configurada: isNodeConfigured("add-interaction", d),
  }),
  "ai-processor": (d) => ({
    icone: Sparkles,
    titulo: d?.label || "Processar com IA",
    configurada: isNodeConfigured("ai-processor", d),
  }),
  "ai-classifier": (d) => {
    const cfg = cfgDe(d);
    const categorias: unknown[] = cfg.categories || [];
    return {
      icone: Brain,
      titulo: "Classificar com IA",
      subtitulo: categorias.length > 0 && !cfg.prompt ? `${categorias.length} saídas` : undefined,
      largura: Math.max(220, categorias.length * 72),
      configurada: isNodeConfigured("ai-classifier", d),
    };
  },
  condition: (d) => {
    const condicoes: unknown[] = cfgDe(d).conditions || [];
    return {
      icone: GitBranch,
      titulo: "Condição",
      subtitulo: condicoes.length > 0 ? `${condicoes.length} condições configuradas` : undefined,
      configurada: isNodeConfigured("condition", d),
    };
  },
  "send-template": (d) => ({
    icone: WhatsAppIcon,
    titulo: "Enviar Template",
    subtitulo: cfgDe(d).templateName,
    configurada: isNodeConfigured("send-template", d),
  }),
  "webhook-call": (d) => ({
    icone: Webhook,
    titulo: "Webhook",
    subtitulo: cfgDe(d).method,
    configurada: isNodeConfigured("webhook-call", d),
  }),
  "invalid-number": () => ({
    icone: PhoneOff,
    titulo: "Número Incorreto",
    subtitulo: "Envia número para banco de dados",
    configurada: true,
    mostrarStatus: false,
    selo: (
      <Badge
        variant="outline"
        className="border-rose-300 px-1.5 text-[10px] text-rose-700 dark:border-rose-400/40 dark:text-rose-300"
      >
        Integração
      </Badge>
    ),
  }),
  "delay-dynamic": (d) => {
    const variavel = cfgDe(d).delayVariable;
    return {
      icone: Timer,
      titulo: "Delay Dinâmico",
      subtitulo: variavel ? `Variável: ${variavel}` : undefined,
      configurada: isNodeConfigured("delay-dynamic", d),
    };
  },
  "wait-for-reply": (d) => {
    const limite = cfgDe(d).timeoutMinutes;
    return {
      icone: Clock,
      titulo: "Aguardar Resposta",
      subtitulo: limite ? `Timeout: ${minutosCurto(limite)}` : undefined,
      configurada: isNodeConfigured("wait-for-reply", d),
    };
  },
  "order-status-change": (d) => ({
    icone: RefreshCw,
    titulo: d?.label || "Mudança de Status",
    configurada: (cfgDe(d).statuses || []).length > 0,
  }),
  "shipment-status-change": (d) => {
    const status: unknown[] = cfgDe(d).shipment_statuses || [];
    return {
      icone: Truck,
      titulo: d?.label || "Mudança de Status de Envio",
      largura: status.length > 1 ? Math.max(220, status.length * 110) : 220,
      configurada: status.length > 0,
    };
  },
  "distribute-to-stages": (d) => {
    const cfg = cfgDe(d);
    const fases = cfg.targetStageIds?.length || 0;
    return {
      icone: Shuffle,
      titulo: "Distribuir entre Fases",
      subtitulo:
        fases >= 2 ? `${fases} fases · ${ESTRATEGIA[cfg.strategy] || cfg.strategy}` : "Selecione no mínimo 2 fases",
      configurada: isNodeConfigured("distribute-to-stages", d) && fases >= 2,
    };
  },
  "queue-throttle": (d) => {
    const cfg = cfgDe(d);
    const configurada = isNodeConfigured("queue-throttle", d);
    return {
      icone: Hourglass,
      titulo: d?.label || "Fila de Envio",
      subtitulo: configurada
        ? cfg.rateMode === "interval_seconds"
          ? `1 a cada ${cfg.intervalSeconds}s`
          : `${cfg.ratePerMinute} msg/min`
        : undefined,
      configurada,
    };
  },
  "wait-for-status-change": (d) => {
    // Uma saída por status marcado, mais "Qualquer" e "Timeout". O site
    // descarta repetidos pela forma canônica do status; aqui, pelo texto.
    const status = new Set(
      ((cfgDe(d).statuses || []) as unknown[])
        .filter((s): s is string => typeof s === "string" && !!s.trim())
        .map((s) => s.trim().toLowerCase()),
    );
    return {
      icone: RefreshCw,
      titulo: "Aguardar Status",
      largura: Math.max(220, (status.size + 2) * 88),
      configurada: isNodeConfigured("wait-for-status-change", d),
    };
  },
  "delivery-forecast": (d) => {
    const cfg = cfgDe(d);
    const min = cfg.daysBeforeMin ?? cfg.daysBefore;
    const max = cfg.daysBeforeMax ?? cfg.daysBefore;
    return {
      icone: CalendarClock,
      titulo: d?.label || "Previsão de Entrega",
      configurada: Number.isInteger(min) && Number.isInteger(max) && min >= 0 && max >= min,
    };
  },
  "mark-forecast-opt-in": (d) => ({
    icone: CheckCircle2,
    titulo: d?.label || (cfgDe(d).revoke ? "Remover Opt-in Forecast" : "Marcar Opt-in Forecast"),
    configurada: true,
    mostrarStatus: false,
  }),
  "send-media": (d) => {
    const cfg = cfgDe(d);
    const video = cfg.mediaType === "video";
    return {
      icone: video ? Video : ImageIcon,
      titulo: `Enviar ${video ? "Vídeo" : "Imagem"}`,
      subtitulo: origemDoArquivo(cfg),
      configurada: isNodeConfigured("send-media", d),
    };
  },
  "send-document": (d) => {
    const cfg = cfgDe(d);
    return {
      icone: FileText,
      titulo: "Enviar Documento",
      subtitulo: cfg.filename || origemDoArquivo(cfg),
      configurada: isNodeConfigured("send-document", d),
    };
  },
  "email-send": (d) => ({
    icone: Mail,
    titulo: "Enviar E-mail",
    subtitulo: cfgDe(d).subject,
    configurada: isNodeConfigured("email-send", d),
  }),
  "email-template": (d) => {
    const cfg = cfgDe(d);
    return {
      icone: MailCheck,
      titulo: "Template de E-mail",
      subtitulo: cfg.template_id ? cfg.templateName || `Template ${String(cfg.template_id).slice(0, 8)}…` : undefined,
      configurada: isNodeConfigured("email-template", d),
    };
  },
  "send-sms-free": (d) => {
    const mensagem = cfgDe(d).message;
    const sms = summarizeSms(mensagem);
    return {
      icone: Smartphone,
      titulo: "Enviar SMS",
      subtitulo: mensagem ? `${sms.length} caracteres · ${sms.segments} SMS` : undefined,
      configurada: isNodeConfigured("send-sms-free", d),
    };
  },
  "send-sms-template": (d) => {
    const cfg = cfgDe(d);
    return {
      icone: MessageSquareText,
      titulo: "Template de SMS",
      subtitulo: cfg.templateId ? cfg.templateName || "Template selecionado" : undefined,
      configurada: isNodeConfigured("send-sms-template", d),
    };
  },
};

/** A config guarda só o id da fase de destino: nome e cor vêm do banco, como no site. */
function FaseDestino({ id }: { id: string }) {
  const { data: fase } = useQuery({
    queryKey: ["pipeline-stage", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("pipeline_stages").select("id, name, color").eq("id", id).maybeSingle();
      if (error) throw error;
      return data;
    },
    staleTime: 60_000,
  });
  return (
    <span className="flex items-center gap-1.5">
      {fase?.color && (
        <span className="inline-block h-2 w-2 flex-shrink-0 rounded-full" style={{ backgroundColor: fase.color }} />
      )}
      <span className="truncate">→ {fase?.name || "Carregando..."}</span>
    </span>
  );
}

/** Tipo de etapa que o app não conhece (gravado por uma versão mais nova do site). */
function IconeDesconhecido({ className }: { className?: string }) {
  return <span className={cn("block rounded-full bg-current opacity-40", className)} />;
}
