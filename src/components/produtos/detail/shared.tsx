import type { CSSProperties, ReactNode } from "react";
import { Minus, TrendingDown, TrendingUp, type LucideIcon } from "lucide-react";

import { hexToRgba } from "@/components/clients/sections/shared";
import { inkPair } from "@/utils/contrastInk";
import { formatCurrency } from "@/utils/formatters";
import { cn } from "@/lib/utils";

/**
 * Peças compartilhadas pelos dois sheets de detalhe da página Produtos
 * (produto e categoria) e por todas as abas deles.
 *
 * O raio é o mesmo do Segundo Pedido de propósito: `rounded-2xl` rende 28px nas
 * duas bases, então cartão copiado de lá cai no mesmo pixel aqui.
 */

// ---------------------------------------------------------------------------
// Formatação
// ---------------------------------------------------------------------------

/** `formatCurrency` global, reexportado com o nome curto que as abas usam. */
export { formatCurrency };

export const fmtInt = (n: number) => Math.round(Number(n) || 0).toLocaleString("pt-BR");

/** Eixo Y: "R$ 12,3k" — o valor cheio não cabe em 60px de gutter. */
export const fmtAxisCurrency = (v: number) =>
  v >= 1000 ? `R$ ${(v / 1000).toFixed(1)}k` : `R$ ${Math.round(v)}`;

/** Mesma redação de variação das outras telas: sinal + 1 casa, sem o ".0". */
export const fmtPct = (v: number | null | undefined) => {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  const sign = v > 0 ? "+" : v < 0 ? "−" : "";
  return `${sign}${Math.abs(v).toFixed(1).replace(/\.0$/, "")}%`;
};

/** null = não havia base para comparar; quem exibe decide entre "—" e "Novo". */
export const diffPct = (cur: number, base: number): number | null =>
  !base ? null : ((cur - base) / base) * 100;

/** Índice = `dow` do Postgres (0 = domingo). */
export const WEEKDAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

// ---------------------------------------------------------------------------
// Tons e cor
// ---------------------------------------------------------------------------

export type Tone = "primary" | "rose" | "violet" | "blue" | "emerald" | "amber";

/**
 * Toda cor de escala Tailwind leva par `dark:`. O `-600` sozinho (que é o que
 * vem do Segundo Pedido) dá ~3:1 sobre o card escuro desta base.
 */
export const TONE_CLASS: Record<Tone, string> = {
  primary: "bg-primary/10 text-primary",
  rose: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
  violet: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  blue: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  emerald: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  amber: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
};

export const TREND_UP = "text-emerald-600 dark:text-emerald-400";
export const TREND_DOWN = "text-rose-600 dark:text-rose-400";

/** Tooltip do recharts em tokens: hex cru não sobrevive à troca de tema. */
export const chartTooltipProps = {
  contentStyle: {
    borderRadius: 12,
    border: "1px solid hsl(var(--border))",
    background: "hsl(var(--card))",
    color: "hsl(var(--foreground))",
    fontSize: 12,
    boxShadow: "var(--shadow-md)",
  },
  labelStyle: { color: "hsl(var(--muted-foreground))", marginBottom: 2 },
  itemStyle: { color: "hsl(var(--foreground))" },
} as const;

export const barCursor = { fill: "hsl(var(--muted))", opacity: 0.45 };

// ---------------------------------------------------------------------------
// Blocos
// ---------------------------------------------------------------------------

export function IconBox({
  icon: Icon,
  tone = "primary",
  size = "md",
}: {
  icon: LucideIcon;
  tone?: Tone;
  size?: "sm" | "md";
}) {
  return (
    <div
      className={cn(
        "rounded-xl flex items-center justify-center shrink-0",
        size === "sm" ? "w-8 h-8" : "w-10 h-10",
        TONE_CLASS[tone],
      )}
    >
      <Icon className={size === "sm" ? "w-4 h-4" : "w-5 h-5"} />
    </div>
  );
}

export function KPICard({
  icon,
  tone = "primary",
  label,
  value,
  variation,
}: {
  icon: LucideIcon;
  tone?: Tone;
  label: string;
  value: ReactNode;
  variation?: number | null;
}) {
  const showTrend = variation !== undefined && variation !== null && !Number.isNaN(variation);
  const isUp = showTrend && variation! > 0;
  const isDown = showTrend && variation! < 0;
  const TrendIcon = isUp ? TrendingUp : isDown ? TrendingDown : Minus;

  return (
    <div className="rounded-2xl bg-card shadow-sm hover:shadow-hover transition-all duration-200 p-5 flex flex-col gap-2 max-sm:p-4">
      <IconBox icon={icon} tone={tone} size="sm" />
      <div className="text-xl font-bold tabular-nums text-foreground leading-tight max-sm:text-[17px]">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
      {showTrend && (
        <div
          className={cn(
            "inline-flex items-center gap-1 text-xs font-medium tabular-nums",
            isUp && TREND_UP,
            isDown && TREND_DOWN,
            !isUp && !isDown && "text-muted-foreground",
          )}
        >
          <TrendIcon className="w-3 h-3" />
          {fmtPct(variation)}
        </div>
      )}
    </div>
  );
}

