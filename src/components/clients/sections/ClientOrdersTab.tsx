import { useState, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronDown, ChevronRight } from "lucide-react";
import { formatCurrency, formatMarketplaceName } from "@/utils/formatters";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { groupOrdersByWindow } from "@/utils/groupOrdersByWindow";

interface Props {
  orders: any[];
}

export function ClientOrdersTab({ orders }: Props) {
  const [filter, setFilter] = useState({ period: "all", marketplace: "all" });
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const toggleGroup = (id: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const marketplaces = useMemo(
    () => Array.from(new Set(orders.map((o) => o.marketplace).filter(Boolean))) as string[],
    [orders],
  );

  const filteredOrders = useMemo(() => {
    let r = orders;
    if (filter.period !== "all") {
      const cutoff = Date.now() - Number(filter.period) * 30 * 24 * 60 * 60 * 1000;
      r = r.filter((o) => new Date(o.acquired_at).getTime() >= cutoff);
    }
    if (filter.marketplace !== "all") r = r.filter((o) => o.marketplace === filter.marketplace);
    return r;
  }, [orders, filter]);

  // Itens da MESMA compra chegam como pedidos separados. Agrupar por janela de
  // 3 minutos é a mesma regra que o banco usa para contar pedidos — sem isso o
  // sheet mostraria 22 onde a lista de clientes mostra 15.
  const groups = useMemo(() => groupOrdersByWindow(filteredOrders as any[], 3), [filteredOrders]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <Select value={filter.period} onValueChange={(v) => setFilter((f) => ({ ...f, period: v }))}>
          <SelectTrigger className="rounded-md h-9 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Sempre</SelectItem>
            <SelectItem value="12">12m</SelectItem>
            <SelectItem value="6">6m</SelectItem>
            <SelectItem value="3">3m</SelectItem>
            <SelectItem value="1">1m</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filter.marketplace} onValueChange={(v) => setFilter((f) => ({ ...f, marketplace: v }))}>
          <SelectTrigger className="rounded-md h-9 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos canais</SelectItem>
            {marketplaces.map((m) => (
              <SelectItem key={m} value={m}>{formatMarketplaceName(m)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {groups.length === 0 ? (
        <div className="text-center py-10 text-sm text-muted-foreground">
          {orders.length === 0 ? "Este cliente ainda não tem pedidos." : "Nenhum pedido com esses filtros."}
        </div>
      ) : (
        <>
          <p className="text-[11px] text-muted-foreground">
            {groups.length} pedido{groups.length === 1 ? "" : "s"}
            {groups.length !== filteredOrders.length && ` · ${filteredOrders.length} itens`}
          </p>

          <div className="space-y-3">
            {groups.map((group) => {
              const isGroup = group.count > 1;
              const isExpanded = expandedGroups.has(group.id);
              const o = group.primary;
              return (
                <div key={group.id} className="rounded-md bg-card shadow-sm overflow-hidden">
                  <button
                    type="button"
                    onClick={() => isGroup && toggleGroup(group.id)}
                    className={`w-full text-left p-4 transition-colors ${isGroup ? "hover:bg-muted/30 cursor-pointer" : "cursor-default"}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex items-start gap-2">
                        {isGroup && (
                          <span className="mt-0.5 text-muted-foreground shrink-0">
                            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </span>
                        )}
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-semibold text-sm truncate">{o.product || "Produto"}</p>
                            {isGroup && (
                              <span className="text-muted-foreground text-xs font-normal">
                                + {group.count - 1} ite{group.count - 1 === 1 ? "m" : "ns"}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {[o.marketplace ? formatMarketplaceName(o.marketplace) : null, o.vendedor ? `Vendedor: ${o.vendedor}` : null]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                          <p className="text-[11px] text-muted-foreground mt-1">
                            {o.acquired_at && format(new Date(o.acquired_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                          </p>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-bold text-sm text-primary tabular-nums">{formatCurrency(group.total_amount)}</p>
                        {o.order_status && (
                          <Badge variant="outline" className="text-[10px] mt-1 capitalize">{o.order_status}</Badge>
                        )}
                      </div>
                    </div>
                  </button>

                  {isGroup && isExpanded && (
                    <div className="border-t bg-muted/30 px-4 py-2.5 space-y-1.5">
                      {group.orders.map((child: any) => (
                        <div key={child.id} className="flex items-start justify-between text-xs gap-2">
                          <div className="min-w-0">
                            <p className="truncate">{child.product || "—"}</p>
                            <p className="text-muted-foreground">
                              {child.acquired_at && format(new Date(child.acquired_at), "dd/MM HH:mm", { locale: ptBR })}
                            </p>
                          </div>
                          <p className="font-medium shrink-0 tabular-nums">{formatCurrency(Number(child.total_amount))}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
