// Ranqueia templates de e-mail por ABERTURAS (proxy de engajamento).
import { Card, CardContent } from "@/components/ui/card";
import { Trophy, Medal, Award } from "lucide-react";

interface EmailTemplateLike {
  name: string;
  sent: number;
  delivered: number;
  opened: number;
  clicked?: number;
}

interface Props {
  templates: EmailTemplateLike[];
  loading?: boolean;
}

const RANK_META = [
  { icon: Trophy, color: "text-warning", bg: "bg-warning/10" },
  { icon: Medal, color: "text-muted-foreground", bg: "bg-muted" },
  { icon: Award, color: "text-brand-amber", bg: "bg-brand-amber/10" },
];

export function TopEmailTemplatesByEngagement({ templates, loading }: Props) {
  const top = [...templates]
    .sort((a, b) => b.opened - a.opened || b.sent - a.sent)
    .slice(0, 3);
  const maxOpened = top[0]?.opened || 1;

  return (
    <Card className="rounded-2xl shadow-sm bg-card h-full">
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-foreground">
            Top 3 Templates por Abertura
          </h3>
          <span className="text-xs text-muted-foreground">engajamento</span>
        </div>
        {loading ? (
          <div className="text-sm text-muted-foreground py-8 text-center">
            Carregando…
          </div>
        ) : top.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            Nenhum template enviado.
          </p>
        ) : (
          <div className="space-y-3">
            {top.map((t, idx) => {
              const meta = RANK_META[idx];
              const pct = Math.round((t.opened / maxOpened) * 100);
              const openRate = t.delivered
                ? Math.round((t.opened / t.delivered) * 100)
                : 0;
              return (
                <div
                  key={t.name}
                  className="flex items-center gap-3 p-3 rounded-xl bg-muted/30"
                >
                  <div className={`p-2 rounded-lg ${meta.bg} shrink-0`}>
                    <meta.icon className={`w-4 h-4 ${meta.color}`} strokeWidth={2} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">
                      {t.name}
                    </p>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="text-[11px] text-muted-foreground tabular-nums">
                        {t.sent.toLocaleString("pt-BR")} envios
                      </span>
                      <span className="text-[11px] text-success font-semibold tabular-nums">
                        {openRate}% abertura
                      </span>
                    </div>
                    <div className="mt-1.5 h-1 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold text-foreground leading-none tabular-nums">
                      {t.opened.toLocaleString("pt-BR")}
                    </p>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide mt-1">
                      aberturas
                    </p>
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
