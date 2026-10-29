import { Area, ComposedChart, Line, ReferenceDot, ReferenceLine, ResponsiveContainer, XAxis, YAxis } from "recharts";

export interface PontoCurva {
  i: number;
  linha: number | undefined;
  andamento: number | undefined;
}

/**
 * O desenho da curva de faturamento do Dashboard do celular (a interação, a
 * escala e os rótulos ficam em DashboardMobile). Arquivo próprio para a
 * biblioteca de gráficos sair do pacote inicial do app.
 */
export default function CurvaGrafico({
  dados, ultimo, dominio, emAndamento, ponto, marcado, yMarcado,
}: {
  dados: PontoCurva[];
  ultimo: number;
  dominio: [number, number];
  emAndamento: boolean;
  /** O ponto escolhido pelo dedo; null quando ninguém está escolhendo. */
  ponto: number | null;
  /** O ponto com a bolinha: o escolhido ou o último. */
  marcado: number;
  yMarcado: number;
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={dados} margin={{ top: 10, right: 12, bottom: 8, left: 0 }}>
        <defs>
          <linearGradient id="dm-curva-faturamento" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.2} />
            <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis dataKey="i" type="number" domain={[0, ultimo]} hide />
        <YAxis hide domain={dominio} allowDataOverflow />
        <Area
          type="monotone"
          dataKey="linha"
          stroke="hsl(var(--primary))"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="url(#dm-curva-faturamento)"
          dot={false}
          activeDot={false}
          isAnimationActive={false}
        />
        {emAndamento && (
          <Line
            type="monotone"
            dataKey="andamento"
            stroke="hsl(var(--primary))"
            strokeOpacity={0.45}
            strokeWidth={2.5}
            strokeDasharray="3 5"
            strokeLinecap="round"
            dot={false}
            activeDot={false}
            isAnimationActive={false}
          />
        )}
        {ponto !== null && (
          <ReferenceLine x={marcado} stroke="hsl(var(--foreground))" strokeOpacity={0.15} strokeWidth={1.5} />
        )}
        <ReferenceDot
          x={marcado}
          y={yMarcado}
          r={5}
          fill="hsl(var(--primary))"
          fillOpacity={ponto === null && emAndamento ? 0.55 : 1}
          stroke="hsl(var(--card))"
          strokeWidth={2.5}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
