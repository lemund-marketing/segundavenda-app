import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SkeletonAbaSms } from '@/components/skeletons/WorkflowStatsSkeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Send, CheckCircle2, Eye, MousePointerClick, DollarSign, AlertTriangle,
  Smartphone, Trophy, Medal, Award, AlertCircle, Clock,
} from 'lucide-react';
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis,
  Tooltip as RTooltip, CartesianGrid, Legend, Cell,
} from 'recharts';
import { motion } from 'framer-motion';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import {
  SmsPerformanceTemplateCard,
  type SmsPerfTemplate,
} from '@/components/sms/SmsPerformanceTemplateCard';
import { KpiPadrao } from '@/components/kpi/KpiPadrao';

// Entrada em cascata dos cards de KPI (mesmo timing do SmsKpiCard aposentado).
const KPI_ITEM = { hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } };

// Paleta por token da Segunda Venda — nenhum hex do Segundo Pedido.
const C_PRIMARY = 'hsl(var(--chart-1))';   // verde da marca
const C_TEAL = 'hsl(var(--chart-5))';
const C_BLUE = 'hsl(var(--chart-4))';
const C_PURPLE = 'hsl(var(--chart-2))';    // roxo (secundária)
// Cinza de propósito (20/08): não entregue é rotina de canal, não alarme.
const C_RED = 'hsl(var(--muted-foreground))';

interface Props {
  sellerId: string | undefined;
  startDate: Date;
  endDate: Date;
}

interface SmsStats {
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
  top_templates: Array<{
    template_name: string; template_id: string | null; template_category_id: string | null;
    sent: number; delivered: number; failed: number; cost_cents: number;
    unique_clicks?: number; click_count?: number; sent_with_link?: number;
  }>;
  by_category: Array<any>;
  by_origin?: { workflow: number; manual_omnichannel: number; admin_panel: number } | null;
}

