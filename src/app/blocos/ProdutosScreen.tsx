import { useCallback, useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { endOfDay, startOfDay, subDays } from "date-fns";
import { AlertTriangle, Package, RotateCw, Search, Store, Tag, WifiOff, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { CabecalhoTela, PILULA_ATIVA, PILULA_FILTRO, Pilulas } from "@/components/mobile/blocos";
import { useAuth } from "@/contexts/AuthContext";
import { useSellerContext } from "@/contexts/SellerContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useMarketplaceAliases } from "@/hooks/useMarketplaceAliases";
import {
  useAvailableMarketplaces,
  useProductCategories,
  useProductStats,
  type ProductCategory,
  type ProductStats,
} from "@/hooks/useProductStats";
import { ProductDetailSheet } from "@/components/produtos/ProductDetailSheet";
import { CategoryDetailSheet } from "@/components/produtos/CategoryDetailSheet";
import { PERIOD_OPTIONS } from "@/components/produtos/shared/produtosUtils";
import { invalidateProdutoQueries } from "@/components/produtos/detail/produtoDetailQueries";
import { AnalyticsTab } from "@/components/produtos/tabs/AnalyticsTab";
import { ItensTab } from "@/components/produtos/tabs/ItensTab";
import { CategoriasTab } from "@/components/produtos/tabs/CategoriasTab";
import { formatMarketplaceName } from "@/utils/formatters";
import { cn } from "@/lib/utils";

/**
 * A tela de Produtos no desenho de celular: o `ProdutosScreen` de
 * src/pages/Produtos.tsx do site, só no caminho de celular, nos dois lugares
 * em que o site o monta:
 *
 * - a rota `/produtos` (tela Produtos, com `tituloMobile`): título, período em
 *   pílulas e filtro de marketplace. O estado (aba, busca, categoria, loja,
 *   ordem e período) mora na URL, como no site;
 * - a aba Produtos do detalhe do marketplace (LojaProdutosTab, com
 *   `embutidaMobile`), travada no marketplace e na janela do cabeçalho dele:
 *   sem título, sem período e sem filtro de loja, com o estado em memória (a
 *   URL é da página do marketplace, dona de `?tab=` e `?periodo=`).
 */

const ABAS = ["analytics", "itens", "categorias"] as const;
type Aba = (typeof ABAS)[number];
const CAMPOS_ORDEM = ["item", "categoria", "status", "pedidos", "receita", "ultima"] as const;
type CampoOrdem = (typeof CAMPOS_ORDEM)[number];
type Direcao = "asc" | "desc";

const OPCOES_ABA: { value: Aba; label: string }[] = [
  { value: "analytics", label: "Visão geral" },
  { value: "itens", label: "Itens" },
  { value: "categorias", label: "Categorias" },
];

/** Filtros cujo "all" quer dizer "sem filtro". A busca não é um deles. */
const FILTROS_SELECT = new Set(["cat", "mkt"]);
const FILTROS_LIMPAVEIS = ["q", "cat", "mkt"] as const;
const PERIODOS_VALIDOS = PERIOD_OPTIONS.map((o) => o.value);
const PERIODO_PADRAO = "30";
/** Os presets do site, com o rótulo curto das pílulas das outras telas. */
const PERIODOS = PERIOD_OPTIONS.map((o) => ({ value: o.value, label: o.value === "365" ? "1 ano" : o.label }));

/** `product_categories` e as RPCs de produto não estão nos tipos gerados do banco. */
const banco = supabase as unknown as SupabaseClient;

/** O pedaço de `URLSearchParams` que a tela usa: o corpo não sabe onde o estado mora. */
interface Rascunho {
  get(chave: string): string | null;
  set(chave: string, valor: string): void;
  delete(chave: string): void;
}

/**
 * O estado da tela na URL ou em memória. Toda escrita é UMA por ação: no
 * react-router 6 o callback de `setSearchParams` recebe os parâmetros do
 * desenho atual, e duas chamadas seguidas partem da mesma base (vence a
 * última). Por isso "Limpar" e "ver os itens desta categoria" mexem em várias
 * chaves num mutador só.
 */
function useEstadoDaTela(naMemoria: boolean) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [local, setLocal] = useState<Record<string, string>>({});

  const ler = useCallback(
    (chave: string) => (naMemoria ? local[chave] ?? null : searchParams.get(chave)),
    [naMemoria, local, searchParams],
  );

  const mudar = useCallback(
    (mutar: (r: Rascunho) => void) => {
      if (naMemoria) {
        setLocal((antes) => {
          const r = { ...antes };
          mutar({
            get: (k) => r[k] ?? null,
            set: (k, v) => {
              r[k] = v;
            },
            delete: (k) => {
              delete r[k];
            },
          });
          return r;
        });
        return;
      }
      // `replace`: o Voltar sai da tela, não desfaz toques de aba e de filtro.
      setSearchParams(
        (antes) => {
          const prox = new URLSearchParams(antes);
          mutar(prox);
          return prox;
        },
        { replace: true },
      );
    },
    [naMemoria, setSearchParams],
  );

  return { ler, mudar };
}

export interface ProdutosScreenProps {
  /** Slug de `orders.marketplace` imposto ao recorte inteiro (não é filtro). */
  lockedMarketplace?: string;
  /** Apelido do marketplace, já resolvido pelo cabeçalho. */
  lockedMarketplaceLabel?: string;
  /** A janela do cabeçalho do marketplace, em ISO. Presente, as pílulas de período somem. */
  lockedRange?: { start: string; end: string };
  /** false enquanto a aba está escondida: nada consulta e a tela mostra esqueleto. */
  active?: boolean;
  /** Título do topo, na rota `/produtos`. */
  tituloMobile?: string;
  /** A versão sem título nem respiro de página, para a aba Produtos do marketplace. */
  embutidaMobile?: boolean;
  /** Rótulos do número grande. Sem eles, saem do período escolhido. */
  rotuloPeriodo?: string;
  rotuloComparacao?: string;
  /** Aceito e ignorado: a chamada em LojaProdutosTab (cópia) segue igual à do site. */
  className?: string;
}

export function ProdutosScreen({
  lockedMarketplace,
  lockedMarketplaceLabel,
  lockedRange,
  active = true,
  tituloMobile,
  embutidaMobile = false,
  rotuloPeriodo,
  rotuloComparacao,
}: ProdutosScreenProps) {
  const { user } = useAuth();
  const { activeSeller: seller } = useSellerContext();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { getDisplayName } = useMarketplaceAliases(seller?.id);

  const lojaTravada = lockedMarketplace?.trim().toLowerCase() || "";
  const { ler, mudar } = useEstadoDaTela(!!lojaTravada);

  // Período e aba passam por lista branca: `?period=abc` viraria data inválida
  // e derrubaria a tela no `toISOString()`.
  const periodoCru = ler("period");
  const periodo = periodoCru && PERIODOS_VALIDOS.includes(periodoCru) ? periodoCru : PERIODO_PADRAO;
  const busca = ler("q") || "";
  const categoria = ler("cat") || "all";
  // A loja travada nunca entra no estado dos filtros: nenhum "Limpar" a desliga.
  const loja = lojaTravada ? "all" : ler("mkt") || "all";
  const marketplaceDoRecorte = lojaTravada || (loja !== "all" ? loja : null);

  const abaCrua = ler("tab");
  const aba: Aba = ABAS.find((a) => a === abaCrua) ?? "analytics";
  const ordemCrua = ler("sort");
  const campoOrdem: CampoOrdem = CAMPOS_ORDEM.find((c) => c === ordemCrua) ?? "pedidos";
  const direcao: Direcao = ler("dir") === "asc" ? "asc" : "desc";

  const setFiltro = useCallback(
    (chave: string, valor: string) => {
      mudar((r) => {
        // "all" só zera os selects: na busca é texto ("all..." apagaria o campo).
        const zera =
          !valor || (FILTROS_SELECT.has(chave) && valor === "all") || (chave === "period" && valor === PERIODO_PADRAO);
        if (zera) r.delete(chave);
        else r.set(chave, valor);
      });
    },
    [mudar],
  );

  const limparFiltros = useCallback(() => {
    mudar((r) => FILTROS_LIMPAVEIS.forEach((k) => r.delete(k)));
  }, [mudar]);

  const setAba = useCallback(
    (a: Aba) => {
      mudar((r) => {
        if (a === "analytics") r.delete("tab");
        else r.set("tab", a);
      });
    },
    [mudar],
  );

  const setOrdem = useCallback(
    (campo: CampoOrdem, dir: Direcao) => {
      mudar((r) => {
        if (campo === "pedidos" && dir === "desc") {
          r.delete("sort");
          r.delete("dir");
        } else {
          r.set("sort", campo);
          r.set("dir", dir);
        }
      });
    },
    [mudar],
  );

  // A chave, a grafia CRUA e o apelido: o cabeçalho da gaveta precisa de um
  // rótulo antes de a RPC voltar. Quem grava usa o `stats.name` da RPC.
  const [produtoAberto, setProdutoAberto] =
    useState<{ key: string; name: string; displayName: string | null } | null>(null);
  const [categoriaAberta, setCategoriaAberta] = useState<ProductCategory | null>(null);

  const abrirProduto = useCallback((key: string, name: string, displayName: string | null = null) => {
    setProdutoAberto({ key, name, displayName });
  }, []);

  // Solta, a janela é de dias cheios (com `now()` os números andariam sozinhos
  // ao longo do dia). Travada, vem pronta do cabeçalho do marketplace, que já
  // resolveu "Tudo". A anterior tem o MESMO tamanho (`from - (to - from)`), a
  // conta das RPCs de pedidos e de marketplaces.
  const diasDoPeriodo = parseInt(periodo, 10);
  const inicioTravado = lockedRange?.start;
  const fimTravado = lockedRange?.end;
  const { dateFrom, dateTo, prevDateFrom } = useMemo(() => {
    const hoje = new Date();
    const from = inicioTravado ? new Date(inicioTravado) : startOfDay(subDays(hoje, diasDoPeriodo));
    const to = fimTravado ? new Date(fimTravado) : endOfDay(hoje);
    return {
      dateFrom: from.toISOString(),
      dateTo: to.toISOString(),
      prevDateFrom: new Date(from.getTime() - (to.getTime() - from.getTime())).toISOString(),
    };
  }, [diasDoPeriodo, inicioTravado, fimTravado]);

  // Aba escondida = seller ausente: as consultas já são `enabled: !!sellerId`.
  const sellerParaConsulta = active ? seller?.id : undefined;

  const categoriasQ = useProductCategories(sellerParaConsulta);
  const categories = categoriasQ.data ?? [];

  // Travada, a lista de lojas não é consultada: a única resposta já é a trava.
  const { data: marketplaces = [] } = useAvailableMarketplaces(lojaTravada ? undefined : sellerParaConsulta);

  const statsQ = useProductStats({
    sellerId: sellerParaConsulta,
    from: dateFrom,
    to: dateTo,
    prevFrom: prevDateFrom,
    marketplace: marketplaceDoRecorte,
  });
  const productStats = useMemo(() => statsQ.data ?? [], [statsQ.data]);

  // `isPending`, não `isLoading`: com a aba escondida a consulta fica desligada
  // e `isLoading` diria "carregou, não há produto" sem ter buscado nada.
  const loading = !user || !seller?.id ? false : statsQ.isPending || categoriasQ.isPending;
  const temErro = !!seller?.id && (statsQ.isError || categoriasQ.isError);
  // Sem internet as consultas ficam em espera (nem dado, nem erro) e voltam
  // sozinhas com a conexão. Dentro do marketplace o aviso é o do cabeçalho.
  const semInternet =
    !lojaTravada &&
    !!seller?.id &&
    ((statsQ.isPending && statsQ.isPaused) || (categoriasQ.isPending && categoriasQ.isPaused));

  const marketplaceLabel = useCallback(
    (mkt: string) => {
      if (lojaTravada && mkt?.trim().toLowerCase() === lojaTravada && lockedMarketplaceLabel?.trim()) {
        return lockedMarketplaceLabel.trim();
      }
      return getDisplayName(mkt) ?? formatMarketplaceName(mkt);
    },
    [getDisplayName, lojaTravada, lockedMarketplaceLabel],
  );

  const lojasDisponiveis = useMemo(
    () =>
      marketplaces
        .map((value) => ({ value, label: marketplaceLabel(value) }))
        .sort((a, b) => a.label.localeCompare(b.label, "pt-BR")),
    [marketplaces, marketplaceLabel],
  );

  // A loja não entra aqui: ela é recorte do servidor, senão um produto vendido
  // em duas lojas mostraria a receita somada das duas.
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

  const irParaItensDaCategoria = useCallback(
    (categoryId: string) => {
      mudar((r) => {
        r.set("tab", "itens");
        r.set("cat", categoryId);
      });
    },
    [mudar],
  );

  const temFiltro = !!busca || categoria !== "all" || loja !== "all";
  const rotuloCategoria =
    categoria === "all"
      ? "Categoria"
      : categoria === "__none__"
        ? "Sem categoria"
        : categories.find((c) => c.id === categoria)?.name ?? "Categoria";
  const rotuloLoja =
    loja === "all" ? "Loja" : lojasDisponiveis.find((m) => m.value === loja)?.label ?? marketplaceLabel(loja);

  let conteudo: ReactNode;
  if (temErro) {
    conteudo = (
      <div className="flex flex-col items-center gap-3 rounded-3xl border border-border/60 bg-card px-6 py-10 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-destructive/10">
          <AlertTriangle className="h-6 w-6 text-destructive" />
        </div>
        <div>
          <p className="font-medium text-foreground">Não foi possível carregar seus produtos</p>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            {(statsQ.error as { message?: string } | null)?.message ?? "Tente novamente em instantes."}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            statsQ.refetch();
            categoriasQ.refetch();
          }}
        >
          <RotateCw className="mr-2 h-4 w-4" /> Tentar novamente
        </Button>
      </div>
    );
  } else if (semInternet) {
    conteudo = (
      <div className="flex flex-col items-center gap-2 rounded-3xl border border-border/60 bg-card px-6 py-8 text-center">
        <WifiOff className="h-6 w-6 text-muted-foreground" />
        <p className="text-sm font-medium text-foreground">Sem internet</p>
        <p className="text-[13px] text-muted-foreground">Os produtos aparecem assim que a conexão voltar.</p>
      </div>
    );
  } else {
    // `buscados` e não `filtrados` nas Categorias: a aba MEDE as categorias, e
    // com uma categoria escolhida ela veria só a dela. O `mt-2` é o do
    // TabsContent em que o site monta cada aba.
    conteudo = (
      <div className="mt-2">
        {aba === "analytics" ? (
          <AnalyticsTab
            loading={loading}
            productStats={productStats}
            filteredStats={filtrados}
            marketplaceLabel={marketplaceLabel}
            onSelectProduct={abrirProduto}
            onCategorizeNow={() => irParaItensDaCategoria("__none__")}
            onSelectCategoryFromRanking={irParaItensDaCategoria}
            mobile
            rotuloPeriodo={rotuloPeriodo ?? `últimos ${periodo} dias`}
            rotuloComparacao={rotuloComparacao ?? `${periodo} dias antes`}
          />
        ) : aba === "itens" ? (
          <ItensTab
            loading={loading}
            filteredStats={filtrados}
            categories={categories}
            sortField={campoOrdem}
            sortDir={direcao}
            onSortChange={setOrdem}
            onSelectProduct={abrirProduto}
            onAssignCategory={categorizar}
            onAssignCategoryBulk={categorizarVarios}
            onSaveProductEdit={salvarProduto}
            onToggleProductActive={alternarAtivo}
            mobile
          />
        ) : (
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
    );
  }

  return (
    <>
      <div className={cn("flex flex-col gap-5", !embutidaMobile && "px-4 pb-6 pt-4")}>
        <div className="flex flex-col gap-3">
          {!embutidaMobile && <CabecalhoTela icone={Package} titulo={tituloMobile ?? "Produtos"} />}
          {!lockedRange && (
            <Pilulas rotulo="Período" opcoes={PERIODOS} valor={periodo} onChange={(v) => setFiltro("period", v)} />
          )}
          <div className={embutidaMobile ? undefined : "-mx-4 border-t border-border/60 px-4 pt-3"}>
            <Pilulas
              rotulo={embutidaMobile ? "Seção de produtos" : "Aba"}
              opcoes={OPCOES_ABA}
              valor={aba}
              onChange={setAba}
            />
          </div>
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={busca}
              onChange={(e) => setFiltro("q", e.target.value)}
              placeholder="Buscar produto ou SKU"
              className="h-11 rounded-full border-border/60 bg-card pl-10 pr-10 text-[15px]"
            />
            {busca && (
              <button
                type="button"
                onClick={() => setFiltro("q", "")}
                aria-label="Limpar busca"
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-muted-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <Select value={categoria} onValueChange={(v) => setFiltro("cat", v)}>
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
            {(lojasDisponiveis.length > 1 || loja !== "all") && (
              <Select value={loja} onValueChange={(v) => setFiltro("mkt", v)}>
                <SelectTrigger aria-label="Marketplace" className={cn(PILULA_FILTRO, loja !== "all" && PILULA_ATIVA)}>
                  <Store className="h-4 w-4 shrink-0 opacity-70" />
                  <span>{rotuloLoja}</span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os marketplaces</SelectItem>
                  {loja !== "all" && !lojasDisponiveis.some((m) => m.value === loja) && (
                    <SelectItem value={loja}>{rotuloLoja}</SelectItem>
                  )}
                  {lojasDisponiveis.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {temFiltro && (
              <button
                type="button"
                onClick={limparFiltros}
                className="h-9 shrink-0 rounded-full px-3 text-[13px] font-semibold text-muted-foreground active:bg-muted"
              >
                Limpar
              </button>
            )}
          </div>
        </div>

        {conteudo}
      </div>

      {/* As gavetas recebem o mesmo marketplace da lista: o detalhe do produto
          não pode abrir com os números de outro recorte. */}
      <ProductDetailSheet
        productKey={produtoAberto?.key ?? null}
        productName={produtoAberto?.name ?? null}
        productDisplayName={produtoAberto?.displayName ?? null}
        sellerId={seller?.id ?? null}
        marketplace={marketplaceDoRecorte}
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
        marketplace={marketplaceDoRecorte}
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
