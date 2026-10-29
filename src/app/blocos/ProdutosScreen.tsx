import { useCallback, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AlertTriangle, RotateCw, Search, Tag, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { PILULA_ATIVA, PILULA_FILTRO, Pilulas } from "@/components/mobile/blocos";
import { useAuth } from "@/contexts/AuthContext";
import { useSellerContext } from "@/contexts/SellerContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useMarketplaceAliases } from "@/hooks/useMarketplaceAliases";
import {
  useProductCategories,
  useProductStats,
  type ProductCategory,
  type ProductStats,
} from "@/hooks/useProductStats";
import { ProductDetailSheet } from "@/components/produtos/ProductDetailSheet";
import { CategoryDetailSheet } from "@/components/produtos/CategoryDetailSheet";
import { invalidateProdutoQueries } from "@/components/produtos/detail/produtoDetailQueries";
import { AnalyticsTab } from "@/components/produtos/tabs/AnalyticsTab";
import { ItensTab } from "@/components/produtos/tabs/ItensTab";
import { CategoriasTab } from "@/components/produtos/tabs/CategoriasTab";
import { formatMarketplaceName } from "@/utils/formatters";
import { cn } from "@/lib/utils";

/**
 * A tela de Produtos no desenho de celular, travada num marketplace: é a aba
 * Produtos do detalhe (LojaProdutosTab). No site ela é `ProdutosScreen`, de
 * src/pages/Produtos.tsx, com `embutidaMobile`; aqui fica só esse caminho.
 *
 * A loja e o período vêm de fora (o cabeçalho do marketplace manda nas cinco
 * abas), então não há pílula de período nem filtro de loja. Busca, categoria,
 * sub-aba e ordem vivem em memória: a URL é da página do marketplace.
 */

type Aba = "analytics" | "itens" | "categorias";
type CampoOrdem = "item" | "categoria" | "status" | "pedidos" | "receita" | "ultima";
type Direcao = "asc" | "desc";

const ABAS: { value: Aba; label: string }[] = [
  { value: "analytics", label: "Visão geral" },
  { value: "itens", label: "Itens" },
  { value: "categorias", label: "Categorias" },
];

/** `product_categories` e as RPCs de produto não estão nos tipos gerados do banco. */
const banco = supabase as unknown as SupabaseClient;

export interface ProdutosScreenProps {
  /** Slug de `orders.marketplace` imposto ao recorte inteiro (não é filtro). */
  lockedMarketplace: string;
  /** Apelido do marketplace, já resolvido pelo cabeçalho. */
  lockedMarketplaceLabel?: string;
  /** A janela do cabeçalho do marketplace, em ISO. */
  lockedRange: { start: string; end: string };
  /** false enquanto a aba está escondida: nada consulta e a tela mostra esqueleto. */
  active?: boolean;
  /** Espaçamento da versão de computador; no celular quem dá o respiro é o pai. */
  className?: string;
  embutidaMobile?: boolean;
  rotuloPeriodo?: string;
  rotuloComparacao?: string;
}

export function ProdutosScreen({
  lockedMarketplace,
  lockedMarketplaceLabel,
  lockedRange,
  active = true,
  rotuloPeriodo,
  rotuloComparacao,
}: ProdutosScreenProps) {
  const { user } = useAuth();
  const { activeSeller: seller } = useSellerContext();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { getDisplayName } = useMarketplaceAliases(seller?.id);

  const lojaTravada = lockedMarketplace.trim().toLowerCase();

  const [busca, setBusca] = useState("");
  const [categoria, setCategoria] = useState("all");
  const [aba, setAba] = useState<Aba>("analytics");
  const [ordem, setOrdem] = useState<{ campo: CampoOrdem; direcao: Direcao }>({ campo: "pedidos", direcao: "desc" });

  // A chave, a grafia CRUA e o apelido: o cabeçalho da gaveta precisa de um
  // rótulo antes de a RPC voltar. Quem grava usa o `stats.name` da RPC.
  const [produtoAberto, setProdutoAberto] =
    useState<{ key: string; name: string; displayName: string | null } | null>(null);
  const [categoriaAberta, setCategoriaAberta] = useState<ProductCategory | null>(null);

  const abrirProduto = useCallback((key: string, name: string, displayName: string | null = null) => {
    setProdutoAberto({ key, name, displayName });
  }, []);

  // A janela vem pronta do cabeçalho; a anterior tem o MESMO tamanho
  // (`from - (to - from)`), a conta das RPCs de pedidos e de marketplaces.
  const { dateFrom, dateTo, prevDateFrom } = useMemo(() => {
    const from = new Date(lockedRange.start);
    const to = new Date(lockedRange.end);
    return {
      dateFrom: from.toISOString(),
      dateTo: to.toISOString(),
      prevDateFrom: new Date(from.getTime() - (to.getTime() - from.getTime())).toISOString(),
    };
  }, [lockedRange.start, lockedRange.end]);

  // Aba escondida = seller ausente: as duas consultas já são `enabled: !!sellerId`.
  const sellerParaConsulta = active ? seller?.id : undefined;

  const {
    data: categories = [],
    isPending: pendingCategories,
    isError: erroCategories,
    refetch: refetchCategories,
  } = useProductCategories(sellerParaConsulta);

  const {
    data: productStats = [],
    isPending: pendingStats,
    isError: erroStats,
    error: erroStatsObj,
    refetch: refetchStats,
  } = useProductStats({
    sellerId: sellerParaConsulta,
    from: dateFrom,
    to: dateTo,
    prevFrom: prevDateFrom,
    marketplace: lojaTravada,
  });

  // `isPending`, não `isLoading`: com a aba escondida a consulta fica desligada
  // e `isLoading` diria "carregou, não há produto" sem ter buscado nada.
  const loading = !user || !seller?.id ? false : pendingStats || pendingCategories;
  const temErro = !!seller?.id && (erroStats || erroCategories);

  const marketplaceLabel = useCallback(
    (mkt: string) => {
      if (mkt?.trim().toLowerCase() === lojaTravada && lockedMarketplaceLabel?.trim()) {
        return lockedMarketplaceLabel.trim();
      }
      return getDisplayName(mkt) ?? formatMarketplaceName(mkt);
    },
    [getDisplayName, lojaTravada, lockedMarketplaceLabel],
  );

  const buscados = useMemo(() => {
    if (!busca) return productStats;
    const q = busca.toLowerCase();
    return productStats.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.display_name?.toLowerCase().includes(q) ?? false) ||
        (p.sku?.toLowerCase().includes(q) ?? false),
    );
  }, [productStats, busca]);

  const filtrados = useMemo(() => {
    if (categoria === "all") return buscados;
    if (categoria === "__none__") return buscados.filter((p) => !p.category_id);
    return buscados.filter((p) => p.category_id === categoria);
  }, [buscados, categoria]);

  // A lista E os dois detalhes: reabrir a gaveta logo depois de categorizar
  // mostraria o dado velho.
  const invalidarProdutos = useCallback(() => invalidateProdutoQueries(queryClient), [queryClient]);
  const invalidarCategorias = useCallback(
    () => queryClient.invalidateQueries({ queryKey: ["product-categories"] }),
    [queryClient],
  );

  const criarCategoria = useCallback(
    async (name: string, color: string) => {
      if (!seller?.id || !name.trim()) return;
      const { error } = await banco
        .from("product_categories")
        .insert({ seller_id: seller.id, name: name.trim(), color });
      if (error) {
        const jaExiste = /duplicate key|unique/i.test(error.message ?? "");
        toast({
          title: jaExiste ? "Já existe uma categoria com esse nome" : "Erro ao criar categoria",
          description: jaExiste ? undefined : error.message,
          variant: "destructive",
        });
        return;
      }
      toast({ title: "Categoria criada" });
      invalidarCategorias();
    },
    [seller?.id, toast, invalidarCategorias],
  );

  const renomearCategoria = useCallback(
    async (id: string, name: string) => {
      if (!name.trim()) return;
      const { error } = await banco.from("product_categories").update({ name: name.trim() }).eq("id", id);
      if (error) {
        toast({ title: "Erro ao atualizar", description: error.message, variant: "destructive" });
        return;
      }
      toast({ title: "Categoria atualizada" });
      invalidarCategorias();
    },
    [toast, invalidarCategorias],
  );

  const excluirCategoria = useCallback(
    async (id: string) => {
      const { error } = await banco.from("product_categories").delete().eq("id", id);
      if (error) {
        toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
        return;
      }
      // products.category_id é ON DELETE SET NULL: a lista de produtos muda junto.
      toast({ title: "Categoria removida" });
      invalidarCategorias();
      invalidarProdutos();
    },
    [toast, invalidarCategorias, invalidarProdutos],
  );

  // Produto se grava sempre pela grafia crua (`p.name`), nunca pelo apelido:
  // a linha em `products` nasce dentro da RPC, pela chave do nome.
  const categorizarVarios = useCallback(
    async (products: ProductStats[], categoryId: string) => {
      if (!seller?.id || products.length === 0) return;
      const val = categoryId === "__none__" ? null : categoryId;
      // Tirar a categoria de quem já está sem criaria uma anotação vazia em `products`.
      const alvos = products.filter((p) => p.category_id !== val);
      if (alvos.length === 0) {
        toast({ title: "Nada a alterar" });
        return;
      }
      const { data, error } = await banco.rpc("set_products_category", {
        p_seller_id: seller.id,
        p_product_names: alvos.map((p) => p.name),
        p_category_id: val,
      });
      if (error) {
        toast({ title: "Erro ao categorizar", description: error.message, variant: "destructive" });
        return;
      }
      // Quantos a RPC gravou (ela ignora nome fora do catálogo), não quantos foram.
      const n = Number(data) || 0;
      if (n === 0) {
        toast({ title: "Nenhum produto foi alterado", variant: "destructive" });
        return;
      }
      toast({ title: `${n} produto${n === 1 ? "" : "s"} categorizado${n === 1 ? "" : "s"}` });
      invalidarProdutos();
    },
    [seller?.id, toast, invalidarProdutos],
  );

  const categorizar = useCallback(
    async (product: ProductStats, categoryId: string) => {
      if (!seller?.id) return;
      const val = categoryId === "__none__" ? null : categoryId;
      if (product.category_id === val) return;
      const { error } = await banco.rpc("set_products_category", {
        p_seller_id: seller.id,
        p_product_names: [product.name],
        p_category_id: val,
      });
      if (error) {
        toast({ title: "Erro ao atualizar categoria", description: error.message, variant: "destructive" });
        return;
      }
      toast({ title: "Categoria atualizada" });
      invalidarProdutos();
    },
    [seller?.id, toast, invalidarProdutos],
  );

  // set_product_fields grava os três campos de uma vez: o que não está sendo
  // editado volta como estava, senão vira null.
  const salvarProduto = useCallback(
    async (product: ProductStats, displayName: string, sku: string) => {
      if (!seller?.id) return;
      const { error } = await banco.rpc("set_product_fields", {
        p_seller_id: seller.id,
        p_product_name: product.name,
        p_sku: sku.trim() || null,
        p_display_name: displayName.trim() || null,
        p_active: product.active,
      });
      if (error) {
        toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
        return;
      }
      toast({ title: "Produto atualizado" });
      invalidarProdutos();
    },
    [seller?.id, toast, invalidarProdutos],
  );

  const alternarAtivo = useCallback(
    async (product: ProductStats) => {
      if (!seller?.id) return;
      const { error } = await banco.rpc("set_product_fields", {
        p_seller_id: seller.id,
        p_product_name: product.name,
        // `sku_annotated`, não `sku`: o `sku` cai no SKU dos pedidos quando não
        // há anotação, e desativar o congelaria como se tivesse sido digitado.
        p_sku: product.sku_annotated,
        p_display_name: product.display_name,
        p_active: !product.active,
      });
      if (error) {
        toast({ title: "Erro ao alterar o produto", description: error.message, variant: "destructive" });
        return;
      }
      toast({ title: product.active ? "Produto desativado" : "Produto reativado" });
      invalidarProdutos();
    },
    [seller?.id, toast, invalidarProdutos],
  );

  const irParaItensDaCategoria = useCallback((categoryId: string) => {
    setAba("itens");
    setCategoria(categoryId);
  }, []);

  const temFiltro = !!busca || categoria !== "all";
  const rotuloCategoria =
    categoria === "all"
      ? "Categoria"
      : categoria === "__none__"
        ? "Sem categoria"
        : categories.find((c) => c.id === categoria)?.name ?? "Categoria";

  return (
    <>
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-3">
          <Pilulas rotulo="Seção de produtos" opcoes={ABAS} valor={aba} onChange={(v) => setAba(v)} />
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar produto ou SKU"
              className="h-11 rounded-full border-border/60 bg-card pl-10 pr-10 text-[15px]"
            />
            {busca && (
              <button
                type="button"
                onClick={() => setBusca("")}
                aria-label="Limpar busca"
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-muted-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <Select value={categoria} onValueChange={setCategoria}>
              <SelectTrigger aria-label="Categoria" className={cn(PILULA_FILTRO, categoria !== "all" && PILULA_ATIVA)}>
                <Tag className="h-4 w-4 shrink-0 opacity-70" />
                <span>{rotuloCategoria}</span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as categorias</SelectItem>
                <SelectItem value="__none__">Sem categoria</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full" style={{ background: c.color }} />
                      {c.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {temFiltro && (
              <button
                type="button"
                onClick={() => {
                  setBusca("");
                  setCategoria("all");
                }}
                className="h-9 shrink-0 rounded-full px-3 text-[13px] font-semibold text-muted-foreground active:bg-muted"
              >
                Limpar
              </button>
            )}
          </div>
        </div>

        {temErro ? (
          <div className="flex flex-col items-center gap-3 rounded-3xl border border-border/60 bg-card px-6 py-10 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-destructive/10">
              <AlertTriangle className="h-6 w-6 text-destructive" />
            </div>
            <div>
              <p className="font-medium text-foreground">Não foi possível carregar seus produtos</p>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                {(erroStatsObj as { message?: string } | null)?.message ?? "Tente novamente em instantes."}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                refetchStats();
                refetchCategories();
              }}
            >
              <RotateCw className="mr-2 h-4 w-4" /> Tentar novamente
            </Button>
          </div>
        ) : aba === "analytics" ? (
          <AnalyticsTab
            loading={loading}
            productStats={productStats}
            filteredStats={filtrados}
            marketplaceLabel={marketplaceLabel}
            onSelectProduct={abrirProduto}
            onCategorizeNow={() => irParaItensDaCategoria("__none__")}
            onSelectCategoryFromRanking={irParaItensDaCategoria}
            mobile
            rotuloPeriodo={rotuloPeriodo}
            rotuloComparacao={rotuloComparacao}
          />
        ) : aba === "itens" ? (
          <ItensTab
            loading={loading}
            filteredStats={filtrados}
            categories={categories}
            sortField={ordem.campo}
            sortDir={ordem.direcao}
            onSortChange={(campo, direcao) => setOrdem({ campo, direcao })}
            onSelectProduct={abrirProduto}
            onAssignCategory={categorizar}
            onAssignCategoryBulk={categorizarVarios}
            onSaveProductEdit={salvarProduto}
            onToggleProductActive={alternarAtivo}
            mobile
          />
        ) : (
          // `buscados` e não `filtrados`: esta aba MEDE as categorias, e com uma
          // categoria escolhida ela veria só a dela.
          <CategoriasTab
            loading={loading}
            categories={categories}
            filteredStats={buscados}
            onCreateCategory={criarCategoria}
            onUpdateCategory={renomearCategoria}
            onDeleteCategory={excluirCategoria}
            onSelectCategoryFromList={irParaItensDaCategoria}
            onOpenCategoryDetail={setCategoriaAberta}
            mobile
          />
        )}
      </div>

      {/* As gavetas recebem o mesmo marketplace da lista: o detalhe do produto
          não pode abrir com os números do seller inteiro. */}
      <ProductDetailSheet
        productKey={produtoAberto?.key ?? null}
        productName={produtoAberto?.name ?? null}
        productDisplayName={produtoAberto?.displayName ?? null}
        sellerId={seller?.id ?? null}
        marketplace={lojaTravada}
        dateFrom={dateFrom}
        dateTo={dateTo}
        categories={categories}
        onClose={() => setProdutoAberto(null)}
        onChanged={invalidarProdutos}
      />

      <CategoryDetailSheet
        categoryId={categoriaAberta?.id ?? null}
        categoryName={categoriaAberta?.name ?? null}
        categoryColor={categoriaAberta?.color ?? null}
        sellerId={seller?.id ?? null}
        marketplace={lojaTravada}
        dateFrom={dateFrom}
        dateTo={dateTo}
        onClose={() => setCategoriaAberta(null)}
        // Uma gaveta por vez. O `p.name` do ranking da categoria pode ser o
        // apelido: entra só como rótulo, a gaveta grava com o nome da RPC.
        onSelectProduct={(p) => {
          setCategoriaAberta(null);
          abrirProduto(p.key, "", p.name);
        }}
      />
    </>
  );
}
