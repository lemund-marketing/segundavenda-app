import { motion } from "framer-motion";
import { TrendingUp, Clock, AlertCircle, type LucideIcon } from "lucide-react";
import { KpiPadrao } from "@/components/kpi/KpiPadrao";
import { ProductKPIRowSkeleton } from "../shared/ProductKPICard";
import { daysSinceLastSale, getProductStatus } from "../shared/SectionIcon";
import type { ProductStats } from "@/hooks/useProductStats";

interface ItensKPIsProps {
  loading?: boolean;
  stats: ProductStats[];
}

export function ItensKPIs({ stats, loading }: ItensKPIsProps) {
  if (loading) return <ProductKPIRowSkeleton count={3} />;

  const total = stats.length || 1;
  let vendendo = 0, novo = 0, parado = 0, inativo = 0, desativado = 0;
  stats.forEach((p) => {
    const v = getProductStatus(p).variant;
    if (v === "vendendo") vendendo++;
    else if (v === "novo") novo++;
    // "Parados" e "Inativos" são faixas de RECÊNCIA: contam pelos dias sem
    // venda, não pelo badge. Produto desativado à mão vendendo ontem entrava em
    // "Inativos (30d+)" e era lido como churn de catálogo.
    if (v !== "desativado") {
      const d = daysSinceLastSale(p);
      if (d >= 7 && d < 30) parado++;
      else if (d >= 30) inativo++;
    } else {
      desativado++;
    }
  });

  const pct = (n: number) => `${Math.round((n / total) * 100)}% do catálogo`;

  // Origem: `last_order_at`/`first_order_at` da RPC get_product_ranking_stats
  // — última e primeira venda REAIS do produto, sem recorte de período nem de
  // loja. Os tooltips descrevem essa régua, não o filtro da tela.
  const cards: { icone: LucideIcon; titulo: string; valor: number; tooltip: string; apoio: string }[] = [
    {
      icone: TrendingUp,
      titulo: "Vendendo",
      valor: vendendo + novo,
      tooltip:
        "Produtos ativos com venda nos últimos 7 dias, olhando a última venda real do produto — sem o recorte de período do filtro. Produtos novos (estreia há menos de 7 dias) também entram nesta conta.",
      // o card soma "Novo" ao total; sem dizer isso o número não bate com a
      // contagem de badges "Vendendo" da tabela logo abaixo.
      apoio: novo > 0 ? `${pct(vendendo + novo)} · inclui ${novo} novo${novo === 1 ? "" : "s"}` : pct(vendendo),
    },
    {
      icone: Clock,
      titulo: "Parados (7-30d)",
      valor: parado,
      tooltip:
        "Produtos ativos cuja última venda real foi entre 7 e 30 dias atrás, olhando todo o histórico do produto — não só o período do filtro.",
      apoio: pct(parado),
    },
    {
      icone: AlertCircle,
      titulo: "Inativos (30d+)",
      valor: inativo,
      tooltip:
        "Produtos ativos há 30 dias ou mais sem nenhuma venda, incluindo quem nunca vendeu. Produto desativado à mão fica fora desta conta e aparece à parte na linha de apoio.",
      apoio: desativado > 0
        ? `${pct(inativo)} · ${desativado} desativado${desativado === 1 ? "" : "s"} à parte`
        : pct(inativo),
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
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
          />
        </motion.div>
      ))}
    </div>
  );
}
