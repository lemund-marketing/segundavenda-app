import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChevronDown, Store } from "lucide-react";
import { StoreBadge } from "@/components/clients/StoreBadge";
import { useSellerContext } from "@/contexts/SellerContext";
import { useMarketplaceAliases } from "@/hooks/useMarketplaceAliases";
import { formatMarketplaceName } from "@/utils/formatters";
import { cn } from "@/lib/utils";

export interface LojaOption {
  /** valor cru de `orders.marketplace` — a chave de loja desta base */
  value: string;
  count: number;
}

interface Props {
  options: LojaOption[];
  selected: string[];
  onChange: (next: string[]) => void;
  /** Troca o desenho do botão (no celular ele vira pílula, ver Pedidos). */
  triggerClassName?: string;
  /** Texto do botão sem loja escolhida (no celular cabe só "Marketplaces"). */
  rotuloTodos?: string;
}

export const LojaMultiSelect = ({
  options, selected, onChange, triggerClassName, rotuloTodos = "Todos os marketplaces",
}: Props) => {
  const { activeSeller } = useSellerContext();
  // O <StoreBadge> de dentro do dropdown resolve o apelido do seller
  // (`seller_marketplace_aliases`); o rótulo do botão usava
  // `formatMarketplaceName` cru e a mesma loja aparecia como "Soldiers" na
  // lista e "Outro" no botão. Mesma fonte de nome nos dois lugares.
  const { getDisplayName } = useMarketplaceAliases(activeSeller?.id);

  const toggle = (v: string) => {
    onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
  };

  const label =
    selected.length === 0
      ? rotuloTodos
      : selected.length === 1
        ? getDisplayName(selected[0]) || formatMarketplaceName(selected[0]) || selected[0]
        : `${selected.length} marketplaces`;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className={cn("h-10 w-[190px] justify-between font-normal", triggerClassName)}>
          <span className="inline-flex items-center gap-2 min-w-0">
            <Store className="w-4 h-4 text-muted-foreground shrink-0" />
            <span className={cn("truncate", selected.length === 0 && "text-muted-foreground")}>{label}</span>
          </span>
          <ChevronDown className="w-4 h-4 opacity-50 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[280px] p-2">
        {options.length === 0 ? (
          <p className="text-xs text-muted-foreground p-2">Nenhum marketplace com pedidos no período.</p>
        ) : (
          <>
            <div className="flex items-center justify-between px-2 pb-2 mb-1 border-b border-border">
              <span className="text-[11px] text-muted-foreground">
                {selected.length > 0
                  ? `${selected.length} selecionada${selected.length > 1 ? "s" : ""}`
                  : `${options.length} marketplace${options.length > 1 ? "s" : ""}`}
              </span>
              {selected.length > 0 && (
                <button
                  type="button"
                  onClick={() => onChange([])}
                  className="text-[11px] text-primary hover:underline font-medium"
                >
                  Limpar
                </button>
              )}
            </div>
            <ScrollArea className="max-h-[280px] pr-1">
              {options.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => toggle(o.value)}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted text-left"
                >
                  <Checkbox
                    checked={selected.includes(o.value)}
                    onCheckedChange={() => toggle(o.value)}
                    className="shrink-0"
                  />
                  <span className="flex-1 min-w-0">
                    <StoreBadge storeKey={o.value} />
                  </span>
                  <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">
                    {o.count.toLocaleString("pt-BR")}
                  </span>
                </button>
              ))}
            </ScrollArea>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
};

export default LojaMultiSelect;
