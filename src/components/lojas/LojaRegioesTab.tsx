import { useMemo, useState } from "react";
import { AlertTriangle, Building2, Map as MapIcon, Repeat2, Target } from "lucide-react";

import { KpiPadrao } from "@/components/kpi/KpiPadrao";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ACCENT,
  EmptyState,
  PanelCard,
  brl,
  int,
  pct,
} from "@/components/dashboard/shared";
import { RegionRollup } from "@/components/regioes/RegionRanking";
import { BrazilChoropleth } from "@/components/regioes/BrazilChoropleth";
import { METRICAS, type Metrica } from "@/components/regioes/metricasMapa";
import { TopStates } from "@/components/dashboard/TopStates";
import { ESTADOS_BR } from "@/components/regioes/estadosBrasil";
import { useRegioes } from "@/hooks/useRegioes";
import { useIsMobile } from "@/hooks/use-mobile";
import { RankingEstados } from "@/components/regioes/RankingEstados";
import { Aviso, Bloco, Secao, textoPequeno } from "@/components/mobile/blocos";
import { tamanhoComum } from "@/components/mobile/tamanhoDoValor";
import { formatMarketplaceName } from "@/utils/formatters";
import { cn } from "@/lib/utils";

import { ErrorBlock, type LojaRange } from "./lojaDetailShared";
import type { LojaMetricsRow } from "./lojaDetailQueries";

/**
 * Aba "Regiões" de um marketplace — a tela /regioes recortada por plataforma.
 *
 * A mesma RPC da tela geral serve aqui: `get_regions_overview` ganhou o 4º
 * parâmetro `_marketplace` em 21/08/2026 (migração
 * 20260821010000_regions_overview_por_marketplace.sql), então o recorte é feito
 * no banco — nada é filtrado depois, no cliente.
 *
 * O QUE ESTA ABA NÃO TEM, DE PROPÓSITO:
 *
 * 1) Mapa do Brasil + "Estados com mais pedidos". Esse par já é a fileira do
 *    meio da aba Dashboard desta mesma loja (LojaVisaoGeralTab), alimentado
 *    pela mesma consulta. Repetir aqui seria pagar duas vezes pelo mesmo
 *    desenho; esta aba entrega o que lá não cabe — a régua de cobertura, a
 *    concentração, o rollup por região e o detalhe UF a UF.
 *
 * 2) O detalhe de estado (StateDetailSheet). A RPC dele,
 *    `get_state_detail(uuid[], text, timestamptz, timestamptz)` (migração
 *    20260806180000), NÃO tem parâmetro de marketplace: abrir o sheet dentro de
 *    /lojas/:marketplace mostraria o estado do seller INTEIRO — número certo,
 *    conclusão errada, ainda por cima com um bloco "Marketplaces" listando as
 *    outras plataformas dentro da página de uma delas. Enquanto a RPC não
 *    aceitar `_marketplace`, as linhas desta aba não abrem sheet.
 */

/** As 27 unidades federativas — denominador fixo do card de cobertura. */
const UF_TOTAL = 27;

/**
 * Nem tudo que volta na coluna `uf` é uma UF.
 *
 * `dash_uf(text)` traduz o estado por extenso ("SÃO PAULO" → "SP"), mas o
 * último ramo dela é um passe-livre: QUALQUER string de 2 caracteres volta em
 * maiúscula, sem conferir se existe. Cadastro sujo entra no mapa como se fosse
 * estado — em produção, em 29/08/2026, `clients.state_code` tem "MI", "RI",
 * "SA", "EX" e "NÃ", e 5 desses pedidos são do seller dd754b18 na Amazon,
 * entre 11/04 e 11/08/2026.
 *
 * Sem este filtro o primeiro KPI da aba anunciaria "30 / 27" estados para essa
 * loja no ano de 2026 (27 UFs reais + MI + RI + SA) — número impossível, logo
 * no card que o lojista lê primeiro. Os pedidos continuam contando em tudo
 * (são pedidos de verdade, com receita de verdade); o que este filtro faz é
 * impedir que um código inválido seja CONTADO COMO ESTADO.
 *
 * `dash_regiao` já devolve NULL para esses códigos, então o rollup por região
 * ignora as linhas sozinho — a régua aqui é a mesma do mapa: só entra a UF que
 * o desenho conhece.
 */
