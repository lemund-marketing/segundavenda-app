import { useMemo, useState } from "react";
import { AlertTriangle, Map as MapIcon, ShoppingCart, TrendingUp, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSellerContext } from "@/contexts/SellerContext";
import { usePeriodRange } from "@/hooks/useDashboardV2";
import { useRegioes } from "@/hooks/useRegioes";
import { EmptyState, brl, int } from "@/components/dashboard/shared";
import { BrazilChoropleth } from "@/components/regioes/BrazilChoropleth";
import { METRICAS, type Metrica } from "@/components/regioes/metricasMapa";
import { RegionRollup } from "@/components/regioes/RegionRanking";
import { StateDetailSheet } from "@/components/regioes/StateDetailSheet";
import { RankingEstados } from "@/components/regioes/RankingEstados";
import { ESTADOS_BR } from "@/components/regioes/estadosBrasil";
import { Bloco, CabecalhoTela, Pilulas, Secao, ValorPartes, textoPequeno } from "@/components/mobile/blocos";
import { tamanhoComum } from "@/components/mobile/tamanhoDoValor";
import { cn } from "@/lib/utils";
import { LayoutApp } from "@/app/LayoutApp";

/**
 * Regiões: o caminho de celular da página do site (src/pages/Regioes.tsx).
 * A mesma consulta (get_regions_overview da loja ativa no período), o
 * faturamento grande com pedidos e ticket em blocos, o mapa com a métrica em
 * pílulas, o ranking verde dos estados e o rollup por região. Tocar num estado,
 * no mapa ou no ranking, abre o mesmo detalhe do Início; o "Ver pedidos deste
 * estado" de lá leva a /pedidos?estado=UF.
 */

const PERIODOS = [
  { value: "7", label: "7 dias" },
  { value: "30", label: "30 dias" },
  { value: "90", label: "90 dias" },
  { value: "365", label: "1 ano" },
];

