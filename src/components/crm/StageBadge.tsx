import type { CSSProperties } from "react";

import { hexToRgba } from "@/components/clients/sections/shared";
import { flattenOn, inkPair } from "@/utils/contrastInk";

interface Props {
  name?: string | null;
  color?: string | null;
  /** `sm` card da conversa · `lg` topo do painel/sheet. (`md` ficou sem consumidor
   *  quando o cabeçalho da conversa trocou os selos pelos ícones de canal.) */
  size?: "sm" | "md" | "lg";
  className?: string;
}

const SIZES = {
  sm: "max-w-[110px] px-2 py-0.5 text-[10px] font-medium",
  md: "max-w-[160px] px-2 py-0.5 text-[11px] font-semibold",
  lg: "max-w-[220px] px-3 py-1.5 text-[12px] font-semibold",
} as const;

const DOTS = { sm: "h-1.5 w-1.5", md: "h-1.5 w-1.5", lg: "h-2 w-2" } as const;

/** `--card` dos dois temas: hsl(0 0% 99.6%) e hsl(240 10% 6%). */
const CARD_LIGHT = "#FEFEFE";
const CARD_DARK = "#18181B"; // --card escuro, hsl(240 7% 10%) desde 22/10/2026

/**
 * Etiqueta da fase do CRM. Existe para o mesmo dado não ser desenhado de dois
 * jeitos: a fase aparece ao mesmo tempo no card da lista e no topo do painel do
 * cliente.
 */
export function StageBadge({ name, color, size = "sm", className = "" }: Props) {
  if (!name) return null;
  const cor = color || "#09AF68";

  // A cor da fase serve de fundo e de bolinha como está, mas como TEXTO não:
  // sobre o próprio fundo a 15% nenhuma das 14 cores em uso passava em 4,5:1 no
  // tema claro (#eab308 dava 1,73:1; a melhor delas, #64748b, 3,92:1) e cinco
  // reprovavam também no escuro. `inkPair` anda com a cor até cruzar o mínimo
  // do WCAG — medindo sobre a PÍLULA achatada, não sobre o card, senão o
  // resultado fica ~0,8 ponto otimista. Como o tema é escolhido pelo CSS, as
  // duas tintas viajam juntas e o `dark:` decide.
  const ink = inkPair(cor, {
    light: flattenOn(cor, 0.15, CARD_LIGHT),
    dark: flattenOn(cor, 0.15, CARD_DARK),
  });
  const style = {
    background: hexToRgba(cor, 0.15),
    "--stage-ink": ink.light,
    "--stage-ink-dark": ink.dark,
  } as CSSProperties;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full shrink-0 text-[color:var(--stage-ink)] dark:text-[color:var(--stage-ink-dark)] ${SIZES[size]} ${className}`}
      style={style}
      title={`Fase do CRM: ${name}`}
    >
      <span className={`${DOTS[size]} rounded-full shrink-0`} style={{ background: cor }} />
      <span className="truncate">{name}</span>
    </span>
  );
}

export default StageBadge;
