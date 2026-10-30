import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent, type WheelEvent } from "react";
import { NODE_CATALOG } from "@/components/workflow/nodeCatalog";
import { getNodeStyle } from "@/utils/workflowColors";
import type { WorkflowEdge, WorkflowNode } from "@/types/workflow";
import { cn } from "@/lib/utils";
import { CartaoDaEtapa } from "@/app/blocos/CartaoDaEtapa";

/**
 * O fluxo aberto no celular, só para ver: cada etapa no lugar em que foi posta
 * no editor, as ligações entre elas, e o dedo arrasta e dá zoom no quadro.
 *
 * No site isto é o React Flow (@xyflow/react) em modo leitura. O app não traz
 * essa biblioteca (o editor fica no computador), então o quadro é desenhado
 * aqui com o mesmo cartão das etapas (BaseNode, com o cabeçalho de cada tipo em
 * CartaoDaEtapa), a mesma linha das ligações, o mesmo fundo de pontos e o mesmo
 * enquadramento inicial. O que fica de fora é o corpo do cartão (o resumo da
 * configuração e os rótulos das saídas): ele mora nos componentes de nó do
 * editor, que dependem do React Flow.
 */

type Vista = { x: number; y: number; k: number };
type Tamanho = { w: number; h: number };

// Os limites e a folga do enquadramento do site (minZoom 0.15, fitView padrão).
const ZOOM_MIN = 0.15;
const ZOOM_MAX = 2;
const FOLGA = 0.1;
const TAMANHO_PADRAO: Tamanho = { w: 220, h: 64 };

// Fundo de pontos do site (BackgroundVariant.Dots, gap 12, size 1, cor padrão do React Flow).
const PONTO_GAP = 12;
const PONTO_TAMANHO = 1;
const PONTO_COR = "#91919a";

const limitar = (k: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, k));

/** A aresta do site: curva da saída (embaixo) para a entrada (em cima). */
const caminhoDaAresta = (sx: number, sy: number, tx: number, ty: number) =>
  `M ${sx},${sy} C ${sx} ${sy + 50}, ${tx} ${ty - 50}, ${tx} ${ty}`;

