import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup,
  DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Check, Package, Pencil, Eye, MoreHorizontal, Power,
  ChevronUp, ChevronDown, ChevronsUpDown, ChevronLeft, ChevronRight, X,
} from "lucide-react";
import { fmtCurrency, productLabel } from "../shared/produtosUtils";
import { SectionIcon, StatusBadge, daysSinceLastSale, getProductStatus } from "../shared/SectionIcon";
import { ItensKPIs } from "./ItensKPIs";
import { ItensTabSkeleton, ProdutosMobileSkeleton } from "./ProdutosTabSkeletons";
import { Distribuicao, PILULA_FILTRO, Secao } from "@/components/mobile/blocos";
import { cn } from "@/lib/utils";
import type { ProductCategory, ProductStats } from "@/hooks/useProductStats";

const ITEMS_PAGE_SIZE = 50;

type SortField = "item" | "categoria" | "status" | "pedidos" | "receita" | "ultima";
type SortDir = "asc" | "desc";

interface ItensTabProps {
  loading: boolean;
  filteredStats: ProductStats[];
  categories: ProductCategory[];
  sortField: SortField;
  sortDir: SortDir;
  onSortChange: (field: SortField, dir: SortDir) => void;
  /** `productName` é a grafia CRUA (identidade); `displayName` é só rótulo. */
  onSelectProduct: (productKey: string, productName: string, displayName: string | null) => void;
  onAssignCategory: (product: ProductStats, categoryId: string) => Promise<void>;
  onAssignCategoryBulk: (products: ProductStats[], categoryId: string) => Promise<void>;
  onSaveProductEdit: (product: ProductStats, displayName: string, sku: string) => Promise<void>;
  onToggleProductActive: (product: ProductStats) => Promise<void>;
  /** Desenho do celular (só `/produtos` liga). */
  mobile?: boolean;
}

/** Ordenações do celular: um gatilho só, no lugar dos cabeçalhos clicáveis da tabela. */
const ORDENS_MOBILE: { value: string; label: string }[] = [
  { value: "pedidos:desc", label: "Mais pedidos" },
  { value: "receita:desc", label: "Maior receita" },
  { value: "ultima:desc", label: "Venda mais recente" },
  { value: "item:asc", label: "Nome (A–Z)" },
  { value: "status:asc", label: "Status" },
];

const STATUS_RANK = { vendendo: 0, novo: 1, parado: 2, inativo: 3, desativado: 4 } as const;

function SortHeader({
  field, label, align = "left", sortField, sortDir, onChange,
}: {
  field: SortField; label: string; align?: "left" | "right" | "center";
  sortField: SortField; sortDir: SortDir; onChange: (f: SortField, d: SortDir) => void;
}) {
  const active = sortField === field;
  const Icon = active ? (sortDir === "asc" ? ChevronUp : ChevronDown) : ChevronsUpDown;
  return (
    <button
      onClick={() => {
        if (active) onChange(field, sortDir === "asc" ? "desc" : "asc");
        else onChange(field, field === "item" || field === "categoria" || field === "status" ? "asc" : "desc");
      }}
      className={`inline-flex items-center gap-1 hover:text-foreground transition-colors ${
        align === "right" ? "justify-end w-full" : align === "center" ? "justify-center w-full" : ""
      } ${active ? "text-foreground" : ""}`}
    >
      {label}
      <Icon className="w-3.5 h-3.5 opacity-60" />
    </button>
  );
}

