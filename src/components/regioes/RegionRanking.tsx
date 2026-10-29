import { useMemo } from "react";
import { Layers, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RegionRow } from "@/hooks/useRegioes";
import { ACCENT, EmptyState, PanelCard, brl, int, pct } from "@/components/dashboard/shared";
import { REGIOES } from "./estadosBrasil";
import { METRICAS, type Metrica } from "./metricasMapa";

/** Ranking de UF na métrica escolhida, com barra proporcional. */
export function RegionRanking({
  rows,
  metrica,
  ufSelecionada,
  onSelecionar,
}: {
  rows: RegionRow[];
  metrica: Metrica;
  ufSelecionada: string | null;
  onSelecionar: (uf: string | null) => void;
}) {
  const meta = METRICAS.find((m) => m.key === metrica)!;

  const ordenado = useMemo(
    () => [...rows].sort((a, b) => (b[metrica] as number) - (a[metrica] as number)),
    [rows, metrica],
  );

  const maior = ordenado.length ? (ordenado[0][metrica] as number) : 0;

  return (
    <PanelCard
      icon={Trophy}
      title={`Ranking por ${meta.label.toLowerCase()}`}
      subtitle={`${ordenado.length} estados com venda no período`}
    >
      {!ordenado.length ? (
        <EmptyState height={240} />
      ) : (
        <ul className="max-h-[460px] space-y-2 overflow-y-auto pr-1">
          {ordenado.map((r, i) => {
            const valor = r[metrica] as number;
            const largura = maior > 0 ? Math.max(1.5, (valor / maior) * 100) : 0;
            const sel = ufSelecionada === r.uf;
            return (
              <li key={r.uf}>
                <button
                  type="button"
                  onClick={() => onSelecionar(sel ? null : r.uf)}
                  className={cn(
                    "w-full rounded-lg px-2 py-2.5 text-left transition-colors",
                    sel ? "bg-muted" : "hover:bg-muted/60",
                  )}
                >
                  <div className="flex items-center gap-2 text-sm">
                    <span className="w-5 shrink-0 text-xs tabular-nums text-muted-foreground">
                      {i + 1}
                    </span>
                    <span className="w-8 shrink-0 font-semibold text-foreground">{r.uf}</span>
                    <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                      {r.top_city ?? "—"}
                    </span>
                    <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
                      {meta.fmt(valor)}
                    </span>
                  </div>
                  <div className="mt-1 ml-7 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${largura}%`, backgroundColor: ACCENT }}
                    />
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </PanelCard>
  );
}

/**
 * Rollup por região. O mapa antigo parava na contagem de pedidos por UF, então
 * "quanto o Nordeste pesa no faturamento?" não tinha onde ser respondido.
 */
export function RegionRollup({ rows }: { rows: RegionRow[] }) {
  const agrupado = useMemo(() => {
    const acc = new Map<
      string,
      { orders: number; revenue: number; clients: number; ufs: number }
    >();
    rows.forEach((r) => {
      if (!r.regiao) return;
      const cur = acc.get(r.regiao) ?? { orders: 0, revenue: 0, clients: 0, ufs: 0 };
      cur.orders += r.orders;
      cur.revenue += r.revenue;
      cur.clients += r.clients;
      cur.ufs += 1;
      acc.set(r.regiao, cur);
    });
    return REGIOES.map((nome) => ({ nome, ...(acc.get(nome) ?? null) })).filter(
      (x) => x.orders,
    ) as { nome: string; orders: number; revenue: number; clients: number; ufs: number }[];
  }, [rows]);

  const totalPedidos = agrupado.reduce((s, r) => s + r.orders, 0);
  const maiorShare = agrupado.reduce(
    (m, r) => Math.max(m, totalPedidos > 0 ? r.orders / totalPedidos : 0),
    0,
  );

  /** Tons de verde por região, do mais escuro (maior share) ao mais claro —
   *  a MESMA escala do mapa, para as duas leituras conversarem. */
  const TONS = ["#06895C", "#1EAE7B", "#4FC89A", "#8ADCBA", "#BFEBD8"];
  const ordenado = [...agrupado].sort((a, b) => b.orders - a.orders);
  const corDe = new Map(ordenado.map((r, i) => [r.nome, TONS[Math.min(i, TONS.length - 1)]]));

  return (
    <PanelCard
      icon={Layers}
      title="Por região"
      subtitle="Peso de cada região no período"
    >
      {!agrupado.length ? (
        <EmptyState height={180} />
      ) : (
        <div className="space-y-5">
          {/* Redesign de 21/08: no lugar da tabela seca, a barra empilhada dá o
              peso relativo num relance e os cards carregam os números. As cores
              seguem a escala do mapa acima — mesma linguagem. */}
          <div>
            <div className="flex h-3 w-full overflow-hidden rounded-full">
              {ordenado.map((r) => (
                <div
                  key={r.nome}
                  title={`${r.nome}: ${pct((r.orders / totalPedidos) * 100, 0)}`}
                  style={{
                    width: `${Math.max((r.orders / totalPedidos) * 100, 1.5)}%`,
                    backgroundColor: corDe.get(r.nome),
                  }}
                />
              ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
              {ordenado.map((r) => (
                <span key={r.nome} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: corDe.get(r.nome) }} />
                  {r.nome} · {pct((r.orders / totalPedidos) * 100, 0)}
                </span>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {ordenado.map((r) => {
              const share = totalPedidos > 0 ? (r.orders / totalPedidos) * 100 : 0;
              const ticket = r.orders > 0 ? r.revenue / r.orders : 0;
              const lider = maiorShare > 0 && r.orders / totalPedidos === maiorShare;
              return (
                <div
                  key={r.nome}
                  className="rounded-xl border border-border/60 bg-card p-3.5 transition-shadow hover:shadow-hover"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: corDe.get(r.nome) }} />
                      {r.nome}
                    </span>
                    {lider && (
                      <span
                        className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
                        style={{ backgroundColor: `${ACCENT}1A`, color: ACCENT }}
                      >
                        líder
                      </span>
                    )}
                  </div>
                  <p className="mt-2 text-xl font-bold leading-none tabular-nums text-foreground">
                    {pct(share, 0)}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    dos pedidos · {r.ufs} {r.ufs === 1 ? "UF" : "UFs"}
                  </p>
                  <dl className="mt-3 space-y-1 border-t border-border/50 pt-2 text-xs">
                    <div className="flex justify-between gap-2">
                      <dt className="text-muted-foreground">Pedidos</dt>
                      <dd className="tabular-nums font-medium text-foreground">{int(r.orders)}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-muted-foreground">Faturamento</dt>
                      <dd className="tabular-nums font-medium text-foreground">{brl(r.revenue)}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-muted-foreground">Clientes</dt>
                      <dd className="tabular-nums font-medium text-foreground">{int(r.clients)}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-muted-foreground">Ticket</dt>
                      <dd className="tabular-nums font-semibold" style={{ color: ACCENT }}>{brl(ticket)}</dd>
                    </div>
                  </dl>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </PanelCard>
  );
}
