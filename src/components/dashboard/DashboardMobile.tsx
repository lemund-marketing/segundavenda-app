import { Suspense, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ShoppingCart, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatMarketplaceName } from "@/utils/formatters";
import { getMarketplaceColor } from "@/utils/marketplaceColors";
import { useMarketplaceAliases } from "@/hooks/useMarketplaceAliases";
import type { CrmFunnel, DashboardOverview, MarketplaceRow, RecentOrder, RevenuePoint } from "@/hooks/useDashboardV2";
import type { RegionRow } from "@/hooks/useRegioes";
import { RankingEstados } from "@/components/regioes/RankingEstados";
import { DAY_KEY_FMT, localDoCliente, parseOrderDate } from "@/components/pedidos/orderRowShared";
import { getInitials } from "@/components/clients/sections/shared";
import { PedidoCardMobile } from "@/components/pedidos/PedidoCardMobile";
import { supabase } from "@/integrations/supabase/client";
// app: CRM e Regiões não têm tela no app; os links deles abrem o site.
import { noSite } from "@/app/site";
import { VerTudoNoSite } from "@/app/blocos/VerTudoNoSite";
import { RowFill, VAZIAS_NOMEADAS, brl, corSegura, int, variacao } from "./shared";
import {
  Bloco, BolinhaMarca, Distribuicao, Linha, Pilulas, Secao, Selo, ValorPartes, pct0,
} from "@/components/mobile/blocos";
import { tamanhoComum } from "@/components/mobile/tamanhoDoValor";
import { lazyComRecarga } from "@/utils/lazyComRecarga";
import { PedacoComFalha } from "@/components/PedacoComFalha";
import type { PontoCurva } from "./CurvaGrafico";

// Fora do pacote inicial (23/10/2026): a biblioteca de gráficos e a ficha do
// cliente (que só abre num toque) não precisam estar prontas para a tela abrir.
const CurvaGrafico = lazyComRecarga(() => import("./CurvaGrafico"), { recarregar: false });
const ClientDetailSheet = lazyComRecarga(
  () => import("@/components/crm/ClientDetailSheet").then((m) => ({ default: m.ClientDetailSheet })),
  { recarregar: false },
);

/**
 * Dashboard do celular, na estrutura do Phantom (decidido em 22/10/2026):
 * fundo claro, verde de destaque, o faturamento enorme no topo com a variação e
 * a curva do período embaixo; pedidos e clientes em blocos; e, no lugar dos
 * cards e da tabela do computador, uma seção por assunto, cada uma num cartão
 * com a barra de distribuição (quando faz sentido) e as linhas — ícone redondo,
 * nome e apoio, valor e variação à direita. O título da seção abre a tela
 * completa ("Marketplaces ›").
 *
 * Usa os MESMOS dados do Dashboard do computador (o pai faz as consultas) e
 * não tem regra de negócio própria: só muda o desenho. O mapa do Brasil não
 * entra aqui; as 5 UFs que mais vendem viram linhas e o toque abre o mesmo
 * detalhe do estado.
 */

export const PERIODOS_MOBILE = [
  { value: "7", label: "7 dias" },
  { value: "30", label: "30 dias" },
  { value: "90", label: "90 dias" },
  { value: "365", label: "1 ano" },
];

interface Props {
  sellerId: string;
  periodo: string;
  onPeriodo: (p: string) => void;
  days: number;
  /** Começo do período (o mesmo `startDate` das consultas): corta a semana/mês parcial da curva. */
  inicio: Date;
  d: DashboardOverview;
  serie: RevenuePoint[];
  funil: CrmFunnel | null;
  funilErro: boolean;
  lojas: MarketplaceRow[];
  pedidos: RecentOrder[];
  regioes: RegionRow[];
  onSelecionarUf: (uf: string) => void;
}

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** Rótulo de um ponto da curva a partir do balde "AAAA-MM-DD" (sem fuso no meio). */
function rotuloDoPonto(p: RevenuePoint): string {
  const [a, m, dia] = p.bucket.slice(0, 10).split("-");
  if (!a || !m || !dia) return "";
  return p.granularity === "month" ? `${MESES[Number(m) - 1] ?? m}/${a.slice(2)}` : `${dia}/${m}`;
}

/** "em 11/10", "na semana de 06/10", "em out/26" — o rótulo do topo enquanto o dedo escolhe um ponto. */
function rotuloDoTopo(p: RevenuePoint): string {
  if (p.granularity === "week") return `na semana de ${rotuloDoPonto(p)}`;
  return `em ${rotuloDoPonto(p)}`;
}

