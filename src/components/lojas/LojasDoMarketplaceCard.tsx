import { Store } from "lucide-react";
import { Bolinha, Linha, Secao } from "@/components/mobile/blocos";
import { useIsMobile } from "@/hooks/use-mobile";
import { formatCurrency } from "@/utils/formatters";
import type { LojaDoMarketplace } from "./lojaDetailQueries";

/**
 * Comparativo entre as LOJAS de um mesmo marketplace — a volta da visão que
 * existia antes do redesign de abril (morava no MarketplaceDetailModal, hoje
 * código morto). Só é montado quando o seller tem 2+ lojas com pedidos no
 * período; os números vêm de lojas_do_marketplace (compras agrupadas pela
 * regra canônica, não linhas de pedido).
 */
export function LojasDoMarketplaceCard({
  lojas,
  corBarra,
  onSelecionar,
}: {
  lojas: LojaDoMarketplace[];
  /** Cor da plataforma (ink da tela) para as barras de participação. */
  corBarra: string;
  onSelecionar: (storeId: string | null) => void;
}) {
  const receitaTotal = lojas.reduce((s, l) => s + l.receita, 0);
  const isMobile = useIsMobile();

  // Celular: uma linha por loja, com a fatia da receita numa barra embaixo.
  if (isMobile) {
    return (
      <Secao titulo="Lojas deste marketplace">
        {lojas.map((l) => {
          const share = receitaTotal > 0 ? (l.receita / receitaTotal) * 100 : 0;
          return (
            <Linha
              key={l.store_id ?? "__sem_loja"}
              onClick={l.store_id ? () => onSelecionar(l.store_id) : undefined}
              icone={
                <Bolinha neutra>
                  <Store className="h-[18px] w-[18px]" strokeWidth={2} />
                </Bolinha>
              }
              titulo={l.nome}
              apoio={`${l.pedidos.toLocaleString("pt-BR")} pedidos`}
              valor={formatCurrency(l.receita)}
              rodape={
                <span className="flex items-center gap-1.5 text-[12px] tabular-nums text-muted-foreground">
                  <span className="h-1.5 w-12 overflow-hidden rounded-full bg-muted">
                    <span
                      className="block h-full rounded-full"
                      style={{ width: `${Math.max(share, 2)}%`, backgroundColor: corBarra }}
                    />
                  </span>
                  {share.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%
                </span>
              }
            />
          );
        })}
      </Secao>
    );
  }

  return (
    <div className="rounded-lg bg-card shadow-sm p-5">
      <div className="flex items-center gap-2 mb-1">
        <Store className="w-4 h-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold text-foreground">Lojas deste marketplace</h3>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Compras por loja no período. Clique numa loja para focar nela.
      </p>

      <div className="space-y-3">
        {lojas.map((l) => {
          const share = receitaTotal > 0 ? (l.receita / receitaTotal) * 100 : 0;
          const ticket = l.pedidos > 0 ? l.receita / l.pedidos : 0;
          return (
            <button
              key={l.store_id ?? "__sem_loja"}
              type="button"
              // "Sem loja vinculada" não vira foco: não há store_id para filtrar.
              disabled={!l.store_id}
              onClick={() => l.store_id && onSelecionar(l.store_id)}
              className="w-full text-left rounded-md px-3 py-2.5 transition-colors enabled:hover:bg-muted/60 disabled:cursor-default"
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm font-medium text-foreground truncate">{l.nome}</span>
                <span className="text-sm font-semibold text-foreground whitespace-nowrap">
                  {formatCurrency(l.receita)}
                </span>
              </div>
              <div className="mt-1.5 h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${Math.max(share, 2)}%`, backgroundColor: corBarra }}
                />
              </div>
              <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-muted-foreground">
                <span>{share.toFixed(1)}% da receita</span>
                <span>{l.pedidos.toLocaleString("pt-BR")} pedidos</span>
                <span>{l.clientes.toLocaleString("pt-BR")} clientes</span>
                <span>ticket {formatCurrency(ticket)}</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
