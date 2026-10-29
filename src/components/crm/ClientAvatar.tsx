import type { CSSProperties } from "react";

import { avatarToneFor, getInitials } from "@/components/clients/sections/shared";
import { flattenOn, inkPair } from "@/utils/contrastInk";

interface ClientAvatarProps {
  name?: string | null;
  size?: number;
  /** Padrão: 38% do diâmetro. Só para casar com um tamanho de texto já desenhado. */
  fontSize?: number;
  className?: string;
}

/** `--card` dos dois temas: hsl(0 0% 99.6%) e hsl(240 10% 6%). */
const CARD_LIGHT = "#FEFEFE";
const CARD_DARK = "#18181B"; // --card escuro, hsl(240 7% 10%) desde 22/10/2026

/**
 * Inicial do cliente no círculo colorido — card do Kanban, lista de conversas,
 * cabeçalho da conversa e topo da ficha.
 *
 * A paleta é a mesma da lista de Clientes (`avatarToneFor`): o tom sai de um hash
 * do nome, então o mesmo cliente tem sempre a mesma cor em todas as telas.
 *
 * O `fg` da paleta foi escolhido para fundo claro (#047857, #4338ca…) e some sobre
 * o círculo do tema escuro — sete das oito tintas ficam abaixo de 3:1 lá, e a
 * oitava (#09AF68) reprova no claro. `inkPair` caminha a tinta até cruzar 4,5:1
 * medindo sobre o CÍRCULO achatado (a cor a 15% sobre o card), não sobre o card:
 * medir no card sai ~0,8 ponto otimista. As duas tintas viajam em variáveis e o
 * `dark:` decide, porque o tema é escolhido pelo CSS.
 */
export function ClientAvatar({ name, size = 32, fontSize, className = "" }: ClientAvatarProps) {
  const tone = avatarToneFor(name);
  const ink = inkPair(tone.fg, {
    light: flattenOn(tone.base, 0.15, CARD_LIGHT),
    dark: flattenOn(tone.base, 0.15, CARD_DARK),
  });

  const style = {
    width: size,
    height: size,
    background: tone.bg,
    fontSize: fontSize ?? Math.max(11, Math.round(size * 0.38)),
    "--avatar-ink": ink.light,
    "--avatar-ink-dark": ink.dark,
  } as CSSProperties;

  return (
    <div
      className={`rounded-full flex items-center justify-center font-bold shrink-0 select-none text-[color:var(--avatar-ink)] dark:text-[color:var(--avatar-ink-dark)] ${className}`}
      style={style}
      aria-hidden
    >
      {getInitials(name || "")}
    </div>
  );
}

export default ClientAvatar;
