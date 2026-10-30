import { CheckCircle2, XCircle, Loader2, MessageSquare, Clock, Zap, ArrowRight, MessageCircle, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TestRunEvent, TestRunStatus } from '@/hooks/useWorkflowTestRun';

interface WorkflowTestTimelineProps {
  events: TestRunEvent[];
  status: TestRunStatus | null;
  className?: string;
}

const formatTime = (iso: string) => {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return '';
  }
};

const getEventIcon = (type: string) => {
  switch (type) {
    case 'started':
      return <Zap className="h-3.5 w-3.5 text-primary" />;
    case 'node_started':
      return <Loader2 className="h-3.5 w-3.5 text-primary animate-spin" />;
    case 'node_completed':
      return <CheckCircle2 className="h-3.5 w-3.5 text-primary" />;
    case 'node_error':
    case 'error':
      return <XCircle className="h-3.5 w-3.5 text-destructive" />;
    case 'client_reply':
      return <MessageCircle className="h-3.5 w-3.5 text-secondary" />;
    case 'queued':
      return <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />;
    case 'waiting_reply':
      return <Clock className="h-3.5 w-3.5 text-warning" />;
    case 'completed':
      return <CheckCircle2 className="h-3.5 w-3.5 text-primary" />;
    default:
      return <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />;
  }
};

const getEventLabel = (event: TestRunEvent): string => {
  if (event.label) return event.label;
  if (event.message) return event.message;
  switch (event.type) {
    case 'started':
      return 'Teste iniciado';
    case 'node_started':
      return `Executando: ${event.node_type || 'nó'}`;
    case 'node_completed':
      return `Concluído: ${event.node_type || 'nó'}`;
    case 'node_error':
      return `Erro em ${event.node_type || 'nó'}`;
    case 'client_reply':
      return 'Resposta recebida do cliente';
    case 'queued':
      return 'Workflow enfileirado';
    case 'waiting_reply':
      return 'Aguardando resposta…';
    case 'completed':
      return 'Workflow concluído';
    default:
      return event.type;
  }
};

const StatusPill = ({ status }: { status: TestRunStatus | null }) => {
  if (!status) return null;
  const cfg: Record<TestRunStatus, { label: string; cls: string; icon: any }> = {
    running: { label: 'Em execução', cls: 'bg-primary/10 text-primary border-primary/30', icon: <Loader2 className="h-3 w-3 animate-spin" /> },
    waiting_reply: { label: 'Aguardando resposta', cls: 'bg-warning/10 text-warning dark:text-warning border-warning/30', icon: <Clock className="h-3 w-3" /> },
    completed: { label: 'Concluído', cls: 'bg-primary/10 text-primary dark:text-primary border-primary/30', icon: <CheckCircle2 className="h-3 w-3" /> },
    error: { label: 'Erro', cls: 'bg-destructive/10 text-destructive border-destructive/30', icon: <XCircle className="h-3 w-3" /> },
    cancelled: { label: 'Cancelado', cls: 'bg-muted text-muted-foreground border-border', icon: <AlertCircle className="h-3 w-3" /> },
  };
  const c = cfg[status];
  if (!c) return null;
  return (
    <div className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium', c.cls)}>
      {c.icon}
      {c.label}
    </div>
  );
};

export const WorkflowTestTimeline = ({ events, status, className }: WorkflowTestTimelineProps) => {
  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">Linha do tempo</span>
        <StatusPill status={status} />
      </div>

      <div className="rounded-lg border bg-muted/20 max-h-72 overflow-y-auto">
        {events.length === 0 ? (
          <div className="px-4 py-6 text-center text-xs text-muted-foreground">
            Aguardando primeiros eventos…
          </div>
        ) : (
          <ol className="divide-y divide-border/50">
            {events.map((event, idx) => (
              <li key={idx} className="flex items-start gap-2.5 px-3 py-2">
                <div className="mt-0.5 flex-shrink-0">{getEventIcon(event.type)}</div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs text-foreground leading-tight">{getEventLabel(event)}</div>
                  {event.node_id && (
                    <div className="text-[10px] text-muted-foreground/70 font-mono mt-0.5 truncate">
                      {event.node_id}
                    </div>
                  )}
                </div>
                <div className="text-[10px] text-muted-foreground/70 flex-shrink-0 tabular-nums">
                  {formatTime(event.timestamp)}
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
};

export default WorkflowTestTimeline;
