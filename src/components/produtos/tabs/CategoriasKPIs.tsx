import { motion } from "framer-motion";
import { Tags, CheckCircle, Award, AlertTriangle } from "lucide-react";
import { ProductKPICard, ProductKPIRowSkeleton } from "../shared/ProductKPICard";
import { fmtCurrency } from "../shared/produtosUtils";
import type { ProductCategory, ProductStats } from "@/hooks/useProductStats";

interface CategoriasKPIsProps {
  loading?: boolean;
  stats: ProductStats[];
  categories: ProductCategory[];
}

export function CategoriasKPIs({ stats, categories, loading }: CategoriasKPIsProps) {
  if (loading) return <ProductKPIRowSkeleton />;

  const total = stats.length;
  const categorized = stats.filter((p) => p.category_id).length;
  const pctCat = total > 0 ? Math.round((categorized / total) * 100) : 0;

  // Categoria campeã em receita (as sem categoria ficam de fora)
  const revByCat: Record<string, { name: string; revenue: number }> = {};
  stats.forEach((p) => {
    if (!p.category_id) return;
    const k = p.category_id;
    if (!revByCat[k]) revByCat[k] = { name: p.category_name ?? "—", revenue: 0 };
    revByCat[k].revenue += p.total_revenue;
  });
  const top = Object.values(revByCat).sort((a, b) => b.revenue - a.revenue)[0];

  const productCatIds = new Set(stats.map((p) => p.category_id).filter(Boolean) as string[]);
  const empty = categories.filter((c) => !productCatIds.has(c.id)).length;

  const cards = [
    {
      icon: Tags, iconColor: "violet" as const, label: "Categorias Cadastradas",
      value: categories.length,
      subtitle: categories.length === 0 ? "Crie a primeira" : undefined,
    },
    {
      icon: CheckCircle, iconColor: "emerald" as const, label: "Produtos Categorizados",
      value: categorized,
      subtitle: total > 0 ? `${categorized} de ${total} (${pctCat}%)` : "—",
      subtitleColor: (pctCat < 50 ? "warning" : "default") as "warning" | "default",
    },
    {
      icon: Award, iconColor: "amber" as const, label: "Top em Receita",
      value: top?.name ?? "—",
      subtitle: top ? fmtCurrency(top.revenue) : undefined,
      longValue: true,
    },
    {
      icon: AlertTriangle, iconColor: "rose" as const, label: "Sem Itens",
      value: empty,
      subtitle: empty === 0 ? "Tudo categorizado ✓" : "categorias vazias",
      subtitleColor: (empty === 0 ? "success" : "default") as "success" | "default",
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((c, i) => (
        <motion.div
          key={c.label}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.05 }}
        >
          <ProductKPICard {...c} />
        </motion.div>
      ))}
    </div>
  );
}