export function ItensTab({
  loading, filteredStats, categories,
  sortField, sortDir, onSortChange,
  onSelectProduct, onAssignCategory, onAssignCategoryBulk,
  onSaveProductEdit, onToggleProductActive,
  mobile = false,
}: ItensTabProps) {
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editDisplayName, setEditDisplayName] = useState("");
  const [editProductSku, setEditProductSku] = useState("");

  // A seleção guarda a CHAVE do produto (nunca um uuid): a linha em `products`
  // pode nem existir ainda quando o vendedor categoriza pela primeira vez.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkCategory, setBulkCategory] = useState<string>("__none__");
  const [applyingBulk, setApplyingBulk] = useState(false);
  const [page, setPage] = useState(0);
  // Celular: a seleção em massa é um modo (não há hover para revelar as caixas)
  // e a edição de apelido/SKU abre numa janela, não na linha.
  const [selecionando, setSelecionando] = useState(false);
  const [editandoMobile, setEditandoMobile] = useState<ProductStats | null>(null);

  const sortedStats = useMemo(() => {
    const arr = [...filteredStats];
    const dir = sortDir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      switch (sortField) {
        case "item":
          return productLabel(a).localeCompare(productLabel(b), "pt-BR") * dir;
        case "categoria":
          return (a.category_name ?? "Sem categoria").localeCompare(b.category_name ?? "Sem categoria", "pt-BR") * dir;
        case "status": {
          const sa = STATUS_RANK[getProductStatus(a).variant];
          const sb = STATUS_RANK[getProductStatus(b).variant];
          return (sa - sb) * dir;
        }
        case "pedidos":
          return (a.total_orders - b.total_orders) * dir;
        case "receita":
          return (a.total_revenue - b.total_revenue) * dir;
        case "ultima": {
          const ta = a.last_order_at ? new Date(a.last_order_at).getTime() : 0;
          const tb = b.last_order_at ? new Date(b.last_order_at).getTime() : 0;
          return (ta - tb) * dir;
        }
      }
    });
    return arr;
  }, [filteredStats, sortField, sortDir]);

  useEffect(() => { setPage(0); }, [sortField, sortDir, filteredStats.length]);

  // Filtro mudou: some da seleção quem não está mais na lista.
  useEffect(() => {
    setSelected((prev) => {
      const visible = new Set(filteredStats.map((p) => p.key));
      const next = new Set<string>();
      prev.forEach((k) => { if (visible.has(k)) next.add(k); });
      return next;
    });
  }, [filteredStats]);

  const totalPages = Math.max(1, Math.ceil(sortedStats.length / ITEMS_PAGE_SIZE));
  const pagedStats = useMemo(
    () => sortedStats.slice(page * ITEMS_PAGE_SIZE, (page + 1) * ITEMS_PAGE_SIZE),
    [sortedStats, page]
  );

  const allFilteredSelected = filteredStats.length > 0 && selected.size === filteredStats.length;

  function toggleAll() {
    if (allFilteredSelected) setSelected(new Set());
    else setSelected(new Set(filteredStats.map((p) => p.key)));
  }
  function toggleOne(key: string, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(key); else next.delete(key);
      return next;
    });
  }

  async function applyBulk() {
    if (selected.size === 0) return;
    setApplyingBulk(true);
    try {
      await onAssignCategoryBulk(filteredStats.filter((p) => selected.has(p.key)), bulkCategory);
      setSelected(new Set());
    } finally {
      setApplyingBulk(false);
    }
  }

  // Esqueleto da ABA inteira (depois de todos os hooks, para não mudar a ordem
  // deles): com o esqueleto só dentro do card, a faixa do topo já anunciava
  // "0 produtos no catálogo" antes de a RPC responder.
  if (loading) return mobile ? <ProdutosMobileSkeleton blocos={0} /> : <ItensTabSkeleton />;

  if (mobile) {
    // Mesma classificação do ItensKPIs (última venda REAL, sem o recorte do filtro).
    let vendendo = 0, novo = 0, parado = 0, inativo = 0, desativado = 0;
    filteredStats.forEach((p) => {
      const v = getProductStatus(p).variant;
      if (v === "desativado") { desativado++; return; }
      if (v === "vendendo") vendendo++;
      else if (v === "novo") novo++;
      const d = daysSinceLastSale(p);
      if (d >= 7 && d < 30) parado++;
      else if (d >= 30) inativo++;
    });
    const catalogo = filteredStats.length;
    const pctCat = (n: number) => (catalogo > 0 ? `${Math.round((n / catalogo) * 100)}%` : "—");
    const ordemAtual = `${sortField}:${sortDir}`;
    const rotuloOrdem = ORDENS_MOBILE.find((o) => o.value === ordemAtual)?.label ?? "Ordenar";
    const inicio = page * ITEMS_PAGE_SIZE;
    const sairDaSelecao = () => { setSelecionando(false); setSelected(new Set()); };

    const salvarEdicaoMobile = async () => {
      if (!editandoMobile) return;
      await onSaveProductEdit(editandoMobile, editDisplayName, editProductSku);
      setEditandoMobile(null);
    };

    return (
      <div className={cn("flex flex-col gap-7", selected.size > 0 && "pb-28")}>
        {/* Situação do catálogo: os três números do ItensKPIs numa faixa só. */}
        <div className="rounded-3xl border border-border/60 bg-card p-4">
          <Distribuicao
            partes={[
              { chave: "vendendo", cor: "#10b981", valor: vendendo + novo },
              { chave: "parado", cor: "#f59e0b", valor: parado },
              { chave: "inativo", cor: "#f43f5e", valor: inativo },
              { chave: "desativado", cor: "#cbd5e1", valor: desativado },
            ]}
          />
          <div className="mt-3 grid grid-cols-3 divide-x divide-border/60">
            {[
              // "Vendendo" soma os novos, como no ItensKPIs, e diz quantos são: sem
              // isso o número não bate com os selos "Vendendo" da lista abaixo.
              {
                rotulo: "Vendendo",
                cor: "#10b981",
                n: vendendo + novo,
                apoio: novo > 0 ? `${pctCat(vendendo + novo)} · inclui ${novo} novo${novo === 1 ? "" : "s"}` : undefined,
              },
              { rotulo: "Parados", cor: "#f59e0b", n: parado, apoio: undefined },
              { rotulo: "Inativos", cor: "#f43f5e", n: inativo, apoio: undefined },
            ].map((s) => (
              <div key={s.rotulo} className="px-3 first:pl-0 last:pr-0">
                <p className="flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: s.cor }} />
                  {s.rotulo}
                </p>
                <p className="mt-0.5 text-[17px] font-bold tabular-nums text-foreground">{s.n.toLocaleString("pt-BR")}</p>
                <p className="text-[12px] tabular-nums leading-snug text-muted-foreground">{s.apoio ?? pctCat(s.n)}</p>
              </div>
            ))}
          </div>
          {desativado > 0 && (
            <p className="mt-3 border-t border-border/60 pt-3 text-[12px] text-muted-foreground">
              {desativado} desativado{desativado === 1 ? "" : "s"} à mão, fora destas contas
            </p>
          )}
        </div>

        <Secao
          titulo="Itens"
          direita={
            catalogo > 0 ? (
              <div className="flex items-center gap-2">
                <Select
                  value={ORDENS_MOBILE.some((o) => o.value === ordemAtual) ? ordemAtual : undefined}
                  onValueChange={(v) => {
                    const [field, dir] = v.split(":") as [SortField, SortDir];
                    onSortChange(field, dir);
                  }}
                >
                  <SelectTrigger aria-label="Ordenar" className={PILULA_FILTRO}>
                    <span>{rotuloOrdem}</span>
                  </SelectTrigger>
                  <SelectContent align="end">
                    {ORDENS_MOBILE.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <button
                  type="button"
                  onClick={() => (selecionando ? sairDaSelecao() : setSelecionando(true))}
                  aria-pressed={selecionando}
                  className={cn(
                    "h-9 shrink-0 rounded-full px-3.5 text-[13px] font-semibold transition-colors",
                    selecionando ? "bg-primary/10 text-primary" : "border border-border/60 bg-card text-foreground active:bg-muted",
                  )}
                >
                  {selecionando ? "Cancelar" : "Selecionar"}
                </button>
              </div>
            ) : undefined
          }
          rodape={
            totalPages > 1 ? (
              <div className="flex items-center justify-between">
                <span className="tabular-nums">
                  {inicio + 1}–{Math.min(inicio + ITEMS_PAGE_SIZE, sortedStats.length)} de {sortedStats.length}
                </span>
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="icon" className="h-8 w-8 rounded-full" aria-label="Página anterior"
                    disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="icon" className="h-8 w-8 rounded-full" aria-label="Próxima página"
                    disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ) : catalogo > 0 ? (
              "Os itens são extraídos dos pedidos recebidos."
            ) : undefined
          }
        >
          {catalogo === 0 ? (
            <li className="px-4 py-8 text-center">
              <Package className="mx-auto mb-2 h-9 w-9 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">Nenhum produto ainda.</p>
              <p className="mt-1 text-xs text-muted-foreground">Os itens são extraídos automaticamente dos pedidos recebidos.</p>
            </li>
          ) : (
            <>
              {selecionando && (
                <li>
                  <label className="flex items-center gap-3 px-4 py-3 text-[14px] font-medium text-foreground">
                    <Checkbox checked={allFilteredSelected} onCheckedChange={toggleAll} aria-label="Selecionar todos" />
                    Selecionar todos ({catalogo.toLocaleString("pt-BR")})
                  </label>
                </li>
              )}
              {pagedStats.map((p) => {
                const status = getProductStatus(p);
                const marcado = selected.has(p.key);
                const label = productLabel(p);
                const cor = p.category_color ?? "#94a3b8";
                return (
                  <li key={p.key} className={cn(!p.active && "opacity-60", marcado && "bg-primary/5")}>
                    <div className="flex items-center gap-1 pr-2">
                      <button
                        type="button"
                        onClick={() => (selecionando ? toggleOne(p.key, !marcado) : onSelectProduct(p.key, p.name, p.display_name))}
                        // Selecionando, a própria linha é a caixa de seleção: um
                        // <Checkbox> (que já é um botão) dentro deste botão seria
                        // botão dentro de botão e esconderia o estado do leitor de tela.
                        role={selecionando ? "checkbox" : undefined}
                        aria-checked={selecionando ? marcado : undefined}
                        className="flex min-w-0 flex-1 items-center gap-3 py-3 pl-4 text-left transition-colors active:bg-muted"
                      >
                        {selecionando ? (
                          <span
                            aria-hidden
                            className={cn(
                              "flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border border-primary",
                              marcado && "bg-primary text-primary-foreground",
                            )}
                          >
                            {marcado && <Check className="h-4 w-4" />}
                          </span>
                        ) : (
                          <span
                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
                            style={{ backgroundColor: `${cor}1f`, color: cor }}
                          >
                            <Package className="h-[18px] w-[18px]" strokeWidth={2} />
                          </span>
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[15px] font-medium text-foreground">{label}</span>
                          <span className="mt-0.5 flex min-w-0 items-center gap-1.5">
                            <StatusBadge variant={status.variant}>{status.label}</StatusBadge>
                            <span className="truncate text-[13px] text-muted-foreground">
                              {[p.category_name ?? "Sem categoria", p.sku].filter(Boolean).join(" · ")}
                            </span>
                          </span>
                        </span>
                        <span className="flex shrink-0 flex-col items-end">
                          <span className="text-[15px] font-semibold tabular-nums text-foreground">
                            {p.total_orders.toLocaleString("pt-BR")}
                          </span>
                          <span className="text-[12px] text-muted-foreground">{p.total_orders === 1 ? "pedido" : "pedidos"}</span>
                        </span>
                      </button>
                      {!selecionando && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-10 w-9 shrink-0 text-muted-foreground" aria-label={`Ações de ${label}`}>
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="max-h-[60vh] w-56 overflow-y-auto">
                            <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">Categoria</DropdownMenuLabel>
                            <DropdownMenuRadioGroup
                              value={p.category_id ?? "__none__"}
                              onValueChange={(val) => onAssignCategory(p, val)}
                            >
                              <DropdownMenuRadioItem value="__none__">Sem categoria</DropdownMenuRadioItem>
                              {categories.map((c) => (
                                <DropdownMenuRadioItem key={c.id} value={c.id}>
                                  <span className="mr-2 h-2 w-2 shrink-0 rounded-full" style={{ background: c.color }} />
                                  {c.name}
                                </DropdownMenuRadioItem>
                              ))}
                            </DropdownMenuRadioGroup>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => {
                                setEditDisplayName(p.display_name ?? "");
                                // só a ANOTAÇÃO entra no campo (ver o startEdit da tabela)
                                setEditProductSku(p.sku_annotated ?? "");
                                setEditandoMobile(p);
                              }}
                            >
                              <Pencil className="mr-2 h-3.5 w-3.5" /> Editar nome e SKU
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => onToggleProductActive(p)}>
                              <Power className="mr-2 h-3.5 w-3.5" />
                              {p.active ? "Desativar" : "Reativar"}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  </li>
                );
              })}
            </>
          )}
        </Secao>

        {/* Ação em massa, acima da barra de navegação flutuante. */}
        {selected.size > 0 && (
          <div className="fixed inset-x-4 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-40 flex flex-col gap-2 rounded-2xl border border-border/60 bg-card p-3 shadow-lg">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[14px] font-semibold tabular-nums text-foreground">
                {selected.size} {selected.size === 1 ? "produto selecionado" : "produtos selecionados"}
              </span>
              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={sairDaSelecao} aria-label="Cancelar seleção">
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Select value={bulkCategory} onValueChange={setBulkCategory}>
                <SelectTrigger aria-label="Categoria" className="h-10 flex-1 rounded-full focus:ring-0 focus:ring-offset-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
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
              <Button
                onClick={async () => { await applyBulk(); setSelecionando(false); }}
                disabled={applyingBulk}
                className="h-10 rounded-full px-5"
              >
                {applyingBulk ? "Aplicando…" : "Aplicar"}
              </Button>
            </div>
          </div>
        )}

        <Dialog open={!!editandoMobile} onOpenChange={(o) => { if (!o) setEditandoMobile(null); }}>
          <DialogContent className="max-w-[calc(100vw-2rem)] rounded-3xl">
            <DialogHeader>
              <DialogTitle>Editar produto</DialogTitle>
              <DialogDescription className="break-words">
                O título do anúncio continua ligando o produto aos pedidos: {editandoMobile?.name}
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-3">
              <label className="flex flex-col gap-1.5 text-[13px] font-medium text-foreground">
                Nome na tela
                <Input
                  value={editDisplayName}
                  onChange={(e) => setEditDisplayName(e.target.value)}
                  placeholder={editandoMobile?.name}
                  className="h-11 rounded-xl text-[15px]"
                />
              </label>
              <label className="flex flex-col gap-1.5 text-[13px] font-medium text-foreground">
                SKU
                <Input
                  value={editProductSku}
                  onChange={(e) => setEditProductSku(e.target.value)}
                  // campo vazio + placeholder = o SKU que está na tela vem do pedido
                  placeholder={editandoMobile?.sku ?? "SKU"}
                  className="h-11 rounded-xl text-[15px]"
                />
              </label>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" className="rounded-full" onClick={() => setEditandoMobile(null)}>Cancelar</Button>
              <Button className="rounded-full" onClick={salvarEdicaoMobile}>Salvar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-6">
      <ItensKPIs stats={filteredStats} />
      <Card className="hover:shadow-hover transition-shadow overflow-hidden">
        <header className="flex items-center justify-between gap-3 border-b border-border/70 bg-[hsl(0_0%_95.88%_/_40%)] px-5 py-3.5">
          <div className="flex min-w-0 items-center gap-2.5">
            <SectionIcon icon={Package} color="primary" size="sm" />
            <div className="min-w-0">
              <h3 className="text-sm font-semibold leading-tight text-foreground">Itens do catálogo</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {filteredStats.length} produto{filteredStats.length === 1 ? "" : "s"} no catálogo
                {" · "}
                {filteredStats.filter((p) => p.total_orders > 0).length} com venda no período
              </p>
            </div>
          </div>
          <p className="shrink-0 text-xs text-muted-foreground text-right max-w-[260px]">
            ℹ️ Os itens são extraídos dos pedidos recebidos
          </p>
        </header>
        <CardContent className="pt-5">
          {filteredStats.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <Package className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Nenhum produto ainda.</p>
              <p className="text-xs mt-1">Os itens são extraídos automaticamente dos pedidos recebidos.</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto rounded-xl">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/30 text-muted-foreground">
                      <th className="py-2.5 px-3 w-10">
                        <div className={selected.size > 0 ? "opacity-100" : "opacity-0 hover:opacity-100 transition-opacity"}>
                          <Checkbox
                            checked={allFilteredSelected}
                            onCheckedChange={toggleAll}
                            aria-label="Selecionar todos"
                          />
                        </div>
                      </th>
                      <th className="text-left py-2.5 px-3 font-medium w-[30%]">
                        <SortHeader field="item" label="Item" sortField={sortField} sortDir={sortDir} onChange={onSortChange} />
                      </th>
                      <th className="text-left py-2.5 px-3 font-medium hidden md:table-cell">SKU</th>
                      <th className="text-left py-2.5 px-3 font-medium">
                        <SortHeader field="categoria" label="Categoria" sortField={sortField} sortDir={sortDir} onChange={onSortChange} />
                      </th>
                      <th className="text-left py-2.5 px-3 font-medium">
                        <SortHeader field="status" label="Status" sortField={sortField} sortDir={sortDir} onChange={onSortChange} />
                      </th>
                      <th className="text-right py-2.5 px-3 font-medium">
                        <SortHeader field="pedidos" label="Pedidos" align="right" sortField={sortField} sortDir={sortDir} onChange={onSortChange} />
                      </th>
                      <th className="text-right py-2.5 px-3 font-medium hidden sm:table-cell">
                        <SortHeader field="receita" label="Receita" align="right" sortField={sortField} sortDir={sortDir} onChange={onSortChange} />
                      </th>
                      <th className="text-right py-2.5 px-3 font-medium hidden lg:table-cell">
                        <SortHeader field="ultima" label="Última venda" align="right" sortField={sortField} sortDir={sortDir} onChange={onSortChange} />
                      </th>
                      <th className="text-center py-2.5 px-3 font-medium w-20">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/30">
                    {pagedStats.map((p) => {
                      const isEditing = editingKey === p.key;
                      const status = getProductStatus(p);
                      const isSelected = selected.has(p.key);
                      const label = productLabel(p);

                      const startEdit = () => {
                        setEditingKey(p.key);
                        setEditDisplayName(p.display_name ?? "");
                        // só a ANOTAÇÃO entra no campo. Pré-preencher com o SKU
                        // derivado dos pedidos fazia editar só o apelido gravar
                        // o SKU junto, como se o vendedor o tivesse digitado.
                        setEditProductSku(p.sku_annotated ?? "");
                      };
                      const saveEdit = async () => {
                        await onSaveProductEdit(p, editDisplayName, editProductSku);
                        setEditingKey(null);
                      };
                      // Apelido e SKU são a MESMA edição, em <td> diferentes da
                      // mesma linha: sair de um para o outro não pode gravar e
                      // fechar, senão o SKU nunca chega a ser digitado.
                      const blurSeSaiuDaLinha = (e: React.FocusEvent<HTMLInputElement>) => {
                        const linha = e.currentTarget.closest("tr");
                        if (linha && e.relatedTarget instanceof Node && linha.contains(e.relatedTarget)) return;
                        saveEdit();
                      };

                      return (
                        <tr key={p.key} className={`group transition-colors hover:bg-accent/30 ${!p.active ? "opacity-60" : ""} ${isSelected ? "bg-primary/5" : ""}`}>
                          <td className="py-4 px-3">
                            <div className={`transition-opacity ${isSelected || selected.size > 0 ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}>
                              <Checkbox
                                checked={isSelected}
                                onCheckedChange={(v) => toggleOne(p.key, !!v)}
                                aria-label={`Selecionar ${label}`}
                              />
                            </div>
                          </td>
                          <td className="py-4 px-3">
                            {isEditing ? (
                              // Edita o APELIDO, não o título do anúncio: o título é a
                              // chave que liga o produto aos próprios pedidos.
                              <Input
                                value={editDisplayName}
                                onChange={(e) => setEditDisplayName(e.target.value)}
                                className="h-7 text-sm w-48"
                                placeholder={p.name}
                                autoFocus
                                onBlur={blurSeSaiuDaLinha}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") saveEdit();
                                  if (e.key === "Escape") setEditingKey(null);
                                }}
                              />
                            ) : (
                              <div className="flex items-start gap-1.5">
                                <div className="min-w-0">
                                  <button
                                    onClick={startEdit}
                                    className="text-left font-medium text-foreground hover:text-primary transition-colors block truncate max-w-[22rem]"
                                    title={p.name}
                                  >
                                    {label}
                                  </button>
                                  {p.display_name && (
                                    <span className="block text-[11px] text-muted-foreground truncate max-w-[22rem]" title={p.name}>
                                      {p.name}
                                    </span>
                                  )}
                                </div>
                                <Pencil
                                  className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-70 transition-opacity cursor-pointer shrink-0 mt-0.5"
                                  onClick={startEdit}
                                />
                              </div>
                            )}
                          </td>

                          <td className="py-4 px-3 hidden md:table-cell">
                            {isEditing ? (
                              <Input
                                value={editProductSku}
                                onChange={(e) => setEditProductSku(e.target.value)}
                                className="h-7 text-sm w-24"
                                // campo vazio + placeholder = "o que está na
                                // tela vem do pedido, não é anotação sua"
                                placeholder={p.sku ?? "SKU"}
                                onBlur={blurSeSaiuDaLinha}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") saveEdit();
                                  if (e.key === "Escape") setEditingKey(null);
                                }}
                              />
                            ) : (
                              <span className="text-muted-foreground text-xs">{p.sku || "—"}</span>
                            )}
                          </td>

                          <td className="py-4 px-3">
                            <Select
                              value={p.category_id ?? "__none__"}
                              onValueChange={(val) => onAssignCategory(p, val)}
                            >
                              <SelectTrigger className="h-7 text-xs w-36 rounded-lg">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">Sem categoria</SelectItem>
                                {categories.map((c) => (
                                  <SelectItem key={c.id} value={c.id}>
                                    <div className="flex items-center gap-2">
                                      <div className="w-2 h-2 rounded-full shrink-0" style={{ background: c.color }} />
                                      {c.name}
                                    </div>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </td>

                          <td className="py-4 px-3">
                            <StatusBadge variant={status.variant}>{status.label}</StatusBadge>
                          </td>

                          <td className="py-4 px-3 text-right font-semibold text-foreground tabular-nums">{p.total_orders}</td>
                          <td className="py-4 px-3 text-right text-muted-foreground hidden sm:table-cell tabular-nums">{fmtCurrency(p.total_revenue)}</td>
                          <td className="py-4 px-3 text-right text-muted-foreground text-xs hidden lg:table-cell tabular-nums">
                            {p.last_order_at ? new Date(p.last_order_at).toLocaleDateString("pt-BR") : "—"}
                          </td>

                          <td className="py-4 px-3 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onSelectProduct(p.key, p.name, p.display_name)} title="Ver detalhes">
                                <Eye className="w-3.5 h-3.5" />
                              </Button>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-7 w-7">
                                    <MoreHorizontal className="w-3.5 h-3.5" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onClick={() => onToggleProductActive(p)}>
                                    <Power className="w-3.5 h-3.5 mr-2" />
                                    {p.active ? "Desativar" : "Reativar"}
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 mt-4">
                  <Button variant="outline" size="icon" className="h-8 w-8 rounded-xl"
                    disabled={page === 0}
                    onClick={() => setPage((p) => p - 1)}>
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <span className="text-xs text-muted-foreground tabular-nums">{page + 1} / {totalPages}</span>
                  <Button variant="outline" size="icon" className="h-8 w-8 rounded-xl"
                    disabled={page >= totalPages - 1}
                    onClick={() => setPage((p) => p + 1)}>
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Barra flutuante de ação em massa */}
      {selected.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 rounded-2xl bg-card border border-border shadow-lg p-4 flex items-center gap-3 min-w-[420px]">
          <span className="text-sm font-medium tabular-nums">
            {selected.size} {selected.size === 1 ? "produto selecionado" : "produtos selecionados"}
          </span>
          <Select value={bulkCategory} onValueChange={setBulkCategory}>
            <SelectTrigger className="h-9 w-[180px] rounded-xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Sem categoria</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ background: c.color }} />
                    {c.name}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={applyBulk} disabled={applyingBulk} className="rounded-xl">
            {applyingBulk ? "Aplicando…" : "Aplicar"}
          </Button>
          <Button variant="ghost" size="icon" onClick={() => setSelected(new Set())} title="Cancelar" className="rounded-xl">
            <X className="w-4 h-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
