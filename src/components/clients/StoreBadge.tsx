import type { CSSProperties } from "react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { hexToRgba } from "@/components/clients/sections/shared";
import { useSellerContext } from "@/contexts/SellerContext";
import { useMarketplaceAliases } from "@/hooks/useMarketplaceAliases";
import { formatMarketplaceName } from "@/utils/formatters";
import { getMarketplaceColor } from "@/utils/marketplaceColors";
import { inkPair } from "@/utils/contrastInk";
import { cn } from "@/lib/utils";

const HEX_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

export interface StoreBadgeProps {
  storeKey?: string | null;
  storeName?: string | null;
  extraStores?: number;
  className?: string;
}

export function StoreBadge({ storeKey, storeName, extraStores = 0, className }: StoreBadgeProps) {
  const { activeSeller } = useSellerContext();
  const { getDisplayName, getBadgeColor } = useMarketplaceAliases(activeSeller?.id);

  if (!storeKey) return <span className="text-muted-foreground">—</span>;

  const label = storeName || getDisplayName(storeKey) || formatMarketplaceName(storeKey);

  const aliasColor = getBadgeColor(storeKey);
  const hex = aliasColor && HEX_RE.test(aliasColor) ? aliasColor : getMarketplaceColor(storeKey);

  // A cor da marca vira fundo/borda como está, mas como TEXTO precisa passar em
  // 4,5:1 — e o tema é decidido por CSS, então as duas versões viajam em
  // variáveis e o `dark:` escolhe.
  const ink = inkPair(hex);
  const style = {
    background: hexToRgba(hex, 0.14),
    borderColor: hexToRgba(hex, 0.32),
    "--pill-ink": ink.light,
    "--pill-ink-dark": ink.dark,
  } as CSSProperties;

  const extras = Math.max(0, Math.trunc(extraStores));

  const pill = (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
        "text-[color:var(--pill-ink)] dark:text-[color:var(--pill-ink-dark)]",
        className,
      )}
      style={style}
    >
      <span className="min-w-0 truncate">{label}</span>
      {extras > 0 && <span className="shrink-0 opacity-70 tabular-nums">+{extras}</span>}
    </span>
  );

  // Tooltip em toda linha de uma tabela longa vira ruído: só quando há o "+N" a explicar.
  if (extras === 0) return pill;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{pill}</TooltipTrigger>
      <TooltipContent className="max-w-[240px] text-xs">
        Comprou também em mais {extras} loja{extras > 1 ? "s" : ""}. A etiqueta mostra a do último pedido.
      </TooltipContent>
    </Tooltip>
  );
}

export default StoreBadge;
