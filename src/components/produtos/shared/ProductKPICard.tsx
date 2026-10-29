import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

type IconColor = "primary" | "emerald" | "blue" | "violet" | "amber" | "rose";
type SubtitleColor = "default" | "success" | "warning" | "danger";

interface ProductKPICardProps {
  icon: LucideIcon;
  iconColor?: IconColor;
  label: string;
  value: string | number;
  subtitle?: string;
  subtitleColor?: SubtitleColor;
  longValue?: boolean;
}

const ICON_MAP: Record<IconColor, { bg: string; text: string }> = {
  primary: { bg: "bg-primary/10", text: "text-primary" },
  emerald: { bg: "bg-emerald-500/10", text: "text-emerald-600 dark:text-emerald-400" },
  blue: { bg: "bg-blue-500/10", text: "text-blue-600 dark:text-blue-400" },
  violet: { bg: "bg-violet-500/10", text: "text-violet-600 dark:text-violet-400" },
  amber: { bg: "bg-amber-500/10", text: "text-amber-600 dark:text-amber-400" },
  rose: { bg: "bg-rose-500/10", text: "text-rose-600 dark:text-rose-400" },
};

const SUBTITLE_MAP: Record<SubtitleColor, string> = {
  default: "text-muted-foreground",
  success: "text-emerald-600 dark:text-emerald-400",
  warning: "text-amber-600 dark:text-amber-400",
  danger: "text-rose-600 dark:text-rose-400",
};

/**
 * Fileira de KPIs enquanto a RPC não voltou. Sem isto a tela abre com
 * "0 produtos / R$ 0,00" e pula para o número certo — parece dado, não é.
 */
export function ProductKPIRowSkeleton({ count = 4 }: { count?: number }) {
  return (
    // As colunas seguem o `count`: a fileira real de Itens tem 3 cards em
    // `lg:grid-cols-3` — um esqueleto fixo em 4 colunas prometeria um card a mais.
    <div className={cn("grid grid-cols-1 sm:grid-cols-2 gap-4", count === 3 ? "lg:grid-cols-3" : "lg:grid-cols-4")}>
      {[...Array(count)].map((_, i) => (
        <div key={i} className="rounded-2xl bg-card shadow-sm p-5 flex items-start gap-4">
          <Skeleton className="w-10 h-10 rounded-xl shrink-0" />
          <div className="flex-1 min-w-0 space-y-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-6 w-20" />
            <Skeleton className="h-3 w-28" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ProductKPICard({
  icon: Icon,
  iconColor = "primary",
  label,
  value,
  subtitle,
  subtitleColor = "default",
  longValue = false,
}: ProductKPICardProps) {
  const c = ICON_MAP[iconColor];
  return (
    <div className="rounded-2xl bg-card shadow-sm hover:shadow-hover transition-shadow p-5 flex items-start gap-4 h-full">
      <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0", c.bg)}>
        <Icon className={cn("w-5 h-5", c.text)} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={cn("font-bold tabular-nums text-foreground mt-0.5 truncate", longValue ? "text-xl" : "text-2xl")}>
          {value}
        </p>
        {subtitle && (
          <p className={cn("text-xs mt-1 tabular-nums", SUBTITLE_MAP[subtitleColor])}>
            {subtitle}
          </p>
        )}
      </div>
    </div>
  );
}
