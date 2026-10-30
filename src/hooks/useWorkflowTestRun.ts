import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type TestRunStatus = 'running' | 'waiting_reply' | 'completed' | 'error' | 'cancelled';

export interface TestRunEvent {
  timestamp: string;
  type: string;
  node_id?: string | null;
  node_type?: string | null;
  label?: string;
  message?: string;
  [k: string]: any;
}

export interface TestRun {
  id: string;
  workflow_id: string;
  seller_id: string;
  status: TestRunStatus;
  test_phone: string;
  events: TestRunEvent[];
  last_active_node_id: string | null;
  started_at: string;
  finished_at: string | null;
  error_message: string | null;
}

interface UseWorkflowTestRunResult {
  testRun: TestRun | null;
  events: TestRunEvent[];
  activeNodeId: string | null;
  status: TestRunStatus | null;
  loading: boolean;
  reset: () => void;
}

/**
 * Assina realtime updates de um workflow_test_runs específico.
 * Retorna o estado atual da execução de teste para popular timeline e canvas.
 */
export const useWorkflowTestRun = (testRunId: string | null): UseWorkflowTestRunResult => {
  const [testRun, setTestRun] = useState<TestRun | null>(null);
  const [loading, setLoading] = useState(false);
  const channelRef = useRef<any>(null);

  const reset = useCallback(() => {
    setTestRun(null);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!testRunId) {
      setTestRun(null);
      return;
    }

    let cancelled = false;
    // app: o polling seguia consultando a cada 2 s depois do fim do teste, com a
    // janela e o fluxo fechados, até sair da tela (o diálogo fica montado na
    // página). Terminado, o tique só pula a consulta: uma resposta lenta que
    // chegue depois com 'running' volta a consultar e a tela se corrige.
    let terminou = false;
    const anotarStatus = (run: any) => {
      terminou = ['completed', 'error', 'cancelled'].includes(run?.status);
    };
    setLoading(true);

    const fetchSnapshot = async () => {
      const { data, error } = await supabase
        .from('workflow_test_runs' as any)
        .select('*')
        .eq('id', testRunId)
        .maybeSingle();

      if (cancelled) return;
      if (!error && data) {
        anotarStatus(data);
        setTestRun(data as any);
      }
    };

    // Carrega snapshot inicial
    (async () => {
      await fetchSnapshot();
      if (!cancelled) setLoading(false);
    })();

    // Subscribe a updates (realtime)
    const channel = supabase
      .channel(`workflow_test_run_${testRunId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'workflow_test_runs',
          filter: `id=eq.${testRunId}`,
        },
        (payload) => {
          if (cancelled) return;
          anotarStatus(payload.new);
          setTestRun(payload.new as any);
        }
      )
      .subscribe();

    channelRef.current = channel;

    // Polling de fallback enquanto a execução está ativa (cobre updates perdidos
    // antes do subscribe estar pronto e qualquer gap na entrega do realtime).
    const interval = setInterval(() => {
      if (cancelled) return;
      if (terminou) return; // app: ver anotarStatus
      fetchSnapshot();
    }, 2000);

    return () => {
      cancelled = true;
      clearInterval(interval);
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [testRunId]);

  const events = (testRun?.events || []) as TestRunEvent[];
  const activeNodeId = testRun?.last_active_node_id || null;
  const status = (testRun?.status as TestRunStatus) || null;

  return { testRun, events, activeNodeId, status, loading, reset };
};
