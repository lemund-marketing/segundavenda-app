import { useState } from "react";
import { Link } from "react-router-dom"; // app: o aviso leva a uma tela do app, sem recarregar a página
import { AlertTriangle, Workflow, MessageSquare } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { useRecentFailures, type RecentFailure } from "@/hooks/useWorkflowStatsData";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

export interface PerformanceAlert {
  type: "warning" | "error";
  message: string;
  link?: string;
}

function FailureSheet({ sellerId }: { sellerId: string }) {
  const [open, setOpen] = useState(false);
  const { data: failures = [], isLoading, isPending, isPaused } = useRecentFailures(sellerId, open); // app: isPending/isPaused para o "Sem internet"

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button className="text-xs font-medium text-primary hover:underline shrink-0 cursor-pointer">
          Ver detalhes →
        </button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col">
        <SheetHeader className="p-5 border-b">
          <SheetTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="w-4 h-4 text-muted-foreground" />
            Não entregues nas últimas 24h
          </SheetTitle>
        </SheetHeader>
        <div className="flex-1 min-h-0">
          <ScrollArea className="h-[calc(100vh-80px)]">
            <div className="p-5 space-y-3">
              {isLoading ? (
                <p className="text-sm text-muted-foreground text-center py-8">Carregando…</p>
              ) : isPending && isPaused ? (
                // app: sem internet a consulta espera a conexão, e a lista vazia diria "Nenhuma" ao lado do aviso de falhas.
                <p className="text-sm text-muted-foreground text-center py-8">
                  Sem internet. A lista aparece assim que a conexão voltar.
                </p>
              ) : failures.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Nenhuma mensagem não entregue nas últimas 24h.
                </p>
              ) : (
                failures.map((failure) => (
                  <FailureRow key={`${failure.source}-${failure.id}`} failure={failure} />
                ))
              )}
            </div>
          </ScrollArea>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function FailureRow({ failure }: { failure: RecentFailure }) {
  const isWorkflow = failure.source === "workflow";
  return (
    <div className="rounded-xl border border-border/60 bg-card p-3 space-y-2">
      <div className="flex items-start gap-2">
        <div className="mt-0.5">
          {isWorkflow ? (
            <Workflow className="w-4 h-4 text-primary" />
          ) : (
            <MessageSquare className="w-4 h-4 text-brand-blue" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate">
            {failure.name}
          </p>
          <div className="flex items-center gap-2 mt-0.5">
            <Badge variant="outline" className="text-[10px] h-5 px-1.5">
              {isWorkflow ? "Workflow" : "WhatsApp"}
            </Badge>
            <span className="text-[11px] text-muted-foreground">
              {formatDistanceToNow(new Date(failure.createdAt), {
                addSuffix: true,
                locale: ptBR,
              })}
            </span>
          </div>
        </div>
      </div>
      <div className="bg-muted border border-border rounded-lg px-3 py-2">
        <p className="text-xs text-muted-foreground break-words leading-relaxed">
          {failure.error}
        </p>
      </div>
    </div>
  );
}

export function PerformanceAlerts({ alerts, sellerId }: { alerts: PerformanceAlert[]; sellerId?: string }) {
  if (alerts.length === 0) return null;

  return (
    <div className="space-y-2">
      {alerts.map((alert, i) => {
        const isError = alert.type === "error";
        return (
          <div
            key={i}
            className={`flex items-center gap-3 p-3 rounded-lg border text-sm ${
              isError
                ? "bg-muted/60 border-border"
                : "bg-warning/5 border-warning/20"
            }`}
          >
            <AlertTriangle
              className={`w-4 h-4 shrink-0 ${
                isError ? "text-muted-foreground" : "text-warning"
              }`}
            />
            <span className="flex-1 text-foreground">{alert.message}</span>
            {isError && sellerId ? (
              <FailureSheet sellerId={sellerId} />
            ) : alert.link ? (
              <Link
                to={alert.link}
                className="text-xs font-medium text-primary hover:underline shrink-0"
              >
                Ver detalhes →
              </Link>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
