import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Award, CheckCircle, MoreHorizontal, Package, Plus, Pencil, Trash2, Tags } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Bloco, Secao } from "@/components/mobile/blocos";
import { tamanhoComum } from "@/components/mobile/tamanhoDoValor";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { fmtCurrency, CATEGORY_COLORS } from "../shared/produtosUtils";
import { SectionIcon } from "../shared/SectionIcon";
import { CategoriasKPIs } from "./CategoriasKPIs";
import { CategoriasTabSkeleton, ProdutosMobileSkeleton } from "./ProdutosTabSkeletons";
import { cn } from "@/lib/utils";
import type { ProductCategory, ProductStats } from "@/hooks/useProductStats";

interface CategoriasTabProps {
  loading: boolean;
  categories: ProductCategory[];
  filteredStats: ProductStats[];
  onCreateCategory: (name: string, color: string) => Promise<void>;
  onUpdateCategory: (id: string, name: string) => Promise<void>;
  onDeleteCategory: (id: string) => Promise<void>;
  onSelectCategoryFromList: (categoryId: string) => void;
  onOpenCategoryDetail: (category: ProductCategory) => void;
  /** Desenho do celular (só `/produtos` liga). */
  mobile?: boolean;
}

interface CategoryStats {
  id: string;
  product_count: number;
  total_orders: number;
  total_revenue: number;
}

/** Palavras que abrem título de anúncio sem dizer nada sobre o produto. */
const STOPWORDS = new Set(["para", "com", "sem", "novo", "nova", "promocao", "promoção", "frete", "envio"]);

