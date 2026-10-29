import type { ReactNode } from "react";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { ClientesFilterChip } from "./clientesFilters";

interface ClientesFilterChipsProps {
  chips: ClientesFilterChip[];
  onRemove: (chip: ClientesFilterChip) => void;
  onClearAll: () => void;
  /**
   * Pílula FIXA à esquerda dos chips — o recorte que a tela impõe e o usuário
   * não escolheu (hoje: a loja, dentro de `/lojas/:marketplace`). Fica fora do
   * array `chips` de propósito: chip tem "x" e entra no `clearAll`, e os dois
   * são exatamente o que uma trava não pode ter.
   */
  leading?: ReactNode;
  /** Troca a moldura da fileira (no celular ela vem solta, sem a linha de cima). */
  className?: string;
}

/**
 * O que está filtrando, FORA do sheet. Sem isto o usuário fecha o painel e a
 * única pista de que a lista está recortada é um número no badge — e um total
 * menor do que ele espera lê como base sumindo, não como filtro ligado.
 */
export function ClientesFilterChips({
  chips,
  onRemove,
  onClearAll,
  leading,
  className = "mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3",
}: ClientesFilterChipsProps) {
  if (chips.length === 0 && !leading) return null;

  return (
    <div className={className}>
      {leading}

      {chips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          onClick={() => onRemove(chip)}
          title="Remover este filtro"
          className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-primary/10 py-1 pl-3 pr-2 text-xs font-medium text-primary transition-colors hover:bg-primary/20"
        >
          <span className="truncate">{chip.label}</span>
          <X className="h-3 w-3 shrink-0" />
        </button>
      ))}

      {/* Só com chip para limpar: sozinho ao lado de uma pílula travada, o botão
          prometeria soltar justamente o que não sai. */}
      {chips.length > 0 && (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
          onClick={onClearAll}
          // NÃO é "limpar tudo": período, busca e mínimo de pedidos vivem na barra
          // e continuam de pé. Com o rótulo antigo, clicar aqui sumia com os chips
          // e a lista seguia em 63 de 672 por causa do período — sem nada na tela
          // explicando o recorte que sobrou. (Quem abre tudo é o "Limpar filtros"
          // do estado vazio da tabela.)
          title="Remove os filtros do painel. Período, busca e mínimo de pedidos ficam como estão."
        >
          Limpar estes filtros
        </Button>
      )}
    </div>
  );
}

export default ClientesFilterChips;
