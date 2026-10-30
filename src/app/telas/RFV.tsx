import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, type TooltipProps,
} from "recharts";
import {
  AlertTriangle, DollarSign, Grid3x3, HelpCircle, Info, Loader2, Send, TrendingUp, Users, WifiOff,
} from "lucide-react";
import { useSellerContext } from "@/contexts/SellerContext";
import { useRfvSummary, type RfvSummary } from "@/hooks/useRfv";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ClientDetailSheet } from "@/components/crm/ClientDetailSheet";
import { avatarToneFor } from "@/components/clients/sections/shared";
import {
  Aviso, Bloco, Bolinha, CabecalhoTela, Distribuicao, Linha, Pilulas, Secao, textoPequeno,
} from "@/components/mobile/blocos";
import { tamanhoComum } from "@/components/mobile/tamanhoDoValor";
import { LayoutApp } from "@/app/LayoutApp";
import { useClientesDoSegmento } from "@/app/dados/useClientesDoSegmento";

/**
 * Análise RFV: o desenho de celular da página do site (src/pages/RFV.tsx, o
 * `conteudoMobile`). Os clientes classificados grandes, faturamento e LTV em
 * blocos, a matriz em quadrados tocáveis, os 11 segmentos em linhas (tocar
 * abre os clientes do segmento e, deles, a ficha), a situação da base e as
 * notas por eixo com R/F/V em pílulas. Mesmo resumo (`rfv_summary`), mesma
 * lista de clientes (`rfv_clients`, em dados/useClientesDoSegmento) e a mesma
 * ajuda. As regras de leitura (segmentOf, explicaSegmento, faixasDoEixo...)
 * moram na página do site e vêm com os mesmos nomes, para o diff de lá se
 * portar quase linha a linha.
 */

/** Verde da marca — o mesmo lugar que o vermelho ocupa no Segundo Pedido. */
const ACCENT = "#09AF68";

type Regua = RfvSummary["thresholds"] | undefined;
type Eixo = "R" | "F" | "V";

const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const num = (n: number) => n.toLocaleString("pt-BR");

const initials = (name?: string | null) => {
  if (!name) return "??";
  const p = name.trim().split(/\s+/);
  return ((p[0]?.[0] || "") + (p[1]?.[0] || "")).toUpperCase() || "??";
};

/**
 * Nome do segmento a partir das notas — espelha public.rfv_segment_name().
 * Precisa existir no cliente porque a matriz pinta TODAS as 25 células,
 * inclusive as que não têm nenhum cliente (a RPC só devolve as ocupadas).
 */
function segmentOf(r: number, fv: number): string {
  if (r >= 4 && fv >= 4) return "Campeões";
  if (r >= 4 && fv >= 2) return "Lealdade potencial";
  if (r === 5) return "Recentes";
  if (r === 4) return "Promissores";
  if (r === 3) return fv >= 3 ? "Leais" : "Precisam de atenção";
  if (r === 2) return fv >= 3 ? "Em risco" : "Prestes a dormir";
  if (fv >= 4) return "Não posso perdê-los";
  if (fv === 3) return "Hibernando";
  return "Perdidos";
}

/**
 * Situação = os 11 segmentos colapsados em 3 blocos. Espelha a coluna R da
 * matriz (R 4-5 ativo, R 2-3 esfriando, R 1 inativo) — se segmentOf() mudar,
 * esta constante muda junto.
 */
const SITUACAO: { name: string; color: string; segments: string[] }[] = [
  { name: "Ativos", color: "#16a34a", segments: ["Campeões", "Lealdade potencial", "Recentes", "Promissores"] },
  { name: "Esfriando", color: "#f59e0b", segments: ["Leais", "Precisam de atenção", "Em risco", "Prestes a dormir"] },
  { name: "Inativos", color: "#94a3b8", segments: ["Não posso perdê-los", "Hibernando", "Perdidos"] },
];