export function SectionCard({
  icon,
  iconTone = "primary",
  title,
  subtitle,
  right,
  children,
}: {
  icon: LucideIcon;
  iconTone?: Tone;
  title: string;
  subtitle?: string;
  right?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="rounded-2xl bg-card shadow-sm hover:shadow-hover transition-all duration-200 p-5">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <IconBox icon={icon} tone={iconTone} />
          <div className="min-w-0">
            <h3 className="font-semibold text-foreground leading-tight">{title}</h3>
            {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
          </div>
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}

/**
 * Etiqueta da categoria na cor escolhida pelo vendedor.
 *
 * O Segundo Pedido pinta `color: <hex>` cru — verde escuro sobre card escuro
 * some. Aqui a cor da marca vira fundo/borda como está e o TEXTO passa pelo
 * `inkPair`, que caminha até 4,5:1 em cada tema. Mesmo mecanismo do StoreBadge.
 */
export function CategoryPill({
  name,
  color,
  className,
}: {
  name: string;
  color?: string | null;
  className?: string;
}) {
  const hex = color || "#8E9196";
  const ink = inkPair(hex);
  const style = {
    background: hexToRgba(hex, 0.14),
    borderColor: hexToRgba(hex, 0.32),
    "--cat-ink": ink.light,
    "--cat-ink-dark": ink.dark,
  } as CSSProperties;

  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
        "text-[color:var(--cat-ink)] dark:text-[color:var(--cat-ink-dark)]",
        className,
      )}
      style={style}
    >
      <span className="min-w-0 truncate">{name}</span>
    </span>
  );
}

export function EmptyBlock({ children, height = 200 }: { children: ReactNode; height?: number }) {
  return (
    <div className="flex items-center justify-center text-sm text-muted-foreground" style={{ height }}>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tipos do payload das RPCs
// ---------------------------------------------------------------------------

/** Uma declaração só para toda a página — a da lista. */
export type { ProductCategory } from "@/hooks/useProductStats";

export interface CategoryRef {
  id: string;
  name: string;
  color: string;
}

export interface WeekdayBucket {
  /** 0 = domingo, como o `extract(dow)` do Postgres. Sempre os 7. */
  dow: number;
  orders: number;
  revenue: number;
}

export interface ShiftBreakdown {
  madrugada: number;
  manha: number;
  tarde: number;
  noite: number;
}

export interface TopClient {
  client_id: string;
  full_name: string | null;
  total_orders: number;
  total_spent: number;
  last_order_at: string;
}

export interface DetailOrder {
  id: string;
  acquired_at: string;
  client_id: string | null;
  client_name: string | null;
  marketplace: string | null;
  /** Só o detalhe de CATEGORIA traz o produto — a lista lá é de vários itens. */
  product?: string | null;
  total_amount: number;
  order_status: string | null;
}

export interface MonthlyPoint {
  ym: string;
  label: string;
  orders: number;
  revenue: number;
}

export interface VariationVsPrevious {
  prev_orders: number;
  prev_revenue: number;
  orders_variation_pct: number | null;
  revenue_variation_pct: number | null;
}

export interface CategoryComparison {
  category_name: string;
  category_avg_orders: number;
  category_avg_revenue: number;
  this_product_orders: number;
  this_product_revenue: number;
  position_in_category: number;
  total_in_category: number;
}

/** O que os dois detalhes têm em comum — é o que as abas reaproveitadas leem. */
export interface DetailStatsBase {
  total_orders: number;
  total_revenue: number;
  unique_clients: number;
  avg_ticket: number;
  first_order_at: string | null;
  last_order_at: string | null;
  /** [loja, pedidos] — aqui "loja" é `orders.marketplace`. */
  marketplaces: [string, number][];
  weekday_breakdown: WeekdayBucket[];
  shift_breakdown: ShiftBreakdown;
  top_clients: TopClient[];
  recent_orders: DetailOrder[];
  monthly_evolution: MonthlyPoint[];
  variation_vs_previous: VariationVsPrevious | null;
}

export interface ProductDetailStats extends DetailStatsBase {
  /** Chave normalizada (`public.product_key`) — é a identidade do produto. */
  key: string;
  /**
   * Grafia mais FREQUENTE vinda dos pedidos, já sem espaço solto. É a única
   * string que pode ir para as RPCs de escrita — o apelido NÃO serve.
   */
  name: string;
  /** Apelido do vendedor; NUNCA entra na chave. */
  display_name: string | null;
  /** Só existe se alguém já anotou algo (categoria/sku/apelido) neste produto. */
  product_id: string | null;
  /** O que a tela mostra: anotação, senão o SKU vindo dos pedidos. */
  sku: string | null;
  /** Só a anotação — é este que volta para `set_product_fields`. */
  sku_annotated: string | null;
  active: boolean;
  category: CategoryRef | null;
  category_comparison: CategoryComparison | null;
}

export interface CategoryProductRank {
  key: string;
  name: string;
  orders: number;
  revenue: number;
  ticket: number;
}

export interface CategoryDetailStats extends DetailStatsBase {
  category: CategoryRef | null;
  product_count: number;
  products_ranking: CategoryProductRank[];
}
