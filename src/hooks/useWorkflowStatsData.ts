import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { DailyPoint } from "@/components/workflow-stats/DailyEvolutionChart";
import type { PerformanceAlert } from "@/components/workflow-stats/PerformanceAlerts";

const STALE = 5 * 60 * 1000;
const MINUTO = 60 * 1000;

/**
 * Datas de janela ancoradas no MINUTO (06/10/2026).
 *
 * As queryKeys levavam `toISOString()` de um `new Date()` com milissegundos:
 * cada abertura (e cada troca de período) gerava uma chave nova, o cache nunca
 * era reaproveitado e o staleTime de 5 min não valia — toda volta à tela de
 * template refazia as consultas pesadas no banco já saturado.
 *
 * O início DESCE para o minuto cheio e o fim SOBE para o próximo minuto cheio:
 * a janela só alarga (menos de 1 min de cada lado), nunca perde envio — as
 * RPCs filtram `>= _start AND <= _end` e os dias do gráfico saem dos dados,
 * não de um generate_series. A consulta usa EXATAMENTE as datas da chave, para
 * o que está no cache corresponder à chave.
 */
export function inicioNoMinuto(d: Date): string {
  return new Date(Math.floor(d.getTime() / MINUTO) * MINUTO).toISOString();
}

export function fimNoMinuto(d: Date): string {
  return new Date(Math.ceil(d.getTime() / MINUTO) * MINUTO).toISOString();
}

/**
 * `refetchOnMount` por tela (06/10/2026). O padrão do App é 'always': toda
 * reabertura refaz a consulta, mesmo com o cache dentro do staleTime. A tela de
 * template passa `true` (reabrir em menos de 5 min usa o cache); quem não passa
 * nada (WorkflowStats) fica com o padrão do App.
 */
export interface OpcoesAoMontar {
  refetchOnMount?: boolean;
}

/** Só põe a chave quando veio: `refetchOnMount: undefined` no objeto da query
 *  SOBRESCREVE o padrão do App (o react-query espalha as opções por cima dos
 *  defaults) e vale como `true` — mudaria a WorkflowStats sem ninguém pedir. */
function aoMontar(opcoes?: OpcoesAoMontar): { refetchOnMount?: boolean } {
  return opcoes?.refetchOnMount === undefined ? {} : { refetchOnMount: opcoes.refetchOnMount };
}

/** Ponto de "melhor horário" (0-23h) devolvido por get_performance_stats.hourly */
export interface HourPoint {
  hour: number;
  sent: number;
  read: number;
}

/** Linha de template dentro de get_performance_stats.templates */
export interface TemplateStats {
  name: string;
  sent: number;
  delivered: number;
  read: number;
  failed?: number;
  replied?: number;
}

export interface PerformanceStats {
  sent: number;
  delivered: number;
  read: number;
  replied: number;
  /** Pessoas (conversas) que responderam a um template / que receberam um template entregue (09/10/2026). */
  repliedPeople: number;
  deliveredPeople: number;
  failed: number;
  templates: TemplateStats[];
  daily: DailyPoint[];
  hourly: HourPoint[];
}

/**
 * A Segunda Venda não tem filiais: get_performance_stats recebe apenas
 * (_seller_id, _start, _end). Nada de _include_network/_branch_ids.
 */
export function usePerformanceStats(
  sellerId: string | undefined,
  start: Date,
  end: Date,
  opcoes?: OpcoesAoMontar,
) {
  // Minuto cheio na chave e na chamada (06/10/2026) — ver inicioNoMinuto.
  const inicio = inicioNoMinuto(start);
  const fim = fimNoMinuto(end);
  return useQuery({
    queryKey: ["performance", "stats", sellerId, inicio, fim],
    enabled: !!sellerId,
    staleTime: STALE,
    refetchOnWindowFocus: false,
    ...aoMontar(opcoes),
    // Uma segunda tentativa: o timeout que sobra é de cache frio, e a segunda
    // chamada já encontra as páginas na memória.
    retry: 1,
    queryFn: async (): Promise<PerformanceStats> => {
      const { data, error } = await (supabase.rpc as any)("get_performance_stats", {
        _seller_id: sellerId,
        _start: inicio,
        _end: fim,
      });
      if (error) {
        // Erro tem de chegar à página COMO ERRO. Até 05/10/2026 este bloco
        // devolvia tudo zero: a RPC estourava os 8 s do PostgREST num seller
        // grande (Tevet) e a aba mostrava "0 disparos" em vez de avisar.
        console.error("[usePerformanceStats]", error);
        throw error;
      }
      const s: any = data || {};
      return {
        sent: Number(s.sent || 0),
        delivered: Number(s.delivered || 0),
        read: Number(s.read || 0),
        replied: Number(s.replied || 0),
        repliedPeople: Number(s.replied_people || 0),
        deliveredPeople: Number(s.delivered_people || 0),
        failed: Number(s.failed || 0),
        templates: ((s.templates as any[]) || []) as TemplateStats[],
        daily: ((s.daily as any[]) || []) as DailyPoint[],
        hourly: ((s.hourly as any[]) || []) as HourPoint[],
      };
    },
  });
}