/** A ponta direita da curva: o balde que ainda está acontecendo. */
const ROTULO_ANDAMENTO: Record<RevenuePoint["granularity"], string> = {
  day: "hoje",
  week: "esta semana",
  month: "este mês",
};

const diaUTC = (iso: string) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));

/**
 * Os baldes que a curva desenha, contados no dia de São Paulo (o fuso da RPC):
 * - sai o que começa depois de hoje: num navegador a oeste de Brasília o fim
 *   do período (23:59 local) já é amanhã em SP e a RPC devolvia um balde vazio
 *   no fim, que virava o "hoje";
 * - sai o balde do começo quando o período começa bem depois do início dele
 *   (semana/mês cortados no meio, ou o dia de SP que, num aparelho a leste de
 *   Brasília, só tem as últimas horas): ele desenhava um penhasco na ponta
 *   esquerda e aparecia no topo como se fosse o balde inteiro. A comparação é
 *   por instante, com folga para o aparelho a oeste, que perde só as primeiras
 *   horas do balde de SP e o mantém;
 * - `emAndamento` diz se o último balde contém hoje.
 */
function baldesDaCurva(serie: RevenuePoint[], inicio: Date): { baldes: RevenuePoint[]; emAndamento: boolean } {
  const hoje = DAY_KEY_FMT.format(new Date());
  let baldes = serie.filter((p) => p.bucket.slice(0, 10) <= hoje);
  // SP não tem horário de verão desde 2019: o balde começa às 00:00 -03:00. A
  // folga cresce com o balde: 8h no dia (a oeste, até o Havaí, o aparelho perde
  // no máximo 7h do dia de SP; a leste ele perde 12h ou mais), 1 dia na
  // semana/mês. Perder só as primeiras horas não derruba o balde.
  const comecoDoBalde = Date.parse(`${baldes[0]?.bucket.slice(0, 10)}T00:00:00-03:00`);
  const folga = (baldes[0]?.granularity === "day" ? 8 : 24) * 3600_000;
  if (baldes.length > 2 && comecoDoBalde < inicio.getTime() - folga) {
    baldes = baldes.slice(1);
  }
  const ultimo = baldes[baldes.length - 1];
  let emAndamento = false;
  if (ultimo) {
    const b = ultimo.bucket.slice(0, 10);
    if (ultimo.granularity === "day") emAndamento = b === hoje;
    else if (ultimo.granularity === "week") emAndamento = diaUTC(hoje) - diaUTC(b) < 7 * 86400000;
    else emAndamento = b.slice(0, 7) === hoje.slice(0, 7);
  }
  return { baldes, emAndamento };
}

/**
 * A curva do faturamento por balde (dia, semana ou mês), redesenhada em 23/10
 * para tirar o que a deixava feia sem perder o desenho do período:
 * - a linha passa pela média de cada ponto com os vizinhos (1-2-1): o degrau
 *   do fim de semana vira onda, o movimento do mês continua lá (o dedo mostra
 *   no topo o valor de verdade de cada ponto);
 * - o balde em andamento (hoje vendeu só até agora) sai da linha cheia e entra
 *   como um trecho tracejado e claro, e fica fora da escala: senão, toda manhã,
 *   o valor parcial puxava o chão para o zero e espremia a curva no alto;
 * - a escala sai dos baldes fechados e deixa respiro embaixo, em vez de esticar
 *   a menor venda até o chão e transformar qualquer oscilação num penhasco.
 * O pai guarda `ponto` (o índice em `serie`, que já chega filtrada).
 */
