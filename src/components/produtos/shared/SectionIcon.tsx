import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface SectionIconProps {
  icon: LucideIcon;
  /** Cor base do token: primary, emerald, blue, violet, amber, rose */
  color?: "primary" | "emerald" | "blue" | "violet" | "amber" | "rose";
  /** "sm" (32px) é o do header padrão de bloco; "md" (40px) é o histórico. */
  size?: "sm" | "md";
  className?: string;
}

// Cor de escala Tailwind sempre com par `dark:` — no tema escuro o -600 some
// contra o bg-card. Os tokens (`bg-primary/10 text-primary`) já viram sozinhos.
const COLOR_MAP: Record<NonNullable<SectionIconProps["color"]>, { bg: string; text: string }> = {
  primary: { bg: "bg-primary/10", text: "text-primary" },
  emerald: { bg: "bg-emerald-500/10", text: "text-emerald-600 dark:text-emerald-400" },
  blue:    { bg: "bg-blue-500/10",    text: "text-blue-600 dark:text-blue-400" },
  violet:  { bg: "bg-violet-500/10",  text: "text-violet-600 dark:text-violet-400" },
  amber:   { bg: "bg-amber-500/10",   text: "text-amber-600 dark:text-amber-400" },
  rose:    { bg: "bg-rose-500/10",    text: "text-rose-600 dark:text-rose-400" },
};

export function SectionIcon({ icon: Icon, color = "primary", size = "md", className }: SectionIconProps) {
  const c = COLOR_MAP[color];
  return (
    <div
      className={cn(
        "rounded-lg flex items-center justify-center shrink-0",
        size === "sm" ? "w-8 h-8" : "w-10 h-10 rounded-xl",
        c.bg,
        className,
      )}
    >
      <Icon className={cn(size === "sm" ? "w-4 h-4" : "w-5 h-5", c.text)} />
    </div>
  );
}

/**
 * "Desativado" (o vendedor desligou o item no menu) e "Inativo" (30+ dias sem
 * venda) são coisas diferentes e tinham a MESMA palavra e a mesma cor: a linha
 * dizia "Inativo" enquanto o ⋯ da mesma linha oferecia "Desativar" e o
 * cabeçalho da gaveta dizia "Ativo".
 */
export type ProductStatusVariant = "vendendo" | "parado" | "inativo" | "novo" | "desativado";

export function StatusBadge({
  variant,
  children,
}: {
  variant: ProductStatusVariant;
  children: React.ReactNode;
}) {
  const map: Record<ProductStatusVariant, string> = {
    vendendo:   "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    parado:     "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    inativo:    "bg-rose-500/10 text-rose-600 dark:text-rose-400",
    novo:       "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    desativado: "bg-muted text-muted-foreground",
  };
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", map[variant])}>
      {children}
    </span>
  );
}

/** Dias desde a última venda REAL do produto. Infinity = nunca vendeu. */
export function daysSinceLastSale(p: { last_order_at: string | null }): number {
  const ms = p.last_order_at ? new Date(p.last_order_at).getTime() : 0;
  return ms ? (Date.now() - ms) / 86400000 : Infinity;
}

/**
 * Status do produto. Usa `first_order_at`/`last_order_at` (estreia e última
 * venda REAIS do produto, que a RPC devolve sem recorte de janela nem de loja)
 * e não a data de criação da linha em `products` — aqui essa linha só nasce
 * quando alguém categoriza, então `created_at` diria "produto novo" para um
 * item que vende há um ano.
 */
export function getProductStatus(p: {
  last_order_at: string | null;
  first_order_at: string | null;
  total_orders: number;
  active: boolean;
}): { variant: ProductStatusVariant; label: string } {
  if (!p.active) return { variant: "desativado", label: "Desativado" };
  const firstMs = p.first_order_at ? new Date(p.first_order_at).getTime() : 0;
  const daysSinceLast = daysSinceLastSale(p);
  const daysSinceFirst = firstMs ? (Date.now() - firstMs) / 86400000 : Infinity;

  if (daysSinceFirst < 7 && p.total_orders < 3) return { variant: "novo", label: "Novo" };
  if (daysSinceLast < 7) return { variant: "vendendo", label: "Vendendo" };
  if (daysSinceLast < 30) return { variant: "parado", label: "Parado" };
  return { variant: "inativo", label: "Inativo" };
}
