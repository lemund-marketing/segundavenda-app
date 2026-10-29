// Casca dos sheets "Mais filtros" — Clientes, Kanban e Pedidos.
//
// O visual é o MESMO dos painéis de nó das Automações (ConfigPanelShell):
// faixa colorida no topo, cabeçalho branco com ícone em caixa, título e
// subtítulo, corpo em fundo cinza e rodapé branco. Até 28/08/2026 os três
// sheets tinham 420px e cabeçalho de `SheetHeader` cru — o de Pedidos sem nem
// subtítulo —, com o corpo inteiro no mesmo fundo, sem separação entre o
// cabeçalho e o que rolava. A casca unifica em 540px e devolve a hierarquia:
// cabeçalho e rodapé em `bg-card` sobre um corpo em `bg-background`.
//
// NÃO reaproveita o ConfigPanelShell de propósito: aquele é do canvas e carrega
// comportamento que aqui atrapalha — `modal={false}`, não fechar ao clicar
// fora (para não perder a edição do nó) e o registro de "um painel por vez".
// Filtro é o oposto: clicar fora fecha, e o fundo pode escurecer. O que se
// compartilha é a aparência, não a mecânica.
import type { ComponentType, ReactNode } from "react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

import { rotuloContagemFiltros } from "./SecaoFiltros";

interface FiltrosSheetShellProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  subtitle?: string;
  icon: ComponentType<{ className?: string }>;
  /** Contagem de filtros ativos — vira o número ao lado do título. */
  count?: number;
  children: ReactNode;
  footer?: ReactNode;
}

export function FiltrosSheetShell({
  open,
  onOpenChange,
  title,
  subtitle,
  icon: Icon,
  count = 0,
  children,
  footer,
}: FiltrosSheetShellProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className={cn(
          "w-full sm:max-w-[540px]",
          // p-0 e flex-col: o cabeçalho e o rodapé encostam nas bordas, e só o
          // miolo rola. Com o padding do SheetContent padrão, o fundo cinza do
          // corpo ficava com uma moldura branca em volta.
          "flex flex-col gap-0 p-0",
        )}
      >
        <div className="relative border-b border-border bg-card flex-shrink-0">
          {/* Faixa da cor do produto no topo, como nos painéis de nó. */}
          <div className="absolute left-0 right-0 top-0 h-1 bg-primary" />

          <div className="flex items-start gap-3 px-6 pt-6 pb-5">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-primary/10">
              <Icon className="h-5 w-5 text-primary" />
            </div>

            {/* SheetTitle/SheetDescription, e não h2/p soltos: o Radix usa os
                dois para rotular o diálogo em leitor de tela. */}
            <div className="min-w-0 flex-1 pt-0.5">
              <SheetTitle className="flex items-center gap-2 text-base font-semibold leading-tight text-foreground">
                {title}
                {count > 0 && (
                  <span
                    className="inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-bold tabular-nums text-primary-foreground"
                    title={rotuloContagemFiltros(count)}
                  >
                    <span aria-hidden="true">{count}</span>
                    <span className="sr-only">{rotuloContagemFiltros(count)}</span>
                  </span>
                )}
              </SheetTitle>
              {subtitle && (
                <SheetDescription className="mt-1 text-sm leading-snug text-muted-foreground">
                  {subtitle}
                </SheetDescription>
              )}
            </div>
            {/* O X é o do próprio SheetContent (canto superior direito). */}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto bg-background px-6 py-4">{children}</div>

        {/* O rodapé NÃO impõe layout: Clientes e Kanban põem dois botões lado a
            lado, e Pedidos empilha o Exportar acima deles. A casca garante só a
            faixa branca, a borda de cima e o respiro. */}
        {footer && (
          <div className="flex-shrink-0 border-t border-border bg-card px-6 py-4">{footer}</div>
        )}
      </SheetContent>
    </Sheet>
  );
}
