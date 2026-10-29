import { useMemo } from "react";
import { AlertTriangle, Calendar, DollarSign, MessageCircle, TrendingUp, UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Aviso, Bloco, Selo, pct1 } from "@/components/mobile/blocos";
import { tamanhoComum } from "@/components/mobile/tamanhoDoValor";
import { brl, int, variacao } from "@/components/dashboard/shared";
import { usePedidosKpis, type PedidosDataFilters } from "@/hooks/usePedidosKpis";
import { useWhatsAppConversao7d } from "@/hooks/useWhatsAppConversao7d";
import { cn } from "@/lib/utils";

interface Props {
  sellerId: string | null | undefined;
  /** ISO — o MESMO recorte da lista */
  start: string;
  end: string;
  filters?: PedidosDataFilters;
  /** "últimos 30 dias", "de 01/10 a 15/10"… — vai no rótulo do número grande */
  rotuloPeriodo: string;
  /** "30 dias antes" — com o que a variação compara */
  rotuloComparacao: string;
}

/**
 * Os mesmos 6 indicadores do PedidosKpis, no desenho do celular (22/10/2026):
 * o total de pedidos grande no topo com a variação, como o faturamento do
 * Dashboard; receita, ticket, hoje e clientes novos em blocos; e o "Compraram
 * em 7d" do WhatsApp num bloco largo com a barra da fatia que comprou.
 *
 * Mesmas consultas e mesmas contas do PedidosKpis (os textos de ajuda de cada
 * número moram lá); aqui só muda o desenho.
 */
export function PedidosKpisMobile({ sellerId, start, end, filters, rotuloPeriodo, rotuloComparacao }: Props) {
  const { data: k, isLoading, isError, refetch, isFetching } = usePedidosKpis(sellerId, start, end, filters ?? {});
  const conv = useWhatsAppConversao7d(sellerId, start, end);
  const carregando = !isError && (isLoading || !k);

  // Média diária do período, o denominador do "Pedidos hoje" (mesma conta do PedidosKpis).
  const mediaDiaria = useMemo(() => {
    if (!k) return 0;
    const dias = Math.max(1, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86400000));
    return k.total_orders / dias;
  }, [k, start, end]);

  if (isError) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-3xl border border-border/60 bg-card px-6 py-8 text-center">
        <AlertTriangle className="h-6 w-6 text-muted-foreground" />
        <p className="text-sm font-medium text-foreground">Não foi possível carregar os indicadores.</p>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Pode ser falta de permissão neste seller ou uma consulta que demorou demais.
        </p>
        <Button variant="outline" size="sm" className="rounded-full" onClick={() => refetch()} disabled={isFetching}>
          {isFetching ? "Tentando…" : "Tentar de novo"}
        </Button>
      </div>
    );
  }

  // Personalizado sem as duas datas aplicadas: a consulta nem sai (o hook fica
  // desligado), então o esqueleto ficaria pulsando para sempre.
  if (!start || !end) {
    return (
      <Aviso tom="neutro" icone={Calendar} titulo="Escolha as datas do período">
        Toque em <span className="font-medium text-foreground">Aplicar</span> para ver os números.
      </Aviso>
    );
  }

  if (carregando) {
    return (
      <div className="flex flex-col gap-5">
        <div className="space-y-2">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-10 w-32" />
          <Skeleton className="h-5 w-48" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[118px] rounded-3xl" />
          ))}
        </div>
      </div>
    );
  }

  const convPct =
    conv.data && conv.data.unique_recipients > 0 ? (conv.data.converted_clients / conv.data.unique_recipients) * 100 : 0;
  const convCarregando = !conv.isError && (conv.isLoading || !conv.data);
  const vsMedia = variacao(k.orders_today, mediaDiaria);

  return (
    <div className="flex flex-col gap-5">
      {/* O número da tela: pedidos no período, com a variação. */}
      <section>
        <p className="text-sm font-medium text-muted-foreground">Pedidos · {rotuloPeriodo}</p>
        <p className="mt-1 text-[38px] font-semibold leading-tight tracking-tight tabular-nums text-foreground">
          {int(k.total_orders)}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
          {k.prev_orders > 0 ? (
            <>
              <span
                className={cn(
                  "text-[15px] font-semibold tabular-nums",
                  k.total_orders >= k.prev_orders ? "text-emerald-600" : "text-rose-600",
                )}
              >
                {k.total_orders >= k.prev_orders ? "+" : "−"}
                {int(Math.abs(k.total_orders - k.prev_orders))}
              </span>
              <Selo atual={k.total_orders} anterior={k.prev_orders} base={int(k.prev_orders)} />
              <span className="text-[13px] text-muted-foreground">vs. {rotuloComparacao}</span>
            </>
          ) : (
            <span className="text-sm text-muted-foreground">Sem base no período anterior</span>
          )}
        </div>
      </section>

      <div className="grid grid-cols-2 gap-2">
        <Bloco
          tamanho={tamanhoComum(brl(k.total_revenue), brl(k.avg_ticket))}
          icone={DollarSign}
          rotulo="Receita"
          valor={brl(k.total_revenue)}
          selo={<Selo atual={k.total_revenue} anterior={k.prev_revenue} base={brl(k.prev_revenue)} />}
        />
        <Bloco
          tamanho={tamanhoComum(brl(k.total_revenue), brl(k.avg_ticket))}
          icone={TrendingUp}
          rotulo="Ticket médio"
          valor={brl(k.avg_ticket)}
          selo={<Selo atual={k.avg_ticket} anterior={k.prev_avg_ticket} base={brl(k.prev_avg_ticket)} />}
        />
        <Bloco
          tamanho={tamanhoComum(int(k.orders_today), int(k.new_clients))}
          icone={Calendar}
          rotulo="Pedidos hoje"
          valor={int(k.orders_today)}
          selo={vsMedia === null ? undefined : <Selo atual={k.orders_today} anterior={mediaDiaria} />}
          apoio={vsMedia === null ? "sem média do período" : "vs. média diária"}
        />
        <Bloco
          tamanho={tamanhoComum(int(k.orders_today), int(k.new_clients))}
          icone={UserPlus}
          rotulo="Clientes novos"
          valor={int(k.new_clients)}
          selo={<Selo atual={k.new_clients} anterior={k.prev_new_clients} base={int(k.prev_new_clients)} />}
        />
      </div>

      {/* "Compraram em 7d" da Performance do WhatsApp: não segue os filtros de canal e status. */}
      <div className="flex items-center gap-3 rounded-2xl border border-border/60 bg-card p-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <MessageCircle className="h-5 w-5" strokeWidth={2} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-medium text-muted-foreground">Compraram até 7 dias após o WhatsApp</p>
          <div className="mt-1 flex items-center gap-3">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
              <span
                className="block h-full rounded-full bg-primary transition-[width] duration-500"
                style={{ width: `${conv.isError || convCarregando ? 0 : Math.min(100, convPct)}%` }}
              />
            </div>
            {convCarregando ? (
              <Skeleton className="h-5 w-12" />
            ) : (
              <p className="shrink-0 text-[17px] font-bold tabular-nums text-foreground">
                {conv.isError ? "—" : `${pct1(convPct)}%`}
              </p>
            )}
          </div>
          <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
            {conv.isError
              ? "não deu para calcular neste período"
              : `${int(conv.data?.converted_clients ?? 0)} de ${int(conv.data?.unique_recipients ?? 0)} que receberam WhatsApp`}
          </p>
        </div>
      </div>
    </div>
  );
}

export default PedidosKpisMobile;
