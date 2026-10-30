import { Card, CardContent } from "@/components/ui/card";
import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";
import type { EmailDailyPoint } from "@/hooks/useEmailPerformance";

interface Props {
  daily: EmailDailyPoint[];
  loading?: boolean;
}

function fmt(d: string) {
  const [, m, day] = d.split("-");
  return `${day}/${m}`;
}

const SERIES = [
  { key: "sent", label: "Enviados", color: "hsl(var(--chart-1))" },
  { key: "delivered", label: "Entregues", color: "hsl(var(--chart-5))" },
  { key: "opened", label: "Abertos", color: "hsl(var(--chart-4))" },
  { key: "clicked", label: "Clicados", color: "hsl(var(--chart-3))" },
] as const;

export function EmailChart({ daily, loading }: Props) {
  const data = daily.map((d) => ({ ...d, label: fmt(d.date) }));

  return (
    <Card className="rounded-2xl shadow-sm bg-card h-full">
      <CardContent className="p-4 2xl:p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-foreground">Análise Detalhada</h3>
          <span className="text-xs text-muted-foreground">evolução diária</span>
        </div>
        {/* Este Card é h-full num grid cujo irmão também é h-full: esta altura
            define a FILEIRA inteira. 220 no notebook, 300 a partir de 2xl. */}
        <div className="h-[220px] 2xl:h-[300px]">
          {loading ? (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
              Carregando…
            </div>
          ) : data.length === 0 ? (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
              Sem dados no período.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    const d: any = payload[0].payload || {};
                    return (
                      <div className="rounded-xl border border-border bg-card px-3 py-2 text-xs shadow-md">
                        <div className="font-semibold text-foreground mb-1">{label}</div>
                        {SERIES.map((s) => (
                          <div key={s.key} className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full" style={{ background: s.color }} />
                            <span className="text-muted-foreground">{s.label}</span>
                            <span className="ml-auto font-semibold tabular-nums text-foreground">
                              {Number(d[s.key] ?? 0).toLocaleString("pt-BR")}
                            </span>
                          </div>
                        ))}
                      </div>
                    );
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" />
                {SERIES.map((s) => (
                  <Line
                    key={s.key}
                    type="monotone"
                    dataKey={s.key}
                    name={s.label}
                    stroke={s.color}
                    strokeWidth={2}
                    dot={{ r: 2 }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
