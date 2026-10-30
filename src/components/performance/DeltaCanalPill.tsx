import { ArrowUp, ArrowDown, Minus } from "lucide-react";

/**
 * Pílula "vs média do canal" (em pontos percentuais) dos KPIs das páginas de
 * template. Herdou a régua do KpiWithDelta aposentado (21/08): diferença
 * menor que 1pp conta como "na média", e em métricas inversas (não entrega)
 * o lado ruim sai cinza — vermelho assustava o lojista com rotina de canal.
 */
export function DeltaCanalPill({
  pct,
  mediaPct,
  inverso = false,
}: {
  /** Taxa deste template. */
  pct: number;
  /** Média do canal no mesmo período; sem ela a pílula não aparece. */
  mediaPct?: number;
  /** true quando estar ACIMA da média é ruim (ex.: taxa de não entrega). */
  inverso?: boolean;
}) {
  if (typeof mediaPct !== "number" || Number.isNaN(mediaPct)) return null;

  const diff = pct - mediaPct;
  const abs = Math.abs(diff);
  if (abs < 1) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground">
        <Minus className="w-3 h-3" /> ≈ na média
      </span>
    );
  }

  const up = diff > 0;
  const isGood = inverso ? !up : up;
  const colorClass = isGood
    ? "text-success"
    : inverso
      ? "text-muted-foreground"
      : "text-destructive";
  const Arrow = up ? ArrowUp : ArrowDown;

  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-semibold ${colorClass}`}>
      <Arrow className="w-3 h-3" />
      {abs.toFixed(abs < 10 ? 1 : 0)} pp {up ? "acima" : "abaixo"} da média
    </span>
  );
}
