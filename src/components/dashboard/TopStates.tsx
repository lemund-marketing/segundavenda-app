import { useMemo } from "react";
import { MapPin } from "lucide-react";
import type { RegionRow } from "@/hooks/useRegioes";
import { ESTADOS_BR } from "@/components/regioes/estadosBrasil";
import { ACCENT, EmptyState, Medalhao, PanelCard, PanelAction, RowFill, brl, int, pct } from "./shared";

/**
 * Estados que mais pedem, com atalho para a aba Regiões.
 *
 * Mostra TODOS os estados com venda, com rolagem (28/08/2026). Antes cortava
 * nos 10 primeiros: com 26 dos 27 estados vendendo, o card dizia "26 estados
 * com venda no período" no subtítulo e listava 10 — e os 16 restantes não
 * tinham nenhuma outra tela onde aparecer em ranking.
 *
 * A lista PREENCHE a altura do card (pedido de 20/08: "mostrando os estados até
 * o final da altura do box"). O truque é a `ul` absoluta dentro de um wrapper
 * `flex-1`: assim ela ocupa tudo o que sobra — a altura vem do mapa ao lado — e
 * NÃO devolve altura para o grid. Com a lista no fluxo normal, os estados
 * empurravam o painel para além de 1600px e esticavam o mapa junto (medido).
 * É também o que dá a rolagem de graça: `overflow-y-auto` só rola porque o
 * container tem altura fixa vinda de fora.
 */

export function TopStates({
  data,
  limite,
  className,
  onSelecionar,
  right,
}: {
  data: RegionRow[];
  /** Corta a lista nos N primeiros. Sem passar, mostra todos (com rolagem). */
  limite?: number;
  className?: string;
  /** Quando presente, cada linha vira botão (abre o detalhe do estado). */
  onSelecionar?: (uf: string) => void;
  /** Ação do header. Sem passar, usa "Ver regiões"; `null` esconde (na própria
   *  aba Regiões o atalho para Regiões seria apontar para onde já se está). */
  right?: React.ReactNode;
}) {
  const total = useMemo(() => data.reduce((s, r) => s + r.orders, 0), [data]);

  const topo = useMemo(() => {
    const ordenado = [...data].sort((a, b) => b.orders - a.orders);
    return limite ? ordenado.slice(0, limite) : ordenado;
  }, [data, limite]);

  const lider = topo[0]?.orders ?? 0;

  return (
    <PanelCard
      className={className}
      icon={MapPin}
      title="Estados com mais pedidos"
      subtitle={data.length ? `${data.length} estados com venda no período` : undefined}
      right={right === undefined ? <PanelAction to="/regioes">Ver regiões</PanelAction> : right}
    >
      {!topo.length ? (
        <EmptyState height={200}>Nenhum pedido com endereço identificado</EmptyState>
      ) : (
        <div className="relative min-h-[220px] flex-1">
          {/* pr-1.5 abre espaço para a barra de rolagem não encostar no conteúdo. */}
          <ul className="absolute inset-0 space-y-1 overflow-y-auto pr-1.5">
            {topo.map((r, i) => {
              const share = lider > 0 ? r.orders / lider : 0;
              const parte = total > 0 ? (r.orders / total) * 100 : 0;
              return (
                <li
                  key={r.uf}
                  onClick={onSelecionar ? () => onSelecionar(r.uf) : undefined}
                  className={`group relative overflow-hidden rounded-xl transition-all ${
                    onSelecionar ? "cursor-pointer" : ""
                  } hover:bg-muted/50`}
                >
                  {/* Preenchimento proporcional como FUNDO da linha (shared).
                      Substitui a barra que existia até 20/08 e gastava uma
                      linha inteira por estado. */}
                  <RowFill share={share} />

                  <div className="relative flex items-center gap-3 px-2.5 py-2.5">
                    <Medalhao pos={i} />

                    {/* min-w-0 + truncate: sem os dois, "Rio Grande do Sul" empurrava a
                        coluna do dinheiro para fora em painel estreito de notebook. */}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-foreground">
                        {ESTADOS_BR[r.uf]?.name ?? r.uf}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {r.uf} · {int(r.clients)} clientes · {int(r.orders)} pedidos
                      </p>
                    </div>

                    <div className="shrink-0 text-right">
                      <p className="text-sm font-bold tabular-nums" style={{ color: ACCENT }}>
                        {brl(r.revenue)}
                      </p>
                      <p className="text-[11px] tabular-nums text-muted-foreground">
                        ticket {brl(r.avg_ticket)}
                        {total > 0 && <> · {pct(parte, 0)}</>}
                      </p>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </PanelCard>
  );
}