export function usePerformanceAlerts(sellerId: string | undefined) {
  return useQuery({
    queryKey: ["performance", "alerts", sellerId],
    enabled: !!sellerId,
    staleTime: STALE,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<PerformanceAlert[]> => {
      const last24h = new Date(Date.now() - 86400000).toISOString();
      const [{ data: instances }, { data: queueFails }, { count: msgFailCount }] = await Promise.all([
        (supabase as any)
          .from("whatsapp_cloud_instances")
          .select("id, status")
          .eq("seller_id", sellerId as string),
        (supabase as any)
          .from("workflow_queue")
          .select("id")
          .eq("seller_id", sellerId as string)
          .eq("status", "failed")
          .gte("created_at", last24h),
        // `messages` na Segunda Venda não tem seller_id — o escopo vem da conversa.
        (supabase as any)
          .from("messages")
          .select("id, conversations!inner(seller_id)", { count: "exact", head: true })
          .eq("conversations.seller_id", sellerId as string)
          .eq("status", "failed")
          .gte("created_at", last24h),
      ]);

      const failTotal = (queueFails?.length || 0) + (msgFailCount || 0);
      const alerts: PerformanceAlert[] = [];
      if (failTotal > 0) {
        alerts.push({
          type: "error",
          message: `${failTotal} envio${failTotal > 1 ? "s" : ""} não entregue${failTotal > 1 ? "s" : ""} nas últimas 24h`,
          link: "/workflows",
        });
      }
      const hasConnected = (instances || []).some(
        (i: any) => i.status === "active" || i.status === "connected"
      );
      if (!hasConnected && (instances || []).length === 0) {
        alerts.push({
          type: "warning",
          message: "WhatsApp não conectado — configure para enviar mensagens",
          link: "/account?tab=whatsapp",
        });
      }
      return alerts;
    },
  });
}

export interface FailureReasonStat {
  reason: string;
  count: number;
}

export interface RecentFailure {
  id: string;
  source: "workflow" | "message";
  name: string;
  error: string;
  createdAt: string;
}

