import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import type { FailureReasonStat } from "@/hooks/useWorkflowStatsData";

interface Props {
  data: FailureReasonStat[] | undefined;
  loading?: boolean;
  title?: string;
}

export function TopFailureReasons({ data, loading, title = "Top motivos de não entrega" }: Props) {
  const items = data ?? [];
  const max = items.length > 0 ? Math.max(...items.map((x) => x.count)) : 1;

  return (
    <Card className="rounded-2xl shadow-sm border-0 bg-card">
      <CardContent className="p-5 space-y-4">
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-xl bg-muted shrink-0">
            <AlertTriangle className="w-5 h-5 text-muted-foreground" strokeWidth={2} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold text-foreground">{title}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Razões dos disparos que não foram entregues
            </p>
          </div>
        </div>

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-8 bg-muted animate-pulse rounded-lg" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center py-6 text-muted-foreground">
            <CheckCircle2 className="w-8 h-8 text-success mb-2" />
            <p className="text-sm font-medium text-foreground">Sem mensagens não entregues no período</p>
            <p className="text-xs mt-1">Todos os disparos foram entregues com sucesso.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((item) => {
              const widthPct = Math.max(6, Math.round((item.count / max) * 100));
              return (
                <div key={item.reason} className="space-y-1">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="font-medium text-foreground truncate" title={item.reason}>
                      {item.reason}
                    </span>
                    <span className="text-xs font-semibold tabular-nums text-muted-foreground shrink-0">
                      {item.count.toLocaleString("pt-BR")}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full bg-muted-foreground/50 rounded-full transition-all"
                      style={{ width: `${widthPct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