export function FluxoSomenteLeitura({
  nodes,
  edges,
  noEmTeste,
}: {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  /** Etapa em que o teste interativo está, destacada como no site. */
  noEmTeste?: string | null;
}) {
  const quadroRef = useRef<HTMLDivElement>(null);
  const cartoesRef = useRef(new Map<string, HTMLDivElement>());
  const [tamanhos, setTamanhos] = useState<Record<string, Tamanho>>({});
  const [area, setArea] = useState<Tamanho | null>(null);
  const [vista, setVista] = useState<Vista | null>(null);
  const enquadrado = useRef(false);

  // Tamanho real de cada cartão (o título e o aviso mudam a altura) e do quadro.
  useLayoutEffect(() => {
    const medir = () => {
      const novos: Record<string, Tamanho> = {};
      cartoesRef.current.forEach((el, id) => {
        novos[id] = { w: el.offsetWidth, h: el.offsetHeight };
      });
      // Só troca o estado quando a medida muda: a lista de etapas chega como
      // array novo a cada recarga da lista e cada troca desenharia de novo.
      setTamanhos((atual) => (JSON.stringify(atual) === JSON.stringify(novos) ? atual : novos));
      const q = quadroRef.current;
      if (q) setArea((a) => (a && a.w === q.clientWidth && a.h === q.clientHeight ? a : { w: q.clientWidth, h: q.clientHeight }));
    };
    medir();
    const observador = new ResizeObserver(medir);
    cartoesRef.current.forEach((el) => observador.observe(el));
    if (quadroRef.current) observador.observe(quadroRef.current);
    return () => observador.disconnect();
  }, [nodes]);

  const tamanhoDe = useCallback((id: string) => tamanhos[id] ?? TAMANHO_PADRAO, [tamanhos]);

  // Enquadra o fluxo inteiro uma vez, depois de medir (o fitView do site).
  useEffect(() => {
    if (enquadrado.current || !area || area.w === 0 || area.h === 0) return;
    if (nodes.length > 0 && Object.keys(tamanhos).length < nodes.length) return;
    enquadrado.current = true;
    if (nodes.length === 0) {
      setVista({ x: area.w / 2, y: area.h / 2, k: 1 });
      return;
    }
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const n of nodes) {
      const t = tamanhoDe(n.id);
      x0 = Math.min(x0, n.position.x);
      y0 = Math.min(y0, n.position.y);
      x1 = Math.max(x1, n.position.x + t.w);
      y1 = Math.max(y1, n.position.y + t.h);
    }
    const larg = Math.max(1, x1 - x0);
    const alt = Math.max(1, y1 - y0);
    const k = limitar(Math.min(area.w / (larg * (1 + FOLGA)), area.h / (alt * (1 + FOLGA))));
    setVista({ x: area.w / 2 - (x0 + larg / 2) * k, y: area.h / 2 - (y0 + alt / 2) * k, k });
  }, [area, tamanhos, nodes, tamanhoDe]);

  /**
   * Saídas de cada etapa. A que tem mais de uma saída (condição, classificador,
   * aguardar resposta) espalha os pontos pela base do cartão, como os handles do
   * editor; a ordem segue a posição das etapas de destino, para as linhas não se
   * cruzarem à toa.
   */
  const saidas = useMemo(() => {
    const porNo = new Map<string, Map<string, number[]>>();
    const xDe = new Map(nodes.map((n) => [n.id, n.position.x]));
    for (const e of edges) {
      const handle = e.sourceHandle ?? "";
      const doNo = porNo.get(e.source) ?? new Map<string, number[]>();
      doNo.set(handle, [...(doNo.get(handle) ?? []), xDe.get(e.target) ?? 0]);
      porNo.set(e.source, doNo);
    }
    const fracao = new Map<string, Map<string, number>>();
    porNo.forEach((handles, id) => {
      const media = (xs: number[]) => xs.reduce((s, v) => s + v, 0) / xs.length;
      const ordem = [...handles.entries()].sort((a, b) => media(a[1]) - media(b[1])).map(([h]) => h);
      fracao.set(id, new Map(ordem.map((h, i) => [h, (i + 0.5) / ordem.length])));
    });
    return fracao;
  }, [nodes, edges]);

  const temEntrada = useMemo(() => new Set(edges.map((e) => e.target)), [edges]);
  const porId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  // --- Gestos: um dedo arrasta, dois dão zoom; a roda do mouse também dá zoom.
  const dedos = useRef(new Map<number, { x: number; y: number }>());
  const pinca = useRef<{ dist: number; mx: number; my: number } | null>(null);

  const pontoNoQuadro = (ev: { clientX: number; clientY: number }) => {
    const r = quadroRef.current!.getBoundingClientRect();
    return { x: ev.clientX - r.left, y: ev.clientY - r.top };
  };

  const zoomEm = (px: number, py: number, fator: number) =>
    setVista((v) => {
      if (!v) return v;
      const k = limitar(v.k * fator);
      const f = k / v.k;
      return { k, x: px - (px - v.x) * f, y: py - (py - v.y) * f };
    });

  const medirPinca = () => {
    const [a, b] = [...dedos.current.values()];
    return { dist: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
  };

  const aoTocar = (ev: PointerEvent<HTMLDivElement>) => {
    ev.currentTarget.setPointerCapture(ev.pointerId);
    dedos.current.set(ev.pointerId, pontoNoQuadro(ev));
    pinca.current = dedos.current.size === 2 ? medirPinca() : null;
  };

  const aoMover = (ev: PointerEvent<HTMLDivElement>) => {
    const antes = dedos.current.get(ev.pointerId);
    if (!antes) return;
    const agora = pontoNoQuadro(ev);
    dedos.current.set(ev.pointerId, agora);
    if (dedos.current.size === 1) {
      const dx = agora.x - antes.x;
      const dy = agora.y - antes.y;
      setVista((v) => (v ? { ...v, x: v.x + dx, y: v.y + dy } : v));
      return;
    }
    if (dedos.current.size === 2 && pinca.current) {
      const p = medirPinca();
      const anterior = pinca.current;
      pinca.current = p;
      setVista((v) => {
        if (!v || anterior.dist === 0) return v;
        const k = limitar(v.k * (p.dist / anterior.dist));
        const f = k / v.k;
        // Zoom em torno do meio dos dedos, e o quadro acompanha o meio que anda.
        return { k, x: p.mx - (anterior.mx - v.x) * f, y: p.my - (anterior.my - v.y) * f };
      });
    }
  };

  const aoSoltar = (ev: PointerEvent<HTMLDivElement>) => {
    dedos.current.delete(ev.pointerId);
    pinca.current = dedos.current.size === 2 ? medirPinca() : null;
  };

  const aoRolar = (ev: WheelEvent<HTMLDivElement>) => {
    const p = pontoNoQuadro(ev);
    zoomEm(p.x, p.y, Math.exp(-ev.deltaY * 0.002));
  };

  const v = vista ?? { x: 0, y: 0, k: 1 };
  const gap = PONTO_GAP * v.k;
  const raio = (PONTO_TAMANHO * v.k) / 2;

  return (
    <div
      ref={quadroRef}
      className="relative h-full w-full touch-none select-none overflow-hidden"
      onPointerDown={aoTocar}
      onPointerMove={aoMover}
      onPointerUp={aoSoltar}
      onPointerCancel={aoSoltar}
      onWheel={aoRolar}
    >
      <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
        <pattern
          id="fluxo-pontos"
          patternUnits="userSpaceOnUse"
          x={v.x % gap}
          y={v.y % gap}
          width={gap}
          height={gap}
          patternTransform={`translate(-${raio},-${raio})`}
        >
          <circle cx={raio} cy={raio} r={raio} fill={PONTO_COR} />
        </pattern>
        <rect width="100%" height="100%" fill="url(#fluxo-pontos)" />
      </svg>

      <div
        className={cn("pointer-events-none absolute left-0 top-0 origin-top-left", !vista && "invisible")}
        style={{ transform: `translate(${v.x}px, ${v.y}px) scale(${v.k})` }}
      >
        <svg className="absolute left-0 top-0 overflow-visible" width={1} height={1} aria-hidden>
          {edges.map((e) => {
            const de = porId.get(e.source);
            const para = porId.get(e.target);
            if (!de || !para) return null;
            const td = tamanhoDe(de.id);
            const tp = tamanhoDe(para.id);
            const f = saidas.get(de.id)?.get(e.sourceHandle ?? "") ?? 0.5;
            const d = caminhoDaAresta(
              de.position.x + td.w * f,
              de.position.y + td.h,
              para.position.x + tp.w / 2,
              para.position.y,
            );
            // Aresta animada, como a do site (tracejado que corre).
            return (
              <path key={e.id} d={d} fill="none" className="stroke-border" strokeWidth={2} strokeLinecap="round" strokeDasharray={5}>
                <animate attributeName="stroke-dashoffset" from="10" to="0" dur="0.5s" repeatCount="indefinite" />
              </path>
            );
          })}
        </svg>

        {nodes.map((n) => {
          const estilo = getNodeStyle(n.type);
          const t = tamanhoDe(n.id);
          const fracoes = [...(saidas.get(n.id)?.values() ?? [])];
          const ehGatilho = NODE_CATALOG[n.type]?.category === "Gatilhos";
          const alca = (left: number, top: number, chave: string) => (
            <span
              key={chave}
              className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{ left, top, background: "hsl(var(--card))", border: `2px solid ${estilo.accentHex}` }}
            />
          );
          return (
            <div
              key={n.id}
              ref={(el) => {
                if (el) cartoesRef.current.set(n.id, el);
                else cartoesRef.current.delete(n.id);
              }}
              // As classes do nó do React Flow levam o anel do teste do index.css.
              className={cn("react-flow__node absolute", noEmTeste === n.id && "workflow-node-active-test")}
              style={{ left: n.position.x, top: n.position.y }}
            >
              <CartaoDaEtapa no={n} />
              {(!ehGatilho || temEntrada.has(n.id)) && alca(t.w / 2, 0, "entrada")}
              {(fracoes.length ? fracoes : [0.5]).map((f, i) => alca(t.w * f, t.h, `saida-${i}`))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
