import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ChannelSummary {
  key: "whatsapp" | "email" | "sms";
  title: string;
  icon: any;
  iconColor: string;
  iconBg: string;
  /** Cor da sparkline — use um token, ex.: "hsl(var(--chart-1))". */
  sparkColor?: string;
  /** Série diária (contagem por dia) para a mini-sparkline. */
  daily: number[];
  /** KPIs principais do canal (2 a 3). */
  kpis: { label: string; value: string; highlight?: boolean }[];
  /** Linha extra de contexto (ex.: "14 templates ativos · 8 falhas"). */
  footer?: string;
  active: boolean;
}

interface Props {
  channels: ChannelSummary[];
  onSelect: (key: "whatsapp" | "email" | "sms") => void;
  loading?: boolean;
}

/** Mini-gráfico de linha (área + linha), sem eixos nem rótulos. */
function MiniSparkline({ data, color = "hsl(var(--primary))", gradKey }: { data: number[]; color?: string; gradKey: string }) {
  const width = 260;
  const height = 48;
  const hasData = data && data.some((v) => v > 0);
  if (!hasData) {
    return (
      <div className="flex items-center justify-center rounded-lg bg-muted/30" style={{ height }}>
        <span className="text-[11px] text-muted-foreground">Sem envios no período</span>
      </div>
    );
  }
  const max = Math.max(...data, 1);
  const stepX = width / (data.length - 1 || 1);
  const pts = data
    .map((v, i) => `${i * stepX},${height - (v / max) * (height - 4) - 2}`)
    .join(" ");
  // O id do gradiente precisa ser único por canal (a cor agora é um token
  // com caracteres inválidos para id, então usamos a chave do canal).
  const gradId = `spark-grad-${gradKey}`;
  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className="block"
    >
      <defs>
        <linearGradient id={gradId} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <polygon points={`0,${height} ${pts} ${width},${height}`} fill={`url(#${gradId})`} stroke="none" />
      <polyline
        points={pts}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export function ChannelSummaryCards({ channels, onSelect, loading }: Props) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {channels.map((c) => (
        <Card
          key={c.key}
          onClick={() => onSelect(c.key)}
          className="rounded-2xl shadow-sm bg-card hover:shadow-hover hover:-translate-y-0.5 transition-all duration-200 cursor-pointer group flex flex-col"
        >
          <CardContent className="p-5 flex flex-col flex-1">
            {/* Header */}
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <div className={cn("p-2.5 rounded-lg", c.iconBg)}>
                  <c.icon className={cn("w-5 h-5", c.iconColor)} strokeWidth={2} />
                </div>
                <h3 className="text-base font-semibold text-foreground">{c.title}</h3>
              </div>
              <Badge
                variant="outline"
                className={cn(
                  "text-[10px]",
                  c.active
                    ? "bg-success/10 text-success border-success/20"
                    : "bg-muted text-muted-foreground border-border"
                )}
              >
                {c.active ? "Ativo" : "Sem envios"}
              </Badge>
            </div>

            {/* Mini-sparkline */}
            <div className="mb-4">
              {loading ? (
                <div className="h-12 rounded-lg bg-muted/40 animate-pulse" />
              ) : (
                <MiniSparkline data={c.daily} color={c.sparkColor} gradKey={c.key} />
              )}
            </div>

            {/* KPIs principais */}
            <div className={cn("grid gap-2 mb-3", c.kpis.length >= 3 ? "grid-cols-3" : "grid-cols-2")}>
              {c.kpis.map((k) => (
                <div key={k.label}>
                  <p
                    className={cn(
                      "text-lg font-bold tabular-nums leading-tight",
                      k.highlight ? "text-primary" : "text-foreground"
                    )}
                  >
                    {loading ? "—" : k.value}
                  </p>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide mt-0.5">
                    {k.label}
                  </p>
                </div>
              ))}
            </div>

            {/* Footer de contexto (templates ativos · falhas) */}
            {c.footer && (
              <div className="mb-3 pt-3 border-t border-border/60 text-[11px] text-muted-foreground tabular-nums">
                {loading ? "—" : c.footer}
              </div>
            )}

            {/* CTA */}
            <div className="mt-auto pt-1 inline-flex items-center gap-1 text-xs font-semibold text-primary group-hover:gap-2 transition-all">
              Ver detalhes <ArrowRight className="w-3.5 h-3.5" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