const ufValida = (uf: string) => uf in ESTADOS_BR;

interface Props {
  sellerId?: string;
  /** Slug do marketplace (o `:marketplace` da rota). */
  marketplace: string;
  /** Nome de exibição; sem ele, o slug é formatado na hora. */
  label?: string;
  range: LojaRange;
  /**
   * Métricas do marketplace no período — a mesma linha que abastece o
   * cabeçalho e a aba Dashboard. Aqui serve de denominador da cobertura: sem
   * ela não dá para dizer quantos pedidos o mapa deixou de fora.
   */
  row: LojaMetricsRow | null;
  loading?: boolean;
  active: boolean;
  /**
   * Loja em foco dentro do marketplace. `get_regions_overview` filtra por
   * marketplace e por seller — NÃO por `orders.store_id`. Com uma loja
   * selecionada, esta aba não tem o que mostrar sem mentir o recorte (é o mesmo
   * motivo pelo qual o mapa da aba Dashboard some quando há loja em foco).
   */
  storeId?: string | null;
  storeName?: string | null;
}

export function LojaRegioesTab({
  sellerId,
  marketplace,
  label,
  range,
  row,
  loading = false,
  active,
  storeId = null,
  storeName = null,
}: Props) {
  // Métrica que pinta o mapa — mesmo seletor da tela /regioes do seller.
  const [metrica, setMetrica] = useState<Metrica>("orders");
  // O mapa PRECISA de um estado selecionado para o realce funcionar (clicar
  // pinta a UF e mostra o cartão de leitura no canto). Aqui ele serve só para
  // isso: diferente da tela /regioes, clicar NÃO abre o sheet de detalhe.
  const [ufSelecionada, setUfSelecionada] = useState<string | null>(null);
  const isMobile = useIsMobile();

  const nomeLoja = label ?? formatMarketplaceName(marketplace);

  // `range` chega como string ISO (LojaRange), e `useRegioes` pede Date. O
  // useMemo é o mesmo de LojaVisaoGeralTab: mantém a identidade do objeto
  // estável entre renders. Não é o que segura o refetch — a queryKey do hook
  // guarda `toDateString()`, que já é estável mesmo com um Date novo a cada
  // render —, é só para não realocar duas datas por render e para o dia da
  // virada não depender de quando o componente renderizou.
  const inicio = useMemo(() => new Date(range.start), [range.start]);
  const fim = useMemo(() => new Date(range.end), [range.end]);

  // `active` é o contrato das abas: escondida não consulta. E com loja em foco
  // também não — a lista vazia desliga o `enabled` do hook.
  const sellerIds = useMemo(
    () => (sellerId && active && !storeId ? [sellerId] : []),
    [sellerId, active, storeId],
  );

  const q = useRegioes(sellerIds, inicio, fim, marketplace);
  const rows = useMemo(() => q.data ?? [], [q.data]);
  const carregando = loading || (q.isLoading && sellerIds.length > 0);

  const t = useMemo(() => {
    const orders = rows.reduce((s, r) => s + r.orders, 0);
    const ssOrders = rows.reduce((s, r) => s + r.second_sale_orders, 0);
    const ssRevenue = rows.reduce((s, r) => s + r.second_sale_revenue, 0);

    // Clientes NÃO são somados: `clients` é distinto DENTRO de cada UF, e o
    // mesmo cliente com endereço em dois estados contaria duas vezes. Por isso
    // não existe KPI "clientes" aqui — só a coluna por UF, onde o número vale.
    const porPedidos = [...rows].sort((a, b) => b.orders - a.orders);
    const top3 = porPedidos.slice(0, 3);
    const top3Orders = top3.reduce((s, r) => s + r.orders, 0);

    // Só conta como "estado" a UF que o mapa reconhece. O resto continua nos
    // totais acima — some do denominador, não do faturamento.
    const invalidas = rows.filter((r) => !ufValida(r.uf));

    return {
      orders,
      ssOrders,
      ssRevenue,
      ssRate: orders > 0 ? (ssOrders / orders) * 100 : 0,
      ufs: rows.length - invalidas.length,
      invalidas: invalidas.length,
      invalidasCodigos: invalidas.map((r) => r.uf).join(", "),
      invalidasOrders: invalidas.reduce((s, r) => s + r.orders, 0),
      regioes: new Set(rows.map((r) => r.regiao).filter(Boolean)).size,
      top3,
      top3Pct: orders > 0 ? (top3Orders / orders) * 100 : 0,
    };
  }, [rows]);


  /**
   * Pedidos do marketplace no período, sem recorte de UF — base da cobertura.
   * A conta nunca passa de 100%: a RPC de regiões usa `dash_is_cancelled`, que
   * descarta 8 status ('cancelada', 'estornado' e 'devolvido' inclusive),
   * enquanto `get_marketplace_metrics` descarta só 5 — além de exigir o JOIN
   * com clients e a UF preenchida. O denominador é sempre o maior dos dois.
   */
  const baseOrders = row?.total_orders ?? 0;
  const cobertura = baseOrders > 0 ? (t.orders / baseOrders) * 100 : null;

  /* --------------------------------------------------------------- guardas */

  if (!sellerId) {
    return <EmptyState height={280}>Selecione uma loja para ver os números</EmptyState>;
  }

  if (storeId && isMobile) {
    return (
      <Aviso tom="neutro" icone={MapIcon} titulo="Regiões não são recortadas por loja">
        A consulta geográfica filtra por marketplace, não pela loja{storeName ? ` ${storeName}` : ""}. Volte para
        “Todas as lojas” para ver a distribuição de {nomeLoja}.
      </Aviso>
    );
  }

  if (q.isError && isMobile) {
    return (
      <Aviso
        tom="vermelho"
        icone={AlertTriangle}
        titulo="Não foi possível carregar a distribuição por estado"
        acao={{ rotulo: "Tentar de novo", onClick: () => q.refetch() }}
      />
    );
  }

  if (storeId) {
    return (
      <div className="rounded-2xl bg-card shadow-sm p-5 flex items-start gap-4">
        <div className="w-10 h-10 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0">
          <MapIcon className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">
            Regiões não são recortadas por loja
          </p>
          <p className="text-sm text-muted-foreground mt-0.5">
            A consulta geográfica filtra por seller e por marketplace, não pela loja
            {storeName ? ` ${storeName}` : ""}. Volte para “Todas as lojas” para ver a distribuição
            de {nomeLoja} — mostrar estes números aqui seria anunciar o marketplace inteiro como se
            fosse desta loja.
          </p>
        </div>
      </div>
    );
  }

  if (q.isError) {
    return (
      <ErrorBlock
        title="Não foi possível carregar a distribuição por estado."
        onRetry={() => q.refetch()}
      />
    );
  }

  const semDados = !carregando && rows.length === 0;

  /*
   * Celular (23/10/2026), no desenho da tela Regiões do app: os quatro números
   * em blocos, o mapa num cartão com a métrica em pílulas, o ranking verde dos
   * estados (sem abrir detalhe: ver o topo do arquivo) e o rollup por região.
   */
  if (isMobile) {
    const estados = [...rows].sort((a, b) => b.orders - a.orders);
    const selecionado = ufSelecionada ? rows.find((r) => r.uf === ufSelecionada) ?? null : null;
    const tamanhoLinha1 = tamanhoComum(`${int(t.ufs)} de ${UF_TOTAL}`, cobertura === null ? int(t.orders) : pct(cobertura, 0));
    const tamanhoLinha2 = tamanhoComum(pct(t.top3Pct, 0), pct(t.ssRate, 1));
    return (
      <div className="flex flex-col gap-7">
        <div className="grid grid-cols-2 gap-2">
          {carregando ? (
            [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[118px] rounded-3xl" />)
          ) : (
            <>
              <Bloco
                tamanho={tamanhoLinha1}
                icone={MapIcon}
                rotulo="Estados com venda"
                valor={`${int(t.ufs)} de ${UF_TOTAL}`}
                apoio={
                  t.invalidas > 0
                    ? `${int(t.regioes)} de 5 regiões · ${int(t.invalidas)} ${t.invalidas === 1 ? "código inválido" : "códigos inválidos"} fora da conta`
                    : `${int(t.regioes)} de 5 regiões`
                }
              />
              <Bloco
                tamanho={tamanhoLinha1}
                icone={Target}
                rotulo="Cobertura"
                valor={cobertura === null ? int(t.orders) : pct(cobertura, 0)}
                apoio={
                  cobertura === null
                    ? "pedidos com estado"
                    : `${int(t.orders)} de ${int(baseOrders)} pedidos`
                }
              />
              <Bloco
                tamanho={tamanhoLinha2}
                icone={Building2}
                rotulo="Top 3 estados"
                valor={pct(t.top3Pct, 0)}
                apoio={t.top3.length ? t.top3.map((r) => r.uf).join(" · ") : "sem estados"}
              />
              <Bloco
                tamanho={tamanhoLinha2}
                icone={Repeat2}
                rotulo="Recompra"
                valor={pct(t.ssRate, 1)}
                // "dos pedidos": a Recompra do Dashboard desta loja é outra conta (dos clientes).
                apoio={`dos pedidos · ${int(t.ssOrders)} · ${brl(t.ssRevenue)}`}
              />
            </>
          )}
        </div>

        {semDados ? (
          <EmptyState height={240}>
            Nenhum pedido de {nomeLoja} com estado identificado em {range.label.toLowerCase()}
          </EmptyState>
        ) : (
          <>
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
                {carregando ? (
                  <EmptyState height={330}>Carregando mapa…</EmptyState>
                ) : (
                  <BrazilChoropleth
                    compacto
                    dica="Toque num estado para ver os números dele"
                    rows={rows}
                    metrica={metrica}
                    ufSelecionada={ufSelecionada}
                    onSelecionar={setUfSelecionada}
                  />
                )}
                {/* O cartão flutuante do computador some no mapa compacto; aqui
                    não há gaveta de estado, então a leitura fica embaixo. */}
                {selecionado && (
                  <div className="mt-3 rounded-2xl bg-muted/50 p-3">
                    <p className="text-[15px] font-medium text-foreground">
                      {ESTADOS_BR[selecionado.uf]?.name ?? selecionado.uf}
                    </p>
                    <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2">
                      {[
                        ["Pedidos", int(selecionado.orders)],
                        ["Clientes", int(selecionado.clients)],
                        ["Receita", brl(selecionado.revenue)],
                        ["Ticket médio", brl(selecionado.avg_ticket)],
                        ...(selecionado.top_city ? [["Cidade líder", selecionado.top_city]] : []),
                      ].map(([rotulo, valor]) => (
                        <div key={rotulo} className="min-w-0">
                          <dt className="text-[12px] text-muted-foreground">{rotulo}</dt>
                          <dd className="truncate text-[15px] font-medium tabular-nums text-foreground">{valor}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                )}
              </div>
            </Secao>

            {estados.length > 0 && (
              <Secao titulo="Estados com mais pedidos" direita={textoPequeno(`${int(t.ufs)} com venda`)} semLista>
                <RankingEstados estados={estados} totalPedidos={t.orders} />
              </Secao>
            )}

            {!carregando && <RegionRollup rows={rows} />}
          </>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4 2xl:space-y-6">
      {/* ------------------------------------------------------------- KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiPadrao
          titulo="Estados com venda"
          valor={`${int(t.ufs)} / ${UF_TOTAL}`}
          apoio={
            t.invalidas > 0
              ? `${int(t.regioes)} de 5 regiões · ${int(t.invalidas)} ${t.invalidas === 1 ? "código inválido" : "códigos inválidos"} fora da conta`
              : `${int(t.regioes)} de 5 regiões`
          }
          icone={MapIcon}
          loading={carregando}
          tooltip={`Unidades federativas com pelo menos um pedido não-cancelado de ${nomeLoja} no período. A UF vem do endereço do cliente do pedido; cliente sem estado preenchido fica fora do mapa e desta conta.${
            t.invalidas > 0
              ? ` O cadastro desta loja tem ${int(t.invalidas)} ${t.invalidas === 1 ? "código de estado que não existe" : "códigos de estado que não existem"} (${t.invalidasCodigos}), em ${int(t.invalidasOrders)} ${t.invalidasOrders === 1 ? "pedido" : "pedidos"}: aparecem na tabela abaixo, mas não contam como estado aqui — senão o total passaria de ${UF_TOTAL}.`
              : ""
          }`}
        />
        <KpiPadrao
          titulo="Cobertura geográfica"
          valor={cobertura === null ? int(t.orders) : pct(cobertura, 0)}
          apoio={
            cobertura === null
              ? "pedidos com estado identificado"
              : `${int(t.orders)} de ${int(baseOrders)} pedidos do período`
          }
          icone={Target}
          loading={carregando}
          tooltip={`Quanto dos pedidos de ${nomeLoja} no período entra no recorte por região. Fica de fora o pedido sem cliente vinculado, o com estado vazio no cadastro e o marcado como cancelada, estornado ou devolvido — estes três status a consulta de regiões descarta e a da aba Dashboard ainda conta, então os totais das duas abas podem não bater.`}
        />
        <KpiPadrao
          titulo="Concentração top 3"
          valor={pct(t.top3Pct, 0)}
          apoio={t.top3.length ? t.top3.map((r) => r.uf).join(" · ") : "sem estados no período"}
          icone={Building2}
          loading={carregando}
          tooltip="Fatia dos pedidos com estado identificado que sai dos três maiores estados. Número alto significa dependência geográfica: uma greve, um feriado regional ou um problema de frete nesses estados derruba o período inteiro."
        />
        <KpiPadrao
          titulo="Pedidos de recompra"
          valor={pct(t.ssRate, 1)}
          apoio={`${int(t.ssOrders)} pedidos · ${brl(t.ssRevenue)}`}
          icone={Repeat2}
          loading={carregando}
          tooltip="Fatia dos pedidos mapeados marcados como recompra (is_second_sale). O campo diz que o cliente já havia comprado antes — NÃO que a régua da Segunda Venda provocou o pedido. Serve para comparar estados entre si, não como resultado de campanha."
        />
      </div>

      {semDados ? (
        <EmptyState height={280}>
          Nenhum pedido de {nomeLoja} com estado identificado em {range.label.toLowerCase()}
        </EmptyState>
      ) : (
        <>
          {/* Mapa + ranking, no mesmo par da tela /regioes do seller. Substitui
              a tabela "Detalhe por estado" que ficava aqui (29/08/2026): o dono
              pediu o mapa, e o subtítulo daquela tabela ainda mandava o usuário
              para a aba Dashboard atrás dele. O recorte por marketplace já vem
              nas `rows` — a RPC filtra, não é peneira no cliente. */}
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-5">
            <PanelCard
              icon={MapIcon}
              title="Mapa do Brasil"
              subtitle={`Só pedidos de ${nomeLoja} · cor proporcional à métrica`}
              className="xl:col-span-3"
              right={
                <div className="flex items-center gap-1 rounded-full bg-muted p-0.5">
                  {METRICAS.map((m) => (
                    <button
                      key={m.key}
                      type="button"
                      onClick={() => setMetrica(m.key)}
                      className={cn(
                        "rounded-full px-3 py-1 text-[11px] font-semibold transition-colors",
                        metrica === m.key
                          ? "bg-foreground text-background"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              }
            >
              <BrazilChoropleth
                rows={rows}
                metrica={metrica}
                ufSelecionada={ufSelecionada}
                onSelecionar={setUfSelecionada}
              />
            </PanelCard>

            {/* Sem `onSelecionar`: clicar abriria o StateDetailSheet, e
                `get_state_detail` não tem parâmetro de marketplace — o detalhe
                viria do seller INTEIRO dentro da página de um canal, ainda por
                cima com um bloco listando as outras plataformas. */}
            <TopStates data={rows} className="xl:col-span-2" right={null} />
          </div>

          {/* ------------------------------------------------ rollup região */}
          {carregando ? (
            <PanelCard icon={MapIcon} title="Por região" subtitle="Peso de cada região no período">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
                {[0, 1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-40 rounded-xl" />
                ))}
              </div>
            </PanelCard>
          ) : (
            /* Mesmo componente da tela /regioes: a barra empilhada e os cinco
               cartões. Com as linhas já recortadas por marketplace, o "Sudeste
               = 61% dos pedidos" que ele mostra é desta loja, não do seller. */
            <RegionRollup rows={rows} />
          )}

        </>
      )}
    </div>
  );
}

export default LojaRegioesTab;
