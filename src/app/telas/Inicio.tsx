import { Suspense, useMemo, useState } from "react";
import { AlertTriangle, ShoppingCart } from "lucide-react";
import { useSellerContext } from "@/contexts/SellerContext";
import {
  useCrmFunnel,
  useDashboardOverview,
  usePeriodRange,
  useRecentOrders,
  useRevenueTimeseries,
  useTopMarketplaces,
} from "@/hooks/useDashboardV2";
import { useRegioes } from "@/hooks/useRegioes";
import { DashboardMobile, PERIODOS_MOBILE } from "@/components/dashboard/DashboardMobile";
import { Pilulas } from "@/components/mobile/blocos";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PedacoComFalha } from "@/components/PedacoComFalha";
import { lazyComRecarga } from "@/utils/lazyComRecarga";
import { LayoutApp } from "@/app/LayoutApp";

// O detalhe do estado só abre num toque: fica fora do pacote da tela, como no site.
const StateDetailSheet = lazyComRecarga(
  () => import("@/components/regioes/StateDetailSheet").then((m) => ({ default: m.StateDetailSheet })),
  { recarregar: false },
);

/**
 * Início: o caminho de celular do Dashboard do site (components/Dashboard.tsx,
 * aberto por pages/Index.tsx). As mesmas consultas, da loja ativa e do mesmo
 * período, entregues ao DashboardMobile; o toque num estado abre o mesmo
 * detalhe da aba Regiões.
 */
export default function Inicio() {
  const { activeSeller, loading: carregandoLoja } = useSellerContext();
  const [periodo, setPeriodo] = useState("30");
  const [ufSelecionada, setUfSelecionada] = useState<string | null>(null);
  // Montado a partir do primeiro toque e mantido depois, para a gaveta fechar com a animação.
  const [detalheUsado, setDetalheUsado] = useState(false);
  const selecionarUf = (uf: string | null) => {
    setUfSelecionada(uf);
    if (uf) setDetalheUsado(true);
  };
  const { startDate, endDate, days } = usePeriodRange(periodo);

  const sellerIds = useMemo(() => (activeSeller?.id ? [activeSeller.id] : []), [activeSeller?.id]);

  const range = { sellerIds, startDate, endDate };
  const overview = useDashboardOverview(range);
  const funil = useCrmFunnel(sellerIds);
  const lojas = useTopMarketplaces(range);
  const pedidos = useRecentOrders(range);
  const regioes = useRegioes(sellerIds, startDate, endDate);
  const serie = useRevenueTimeseries(range);

  // Só a visão geral segura o esqueleto: os outros blocos chegam cada um no seu tempo.
  const carregando = carregandoLoja || (overview.isLoading && sellerIds.length > 0);
  const d = overview.data;

  let conteudo;
  if (carregando) {
    conteudo = <Esqueleto />;
  } else if (activeSeller && !overview.isError && d && d.total_orders > 0) {
    conteudo = (
      <DashboardMobile
        sellerId={activeSeller.id}
        periodo={periodo}
        onPeriodo={setPeriodo}
        days={days}
        inicio={startDate}
        d={d}
        serie={serie.data ?? []}
        funil={funil.data ?? null}
        funilErro={funil.isError}
        lojas={lojas.data ?? []}
        pedidos={pedidos.data ?? []}
        regioes={regioes.data ?? []}
        onSelecionarUf={selecionarUf}
      />
    );
  } else {
    // Erro não é "sem pedidos": a RPC que falha devolve `data: undefined`, e um
    // seller com milhares de pedidos não pode ler que não vendeu nada.
    conteudo = (
      <div className="flex flex-col gap-7 px-4 pb-6 pt-4">
        <Pilulas rotulo="Período" opcoes={PERIODOS_MOBILE} valor={periodo} onChange={setPeriodo} />
        {overview.isError ? (
          <div className="flex flex-col items-center gap-3 rounded-3xl border border-border/60 bg-card px-6 py-8 text-center">
            <AlertTriangle className="h-6 w-6 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">Não foi possível carregar os indicadores.</p>
            <Button
              variant="outline"
              size="sm"
              className="rounded-full"
              disabled={overview.isFetching}
              onClick={() => overview.refetch()}
            >
              {overview.isFetching ? "Tentando…" : "Tentar de novo"}
            </Button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 rounded-3xl border border-border/60 bg-card px-6 py-10 text-center">
            <ShoppingCart className="h-9 w-9 text-muted-foreground/40" />
            <p className="text-[15px] font-semibold text-foreground">Nenhum pedido nos últimos {days} dias nesta loja</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <LayoutApp>
      {conteudo}
      {detalheUsado && (
        <PedacoComFalha fallback={null} chave={ufSelecionada}>
          <Suspense fallback={null}>
            <StateDetailSheet
              sellerIds={sellerIds}
              uf={ufSelecionada}
              startDate={startDate}
              endDate={endDate}
              onClose={() => setUfSelecionada(null)}
            />
          </Suspense>
        </PedacoComFalha>
      )}
    </LayoutApp>
  );
}

/**
 * Esqueleto no desenho do DashboardMobile (o do site é o do computador, com
 * cabeçalho e quatro cartões): pílulas, o faturamento com a curva, os dois
 * blocos e uma seção. Assim a tela não pula quando os números chegam.
 */
function Esqueleto() {
  return (
    <div className="flex flex-col gap-7 px-4 pb-6 pt-4" aria-busy="true" aria-label="Carregando">
      <div className="flex gap-2">
        {[68, 76, 76, 60].map((largura, i) => (
          <Skeleton key={i} className="h-9 rounded-full" style={{ width: largura }} />
        ))}
      </div>
      <div className="flex flex-col gap-3">
        <div className="space-y-2">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-10 w-56" />
          <Skeleton className="h-5 w-52" />
        </div>
        <Skeleton className="h-28 w-full rounded-2xl" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Skeleton className="h-[118px] rounded-3xl" />
        <Skeleton className="h-[118px] rounded-3xl" />
      </div>
      <div className="flex flex-col gap-3">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-[280px] rounded-3xl" />
      </div>
    </div>
  );
}
