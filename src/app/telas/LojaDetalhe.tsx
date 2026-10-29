import { useMemo } from "react";
import { Navigate, useParams, useSearchParams } from "react-router-dom";
import { AlertTriangle, Store, WifiOff } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Aviso, PILULA_ATIVA, PILULA_FILTRO, Pilulas } from "@/components/mobile/blocos";
import { LojaHeaderMobile } from "@/components/lojas/LojaHeader";
import { LojaClientesTab } from "@/components/lojas/LojaClientesTab";
import { LojaPedidosTab } from "@/components/lojas/LojaPedidosTab";
import { LojaProdutosTab } from "@/components/lojas/LojaProdutosTab";
import { LojaRegioesTab } from "@/components/lojas/LojaRegioesTab";
import { LojaVisaoGeralTab } from "@/components/lojas/LojaVisaoGeralTab";
import { LojasDoMarketplaceCard } from "@/components/lojas/LojasDoMarketplaceCard";
import {
  DEFAULT_PERIOD,
  LOJA_PERIODS,
  isMarketplaceSlug,
  periodToRange,
  useLojaInk,
} from "@/components/lojas/lojaDetailShared";
import { positionOf, useLojaMetrics, useLojasDoMarketplace } from "@/components/lojas/lojaDetailQueries";
import { useSellerContext } from "@/contexts/SellerContext";
import { useMarketplaceAliases } from "@/hooks/useMarketplaceAliases";
import { formatMarketplaceName } from "@/utils/formatters";
import { cn } from "@/lib/utils";
import { LayoutApp } from "@/app/LayoutApp";

/**
 * Um marketplace por dentro: o desenho de celular do detalhe do site
 * (src/pages/LojaDetail.tsx). Cabeçalho com a posição e a fatia da receita, o
 * período e as abas em pílulas, o filtro de loja quando o seller tem 2+ contas
 * no mesmo marketplace, e cada aba no próprio desenho de celular.
 */

const ABAS = [
  // O value segue "visao" (era "Visão Geral" no site): link com ?tab=visao abre.
  { value: "visao", label: "Dashboard" },
  { value: "pedidos", label: "Pedidos" },
  { value: "clientes", label: "Clientes" },
  { value: "produtos", label: "Produtos" },
  { value: "regioes", label: "Regiões" },
] as const;

type Aba = (typeof ABAS)[number]["value"];
const OPCOES_ABA = ABAS.map((t) => ({ value: t.value as Aba, label: t.label }));

const PERIODOS = [
  { value: "7", label: "7 dias" },
  { value: "30", label: "30 dias" },
  { value: "90", label: "90 dias" },
  { value: "365", label: "1 ano" },
  { value: "all", label: "Tudo" },
];

/**
 * Sem dado ainda: buscando ou, sem internet, em espera. A consulta parada não
 * conta como carregando no react-query, mas volta sozinha com a conexão: até lá
 * o cabeçalho e a aba ficam no esqueleto, e não em "sem pedidos" e zeros.
 */
const esperando = (q: { isPending: boolean; fetchStatus: string }) => q.isPending && q.fetchStatus !== "idle";

