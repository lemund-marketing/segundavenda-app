import { useState } from "react";
import { Check, Copy, Download, Package, Tag, X } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { formatMarketplaceName } from "@/utils/formatters";
import { relativeLabel } from "@/utils/relativeDate";
import { cn } from "@/lib/utils";

import { CategoryPill, formatCurrency, type ProductCategory, type ProductDetailStats } from "./shared";

interface Props {
  /** Grafia crua a exibir enquanto a RPC não voltou. */
  fallbackName: string;
  /** Apelido a exibir enquanto a RPC não voltou (evita piscar o título cru). */
  fallbackDisplayName?: string | null;
  stats: ProductDetailStats | null;
  categories: ProductCategory[];
  onClose: () => void;
  /** Ausente = sem permissão de escrita (ou seller indefinido): esconde o popover. */
  onAssignCategory?: (categoryId: string | null) => Promise<void> | void;
  /**
   * Carregando ou em erro: o botão fica visível mas travado. Sem isto dava para
   * categorizar antes de a RPC voltar — e aí a identidade do produto vinha do
   * fallback, que pode ser o apelido.
   */
  assignDisabled?: boolean;
}

export function ProductDetailHeader({
  fallbackName,
  fallbackDisplayName = null,
  stats,
  categories,
  onClose,
  onAssignCategory,
  assignDisabled = false,
}: Props) {
  const [catOpen, setCatOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const rawName = stats?.name || fallbackName;
  const apelido = stats ? stats.display_name : fallbackDisplayName;
  const title = apelido || rawName;
  const category = stats?.category ?? null;
  const ultimo = relativeLabel(stats?.last_order_at);

  const copyName = async () => {
    await navigator.clipboard.writeText(rawName);
    toast.success("Nome copiado");
  };

  const exportCSV = () => {
    const rows = stats?.recent_orders ?? [];
    if (rows.length === 0) {
      toast.error("Sem pedidos para exportar");
      return;
    }
    // Sem coluna Filial: esta base não tem filial — o recorte é a loja.
    const header = ["Data", "Cliente", "Loja", "Status", "Valor"];
    const limpa = (v: string | null | undefined) => (v ?? "").replace(/[",;\n]/g, " ");
    const csv = [
      header.join(","),
      ...rows.map((r) =>
        [
          format(new Date(r.acquired_at), "yyyy-MM-dd HH:mm"),
          limpa(r.client_name),
          limpa(r.marketplace ? formatMarketplaceName(r.marketplace) : ""),
          limpa(r.order_status),
          r.total_amount.toFixed(2),
        ].join(","),
      ),
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${rawName.slice(0, 60)}-pedidos.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exportado");
  };

  const handlePickCategory = async (categoryId: string | null) => {
    setCatOpen(false);
    if (!onAssignCategory) return;
    setSaving(true);
    try {
      await onAssignCategory(categoryId);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="sticky top-0 bg-card border-b border-border z-10 px-6 py-4 max-sm:px-4 max-sm:py-3">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <Package className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-foreground line-clamp-2" title={rawName}>
              {title}
            </h2>
            {/* O apelido não substitui a grafia do marketplace: é ela que casa
                com o que o vendedor vê no anúncio e na busca de pedidos. */}
            {apelido && apelido !== rawName && (
              <p className="text-xs text-muted-foreground truncate mt-0.5" title={rawName}>
                {rawName}
              </p>
            )}
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {category ? (
                <CategoryPill name={category.name} color={category.color} />
              ) : (
                <Badge variant="outline" className="text-[11px] text-muted-foreground">
                  Sem categoria
                </Badge>
              )}
              <span className="text-xs text-muted-foreground">·</span>
              <span
                className={cn(
                  "text-xs",
                  stats?.active === false ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground",
                )}
              >
                {/* "Desativado" e não "Inativo": inativo na lista quer dizer
                    "30+ dias sem venda", que é outra coisa. */}
                {stats?.active === false ? "Desativado" : "Ativo"}
              </span>
              {stats?.sku && (
                <>
                  <span className="text-xs text-muted-foreground">·</span>
                  <span className="text-xs text-muted-foreground tabular-nums">SKU {stats.sku}</span>
                </>
              )}
              {stats?.first_order_at && (
                <>
                  <span className="text-xs text-muted-foreground">·</span>
                  <span className="text-xs text-muted-foreground">
                    Desde {format(new Date(stats.first_order_at), "MMM/yy", { locale: ptBR })}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} className="shrink-0">
          <X className="w-4 h-4" />
        </Button>
      </div>

      {/* No celular os botões ficam numa fileira só, que rola: o cabeçalho é fixo e
          cada linha a mais dele é uma linha a menos de conteúdo. */}
      <div className="flex items-center gap-2 flex-wrap max-sm:-mx-4 max-sm:flex-nowrap max-sm:overflow-x-auto max-sm:px-4 max-sm:[scrollbar-width:none] max-sm:[&>*]:shrink-0">
        <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={copyName}>
          <Copy className="w-3.5 h-3.5" /> Copiar nome
        </Button>

        {onAssignCategory && (
          <Popover open={catOpen} onOpenChange={setCatOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 gap-1.5" disabled={saving || assignDisabled}>
                <Tag className="w-3.5 h-3.5" /> Editar categoria
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-0" align="start">
              <Command>
                <CommandInput placeholder="Buscar categoria..." />
                <CommandList>
                  <CommandEmpty>Nenhuma encontrada</CommandEmpty>
                  <CommandGroup>
                    <CommandItem value="Sem categoria" onSelect={() => handlePickCategory(null)}>
                      {!category && <Check className="w-3.5 h-3.5 mr-2" />}
                      <span className={category ? "ml-[22px] text-muted-foreground" : ""}>
                        Sem categoria
                      </span>
                    </CommandItem>
                    {categories.map((c) => (
                      <CommandItem key={c.id} value={c.name} onSelect={() => handlePickCategory(c.id)}>
                        {category?.id === c.id && <Check className="w-3.5 h-3.5 mr-2" />}
                        <span className={category?.id === c.id ? "" : "ml-[22px]"}>
                          <CategoryPill name={c.name} color={c.color} />
                        </span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        )}

        <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={exportCSV}>
          <Download className="w-3.5 h-3.5" /> Exportar CSV
        </Button>
      </div>

      {stats && stats.total_orders > 0 && (
        <div className="mt-3 text-xs text-muted-foreground tabular-nums">
          {stats.total_orders.toLocaleString("pt-BR")} pedidos ·{" "}
          {formatCurrency(stats.total_revenue)} no período
          {stats.last_order_at && <> · última venda {ultimo.text}</>}
        </div>
      )}
    </div>
  );
}