function Curva({
  serie, emAndamento, ponto, onPonto,
}: {
  serie: RevenuePoint[];
  emAndamento: boolean;
  ponto: number | null;
  onPonto: (i: number | null) => void;
}) {
  const caixa = useRef<HTMLDivElement>(null);
  // Toque: só vira seleção quando o arrasto é na horizontal — começar a rolar a
  // página em cima da curva não pode mexer no número do topo.
  const toque = useRef<{ x: number; y: number; ativo: boolean } | null>(null);
  if (serie.length < 2) return null;

  const ultimo = serie.length - 1;
  const valores = serie.map((p) => p.revenue);
  // Suavização só entre os baldes fechados: o parcial de hoje não puxa ontem para baixo.
  const fechados = emAndamento ? valores.slice(0, ultimo) : valores;
  const suave = fechados.map((v, i) => ((fechados[i - 1] ?? v) + 2 * v + (fechados[i + 1] ?? v)) / 4);

  const menor = Math.min(...suave);
  const maior = Math.max(...suave, emAndamento ? valores[ultimo] : 0);
  const faixa = Math.max(maior - menor, maior * 0.05, 1);
  const dominio: [number, number] = [Math.max(0, menor - faixa * 0.9), maior + faixa * 0.08];
  // O parcial de hoje desce no máximo até o chão do gráfico (está fora da escala).
  const parcial = Math.max(valores[ultimo], dominio[0]);

  const dados: PontoCurva[] = valores.map((_, i) => ({
    i,
    linha: i < suave.length ? suave[i] : undefined,
    andamento: emAndamento && i >= ultimo - 1 ? (i < ultimo ? suave[i] : parcial) : undefined,
  }));
  const yDe = (i: number) => (i < suave.length ? suave[i] : parcial);

  const marcado = ponto ?? ultimo;
  const escolher = (clientX: number) => {
    const r = caixa.current?.getBoundingClientRect();
    if (!r || r.width <= 0) return;
    // A margem direita do gráfico (12px) fica fora do eixo.
    const largura = r.width - 12;
    const x = Math.min(Math.max(clientX - r.left, 0), largura);
    onPonto(Math.round((x / largura) * ultimo));
  };
  const soltar = () => {
    toque.current = null;
    onPonto(null);
  };

  return (
    <div>
      <div
        ref={caixa}
        role="img"
        aria-label={`Faturamento de ${rotuloDoPonto(serie[0])} até ${emAndamento ? ROTULO_ANDAMENTO[serie[ultimo].granularity] : rotuloDoPonto(serie[ultimo])}`}
        // pan-y: o arrasto na vertical continua rolando a página; na horizontal, escolhe o ponto.
        className="-mx-4 h-28 touch-pan-y select-none"
        onPointerDown={(e) => {
          // Dedo e caneta esperam o arrasto lateral; só o mouse escolhe no clique.
          if (e.pointerType !== "mouse") {
            toque.current = { x: e.clientX, y: e.clientY, ativo: false };
            return;
          }
          escolher(e.clientX);
        }}
        onPointerMove={(e) => {
          if (e.pointerType !== "mouse") {
            const t = toque.current;
            if (!t) return;
            if (!t.ativo) {
              const dx = Math.abs(e.clientX - t.x);
              if (dx <= 8 || dx <= Math.abs(e.clientY - t.y)) return;
              t.ativo = true;
              try {
                e.currentTarget.setPointerCapture(e.pointerId);
              } catch {
                // Ponteiro já solto (ou evento sintético): segue sem captura.
              }
            }
            escolher(e.clientX);
            return;
          }
          escolher(e.clientX);
        }}
        onPointerUp={soltar}
        onPointerLeave={soltar}
        onPointerCancel={soltar}
      >
        {/* O desenho (biblioteca de gráficos) chega num pedaço à parte: o número
            grande e os blocos aparecem antes, e a curva entra no espaço reservado. */}
        <PedacoComFalha>
          <Suspense fallback={null}>
            <CurvaGrafico
              dados={dados}
              ultimo={ultimo}
              dominio={dominio}
              emAndamento={emAndamento}
              ponto={ponto}
              marcado={marcado}
              yMarcado={yDe(marcado)}
            />
          </Suspense>
        </PedacoComFalha>
      </div>
      <div className="mt-1 flex justify-between text-[11px] tabular-nums text-muted-foreground">
        <span>{rotuloDoPonto(serie[0])}</span>
        <span>{emAndamento ? ROTULO_ANDAMENTO[serie[ultimo].granularity] : rotuloDoPonto(serie[ultimo])}</span>
      </div>
    </div>
  );
}

