import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ACCENT } from "@/components/dashboard/shared";
import { cn } from "@/lib/utils";

/**
 * O KPI padrão do sistema (21/08/2026). Régua única, copiada do Dashboard:
 *
 * - título em MAIÚSCULO, text-xs, cinza;
 * - ícone no chip verde da marca (32px) — verde em TODOS, inclusive nos KPIs
 *   de não entrega (decisão de 21/08: verde é marca, não alarme);
 * - valor em text-2xl bold tabular;
 * - label de apoio embaixo, text-xs cinza;
 * - a ORIGEM da métrica aparece em tooltip no hover do CARD INTEIRO — o
 *   ícone (i) que alguns KPIs tinham foi aposentado.
 *
 * O texto do tooltip é obrigatório de propósito: todo número que o lojista vê
 * precisa saber explicar de onde veio. Escreva a partir do cálculo REAL da
 * RPC/hook, em linguagem leiga.
 *
 * Abaixo de md (celular, 22/10/2026) o card fica no formato dos blocos do app
 * (components/mobile/blocos): borda fina sem sombra, padding menor, título sem
 * maiúsculas e valor em 17px — cabe em duas colunas em vez de empilhar um card
 * alto por número. Do md para cima, nada muda.
 */
export function KpiPadrao({
  titulo,
  valor,
  apoio,
  tooltip,
  icone: Icone,
  destaque = false,
  loading = false,
  className,
  children,
}: {
  titulo: string;
  valor: ReactNode;
  /** Linha(s) de apoio abaixo do valor. */
  apoio?: ReactNode;
  /** De onde a métrica vem — obrigatório, aparece no hover do card. */
  tooltip: string;
  icone?: LucideIcon | React.ComponentType<{ className?: string; strokeWidth?: string | number }>;
  /** Anel verde de destaque (ex.: Faturamento no Dashboard). */
  destaque?: boolean;
  loading?: boolean;
  className?: string;
  /** Extras no rodapé do card (ex.: pílula de variação). */
  children?: ReactNode;
}) {
  return (
    <Tooltip delayDuration={350}>
      <TooltipTrigger asChild>
        <div
          className={cn(
            "rounded-2xl bg-card transition-shadow duration-200 ease-out",
            "border border-border/60 p-3 md:border-0 md:p-5 md:shadow-card md:hover:shadow-hover",
            // justify-between (21/08): título ancorado em cima, valor + apoio
            // ancorados EMBAIXO, e o respiro no meio. Nas telas com grade de
            // altura igual (auto-rows-fr em Pedidos e Clientes) o conteúdo
            // ficava amontoado no topo com um vazio grande embaixo.
            // h-full para o card ocupar a linha inteira da grade — sem isso
            // não existe sobra para distribuir.
            "flex h-full flex-col justify-between gap-2 md:gap-3",
            className,
          )}
          style={destaque ? { boxShadow: `0 0 0 1px ${ACCENT}33, var(--shadow-card)` } : undefined}
        >
          <div className="flex items-start justify-between gap-2">
            <p className="text-[12px] font-medium leading-snug text-muted-foreground md:text-xs md:uppercase md:tracking-wide">
              {titulo}
            </p>
            {Icone && (
              <span
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg md:h-8 md:w-8"
                style={{ backgroundColor: `${ACCENT}1A`, color: ACCENT }}
              >
                <Icone className="h-4 w-4" />
              </span>
            )}
          </div>

          {/* Bloco de baixo: valor, apoio e extras andam juntos. Se cada um
              fosse filho direto do flex, o justify-between espalharia os três e
              o valor flutuaria no meio do card. */}
          <div className="min-w-0">
            {/* truncate: "R$ 1.243.869,95" usa espaço inquebrável e estourava o
                card de ~204px no grid de 6 colunas do notebook (aviso herdado
                do KpiCard antigo de Pedidos). O title nativo mostra o valor
                inteiro; o tooltip do card segue sendo o de ORIGEM. */}
            <p
              className="truncate text-[17px] font-bold leading-tight tabular-nums text-foreground md:text-2xl md:leading-tight"
              title={typeof valor === "string" ? valor : undefined}
            >
              {loading ? "—" : valor}
            </p>
            {apoio && <p className="mt-1 text-[12px] leading-snug text-muted-foreground md:text-xs">{apoio}</p>}
            {children}
          </div>
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-xs text-xs leading-relaxed">
        {tooltip}
      </TooltipContent>
    </Tooltip>
  );
}