/** Explica em português a regra que define o segmento, com a régua da base. */
function explicaSegmento(seg: string, th: Regua): string {
  const d = th?.recency_days ?? [14, 28, 56, 98];
  // Cada segmento é um retângulo: um intervalo de Recência × uma faixa de F+V.
  // Duas frases curtas — uma por eixo — em vez de encadear "e … e … e".
  const box: Record<string, [number[], string]> = {
    "Campeões": [[4, 5], "Está no topo da base em número de pedidos e em quanto gasta."],
    "Lealdade potencial": [[4, 5], "Tem volume e gasto medianos — dá para crescer."],
    "Recentes": [[5], "Fez o primeiro pedido e ainda gastou pouco."],
    "Promissores": [[4], "Comprou poucas vezes e ainda gastou pouco."],
    "Leais": [[3], "Pede e gasta acima da média da base."],
    "Precisam de atenção": [[3], "Pede e gasta abaixo da média da base."],
    "Em risco": [[2], "Pedia e gastava bem antes de esfriar."],
    "Prestes a dormir": [[2], "Já comprava pouco e agora está esfriando."],
    "Não posso perdê-los": [[1], "Era dos que mais gastavam na base."],
    "Hibernando": [[1], "Tinha volume e gasto medianos."],
    "Perdidos": [[1, 2], "Comprou pouco e gastou pouco."],
  };
  const entry = box[seg];
  if (!entry) return "";
  const [rs, fvTxt] = entry;
  // Janela de dias do bloco: começa no piso da melhor nota de R e termina no
  // teto da pior. Nota 5 começa em 0; nota 1 não tem teto.
  const hi = Math.max(...rs);
  const lo = Math.min(...rs);
  const start = hi === 5 ? 0 : d[4 - hi] + 1;
  const end: number | null = lo === 1 ? null : d[5 - lo];
  const rTxt =
    end === null
      ? `Está há mais de ${start - 1} dias sem pedir.`
      : start === 0
        ? `Pediu nos últimos ${end} dias.`
        : start > d[2]
          ? `Está há ${start} a ${end} dias sem pedir.`
          : `Pediu entre ${start} e ${end} dias atrás.`;
  return `${rTxt} ${fvTxt}`;
}

/** O que cada nota de um eixo quer dizer, com o número real da régua. */
function explicaNota(eixo: Eixo, nota: number, th: Regua): string {
  const d = th?.recency_days ?? [14, 28, 56, 98];
  if (eixo === "R") {
    if (nota === 5) return `Pediu nos últimos ${d[0]} dias`;
    if (nota === 4) return `Último pedido entre ${d[0] + 1} e ${d[1]} dias`;
    if (nota === 3) return `Último pedido entre ${d[1] + 1} e ${d[2]} dias`;
    if (nota === 2) return `Último pedido entre ${d[2] + 1} e ${d[3]} dias`;
    return `Sem pedir há mais de ${d[3]} dias`;
  }
  if (eixo === "F") {
    return ({ 5: "11 pedidos ou mais", 4: "6 a 10 pedidos", 3: "3 a 5 pedidos", 2: "2 pedidos", 1: "1 pedido" } as Record<number, string>)[nota] ?? "";
  }
  const c = th?.value_cuts ?? [0, 0, 0, 0];
  const m = (x: number) => `R$ ${Math.round(Number(x)).toLocaleString("pt-BR")}`;
  if (nota === 5) return `Gastou mais de ${m(c[3])} (top 20% da base)`;
  if (nota === 4) return `Gastou de ${m(c[2])} a ${m(c[3])}`;
  if (nota === 3) return `Gastou de ${m(c[1])} a ${m(c[2])}`;
  if (nota === 2) return `Gastou de ${m(c[0])} a ${m(c[1])}`;
  return `Gastou até ${m(c[0])} (20% que menos gastam)`;
}

/**
 * As faixas de um eixo em formato de chip: critério curto + nota. Sempre de 5
 * para 1, a mesma ordem dos gráficos por eixo. R e V dependem da régua da
 * base — sem ela, o eixo fica sem chips.
 */
