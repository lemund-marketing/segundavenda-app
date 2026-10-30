import { Card, CardContent } from "@/components/ui/card";
import { Flame } from "lucide-react";
import { MetricTooltip } from "@/components/ui/metric-tooltip";

interface HeatmapCell { dow: number; hour: number; sent: number; read: number; }
interface ReadHeatmapProps { data: HeatmapCell[]; loading?: boolean; }

const DOW = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
// Índice de exibição (0=Seg) → dow do Postgres (0=Dom). seg=1, ter=2, ..., sab=6, dom=0.
const DISPLAY_TO_PG_DOW = [1, 2, 3, 4, 5, 6, 0];

export function ReadHeatmap({ data, loading }: ReadHeatmapProps) {
  const grid = new Map<string, HeatmapCell>();
  data.forEach((c) => grid.set(`${c.dow}-${c.hour}`, c));
  const max = Math.max(1, ...data.map((c) => c.read));

  return (
    <Card className="rounded-2xl shadow-sm border-0 bg-card">
      <CardContent className="p-5 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-1.5">
            <Flame className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Heatmap de leituras</h3>
            <MetricTooltip text="Distribuição das leituras por dia da semana × hora do dia (TZ Brasília). Cada célula mostra quantas mensagens foram lidas naquele slot. Cores mais escuras = maior concentração." />
          </div>
          <span className="text-[11px] text-muted-foreground">Dia da semana × hora (TZ Brasília)</span>
        </div>

        {loading ? (
          <div className="h-40 animate-pulse bg-muted rounded-xl" />
        ) : (
          <div className="w-full overflow-x-auto">
            <table className="w-full min-w-[560px] text-[10px] border-separate border-spacing-[2px] table-fixed">
              <thead>
                <tr>
                  <th className="w-10" />
                  {Array.from({ length: 24 }, (_, h) => (
                    <th key={h} className="text-muted-foreground font-medium text-center">
                      {h % 3 === 0 ? h : ""}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {DOW.map((label, displayIdx) => {
                  const dow = DISPLAY_TO_PG_DOW[displayIdx];
                  return (
                    <tr key={dow}>
                      <td className="pr-2 text-muted-foreground font-semibold text-right w-10">{label}</td>
                      {Array.from({ length: 24 }, (_, h) => {
                        const cell = grid.get(`${dow}-${h}`);
                        const reads = cell?.read || 0;
                        const sent = cell?.sent || 0;
                        const intensity = reads / max;
                        const rate = sent ? Math.round((reads / sent) * 100) : 0;
                        return (
                          <td
                            key={h}
                            title={`${label} ${h}h • ${reads} lidas / ${sent} envios (${rate}%)`}
                            className="h-8 rounded-[4px]"
                            style={{
                              backgroundColor:
                                reads === 0
                                  ? "hsl(var(--muted))"
                                  : `hsl(var(--primary) / ${0.15 + intensity * 0.85})`,
                            }}
                          />
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
