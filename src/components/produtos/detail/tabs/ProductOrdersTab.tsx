import { useMemo, useState } from "react";
import { ArrowRight, Receipt, Search, X } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StoreBadge } from "@/components/clients/StoreBadge";
import { useSellerContext } from "@/contexts/SellerContext";
import { useMarketplaceAliases } from "@/hooks/useMarketplaceAliases";
import { formatMarketplaceName } from "@/utils/formatters";
import { absoluteLabel } from "@/utils/relativeDate";

import { SectionCard, formatCurrency, type DetailStatsBase } from "../shared";

interface Props {
  stats: DetailStatsBase;
  /** Termo que o rodapé leva para a lista de pedidos (nome do produto/categoria). */
  searchTerm: string;
  onSelectClient: (clientId: string) => void;
  /**
   * Rodapé "Ver todos os pedidos". OPCIONAL de propósito: `/pedidos` desta base
   * não lê `?search=` (o `searchTerm` de Pedidos.tsx nasce em ""), então o link
   * do Segundo Pedido cairia na lista inteira sem filtro nenhum. Quem quiser o
   * botão passa o handler — e para ele funcionar de fato basta semear o estado
   * a partir da URL em Pedidos.tsx.
   */
  onSeeAllOrders?: (term: string) => void;
}

/**
 * Últimos 50 pedidos do produto (ou da categoria — aí a linha traz `product` e
 * a coluna Produto aparece sozinha).
 *
 * Dois filtros locais, não três: sem filial e sem "canal próprio", que não
 * existem nesta base.
 */
export function ProductOrdersTab({ stats, searchTerm, onSelectClient, onSeeAllOrders }: Props) {
  const { activeSeller } = useSellerContext();
  const { getDisplayName } = useMarketplaceAliases(activeSeller?.id);

  // `?? []` cria array novo a cada render e invalidaria os dois useMemo abaixo.
  const orders = useMemo(() => stats.recent_orders ?? [], [stats.recent_orders]);
  const [search, setSearch] = useState("");
  const [loja, setLoja] = useState("all");

  const temColunaProduto = orders.some((o) => !!o.product);

  const lojas = useMemo(() => {
    const s = new Set<string>();
    orders.forEach((o) => o.marketplace && s.add(o.marketplace));
    return Array.from(s).sort();
  }, [orders]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders.filter((o) => {
      if (q) {
        const alvo = `${o.client_name ?? ""} ${o.product ?? ""}`.toLowerCase();
        if (!alvo.includes(q)) return false;
      }
      if (loja !== "all" && o.marketplace !== loja) return false;
      return true;
    });
  }, [orders, search, loja]);

  const temFiltro = search.trim() !== "" || loja !== "all";

  // A tabela tem 4 colunas SEMPRE. O produto (que só o detalhe de categoria
  // traz) entra como segunda linha do cliente, não como 5ª coluna: em 600px de
  // sheet a quinta coluna empurrava o Valor -- o número que a pessoa veio ver --
  // para fora da área visível.

  return (
    <div className="space-y-5 pt-5">
      <SectionCard
        icon={Receipt}
        iconTone="blue"
        title="Últimos pedidos"
        subtitle={
          temFiltro
            ? `${filtered.length} de ${orders.length} pedidos`
            : `Últimos ${Math.min(orders.length, 50)} pedidos do período`
        }
        right={
          temFiltro ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={() => {
                setSearch("");
                setLoja("all");
              }}
            >
              <X className="w-3.5 h-3.5" /> Limpar
            </Button>
          ) : undefined
        }
      >
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={temColunaProduto ? "Buscar cliente ou produto..." : "Buscar cliente..."}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 pl-9 rounded-xl bg-card shadow-sm border-0"
            />
          </div>
          <Select value={loja} onValueChange={setLoja}>
            <SelectTrigger className="h-9 w-[170px] rounded-xl bg-card shadow-sm border-0">
              <SelectValue placeholder="Marketplace" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os marketplaces</SelectItem>
              {lojas.map((m) => (
                <SelectItem key={m} value={m}>
                  {getDisplayName(m) || formatMarketplaceName(m)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            {temFiltro ? "Nenhum pedido com esses filtros." : "Nenhum pedido encontrado."}
          </p>
        ) : (
          <div className="overflow-x-auto -mx-2">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground border-b border-border">
                  <th className="text-left font-medium px-2 py-2">Data</th>
                  <th className="text-left font-medium px-2 py-2">
                    {temColunaProduto ? "Cliente / produto" : "Cliente"}
                  </th>
                  <th className="text-left font-medium px-2 py-2 max-sm:hidden">Loja</th>
                  <th className="text-right font-medium px-2 py-2">Valor</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((o) => {
                  const clicavel = !!o.client_id;
                  return (
                    <tr
                      key={o.id}
                      className={`border-b border-border/50 last:border-0 transition-colors ${
                        clicavel ? "hover:bg-muted/50 cursor-pointer" : ""
                      }`}
                      onClick={() => clicavel && onSelectClient(o.client_id!)}
                    >
                      <td
                        className="px-2 py-2 text-foreground tabular-nums whitespace-nowrap"
                        title={absoluteLabel(o.acquired_at)}
                      >
                        {format(new Date(o.acquired_at), "dd/MM/yy", { locale: ptBR })}
                        {/* No celular a hora desce para baixo da data (a coluna Loja some). */}
                        <span className="max-sm:block max-sm:text-[11px] max-sm:text-muted-foreground">
                          {" "}
                          {format(new Date(o.acquired_at), "HH:mm", { locale: ptBR })}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-foreground">
                        <span className="block truncate max-w-[190px] max-sm:max-w-[150px]">
                          {o.client_name ?? <span className="text-muted-foreground italic">—</span>}
                        </span>
                        {temColunaProduto && (
                          <span
                            className="block truncate max-w-[190px] text-[11px] text-muted-foreground max-sm:max-w-[150px]"
                            title={o.product ?? ""}
                          >
                            {o.product ?? "—"}
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-2 max-sm:hidden">
                        <StoreBadge storeKey={o.marketplace} />
                      </td>
                      <td className="px-2 py-2 text-right font-medium tabular-nums whitespace-nowrap">
                        {formatCurrency(o.total_amount)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {onSeeAllOrders && (
        <button
          type="button"
          className="w-full flex items-center justify-center gap-1.5 text-sm text-primary hover:underline py-2"
          onClick={() => onSeeAllOrders(searchTerm)}
        >
          Ver todos os pedidos <ArrowRight className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
