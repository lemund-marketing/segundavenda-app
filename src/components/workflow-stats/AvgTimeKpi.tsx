import { Card, CardContent } from "@/components/ui/card";
import { Clock, Timer } from "lucide-react";
import { MetricTooltip } from "@/components/ui/metric-tooltip";

interface AvgTimeKpiProps {
  label: string;
  avgSeconds: number;
  /** Mediana opcional. Quando ausente (canal sem mediana real), a linha não é exibida. */
  medianSeconds?: number | null;
  tone?: "primary" | "info" | "warning";
  loading?: boolean;
  tooltip?: string;
}

function fmt(sec: number) {
  if (!sec || sec <= 0) return "—";
  if (sec < 60) return `${Math.round(sec)}s`;
  if (sec < 3600) return `${Math.round(sec / 60)}min`;
  if (sec < 86400) return `${(sec / 3600).toFixed(1)}h`;
  return `${(sec / 86400).toFixed(1)}d`;
}

const TONES = {
  primary: { bg: "from-primary/10 via-primary/5", icon: "text-primary" },
  info: { bg: "from-brand-blue/10 via-brand-blue/5", icon: "text-brand-blue" },
  warning: { bg: "from-warning/10 via-warning/5", icon: "text-warning" },
};

export function AvgTimeKpi({ label, avgSeconds, medianSeconds, tone = "primary", loading, tooltip }: AvgTimeKpiProps) {
  const t = TONES[tone];
  const Icon = tone === "warning" ? Timer : Clock;
  return (
    <Card className={`rounded-2xl shadow-sm border-0 bg-gradient-to-br ${t.bg} to-transparent`}>
      <CardContent className="p-5">
        <div className={`flex items-center gap-1.5 ${t.icon}`}>
          <Icon className="w-4 h-4" strokeWidth={2.25} />
          <span className="text-[11px] font-semibold uppercase tracking-wider">{label}</span>
          {tooltip && <MetricTooltip text={tooltip} iconClassName="w-3 h-3" />}
        </div>
        <p className="text-3xl font-bold text-foreground mt-2 leading-tight">
          {loading ? "—" : fmt(avgSeconds)}
        </p>
        {medianSeconds != null && (
          <p className="text-[11px] text-muted-foreground mt-1">
            Mediana: <span className="font-semibold text-foreground/80">{loading ? "—" : fmt(medianSeconds)}</span>
          </p>
        )}
      </CardContent>
    </Card>
  );
}
