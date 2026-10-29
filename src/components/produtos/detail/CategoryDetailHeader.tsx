import { Copy, Download, Tag, X } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { hexToRgba } from "@/components/clients/sections/shared";
import { inkPair } from "@/utils/contrastInk";
import { formatMarketplaceName } from "@/utils/formatters";
import { relativeLabel } from "@/utils/relativeDate";

import { formatCurrency, type CategoryDetailStats } from "./shared";

interface Props {
  fallbackName: string;
  color?: string | null;
  stats: CategoryDetailStats | null;
  onClose: () => void;
}

export function CategoryDetailHeader({ fallbackName, color, stats, onClose }: Props) {
  const name = stats?.category?.name || fallbackName;
  const hex = stats?.category?.color || color || "#8E9196";
  const ink = inkPair(hex);
  const productCount = stats?.product_count ?? 0;
  const ultimo = relativeLabel(stats?.last_order_at);

  const copyName = async () => {
    await navigator.clipboard.writeText(name);
    toast.success("Nome copiado");
  };

  const exportCSV = () => {
    const rows = stats?.recent_orders ?? [];
    if (rows.length === 0) {
      toast.error("Sem pedidos para exportar");
      return;
    }
    const header = ["Data", "Produto", "Cliente", "Loja", "Status", "Valor"];
    const limpa = (v: string | null | undefined) => (v ?? "").replace(/[",;\n]/g, " ");
    const csv = [
      header.join(","),
      ...rows.map((r) =>
        [
          format(new Date(r.acquired_at), "yyyy-MM-dd HH:mm"),
          limpa(r.product),
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
    a.download = `categoria-${name.slice(0, 60)}-pedidos.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exportado");
  };

  return (
    <div className="sticky top-0 bg-card border-b border-border z-10 px-6 py-4 max-sm:px-4 max-sm:py-3">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-start gap-3 min-w-0">
          {/* A cor da categoria pinta o fundo como está; o ícone usa a tinta
              corrigida por tema, senão categoria escura some no dark. */}
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-[color:var(--cat-ink)] dark:text-[color:var(--cat-ink-dark)]"
            style={
              {
                background: hexToRgba(hex, 0.14),
                "--cat-ink": ink.light,
                "--cat-ink-dark": ink.dark,
              } as React.CSSProperties
            }
          >
            <Tag className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-foreground truncate" title={name}>
              {name}
            </h2>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className="text-xs text-muted-foreground tabular-nums">
                {productCount} produto{productCount === 1 ? "" : "s"}
              </span>
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
