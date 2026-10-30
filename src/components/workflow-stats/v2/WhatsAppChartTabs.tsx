import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Legend, Cell,
} from "recharts";
import { cn } from "@/lib/utils";
import type { DailyPoint } from "@/components/workflow-stats/DailyEvolutionChart";
import type { FailureReasonStat, HourPoint } from "@/hooks/useWorkflowStatsData";

interface Props {
  daily: DailyPoint[];
  hourly: HourPoint[];
  failures: FailureReasonStat[];
  loading?: boolean;
}

const TABS = [
  { id: "evolution", label: "Evolução Diária" },
  { id: "hour", label: "Melhor Horário" },
  { id: "failures", label: "Não entregues" },
] as const;

const SERIES = [
  { key: "sent", label: "Enviadas", color: "hsl(var(--chart-1))" },
  { key: "delivered", label: "Entregues", color: "hsl(var(--chart-5))" },
  { key: "read", label: "Lidas", color: "hsl(var(--chart-4))" },
  { key: "replied", label: "Respondidas", color: "hsl(var(--chart-2))" },
  { key: "failed", label: "Não entregues", color: "hsl(var(--muted-foreground))" },
] as const;

function fmt(d: string) {
  const [, m, day] = d.split("-");
  return `${day}/${m}`;
}

export function WhatsAppChartTabs({ daily, hourly, failures, loading }: Props) {
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("evolution");

  const dailyData = daily.map((d) => ({ ...d, label: fmt(d.date) }));

  const hourFull = Array.from({ length: 24 }, (_, h) => {
    const p = hourly.find((x) => x.hour === h);
    const sent = p?.sent || 0;
    const read = p?.read || 0;
    return {
      hour: h,
      label: `${String(h).padStart(2, "0")}h`,
      rate: sent > 0 ? Math.round((read / sent) * 100) : 0,
      sent,
      read,
    };
  });
  const best = hourFull
    .filter((d) => d.sent >= 5)
    .reduce<typeof hourFull[number] | null>(
      (acc, d) => (!acc || d.rate > acc.rate ? d : acc),
      null,
    );

  return (
    <Card className="rounded-2xl shadow-sm bg-card">
      <CardContent className="p-4 2xl:p-6">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h3 className="text-sm font-semibold text-foreground">
            Análise Detalhada
          </h3>
          <div className="flex items-center gap-1 p-1 rounded-xl bg-muted">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  "px-3 py-1.5 text-xs font-semibold rounded-lg transition-all",
                  tab === t.id
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* 300px fixos jogavam o gráfico inteiro para baixo da dobra no
            notebook; 220 aqui, 300 só a partir de 2xl (1536px). */}
        <div className="h-[220px] 2xl:h-[300px]">
          {loading ? (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
              Carregando…
            </div>
          ) : tab === "evolution" ? (
            dailyData.length === 0 ? (
              <Empty />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={dailyData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
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
            )
          ) : tab === "hour" ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hourFull} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={2} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} unit="%" />
                <Tooltip
                  contentStyle={{ borderRadius: 12, border: "1px solid hsl(var(--border))", fontSize: 12 }}
                  formatter={(v: number) => [`${v}%`, "Taxa de leitura"]}
                  labelFormatter={(label, payload) => {
                    const d: any = payload?.[0]?.payload;
                    return `${label} • ${d?.sent || 0} envios / ${d?.read || 0} lidas`;
                  }}
                />
                <Bar dataKey="rate" radius={[4, 4, 0, 0]}>
                  {hourFull.map((d) => (
                    <Cell
                      key={d.hour}
                      fill={best && d.hour === best.hour ? "hsl(var(--success))" : "hsl(var(--primary) / 0.6)"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : failures.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-sm text-muted-foreground">
              <p>Nenhuma mensagem não entregue no período. 🎉</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={failures}
                layout="vertical"
                margin={{ top: 8, right: 16, left: 8, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis
                  type="category"
                  dataKey="reason"
                  tick={{ fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={160}
                  tickFormatter={(v: string) => (v.length > 22 ? `${v.slice(0, 22)}…` : v)}
                />
                <Tooltip
                  contentStyle={{ borderRadius: 12, border: "1px solid hsl(var(--border))", fontSize: 12 }}
                />
                <Bar dataKey="count" fill="hsl(var(--muted-foreground))" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function Empty() {
  return (
    <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
      Sem dados no período.
    </div>
  );
}
