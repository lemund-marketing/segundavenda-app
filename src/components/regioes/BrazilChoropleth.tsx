import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { RegionRow } from "@/hooks/useRegioes";
import { ACCENT, brl, int } from "@/components/dashboard/shared";
import { ALTURA_MAPA, METRICAS, type Metrica } from "./metricasMapa";
import { BRAZIL_VIEWBOX, ESTADOS_GEO } from "./brazilStatePaths";

/**
 * Escala sequencial do verde da marca. O mapa antigo misturava azul-escuro para
 * "muito alto" com verde para "alto" e azul-claro para "baixo" — três matizes
 * para uma grandeza só, que é o jeito mais rápido de tornar um choropleth
 * ilegível. Aqui é um matiz, cinco passos.
 *
 * Os dois primeiros passos eram quase brancos (#E6F6EF, #B3E5CE) e o mapa
 * inteiro lia como lavado: estado com venda mal se distinguia de estado sem.
 * A escala foi puxada para baixo mantendo a monotonia.
 */
const ESCALA = ["#BFEBD8", "#8ADCBA", "#4FC89A", "#1EAE7B", "#06895C"];
const SEM_DADO = "hsl(var(--muted))";

/** UFs de traçado estreito: sigla reduzida para caber dentro do desenho.
 *  Antes elas simplesmente não tinham rótulo ("viviam no ranking ao lado") e o
 *  usuário estranhou estados sem UF no mapa (20/08). DF é pequeno demais até
 *  para isso — ganha linha de chamada no render. */
const SIGLA_MENOR: Record<string, number> = { SE: 10, AL: 10, PB: 10, RN: 10 };

/**
 * Cortes por quantil sobre os valores > 0.
 *
 * Corte fixo pela média (o que o mapa antigo fazia) some com o contraste em
 * base concentrada: com SP somando 10× o segundo colocado, todo o resto cai no
 * mesmo balde. Quantil garante que cada faixa tenha estado dentro.
 *
 * Descarta corte >= máximo: `faixaDe` põe o valor na faixa do corte que ele
 * iguala, então a faixa acima do maior valor nunca receberia estado nenhum. Sem
 * isso, "taxa de 2ª venda" com metade dos estados em 100% rendia uma legenda
 * com "até 100%" repetido e um "acima de 100%" impossível.
 */
function cortesQuantil(valores: number[]): number[] {
  const v = valores.filter((x) => x > 0).sort((a, b) => a - b);
  if (!v.length) return [];
  const max = v[v.length - 1];
  const q = (p: number) => {
    const i = (v.length - 1) * p;
    const lo = Math.floor(i);
    const hi = Math.ceil(i);
    return lo === hi ? v[lo] : v[lo] + (v[hi] - v[lo]) * (i - lo);
  };
  return [...new Set([q(0.2), q(0.4), q(0.6), q(0.8)])].filter((c) => c < max);
}

/** n cores tiradas da ESCALA, sempre incluindo a mais escura no topo. */
function coresPara(n: number): string[] {
  if (n <= 1) return [ESCALA[ESCALA.length - 1]];
  return Array.from(
    { length: n },
    (_, i) => ESCALA[Math.round((i * (ESCALA.length - 1)) / (n - 1))],
  );
}

function faixaDe(valor: number, cortes: number[]): number {
  if (valor <= 0) return -1;
  let i = 0;
  while (i < cortes.length && valor > cortes[i]) i++;
  return i;
}

interface Props {
  rows: RegionRow[];
  metrica: Metrica;
  ufSelecionada: string | null;
  onSelecionar: (uf: string | null) => void;
  /**
   * Celular (22/10/2026): sem o cartão flutuante do estado (o toque já abre o
   * detalhe, e o cartão cobria metade do mapa), legenda numa fileira embaixo
   * em vez de caixa por cima, e o dedo rola a página sobre o mapa — o zoom é
   * da roda do mouse, que o celular não tem.
   */
  compacto?: boolean;
  /** Dica embaixo do mapa compacto, para quem não abre detalhe no toque. */
  dica?: string;
}