const fmtBRL = (cents: number) =>
  (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const fmtNum = (n: number) => n.toLocaleString('pt-BR');

function fmtDuration(sec: number | null | undefined): string {
  if (!sec || sec <= 0) return '—';
  if (sec < 60) return `${Math.round(sec)}s`;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec - m * 60);
  if (m < 60) return s ? `${m}m ${s}s` : `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m - h * 60;
  return rem ? `${h}h ${rem}m` : `${h}h`;
}

export function SmsWorkflowTab({ sellerId, startDate, endDate }: Props) {
  // --- RPC principal ---
  // A queryKey é intencionalmente IGUAL à usada na visão geral do WorkflowStats:
  // as duas telas compartilham o mesmo cache do React Query.
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['sms-performance-stats', sellerId, startDate.toISOString(), endDate.toISOString()],
    enabled: !!sellerId,
    queryFn: async (): Promise<SmsStats> => {
      // A Segunda Venda não tem filiais: não passamos _branch.
      const { data, error } = await (supabase as any).rpc('get_sms_performance_stats', {
        _seller_id: sellerId,
        _start: startDate.toISOString(),
        _end: endDate.toISOString(),
      });
      if (error) throw error;
      return data as SmsStats;
    },
  });

  // --- complemento: mensagens cruas para horário + falhas (limitado) ---
  const { data: raw } = useQuery({
    queryKey: ['sms-raw-supplement', sellerId, startDate.toISOString(), endDate.toISOString()],
    enabled: !!sellerId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('sms_messages')
        .select('created_at,status,error_message')
        .eq('seller_id', sellerId)
        .in('sent_via', ['workflow', 'manual_omnichannel', 'admin_panel'])
        .gte('created_at', startDate.toISOString())
        .lte('created_at', endDate.toISOString())
        .order('created_at', { ascending: false })
        .limit(2000);
      if (error) throw error;
      return (data || []) as Array<{ created_at: string; status: string; error_message: string | null }>;
    },
  });

  // --- lista de templates (grid completo) ---
  const { data: templates } = useQuery({
    queryKey: ['sms-templates-active', sellerId],
    enabled: !!sellerId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('sms_templates')
        .select('id,name,body,category:sms_template_categories(name,color)')
        .eq('seller_id', sellerId)
        .eq('status', 'active')
        .order('name');
      if (error) throw error;
      return (data || []) as Array<{
        id: string; name: string; body: string;
        category: { name: string; color: string } | null;
      }>;
    },
  });

  // --- derivados ---
  const k = data?.kpis ?? {
    sent: 0, delivered: 0, failed: 0, blocked: 0, cost_cents_total: 0, segments_total: 0,
    avg_delivery_seconds: 0, sent_with_link: 0, unique_clicks: 0, total_clicks: 0, avg_seconds_to_first_click: 0,
  };
  const totalSent = k.sent + k.failed;
  const acceptanceRate = totalSent ? (k.sent / totalSent) * 100 : 0;
  const failureRate = totalSent ? (k.failed / totalSent) * 100 : 0;
  const deliveryRate = k.sent ? (k.delivered / k.sent) * 100 : 0;
  const avgCost = k.sent ? Math.round(k.cost_cents_total / k.sent) : 0;
  const uniqueClicks = k.unique_clicks ?? 0;
  const clickRate = k.delivered ? (uniqueClicks / k.delivered) * 100 : 0;

  const merged: SmsPerfTemplate[] = useMemo(() => {
    const byName = new Map<string, SmsPerfTemplate>();
    (templates || []).forEach((t) => {
      byName.set(t.name, {
        name: t.name, body: t.body, category: t.category,
        sent: 0, delivered: 0, failed: 0, cost_cents: 0,
        unique_clicks: 0, click_count: 0, sent_with_link: 0,
      });
    });
    (data?.top_templates || []).forEach((t) => {
      const existing = byName.get(t.template_name);
      if (existing) {
        existing.sent = t.sent; existing.delivered = t.delivered;
        existing.failed = t.failed; existing.cost_cents = t.cost_cents;
        existing.unique_clicks = t.unique_clicks ?? 0;
        existing.click_count = t.click_count ?? 0;
        existing.sent_with_link = t.sent_with_link ?? 0;
      } else {
        byName.set(t.template_name, {
          name: t.template_name, body: null, category: null,
          sent: t.sent, delivered: t.delivered, failed: t.failed, cost_cents: t.cost_cents,
          unique_clicks: t.unique_clicks ?? 0, click_count: t.click_count ?? 0, sent_with_link: t.sent_with_link ?? 0,
        });
      }
    });
    return Array.from(byName.values()).sort((a, b) => b.sent - a.sent);
  }, [templates, data?.top_templates]);

  // Top 3 por cliques (cai para envios quando ainda não há clique)
  const anyClicks = merged.some((t) => (t.unique_clicks ?? 0) > 0);
  const topThree = anyClicks
    ? [...merged]
        .sort((a, b) => (b.unique_clicks ?? 0) - (a.unique_clicks ?? 0) || b.sent - a.sent)
        .filter((t) => t.sent > 0)
        .slice(0, 3)
    : merged.filter((t) => t.sent > 0).slice(0, 3);
  const noData = totalSent === 0;

  // `!sellerId` desabilita a query: nesse caso o React Query nem marca isLoading,
  // então tratamos como carregando (o AppLayout já cobra a escolha do seller).
  // O esqueleto prometia outra tela: 6 retângulos em 3 colunas (a aba tem 8
  // KPIs em 4), um bloco de 128px no lugar do funil e nada no lugar dos
  // templates. Agora vem do WorkflowStatsSkeleton, que espelha esta aba.
  if (isLoading || !sellerId) {
    return <SkeletonAbaSms />;
  }

  // Sem este bloco, um erro da RPC (ex.: SMS ainda não liberado para o seller)
  // deixava `data` undefined e a aba ficava eternamente em skeleton, sem avisar nada.
  if (isError || !data) {
    return (
      <Card className="rounded-2xl border-dashed border-2">
        <CardContent className="p-8 text-center">
          <AlertTriangle className="w-10 h-10 mx-auto mb-2 text-warning" />
          <p className="font-semibold text-foreground">Não foi possível carregar as métricas de SMS</p>
          <p className="text-sm text-muted-foreground mt-1">
            {(error as any)?.message || 'Tente novamente em instantes.'}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* === KPIs === */}
      {/* KpiPadrao (21/08) — o motion.div em volta de cada card preserva o
          stagger de entrada que o SmsKpiCard antigo carregava embutido. */}
      <motion.div
        className="grid grid-cols-2 lg:grid-cols-4 gap-2 md:gap-3"
        initial="hidden" animate="show"
        variants={{ show: { transition: { staggerChildren: 0.05 } } }}
      >
        <motion.div variants={KPI_ITEM}>
          <KpiPadrao
            titulo="Total Enviados"
            valor={fmtNum(totalSent)}
            apoio="no período"
            icone={Send}
            className="h-full"
            tooltip="Todos os SMS que a loja tentou enviar no período — por workflow, omnichannel ou painel — incluindo os que não foram entregues."
          />
        </motion.div>
        <motion.div variants={KPI_ITEM}>
          <KpiPadrao
            titulo="Taxa de Aceitação"
            valor={`${acceptanceRate.toFixed(1)}%`}
            apoio={`${fmtNum(k.sent)} aceitos de ${fmtNum(totalSent)}`}
            icone={CheckCircle2}
            className="h-full"
            tooltip="SMS que a operadora aceitou para envio, divididos pelo total de envios do período. Número inválido ou bloqueado é recusado já nesta etapa."
          />
        </motion.div>
        <motion.div variants={KPI_ITEM}>
          <KpiPadrao
            titulo="Taxa de Entrega"
            valor={`${deliveryRate.toFixed(1)}%`}
            apoio={`${fmtNum(k.delivered)} entregues de ${fmtNum(k.sent)} aceitos`}
            icone={Eye}
            className="h-full"
            tooltip="SMS com entrega confirmada pela operadora, divididos pelos aceitos. Clique no link do SMS também vale como confirmação de entrega."
          />
        </motion.div>
        <motion.div variants={KPI_ITEM}>
          <KpiPadrao
            titulo="Taxa de Clique"
            valor={k.delivered ? `${clickRate.toFixed(1)}%` : '—'}
            apoio={`${fmtNum(uniqueClicks)} cliques únicos de ${fmtNum(k.delivered)} entregues`}
            icone={MousePointerClick}
            className="h-full"
            tooltip="Percentual de clientes que clicaram pelo menos uma vez no link rastreável do SMS."
          />
        </motion.div>
        <motion.div variants={KPI_ITEM}>
          <KpiPadrao
            titulo="Custo Total"
            valor={fmtBRL(k.cost_cents_total)}
            apoio={`${fmtBRL(avgCost)}/envio em média`}
            icone={DollarSign}
            className="h-full"
            tooltip="Soma do custo dos SMS aceitos pela operadora no período. Envio recusado não é cobrado."
          />
        </motion.div>
        <motion.div variants={KPI_ITEM}>
          <KpiPadrao
            titulo="Taxa de não entrega"
            valor={`${failureRate.toFixed(1)}%`}
            apoio={`${fmtNum(k.failed)} não entregues em ${fmtNum(totalSent)} envios`}
            icone={AlertTriangle}
            className="h-full"
            tooltip="SMS que não chegaram — falha, expiração, rejeição, bloqueio ou número inválido — divididos pelo total de envios do período."
          />
        </motion.div>
        <motion.div variants={KPI_ITEM}>
          <KpiPadrao
            titulo="Tempo até 1º clique"
            valor={fmtDuration(k.avg_seconds_to_first_click)}
            apoio={uniqueClicks > 0 ? 'média entre entrega e primeiro clique' : 'sem cliques no período'}
            icone={Clock}
            className="h-full"
            tooltip="Tempo médio entre a entrega do SMS (ou o envio, quando a operadora não confirma a entrega) e o primeiro clique no link."
          />
        </motion.div>
        <motion.div variants={KPI_ITEM}>
          <KpiPadrao
            titulo="Tempo médio de entrega"
            valor={fmtDuration(k.avg_delivery_seconds)}
            apoio={k.delivered > 0 ? 'entre envio e confirmação do operador' : 'sem entregas confirmadas'}
            icone={Clock}
            className="h-full"
            tooltip="Tempo médio entre o disparo do SMS e o callback de entrega (DLR) da operadora."
          />
        </motion.div>
      </motion.div>

      {/* === Breakdown por origem === */}
      {data.by_origin &&
        (data.by_origin.workflow + data.by_origin.manual_omnichannel + data.by_origin.admin_panel) > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground -mt-2">
          <span className="font-medium text-foreground">
            Enviados: {fmtNum(data.by_origin.workflow + data.by_origin.manual_omnichannel + data.by_origin.admin_panel)}
          </span>
          <span>
            ({fmtNum(data.by_origin.workflow)} workflow · {fmtNum(data.by_origin.manual_omnichannel)} omnichannel · {fmtNum(data.by_origin.admin_panel)} admin)
          </span>
        </div>
      )}

      {/* === Funil === */}
      <Card className="rounded-2xl shadow-sm">
        <CardContent className="p-6">
          <h3 className="text-sm font-semibold text-foreground mb-4">Funil de Mensagens</h3>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <FunnelCard icon={Send} barClass="bg-primary" iconClass="text-primary" label="Enviadas" value={totalSent} pct={100} />
            <FunnelCard icon={CheckCircle2} barClass="bg-success" iconClass="text-success" label="Aceitos" value={k.sent} pct={acceptanceRate} />
            <FunnelCard icon={Eye} barClass="bg-brand-blue" iconClass="text-brand-blue" label="Entregues" value={k.delivered} pct={deliveryRate} />
            <FunnelCard icon={MousePointerClick} barClass="bg-secondary" iconClass="text-secondary" label="Cliques" value={uniqueClicks} pct={clickRate} />
          </div>
          <p className="text-[11px] text-muted-foreground mt-3">
            Aceitação: % de envios · Entrega: % de aceitos · Clique: % de entregues
          </p>
        </CardContent>
      </Card>

      {noData && (
        <Card className="rounded-2xl border-dashed border-2">
          <CardContent className="p-8 text-center">
            <Smartphone className="w-10 h-10 mx-auto mb-2 text-muted-foreground" />
            <p className="font-semibold text-foreground">Nenhum SMS enviado neste período</p>
            <p className="text-sm text-muted-foreground mt-1">
              Adicione um node "Enviar SMS" aos seus workflows para começar.
            </p>
          </CardContent>
        </Card>
      )}

      {/* === Análise Detalhada + Top 3 === */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <AnalysisCard daily={data.daily} raw={raw || []} />
        </div>
        <div>
          <TopThreeCard items={topThree} />
        </div>
      </div>

      {/* === Templates SMS (cards) === */}
      <Card className="rounded-2xl shadow-sm">
        <CardContent className="p-6">
          <div className="flex items-end justify-between gap-2 mb-4 flex-wrap">
            <div>
              <h3 className="text-base font-semibold text-foreground">Templates SMS</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Todos os templates ativos. Clique para ver detalhes.
              </p>
            </div>
          </div>
          {merged.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Nenhum template criado. Crie em Conta → Templates SMS.
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {merged.map((t) => <SmsPerformanceTemplateCard key={t.name} template={t} />)}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* -------------------- Funnel card -------------------- */

function FunnelCard({
  icon: Icon, iconClass, barClass, label, value, pct,
}: { icon: any; iconClass: string; barClass: string; label: string; value: number; pct: number }) {
  return (
    <div className="rounded-xl bg-muted/30 p-4">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
          <Icon className={cn('w-3.5 h-3.5', iconClass)} />
          {label}
        </div>
      </div>
      <div className="flex items-end justify-between gap-1 mb-1.5">
        <span className="text-xl font-bold tabular-nums">{fmtNum(value)}</span>
        <span className="text-[11px] text-muted-foreground tabular-nums">{pct.toFixed(0)}%</span>
      </div>
      <div className="h-2 rounded-full bg-background overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all', barClass)}
          style={{ width: `${Math.max(2, pct)}%` }}
        />
      </div>
    </div>
  );
}

/* -------------------- Analysis card com abas -------------------- */

const TABS = [
  { id: 'evolution', label: 'Evolução Diária' },
  { id: 'hour', label: 'Melhor Horário' },
  { id: 'failures', label: 'Não entregues' },
] as const;

function AnalysisCard({
  daily, raw,
}: {
  daily: SmsStats['daily'];
  raw: Array<{ created_at: string; status: string; error_message: string | null }>;
}) {
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('evolution');

  const dailyData = daily.map((d) => ({
    ...d,
    label: format(new Date(d.day), 'dd/MM', { locale: ptBR }),
  }));

  const hourFull = useMemo(() => {
    const buckets = Array.from({ length: 24 }, (_, h) => ({ hour: h, sent: 0, failed: 0 }));
    raw.forEach((r) => {
      const d = new Date(r.created_at);
      const h = d.getHours();
      if (r.status === 'sent' || r.status === 'delivered') buckets[h].sent += 1;
      else if (r.status === 'failed') buckets[h].failed += 1;
    });
    return buckets.map((b) => ({
      ...b,
      label: `${String(b.hour).padStart(2, '0')}h`,
      failRate: b.sent + b.failed ? Math.round((b.failed / (b.sent + b.failed)) * 100) : 0,
    }));
  }, [raw]);
  const bestHour = hourFull.reduce<typeof hourFull[number] | null>(
    (acc, d) => (!acc || d.sent > acc.sent ? d : acc), null
  );

  const failures = useMemo(() => {
    const m = new Map<string, number>();
    raw.forEach((r) => {
      if (r.status !== 'failed' || !r.error_message) return;
      m.set(r.error_message, (m.get(r.error_message) || 0) + 1);
    });
    return Array.from(m.entries())
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [raw]);
  const failuresMax = failures[0]?.count || 1;

  return (
    <Card className="rounded-2xl shadow-sm h-full">
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h3 className="text-sm font-semibold text-foreground">Análise Detalhada</h3>
          <div className="flex items-center gap-1 p-1 rounded-xl bg-muted">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  'px-3 py-1.5 text-xs font-semibold rounded-lg transition-all',
                  tab === t.id ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <motion.div key={tab} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }} className="h-[300px]">
          {tab === 'evolution' ? (
            dailyData.length === 0 ? (
              <EmptyChart text="Sem dados no período." />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={dailyData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <RTooltip
                    contentStyle={{ borderRadius: 12, border: '1px solid hsl(var(--border))', fontSize: 12 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" />
                  <Line type="monotone" dataKey="sent" name="Aceitos" stroke={C_PRIMARY} strokeWidth={2} dot={{ r: 2 }} />
                  <Line type="monotone" dataKey="delivered" name="Entregues" stroke={C_BLUE} strokeWidth={2} dot={{ r: 2 }} />
                  <Line type="monotone" dataKey="clicked" name="Cliques" stroke={C_PURPLE} strokeWidth={2} dot={{ r: 2 }} />
                  <Line type="monotone" dataKey="failed" name="Não entregues" stroke={C_RED} strokeWidth={2} dot={{ r: 2 }} />
                </LineChart>
              </ResponsiveContainer>
            )
          ) : tab === 'hour' ? (
            raw.length === 0 ? (
              <EmptyChart text="Sem dados de envio para analisar horários." />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={hourFull} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={2} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                  <RTooltip
                    contentStyle={{ borderRadius: 12, border: '1px solid hsl(var(--border))', fontSize: 12 }}
                    formatter={(v: number, n: string) => [fmtNum(v), n === 'sent' ? 'Envios' : 'Não entregues']}
                    labelFormatter={(label, payload) => {
                      const d: any = payload?.[0]?.payload;
                      return `${label} • taxa de não entrega: ${d?.failRate || 0}%`;
                    }}
                  />
                  <Bar dataKey="sent" radius={[4, 4, 0, 0]}>
                    {hourFull.map((d) => (
                      <Cell
                        key={d.hour}
                        fill={bestHour && d.hour === bestHour.hour && d.sent > 0 ? C_TEAL : 'hsl(var(--primary) / 0.6)'}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )
          ) : failures.length === 0 ? (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
              Nenhum SMS não entregue no período. 🎉
            </div>
          ) : (
            <div className="h-full overflow-auto space-y-2 pr-1">
              {failures.map((f) => (
                <div key={f.reason} className="flex items-center gap-3 p-3 rounded-xl bg-muted/40">
                  <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                    <AlertCircle className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <TooltipProvider delayDuration={200}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <p className="text-sm font-medium text-foreground truncate cursor-help">{f.reason}</p>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-[320px] text-xs">{f.reason}</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    <div className="h-1.5 rounded-full bg-background mt-1.5 overflow-hidden">
                      <div className="h-full bg-muted-foreground/50" style={{ width: `${(f.count / failuresMax) * 100}%` }} />
                    </div>
                  </div>
                  <Badge variant="outline" className="text-[11px] tabular-nums shrink-0">{fmtNum(f.count)}</Badge>
                </div>
              ))}
            </div>
          )}
        </motion.div>
      </CardContent>
    </Card>
  );
}

function EmptyChart({ text }: { text: string }) {
  return <div className="h-full flex items-center justify-center text-sm text-muted-foreground">{text}</div>;
}

/* -------------------- Top 3 templates -------------------- */

function TopThreeCard({ items }: { items: SmsPerfTemplate[] }) {
  const navigate = useNavigate();
  const medals = [
    { Icon: Trophy, iconClass: 'text-warning', bg: 'bg-warning/10', bar: 'bg-warning' },
    { Icon: Medal, iconClass: 'text-muted-foreground', bg: 'bg-muted', bar: 'bg-muted-foreground' },
    { Icon: Award, iconClass: 'text-brand-amber', bg: 'bg-brand-amber/10', bar: 'bg-brand-amber' },
  ];
  const anyClicks = items.some((it) => (it?.unique_clicks ?? 0) > 0);
  const max = (anyClicks ? items[0]?.unique_clicks : items[0]?.sent) || 1;
  const slots: Array<SmsPerfTemplate | null> = [items[0] || null, items[1] || null, items[2] || null];

  return (
    <Card className="rounded-2xl shadow-sm h-full">
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-sm font-semibold text-foreground">
            {anyClicks ? 'Top 3 Templates por Cliques' : 'Top 3 Templates por Envios'}
          </h3>
          <Badge variant="outline" className="text-[10px]">
            {anyClicks ? 'por cliques' : 'por envios'}
          </Badge>
        </div>
        {!anyClicks && (
          <p className="text-[11px] text-muted-foreground mb-4">
            Ranking por cliques ativará quando houver dados de rastreamento.
          </p>
        )}

        <div className={cn('space-y-3', anyClicks && 'mt-4')}>
          {slots.map((it, idx) => {
            const m = medals[idx];
            if (!it) {
              return (
                <div key={idx} className="flex items-center gap-3 p-3 rounded-xl bg-muted/30 opacity-60">
                  <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center shrink-0', m.bg)}>
                    <m.Icon className={cn('w-4 h-4', m.iconClass)} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-muted-foreground">Sem dados ainda</p>
                  </div>
                </div>
              );
            }
            const clicks = it.unique_clicks ?? 0;
            const acceptPct = it.sent + it.failed ? Math.round((it.sent / (it.sent + it.failed)) * 100) : 0;
            const primaryValue = anyClicks ? clicks : it.sent;
            const barW = max ? (primaryValue / max) * 100 : 0;
            return (
              <button
                key={it.name}
                onClick={() => navigate(`/workflow-stats/sms-template/${encodeURIComponent(it.name)}`)}
                className="w-full text-left flex items-center gap-3 p-3 rounded-xl hover:bg-muted/50 transition group"
              >
                <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center shrink-0', m.bg)}>
                  <m.Icon className={cn('w-4 h-4', m.iconClass)} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{it.name}</p>
                  <p className="text-[11px] text-muted-foreground tabular-nums">
                    {anyClicks
                      ? `${fmtNum(clicks)} cliques · ${fmtNum(it.sent + it.failed)} envios`
                      : `${fmtNum(it.sent + it.failed)} envios · ${acceptPct}% aceitos`}
                  </p>
                  <div className="h-1 rounded-full bg-muted mt-1.5 overflow-hidden">
                    <div
                      className={cn('h-full transition-all', anyClicks ? 'bg-secondary' : m.bar)}
                      style={{ width: `${barW}%` }}
                    />
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-lg font-bold tabular-nums text-foreground">{fmtNum(primaryValue)}</p>
                  <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {anyClicks ? 'Cliques' : 'Envios'}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
