import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BarChart3, LineChart as LineChartIcon, Activity } from "lucide-react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
  CartesianGrid,
} from "recharts";
import { MetricTooltip } from "@/components/ui/metric-tooltip";

export interface DailyPoint {
  date: string; // YYYY-MM-DD
  sent: number;
  delivered: number;
  read: number;
  replied?: number;
  failed?: number;
}

interface Props {
  data: DailyPoint[];
  loading?: boolean;
}

function formatDay(d: string) {
  const [, m, day] = d.split("-");
  return `${day}/${m}`;
}

export function DailyEvolutionChart({ data, loading }: Props) {
  const [chartType, setChartType] = useState<"bar" | "line">("bar");
  // Paleta de gráfico da Segunda Venda (chart-1..5) — nada de hex hardcoded.
  const series = [
    { key: "sent", name: "Enviadas", color: "hsl(var(--chart-1))" },
    { key: "delivered", name: "Entregues", color: "hsl(var(--chart-5))" },
    { key: "read", name: "Lidas", color: "hsl(var(--chart-4))" },
    { key: "replied", name: "Respondidas", color: "hsl(var(--chart-2))" },
    { key: "failed", name: "Não entregues", color: "hsl(var(--muted-foreground))" },
  ];
  const totalFailed = data.reduce((acc, d) => acc + (d.failed ?? 0), 0);
  const chartData = data.map((d) => ({ ...d, label: formatDay(d.date) }));

  return (
    <Card className="rounded-2xl shadow-sm border-0 bg-card">
      <CardContent className="p-5">
        {/* Mesmo molde do Funil de Conversão: ícone em caixa bg-primary/10,
            título text-base semibold e subtítulo xs abaixo. A legenda e o
            alternador de gráfico continuam à direita. */}
        <div className="flex items-start justify-between mb-3 gap-3 flex-wrap">
          <div className="flex items-start gap-3 min-w-0">
            <div className="p-2.5 rounded-xl bg-primary/10 shrink-0">
              <Activity className="w-5 h-5 text-primary" strokeWidth={2} />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-foreground flex items-center gap-1.5">
                Evolução diária
                <MetricTooltip text="Quantidade de mensagens enviadas, entregues, lidas, respondidas e não entregues por dia (TZ Brasília) no período selecionado. Respondidas conta clientes únicos que enviaram pelo menos uma mensagem inbound após receber o template." />
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Como o desempenho do template variou dia a dia
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {totalFailed > 0 && (
              <span className="text-xs font-semibold text-muted-foreground bg-muted rounded-full px-2 py-0.5">
                {totalFailed.toLocaleString("pt-BR")} não entregues no período
              </span>
            )}
            <span className="text-xs text-muted-foreground">
              Enviadas / Entregues / Lidas / Respondidas / Não entregues
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setChartType((t) => (t === "bar" ? "line" : "bar"))}
              title={chartType === "bar" ? "Ver como linha" : "Ver como barras"}
            >
              {chartType === "bar" ? (
                <LineChartIcon className="w-3.5 h-3.5" />
              ) : (
                <BarChart3 className="w-3.5 h-3.5" />
              )}
            </Button>
          </div>
        </div>
        <div className="h-[280px]">
          {loading ? (
            <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
              Carregando…
            </div>
          ) : data.length === 0 ? (
            <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
              Sem dados no período.
            </div>
          ) : chartType === "bar" ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid hsl(var(--border))", fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" />
                {series.map((s) => (
                  <Bar key={s.key} dataKey={s.key} name={s.name} fill={s.color} radius={[4, 4, 0, 0]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid hsl(var(--border))", fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" />
                {series.map((s) => (
                  <Line
                    key={s.key}
                    type="monotone"
                    dataKey={s.key}
                    name={s.name}
                    stroke={s.color}
                    strokeWidth={2}
                    dot={{ r: 2 }}
                    activeDot={{ r: 4 }}
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
