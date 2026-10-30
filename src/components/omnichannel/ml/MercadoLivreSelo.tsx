import { Handshake } from "lucide-react";

import { cn } from "@/lib/utils";
import { ML_AMARELO, ML_AZUL } from "./mlTipos";

interface MercadoLivreSeloProps {
  /** sm = 20px (linha de texto, filtro); md = 40px (no lugar do avatar). */
  tamanho?: "sm" | "md";
  className?: string;
  title?: string;
}

const MEDIDAS = {
  sm: { caixa: 20, icone: 12 },
  md: { caixa: 40, icone: 22 },
} as const;

/**
 * Selo do Mercado Livre: círculo amarelo com o aperto de mãos em azul-marinho.
 *
 * Não existe arquivo de logo do ML no projeto e não baixamos marca da internet,
 * então o selo é desenhado aqui (molde: `WhatsAppIcon`, ícone inline). Amarelo
 * OPACO com o azul por cima dá ~9:1 nos dois temas — a cor não depende do fundo,
 * por isso não precisa do `inkPair`. O anel fino separa o círculo do card
 * amarelado no tema claro, onde amarelo sobre amarelo se confundia.
 */
export function MercadoLivreSelo({ tamanho = "sm", className, title = "Mercado Livre" }: MercadoLivreSeloProps) {
  const m = MEDIDAS[tamanho];
  return (
    <span
      role="img"
      aria-label={title}
      title={title}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full ring-1 ring-black/10 dark:ring-white/15 select-none",
        className,
      )}
      style={{ width: m.caixa, height: m.caixa, background: ML_AMARELO, color: ML_AZUL }}
    >
      <Handshake width={m.icone} height={m.icone} strokeWidth={2.25} aria-hidden />
    </span>
  );
}

export default MercadoLivreSelo;