export function CategoriasTab({
  loading, categories, filteredStats,
  onCreateCategory, onUpdateCategory, onDeleteCategory, onSelectCategoryFromList, onOpenCategoryDetail,
  mobile = false,
}: CategoriasTabProps) {
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [newCatColor, setNewCatColor] = useState(CATEGORY_COLORS[6]);
  const [editingCat, setEditingCat] = useState<string | null>(null);
  const [editCatName, setEditCatName] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; name: string } | null>(null);

  const openNewCategory = () => {
    setNewCatName("");
    setNewCatColor(CATEGORY_COLORS[6]);
    setShowNewCategory(true);
  };

  const closeNewCategory = () => setShowNewCategory(false);

  // O card fica ABERTO depois de criar (só limpa o nome): criar categoria é
  // trabalho em série — quem está aproveitando as sugestões cria 3 ou 4
  // seguidas. Fecha no "Cancelar".
  const handleCreate = async () => {
    if (!newCatName.trim()) return;
    await onCreateCategory(newCatName, newCatColor);
    setNewCatName("");
  };

  const categoryStats = useMemo(() => {
    const map: Record<string, CategoryStats> = {};
    filteredStats.forEach((p) => {
      const key = p.category_id ?? "__none__";
      if (!map[key]) map[key] = { id: key, product_count: 0, total_orders: 0, total_revenue: 0 };
      map[key].product_count++;
      map[key].total_orders += p.total_orders;
      map[key].total_revenue += p.total_revenue;
    });
    return map;
  }, [filteredStats]);

  /**
   * Sugestões tiradas do catálogo DESTE vendedor (a primeira palavra dos
   * títulos, por frequência), e não de um dicionário fixo: um seller vende
   * tinta e rastreador, outro vende caixa de papelão — nenhuma lista chutada
   * acerta os dois.
   *
   * Some da lista o que já virou categoria, em vez de a fileira inteira sumir
   * na primeira criação: quem queria aproveitar 3 ou 4 sugestões perdia as
   * outras no primeiro clique.
   */
  const suggestions = useMemo(() => {
    const jaExiste = new Set(categories.map((c) => c.name.trim().toLowerCase()));
    const freq: Record<string, number> = {};
    filteredStats.forEach((p) => {
      const first = p.name.trim().split(/\s+/)[0]?.toLowerCase().replace(/[^\p{L}]/gu, "") ?? "";
      if (first.length < 3 || STOPWORDS.has(first) || jaExiste.has(first)) return;
      freq[first] = (freq[first] ?? 0) + 1;
    });
    return Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 7)
      .map(([w]) => w.charAt(0).toUpperCase() + w.slice(1));
  }, [filteredStats, categories]);

  // Esqueleto da ABA inteira, sempre depois dos hooks acima. Sem isto a faixa
  // do card real mostrava "Categorias (0)" enquanto as categorias carregavam —
  // e "0" aqui é a mesma frase de "você não criou nenhuma".
  const novaCategoria = (
    !showNewCategory ? (
        <Button
          variant="outline"
          onClick={openNewCategory}
          className="w-full h-12 rounded-xl border-dashed text-foreground"
        >
          <Plus className="w-4 h-4 mr-2" /> Adicionar nova categoria
        </Button>
      ) : (
        <Card className="hover:shadow-hover transition-shadow">
          <CardHeader>
            <div className="flex items-center gap-3">
              <SectionIcon icon={Plus} color="primary" />
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-semibold">Nova categoria</h3>
                <p className="text-xs text-muted-foreground">Crie uma classificação para seus produtos</p>
              </div>
              <Button variant="ghost" size="sm" onClick={closeNewCategory} className="rounded-lg">
                Cancelar
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {suggestions.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground mb-2">
                  Sugestões a partir dos seus produtos — clique para preencher:
                </p>
                <div className="flex flex-wrap gap-2">
                  {suggestions.map((name, i) => (
                    <button
                      key={name}
                      type="button"
                      // preenche o formulário, não cria: criar no clique deixava
                      // o card aberto e vazio e a fileira sumia no mesmo
                      // instante — parecia que o clique não tinha pegado.
                      onClick={() => {
                        setNewCatName(name);
                        setNewCatColor(CATEGORY_COLORS[i % CATEGORY_COLORS.length]);
                      }}
                      className={cn(
                        "px-3 py-1 rounded-full text-xs transition-colors",
                        newCatName === name
                          ? "bg-primary/10 text-primary"
                          : "bg-muted hover:bg-muted/70 text-foreground"
                      )}
                    >
                      {name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div>
              <p className="text-xs text-muted-foreground mb-2">Cor</p>
              <div className="grid grid-cols-6 sm:grid-cols-12 gap-2">
                {CATEGORY_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setNewCatColor(color)}
                    className={cn(
                      "w-8 h-8 rounded-full transition-transform hover:scale-110",
                      newCatColor === color && "ring-2 ring-primary ring-offset-2 ring-offset-card"
                    )}
                    style={{ background: color }}
                    aria-label={`Selecionar cor ${color}`}
                  />
                ))}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Input
                placeholder="Nome da categoria"
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                onKeyDown={async (e) => { if (e.key === "Enter") { await handleCreate(); } }}
                className="flex-1 h-10 rounded-xl"
                autoFocus
              />
              <Button
                onClick={handleCreate}
                disabled={!newCatName.trim()}
                className="rounded-xl h-10"
              >
                <Plus className="w-4 h-4 mr-1" /> Criar
              </Button>
            </div>
          </CardContent>
        </Card>
      )
  );

  const confirmacao = (
      <AlertDialog open={!!confirmDelete} onOpenChange={(open) => { if (!open) setConfirmDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir categoria "{confirmDelete?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza? Os produtos vinculados ficarão sem categoria.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (confirmDelete) await onDeleteCategory(confirmDelete.id);
                setConfirmDelete(null);
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
  );

  if (loading) return mobile ? <ProdutosMobileSkeleton /> : <CategoriasTabSkeleton />;

  if (mobile) {
    // Mesmas contas do CategoriasKPIs, nos blocos do celular.
    const total = filteredStats.length;
    const categorizados = filteredStats.filter((p) => p.category_id).length;
    const pctCat = total > 0 ? Math.round((categorizados / total) * 100) : 0;
    const top = categories
      .filter((c) => categoryStats[c.id])
      .map((c) => ({ nome: c.name, receita: categoryStats[c.id].total_revenue }))
      .sort((a, b) => b.receita - a.receita)[0];
    const vazias = categories.filter((c) => !categoryStats[c.id]).length;

    return (
      <div className="flex flex-col gap-7">
        <div className="grid grid-cols-2 gap-2">
          <Bloco
            tamanho={tamanhoComum(categories.length.toLocaleString("pt-BR"), `${pctCat}%`)}
            icone={Tags}
            rotulo="Categorias"
            valor={categories.length.toLocaleString("pt-BR")}
            apoio={
              categories.length === 0
                ? "crie a primeira"
                : vazias > 0
                  ? `${vazias} sem ${vazias === 1 ? "item" : "itens"}`
                  : "todas com itens"
            }
          />
          <Bloco
            tamanho={tamanhoComum(categories.length.toLocaleString("pt-BR"), `${pctCat}%`)}
            icone={CheckCircle}
            rotulo="Categorizados"
            valor={`${pctCat}%`}
            apoio={total > 0 ? `${categorizados} de ${total} produtos` : "catálogo vazio"}
          />
          {/* Nome de categoria é texto, não número: na horizontal ele cabe sem cortar. */}
          <div className="col-span-2 flex items-center gap-3 rounded-2xl border border-border/60 bg-card p-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Award className="h-4 w-4" strokeWidth={2} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[12px] font-medium text-muted-foreground">Top em receita</p>
              <p className="truncate text-[17px] font-bold leading-tight text-foreground">{top?.nome ?? "—"}</p>
            </div>
            {top && (
              <p className="shrink-0 text-[15px] font-semibold tabular-nums text-foreground">{fmtCurrency(top.receita)}</p>
            )}
          </div>
        </div>

        {novaCategoria}

        <Secao titulo={`Categorias (${categories.length})`}>
          {categories.length === 0 ? (
            <li className="px-4 py-8 text-center text-sm text-muted-foreground">Nenhuma categoria criada ainda.</li>
          ) : (
            categories.map((c) => {
              const stat = categoryStats[c.id];
              const isEditing = editingCat === c.id;
              const saveEdit = async () => {
                await onUpdateCategory(c.id, editCatName);
                setEditingCat(null);
              };
              return (
                <li key={c.id}>
                  {isEditing ? (
                    <div className="flex items-center gap-3 px-4 py-3">
                      <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: c.color }} />
                      <Input
                        value={editCatName}
                        onChange={(e) => setEditCatName(e.target.value)}
                        className="h-10 flex-1 rounded-xl text-[15px]"
                        autoFocus
                        onBlur={saveEdit}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveEdit();
                          if (e.key === "Escape") setEditingCat(null);
                        }}
                      />
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 pr-2">
                      <button
                        type="button"
                        onClick={() => onOpenCategoryDetail(c)}
                        className="flex min-w-0 flex-1 items-center gap-3 py-3 pl-4 text-left transition-colors active:bg-muted"
                      >
                        <span
                          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
                          style={{ backgroundColor: `${c.color}1f` }}
                        >
                          <span className="h-3 w-3 rounded-full" style={{ backgroundColor: c.color }} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[15px] font-medium text-foreground">{c.name}</span>
                          {/* produtos = catálogo; pedidos e receita = período */}
                          <span className="block truncate text-[13px] text-muted-foreground">
                            {stat ? `${stat.product_count} ${stat.product_count === 1 ? "produto" : "produtos"}` : "0 produtos"}
                          </span>
                        </span>
                        {stat && (
                          <span className="flex shrink-0 flex-col items-end">
                            <span className="text-[15px] font-semibold tabular-nums text-foreground">
                              {fmtCurrency(stat.total_revenue)}
                            </span>
                            <span className="text-[12px] tabular-nums text-muted-foreground">
                              {stat.total_orders.toLocaleString("pt-BR")} {stat.total_orders === 1 ? "pedido" : "pedidos"}
                            </span>
                          </span>
                        )}
                      </button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-10 w-9 shrink-0 text-muted-foreground" aria-label={`Ações de ${c.name}`}>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => onSelectCategoryFromList(c.id)}>
                            <Package className="mr-2 h-3.5 w-3.5" /> Ver itens
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => { setEditingCat(c.id); setEditCatName(c.name); }}>
                            <Pencil className="mr-2 h-3.5 w-3.5" /> Renomear
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => setConfirmDelete({ id: c.id, name: c.name })}
                          >
                            <Trash2 className="mr-2 h-3.5 w-3.5" /> Excluir
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  )}
                </li>
              );
            })
          )}
        </Secao>

        {confirmacao}
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-6">
      <CategoriasKPIs stats={filteredStats} categories={categories} />

      {/* Nova Categoria */}
      {novaCategoria}

      {/* Lista */}
      <Card className="hover:shadow-hover transition-shadow overflow-hidden">
        <header className="flex items-center justify-between gap-3 border-b border-border/70 bg-[hsl(0_0%_95.88%_/_40%)] dark:bg-muted/40 px-5 py-3.5">
          <div className="flex min-w-0 items-center gap-2.5">
            <SectionIcon icon={Tags} color="violet" size="sm" />
            <div className="min-w-0">
              <h3 className="text-sm font-semibold leading-tight text-foreground">Categorias ({categories.length})</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">Clique numa categoria para ver os detalhes</p>
            </div>
          </div>
        </header>
        <CardContent className="pt-5">
          {categories.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              Nenhuma categoria criada ainda.
            </div>
          ) : (
            <div className="space-y-2">
              {categories.map((c) => {
                const stat = categoryStats[c.id];
                const isEditing = editingCat === c.id;
                const saveEdit = async () => {
                  await onUpdateCategory(c.id, editCatName);
                  setEditingCat(null);
                };

                return (
                  <div
                    key={c.id}
                    className={cn(
                      "group flex items-center gap-3 p-4 rounded-xl bg-muted/30 hover:bg-muted/50 transition-colors",
                      !isEditing && "cursor-pointer"
                    )}
                    onClick={(e) => {
                      if (isEditing) return;
                      // clique vindo dos botões de ação não abre o detalhe
                      if ((e.target as HTMLElement).closest("[data-cat-action]")) return;
                      onOpenCategoryDetail(c);
                    }}
                  >
                    <div className="w-3 h-3 rounded-full shrink-0" style={{ background: c.color }} />
                    {isEditing ? (
                      <Input
                        value={editCatName}
                        onChange={(e) => setEditCatName(e.target.value)}
                        className="flex-1 h-8 text-sm rounded-lg"
                        autoFocus
                        onBlur={saveEdit}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveEdit();
                          if (e.key === "Escape") setEditingCat(null);
                        }}
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <>
                        <span className="flex-1 text-sm font-medium text-foreground">{c.name}</span>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground tabular-nums">
                          {/* produtos = catálogo (mesmo número do cabeçalho da
                              gaveta); pedidos e receita = período */}
                          {stat ? (
                            <>
                              <span>{stat.product_count} produtos</span>
                              <span>·</span>
                              <span>{stat.total_orders} pedidos no período</span>
                              <span>·</span>
                              <span>{fmtCurrency(stat.total_revenue)}</span>
                            </>
                          ) : (
                            <span>0 produtos</span>
                          )}
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity" data-cat-action>
                          <button
                            onClick={(e) => { e.stopPropagation(); onSelectCategoryFromList(c.id); }}
                            className="text-muted-foreground hover:text-foreground transition-colors px-1.5 py-1 text-[11px] font-medium rounded"
                          >
                            Ver itens
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); setEditingCat(c.id); setEditCatName(c.name); }}
                            className="text-muted-foreground hover:text-foreground transition-colors p-1"
                            aria-label={`Renomear ${c.name}`}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); setConfirmDelete({ id: c.id, name: c.name }); }}
                            className="text-muted-foreground hover:text-destructive transition-colors p-1"
                            aria-label={`Excluir ${c.name}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {confirmacao}
    </div>
  );
}
