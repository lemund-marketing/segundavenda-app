import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface MarketplaceAlias {
  id: string;
  seller_id: string;
  original_value: string;
  display_name: string;
  badge_color: string;
}

const EMPTY: MarketplaceAlias[] = [];

/**
 * Apelidos de marketplace do seller.
 *
 * Passou de useState+useEffect para react-query porque a lista de clientes
 * monta um StoreBadge por linha (tabela + fallback mobile, os dois montados):
 * com 50 linhas eram 100 selects idênticos por página. Pelo cache, é um só —
 * as demais instâncias leem a mesma entrada.
 * `original_value` é normalizado para minúsculas no load (veio da main):
 * o banco tem valores em caixa mista e o matching é case-insensitive.
 */
export function useMarketplaceAliases(sellerId: string | undefined) {
  const query = useQuery<MarketplaceAlias[]>({
    queryKey: ["marketplace-aliases", sellerId],
    enabled: !!sellerId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("seller_marketplace_aliases")
        .select("id, seller_id, original_value, display_name, badge_color")
        .eq("seller_id", sellerId!);
      return ((data || []) as MarketplaceAlias[]).map((a) => ({
        ...a,
        original_value: a.original_value?.toLowerCase(),
      }));
    },
  });

  const aliases = query.data ?? EMPTY;

  const getDisplayName = (marketplace: string): string | null => {
    const alias = aliases.find((a) => a.original_value === marketplace?.toLowerCase());
    return alias?.display_name || null;
  };

  const getBadgeColor = (marketplace: string): string | null => {
    const alias = aliases.find((a) => a.original_value === marketplace?.toLowerCase());
    return alias?.badge_color || null;
  };

return {
    aliases,
    loading: query.isLoading,
    getDisplayName,
    getBadgeColor,
    refetch: () => query.refetch(),
  };
}
