export type HealthStatus = "healthy" | "attention" | "critical" | "no-data";

export interface HealthInfo {
  status: HealthStatus;
  label: string;
  color: "green" | "amber" | "red" | "gray";
  dotClass: string;
  pillClass: string;
}

export interface MinTemplate {
  sent: number;
  delivered: number;
  failed?: number;
}

export function calculateTemplateHealth(t: MinTemplate): HealthInfo {
  if (!t.sent || t.sent < 10) {
    return {
      status: "no-data",
      label: "Volume baixo",
      color: "gray",
      dotClass: "bg-gray-400",
      pillClass: "bg-gray-100 text-gray-600 dark:bg-muted dark:text-muted-foreground",
    };
  }
  const deliveryRate = (t.delivered / t.sent) * 100;
  const failureRate = ((t.failed ?? 0) / t.sent) * 100;

  if (deliveryRate >= 90 && failureRate < 10) {
    return {
      status: "healthy",
      label: "Saudável",
      color: "green",
      dotClass: "bg-green-500",
      pillClass: "bg-green-500/10 text-green-600 dark:text-green-400",
    };
  }
  if (deliveryRate >= 70 && failureRate < 30) {
    return {
      status: "attention",
      label: "Atenção",
      color: "amber",
      dotClass: "bg-amber-500",
      pillClass: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    };
  }
  return {
    status: "critical",
    label: "Crítico",
    // Cinza de propósito (20/08): vermelho assustava o lojista — não entregue
    // é rotina de canal, o rótulo "Crítico" já carrega o aviso.
    color: "gray",
    dotClass: "bg-gray-400",
    pillClass: "bg-gray-100 text-gray-600 dark:bg-muted dark:text-muted-foreground",
  };
}

export type CategoryKey =
  | "confirmacoes"
  | "promocoes"
  | "boas-vindas"
  | "recompra"
  | "aniversario"
  | "outros";

import type { LucideIcon } from "lucide-react";
import { Package, Tag, Heart, RefreshCw, Cake, FileText } from "lucide-react";

export interface CategoryInfo {
  key: CategoryKey;
  label: string;
  emoji: string;
  bgClass: string;
  iconBgClass: string;
  iconColorClass: string;
  icon: LucideIcon;
}

export const CATEGORIES: Record<CategoryKey, CategoryInfo> = {
  confirmacoes: { key: "confirmacoes", label: "Confirmações", emoji: "📦", bgClass: "bg-blue-500/10", iconBgClass: "bg-blue-500/10", iconColorClass: "text-blue-600 dark:text-blue-400", icon: Package },
  promocoes: { key: "promocoes", label: "Promoções", emoji: "🏷️", bgClass: "bg-amber-500/10", iconBgClass: "bg-amber-500/10", iconColorClass: "text-amber-600 dark:text-amber-400", icon: Tag },
  "boas-vindas": { key: "boas-vindas", label: "Boas-vindas", emoji: "👋", bgClass: "bg-green-500/10", iconBgClass: "bg-green-500/10", iconColorClass: "text-green-600 dark:text-green-400", icon: Heart },
  recompra: { key: "recompra", label: "Recompra", emoji: "🔄", bgClass: "bg-purple-500/10", iconBgClass: "bg-purple-500/10", iconColorClass: "text-purple-600 dark:text-purple-400", icon: RefreshCw },
  aniversario: { key: "aniversario", label: "Aniversário", emoji: "🎂", bgClass: "bg-pink-500/10", iconBgClass: "bg-pink-500/10", iconColorClass: "text-pink-600 dark:text-pink-400", icon: Cake },
  outros: { key: "outros", label: "Outros", emoji: "📝", bgClass: "bg-gray-100 dark:bg-muted", iconBgClass: "bg-muted", iconColorClass: "text-muted-foreground", icon: FileText },
};

export function categorizeTemplate(name: string): CategoryInfo {
  const n = (name || "").toLowerCase();
  if (n.startsWith("confirmacao_") || n.startsWith("confirmação_") || n.startsWith("confirmation_")) return CATEGORIES.confirmacoes;
  if (n.startsWith("envio_de_promo_") || n.startsWith("promo_") || n.includes("_promo_")) return CATEGORIES.promocoes;
  if (n.startsWith("boas_vindas") || n.startsWith("welcome") || n.startsWith("bem_vindo")) return CATEGORIES["boas-vindas"];
  if (n.startsWith("recompra_") || n.includes("repurchase")) return CATEGORIES.recompra;
  if (n.startsWith("aniversario_") || n.startsWith("birthday")) return CATEGORIES.aniversario;
  return CATEGORIES.outros;
}

