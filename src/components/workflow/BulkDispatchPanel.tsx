import { useState, useEffect, useMemo } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  DatabaseZap, CalendarIcon, Users, Layers, Clock, AlertTriangle,
  CheckCircle2, XCircle, Hourglass, Play, Ban, ShoppingBag, RefreshCw, DollarSign, Filter, MessageSquareText, Columns
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Progress } from '@/components/ui/progress';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Separator } from '@/components/ui/separator';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

import { useMarketplaceAliases } from '@/hooks/useMarketplaceAliases';
import { groupOrdersByWindow } from "@/utils/groupOrdersByWindow";

/** Compras (janela de 3 min) por cliente — a régua do filtro "mín. de pedidos". */
function contarComprasPorCliente(rows: { id: string; client_id: string | null; acquired_at?: string | null }[]): Record<string, number> {
  const freq: Record<string, number> = {};
  for (const g of groupOrdersByWindow(rows)) {
    const cid = g.primary.client_id;
    if (cid) freq[cid] = (freq[cid] || 0) + 1;
  }
  return freq;
}

const BASE_MARKETPLACE_OPTIONS = [
  { value: 'all', label: 'Todos os marketplaces' },
  { value: 'mercado_livre', label: 'Mercado Livre' },
  { value: 'ml_full', label: 'ML - Full' },
  { value: 'shopee', label: 'Shopee' },
  { value: 'shopee_xpress', label: 'Shopee - Flex' },
  { value: 'amazon_br', label: 'Amazon' },
  { value: 'magalu', label: 'Magazine Luiza' },
  { value: 'americanas', label: 'Americanas' },
  { value: 'shopify', label: 'Shopify' },
  { value: 'woocommerce', label: 'WooCommerce' },
  { value: 'lojaintegrada', label: 'Loja Integrada' },
  { value: 'segundavenda', label: 'Segunda Venda' },
  { value: 'shein', label: 'Shein' },
  { value: 'aliexpress', label: 'AliExpress' },
  { value: 'kwai', label: 'Kwai' },
  { value: 'tiktok', label: 'TikTok Shop' },
  { value: 'netshoes', label: 'Netshoes' },
  { value: 'kabum', label: 'KaBuM!' },
  { value: 'casas_bahia', label: 'Casas Bahia' },
  { value: 'casa_video', label: 'Casa&Video' },
  { value: 'bradesco', label: 'Bradesco' },
  { value: 'droga_raia', label: 'Droga Raia' },
  { value: 'other', label: 'Outro' },
];

interface Workflow {
  id: string;
  name: string;
  active: boolean;
}

interface PipelineStage {
  id: string;
  name: string;
}

interface CampaignStatus {
  bulk_dispatch_id: string;
  total: number;
  pending: number;
  completed: number;
  failed: number;
  cancelled: number;
}

/** Linha da RPC `disparo_retroativo_progresso` (uma campanha do fluxo). */
interface ProgressoCampanha {
  bulk_dispatch_id: string;
  criado_em: string;
  total: number;
  pendentes: number;
  processando: number;
  enviados: number;
  pulados: number;
  concluidos_sem_envio: number;
  falhas: number;
  cancelados: number;
  ritmo_ultima_hora: number;
  proximo_em: string | null;
  termino_estimado: string | null;
  ultimo_processado_em: string | null;
  proximos: Array<{ nome: string; whatsapp_final: string; agendado_para: string }>;
  ultimos: Array<{ nome: string; whatsapp_final: string; quando: string; resultado: string }>;
}
interface ProgressoDisparo {
  campanhas: ProgressoCampanha[];
  fluxo_tem_fila: boolean;
  gerado_em: string;
}


interface RetroactiveInitialConfig {
  source?: 'orders_period' | 'all_clients' | 'crm_stage' | 'failed_messages';
  date_from?: string;
  date_to?: string;
  stage_id?: string;
  marketplace?: string;
  min_orders?: number;
  min_amount?: number;
  max_amount?: number;
  messages_per_hour?: number;
  start_hour?: number;
  end_hour?: number;
  workflowId?: string;
}

interface BulkDispatchPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workflows: Workflow[];
  sellerId: string;
  initialConfig?: RetroactiveInitialConfig | null;
}