export default function Regioes() {
  const { activeSeller } = useSellerContext();
  const [periodo, setPeriodo] = useState("30");
  const [metrica, setMetrica] = useState<Metrica>("orders");
  const [ufSelecionada, setUfSelecionada] = useState<string | null>(null);

  const { startDate, endDate, days } = usePeriodRange(periodo);
  const sellerIds = useMemo(() => (activeSeller?.id ? [activeSeller.id] : []), [activeSeller?.id]);

  const regioes = useRegioes(sellerIds, startDate, endDate);
  const rows = useMemo(() => regioes.data ?? [], [regioes.data]);
  const { isLoading } = regioes;
  // Sem internet a consulta fica em espera (nem dado, nem erro, nem carregando)
  // e volta sozinha com a conexão: não pode cair no "Nenhum pedido".
  const semInternet = regioes.isPending && regioes.isPaused;

  const totais = useMemo(() => {
    const orders = rows.reduce((s, r) => s + r.orders, 0);
    const revenue = rows.reduce((s, r) => s + r.revenue, 0);
    return { orders, revenue, ticket: orders > 0 ? revenue / orders : 0 };
  }, [rows]);

  const semDados = !isLoading && rows.length === 0;
  const estadosOrdenados = useMemo(() => [...rows].sort((a, b) => b.orders - a.orders), [rows]);
  // Só UF de verdade no "N de 27": clients.state_code tem lixo ("MI", "EX"…) e
  // a conta passaria de 27.
  const ufsValidas = useMemo(() => rows.filter((r) => r.uf in ESTADOS_BR).length, [rows]);
  const tamanhoBlocos = tamanhoComum(int(totais.orders), brl(totais.ticket));

  return (
    <LayoutApp>
      <div className="flex flex-col gap-7 px-4 pb-6 pt-4">
        <div className="flex flex-col gap-3">
          <CabecalhoTela icone={MapIcon} titulo="Regiões" />
          <Pilulas rotulo="Período" opcoes={PERIODOS} valor={periodo} onChange={setPeriodo} />
        </div>

        {/* Erro não é "sem pedidos": a RPC que falha devolve lista vazia, e a
            loja que vendeu não pode ler que não há pedido com endereço. */}
        {regioes.isError ? (
          <div className="flex flex-col items-center gap-3 rounded-3xl border border-border/60 bg-card px-6 py-8 text-center">
            <AlertTriangle className="h-6 w-6 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">Não foi possível carregar as regiões.</p>
            <Button
              variant="outline"
              size="sm"
              className="rounded-full"
              disabled={regioes.isFetching}
              onClick={() => regioes.refetch()}
            >
              {regioes.isFetching ? "Tentando…" : "Tentar de novo"}
            </Button>
          </div>
        ) : semInternet ? (
          <div className="flex flex-col items-center gap-2 rounded-3xl border border-border/60 bg-card px-6 py-8 text-center">
            <WifiOff className="h-6 w-6 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">Sem internet</p>
            <p className="text-[13px] text-muted-foreground">Os números aparecem assim que a conexão voltar.</p>
          </div>
        ) : semDados ? (
          <EmptyState height={240}>Nenhum pedido com endereço identificado nos últimos {days} dias</EmptyState>
        ) : (
          <>
            <div className="flex flex-col gap-5">
              <section>
                <p className="text-sm font-medium text-muted-foreground">
                  Faturamento · {periodo === "365" ? "último ano" : `últimos ${days} dias`}
                </p>
                {isLoading ? (
                  <div className="mt-2 h-10 w-44 animate-pulse rounded-lg bg-muted" />
                ) : (
                  <p
                    className={cn(
                      "mt-1 font-semibold leading-tight tracking-tight tabular-nums text-foreground",
                      brl(totais.revenue).length > 15 ? "text-[30px]/tight" : "text-[38px]/tight",
                    )}
                  >
                    <ValorPartes valor={brl(totais.revenue)} />
                  </p>
                )}
                <p className="mt-1 text-[13px] text-muted-foreground">
                  {isLoading ? "carregando…" : `em ${int(ufsValidas)} de 27 estados · só pedidos com estado identificado`}
                </p>
              </section>
              <div className="grid grid-cols-2 gap-2">
                {isLoading ? (
                  <>
                    <div className="h-[88px] animate-pulse rounded-2xl bg-muted" />
                    <div className="h-[88px] animate-pulse rounded-2xl bg-muted" />
                  </>
                ) : (
                  <>
                    <Bloco tamanho={tamanhoBlocos} icone={ShoppingCart} rotulo="Pedidos" valor={int(totais.orders)} />
                    <Bloco tamanho={tamanhoBlocos} icone={TrendingUp} rotulo="Ticket médio" valor={brl(totais.ticket)} />
                  </>
                )}
              </div>
            </div>

            <Secao titulo="Mapa do Brasil" semLista>
              <div className="p-4">
                <div className="-mx-4 mb-1 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {METRICAS.map((m) => (
                    <button
                      key={m.key}
                      type="button"
                      onClick={() => setMetrica(m.key)}
                      aria-pressed={metrica === m.key}
                      className={cn(
                        "shrink-0 rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors",
                        metrica === m.key ? "bg-primary/10 text-primary" : "bg-muted/70 text-muted-foreground",
                      )}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
                {isLoading ? (
                  <EmptyState height={330}>Carregando mapa…</EmptyState>
                ) : (
                  <BrazilChoropleth
                    compacto
                    rows={rows}
                    metrica={metrica}
                    ufSelecionada={ufSelecionada}
                    onSelecionar={setUfSelecionada}
                  />
                )}
              </div>
            </Secao>

            {estadosOrdenados.length > 0 && (
              <Secao titulo="Estados com mais pedidos" direita={textoPequeno(`${int(ufsValidas)} com venda`)} semLista>
                <RankingEstados estados={estadosOrdenados} totalPedidos={totais.orders} onSelecionar={setUfSelecionada} />
              </Secao>
            )}

            <RegionRollup rows={rows} />
          </>
        )}
      </div>

      <StateDetailSheet
        sellerIds={sellerIds}
        uf={ufSelecionada}
        startDate={startDate}
        endDate={endDate}
        onClose={() => setUfSelecionada(null)}
      />
    </LayoutApp>
  );
}
