import { motion } from "framer-motion";
import { Package, DollarSign, ShoppingCart, TrendingUp, type LucideIcon } from "lucide-react";
import { KpiPadrao } from "@/components/kpi/KpiPadrao";
import { ProductKPIRowSkeleton } from "../shared/ProductKPICard";
import { fmtCurrency } from "../shared/produtosUtils";
import { cn } from "@/lib/utils";
import type { ProductStats } from "@/hooks/useProductStats";

interface AnalyticsKPIsProps {
  loading?: boolean;
  stats: ProductStats[];
}

function deltaSubtitle(current: number, previous: number): { text: string; color: "default" | "success" | "danger" } {
  if (previous === 0) return { text: "sem comparativo", color: "default" };
  const pct = ((current - previous) / previous) * 100;
  const sign = pct >= 0 ? "+" : "";
  return {
    text: `${sign}${pct.toFixed(0)}% vs período anterior`,
    color: pct >= 0 ? "success" : "danger",
  };
}

const DELTA_COLOR: Record<"default" | "success" | "danger", string> = {
  default: "text-muted-foreground",
  success: "text-emerald-600 dark:text-emerald-400",
  danger: "text-rose-600 dark:text-rose-400",
};

export function AnalyticsKPIs({ stats, loading }: AnalyticsKPIsProps) {
  if (loading) return <ProductKPIRowSkeleton />;

  // `stats` é o catálogo inteiro; este card é da aba Analytics, então mostra
  // quem vendeu e diz de quantos, para o número não parecer o catálogo.
  const catalogSize = stats.length;
  const totalProducts = stats.filter((p) => p.total_orders > 0).length;
  const totalRevenue = stats.reduce((s, p) => s + p.total_revenue, 0);
  const totalOrders = stats.reduce((s, p) => s + p.total_orders, 0);
  const prevOrders = stats.reduce((s, p) => s + p.prev_orders, 0);
  const prevRevenue = stats.reduce((s, p) => s + p.prev_revenue, 0);
  const ticket = totalOrders > 0 ? totalRevenue / totalOrders : 0;
  const prevTicket = prevOrders > 0 ? prevRevenue / prevOrders : 0;

  const ordersDelta = deltaSubtitle(totalOrders, prevOrders);
  // Receita e ticket têm delta PRÓPRIO (a RPC devolve prev_revenue). No Segundo
  // Pedido os três cards repetiam a variação de pedidos.
  const revenueDelta = deltaSubtitle(totalRevenue, prevRevenue);
  const ticketDelta = deltaSubtitle(ticket, prevTicket);

  // Origem (RPC get_product_ranking_stats): só pedidos não-cancelados COM
  // título de produto, na janela e no recorte de loja escolhidos na tela.
  const cards: {
    icone: LucideIcon;
    titulo: string;
    valor: string | number;
    tooltip: string;
    apoio?: string;
    delta?: { text: string; color: "default" | "success" | "danger" };
  }[] = [
    {
      icone: Package,
      titulo: "Produtos com Venda",
      valor: totalProducts,
      tooltip:
        "Produtos com pelo menos um pedido não-cancelado no período e na loja selecionados. O catálogo vem dos títulos dos pedidos; produto sem venda no período fica fora deste número, mas conta no total da linha de apoio.",
      apoio: `de ${catalogSize} no catálogo`,
    },
    {
      icone: DollarSign,
      titulo: "Receita Total",
      valor: fmtCurrency(totalRevenue),
      tooltip:
        "Soma da receita dos pedidos não-cancelados do período, em todos os produtos do catálogo e no recorte de loja escolhido. A variação compara com o período anterior de mesma duração.",
      delta: revenueDelta,
    },
    {
      icone: ShoppingCart,
      titulo: "Pedidos Totais",
      valor: totalOrders.toLocaleString("pt-BR"),
      tooltip:
        "Pedidos não-cancelados do período somados em todos os produtos, no recorte de loja escolhido. Só entram pedidos com título de produto. A variação compara com o período anterior de mesma duração.",
      delta: ordersDelta,
    },
    {
      icone: TrendingUp,
      titulo: "Ticket Médio",
      valor: fmtCurrency(ticket),
      tooltip: "Receita total do período dividida pelos pedidos dele.",
      delta: ticketDelta,
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((c, i) => (
        <motion.div
          key={c.titulo}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.05 }}
        >
          <KpiPadrao
            titulo={c.titulo}
            valor={c.valor}
            apoio={c.apoio}
            tooltip={c.tooltip}
            icone={c.icone}
            className="h-full"
          >
            {c.delta && (
              <p className={cn("text-xs tabular-nums", DELTA_COLOR[c.delta.color])}>{c.delta.text}</p>
            )}
          </KpiPadrao>
        </motion.div>
      ))}
    </div>
  );
}