export function DashboardMobile({
  sellerId, periodo, onPeriodo, days, inicio, d, serie, funil, funilErro, lojas, pedidos, regioes, onSelecionarUf,
}: Props) {
  const { getDisplayName } = useMarketplaceAliases(sellerId);

  // Ponto escolhido na curva (arrastando o dedo). Sem ponto, o topo é o período inteiro.
  // O índice é na série JÁ filtrada para a curva, a mesma que o topo lê.
  const [ponto, setPonto] = useState<number | null>(null);
  const { baldes, emAndamento } = baldesDaCurva(serie, inicio);
  const noPonto = ponto !== null && ponto >= 0 && ponto < baldes.length ? baldes[ponto] : null;

  const diferenca = d.total_revenue - d.prev_total_revenue;
  const pctFaturamento = variacao(d.total_revenue, d.prev_total_revenue);
  const valorTopo = brl(noPonto ? noPonto.revenue : d.total_revenue);

  const marketplaces = [...lojas].sort((a, b) => b.total_revenue - a.total_revenue).slice(0, 5);
  const faturamentoCanais = lojas.reduce((s, m) => s + m.total_revenue, 0);
  const estados = [...regioes].sort((a, b) => b.orders - a.orders).slice(0, 5);
  const pedidosEstados = regioes.reduce((s, r) => s + r.orders, 0);
  const ultimos = pedidos.slice(0, 5);

  // Últimos pedidos no card da aba Pedidos (pedido de 23/10): o toque abre a
  // ficha do cliente e o atalho do WhatsApp marca o pedido como chamado, como
  // lá. A RPC da lista não traz `whatsapp_contacted_at`; a marca vem de uma
  // leitura à parte dos cinco pedidos (mesma RLS de leitura da aba Pedidos),
  // senão um pedido já chamado aparecia em verde aqui e cinza lá.
  const queryClient = useQueryClient();
  const idsUltimos = ultimos.map((o) => o.id);
  const chaveContatados = ["dash-ultimos-contatados", idsUltimos] as const;
  const contatados = useQuery({
    queryKey: chaveContatados,
    enabled: idsUltimos.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, whatsapp_contacted_at")
        .in("id", idsUltimos);
      if (error) throw error;
      return new Set((data ?? []).filter((r) => r.whatsapp_contacted_at).map((r) => r.id));
    },
  });
  const [clienteAberto, setClienteAberto] = useState<string | null>(null);
  const [fichaUsada, setFichaUsada] = useState(false);
  const [chamados, setChamados] = useState<Set<string>>(() => new Set());
  const chamarNoWhatsApp = (o: RecentOrder) => {
    const fone = o.clients?.whatsapp?.replace(/\D/g, "");
    if (!fone) return;
    // Abre ANTES de gravar: depois de um await o navegador trata a janela como
    // pop-up e pode bloquear.
    window.open(`https://wa.me/${fone}`, "_blank");
    // O círculo só apaga quando a marca foi gravada de fato: erro, ou nenhuma
    // linha alterada (RLS de quem não pode editar pedido), deixa como estava.
    supabase
      .from("orders")
      .update({ whatsapp_contacted_at: new Date().toISOString() })
      .eq("id", o.id)
      .select("id")
      .then(({ data, error }) => {
        if (error || !data?.length) {
          if (error) console.error("Erro ao marcar pedido como chamado:", error);
          return;
        }
        setChamados((s) => new Set(s).add(o.id));
        queryClient.invalidateQueries({ queryKey: chaveContatados });
      });
  };
  const fases = (funil?.stages ?? []).slice().sort((a, b) => a.position - b.position);
  // Funil como no computador (CrmFunnel): fase vazia não gasta linha, o fundo é
  // proporcional à MAIOR fase (uma de 12 clientes continua visível ao lado de
  // uma de 800) e a cor da fase nunca vira cor de texto.
  const fasesAtivas = fases.filter((f) => f.clients > 0 || f.value > 0);
  const fasesVazias = fases.filter((f) => !(f.clients > 0 || f.value > 0));
  const maiorFase = fasesAtivas.reduce((m, f) => Math.max(m, f.clients), 0);

  return (
    <div className="flex flex-col gap-7 px-4 pb-6 pt-4">
      {/* Período: as pílulas do topo, como as seções do Phantom. */}
      <Pilulas rotulo="Período" opcoes={PERIODOS_MOBILE} valor={periodo} onChange={onPeriodo} />

      {/* O número da tela e a curva do período. */}
      <section className="flex flex-col gap-3">
        <div>
          <p className="text-sm font-medium text-muted-foreground">
            {noPonto ? `Faturamento ${rotuloDoTopo(noPonto)}` : `Faturamento · últimos ${days} dias`}
          </p>
          <p
            className={cn(
              "mt-1 font-semibold leading-tight tracking-tight tabular-nums text-foreground",
              valorTopo.length > 15 ? "text-[30px]/tight" : "text-[38px]/tight",
            )}
          >
            <ValorPartes valor={valorTopo} />
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
            {noPonto ? (
              // Com o dedo na curva, a linha de baixo diz quantos pedidos fizeram aquele valor.
              <span className="text-[15px] font-semibold tabular-nums text-muted-foreground">
                {int(noPonto.orders)} {noPonto.orders === 1 ? "pedido" : "pedidos"}
                {emAndamento && ponto === baldes.length - 1 && <span className="font-normal"> · até agora</span>}
              </span>
            ) : pctFaturamento === null ? (
              <span className="text-sm text-muted-foreground">Sem base no período anterior</span>
            ) : (
              <>
                <span className={cn("text-[15px] font-semibold tabular-nums", diferenca >= 0 ? "text-emerald-600" : "text-rose-600")}>
                  {diferenca >= 0 ? "+" : "−"}{brl(Math.abs(diferenca))}
                </span>
                <Selo atual={d.total_revenue} anterior={d.prev_total_revenue} base={brl(d.prev_total_revenue)} />
                <span className="text-[13px] text-muted-foreground">vs. {days} dias antes</span>
              </>
            )}
          </div>
        </div>
        <Curva serie={baldes} emAndamento={emAndamento} ponto={noPonto ? ponto : null} onPonto={setPonto} />
      </section>

      {/* Os outros dois números da loja (Ticket médio saiu do celular a pedido, 22/10). */}
      <div className="grid grid-cols-2 gap-2">
        <Bloco
          tamanho={tamanhoComum(int(d.total_orders), int(d.unique_clients))}
          to="/pedidos"
          icone={ShoppingCart}
          rotulo="Pedidos"
          valor={int(d.total_orders)}
          selo={<Selo atual={d.total_orders} anterior={d.prev_total_orders} base={int(d.prev_total_orders)} />}
        />
        <Bloco
          tamanho={tamanhoComum(int(d.total_orders), int(d.unique_clients))}
          to="/clientes"
          icone={Users}
          rotulo="Clientes"
          valor={int(d.unique_clients)}
          selo={<Selo atual={d.unique_clients} anterior={d.prev_unique_clients} base={int(d.prev_unique_clients)} />}
        />
      </div>

      {marketplaces.length > 0 && (
        <Secao
          titulo="Marketplaces"
          to="/lojas"
          topo={
            <Distribuicao
              partes={marketplaces.map((m) => ({ chave: m.marketplace, cor: getMarketplaceColor(m.marketplace), valor: m.total_revenue }))}
            />
          }
        >
          {marketplaces.map((m) => {
            const cor = getMarketplaceColor(m.marketplace);
            const nome = getDisplayName(m.marketplace) ?? formatMarketplaceName(m.marketplace);
            const fatia = faturamentoCanais > 0 ? (m.total_revenue / faturamentoCanais) * 100 : 0;
            return (
              <Linha
                key={m.marketplace}
                to={`/lojas/${m.marketplace}`}
                icone={<BolinhaMarca cor={cor}>{getInitials(nome)}</BolinhaMarca>}
                titulo={nome}
                apoio={`${int(m.total_orders)} pedidos · ${pct0(fatia)}`}
                valor={brl(m.total_revenue)}
                rodape={<Selo atual={m.total_revenue} anterior={m.prev_revenue} base={brl(m.prev_revenue)} />}
              />
            );
          })}
        </Secao>
      )}

      {(fases.length > 0 || funilErro) && (
        <Secao
          titulo="Funil do CRM"
          direita={<VerTudoNoSite caminho="/crm" titulo="Funil do CRM" />} // app: abre o site
          semLista
          rodape={!funilErro && (funil?.no_stage ?? 0) > 0 ? `${int(funil!.no_stage)} clientes ainda sem fase` : undefined}
        >
          {funilErro ? (
            <p className="px-4 py-4 text-sm text-muted-foreground">Não foi possível carregar o funil agora.</p>
          ) : fasesAtivas.length === 0 ? (
            <p className="px-4 py-4 text-sm text-muted-foreground">Nenhum cliente nas {int(fases.length)} fases do Kanban ainda.</p>
          ) : (
            <div className="p-2">
              {/* Cada fase com o filete da cor dela (como a coluna no Kanban) e o
                  fundo proporcional, no desenho do ranking de Regiões — no lugar
                  da bolinha colorida (pedido de 23/10). */}
              <ul className="space-y-1">
                {fasesAtivas.map((f) => (
                  <li key={f.id} className="relative overflow-hidden rounded-xl">
                    {fasesAtivas.length > 1 && <RowFill share={maiorFase > 0 ? f.clients / maiorFase : 0} color={f.color} />}
                    {/* app: abre o CRM do site */}
                    <a
                      href={noSite("/crm")}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="relative flex items-center gap-3 rounded-xl px-2.5 py-2.5 transition-colors active:bg-muted/60"
                    >
                      <span className="h-8 w-1 shrink-0 rounded-full" style={{ backgroundColor: corSegura(f.color) }} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[15px] font-medium text-foreground">{f.name}</p>
                        <p className="truncate text-[12px] tabular-nums text-muted-foreground">{brl(f.value)}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-[15px] font-semibold tabular-nums text-foreground">{int(f.clients)}</p>
                        <p className="text-[11px] tabular-nums text-muted-foreground">
                          {funil?.total_base ? `${pct0((f.clients / funil.total_base) * 100)} da base` : f.clients === 1 ? "cliente" : "clientes"}
                        </p>
                      </div>
                    </a>
                  </li>
                ))}
              </ul>
              {fasesVazias.length > 0 && (
                <div className="mx-1 mb-1 mt-2 rounded-xl bg-muted/40 px-3 py-2.5">
                  <p className="text-[12px] font-medium text-foreground">
                    {fasesVazias.length === 1 ? "1 fase ainda sem cliente" : `${int(fasesVazias.length)} fases ainda sem cliente`}
                  </p>
                  {/* Quebra de linha e o mesmo teto do computador: nenhum nome some sem ser contado. */}
                  <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground">
                    {fasesVazias.slice(0, VAZIAS_NOMEADAS).map((f) => f.name).join(" · ")}
                    {fasesVazias.length > VAZIAS_NOMEADAS && ` e mais ${int(fasesVazias.length - VAZIAS_NOMEADAS)}`}
                  </p>
                </div>
              )}
            </div>
          )}
        </Secao>
      )}

      {/* Ranking verde, o mesmo da tela Regiões (pedido de 22/10). */}
      {estados.length > 0 && (
        <Secao titulo="Regiões" direita={<VerTudoNoSite caminho="/regioes" titulo="Regiões" />} semLista>
          {/* app: "Ver tudo" abre o site; o toque no estado abre a gaveta aqui mesmo */}
          <RankingEstados estados={estados} totalPedidos={pedidosEstados} onSelecionar={onSelecionarUf} />
        </Secao>
      )}

      {ultimos.length > 0 && (
        <Secao titulo="Últimos pedidos" to="/pedidos">
          {ultimos.map((o) => (
            <li key={o.id} className="px-4 py-3.5">
              <PedidoCardMobile
                nome={o.clients?.full_name || "Cliente não identificado"}
                total={o.total_amount}
                produto={o.product || "Produto não especificado"}
                data={parseOrderDate(o.acquired_at)}
                local={localDoCliente(o.clients)}
                marketplace={o.marketplace}
                // Sem a consulta de "o seller tem status além de aprovado" da aba
                // Pedidos: aqui o selo aparece só quando diz algo (cancelado, enviado…).
                status={o.order_status && o.order_status.toLowerCase() !== "approved" ? o.order_status : null}
                onAbrir={
                  o.client_id
                    ? () => {
                        setClienteAberto(o.client_id!);
                        setFichaUsada(true);
                      }
                    : undefined
                }
                whatsapp={
                  o.clients?.whatsapp
                    ? { contatado: chamados.has(o.id) || !!contatados.data?.has(o.id), onClick: () => chamarNoWhatsApp(o) }
                    : null
                }
                onEmail={o.clients?.email ? () => window.open(`mailto:${o.clients!.email}`, "_blank") : null}
              />
            </li>
          ))}
        </Secao>
      )}

      {/* Montada a partir do primeiro toque e mantida, para fechar com a animação. */}
      {fichaUsada && (
        <PedacoComFalha fallback={null} chave={clienteAberto}>
          <Suspense fallback={null}>
            <ClientDetailSheet
              clientId={clienteAberto}
              sellerId={sellerId}
              open={!!clienteAberto}
              onOpenChange={(aberto) => { if (!aberto) setClienteAberto(null); }}
            />
          </Suspense>
        </PedacoComFalha>
      )}
    </div>
  );
}
