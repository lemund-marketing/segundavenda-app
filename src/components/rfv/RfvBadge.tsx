import { RFV_COLORS } from "@/hooks/useRfv";

interface Props {
  segment: string | null | undefined;
  /**
   * `dot` = só a bolinha colorida com tooltip. Usado onde o espaço é curto
   * (card da conversa no Omnichannel, card do Kanban), para não empurrar o
   * resto da linha.
   */
  variant?: "full" | "dot";
  className?: string;
}

/** Etiqueta do segmento RFV do cliente. Some sozinha quando não há segmento. */
export function RfvBadge({ segment, variant = "full", className = "" }: Props) {
  if (!segment) return null;
  const color = RFV_COLORS[segment] ?? "#94a3b8";

  if (variant === "dot") {
    return (
      <span
        className={`inline-block h-2 w-2 rounded-full shrink-0 ${className}`}
        style={{ background: color }}
        title={`RFV: ${segment}`}
      />
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1 max-w-[160px] rounded-full px-2 py-0.5 text-[10px] font-medium border ${className}`}
      style={{ color, borderColor: `${color}55`, background: `${color}14` }}
      title={`Análise RFV: ${segment}`}
    >
      <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: color }} />
      <span className="truncate">{segment}</span>
    </span>
  );
}

export default RfvBadge;