export function BulkDispatchPanel({ open, onOpenChange, workflows, sellerId, initialConfig }: BulkDispatchPanelProps) {
  const { toast } = useToast();
  const { aliases } = useMarketplaceAliases(sellerId);

  const MARKETPLACE_OPTIONS = useMemo(() => {
    const list = [...BASE_MARKETPLACE_OPTIONS];
    aliases.forEach((alias) => {
      const existing = list.find(m => m.value.toLowerCase() === alias.original_value.toLowerCase());
      if (existing) {
        existing.label = alias.display_name;
      } else {
        list.push({ value: alias.original_value.toLowerCase(), label: alias.display_name });
      }
    });
    return list;
  }, [aliases]);

  // Form state
  const [selectedWorkflowId, setSelectedWorkflowId] = useState('');
  const [source, setSource] = useState<'orders_period' | 'all_clients' | 'crm_stage' | 'failed_messages'>('orders_period');
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date>(new Date());
  const [stageId, setStageId] = useState('');
  const [messagesPerHour, setMessagesPerHour] = useState(30);
  const [startHour, setStartHour] = useState(8);
  const [endHour, setEndHour] = useState(20);

  // Advanced filters
  const [marketplace, setMarketplace] = useState('all');
  const [minOrders, setMinOrders] = useState('');
  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');
  const [stageFilterIds, setStageFilterIds] = useState<string[]>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [skipOpenConversations, setSkipOpenConversations] = useState(true);
  const [includeFailedInPeriod, setIncludeFailedInPeriod] = useState(false);

  // Failed messages filter state
  const [failedDateFrom, setFailedDateFrom] = useState('');
  const [failedDateTo, setFailedDateTo] = useState('');

  // Estimated recipients count
  const [estimatedCount, setEstimatedCount] = useState<number | null>(null);
  const [isEstimating, setIsEstimating] = useState(false);

  // Campaign state
  const [activeCampaign, setActiveCampaign] = useState<CampaignStatus | null>(null);
  const [isDispatching, setIsDispatching] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);

  // Progresso do disparo (21/09/2026): contagens reais por resultado, ritmo,
  // próximos da fila e término estimado — vem da RPC, não de contar linhas pelo
  // PostgREST (teto silencioso de 1.000: campanha de 3.000 aparecia como 1.000).
  const [progresso, setProgresso] = useState<ProgressoDisparo | null>(null);
  const [carregandoProgresso, setCarregandoProgresso] = useState(false);

  // Limite e exclusão de campanhas anteriores
  const [maxMessages, setMaxMessages] = useState<string>('');
  const [excludeCampaignIds, setExcludeCampaignIds] = useState<string[]>([]);
  const [previousCampaigns, setPreviousCampaigns] = useState<Array<{ id: string; workflow_name: string; created_at: string; total: number }>>([]);

  // Pipeline stages
  const [stages, setStages] = useState<PipelineStage[]>([]);

  // Apply initialConfig when panel opens with retroactive config
  useEffect(() => {
    if (open && initialConfig) {
      setSource(initialConfig.source || 'orders_period');
      setDateFrom(initialConfig.date_from ? new Date(initialConfig.date_from) : undefined);
      setDateTo(initialConfig.date_to ? new Date(initialConfig.date_to) : new Date());
      setStageId(initialConfig.stage_id || '');
      setMarketplace(initialConfig.marketplace || 'all');
      setMinOrders(initialConfig.min_orders ? String(initialConfig.min_orders) : '');
      setMinAmount(initialConfig.min_amount ? String(initialConfig.min_amount) : '');
      setMaxAmount(initialConfig.max_amount ? String(initialConfig.max_amount) : '');
      setMessagesPerHour(initialConfig.messages_per_hour || 30);
      setStartHour(initialConfig.start_hour ?? 8);
      setEndHour(initialConfig.end_hour ?? 20);
      if (initialConfig.workflowId) setSelectedWorkflowId(initialConfig.workflowId);
    }
  }, [open, initialConfig]);

  useEffect(() => {
    if (open && sellerId) {
      loadStages();
      loadActiveCampaign();
      loadPreviousCampaigns();
    }
  }, [open, sellerId]);

  const loadPreviousCampaigns = async () => {
    // Carrega últimas campanhas (bulk_dispatch_id distintos) deste seller
    const { data } = await supabase
      .from('workflow_queue')
      .select('context, workflow_id, created_at, workflows(name)')
      .eq('seller_id', sellerId)
      .filter('context->>bulk_dispatch', 'eq', 'true')
      .order('created_at', { ascending: false })
      .limit(5000);
    if (!data) return;
    const map = new Map<string, { id: string; workflow_name: string; created_at: string; total: number }>();
    for (const row of data) {
      const ctx = (row as any).context || {};
      const id = ctx.bulk_dispatch_id;
      if (!id) continue;
      const existing = map.get(id);
      if (existing) {
        existing.total += 1;
      } else {
        map.set(id, {
          id,
          workflow_name: (row as any).workflows?.name || 'Workflow',
          created_at: (row as any).created_at,
          total: 1,
        });
      }
    }
    setPreviousCampaigns(
      [...map.values()]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 15)
    );
  };



  const loadStages = async () => {
    const { data } = await supabase
      .from('pipeline_stages')
      .select('id, name')
      .eq('seller_id', sellerId)
      .order('position');
    if (data) setStages(data);
  };

  const carregarProgresso = async (workflowId: string) => {
    if (!workflowId || !sellerId) { setProgresso(null); return; }
    setCarregandoProgresso(true);
    try {
      // `as any`: a RPC é nova e types.ts (gerado) ainda não a conhece — mesmo
      // atalho usado pelas outras RPCs recentes deste arquivo.
      const { data, error } = await (supabase as any).rpc('disparo_retroativo_progresso', {
        _seller_id: sellerId,
        _workflow_id: workflowId,
      });
      if (error) throw error;
      const prog = (data ?? null) as unknown as ProgressoDisparo | null;
      setProgresso(prog);
      // O botão "Cancelar campanha" e o card antigo leem `activeCampaign`: alimentar
      // pela campanha viva da RPC (contagem certa, sem o teto de 1.000).
      const viva = prog?.campanhas?.find((c) => c.pendentes > 0 || c.processando > 0);
      if (viva) {
        setActiveCampaign({
          bulk_dispatch_id: viva.bulk_dispatch_id,
          total: viva.total,
          pending: viva.pendentes,
          completed: viva.enviados + viva.pulados + viva.concluidos_sem_envio,
          failed: viva.falhas,
          cancelled: viva.cancelados,
        });
      } else {
        setActiveCampaign(null);
      }
    } catch (err: any) {
      console.error('[BulkDispatchPanel] progresso:', err?.message);
    } finally {
      setCarregandoProgresso(false);
    }
  };

  // Enquanto o sheet está aberto num fluxo, o progresso se atualiza sozinho a cada
  // 30 s — o motor processa ~1 job/min por seller, então mais rápido que isso é ruído.
  useEffect(() => {
    if (!open || !selectedWorkflowId) return;
    carregarProgresso(selectedWorkflowId);
    const t = setInterval(() => carregarProgresso(selectedWorkflowId), 30_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, selectedWorkflowId, sellerId]);

  const loadActiveCampaign = async () => {
    const { data } = await supabase
      .from('workflow_queue')
      .select('context, status')
      .eq('seller_id', sellerId)
      .eq('status', 'pending')
      .filter('context->>bulk_dispatch', 'eq', 'true')
      .limit(1);

    if (data && data.length > 0) {
      const ctx = data[0].context as any;
      await loadCampaignStatus(ctx.bulk_dispatch_id);
    } else {
      setActiveCampaign(null);
    }
  };

  const loadCampaignStatus = async (bulkDispatchId: string) => {
    const { data } = await supabase
      .from('workflow_queue')
      .select('status')
      .eq('seller_id', sellerId)
      .filter('context->>bulk_dispatch_id', 'eq', bulkDispatchId);

    if (!data) return;

    const counts = { pending: 0, completed: 0, failed: 0, cancelled: 0 };
    for (const row of data) {
      const s = row.status as keyof typeof counts;
      if (s in counts) counts[s]++;
    }

    setActiveCampaign({
      bulk_dispatch_id: bulkDispatchId,
      total: data.length,
      ...counts,
    });
  };

  // Estimate recipient count
  useEffect(() => {
    if (!sellerId || !open) return;
    const timer = setTimeout(() => estimateRecipients(), 500);
    return () => clearTimeout(timer);
  }, [source, dateFrom, dateTo, stageId, marketplace, minOrders, minAmount, maxAmount, sellerId, open, failedDateFrom, failedDateTo, skipOpenConversations, includeFailedInPeriod, maxMessages, excludeCampaignIds, stageFilterIds]);

  // Helper: fetch client_ids that are part of any of the excluded previous campaigns
  const fetchExcludedClientIds = async (): Promise<Set<string>> => {
    const result = new Set<string>();
    if (!sellerId || excludeCampaignIds.length === 0) return result;
    for (const bdId of excludeCampaignIds) {
      const { data } = await supabase
        .from('workflow_queue')
        .select('client_id')
        .eq('seller_id', sellerId)
        .filter('context->>bulk_dispatch_id', 'eq', bdId)
        .limit(50000);
      if (data) data.forEach((r: any) => r.client_id && result.add(r.client_id));
    }
    return result;
  };

  // Helper: fetch client_ids that are in any of the selected pipeline stages
  const fetchClientIdsInStages = async (): Promise<Set<string>> => {
    const result = new Set<string>();
    if (!sellerId || stageFilterIds.length === 0) return result;
    const rows = await fetchAllPaged<{ client_id: string | null }>((from, to) =>
      supabase
        .from('client_pipeline')
        .select('client_id')
        .eq('seller_id', sellerId)
        .in('stage_id', stageFilterIds)
        .not('client_id', 'is', null)
        .range(from, to),
    );
    rows.forEach((r) => r.client_id && result.add(r.client_id));
    return result;
  };

  const applyStageFilter = async (clientIds: string[]): Promise<string[]> => {
    if (stageFilterIds.length === 0) return clientIds;
    const inStages = await fetchClientIdsInStages();
    if (inStages.size === 0) return [];
    return clientIds.filter(id => inStages.has(id));
  };

  // Aplica exclusão de campanhas anteriores + filtro por fase + cap de max_messages na estimativa
  const finalizeEstimate = async (clientIds: string[]): Promise<number> => {
    let ids = [...clientIds];
    ids = await applyStageFilter(ids);
    if (excludeCampaignIds.length > 0) {
      const excluded = await fetchExcludedClientIds();
      if (excluded.size > 0) ids = ids.filter(id => !excluded.has(id));
    }
    ids.sort();
    const cap = Number(maxMessages);
    if (!isNaN(cap) && cap > 0 && ids.length > cap) ids = ids.slice(0, cap);
    return ids.length > 10000 ? 10000 : ids.length;
  };


  // Pagina uma query Supabase em chunks (default 1000) para contornar o teto do PostgREST.
  const fetchAllPaged = async <T,>(
    buildQuery: (from: number, to: number) => any,
    pageSize = 1000,
    hardCap = 10000,
  ): Promise<T[]> => {
    const all: T[] = [];
    let offset = 0;
    while (offset < hardCap) {
      const upper = Math.min(offset + pageSize, hardCap) - 1;
      const { data, error } = await buildQuery(offset, upper);
      if (error) {
        console.error('[BulkDispatchPanel] paginated query error', error);
        break;
      }
      if (!data || data.length === 0) break;
      all.push(...(data as T[]));
      // NÃO usar data.length < pageSize como condição de parada:
      // com !inner joins + filtros em recursos embarcados, o PostgREST pode
      // devolver menos linhas que o page size mesmo havendo mais nas páginas
      // seguintes. Avança até receber uma página vazia ou bater o hardCap.
      offset = upper + 1;
    }
    return all;
  };

  // Helper: fetch client_ids with open conversations for current seller
  const fetchOpenConversationClientIds = async (): Promise<Set<string>> => {
    const result = new Set<string>();
    if (!sellerId) return result;
    const rows = await fetchAllPaged<{ client_id: string | null }>((from, to) =>
      supabase
        .from('conversations')
        .select('client_id')
        .eq('seller_id', sellerId)
        .eq('status', 'open')
        // Paridade com o bulk-dispatch: só conversa com WhatsApp de verdade conta.
        // A conversa é única por cliente, então a linha aberta pode ser só de SMS.
        .eq('has_whatsapp', true)
        .not('client_id', 'is', null)
        .range(from, to),
    );
    rows.forEach((r) => r.client_id && result.add(r.client_id));
    return result;
  };

  const applySkipOpenFilter = async (clientIds: string[]): Promise<string[]> => {
    if (!skipOpenConversations) return clientIds;
    const openSet = await fetchOpenConversationClientIds();
    if (openSet.size === 0) return clientIds;
    return clientIds.filter(id => !openSet.has(id));
  };


  // Helper: fetch client_ids that had failed messages in [from, to]
  const fetchFailedClientIdsInPeriod = async (from: Date, to: Date): Promise<Set<string>> => {
    const result = new Set<string>();
    if (!sellerId) return result;
    const rows = await fetchAllPaged<{ conversations: { client_id: string | null } | null }>((f, t) =>
      supabase
        .from('messages')
        .select('conversations!inner(client_id, seller_id)')
        .eq('status', 'failed')
        .eq('conversations.seller_id', sellerId)
        .not('conversations.client_id', 'is', null)
        .gte('created_at', from.toISOString())
        .lte('created_at', to.toISOString())
        .range(f, t),
    );
    rows.forEach((r: any) => {
      const cid = r.conversations?.client_id;
      if (cid) result.add(cid);
    });
    return result;
  };

  // Adiciona ao conjunto os clientes que tiveram falha no período (ignora skip de conversa aberta)
  const applyIncludeFailedUnion = async (
    afterSkip: string[],
    baseClientIds: string[],
  ): Promise<string[]> => {
    if (!includeFailedInPeriod || source !== 'orders_period' || !dateFrom) return afterSkip;
    const from = dateFrom;
    const to = new Date(new Date(dateTo).setHours(23, 59, 59));
    const failedSet = await fetchFailedClientIdsInPeriod(from, to);
    if (failedSet.size === 0) return afterSkip;
    const baseSet = new Set(baseClientIds);
    const merged = new Set(afterSkip);
    for (const id of failedSet) {
      if (baseSet.has(id)) merged.add(id);
    }
    return [...merged];
  };


  const buildOrderFilters = (query: any) => {
    if (marketplace && marketplace !== 'all') {
      query = query.eq('marketplace', marketplace);
    }
    if (minAmount && !isNaN(Number(minAmount))) {
      query = query.gte('total_amount', Number(minAmount));
    }
    if (maxAmount && !isNaN(Number(maxAmount))) {
      query = query.lte('total_amount', Number(maxAmount));
    }
    return query;
  };

  const estimateRecipients = async () => {
    setIsEstimating(true);
    try {
      const minOrdersNum = minOrders && !isNaN(Number(minOrders)) ? Number(minOrders) : null;

      if (source === 'orders_period') {
        if (!dateFrom) { setEstimatedCount(null); return; }

        const data = await fetchAllPaged<{ client_id: string }>((from, to) => {
          let q = supabase
            .from('orders')
            .select('id, client_id, acquired_at, product, total_amount, clients!inner(whatsapp)')
            .eq('seller_id', sellerId)
            .not('client_id', 'is', null)
            .gte('acquired_at', dateFrom.toISOString())
            .lte('acquired_at', new Date(new Date(dateTo).setHours(23, 59, 59)).toISOString())
            .not('clients.whatsapp', 'is', null)
            .range(from, to);
          return buildOrderFilters(q);
        });

        let clientIds = [...new Set(data.map((r: any) => r.client_id as string))];
        if (minOrdersNum && minOrdersNum > 1) {
          // COMPRAS, não linhas de pedido: o desdobro do Bling fazia cliente de
          // compra única passar no filtro ">= 2" e entrar na estimativa.
          const freq = contarComprasPorCliente(data as any[]);
          clientIds = clientIds.filter(id => (freq[id] || 0) >= minOrdersNum);
        }
        const baseForFailed = [...clientIds];
        clientIds = await applySkipOpenFilter(clientIds);
        clientIds = await applyIncludeFailedUnion(clientIds, baseForFailed);
        setEstimatedCount(await finalizeEstimate(clientIds));
      } else if (source === 'all_clients') {
        if (minOrdersNum || marketplace !== 'all' || minAmount || maxAmount) {
          const data = await fetchAllPaged<{ client_id: string }>((from, to) => {
            let q = supabase
              .from('orders')
              .select('id, client_id, acquired_at, product, total_amount, clients!inner(whatsapp)')
              .eq('seller_id', sellerId)
              .not('client_id', 'is', null)
              .not('clients.whatsapp', 'is', null)
              .range(from, to);
            return buildOrderFilters(q);
          });

          let clientIds = [...new Set(data.map((r: any) => r.client_id as string))];
          if (minOrdersNum && minOrdersNum > 1) {
            const freq = contarComprasPorCliente(data as any[]);
            clientIds = clientIds.filter(id => (freq[id] || 0) >= minOrdersNum);
          }
          clientIds = await applySkipOpenFilter(clientIds);
          setEstimatedCount(await finalizeEstimate(clientIds));
        } else {
          const data = await fetchAllPaged<{ client_id: string }>((from, to) =>
            supabase
              .from('clients_sellers')
              .select('client_id, clients!inner(whatsapp)')
              .eq('seller_id', sellerId)
              .not('clients.whatsapp', 'is', null)
              .range(from, to),
          );
          let clientIds = [...new Set(data.map((r: any) => r.client_id as string))];
          clientIds = await applySkipOpenFilter(clientIds);
          setEstimatedCount(await finalizeEstimate(clientIds));
        }
      } else if (source === 'crm_stage' && stageId) {
        const data = await fetchAllPaged<{ client_id: string }>((from, to) =>
          supabase
            .from('client_pipeline')
            .select('client_id, clients!inner(whatsapp)')
            .eq('seller_id', sellerId)
            .eq('stage_id', stageId)
            .not('clients.whatsapp', 'is', null)
            .range(from, to),
        );
        let clientIds = [...new Set(data.map((r: any) => r.client_id as string))];
        clientIds = await applySkipOpenFilter(clientIds);
        setEstimatedCount(await finalizeEstimate(clientIds));
      } else if (source === 'failed_messages') {
        const data = await fetchAllPaged<any>((from, to) => {
          let q = supabase
            .from('messages')
            .select('conversations!inner(client_id, seller_id)')
            .eq('status', 'failed')
            .eq('conversations.seller_id', sellerId)
            .not('conversations.client_id', 'is', null);
          if (failedDateFrom) q = q.gte('created_at', new Date(failedDateFrom).toISOString());
          if (failedDateTo) q = q.lte('created_at', new Date(failedDateTo + 'T23:59:59').toISOString());
          return q.range(from, to);
        });
        let clientIds = [...new Set(data.map((r: any) => r.conversations?.client_id).filter(Boolean) as string[])];
        clientIds = await applySkipOpenFilter(clientIds);
        setEstimatedCount(await finalizeEstimate(clientIds));
      } else {

        setEstimatedCount(null);
      }
    } finally {
      setIsEstimating(false);
    }
  };

  const getEstimatedDuration = () => {
    if (!estimatedCount || estimatedCount === 0) return null;
    const totalMinutes = Math.ceil((estimatedCount / messagesPerHour) * 60);
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    return { hours, mins, totalMinutes };
  };

  const getEstimatedCompletion = () => {
    const dur = getEstimatedDuration();
    if (!dur) return null;
    const completion = new Date();
    completion.setMinutes(completion.getMinutes() + dur.totalMinutes);
    return completion;
  };

  const handleDispatch = async () => {
    if (!selectedWorkflowId) {
      toast({ title: 'Selecione um workflow', variant: 'destructive' });
      return;
    }
    if (source === 'orders_period' && !dateFrom) {
      toast({ title: 'Selecione a data inicial', variant: 'destructive' });
      return;
    }
    if (source === 'crm_stage' && !stageId) {
      toast({ title: 'Selecione um estágio do CRM', variant: 'destructive' });
      return;
    }

    setIsDispatching(true);
    try {
      const body: Record<string, any> = {
        workflow_id: selectedWorkflowId,
        seller_id: sellerId,
        source,
        messages_per_hour: messagesPerHour,
        start_hour: startHour,
        end_hour: endHour,
      };

      if (source === 'orders_period') {
        body.date_from = format(dateFrom!, 'yyyy-MM-dd');
        body.date_to = format(dateTo, 'yyyy-MM-dd');
      }
      if (source === 'crm_stage') {
        body.stage_id = stageId;
      }
      if (source === 'failed_messages') {
        body.failed_date_from = failedDateFrom || undefined;
        body.failed_date_to = failedDateTo || undefined;
      }

      // Advanced filters
      if (marketplace && marketplace !== 'all') body.marketplace = marketplace;
      if (minOrders && !isNaN(Number(minOrders)) && Number(minOrders) > 1) body.min_orders = Number(minOrders);
      if (minAmount && !isNaN(Number(minAmount))) body.min_amount = Number(minAmount);
      if (maxAmount && !isNaN(Number(maxAmount))) body.max_amount = Number(maxAmount);
      body.skip_open_conversations = skipOpenConversations;
      if (includeFailedInPeriod && source === 'orders_period') {
        body.include_failed_in_period = true;
      }

      // Limite de mensagens e exclusão de campanhas anteriores
      if (maxMessages && !isNaN(Number(maxMessages)) && Number(maxMessages) > 0) {
        body.max_messages = Number(maxMessages);
      }
      if (excludeCampaignIds.length > 0) {
        body.exclude_bulk_dispatch_ids = excludeCampaignIds;
      }
      if (stageFilterIds.length > 0) {
        body.stage_filter_ids = stageFilterIds;
      }


      const { data, error } = await supabase.functions.invoke('bulk-dispatch', { body });

      // O supabase-js esconde o corpo da resposta em erros HTTP: o toast dizia
      // só "Edge Function returned a non-2xx status code" enquanto a function
      // explicava exatamente o motivo (ex.: preflight bloqueou porque a WABA
      // está LIMITED sem verificação de empresa na Meta). Lê o corpo e mostra
      // a explicação de verdade.
      if (error) {
        let motivo = error.message;
        try {
          const corpo = await (error as any)?.context?.json?.();
          if (corpo?.error) motivo = corpo.error;
        } catch { /* corpo não-JSON: fica a mensagem genérica */ }
        throw new Error(motivo);
      }
      if (data.error) throw new Error(data.error);

      if (data.jobs_created === 0) {
        toast({ title: 'Nenhum destinatário encontrado', description: data.message });
        return;
      }

      toast({
        title: `Campanha iniciada! 🚀`,
        description: `${data.jobs_created} mensagens agendadas`,
      });

      await loadCampaignStatus(data.bulk_dispatch_id);
      if (selectedWorkflowId) await carregarProgresso(selectedWorkflowId);
    } catch (err: any) {
      toast({ title: 'Erro ao iniciar disparo', description: err.message, variant: 'destructive' });
    } finally {
      setIsDispatching(false);
    }
  };

  const handleCancelCampaign = async () => {
    if (!activeCampaign) return;
    setIsCancelling(true);
    try {
      const { error } = await supabase
        .from('workflow_queue')
        .update({ status: 'cancelled' })
        .eq('seller_id', sellerId)
        .filter('context->>bulk_dispatch_id', 'eq', activeCampaign.bulk_dispatch_id)
        .eq('status', 'pending');

      if (error) throw error;

      toast({ title: 'Campanha cancelada', description: 'Jobs pendentes foram cancelados' });
      setActiveCampaign(null);
      if (selectedWorkflowId) await carregarProgresso(selectedWorkflowId);
    } catch (err: any) {
      toast({ title: 'Erro ao cancelar', description: err.message, variant: 'destructive' });
    } finally {
      setIsCancelling(false);
    }
  };

  const activeFiltersCount = [
    marketplace !== 'all',
    minOrders && Number(minOrders) > 1,
    minAmount,
    maxAmount,
    stageFilterIds.length > 0,
  ].filter(Boolean).length;

  const duration = getEstimatedDuration();
  const completion = getEstimatedCompletion();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader className="mb-4">
          <div className="flex items-center gap-2">
            <DatabaseZap className="h-5 w-5 text-primary" />
            <SheetTitle>Disparo Retroativo</SheetTitle>
          </div>
          <SheetDescription>
            Envie mensagens para clientes já cadastrados antes da configuração dos workflows
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6">
          {/* Step 1: Select workflow */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold flex items-center gap-1.5">
              <span className="bg-primary text-primary-foreground rounded-full w-5 h-5 flex items-center justify-center text-xs">1</span>
              Selecionar Workflow
            </Label>
            <Select value={selectedWorkflowId} onValueChange={setSelectedWorkflowId}>
              <SelectTrigger>
                <SelectValue placeholder="Escolha um workflow..." />
              </SelectTrigger>
              <SelectContent>
                {workflows.map(w => (
                  <SelectItem key={w.id} value={w.id}>
                    <div className="flex items-center gap-2">
                      {w.name}
                      {w.active && <Badge variant="outline" className="text-xs py-0">Ativo</Badge>}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Separator />

          {/* Step 2: Filter recipients */}
          <div className="space-y-3">
            <Label className="text-sm font-semibold flex items-center gap-1.5">
              <span className="bg-primary text-primary-foreground rounded-full w-5 h-5 flex items-center justify-center text-xs">2</span>
              Filtrar Destinatários
            </Label>
            <RadioGroup value={source} onValueChange={(v: any) => setSource(v)} className="space-y-3">
              {/* Orders period */}
              <div className={cn(
                "border rounded-lg p-3 space-y-3 transition-colors",
                source === 'orders_period' ? 'border-primary bg-primary/5' : 'border-border'
              )}>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="orders_period" id="orders_period" />
                  <Label htmlFor="orders_period" className="cursor-pointer flex items-center gap-1.5 font-medium">
                    <CalendarIcon className="h-4 w-4" />
                    Por período de pedidos
                  </Label>
                  <Badge className="ml-auto text-xs">Recomendado</Badge>
                </div>
                {source === 'orders_period' && (
                  <div className="grid grid-cols-2 gap-2 pl-6">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">De:</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" size="sm" className={cn("w-full justify-start text-left font-normal", !dateFrom && "text-muted-foreground")}>
                            <CalendarIcon className="mr-1 h-3 w-3" />
                            {dateFrom ? format(dateFrom, 'dd/MM/yyyy') : 'Selecionar'}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={dateFrom}
                            onSelect={setDateFrom}
                            disabled={(d) => d > new Date()}
                            initialFocus
                            className="p-3 pointer-events-auto"
                            locale={ptBR}
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Até:</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" size="sm" className="w-full justify-start text-left font-normal">
                            <CalendarIcon className="mr-1 h-3 w-3" />
                            {format(dateTo, 'dd/MM/yyyy')}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={dateTo}
                            onSelect={(d) => d && setDateTo(d)}
                            disabled={(d) => d > new Date()}
                            initialFocus
                            className="p-3 pointer-events-auto"
                            locale={ptBR}
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                  </div>
                )}
              </div>

              {/* All clients */}
              <div className={cn(
                "border rounded-lg p-3 transition-colors",
                source === 'all_clients' ? 'border-primary bg-primary/5' : 'border-border'
              )}>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="all_clients" id="all_clients" />
                  <Label htmlFor="all_clients" className="cursor-pointer flex items-center gap-1.5 font-medium">
                    <Users className="h-4 w-4" />
                    Todos os clientes com WhatsApp
                  </Label>
                </div>
              </div>

              {/* CRM stage */}
              <div className={cn(
                "border rounded-lg p-3 space-y-3 transition-colors",
                source === 'crm_stage' ? 'border-primary bg-primary/5' : 'border-border'
              )}>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="crm_stage" id="crm_stage" />
                  <Label htmlFor="crm_stage" className="cursor-pointer flex items-center gap-1.5 font-medium">
                    <Layers className="h-4 w-4" />
                    Por estágio do CRM
                  </Label>
                </div>
                {source === 'crm_stage' && (
                  <div className="pl-6">
                    <Select value={stageId} onValueChange={setStageId}>
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue placeholder="Selecione um estágio..." />
                      </SelectTrigger>
                      <SelectContent>
                        {stages.map(s => (
                          <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              {/* Failed messages */}
              <div className={cn(
                "border rounded-lg p-3 space-y-3 transition-colors",
                source === 'failed_messages' ? 'border-primary bg-primary/5' : 'border-border'
              )}>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="failed_messages" id="failed_messages" />
                  <Label htmlFor="failed_messages" className="cursor-pointer flex-1">
                    <div className="font-medium flex items-center gap-1.5">
                      <AlertTriangle className="h-4 w-4" />
                      Reenviar para clientes com erro
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      Clientes com mensagem não entregue
                    </div>
                  </Label>
                </div>
                {source === 'failed_messages' && (
                  <div className="grid grid-cols-2 gap-2 pl-6">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">De:</Label>
                      <Input
                        type="date"
                        value={failedDateFrom}
                        onChange={(e) => setFailedDateFrom(e.target.value)}
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Até:</Label>
                      <Input
                        type="date"
                        value={failedDateTo}
                        onChange={(e) => setFailedDateTo(e.target.value)}
                        className="h-8 text-sm"
                      />
                    </div>
                  </div>
                )}
              </div>
            </RadioGroup>
          </div>

          <Separator />

          {/* Step 3: Advanced filters */}
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => setShowAdvanced(v => !v)}
              className="flex items-center gap-2 w-full text-left"
            >
              <Label className="text-sm font-semibold flex items-center gap-1.5 cursor-pointer">
                <span className="bg-primary text-primary-foreground rounded-full w-5 h-5 flex items-center justify-center text-xs">3</span>
                Filtros Avançados
                {activeFiltersCount > 0 && (
                  <Badge className="text-xs h-5 px-1.5">{activeFiltersCount} ativo{activeFiltersCount > 1 ? 's' : ''}</Badge>
                )}
              </Label>
              <Filter className={cn("h-3.5 w-3.5 ml-auto text-muted-foreground transition-transform", showAdvanced && "rotate-180")} />
            </button>

            {showAdvanced && (
              <div className="space-y-4 border border-border rounded-lg p-3 bg-muted/30">
                {/* Marketplace */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <ShoppingBag className="h-3.5 w-3.5" />
                    Marketplace específico
                  </Label>
                  <Select value={marketplace} onValueChange={setMarketplace}>
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MARKETPLACE_OPTIONS.map(opt => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Min orders (recurrence) */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <RefreshCw className="h-3.5 w-3.5" />
                    Mínimo de pedidos (recorrência)
                  </Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min="1"
                      placeholder="Ex: 2 (apenas recorrentes)"
                      value={minOrders}
                      onChange={e => setMinOrders(e.target.value)}
                      className="h-8 text-sm"
                    />
                    {minOrders && Number(minOrders) >= 2 && (
                      <Badge variant="secondary" className="text-xs whitespace-nowrap">
                        ≥ {minOrders} pedidos
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">Deixe vazio para incluir todos. Use 2+ para clientes recorrentes.</p>
                </div>

                {/* Order value range */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <DollarSign className="h-3.5 w-3.5" />
                    Valor do pedido (R$)
                  </Label>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Mínimo</Label>
                      <Input
                        type="number"
                        min="0"
                        placeholder="0,00"
                        value={minAmount}
                        onChange={e => setMinAmount(e.target.value)}
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Máximo</Label>
                      <Input
                        type="number"
                        min="0"
                        placeholder="Sem limite"
                        value={maxAmount}
                        onChange={e => setMaxAmount(e.target.value)}
                        className="h-8 text-sm"
                      />
                    </div>
                  </div>
                </div>

                {/* Filter by kanban stages (multi-select) */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <Columns className="h-3.5 w-3.5" />
                    Fases do Kanban (opcional)
                    {stageFilterIds.length > 0 && (
                      <Badge variant="secondary" className="text-xs">
                        {stageFilterIds.length} selecionada{stageFilterIds.length > 1 ? 's' : ''}
                      </Badge>
                    )}
                  </Label>
                  {stages.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">Nenhuma fase encontrada</p>
                  ) : (
                    <div className="max-h-40 overflow-y-auto border border-border rounded-md p-2 space-y-1 bg-background">
                      {stages.map((s) => (
                        <label
                          key={s.id}
                          className="flex items-center gap-2 text-xs cursor-pointer hover:bg-accent rounded px-1 py-0.5"
                        >
                          <Checkbox
                            checked={stageFilterIds.includes(s.id)}
                            onCheckedChange={(v) => {
                              if (v) setStageFilterIds([...stageFilterIds, s.id]);
                              else setStageFilterIds(stageFilterIds.filter(id => id !== s.id));
                            }}
                          />
                          <span className="flex-1 truncate">{s.name}</span>
                        </label>
                      ))}
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Enviar apenas para clientes que estão em uma das fases selecionadas. Deixe vazio para não filtrar por fase.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Skip open conversations toggle */}
          <div className="flex items-start gap-3 border border-border rounded-lg p-3 bg-muted/30">
            <Checkbox
              id="skip-conversations"
              checked={skipOpenConversations}
              onCheckedChange={(v) => setSkipOpenConversations(!!v)}
              className="mt-0.5"
            />
            <div className="space-y-1">
              <Label htmlFor="skip-conversations" className="text-sm font-medium cursor-pointer flex items-center gap-1.5">
                <MessageSquareText className="h-3.5 w-3.5" />
                Pular clientes com conversa aberta
              </Label>
              <p className="text-xs text-muted-foreground">
                {skipOpenConversations
                  ? 'Clientes que já possuem conversa ativa NÃO receberão a mensagem'
                  : 'Todos os clientes receberão, mesmo com conversa aberta'}
              </p>
            </div>
          </div>

          {/* Incluir também quem teve falha no período (apenas para orders_period) */}
          {source === 'orders_period' && (
            <div className="flex items-start gap-3 border border-border rounded-lg p-3 bg-warning/5">
              <Checkbox
                id="include-failed-in-period"
                checked={includeFailedInPeriod}
                onCheckedChange={(v) => setIncludeFailedInPeriod(!!v)}
                className="mt-0.5"
              />
              <div className="space-y-1">
                <Label htmlFor="include-failed-in-period" className="text-sm font-medium cursor-pointer flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 text-warning" />
                  Incluir também quem teve mensagem não entregue no período
                </Label>
                <p className="text-xs text-muted-foreground">
                  {includeFailedInPeriod
                    ? 'Clientes do período com mensagem não entregue serão incluídos mesmo que tenham conversa aberta'
                    : 'Marque para reenviar a esses clientes (ignora o filtro de conversa aberta apenas para eles)'}
                </p>
              </div>
            </div>
          )}

          <Separator />

          {/* Limite e exclusão de campanhas anteriores */}
          <div className="space-y-3">
            <Label className="text-sm font-semibold flex items-center gap-1.5">
              <span className="bg-primary text-primary-foreground rounded-full w-5 h-5 flex items-center justify-center text-xs">3.5</span>
              Limite e Exclusões
            </Label>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                Limite máximo de envios nesta campanha
              </Label>
              <Input
                type="number"
                min="1"
                max="10000"
                placeholder="Ex: 250 (máx. 10.000 por campanha)"
                value={maxMessages}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === '') return setMaxMessages('');
                  const n = Number(v);
                  if (isNaN(n)) return;
                  // Cap silencioso em 10.000 (limite absoluto do sistema)
                  setMaxMessages(String(Math.min(Math.max(1, Math.floor(n)), 10000)));
                }}
                className="h-8 text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Útil para dividir uma base grande em várias campanhas paralelas (ex: 250 + 250).
                O limite máximo absoluto por campanha é <strong>10.000 destinatários</strong> —
                bases maiores devem ser divididas em campanhas sequenciais.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                Excluir clientes de campanhas anteriores
              </Label>
              {previousCampaigns.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">
                  Nenhuma campanha anterior encontrada
                </p>
              ) : (
                <div className="max-h-40 overflow-y-auto border border-border rounded-md p-2 space-y-1 bg-muted/30">
                  {previousCampaigns.map((c) => (
                    <label
                      key={c.id}
                      className="flex items-center gap-2 text-xs cursor-pointer hover:bg-accent rounded px-1 py-0.5"
                    >
                      <Checkbox
                        checked={excludeCampaignIds.includes(c.id)}
                        onCheckedChange={(v) => {
                          if (v) setExcludeCampaignIds([...excludeCampaignIds, c.id]);
                          else setExcludeCampaignIds(excludeCampaignIds.filter((id) => id !== c.id));
                        }}
                      />
                      <span className="flex-1 truncate">
                        <span className="font-medium">{c.workflow_name}</span>
                        <span className="text-muted-foreground"> · {c.total} envios · {format(new Date(c.created_at), "dd/MM HH:mm", { locale: ptBR })}</span>
                      </span>
                    </label>
                  ))}
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Clientes que já foram alvo das campanhas selecionadas serão removidos desta.
              </p>
            </div>
          </div>

          <Separator />
          <div className="space-y-4">
            <Label className="text-sm font-semibold flex items-center gap-1.5">
              <span className="bg-primary text-primary-foreground rounded-full w-5 h-5 flex items-center justify-center text-xs">4</span>
              Configurar Cadência
            </Label>


            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm text-muted-foreground">Mensagens por hora</Label>
                <span className="font-semibold text-sm bg-primary/10 text-primary px-2 py-0.5 rounded">
                  {messagesPerHour}/h
                </span>
              </div>
              <Slider
                value={[messagesPerHour]}
                onValueChange={([v]) => setMessagesPerHour(v)}
                min={5}
                max={100}
                step={5}
                className="w-full"
              />
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <AlertTriangle className="h-3.5 w-3.5 text-warning" />
                Recomendado: 20–60/h para preservar a qualidade do número
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" /> Início da janela
                </Label>
                <Select value={String(startHour)} onValueChange={(v) => setStartHour(Number(v))}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 24 }, (_, i) => (
                      <SelectItem key={i} value={String(i)}>{String(i).padStart(2, '0')}:00</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" /> Fim da janela
                </Label>
                <Select value={String(endHour)} onValueChange={(v) => setEndHour(Number(v))}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 24 }, (_, i) => (
                      <SelectItem key={i} value={String(i)}>{String(i).padStart(2, '0')}:00</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Estimate */}
          {(estimatedCount !== null || isEstimating) && (
            <>
              <Separator />
              <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                {isEstimating ? (
                  <p className="text-sm text-muted-foreground">Calculando estimativa...</p>
                ) : estimatedCount !== null && (
                  <>
                    <div className="flex items-center gap-2 text-sm">
                      <Users className="h-4 w-4 text-primary" />
                      <span className="font-medium">~{estimatedCount.toLocaleString('pt-BR')} destinatários</span>
                    </div>
                    {duration && (
                      <>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Clock className="h-4 w-4" />
                          <span>
                            ~{duration.hours > 0 ? `${duration.hours}h ` : ''}{duration.mins > 0 ? `${duration.mins}min` : ''} de envio
                          </span>
                        </div>
                        {completion && (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <CalendarIcon className="h-4 w-4" />
                            <span>Término estimado: {format(completion, "dd/MM 'às' HH'h'mm", { locale: ptBR })}</span>
                          </div>
                        )}
                      </>
                    )}
                    {estimatedCount === 0 && (
                      <p className="text-sm text-warning">Nenhum destinatário encontrado com esses filtros</p>
                    )}
                  </>
                )}
              </div>
            </>
          )}

          {/* Action buttons */}
          <div className="flex gap-2">
            {activeCampaign && activeCampaign.pending > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleCancelCampaign}
                disabled={isCancelling}
                className="text-destructive border-destructive hover:bg-destructive/10"
              >
                <Ban className="h-3.5 w-3.5 mr-1" />
                {isCancelling ? 'Cancelando...' : 'Cancelar campanha'}
              </Button>
            )}
            <Button
              onClick={handleDispatch}
              disabled={isDispatching || !selectedWorkflowId || estimatedCount === 0}
              className="flex-1"
            >
              <Play className="h-3.5 w-3.5 mr-1" />
              {isDispatching ? 'Agendando...' : 'Iniciar Disparo'}
            </Button>
          </div>

          {/* Progresso do disparo (RPC disparo_retroativo_progresso) — 21/09/2026.
              O dono pediu "contador dentro do fluxo": quanto já foi, para quem vai o
              próximo e quando acaba. Uma seção por campanha viva (ou a última encerrada). */}
          {selectedWorkflowId && (progresso?.campanhas?.length ?? 0) > 0 && (
            <>
              <Separator />
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-semibold">Progresso do disparo</Label>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    disabled={carregandoProgresso}
                    onClick={() => carregarProgresso(selectedWorkflowId)}
                  >
                    <RefreshCw className={cn('h-3.5 w-3.5 mr-1', carregandoProgresso && 'animate-spin')} />
                    Atualizar
                  </Button>
                </div>
                {progresso!.campanhas.map((c) => {
                  const processados = c.total - c.pendentes - c.processando;
                  const pct = c.total > 0 ? Math.round((processados / c.total) * 100) : 0;
                  const viva = c.pendentes > 0 || c.processando > 0;
                  const fmtHora = (iso: string | null) => iso ? format(new Date(iso), "dd/MM 'às' HH'h'mm", { locale: ptBR }) : '—';
                  const rotuloResultado: Record<string, string> = {
                    enviado: 'enviado', pulado: 'pulado (conversa aberta)', concluido: 'concluído sem envio', failed: 'não entregue',
                  };
                  return (
                    <div key={c.bulk_dispatch_id} className="rounded-lg border border-border p-3 space-y-3">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>Campanha de {fmtHora(c.criado_em)}</span>
                        <Badge variant={viva ? 'default' : 'secondary'} className="text-[10px]">
                          {viva ? 'em andamento' : 'encerrada'}
                        </Badge>
                      </div>
                      <Progress value={pct} className="h-2" />
                      <p className="text-xs text-muted-foreground text-right">
                        {processados.toLocaleString('pt-BR')} de {c.total.toLocaleString('pt-BR')} processados ({pct}%)
                      </p>
                      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
                        <div className="flex items-center gap-1.5">
                          <CheckCircle2 className="h-4 w-4 text-primary" />
                          <span className="font-medium">{c.enviados.toLocaleString('pt-BR')}</span>
                          <span className="text-muted-foreground text-xs">enviados</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Hourglass className="h-4 w-4 text-warning" />
                          <span className="font-medium">{c.pendentes.toLocaleString('pt-BR')}</span>
                          <span className="text-muted-foreground text-xs">aguardando</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Ban className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">{c.pulados.toLocaleString('pt-BR')}</span>
                          <span className="text-muted-foreground text-xs">pulados (conversa aberta)</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <XCircle className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">{(c.falhas + c.cancelados).toLocaleString('pt-BR')}</span>
                          <span className="text-muted-foreground text-xs">
                            {c.cancelados > 0 ? `não entregues + ${c.cancelados.toLocaleString('pt-BR')} cancelados` : 'não entregues'}
                          </span>
                        </div>
                      </div>
                      {viva && (
                        <div className="space-y-1 text-xs text-muted-foreground">
                          <div className="flex items-center gap-2">
                            <Clock className="h-3.5 w-3.5" />
                            <span>
                              Ritmo: {c.ritmo_ultima_hora}/h na última hora · próximo {fmtHora(c.proximo_em)}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <CalendarIcon className="h-3.5 w-3.5" />
                            <span>
                              Término estimado: {fmtHora(c.termino_estimado)}
                              {progresso!.fluxo_tem_fila ? ' (a Fila de Envio do fluxo pode esticar)' : ''}
                            </span>
                          </div>
                        </div>
                      )}
                      {!viva && c.ultimo_processado_em && (
                        <p className="text-xs text-muted-foreground">Último processado {fmtHora(c.ultimo_processado_em)}</p>
                      )}
                      {c.proximos.length > 0 && (
                        <div>
                          <p className="text-xs font-medium mb-1">Próximos da fila</p>
                          <ul className="text-xs space-y-0.5">
                            {c.proximos.map((p, i) => (
                              <li key={i} className="flex justify-between gap-2">
                                <span className="truncate">{p.nome}{p.whatsapp_final ? ` · …${p.whatsapp_final}` : ''}</span>
                                <span className="text-muted-foreground shrink-0">{fmtHora(p.agendado_para)}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {c.ultimos.length > 0 && (
                        <div>
                          <p className="text-xs font-medium mb-1">Últimos processados</p>
                          <ul className="text-xs space-y-0.5">
                            {c.ultimos.map((u, i) => (
                              <li key={i} className="flex justify-between gap-2">
                                <span className="truncate">{u.nome}{u.whatsapp_final ? ` · …${u.whatsapp_final}` : ''}</span>
                                <span className="text-muted-foreground shrink-0">
                                  {rotuloResultado[u.resultado] ?? u.resultado} · {format(new Date(u.quando), 'HH:mm', { locale: ptBR })}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  );
                })}
                {progresso && (
                  <p className="text-[11px] text-muted-foreground text-right">
                    Atualizado {format(new Date(progresso.gerado_em), 'HH:mm:ss')} · atualiza sozinho a cada 30 s
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
