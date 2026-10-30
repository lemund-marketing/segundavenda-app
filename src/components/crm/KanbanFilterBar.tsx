import { CalendarRange, CheckSquare, ChevronDown, Search, SlidersHorizontal, Store, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { formatMarketplaceName } from "@/utils/formatters";
import { cn } from "@/lib/utils";

import { KANBAN_PERIODS } from "./kanbanFilters";
import type { KanbanFilterOptions } from "./usePipelineMetrics";

interface KanbanFilterBarProps {
  search: string;
  onSearchChange: (v: string) => void;
  marketplace: string;
  onMarketplaceChange: (v: string) => void;
  period: string;
  onPeriodChange: (v: string) => void;
  options?: KanbanFilterOptions;
  advancedCount: number;
  onOpenAdvanced: () => void;
  selectionMode: boolean;
  onToggleSelection: () => void;
  readOnly?: boolean;
  /**
   * Celular (22/10/2026): busca em pílula e os filtros numa fileira de
   * pílulas que rola de lado, como em Pedidos e Clientes. Mesmos controles.
   */
  mobile?: boolean;
}

const PILULA =
  "h-9 shrink-0 gap-1.5 rounded-full border-border/60 bg-card px-3.5 text-[13px] font-semibold text-foreground shadow-none";
const PILULA_ATIVA = "border-transparent bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary";

export function KanbanFilterBar({
  search,
  onSearchChange,
  marketplace,
  onMarketplaceChange,
  period,
  onPeriodChange,
  options,
  advancedCount,
  onOpenAdvanced,
  selectionMode,
  onToggleSelection,
  readOnly = false,
  mobile = false,
}: KanbanFilterBarProps) {
  const marketplaces = options?.marketplaces ?? [];
  const periodLabel = KANBAN_PERIODS.find((p) => p.value === period)?.label ?? "";

  if (mobile) {
    return (
      <div className="flex flex-col gap-3 px-4 pt-5">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Nome, CPF ou WhatsApp"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="h-11 rounded-full border-border/60 bg-card pl-10 pr-10 text-[15px]"
          />
          {search && (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              aria-label="Limpar busca"
              className="absolute right-2.5 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground active:bg-muted"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <Button variant="outline" className={cn(PILULA, advancedCount > 0 && PILULA_ATIVA)} onClick={onOpenAdvanced}>
            <SlidersHorizontal className="h-4 w-4" />
            Filtros
            {advancedCount > 0 && (
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-bold tabular-nums text-primary-foreground">
                {advancedCount}
              </span>
            )}
          </Button>

          {marketplaces.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className={cn(PILULA, marketplace !== "all" && PILULA_ATIVA)}>
                  <Store className="h-4 w-4 opacity-70" />
                  {marketplace === "all" ? "Loja" : formatMarketplaceName(marketplace)}
                  <ChevronDown className="h-3.5 w-3.5 opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">
                <DropdownMenuItem onClick={() => onMarketplaceChange("all")}>Todas as lojas</DropdownMenuItem>
                <DropdownMenuSeparator />
                {marketplaces.map((m) => (
                  <DropdownMenuItem key={m} onClick={() => onMarketplaceChange(m)}>
                    {formatMarketplaceName(m)}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className={cn(PILULA, period !== "all" && PILULA_ATIVA)}>
                <CalendarRange className="h-4 w-4 opacity-70" />
                {period === "all" ? "Período" : periodLabel.replace("Últimos ", "")}
                <ChevronDown className="h-3.5 w-3.5 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {KANBAN_PERIODS.map((p) => (
                <DropdownMenuItem key={p.value} onClick={() => onPeriodChange(p.value)}>
                  {p.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {!readOnly && (
            <Button
              variant="outline"
              className={cn(PILULA, selectionMode && PILULA_ATIVA)}
              onClick={onToggleSelection}
            >
              <CheckSquare className="h-4 w-4" />
              {selectionMode ? "Cancelar seleção" : "Selecionar"}
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 pt-4">
      {/* `Card` e não um div com `rounded-lg`: esta barra fica encostada no card
          "Distribuição por fase", da mesma largura, e a casa tem duas escalas de
          raio em uso (20px e 28px). Empilhadas, a diferença de 8px de curvatura
          aparece a olho nu. */}
      <Card className="bg-card p-4 shadow-sm dark:border dark:border-border">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[240px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar cliente por nome, CPF ou WhatsApp..."
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              className="h-10 border-transparent bg-muted pl-9 pr-9 focus-visible:bg-background"
            />
            {search && (
              <button
                type="button"
                onClick={() => onSearchChange("")}
                aria-label="Limpar busca"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/*
            Um filtro só, chamado "Loja", filtrando por marketplace.

            Antes eram dois: "Marketplace" (funcionando) e "Loja" (desabilitado,
            porque `orders.store_id` está nulo nos 16.075 pedidos e a lista de
            lojas com pedido vinha vazia). Como o resto do app já mostra o
            marketplace embaixo do rótulo "Loja" — a coluna Loja em /clientes e
            em /pedidos, e a própria tela /lojas — manter os dois era oferecer
            um filtro morto ao lado de outro que faz exatamente o que ele
            prometia. No dia em que a integração passar a gravar `store_id`,
            este é o ponto onde a loja real entra.
          */}
          {marketplaces.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="h-10 gap-2">
                  Loja
                  {marketplace !== "all" && (
                    <span className="text-muted-foreground">
                      : {formatMarketplaceName(marketplace)}
                    </span>
                  )}
                  <ChevronDown className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">
                <DropdownMenuItem onClick={() => onMarketplaceChange("all")}>Todos</DropdownMenuItem>
                <DropdownMenuSeparator />
                {marketplaces.map((m) => (
                  <DropdownMenuItem key={m} onClick={() => onMarketplaceChange(m)}>
                    {formatMarketplaceName(m)}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="h-10 gap-2">
                {period === "all" ? "Período" : `Período: ${periodLabel}`}
                <ChevronDown className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {KANBAN_PERIODS.map((p) => (
                <DropdownMenuItem key={p.value} onClick={() => onPeriodChange(p.value)}>
                  {p.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            variant="outline"
            className={cn("h-10 gap-2", advancedCount > 0 && "bg-primary/10 text-primary")}
            onClick={onOpenAdvanced}
          >
            <SlidersHorizontal className="h-4 w-4" />
            Mais filtros
            {advancedCount > 0 && (
              <span className="ml-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold tabular-nums text-primary-foreground">
                {advancedCount}
              </span>
            )}
          </Button>

          {!readOnly && (
            <Button
              variant={selectionMode ? "default" : "outline"}
              className="h-10 gap-2"
              onClick={onToggleSelection}
            >
              <CheckSquare className="h-4 w-4" />
              {selectionMode ? "Cancelar" : "Selecionar"}
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
