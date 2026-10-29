import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, RotateCw } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

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

import { ProductDetailHeader } from "./detail/ProductDetailHeader";
import { ProductOverviewTab } from "./detail/tabs/ProductOverviewTab";
import { ProductBehaviorTab } from "./detail/tabs/ProductBehaviorTab";
import { ProductOrdersTab } from "./detail/tabs/ProductOrdersTab";
import { ProductComparisonTab } from "./detail/tabs/ProductComparisonTab";
import { useProductCategories, type ProductCategory } from "@/hooks/useProductStats";

import {
  computeCompareRange,
  invalidateProdutoQueries,
  setProductsCategory,
  useProductDetailStats,
  type CompareMode,
} from "./detail/produtoDetailQueries";

export interface ProductDetailSheetProps {
  /**
   * Abre o sheet. Aceita a chave normalizada do ranking (`row.key`) OU a grafia
   * crua do pedido — a RPC normaliza dos dois jeitos. `null` fecha.
   */
  productKey: string | null;
  /**
   * Grafia CRUA do pedido, só para o cabeçalho enquanto a RPC não voltou.
   * NUNCA é usada para gravar: a identidade que vai para o banco sai de
   * `stats.name`, que a RPC devolve.
   */
  productName?: string | null;
  /** Apelido, quando existe — o cabeçalho prefere ele antes de a RPC voltar. */
  productDisplayName?: string | null;
  sellerId: string | null;
  /** Loja (`orders.marketplace`) do filtro da página; null = todas. */
  marketplace?: string | null;
  /** ISO. Sem as duas pontas não há comparativo (a RPC devolve null). */
  dateFrom?: string | null;
  dateTo?: string | null;
  /** Se a página já tem as categorias em mão, evita uma consulta. */
  categories?: ProductCategory[];
  /** false esconde o popover de categoria (leitura apenas). */
  canEdit?: boolean;
  onClose: () => void;
  /** Chamado depois de gravar a categoria daqui de dentro. */
  onChanged?: () => void;
  /** Rodapé "Ver todos os pedidos" — ver o comentário em ProductOrdersTab. */
  onSeeAllOrders?: (term: string) => void;
}

// Abaixo de 640px as quatro abas não cabem lado a lado: viram uma fileira que rola.
const ABA =
  "rounded-lg text-[12px] data-[state=active]:bg-foreground data-[state=active]:text-background py-2 max-sm:shrink-0 max-sm:px-3";

export function ProductDetailSheet({
  productKey,
  productName = null,
  productDisplayName = null,
  sellerId,
  marketplace = null,
  dateFrom = null,
  dateTo = null,
  categories,
  canEdit = true,
  onClose,
  onChanged,
  onSeeAllOrders,
}: ProductDetailSheetProps) {
  const [compareMode, setCompareMode] = useState<CompareMode>("previous");
  const [activeClientId, setActiveClientId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const open = !!productKey && !!sellerId;

  // Cada produto começa com o comparativo no padrão: manter "ano passado" de um
  // produto ao abrir o seguinte faz o número mudar sem ninguém ter mexido.
  useEffect(() => {
    if (productKey) setCompareMode("previous");
  }, [productKey]);

  const compare = useMemo(
    () => computeCompareRange(dateFrom, dateTo, compareMode),
    [dateFrom, dateTo, compareMode],
  );

  // A página normalmente já tem a lista em mão; sem ela, o sheet busca sozinho
  // pela MESMA queryKey (`["product-categories", sellerId]`) — cache único, e a
  // etiqueta do cabeçalho nunca discorda do select da tabela atrás.
  const categoriasQuery = useProductCategories(categories ? null : sellerId);
  const categorias = categories ?? categoriasQuery.data ?? [];

  const { data: stats, isLoading, isError, error, refetch } = useProductDetailStats({
    sellerId,
    productKey,
    marketplace,
    from: dateFrom,
    to: dateTo,
    compareFrom: compare.from,
    compareTo: compare.to,
    enabled: open,
  });

  /**
   * A identidade que vai para o banco é SEMPRE `stats.name` — a grafia crua que
   * a própria RPC devolveu. Nada de fallback para o nome que a lista mandou:
   * a lista manda `productLabel(p)`, que é o APELIDO quando existe, e gravar o
   * apelido criava uma linha nova em `products` (chave = product_key(apelido))
   * que nenhum pedido casa. O toast dizia "Categoria atualizada" e o produto
   * de verdade continuava sem categoria.
   *
   * Por isso o botão de categoria só existe depois que `stats` chega — e não
   * durante o carregamento nem quando a RPC falhou (o cabeçalho continua
   * renderizado nos dois casos).
   */
  const nomeParaGravar = stats?.name ?? null;

  const assignCategory = useMemo(() => {
    if (!canEdit || !sellerId) return undefined;
    return async (categoryId: string | null) => {
      if (!nomeParaGravar) {
        toast.error("Aguarde os dados do produto carregarem");
        return;
      }
      try {
        const n = await setProductsCategory(sellerId, [nomeParaGravar], categoryId);
        if (n === 0) {
          toast.error("Produto não encontrado no catálogo deste vendedor");
          return;
        }
        toast.success(categoryId ? "Categoria atualizada" : "Categoria removida");
        invalidateProdutoQueries(queryClient);
        onChanged?.();
      } catch (e: any) {
        toast.error("Não foi possível salvar a categoria", { description: e?.message });
      }
    };
  }, [canEdit, sellerId, nomeParaGravar, queryClient, onChanged]);

  return (
    <>
      <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-[600px] p-0 overflow-y-auto flex flex-col gap-0"
        >
          <SheetHeader className="sr-only">
            <SheetTitle>
              {stats?.display_name || stats?.name || productDisplayName || productName || "Produto"}
            </SheetTitle>
            <SheetDescription>Detalhes do produto</SheetDescription>
          </SheetHeader>

          <ProductDetailHeader
            fallbackName={productName || productKey || ""}
            fallbackDisplayName={productDisplayName}
            stats={stats ?? null}
            categories={categorias}
            onClose={onClose}
            onAssignCategory={assignCategory}
            // sem `stats` não há identidade confiável para gravar
            assignDisabled={!nomeParaGravar}
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
                // Falha de consulta não pode cair no estado vazio: "sem pedidos
                // no período" mandaria o usuário mexer no filtro errado.
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
                <p className="py-12 text-center text-muted-foreground text-sm">
                  Nenhum pedido deste produto no período selecionado.
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
                      searchTerm={stats.name}
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
                    <ProductComparisonTab
                      stats={stats}
                      compareMode={compareMode}
                      onCompareModeChange={dateFrom && dateTo ? setCompareMode : undefined}
                      currentFrom={dateFrom}
                      currentTo={dateTo}
                      compareFrom={compare.from}
                      compareTo={compare.to}
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

export default ProductDetailSheet;