function faixasDoEixo(eixo: Eixo, th: Regua): { criterio: string; nota: number }[] {
  const notas = [5, 4, 3, 2, 1];
  const chips = (t: Record<number, string>) => notas.map((n) => ({ criterio: t[n], nota: n }));

  if (eixo === "F") {
    return chips({ 5: "11+ pedidos", 4: "6 a 10", 3: "3 a 5", 2: "2 pedidos", 1: "1 pedido" });
  }
  if (eixo === "R") {
    const d = th?.recency_days;
    if (!d) return [];
    return chips({
      5: `até ${d[0]}d`,
      4: `${d[0] + 1} a ${d[1]}d`,
      3: `${d[1] + 1} a ${d[2]}d`,
      2: `${d[2] + 1} a ${d[3]}d`,
      1: `mais de ${d[3]}d`,
    });
  }
  // Não basta o array existir: rede sem histórico volta value_cuts com quatro
  // NULLs (viraria "R$ 0" em tudo) e rede de ticket único volta os quatro cortes
  // iguais (viraria "R$ 50 a R$ 50" repetido). Nos dois casos a régua não separa
  // ninguém, então o eixo fica sem chips e sobra só a frase dos quintis.
  const cuts = th?.value_cuts;
  if (!Array.isArray(cuts) || cuts.some((x) => x == null) || !(Number(cuts[3]) > Number(cuts[0]))) return [];
  // A conta dos quintis já mora em explicaNota; aqui só encurta a frase para o
  // chip (tira o "Gastou" e o parêntese) — nada de recalcular os cortes.
  return notas.map((n) => ({
    criterio: explicaNota("V", n, th).replace(/^Gastou (de )?/, "").replace(/\s*\([^)]*\)$/, ""),
    nota: n,
  }));
}

/**
 * Um par "critério = nota". Cinza neutro de propósito: usar a paleta dos 11
 * segmentos aqui faria o usuário confundir nota com segmento.
 */
function ChipNota({ criterio, nota }: { criterio: string; nota: number }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2 py-[3px] text-[11px] leading-none whitespace-nowrap">
      <span className="text-muted-foreground">{criterio}</span>
      <span className="text-muted-foreground/50">=</span>
      <span className="font-semibold text-foreground tabular-nums">nota {nota}</span>
    </span>
  );
}

/**
 * Distribuição de um eixo (R, F ou V). No celular só o gráfico, sem o cartão
 * e o título: ele mora dentro da seção "Notas por eixo", com as abas.
 */