/** Agrupa `failed_reason` em top-5 motivos. */
function tallyReasons(rows: any[]): FailureReasonStat[] {
  const counts = new Map<string, number>();
  for (const row of rows || []) {
    const r = ((row as any).failed_reason || "Desconhecido").toString();
    counts.set(r, (counts.get(r) || 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
}

export function useWhatsAppFailures(sellerId: string | undefined, start: Date) {
  return useQuery({
    queryKey: ["performance", "whatsapp-failures", sellerId, start.toISOString()],
    enabled: !!sellerId,
    staleTime: STALE,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<FailureReasonStat[]> => {
      const { data, error } = await (supabase as any)
        .from("messages")
        .select("failed_reason, conversations!inner(seller_id)")
        .eq("conversations.seller_id", sellerId as string)
        .eq("direction", "outbound")
        .eq("status", "failed")
        .not("failed_reason", "is", null)
        .gte("created_at", start.toISOString())
        .limit(1000);
      if (error) {
        console.error("[useWhatsAppFailures]", error);
        return [];
      }
      return tallyReasons(data);
    },
  });
}

export function useWhatsAppAvgReadTime(sellerId: string | undefined, start: Date) {
  return useQuery({
    queryKey: ["performance", "whatsapp-avg-read-time", sellerId, start.toISOString()],
    enabled: !!sellerId,
    staleTime: STALE,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<number | null> => {
      // Mediana calculada no BANCO (percentile_cont): a versão anterior puxava
      // até 1.000 linhas cruas via PostgREST com join lateral — 5,5s de média
      // medidos no pg_stat_statements, era o que segurava a aba inteira.
      const { data, error } = await (supabase as any).rpc("get_whatsapp_median_read_minutes", {
        _seller_id: sellerId,
        _start: start.toISOString(),
      });
      if (error) {
        console.error("[useWhatsAppAvgReadTime]", error);
        return null;
      }
      return data === null || data === undefined ? null : Number(data);
    },
  });
}

/**
 * Motivos de falha de um template específico (página de detalhe).
 *
 * Desde 06/10/2026 é só o PLANO B: a get_template_performance nova devolve
 * `failure_reasons` no mesmo passe (o `env` já tem failed_reason), e esta
 * consulta PostgREST — 4,9 s frio no bitenfer, com RLS por linha — deixa de
 * rodar. A tela liga este hook (`opcoes.enabled`) só quando a resposta vem SEM
 * `failure_reasons`, ou seja, com a RPC antiga ainda no ar: front novo + RPC
 * velha continua mostrando os motivos.
 */
export function useTemplateFailures(
  sellerId: string | undefined,
  templateName: string | undefined,
  start: Date,
  end: Date,
  opcoes?: { enabled?: boolean } & OpcoesAoMontar,
) {
  // Minuto cheio na chave e na consulta (06/10/2026) — ver inicioNoMinuto.
  const inicio = inicioNoMinuto(start);
  const fim = fimNoMinuto(end);
  return useQuery({
    queryKey: ["template-failures", sellerId, templateName, inicio, fim],
    enabled: !!sellerId && !!templateName && (opcoes?.enabled ?? true),
    staleTime: STALE,
    refetchOnWindowFocus: false,
    ...aoMontar(opcoes),
    queryFn: async (): Promise<FailureReasonStat[]> => {
      const { data, error } = await (supabase as any)
        .from("messages")
        .select("failed_reason, conversations!inner(seller_id)")
        .eq("conversations.seller_id", sellerId as string)
        .eq("template_name", templateName as string)
        .eq("direction", "outbound")
        .eq("status", "failed")
        .not("failed_reason", "is", null)
        .gte("created_at", inicio)
        .lte("created_at", fim)
        .limit(5000);
      if (error) {
        console.error("[useTemplateFailures]", error);
        return [];
      }
      return tallyReasons(data);
    },
  });
}

/**
 * Busca o display_name de um template pelo nome técnico.
 *
 * ATENÇÃO: na Segunda Venda só `email_templates` tem a coluna `display_name`.
 * A tabela `whatsapp_templates` NÃO tem (colunas: name, category, components,
 * status, language, template_id...). Consultá-la devolveria 400 do PostgREST em
 * toda abertura da página de template, então o canal whatsapp nem chega a
 * consultar — o título cai no nome humanizado via resolveTemplateTitle().
 */
export function useTemplateDisplayName(
  sellerId: string | undefined,
  templateName: string | undefined,
  channel: "whatsapp" | "email" = "whatsapp",
) {
  return useQuery({
    queryKey: ["template-display-name", channel, sellerId, templateName],
    enabled: !!sellerId && !!templateName && channel === "email",
    staleTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await (supabase as any)
        .from("email_templates")
        .select("display_name")
        .eq("seller_id", sellerId)
        .eq("name", templateName)
        .maybeSingle();
      if (error || !data) return null;
      return (data as any).display_name ?? null;
    },
  });
}

export function useRecentFailures(sellerId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ["performance", "recent-failures", sellerId],
    enabled: !!sellerId && enabled,
    staleTime: STALE,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<RecentFailure[]> => {
      const last24h = new Date(Date.now() - 86400000).toISOString();
      const [{ data: queueRows, error: queueError }, { data: msgRows, error: msgError }] = await Promise.all([
        // Na Segunda Venda a coluna de erro da fila chama `error_message`.
        (supabase as any)
          .from("workflow_queue")
          .select("id, workflow_id, error_message, created_at")
          .eq("seller_id", sellerId as string)
          .eq("status", "failed")
          .not("error_message", "is", null)
          .gte("created_at", last24h)
          .order("created_at", { ascending: false })
          .limit(50),
        (supabase as any)
          .from("messages")
          .select("id, template_name, failed_reason, created_at, conversations!inner(seller_id)")
          .eq("conversations.seller_id", sellerId as string)
          .eq("status", "failed")
          .not("failed_reason", "is", null)
          .gte("created_at", last24h)
          .order("created_at", { ascending: false })
          .limit(50),
      ]);
      if (queueError) console.error("[useRecentFailures] workflow_queue", queueError);
      if (msgError) console.error("[useRecentFailures] messages", msgError);

      const workflowIds = ((queueRows || []) as any[])
        .map((r) => r.workflow_id)
        .filter(Boolean);
      const workflowNames = new Map<string, string>();
      if (workflowIds.length > 0) {
        const { data: workflows } = await (supabase as any)
          .from("workflows")
          .select("id, name")
          .in("id", workflowIds);
        for (const w of (workflows || []) as any[]) {
          workflowNames.set(w.id, w.name ?? "Workflow sem nome");
        }
      }

      const queueFailures: RecentFailure[] = ((queueRows || []) as any[]).map((r) => ({
        id: r.id,
        source: "workflow",
        name: workflowNames.get(r.workflow_id) ?? "Workflow desconhecido",
        error: r.error_message ?? "Erro desconhecido",
        createdAt: r.created_at,
      }));

      const msgFailures: RecentFailure[] = ((msgRows || []) as any[]).map((r) => ({
        id: r.id,
        source: "message",
        name: r.template_name ?? "Mensagem sem template",
        error: r.failed_reason ?? "Erro desconhecido",
        createdAt: r.created_at,
      }));

      return [...queueFailures, ...msgFailures]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 50);
    },
  });
}
