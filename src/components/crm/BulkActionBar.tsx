import type { ReactNode } from "react";
import { ChevronDown, Download, MoveRight, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface BulkActionBarProps {
  count: number;
  stages: { id: string; name: string; color: string | null }[];
  onMoveTo: (stageId: string) => void;
  onExport: () => void;
  onCancel: () => void;
  /**
   * Celular: barra flutuante logo acima da cápsula de navegação. No topo ela
   * sumia assim que o quadro rolava para a fase — e é escolhendo cards na
   * fase que a seleção acontece.
   */
  mobile?: boolean;
}

export function BulkActionBar({ count, stages, onMoveTo, onExport, onCancel, mobile = false }: BulkActionBarProps) {
  const menuMover = (gatilho: ReactNode) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{gatilho}</DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-72 overflow-y-auto">
        {stages.map((s) => (
          <DropdownMenuItem key={s.id} onClick={() => onMoveTo(s.id)}>
            <span
              className="mr-2 size-2 rounded-full"
              style={{ backgroundColor: s.color || "#6366f1" }}
            />
            {s.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  if (mobile) {
    return (
      <div className="fixed inset-x-4 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-40 flex items-center gap-2 rounded-2xl border border-border/60 bg-card px-3 py-2.5 shadow-lg">
        <button
          type="button"
          onClick={onCancel}
          aria-label="Cancelar seleção"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground active:bg-muted"
        >
          <X className="h-4 w-4" />
        </button>
        <span className="min-w-0 flex-1 truncate text-sm font-semibold tabular-nums text-foreground">
          {count} {count === 1 ? "selecionado" : "selecionados"}
        </span>
        <Button
          variant="outline"
          size="icon"
          className="h-9 w-9 shrink-0 rounded-full border-border/60"
          onClick={onExport}
          disabled={count === 0}
          aria-label="Exportar CSV"
        >
          <Download className="h-4 w-4" />
        </Button>
        {menuMover(
          <Button size="sm" className="h-9 shrink-0 rounded-full px-4" disabled={count === 0}>
            <MoveRight className="mr-1.5 h-4 w-4" />
            Mover
          </Button>,
        )}
      </div>
    );
  }

  return (
    // Sem `sticky`: o pai não rola (a rolagem do Kanban vive no contêiner das
    // colunas), então `position: sticky` nunca engatava — era código morto que
    // dava a impressão de compensar o empurrão do layout. Quem resolve isso é o
    // lugar da barra, logo abaixo da barra de filtros que a liga.
    <Card className="mx-4 mt-3 flex flex-wrap items-center gap-3 border-l-4 border-l-primary bg-card px-4 py-3 shadow-md dark:border dark:border-l-4 dark:border-border dark:border-l-primary">
      <span className="text-sm font-semibold tabular-nums text-foreground">
        {count} {count === 1 ? "cliente selecionado" : "clientes selecionados"}
      </span>
      <div className="flex-1" />
      {menuMover(
        <Button variant="outline" size="sm" disabled={count === 0}>
          <MoveRight className="mr-1.5 h-4 w-4" />
          Mover para...
          <ChevronDown className="ml-1 h-3 w-3" />
        </Button>,
      )}
      <Button variant="outline" size="sm" onClick={onExport} disabled={count === 0}>
        <Download className="mr-1.5 h-4 w-4" />
        Exportar CSV
      </Button>
      <Button variant="ghost" size="sm" onClick={onCancel}>
        <X className="mr-1.5 h-4 w-4" />
        Cancelar
      </Button>
    </Card>
  );
}
