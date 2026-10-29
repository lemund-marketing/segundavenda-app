import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, RotateCw } from "lucide-react";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ClientDetailSheet } from "@/components/crm/ClientDetailSheet";

import { CategoryDetailHeader } from "./detail/CategoryDetailHeader";
import { ProductOverviewTab } from "./detail/tabs/ProductOverviewTab";
import { ProductBehaviorTab } from "./detail/tabs/ProductBehaviorTab";
import { ProductOrdersTab } from "./detail/tabs/ProductOrdersTab";
import { CategoryComparisonTab } from "./detail/tabs/CategoryComparisonTab";
import {
  computeCompareRange,
  useCategoryDetailStats,
  type CompareMode,
} from "./detail/produtoDetailQueries";
import type { CategoryProductRank } from "./detail/shared";

export interface CategoryDetailSheetProps {
  /** Abre o sheet; `null` fecha. */
  categoryId: string | null;
  /** Nome e cor a mostrar enquanto a RPC não voltou. */
  categoryName?: string | null;
  categoryColor?: string | null;
  sellerId: string | null;
  /** Loja (`orders.marketplace`) do filtro da página; null = todas. */
  marketplace?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  onClose: () => void;
  /**
   * Clique numa linha do ranking de produtos. Sem isto o ranking é só leitura —
   * a decisão de fechar esta gaveta e abrir a do produto é de quem monta a
   * página, não daqui.
   */
  onSelectProduct?: (p: CategoryProductRank) => void;
  onSeeAllOrders?: (term: string) => void;
}

// Abaixo de 640px as quatro abas não cabem lado a lado: viram uma fileira que rola.
const ABA =
  "rounded-lg text-[12px] data-[state=active]:bg-foreground data-[state=active]:text-background py-2 max-sm:shrink-0 max-sm:px-3";

export function CategoryDetailSheet({
  categoryId,
  categoryName = null,
  categoryColor = null,
  sellerId,
  marketplace = null,
  dateFrom = null,
  dateTo = null,
  onClose,
  onSelectProduct,
  onSeeAllOrders,
}: CategoryDetailSheetProps) {
  const [compareMode, setCompareMode] = useState<CompareMode>("previous");
  const [activeClientId, setActiveClientId] = useState<string | null>(null);

  const open = !!categoryId && !!sellerId;

  useEffect(() => {
    if (categoryId) setCompareMode("previous");
  }, [categoryId]);

  const compare = useMemo(
    () => computeCompareRange(dateFrom, dateTo, compareMode),
    [dateFrom, dateTo, compareMode],
  );

  const { data: stats, isLoading, isError, error, refetch } = useCategoryDetailStats({
    sellerId,
    categoryId,
    marketplace,
    from: dateFrom,
    to: dateTo,
    compareFrom: compare.from,
    compareTo: compare.to,
    enabled: open,
  });

  const nome = stats?.category?.name || categoryName || "Categoria";

  return (
    <>
      <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-[600px] p-0 overflow-y-auto flex flex-col gap-0"
        >
          <SheetHeader className="sr-only">
            <SheetTitle>{nome}</SheetTitle>
            <SheetDescription>Detalhes da categoria</SheetDescription>
          </SheetHeader>

          <CategoryDetailHeader
            fallbackName={categoryName || "Categoria"}
            color={categoryColor}
            stats={stats ?? null}
            onClose={onClose}
          />

          <div className="px-4 pb-8 flex-1 sm:px-6">
            <Tabs defaultValue="overview" className="w-full">
              <TabsList className="mt-5 w-full grid grid-cols-4 bg-muted rounded-xl p-1 h-auto max-sm:flex max-sm:justify-start max-sm:overflow-x-auto max-sm:[scrollbar-width:none]">
                <TabsTrigger value="overview" className={ABA}>Visão Geral</TabsTrigger>
                <TabsTrigger value="behavior" className={ABA}>Comportamento</TabsTrigger>
                <TabsTrigger value="orders" className={ABA}>Pedidos</TabsTrigger>
                <TabsTrigger value="comparison" className={ABA}>Comparativo</TabsTrigger>
              </TabsList>

              {isLoading ? (
                <div className="space-y-4 pt-5">
                  <div className="grid grid-cols-2 gap-3">
                    {[...Array(4)].map((_, i) => (
                      <Skeleton key={i} className="h-24 rounded-2xl" />
                    ))}
                  </div>
                  <Skeleton className="h-48 rounded-2xl" />
                  <Skeleton className="h-48 rounded-2xl" />
                </div>
              ) : isError || !stats ? (
                <div className="py-16 flex flex-col items-center text-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-destructive/10 flex items-center justify-center">
                    <AlertTriangle className="w-6 h-6 text-destructive" />
                  </div>
                  <div>
                    <p className="font-medium text-foreground">Não foi possível carregar os dados</p>
                    <p className="text-sm text-muted-foreground mt-1 max-w-xs">
                      {(error as any)?.message ?? "Tente novamente em instantes."}
                    </p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => refetch()}>
                    <RotateCw className="w-4 h-4 mr-2" /> Tentar novamente
                  </Button>
                </div>
              ) : stats.total_orders === 0 ? (
                // Categoria recém-criada cai aqui: 0 pedidos porque ainda não
                // tem produto dentro, não porque o período está errado.
                <p className="py-12 text-center text-muted-foreground text-sm">
                  {stats.product_count === 0
                    ? "Nenhum produto nesta categoria ainda."
                    : "Nenhum pedido desta categoria no período selecionado."}
                </p>
              ) : (
                <>
                  <TabsContent value="overview" className="mt-0">
                    <ProductOverviewTab stats={stats} />
                  </TabsContent>
                  <TabsContent value="behavior" className="mt-0">
                    <ProductBehaviorTab stats={stats} onSelectClient={setActiveClientId} />
                  </TabsContent>
                  <TabsContent value="orders" className="mt-0">
                    <ProductOrdersTab
                      stats={stats}
                      searchTerm={nome}
                      onSelectClient={setActiveClientId}
                      onSeeAllOrders={
                        onSeeAllOrders
                          ? (term) => {
                              onClose();
                              onSeeAllOrders(term);
                            }
                          : undefined
                      }
                    />
                  </TabsContent>
                  <TabsContent value="comparison" className="mt-0">
                    <CategoryComparisonTab
                      stats={stats}
                      compareMode={compareMode}
                      onCompareModeChange={dateFrom && dateTo ? setCompareMode : undefined}
                      currentFrom={dateFrom}
                      currentTo={dateTo}
                      compareFrom={compare.from}
                      compareTo={compare.to}
                      onSelectProduct={onSelectProduct}
                    />
                  </TabsContent>
                </>
              )}
            </Tabs>
          </div>
        </SheetContent>
      </Sheet>

      {sellerId && (
        <ClientDetailSheet
          clientId={activeClientId}
          sellerId={sellerId}
          open={!!activeClientId}
          onOpenChange={(o) => !o && setActiveClientId(null)}
        />
      )}
    </>
  );
}

export default CategoryDetailSheet;