export function BrazilChoropleth({ rows, metrica, ufSelecionada, onSelecionar, compacto = false, dica }: Props) {
  const [hover, setHover] = useState<string | null>(null);

  /* ── Zoom com o scroll + arrastar para mover ─────────────────────────────
     Tudo via viewBox: nada de transform em CSS, senão stroke e rótulos
     engrossam junto. `vb` é a janela visível dentro do viewBox base. */
  const svgRef = useRef<SVGSVGElement | null>(null);
  const base = useMemo(() => {
    const [x, y, w, h] = BRAZIL_VIEWBOX.split(" ").map(Number);
    return { x, y, w, h };
  }, []);
  const [vb, setVb] = useState(() => ({ ...base }));
  const zoomAtivo = vb.w < base.w - 0.5;

  // Pan por arraste. `moveu` distingue arraste de clique: soltar o mouse depois
  // de arrastar sobre um estado NÃO pode selecionar o estado.
  const drag = useRef<{ x: number; y: number; moveu: boolean } | null>(null);
  const cliqueSuprimido = useRef(false);

  const prender = (nx: number, ny: number, w: number, h: number) => ({
    x: Math.min(Math.max(nx, base.x), base.x + base.w - w),
    y: Math.min(Math.max(ny, base.y), base.y + base.h - h),
    w,
    h,
  });

  // onWheel do React é passivo no documento — preventDefault não segura a
  // rolagem da página. Listener manual com passive:false resolve.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (ev: WheelEvent) => {
      ev.preventDefault();
      const rect = svg.getBoundingClientRect();
      setVb((atual) => {
        const fator = ev.deltaY > 0 ? 1.18 : 1 / 1.18;
        const w = Math.min(base.w, Math.max(base.w / 8, atual.w * fator));
        if (w === atual.w) return atual;
        const h = (w / base.w) * base.h;
        // ponto do cursor em coordenadas do mapa fica parado durante o zoom
        const px = atual.x + ((ev.clientX - rect.left) / rect.width) * atual.w;
        const py = atual.y + ((ev.clientY - rect.top) / rect.height) * atual.h;
        const nx = px - ((ev.clientX - rect.left) / rect.width) * w;
        const ny = py - ((ev.clientY - rect.top) / rect.height) * h;
        return prender(nx, ny, w, h);
      });
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base.w, base.h, base.x, base.y]);

  const onPointerDown = (ev: React.PointerEvent<SVGSVGElement>) => {
    if (!zoomAtivo) return;
    // NÃO capturar o ponteiro aqui: com capture ligado desde o pointerdown, o
    // navegador reendereça o CLICK para o svg e o onClick do estado nunca
    // dispara — com zoom, nenhum clique abria o sheet. A captura começa só
    // quando o movimento passa do limiar e o gesto vira arrasto de verdade.
    drag.current = { x: ev.clientX, y: ev.clientY, moveu: false };
  };
  const onPointerMove = (ev: React.PointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    const svg = svgRef.current;
    if (!d || !svg) return;
    const dx = ev.clientX - d.x;
    const dy = ev.clientY - d.y;
    if (!d.moveu && Math.abs(dx) + Math.abs(dy) > 3) {
      d.moveu = true;
      svg.setPointerCapture(ev.pointerId);
    }
    if (!d.moveu) return;
    const rect = svg.getBoundingClientRect();
    setVb((atual) =>
      prender(atual.x - (dx / rect.width) * atual.w, atual.y - (dy / rect.height) * atual.h, atual.w, atual.h),
    );
    d.x = ev.clientX;
    d.y = ev.clientY;
  };
  const onPointerUp = () => {
    cliqueSuprimido.current = !!drag.current?.moveu;
    drag.current = null;
  };
  const resetarZoom = () => setVb({ ...base });

  const porUf = useMemo(() => {
    const m = new Map<string, RegionRow>();
    rows.forEach((r) => m.set(r.uf, r));
    return m;
  }, [rows]);

  const meta = METRICAS.find((m) => m.key === metrica)!;

  /**
   * Faixas da escala. A deduplicação é feita sobre o RÓTULO já formatado, não
   * sobre o número cru: 2,8 e 3,2 pedidos são cortes distintos que viram "até 3"
   * nos dois casos, e duas faixas com o mesmo rótulo não significam nada para
   * quem lê.
   */
  const { cortes, cores } = useMemo(() => {
    const brutos = cortesQuantil(rows.map((r) => r[metrica] as number));
    const vistos = new Set<string>();
    const cs: number[] = [];
    for (const c of brutos) {
      const rotulo = meta.legendFmt(c);
      if (!vistos.has(rotulo)) {
        vistos.add(rotulo);
        cs.push(c);
      }
    }
    return { cortes: cs, cores: coresPara(cs.length + 1) };
  }, [rows, metrica, meta]);

  const lider = useMemo(() => {
    if (!rows.length) return null;
    return rows.reduce((b, r) =>
      (r[metrica] as number) > (b[metrica] as number) ? r : b,
    ).uf;
  }, [rows, metrica]);

  // `foco` comanda o realce e só existe com mouse/clique — se o líder entrasse
  // aqui, o mapa nasceria com 26 estados apagados. `exibida` comanda o cartão,
  // que cai no líder para a área à esquerda do mapa não ficar vazia.
  const foco = hover ?? ufSelecionada;
  const exibida = foco ?? lider;
  const dadosAtivos = exibida ? porUf.get(exibida) : null;
  const geoAtiva = exibida ? ESTADOS_GEO.find((e) => e.code === exibida) : null;

  const corDe = (uf: string) => {
    const row = porUf.get(uf);
    if (!row) return SEM_DADO;
    const f = faixaDe(row[metrica] as number, cortes);
    return f < 0 ? SEM_DADO : cores[Math.min(f, cores.length - 1)];
  };

  return (
    <div className="relative">
      {/* 520px fixos terminavam em y=916 num viewport de 801: o mapa saía pela
          dobra e a legenda de faixas (absolute bottom-2) ficava invisível. 340
          no notebook, 520 só a partir de 2xl (1536px). */}
      <svg
        ref={svgRef}
        viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
        className={cn(
          compacto ? "h-[330px] w-full select-none" : cn(ALTURA_MAPA, "w-full touch-none select-none"),
          zoomAtivo && "cursor-grab active:cursor-grabbing",
        )}
        role="img"
        aria-label="Mapa do Brasil por estado"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={resetarZoom}
      >
        <g>
          {ESTADOS_GEO.map((e) => {
            const row = porUf.get(e.code);
            const selecionado = ufSelecionada === e.code;
            const emFoco = hover === e.code;
            return (
              <path
                key={e.code}
                d={e.d}
                fill={corDe(e.code)}
                stroke={selecionado ? "hsl(var(--foreground))" : "hsl(var(--background))"}
                strokeWidth={selecionado ? 2 : 0.8}
                className={cn(
                  "cursor-pointer transition-[opacity,filter] duration-150",
                  emFoco && "opacity-90",
                  foco && !emFoco && !selecionado && "opacity-70",
                )}
                onMouseEnter={() => setHover(e.code)}
                onMouseLeave={() => setHover(null)}
                onClick={() => {
                  // Soltar o mouse depois de ARRASTAR o mapa não é um clique no
                  // estado — sem esta trava, todo pan terminava abrindo o sheet.
                  if (cliqueSuprimido.current) {
                    cliqueSuprimido.current = false;
                    return;
                  }
                  onSelecionar(selecionado ? null : e.code);
                }}
              >
                <title>{`${e.name}: ${row ? meta.fmt(row[metrica] as number) : "sem pedidos"}`}</title>
              </path>
            );
          })}

          {/* Sigla em TODOS os estados (20/08) — sem venda sai mais apagada. */}
          {ESTADOS_GEO.filter((e) => e.code !== "DF").map((e) => {
            const row = porUf.get(e.code);
            // Duas faixas mais escuras pedem texto branco — relativo à
            // quantidade de faixas, que varia com a distribuição.
            const escuro = row
              ? faixaDe(row[metrica] as number, cortes) >= cores.length - 2
              : false;
            return (
              <text
                key={`lbl-${e.code}`}
                x={e.labelX}
                y={e.labelY}
                textAnchor="middle"
                dominantBaseline="middle"
                className="pointer-events-none select-none"
                style={{
                  fontSize: SIGLA_MENOR[e.code] ?? 15,
                  fontWeight: 700,
                  // Estado pintado (faixa clara) leva o grafite fixo do claro: no
                  // escuro o --foreground vira quase branco e some no verde-claro.
                  // Sem dado (fundo --muted) segue o token.
                  fill: escuro
                    ? "#fff"
                    : row && (row[metrica] as number) > 0
                      ? "hsl(220 15% 15%)"
                      : "hsl(var(--foreground))",
                  opacity: row ? 0.85 : 0.5,
                }}
              >
                {e.code}
              </text>
            );
          })}

          {/* DF: menor que a própria sigla — linha de chamada até área livre. */}
          <line
            x1={409.4}
            y1={329.8}
            x2={430}
            y2={309}
            stroke="hsl(var(--muted-foreground))"
            strokeWidth={0.8}
            className="pointer-events-none"
          />
          <text
            x={434}
            y={306}
            textAnchor="start"
            dominantBaseline="middle"
            className="pointer-events-none select-none"
            // Halo branco: o rótulo pousa sobre MG, que nas faixas altas fica
            // verde-escuro — sem contorno o "DF" sumia.
            style={{
              fontSize: 10,
              fontWeight: 700,
              fill: "hsl(var(--foreground))",
              paintOrder: "stroke",
              stroke: "hsl(var(--background))",
              strokeWidth: 2.5,
              strokeLinejoin: "round",
            }}
          >
            DF
          </text>
        </g>
      </svg>

      {/* Cartão flutuante do estado em foco */}
      {!compacto && dadosAtivos && geoAtiva && (
        <div className="pointer-events-none absolute bottom-3 left-3 w-60 rounded-xl border border-border bg-popover/95 p-3 shadow-lg backdrop-blur">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-semibold text-foreground">{geoAtiva.name}</p>
            {!foco && (
              <span
                className="mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold"
                style={{ backgroundColor: `${ACCENT}1F`, color: ACCENT }}
              >
                líder
              </span>
            )}
          </div>
          <p className="mb-2 text-[11px] text-muted-foreground">{dadosAtivos.regiao}</p>
          <dl className="space-y-1 text-xs">
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Pedidos</dt>
              <dd className="font-semibold tabular-nums">{int(dadosAtivos.orders)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Receita</dt>
              <dd className="font-semibold tabular-nums">{brl(dadosAtivos.revenue)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Clientes</dt>
              <dd className="font-semibold tabular-nums">{int(dadosAtivos.clients)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Ticket médio</dt>
              <dd className="font-semibold tabular-nums">{brl(dadosAtivos.avg_ticket)}</dd>
            </div>
            {dadosAtivos.top_city && (
              <div className="flex justify-between gap-3 border-t border-border/60 pt-1">
                <dt className="text-muted-foreground">Cidade líder</dt>
                <dd className="truncate font-semibold" title={dadosAtivos.top_city}>
                  {dadosAtivos.top_city}
                </dd>
              </div>
            )}
          </dl>
        </div>
      )}

      {/* Legenda: só o teto de cada faixa. Mostrar "de – até" com corte de
          quantil arredondado produz faixas que se sobrepõem ou invertem; o teto
          é monotônico por construção. */}
      <div
        className={
          compacto
            ? "mt-2 text-[11px]"
            : "absolute bottom-2 right-2 rounded-xl border border-border bg-popover/95 p-3 text-[11px] shadow-sm backdrop-blur"
        }
      >
        <p className={cn("font-semibold text-foreground", compacto ? "mb-1" : "mb-1.5")}>{meta.label}</p>
        {!rows.length ? (
          <p className="text-muted-foreground">Sem dados no período</p>
        ) : (
          <ul className={compacto ? "flex flex-wrap gap-x-3 gap-y-1" : "space-y-1"}>
            {cores.map((cor, i) => {
              const ate = i < cortes.length ? cortes[i] : null;
              return (
                <li key={`${cor}-${i}`} className="flex items-center gap-2">
                  <span
                    className="h-3 w-3 rounded-sm"
                    style={{ backgroundColor: cor }}
                  />
                  <span className="tabular-nums text-muted-foreground">
                    {ate !== null
                      ? `até ${meta.legendFmt(ate)}`
                      : cortes.length
                        ? `acima de ${meta.legendFmt(cortes[cortes.length - 1])}`
                        : "todos os estados"}
                  </span>
                </li>
              );
            })}
            <li className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: SEM_DADO }} />
              <span className="text-muted-foreground">Sem pedidos</span>
            </li>
          </ul>
        )}
      </div>

      <p className={cn("text-[11px] text-muted-foreground", compacto ? "mt-3" : "mt-2 text-center")}>
        {compacto ? (
          (dica ?? "Toque num estado para abrir o detalhe")
        ) : (
          <>
            Clique num estado para abrir o detalhe · scroll dá zoom
            {zoomAtivo ? " · arraste para mover · duplo clique reajusta" : ""}
          </>
        )}
      </p>
    </div>
  );
}
