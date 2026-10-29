import { format, formatDistanceToNowStrict } from "date-fns";
import { ptBR } from "date-fns/locale";

export type RelativeTone = "fresh" | "muted" | "stale";

const DAY_MS = 1000 * 60 * 60 * 24;

/**
 * "há 23min" / "há 19h" / "há 5d" — mesma abreviação usada na tabela de clientes.
 * `tone` classifica a idade para colorir o texto sem recalcular a data no componente.
 */
export function relativeLabel(iso: string | null | undefined): { text: string; tone: RelativeTone } {
  if (!iso) return { text: "—", tone: "muted" };

  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { text: "—", tone: "muted" };

  const days = Math.floor((Date.now() - d.getTime()) / DAY_MS);
  const raw = formatDistanceToNowStrict(d, { locale: ptBR, addSuffix: false });

  const abreviado = raw
    .replace(/\bsegundos?\b/i, "s")
    .replace(/\bminutos?\b/i, "min")
    .replace(/\bhoras?\b/i, "h")
    .replace(/\bdias?\b/i, "d")
    .replace(/\bmeses\b/i, "m")
    .replace(/\bmês\b/i, "m")
    .replace(/\banos?\b/i, "a")
    .replace(/\s+/g, "");

  const tone: RelativeTone = days <= 7 ? "fresh" : days <= 60 ? "muted" : "stale";

  return { text: `há ${abreviado}`, tone };
}

export function absoluteLabel(iso: string | null | undefined): string {
  if (!iso) return "—";

  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";

  return format(d, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
}