function AxisChart({ data, prefix, th }: { data: Record<string, number>; prefix: Eixo; th: Regua }) {
  const rows = [5, 4, 3, 2, 1].map((k) => ({
    label: `${prefix}${k}`, nota: k, clientes: data?.[String(k)] ?? 0,
  }));
  const gradId = `rfvGrad${prefix}`;
  // Maior valor da série: decide a largura reservada ao eixo Y. "10k" precisa
  // de mais espaço que "500".
  const maior = Math.max(...rows.map((r) => r.clientes), 0);
  const larguraY = maior >= 10000 ? 34 : maior >= 1000 ? 30 : 26;
  return (
    <ResponsiveContainer width="100%" height={170}>
      {/* Sem o cartão o gráfico encosta na borda da seção, e o primeiro dígito
          do eixo Y ("450") saía cortado: 6px de folga. */}
      <BarChart data={rows} margin={{ top: 10, right: 6, left: 6, bottom: 0 }} barCategoryGap="22%">
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={ACCENT} stopOpacity={0.95} />
            <stop offset="100%" stopColor={ACCENT} stopOpacity={0.55} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
        <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis
          width={larguraY}
          stroke="hsl(var(--muted-foreground))"
          tick={{ fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          tickCount={4}
          tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))}
        />
        {/* O tooltip explica O QUE a nota significa, com o número real da
            régua desta base — senão "R3" não diz nada para o usuário. */}
        <Tooltip
          cursor={{ fill: "rgba(9,175,104,0.06)" }}
          content={({ active, payload }: TooltipProps<number, string>) => {
            if (!active || !payload?.length) return null;
            const p = payload[0].payload as (typeof rows)[number];
            return (
              <div className="max-w-[230px] rounded-xl border border-border bg-popover px-3 py-2 shadow-lg">
                <p className="text-[12px] font-bold text-foreground">{p.label}</p>
                <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                  {explicaNota(prefix, p.nota, th)}
                </p>
                <p className="mt-1.5 text-[12px] font-semibold tabular-nums text-foreground">
                  {num(p.clientes)} clientes
                </p>
              </div>
            );
          }}
        />
        {/* isAnimationActive={false}: o gráfico monta com largura 0 e a
            animação de entrada não completava — os retângulos ficavam vazios. */}
        <Bar dataKey="clientes" fill={`url(#${gradId})`} radius={[6, 6, 0, 0]} maxBarSize={38} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/**
 * Matriz do celular: as 25 células como quadrados tocáveis, na cor do
 * segmento e com a contagem — o nome do segmento fica na lista logo abaixo,
 * porque em 60px de largura "Precisam de atenção" não cabe. Recência 1→5 da
 * esquerda para a direita, F+V 5→1 de cima para baixo.
 */
function MatrizCompacta({ summary, onPick }: { summary: RfvSummary; onPick: (seg: string) => void }) {
  const meta = summary.meta ?? [];
  const corDe = (seg: string) => meta.find((m) => m.name === seg)?.color ?? "#94a3b8";
  const cells = summary.matrix ?? [];
  const clientesEm = (r: number, fv: number) => cells.find((c) => c.r === r && c.fv === fv)?.clients ?? 0;

  return (
    <div className="flex gap-2">
      {/* Linhas de altura fixa (h-12, o mesmo das células): com flex-1 a
          coluna esticava até a legenda de baixo e os números escorregavam. */}
      <div className="grid grid-rows-[repeat(5,3rem)] gap-1 self-start text-[11px] font-semibold text-muted-foreground">
        {[5, 4, 3, 2, 1].map((fv) => (
          <span key={fv} className="flex items-center">{fv}</span>
        ))}
      </div>
      <div className="min-w-0 flex-1">
        <div className="grid grid-cols-5 gap-1">
          {[5, 4, 3, 2, 1].flatMap((fv) =>
            [1, 2, 3, 4, 5].map((r) => {
              const seg = segmentOf(r, fv);
              const n = clientesEm(r, fv);
              return (
                <button
                  key={`${r}-${fv}`}
                  type="button"
                  onClick={() => onPick(seg)}
                  aria-label={`${seg}: ${num(n)} clientes (R${r}, F+V ${fv})`}
                  className="flex h-12 items-center justify-center rounded-lg text-[12px] font-semibold tabular-nums text-foreground transition-transform active:scale-95"
                  style={{ background: `color-mix(in srgb, ${corDe(seg)} 30%, hsl(var(--card)))` }}
                >
                  {num(n)}
                </button>
              );
            }),
          )}
        </div>
        <div className="mt-1 grid h-5 grid-cols-5 text-center text-[11px] font-semibold text-muted-foreground">
          {[1, 2, 3, 4, 5].map((r) => (
            <span key={r} className="flex items-center justify-center">{r}</span>
          ))}
        </div>
        <p className="mt-1 text-center text-[11px] text-muted-foreground">Recência →  ·  ↑ Frequência e Valor</p>
      </div>
    </div>
  );
}

export default function RFV() {
  const { activeSeller } = useSellerContext();
  const navigate = useNavigate();
  const [eixoMobile, setEixoMobile] = useState<Eixo>("R");

  // O segmento fica guardado depois que a folha fecha: assim nome, regra e
  // lista não somem no meio da animação de saída.
  const [selected, setSelected] = useState<string | null>(null);
  const [folhaAberta, setFolhaAberta] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [detailClientId, setDetailClientId] = useState<string | null>(null);

  const resumo = useRfvSummary(activeSeller?.id);
  const { data, isLoading, error } = resumo;
  // Sem internet a consulta fica em espera (nem dado, nem erro, nem carregando)
  // e volta sozinha com a conexão: a tela não pode ficar vazia sem explicação.
  const semInternet = resumo.isPending && resumo.isPaused;

  const clientesQ = useClientesDoSegmento(activeSeller?.id, selected, folhaAberta);
  const clients = clientesQ.data;
  const loadingClients = clientesQ.isLoading;
  const clientesSemInternet = clientesQ.isPending && clientesQ.isPaused;

  const meta = data?.meta ?? [];
  const colorOf = (seg: string) => meta.find((m) => m.name === seg)?.color ?? "#94a3b8";
  const acaoOf = (seg: string) => meta.find((m) => m.name === seg)?.acao ?? "";

  const openSegment = (seg: string) => {
    setSelected(seg);
    setFolhaAberta(true);
  };

  const av = data?.availability;
  const th = data?.thresholds;

  const situacoes = (() => {
    if (!data) return [];
    const porSeg = new Map<string, { clients: number; revenue: number }>(
      (data.segments ?? []).map((sg) => [sg.segment, { clients: sg.clients, revenue: Number(sg.revenue) }]),
    );
    return SITUACAO.map((g) => {
      const clients = g.segments.reduce((acc, sg) => acc + (porSeg.get(sg)?.clients ?? 0), 0);
      const revenue = g.segments.reduce((acc, sg) => acc + (porSeg.get(sg)?.revenue ?? 0), 0);
      return { ...g, clients, revenue };
    });
  })();

  const totalClientes = clients?.length ?? 0;

  return (
    <LayoutApp>
      <div className="flex flex-col gap-7 px-4 pb-6 pt-4">
        <CabecalhoTela
          icone={Grid3x3}
          titulo="Análise RFV"
          direita={
            <button
              type="button"
              onClick={() => setHelpOpen(true)}
              className="flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-border/60 bg-card px-3 text-[13px] font-semibold text-foreground active:bg-muted"
            >
              <HelpCircle className="h-4 w-4 text-muted-foreground" />
              O que é
            </button>
          }
        />

        {isLoading && (
          <div className="flex items-center justify-center py-24 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        )}

        {semInternet && (
          <Aviso tom="neutro" icone={WifiOff} titulo="Sem internet">
            A análise aparece assim que a conexão voltar.
          </Aviso>
        )}

        {error && (
          <Aviso
            tom="vermelho"
            icone={AlertTriangle}
            titulo="Não foi possível calcular a análise"
            acao={{ rotulo: resumo.isFetching ? "Tentando…" : "Tentar de novo", onClick: () => void resumo.refetch() }}
          >
            {(error as Error)?.message}
          </Aviso>
        )}

        {data && av && !av.ready && (
          <div className="rounded-3xl border border-border/60 bg-card px-5 py-8 text-center">
            <Info className="mx-auto mb-3 h-9 w-9 text-muted-foreground opacity-60" />
            <h2 className="mb-1.5 text-base font-semibold text-foreground">Ainda não dá para calcular o RFV desta base</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {av.reason === "historico_curto"
                ? `A análise precisa de pelo menos ${av.min_days} dias de histórico de pedidos. Esta base tem ${av.days_history} dias — faltam cerca de ${Math.max(0, av.min_days - av.days_history)}.`
                : `A análise precisa de pelo menos ${av.min_repeat_clients} clientes com 2 ou mais pedidos. Esta base tem ${av.repeat_clients}.`}
            </p>
            <p className="mt-3 text-xs text-muted-foreground">Assim que os pedidos acumularem, a análise aparece sozinha.</p>
          </div>
        )}

        {data && av?.ready && (
          <>
            <div className="flex flex-col gap-5">
              <section>
                <p className="text-sm font-medium text-muted-foreground">Clientes classificados</p>
                <p className="mt-1 text-[38px] font-semibold leading-tight tracking-tight tabular-nums text-foreground">
                  {num(data.totals.clients)}
                </p>
                <p className="mt-1 text-[13px] text-muted-foreground">nos 11 segmentos · a base inteira, sem recorte de período</p>
              </section>
              <div className="grid grid-cols-2 gap-2">
                <Bloco
                  tamanho={tamanhoComum(brl(Number(data.totals.revenue)), brl(Number(data.totals.avg_ltv)))}
                  icone={DollarSign}
                  rotulo="Faturamento"
                  valor={brl(Number(data.totals.revenue))}
                  apoio={`${num(data.totals.orders)} pedidos`}
                />
                <Bloco
                  tamanho={tamanhoComum(brl(Number(data.totals.revenue)), brl(Number(data.totals.avg_ltv)))}
                  icone={TrendingUp}
                  rotulo="LTV médio"
                  valor={brl(Number(data.totals.avg_ltv))}
                  apoio="por cliente"
                />
              </div>
            </div>

            <Secao titulo="Matriz RFV" semLista>
              <div className="p-4">
                <MatrizCompacta summary={data} onPick={openSegment} />
                <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
                  Toque num quadrado para ver os clientes do segmento. Régua desta base: recompra mediana de{" "}
                  <strong>{th?.median_repurchase_days} dias</strong> — R5 até {th?.recency_days?.[0]}d, R4 até{" "}
                  {th?.recency_days?.[1]}d, R3 até {th?.recency_days?.[2]}d, R2 até {th?.recency_days?.[3]}d.
                </p>
              </div>
            </Secao>

            <Secao
              titulo="Segmentos"
              direita={textoPequeno("toque para ver os clientes")}
              topo={
                <Distribuicao
                  partes={[...meta]
                    .sort((a, b) => a.order - b.order)
                    .map((m) => ({
                      chave: m.name,
                      cor: m.color,
                      valor: data.segments.find((sg) => sg.segment === m.name)?.clients ?? 0,
                    }))}
                />
              }
            >
              {[...meta]
                .sort((a, b) => a.order - b.order)
                .map((m) => {
                  const sg = data.segments.find((x) => x.segment === m.name);
                  const clientes = sg?.clients ?? 0;
                  const receita = Number(sg?.revenue ?? 0);
                  const pc = data.totals.clients > 0 ? (clientes / data.totals.clients) * 100 : 0;
                  const pr = Number(data.totals.revenue) > 0 ? (receita / Number(data.totals.revenue)) * 100 : 0;
                  const razao = pc > 0 ? pr / pc : 0;
                  return (
                    <Linha
                      key={m.name}
                      onClick={() => openSegment(m.name)}
                      icone={
                        <Bolinha fundo={`${m.color}1f`}>
                          <span className="h-3 w-3 rounded-full" style={{ backgroundColor: m.color }} />
                        </Bolinha>
                      }
                      titulo={m.name}
                      apoio={`${num(clientes)} clientes · ${pc.toFixed(pc > 0 && pc < 1 ? 1 : 0)}%`}
                      valor={brl(receita)}
                      rodape={
                        razao >= 1.5 ? (
                          <span
                            className="rounded-md px-1.5 py-0.5 text-[11px] font-semibold tabular-nums"
                            style={{ background: "rgba(9,175,104,0.14)", color: ACCENT }}
                            title={`Vale ${razao.toFixed(1)}x o tamanho: ${pc.toFixed(1)}% dos clientes e ${pr.toFixed(1)}% do faturamento.`}
                          >
                            {razao.toFixed(1)}x o tamanho
                          </span>
                        ) : (
                          textoPequeno(`${pr.toFixed(0)}% do faturamento`)
                        )
                      }
                    />
                  );
                })}
            </Secao>

            <Secao
              titulo="Situação da base"
              topo={<Distribuicao partes={situacoes.map((g) => ({ chave: g.name, cor: g.color, valor: g.clients }))} />}
            >
              {situacoes.map((g) => {
                const pc = data.totals.clients > 0 ? (g.clients / data.totals.clients) * 100 : 0;
                const pr = Number(data.totals.revenue) > 0 ? (g.revenue / Number(data.totals.revenue)) * 100 : 0;
                return (
                  <Linha
                    key={g.name}
                    icone={
                      <Bolinha fundo={`${g.color}1f`}>
                        <span className="h-3 w-3 rounded-full" style={{ backgroundColor: g.color }} />
                      </Bolinha>
                    }
                    titulo={g.name}
                    apoio={`${num(g.clients)} clientes · ${pc.toFixed(0)}%`}
                    valor={brl(g.revenue)}
                    rodape={textoPequeno(`${pr.toFixed(0)}% do faturamento`)}
                  />
                );
              })}
            </Secao>

            <Secao titulo="Notas por eixo" semLista>
              <div className="p-4">
                <div className="-mx-4 mb-3 px-4">
                  <Pilulas
                    rotulo="Eixo"
                    opcoes={[
                      { value: "R", label: "Recência" },
                      { value: "F", label: "Frequência" },
                      { value: "V", label: "Valor" },
                    ]}
                    valor={eixoMobile}
                    onChange={(v) => setEixoMobile(v as Eixo)}
                  />
                </div>
                <AxisChart
                  prefix={eixoMobile}
                  data={eixoMobile === "R" ? data.by_r : eixoMobile === "F" ? data.by_f : data.by_v}
                  th={th}
                />
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {faixasDoEixo(eixoMobile, th).map((f) => (
                    <ChipNota key={f.nota} criterio={f.criterio} nota={f.nota} />
                  ))}
                </div>
              </div>
            </Secao>
          </>
        )}
      </div>

      {/* Clientes do segmento */}
      <Sheet open={folhaAberta} onOpenChange={setFolhaAberta}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto bg-background" aria-describedby={undefined}>
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2 text-foreground">
              <span className="h-3 w-3 rounded-full shrink-0" style={{ background: colorOf(selected ?? "") }} />
              {selected}
            </SheetTitle>
            <p className="text-xs text-muted-foreground mt-1">{acaoOf(selected ?? "")}</p>
          </SheetHeader>

          {/* Como este segmento é definido, com a régua real desta base. */}
          {!!explicaSegmento(selected ?? "", th) && (
            <div className="mt-4 rounded-xl bg-muted p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                Quem cai aqui
              </p>
              <p className="text-[12px] text-foreground leading-relaxed">
                {explicaSegmento(selected ?? "", th)}
              </p>
            </div>
          )}

          <div className="mt-5 flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              {loadingClients
                ? "Carregando…"
                : clients
                  ? `${num(totalClientes)} cliente${totalClientes === 1 ? "" : "s"}${totalClientes >= 100 ? " (100 primeiros)" : ""}`
                  : ""}
            </p>
            <Button
              size="sm"
              className="gap-2"
              onClick={() => navigate(`/clientes?rfv=${encodeURIComponent(selected ?? "")}`)}
            >
              <Send className="h-3.5 w-3.5" />
              Ver na lista e disparar
            </Button>
          </div>

          <div className="mt-4 space-y-2">
            {loadingClients && (
              <p className="text-sm text-muted-foreground py-8 text-center">Carregando...</p>
            )}
            {clientesSemInternet && (
              <Aviso tom="neutro" icone={WifiOff} titulo="Sem internet">
                Os clientes aparecem assim que a conexão voltar.
              </Aviso>
            )}
            {clientesQ.isError && (
              <Aviso
                tom="vermelho"
                icone={AlertTriangle}
                titulo="Não foi possível carregar os clientes"
                acao={{
                  rotulo: clientesQ.isFetching ? "Tentando…" : "Tentar de novo",
                  onClick: () => void clientesQ.refetch(),
                }}
              >
                A consulta falhou. Tente de novo em alguns instantes.
              </Aviso>
            )}
            {clients && totalClientes === 0 && (
              <div className="py-12 text-center space-y-2">
                <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                  <Users className="w-5 h-5 text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground">Nenhum cliente neste segmento.</p>
              </div>
            )}
            {(clients ?? []).map((c) => {
              const tone = avatarToneFor(c.full_name);
              return (
                <button
                  key={c.client_id}
                  type="button"
                  onClick={() => setDetailClientId(c.client_id)}
                  className="w-full text-left flex items-center gap-3 p-3 rounded-2xl bg-card shadow-sm transition-shadow active:bg-muted"
                >
                  <div
                    className="w-10 h-10 rounded-full text-sm font-bold flex items-center justify-center shrink-0"
                    style={{ background: tone.bg, color: tone.fg }}
                  >
                    {initials(c.full_name)}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">
                      {c.full_name || "Cliente sem nome"}
                    </p>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {c.total_orders} pedido{c.total_orders === 1 ? "" : "s"} · {brl(Number(c.total_spent || 0))} · há {c.recency_days}d
                    </p>
                  </div>

                  <span
                    className="text-[10px] font-semibold tabular-nums px-2 py-1 rounded-lg shrink-0 whitespace-nowrap"
                    style={{ background: `${colorOf(selected ?? "")}18`, color: colorOf(selected ?? "") }}
                    title={`Recência ${c.r} · Frequência ${c.f} · Valor ${c.v} (nota de 1 a 5 em cada eixo)`}
                  >
                    R{c.r} · F{c.f} · V{c.v}
                  </span>
                </button>
              );
            })}
          </div>

          {totalClientes > 0 && (
            <p className="mt-4 mb-2 text-[11px] text-muted-foreground leading-relaxed">
              <strong>R · F · V</strong> é a nota de 1 a 5 do cliente em cada eixo —
              Recência, Frequência e Valor. 5 é o melhor.
            </p>
          )}
        </SheetContent>
      </Sheet>

      {/* Ficha do cliente (a mesma do CRM e da lista) */}
      {detailClientId && activeSeller && (
        <ClientDetailSheet
          clientId={detailClientId}
          sellerId={activeSeller.id}
          open={!!detailClientId}
          onOpenChange={(o) => !o && setDetailClientId(null)}
        />
      )}

      {/* Ajuda */}
      <Sheet open={helpOpen} onOpenChange={setHelpOpen}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto bg-background" aria-describedby={undefined}>
          <SheetHeader>
            <SheetTitle className="text-foreground">O que é a Análise RFV</SheetTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Separa a base pelo comportamento de compra, não por quem o cliente é.
            </p>
          </SheetHeader>

          <div className="mt-6 space-y-5 text-[13px] text-muted-foreground leading-relaxed">
            <div>
              <p className="text-[13px] font-semibold text-foreground mb-2">As três notas</p>
              <div className="space-y-2.5">
                {[
                  {
                    letra: "R", nome: "Recência",
                    oque: "Há quanto tempo pediu. As faixas saem da recompra mediana desta base — não é a mesma régua para toda base.",
                    frase: null,
                    faixas: faixasDoEixo("R", th),
                  },
                  {
                    letra: "F", nome: "Frequência",
                    oque: "Quantos pedidos fez na janela.",
                    frase: null,
                    faixas: faixasDoEixo("F", th),
                  },
                  {
                    letra: "V", nome: "Valor",
                    oque: "Quanto gastou no período, comparado ao resto da base.",
                    frase: "A base é dividida em 5 fatias iguais: os 20% que mais gastam ficam com nota 5.",
                    faixas: faixasDoEixo("V", th),
                  },
                ].map(({ letra, nome, oque, frase, faixas }) => (
                  <div key={letra} className="flex gap-3 rounded-xl bg-muted p-3">
                    <span className="h-7 w-7 rounded-lg bg-card flex items-center justify-center text-[13px] font-bold text-foreground shrink-0">
                      {letra}
                    </span>
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold text-foreground">{nome}</p>
                      <p className="text-[12px] mt-0.5">{oque}</p>
                      {frase && <p className="text-[11px] text-muted-foreground mt-1">{frase}</p>}
                      {faixas.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {faixas.map((f) => (
                            <ChipNota key={f.nota} criterio={f.criterio} nota={f.nota} />
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <p className="text-[13px] font-semibold text-foreground mb-1.5">Como vira um segmento</p>
              <p>
                Frequência e Valor são combinados numa nota só (a média). O cruzamento dela
                com a Recência coloca o cliente em <strong>um</strong> dos 11 segmentos — e só um.
                É por isso que a matriz tem dois eixos e não três.
              </p>
            </div>

            <div>
              <p className="text-[13px] font-semibold text-foreground mb-1.5">Com que frequência atualiza</p>
              <p>
                Todo dia de madrugada. Se um cliente pedir hoje, amanhã ele já aparece no
                segmento novo — e a mudança pode disparar uma automação.
              </p>
            </div>

            <div>
              <p className="text-[13px] font-semibold text-foreground mb-1.5">Onde isso é usado</p>
              <ul className="space-y-1.5 list-disc pl-4">
                <li>Como <strong>filtro</strong> de público no Disparo Retroativo e na lista de clientes.</li>
                <li>Como <strong>gatilho</strong> nas Automações: “entrou em Em risco” dispara o fluxo.</li>
                <li>Como <strong>etiqueta</strong> no cliente, no card da conversa e no Kanban.</li>
              </ul>
            </div>

            <div>
              <p className="text-[13px] font-semibold text-foreground mb-1.5">É diferente do Kanban CRM</p>
              <p>
                O Kanban é onde <strong>a sua equipe</strong> colocou o cliente — muda por decisão de
                alguém. O RFV é <strong>observado</strong>: ninguém move ninguém, ele é recalculado a
                partir dos pedidos. Por isso um cliente pode ser “Campeão” e estar em “Aguardando
                resposta” ao mesmo tempo.
              </p>
            </div>

            <div className="rounded-xl bg-muted p-3">
              <p className="text-[12px] font-semibold text-foreground mb-1">Um cuidado</p>
              <p className="text-[12px]">
                O RFV descreve o passado, não prevê o futuro. Ele diz quem esfriou — não
                garante quem vai voltar. Serve para priorizar esforço, não para adivinhar.
              </p>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </LayoutApp>
  );
}
