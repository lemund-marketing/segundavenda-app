import { Card, CardContent } from "@/components/ui/card";
import { Send, MailCheck, Eye, MousePointerClick } from "lucide-react";
import { MetricTooltip } from "@/components/ui/metric-tooltip";

interface EmailFunnelProps {
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  loading?: boolean;
}

const steps = (sent: number, delivered: number, opened: number, clicked: number) => [
  {
    label: "Enviados",
    value: sent,
    pct: 100,
    icon: Send,
    color: "text-primary",
    bg: "bg-primary/10",
    barColor: "bg-primary",
    tooltip: "E-mails enviados no período (exclui suprimidos). Não entregues aparecem separados nos KPIs.",
  },
  {
    label: "Entregues",
    value: delivered,
    pct: sent ? Math.round((delivered / sent) * 100) : 0,
    icon: MailCheck,
    color: "text-success",
    bg: "bg-success/10",
    barColor: "bg-success",
    tooltip: "E-mails aceitos pelo servidor do destinatário. % calculado sobre Enviados.",
  },
  {
    label: "Abertos",
    value: opened,
    pct: delivered ? Math.round((opened / delivered) * 100) : 0,
    icon: Eye,
    color: "text-brand-blue",
    bg: "bg-brand-blue/10",
    barColor: "bg-brand-blue",
    tooltip: "E-mails abertos pelo destinatário (pixel de rastreio). % calculado sobre Entregues.",
  },
  {
    label: "Clicados",
    value: clicked,
    pct: opened ? Math.round((clicked / opened) * 100) : 0,
    icon: MousePointerClick,
    color: "text-warning",
    bg: "bg-warning/10",
    barColor: "bg-warning",
    tooltip: "Destinatários que clicaram em algum link. % calculado sobre Abertos.",
  },
];

export function EmailFunnel({ sent, delivered, opened, clicked, loading }: EmailFunnelProps) {
  const data = steps(sent, delivered, opened, clicked);
  return (
    <Card className="rounded-2xl shadow-sm border-0 bg-card">
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
            Funil de mensagens
            <MetricTooltip text="Pirâmide de engajamento por e-mail. Enviados → Entregues (% sobre envios) → Abertos (% sobre entregues) → Clicados (% sobre abertos)." />
          </h3>
          <span className="text-xs text-muted-foreground">
            Entrega: % de envios · Abertura: % de entregues · Clique: % de abertos
          </span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {data.map((step, idx) => (
            <div
              key={step.label}
              className="relative rounded-xl border-0 bg-muted/40 p-4 hover:shadow-hover transition"
            >
              <div className="flex items-center gap-2 mb-2">
                <div className={`p-1.5 rounded-lg ${step.bg}`}>
                  <step.icon className={`w-3.5 h-3.5 ${step.color}`} strokeWidth={2} />
                </div>
                <span className="text-xs text-muted-foreground font-medium">
                  {step.label}
                </span>
                <MetricTooltip text={step.tooltip} iconClassName="w-3 h-3" className="ml-auto" />
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-foreground tabular-nums">
                  {loading ? "—" : step.value.toLocaleString("pt-BR")}
                </span>
                {idx > 0 && !loading && (
                  <span className="text-xs font-semibold text-muted-foreground">
                    {step.pct}%
                  </span>
                )}
              </div>
              <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${step.barColor}`}
                  style={{ width: `${loading ? 0 : step.pct}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
