import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  CheckCircle, ChevronLeft, ChevronRight, Package, ShoppingCart, Tags, TrendingDown, TrendingUp,
} from "lucide-react";
import { fmtCurrency, productLabel } from "../shared/produtosUtils";
import { SectionIcon } from "../shared/SectionIcon";
import { ProductCategorizationBanner } from "../shared/ProductCategorizationBanner";
import { AnalyticsKPIs } from "./AnalyticsKPIs";
import { AnalyticsTabSkeleton, ProdutosMobileSkeleton } from "./ProdutosTabSkeletons";
import {
  Aviso, Bloco, Bolinha, Distribuicao, Linha, Secao, Selo, ValorPartes, pct0, textoPequeno,
} from "@/components/mobile/blocos";
import { tamanhoComum } from "@/components/mobile/tamanhoDoValor";
import { Medalhao } from "@/components/dashboard/shared";
import { cn } from "@/lib/utils";
import type { ProductStats } from "@/hooks/useProductStats";

const PAGE_SIZE = 10;

interface CategoryStats {
  id: string;
  name: string;
  color: string;
  product_count: number;
  total_orders: number;
  total_revenue: number;
}

function TrendBadge({ current, previous }: { current: number; previous: number }) {
  if (previous === 0) return null;
  const pct = ((current - previous) / previous) * 100;
  const isUp = pct >= 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium tabular-nums ${isUp ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
      {isUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
      {Math.abs(pct).toFixed(0)}%
    </span>
  );
}

interface AnalyticsTabProps {
  loading: boolean;
  productStats: ProductStats[];
  filteredStats: ProductStats[];
  /** Apelido da loja para a linha de subtítulo do ranking. */
  marketplaceLabel: (mkt: string) => string;
  /** `productName` é a grafia CRUA (identidade); `displayName` é só rótulo. */
  onSelectProduct: (productKey: string, productName: string, displayName: string | null) => void;
  onCategorizeNow: () => void;
  onSelectCategoryFromRanking: (categoryId: string) => void;
  /** Desenho do celular (só `/produtos` liga). */
  mobile?: boolean;
  /** "últimos 30 dias" — vai no rótulo do número grande do celular. */
  rotuloPeriodo?: string;
  /** "30 dias antes" — com o que a variação do celular compara. */
  rotuloComparacao?: string;
}

export function AnalyticsTab({
  loading, productStats, filteredStats, marketplaceLabel,
  onSelectProduct, onCategorizeNow, onSelectCategoryFromRanking,
  mobile = false, rotuloPeriodo = "", rotuloComparacao = "o período anterior",
}: AnalyticsTabProps) {
  const [rankingPage, setRankingPage] = useState(0);

  // `filteredStats` é o CATÁLOGO inteiro (produto sem venda no período vem com
  // zeros). Ranking é de quem vendeu: uma lista de zeros não ordena nada.
  const vendidos = useMemo(
    () => filteredStats.filter((p) => p.total_orders > 0),
    [filteredStats]
  );

  const totalPages = Math.ceil(vendidos.length / PAGE_SIZE);
  const pagedStats = useMemo(() =>
    vendidos.slice(rankingPage * PAGE_SIZE, (rankingPage + 1) * PAGE_SIZE),
    [vendidos, rankingPage]
  );

  useEffect(() => { setRankingPage(0); }, [vendidos.length]);

  const categoryStats = useMemo(() => {
    const catMap: Record<string, CategoryStats> = {};
    vendidos.forEach((p) => {
      const key = p.category_id ?? "__none__";
      if (!catMap[key]) {
        catMap[key] = {
          id: key,
          name: p.category_name ?? "Sem categoria",
          color: p.category_color ?? "#94a3b8",
          product_count: 0, total_orders: 0, total_revenue: 0,
        };
      }
      catMap[key].product_count++;
      catMap[key].total_orders += p.total_orders;
      catMap[key].total_revenue += p.total_revenue;
    });
    return Object.values(catMap).sort((a, b) => b.total_revenue - a.total_revenue);
  }, [vendidos]);

  const uncategorizedCount = useMemo(
    () => productStats.filter((p) => !p.category_id).length,
    [productStats]
  );

  // O esqueleto é da ABA INTEIRA, e não de cada bloco por dentro: enquanto a RPC
  // não volta, o cabeçalho real do ranking anunciaria "0 com venda no período ·
  // 0 no catálogo" — número inventado, não ausência de número. Fica DEPOIS de
  // todos os hooks acima, senão a ordem deles muda entre um render e outro.
  if (loading) return mobile ? <ProdutosMobileSkeleton /> : <AnalyticsTabSkeleton />;

  if (mobile) {
    // Mesmas somas do AnalyticsKPIs (receita, pedidos e ticket com o período
    // anterior de mesma duração), no desenho do celular.
    const receita = filteredStats.reduce((s, p) => s + p.total_revenue, 0);
    const receitaAntes = filteredStats.reduce((s, p) => s + p.prev_revenue, 0);
    const pedidos = filteredStats.reduce((s, p) => s + p.total_orders, 0);
    const pedidosAntes = filteredStats.reduce((s, p) => s + p.prev_orders, 0);
    const ticket = pedidos > 0 ? receita / pedidos : 0;
    const ticketAntes = pedidosAntes > 0 ? receitaAntes / pedidosAntes : 0;
    const categorizados = filteredStats.filter((p) => p.category_id).length;
    const inicio = rankingPage * PAGE_SIZE;

    return (
      <div className="flex flex-col gap-7">
        <div className="flex flex-col gap-5">
          <section>
            <p className="text-sm font-medium text-muted-foreground">Receita · {rotuloPeriodo}</p>
            <p className="mt-1 text-[38px] font-semibold leading-tight tracking-tight tabular-nums text-foreground">
              <ValorPartes valor={fmtCurrency(receita)} />
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
              {receitaAntes > 0 ? (
                <>
                  <span
                    className={cn(
                      "text-[15px] font-semibold tabular-nums",
                      receita >= receitaAntes ? "text-emerald-600" : "text-rose-600",
                    )}
                  >
                    {receita >= receitaAntes ? "+" : "−"}
                    {fmtCurrency(Math.abs(receita - receitaAntes))}
                  </span>
                  <Selo atual={receita} anterior={receitaAntes} base={fmtCurrency(receitaAntes)} />
                  <span className="text-[13px] text-muted-foreground">vs. {rotuloComparacao}</span>
                </>
              ) : (
                <span className="text-sm text-muted-foreground">Sem base no período anterior</span>
              )}
            </div>
          </section>

          <div className="grid grid-cols-2 gap-2">
            <Bloco
              tamanho={tamanhoComum(pedidos.toLocaleString("pt-BR"), fmtCurrency(ticket))}
              icone={ShoppingCart}
              rotulo="Pedidos"
              valor={pedidos.toLocaleString("pt-BR")}
              selo={<Selo atual={pedidos} anterior={pedidosAntes} base={pedidosAntes.toLocaleString("pt-BR")} />}
            />
            <Bloco
              tamanho={tamanhoComum(pedidos.toLocaleString("pt-BR"), fmtCurrency(ticket))}
              icone={TrendingUp}
              rotulo="Ticket médio"
              valor={fmtCurrency(ticket)}
              selo={<Selo atual={ticket} anterior={ticketAntes} base={fmtCurrency(ticketAntes)} />}
            />
            <Bloco
              tamanho={tamanhoComum(vendidos.length.toLocaleString("pt-BR"), categorizados.toLocaleString("pt-BR"))}
              icone={Package}
              rotulo="Com venda"
              valor={vendidos.length.toLocaleString("pt-BR")}
              apoio={`de ${filteredStats.length.toLocaleString("pt-BR")} no catálogo`}
            />
            <Bloco
              tamanho={tamanhoComum(vendidos.length.toLocaleString("pt-BR"), categorizados.toLocaleString("pt-BR"))}
              icone={CheckCircle}
              rotulo="Categorizados"
              valor={categorizados.toLocaleString("pt-BR")}
              apoio={filteredStats.length > 0 ? `${pct0((categorizados / filteredStats.length) * 100)} do catálogo` : "catálogo vazio"}
            />
          </div>
        </div>

        {uncategorizedCount > 0 && (
          <Aviso
            tom="ambar"
            icone={Tags}
            titulo={`${uncategorizedCount} produto${uncategorizedCount === 1 ? "" : "s"} sem categoria`}
            acao={{ rotulo: "Categorizar", onClick: onCategorizeNow }}
          >
            Selecione vários e atribua de uma vez.
          </Aviso>
        )}

        <Secao
          titulo="Mais vendidos"
          direita={textoPequeno(`${vendidos.length} com venda`)}
          rodape={
            totalPages > 1 ? (
              <div className="flex items-center justify-between">
                <span className="tabular-nums">
                  {inicio + 1}–{Math.min(inicio + PAGE_SIZE, vendidos.length)} de {vendidos.length}
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 rounded-full"
                    aria-label="Página anterior"
                    disabled={rankingPage === 0}
                    onClick={() => setRankingPage((p) => p - 1)}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 rounded-full"
                    aria-label="Próxima página"
                    disabled={rankingPage >= totalPages - 1}
                    onClick={() => setRankingPage((p) => p + 1)}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ) : undefined
          }
        >
          {vendidos.length === 0 ? (
            <li className="px-4 py-6 text-center text-sm text-muted-foreground">
              {filteredStats.length === 0
                ? "Nenhum produto ainda. Eles aparecem aqui assim que chegam pedidos."
                : `Nenhuma venda no período. O catálogo tem ${filteredStats.length} produto${filteredStats.length === 1 ? "" : "s"}.`}
            </li>
          ) : (
            pagedStats.map((p, i) => (
              <Linha
                key={p.key}
                onClick={() => onSelectProduct(p.key, p.name, p.display_name)}
                icone={<Medalhao pos={inicio + i} />}
                titulo={productLabel(p)}
                apoio={`${fmtCurrency(p.total_revenue)} · ${p.category_name ?? "Sem categoria"}`}
                valor={`${p.total_orders.toLocaleString("pt-BR")} ${p.total_orders === 1 ? "pedido" : "pedidos"}`}
                rodape={<Selo atual={p.total_orders} anterior={p.prev_orders} base={p.prev_orders.toLocaleString("pt-BR")} />}
              />
            ))
          )}
        </Secao>

        {categoryStats.length > 0 && (
          <Secao
            titulo="Categorias"
            topo={
              <Distribuicao
                partes={categoryStats.map((c) => ({ chave: c.id, cor: c.color, valor: c.total_revenue }))}
              />
            }
          >
            {categoryStats.map((c) => (
              <Linha
                key={c.id}
                onClick={() => onSelectCategoryFromRanking(c.id)}
                icone={
                  <Bolinha fundo={`${c.color}1f`}>
                    <span className="h-3 w-3 rounded-full" style={{ backgroundColor: c.color }} />
                  </Bolinha>
                }
                titulo={c.name}
                apoio={`${c.product_count} ${c.product_count === 1 ? "item" : "itens"} · ${c.total_orders.toLocaleString("pt-BR")} ${c.total_orders === 1 ? "pedido" : "pedidos"}`}
                valor={fmtCurrency(c.total_revenue)}
                rodape={receita > 0 ? textoPequeno(`${pct0((c.total_revenue / receita) * 100)} da receita`) : undefined}
              />
            ))}
          </Secao>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6 mt-6">
      <AnalyticsKPIs stats={filteredStats} />

      <ProductCategorizationBanner
        uncategorizedCount={uncategorizedCount}
        onCategorizeNow={onCategorizeNow}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Ranking de Produtos */}
        {/* Header no padrão do sistema (20/08): faixa, título 14px, ícone 32px. */}
        <Card className="hover:shadow-hover transition-shadow overflow-hidden">
          <header className="flex items-center justify-between gap-3 border-b border-border/70 bg-[hsl(0_0%_95.88%_/_40%)] dark:bg-muted/40 px-5 py-3.5">
            <div className="flex min-w-0 items-center gap-2.5">
              <SectionIcon icon={TrendingUp} color="primary" size="sm" />
              <div className="min-w-0">
                <h3 className="text-sm font-semibold leading-tight text-foreground">Ranking de Produtos</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {vendidos.length} com venda no período · {filteredStats.length} no catálogo
                </p>
              </div>
            </div>
          </header>
          <CardContent className="pt-5">
            {vendidos.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground">
                <Package className="w-10 h-10 mx-auto mb-2 opacity-30" />
                {filteredStats.length === 0 ? (
                  <>
                    <p className="text-sm">Nenhum produto ainda.</p>
                    <p className="text-xs mt-1">Os produtos aparecem aqui assim que chegam pedidos.</p>
                  </>
                ) : (
                  <>
                    <p className="text-sm">Nenhuma venda no período.</p>
                    <p className="text-xs mt-1">
                      O catálogo tem {filteredStats.length} produto{filteredStats.length === 1 ? "" : "s"} — aumente o período para ver o histórico.
                    </p>
                  </>
                )}
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  {pagedStats.map((p, i) => {
                    const globalIdx = rankingPage * PAGE_SIZE + i;
                    return (
                      <button
                        key={p.key}
                        onClick={() => onSelectProduct(p.key, p.name, p.display_name)}
                        className={`w-full flex items-center gap-3 p-3 rounded-xl transition-colors text-left hover:bg-muted/50 ${
                          !p.active ? "opacity-50" : ""
                        }`}
                      >
                        <span className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center text-sm font-semibold tabular-nums shrink-0">
                          #{globalIdx + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate text-foreground">{productLabel(p)}</p>
                          <p className="text-xs text-muted-foreground mt-0.5 truncate">
                            {[
                              p.category_name ?? "Sem categoria",
                              p.main_marketplace ? marketplaceLabel(p.main_marketplace) : null,
                            ].filter(Boolean).join(" · ")}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-semibold text-foreground tabular-nums">{p.total_orders} pedidos</p>
                          <div className="flex items-center justify-end gap-1.5 mt-0.5">
                            <p className="text-xs text-muted-foreground tabular-nums">{fmtCurrency(p.total_revenue)}</p>
                            <TrendBadge current={p.total_orders} previous={p.prev_orders} />
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
                {totalPages > 1 && (
                  <div className="flex items-center justify-center gap-2 mt-4">
                    <Button variant="outline" size="icon" className="h-8 w-8 rounded-xl"
                      disabled={rankingPage === 0}
                      onClick={() => setRankingPage((p) => p - 1)}>
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <span className="text-xs text-muted-foreground tabular-nums">{rankingPage + 1} / {totalPages}</span>
                    <Button variant="outline" size="icon" className="h-8 w-8 rounded-xl"
                      disabled={rankingPage >= totalPages - 1}
                      onClick={() => setRankingPage((p) => p + 1)}>
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Ranking de Categorias */}
        <Card className="hover:shadow-hover transition-shadow overflow-hidden">
          <header className="flex items-center justify-between gap-3 border-b border-border/70 bg-[hsl(0_0%_95.88%_/_40%)] dark:bg-muted/40 px-5 py-3.5">
            <div className="flex min-w-0 items-center gap-2.5">
              <SectionIcon icon={Tags} color="violet" size="sm" />
              <div className="min-w-0">
                <h3 className="text-sm font-semibold leading-tight text-foreground">Ranking de Categorias</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">Por receita no período</p>
              </div>
            </div>
          </header>
          <CardContent>
            {categoryStats.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground text-sm">
                Nenhuma categoria com pedidos ainda.
              </div>
            ) : (
              <div className="space-y-2">
                {categoryStats.map((c, i) => {
                  const maxRevenue = categoryStats[0]?.total_revenue ?? 1;
                  const pct = maxRevenue > 0 ? (c.total_revenue / maxRevenue) * 100 : 0;
                  return (
                    <button
                      key={c.id}
                      onClick={() => onSelectCategoryFromRanking(c.id)}
                      className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-muted/50 transition-colors text-left"
                    >
                      <span className="text-xs font-bold text-muted-foreground w-5 shrink-0 tabular-nums">#{i + 1}</span>
                      <div className="w-3 h-3 rounded-full shrink-0" style={{ background: c.color }} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1 gap-2">
                          <span className="text-sm font-medium text-foreground truncate">{c.name}</span>
                          <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                            {c.product_count} itens · {c.total_orders} pedidos · {fmtCurrency(c.total_revenue)}
                          </span>
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all duration-500"
                            style={{ width: `${pct}%`, background: c.color }} />
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
