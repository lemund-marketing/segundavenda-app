import type { RegionRow } from "@/hooks/useRegioes";
import { ESTADOS_BR } from "@/components/regioes/estadosBrasil";
import { ACCENT, Medalhao, RowFill, brl, int, pct } from "@/components/dashboard/shared";

/**
 * Ranking de estados no celular, com os detalhes verdes do ranking do
 * computador (TopStates): medalhão de posição, fundo proporcional ao líder e
 * o faturamento em verde com "ticket · %" embaixo. Sem rolagem própria — vai
 * dentro do cartão de uma seção (Regiões e o Dashboard do celular).
 *
 * `estados` já vem ordenado (o primeiro é o líder); `totalPedidos` é o
 * denominador do percentual. Sem `onSelecionar` as linhas não são botões: no
 * detalhe do marketplace não há gaveta de estado para abrir (ver LojaRegioesTab).
 */
export function RankingEstados({
  estados,
  totalPedidos,
  onSelecionar,
}: {
  estados: RegionRow[];
  totalPedidos: number;
  onSelecionar?: (uf: string) => void;
}) {
  const lider = estados[0]?.orders ?? 0;
  return (
    <ul className="space-y-1 p-2">
      {estados.map((r, i) => {
        const parte = totalPedidos > 0 ? (r.orders / totalPedidos) * 100 : 0;
        const miolo = (
          <>
            <Medalhao pos={i} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-medium text-foreground">{ESTADOS_BR[r.uf]?.name ?? r.uf}</p>
              <p className="truncate text-[12px] text-muted-foreground">
                {r.uf} · {int(r.clients)} clientes · {int(r.orders)} pedidos
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-[15px] font-semibold tabular-nums" style={{ color: ACCENT }}>
                {brl(r.revenue)}
              </p>
              <p className="text-[11px] tabular-nums text-muted-foreground">
                ticket {brl(r.avg_ticket)}
                {totalPedidos > 0 && <> · {pct(parte, 0)}</>}
              </p>
            </div>
          </>
        );
        const classe = "relative flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left";
        return (
          <li key={r.uf} className="relative overflow-hidden rounded-xl">
            <RowFill share={lider > 0 ? r.orders / lider : 0} />
            {onSelecionar ? (
              <button
                type="button"
                onClick={() => onSelecionar(r.uf)}
                className={`${classe} transition-colors active:bg-muted/60`}
              >
                {miolo}
              </button>
            ) : (
              <div className={classe}>{miolo}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
