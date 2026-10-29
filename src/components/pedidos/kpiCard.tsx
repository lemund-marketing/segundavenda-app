/**
 * Restos úteis do antigo card de KPI da /pedidos. O card em si virou o
 * KpiPadrao (padrão único de 21/08 — ícone verde, tooltip de origem no card);
 * ficam aqui a moldura CARD (usada também pelo PedidosChartCard e pelo estado
 * de erro dos KPIs) e os helpers de variação que preenchem o rodapé dos cards.
 */

/**
 * Estilo dos cards do topo da /pedidos, numa constante só.
 *
 * `bg-card` + `shadow-card` são os mesmos tokens do card da lista logo abaixo,
 * e viram a versão escura sozinhos. A escala de raio do projeto é achatada em
 * 12px, então `rounded-2xl` aqui rende o mesmo pixel de qualquer outro card.
 */
export const CARD = "rounded-2xl bg-card shadow-card p-5";

/* ------------------------------------------------------------------- deltas */

const pct1 = (n: number) =>
  n.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export const signLabel = (v: number) =>
  v > 0 ? `↑ ${pct1(v)}%` : v < 0 ? `↓ ${pct1(Math.abs(v))}%` : "0,0%";

export const signColor = (v: number) =>
  v > 0
    ? "text-emerald-600 dark:text-emerald-400"
    : v < 0
      ? "text-red-600 dark:text-red-400"
      : "text-muted-foreground";

/**
 * Variação percentual, ou `null` quando não existe base de comparação.
 *
 * O `%` nunca é calculado no SQL de propósito: com o período anterior em zero
 * ele viraria "+100%", que é mentira. Aqui o `null` vira texto honesto.
 */
export function deltaPct(current: number, previous: number): number | null {
  if (!Number.isFinite(previous) || previous <= 0) return null;
  return ((current - previous) / previous) * 100;
}

interface DeltaProps {
  current: number;
  previous: number;
  /** o que dizer quando o período anterior é zero e o atual não */
  novoLabel?: string;
  suffix?: string;
}

export function Delta({ current, previous, novoLabel, suffix = "vs período anterior" }: DeltaProps) {
  const d = deltaPct(current, previous);
  if (d === null) {
    if (current > 0 && novoLabel) {
      return <span className="text-emerald-600 dark:text-emerald-400">{novoLabel}</span>;
    }
    return <span className="text-muted-foreground">sem base anterior</span>;
  }
  return (
    <span className={signColor(d)}>
      {signLabel(d)} {suffix}
    </span>
  );
}
