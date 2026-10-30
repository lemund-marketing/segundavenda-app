import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { checkAdminAccess } from "@/utils/security";

export interface EmailTemplateMetric {
  template_id: string | null;
  name: string;
  category: string | null;
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  complained: number;
  failed: number;
  suppressed?: number;
}

export interface EmailPerformanceTotals {
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  complained: number;
  failed: number;
}

export interface EmailDailyPoint {
  date: string; // YYYY-MM-DD
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
}

export interface EmailPerformanceData {
  totals: EmailPerformanceTotals;
  templates: EmailTemplateMetric[];
  daily: EmailDailyPoint[];
  include_test_applied: boolean;
}

const ZERO_TOTALS: EmailPerformanceTotals = {
  sent: 0, delivered: 0, opened: 0, clicked: 0,
  bounced: 0, complained: 0, failed: 0,
};

const ZERO_DATA: EmailPerformanceData = {
  totals: ZERO_TOTALS,
  templates: [],
  daily: [],
  include_test_applied: false,
};

interface Params {
  sellerId: string | undefined | null;
  start: Date;
  end: Date;
  includeTest?: boolean;
}

/**
 * Diferente do Segundo Pedido (useState/useEffect manual), aqui usamos React Query
 * para ficar consistente com o resto do app — mas o formato de retorno
 * ({ data, loading, isAdmin, refetch }) é o mesmo, então os componentes não mudam.
 */
export function useEmailPerformance({ sellerId, start, end, includeTest = false }: Params) {
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let cancelled = false;
    checkAdminAccess().then((ok) => { if (!cancelled) setIsAdmin(ok); });
    return () => { cancelled = true; };
  }, []);

  const query = useQuery({
    queryKey: [
      "email-performance",
      sellerId,
      start.toISOString(),
      end.toISOString(),
      includeTest,
    ],
    enabled: !!sellerId,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<EmailPerformanceData> => {
      const { data: rpcData, error } = await (supabase.rpc as any)(
        "get_email_performance_stats",
        {
          _seller_id: sellerId,
          _start: start.toISOString(),
          _end: end.toISOString(),
          _include_test: includeTest,
        }
      );
      if (error) throw error;
      const r: any = rpcData || {};
      const totalsSrc = r.totals ?? r;
      return {
        totals: {
          sent: Number(totalsSrc.sent || 0),
          delivered: Number(totalsSrc.delivered || 0),
          opened: Number(totalsSrc.opened || 0),
          clicked: Number(totalsSrc.clicked || 0),
          bounced: Number(totalsSrc.bounced || 0),
          complained: Number(totalsSrc.complained || 0),
          failed: Number(totalsSrc.failed || 0),
        },
        templates: ((r.templates as any[]) || []).map((t) => ({
          template_id: t.template_id ?? null,
          name: t.template_name ?? t.name ?? "Sem template",
          category: t.category ?? null,
          sent: Number(t.sent || 0),
          delivered: Number(t.delivered || 0),
          opened: Number(t.opened || 0),
          clicked: Number(t.clicked || 0),
          bounced: Number(t.bounced || 0),
          complained: Number(t.complained || 0),
          failed: Number(t.failed || 0),
          suppressed: Number(t.suppressed || 0),
        })),
        daily: ((r.daily as any[]) || []).map((d) => ({
          date: String(d.date),
          sent: Number(d.sent || 0),
          delivered: Number(d.delivered || 0),
          opened: Number(d.opened || 0),
          clicked: Number(d.clicked || 0),
        })),
        include_test_applied: !!r.include_test_applied,
      };
    },
  });

  if (query.error) {
    console.error("[useEmailPerformance]", query.error);
  }

  return {
    data: query.data ?? ZERO_DATA,
    loading: query.isLoading || (!!sellerId && query.isFetching && !query.data),
    isAdmin,
    refetch: query.refetch,
  };
}