export default function LojaDetalhe() {
  const { marketplace } = useParams<{ marketplace: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const { activeSeller } = useSellerContext();
  const { getDisplayName } = useMarketplaceAliases(activeSeller?.id);

  const slug = (marketplace ?? "").trim().toLowerCase();

  const abaCrua = searchParams.get("tab") ?? "visao";
  const aba: Aba = ABAS.some((t) => t.value === abaCrua) ? (abaCrua as Aba) : "visao";

  const periodoCru = searchParams.get("periodo") ?? DEFAULT_PERIOD;
  const period = LOJA_PERIODS.some((p) => p.value === periodoCru) ? periodoCru : DEFAULT_PERIOD;

  const setParam = (chave: string, valor: string) => {
    const next = new URLSearchParams(searchParams);
    next.set(chave, valor);
    // `?f=` é o filtro da aba Clientes, e só ela o aplica: trocar de aba apaga.
    if (chave === "tab") next.delete("f");
    // `replace`: o Voltar sai do marketplace, não desfaz toques de aba.
    setSearchParams(next, { replace: true });
  };

  // `new Date()` a cada render mudaria a chave das consultas.
  const range = useMemo(() => periodToRange(period), [period]);

  const metrics = useLojaMetrics(activeSeller?.id, range.start, range.end);
  const rows = metrics.data ?? [];
  const row = rows.find((r) => r.marketplace === slug) ?? null;

  const pos = positionOf(rows, slug, "total_revenue");
  const receitaTotal = rows.reduce((s, r) => s + r.total_revenue, 0);
  const sharePct = row && receitaTotal > 0 ? (row.total_revenue / receitaTotal) * 100 : 0;

  const label = getDisplayName(slug) ?? formatMarketplaceName(slug);
  const ink = useLojaInk(slug);

  // Lojas deste marketplace (um seller pode ter várias contas na mesma
  // plataforma). Para a maioria volta vazio e o filtro não aparece.
  const lojasQ = useLojasDoMarketplace(activeSeller?.id, slug, range.start, range.end, isMarketplaceSlug(slug));
  const lojas = lojasQ.data ?? [];
  const lojasReais = lojas.filter((l) => l.store_id);
  const temVariasLojas = lojasReais.length >= 2;

  const lojaCrua = searchParams.get("loja");
  const lojaSelecionada = temVariasLojas ? lojasReais.find((l) => l.store_id === lojaCrua) ?? null : null;

  // Com uma loja em foco, a mesma RPC com _store_id: os números das abas
  // obedecem ao filtro, não só a lista de pedidos.
  const metricsLoja = useLojaMetrics(
    lojaSelecionada ? activeSeller?.id : undefined,
    range.start,
    range.end,
    lojaSelecionada?.store_id ?? null,
  );
  const rowEmFoco = lojaSelecionada ? metricsLoja.data?.find((r) => r.marketplace === slug) ?? null : row;
  const carregando = esperando(metrics);
  const carregandoEmFoco = lojaSelecionada ? esperando(metricsLoja) : carregando;

  const setLoja = (storeId: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (storeId) next.set("loja", storeId);
    else next.delete("loja");
    setSearchParams(next, { replace: true });
  };

  if (!isMarketplaceSlug(slug)) return <Navigate to="/lojas" replace />;

  const propsAba = {
    sellerId: activeSeller?.id,
    range,
    row: rowEmFoco,
    active: true,
    storeId: lojaSelecionada?.store_id ?? null,
    storeName: lojaSelecionada?.nome ?? null,
  };

  return (
    <LayoutApp>
      <div className="flex flex-col gap-6 px-4 pb-6 pt-4" style={ink.vars}>
        <div className="flex flex-col gap-3">
          <LojaHeaderMobile
            slug={slug}
            label={label}
            rank={pos.rank}
            totalPlataformas={pos.totalPlataformas}
            sharePct={sharePct}
            lastOrderAt={row?.last_order_at ?? null}
            loading={carregando}
          />
          <Pilulas rotulo="Período" opcoes={PERIODOS} valor={period} onChange={(p) => setParam("periodo", p)} />
          <div className="-mx-4 flex flex-col gap-3 border-t border-border/60 px-4 pt-3">
            <Pilulas rotulo="Aba" opcoes={OPCOES_ABA} valor={aba} onChange={(t) => setParam("tab", t)} />
            {temVariasLojas && (
              <div className="flex">
                <Select
                  value={lojaSelecionada?.store_id ?? "__todas"}
                  onValueChange={(v) => setLoja(v === "__todas" ? null : v)}
                >
                  <SelectTrigger aria-label="Loja" className={cn(PILULA_FILTRO, "max-w-full", lojaSelecionada && PILULA_ATIVA)}>
                    <Store className="h-4 w-4 shrink-0 opacity-70" />
                    <span>{lojaSelecionada ? lojaSelecionada.nome : "Todas as lojas"}</span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__todas">Todas as lojas</SelectItem>
                    {lojasReais.map((l) => (
                      <SelectItem key={l.store_id} value={l.store_id!}>
                        {l.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </div>

        {metrics.isError && (
          <Aviso
            tom="vermelho"
            icone={AlertTriangle}
            titulo="Não foi possível carregar as métricas desta loja"
            acao={{ rotulo: "Tentar de novo", onClick: () => metrics.refetch() }}
          >
            A consulta falhou. Tente de novo em alguns instantes.
          </Aviso>
        )}
        {metrics.isPending && metrics.isPaused && (
          <Aviso tom="neutro" icone={WifiOff} titulo="Sem internet">
            Os números aparecem assim que a conexão voltar.
          </Aviso>
        )}
        {/* Sem pedidos no período não é página inexistente: o seller pode ter
            vendido lá há meses, e ampliar o período mostra. */}
        {!carregando && !metrics.isError && !row && (
          <Aviso tom="neutro" titulo={`Sem pedidos nesta loja em ${range.label.toLowerCase()}`}>
            Amplie o período acima para ver o histórico de {label}.
          </Aviso>
        )}

        {aba === "visao" && (
          <LojaVisaoGeralTab
            {...propsAba}
            slug={slug}
            label={label}
            rows={rows}
            loading={carregandoEmFoco}
            onIrParaAba={(t) => {
              setParam("tab", t);
              // O "Ver tudo" fica no fim da aba: sem isto a nova abria no meio.
              window.scrollTo({ top: 0 });
            }}
            meioMobile={
              temVariasLojas && !lojaSelecionada ? (
                <LojasDoMarketplaceCard lojas={lojas} corBarra={ink.hex} onSelecionar={setLoja} />
              ) : null
            }
          />
        )}
        {aba === "pedidos" && <LojaPedidosTab {...propsAba} marketplace={slug} loading={carregandoEmFoco} />}
        {aba === "produtos" && <LojaProdutosTab {...propsAba} marketplace={slug} label={label} />}
        {aba === "regioes" && <LojaRegioesTab {...propsAba} marketplace={slug} label={label} loading={carregandoEmFoco} />}
        {aba === "clientes" && (
          <LojaClientesTab
            sellerId={activeSeller?.id}
            slug={slug}
            label={label}
            period={period}
            onPeriodChange={(p) => setParam("periodo", p)}
            active
          />
        )}
      </div>
    </LayoutApp>
  );
}
