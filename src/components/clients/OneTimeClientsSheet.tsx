import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { UserMinus, ArrowRight, User } from "lucide-react";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StoreBadge } from "@/components/clients/StoreBadge";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/utils/formatters";
import { relativeLabel } from "@/utils/relativeDate";
import { avatarToneFor, getInitials, tintaPorTema } from "@/components/clients/sections/shared";
import type { ClientesFilterPayload } from "@/components/clients/clientesFilters";
import { filtersKey } from "@/hooks/useClientesKpis";

interface OneTimeRow {
  client_id: string;
  full_name: string | null;
  whatsapp: string | null;
  email: string | null;
  total_spent: number | null;
  last_order_at: string | null;
  store_key: string | null;
}

interface OneTimeClientsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sellerId?: string | null;
  periodStart: string;
  /** O mesmo recorte do card que abre este painel — senão card e lista brigam. */
  filters?: ClientesFilterPayload;
  onSelectClient?: (clientId: string) => void;
  /** Quando o pai já está na página de clientes, só fecha o sheet em vez de navegar. */
  onClose?: () => void;
}

const LIMITE = 200;

const TONE_CLASS: Record<"fresh" | "muted" | "stale", string> = {
  fresh: "text-primary",
  muted: "text-muted-foreground",
  stale: "text-amber-600 dark:text-amber-500",
};

const NO_FILTERS: ClientesFilterPayload = {};

export function OneTimeClientsSheet({
  open,
  onOpenChange,
  sellerId,
  periodStart,
  filters = NO_FILTERS,
  onSelectClient,
  onClose,
}: OneTimeClientsSheetProps) {
  const navigate = useNavigate();

  const { data: rows = [], isLoading } = useQuery<OneTimeRow[]>({
    queryKey: ["one-time-clients", sellerId, periodStart, filtersKey(filters)],
    enabled: open && !!sellerId,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("list_one_time_clients", {
        _seller_id: sellerId,
        _period_start: periodStart,
        _limit: LIMITE,
        // Argumentos legados nulos de propósito: o recorte inteiro vai por
        // `_filters`, e mandar o mesmo filtro pelos dois caminhos é como o
        // painel passa a discordar do card que o abriu.
        _min_orders: 0,
        _state_code: null,
        _search: null,
        _rfv_segments: null,
        _filters: filters,
      });
      if (error) throw error;
      return (data || []) as OneTimeRow[];
    },
  });

  const irParaLista = () => {
    onOpenChange(false);
    if (onClose) onClose();
    else navigate("/clientes");
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md p-0 flex flex-col gap-0">
        <SheetHeader className="px-6 pt-6 pb-4 border-b border-border space-y-1.5 text-left">
          <SheetTitle className="flex items-center gap-2.5 pr-8 text-foreground">
            <span className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <UserMinus className="w-4 h-4" />
            </span>
            Compraram uma vez e não voltaram
          </SheetTitle>
          <SheetDescription className="text-xs leading-relaxed">
            Ordenados por quanto gastaram — os do topo são o melhor alvo de uma campanha de recompra.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2">
          {isLoading && (
            <>
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex items-center gap-3 p-3 rounded-2xl border border-border">
                  <Skeleton className="w-10 h-10 rounded-full shrink-0" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-3.5 w-2/3" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </div>
              ))}
            </>
          )}

          {!isLoading && rows.length === 0 && (
            <div className="py-16 text-center space-y-2">
              <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <UserMinus className="w-5 h-5 text-primary" />
              </div>
              <p className="text-sm font-medium text-foreground">
                Todo mundo já comprou mais de uma vez.
              </p>
              <p className="text-xs text-muted-foreground max-w-[16rem] mx-auto leading-relaxed">
                Nenhum cliente ficou preso na primeira compra neste período. Siga assim.
              </p>
            </div>
          )}

          {!isLoading &&
            rows.map((row) => {
              const tone = avatarToneFor(row.full_name);
              const nome = row.full_name || "Cliente sem nome";
              const quando = relativeLabel(row.last_order_at);

              return (
                <div
                  key={row.client_id}
                  className="flex items-center gap-3 p-3 rounded-2xl bg-card border border-border shadow-sm hover:shadow-hover transition-shadow"
                >
                  <div
                    className="w-10 h-10 rounded-full text-sm font-bold flex items-center justify-center shrink-0 text-[color:var(--tinta)] dark:text-[color:var(--tinta-escura)]"
                    style={{ background: tone.bg, ...tintaPorTema(tone.fg, tone.base) }}
                  >
                    {getInitials(nome)}
                  </div>

                  <div className="flex-1 min-w-0 space-y-1">
                    <p className="text-sm font-semibold text-foreground truncate">{nome}</p>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {formatCurrency(Number(row.total_spent || 0))} na única compra
                    </p>
                    <div className="flex items-center gap-2 text-[11px]">
                      <StoreBadge storeKey={row.store_key} />
                      <span className={TONE_CLASS[quando.tone]}>{quando.text}</span>
                    </div>
                  </div>

                  {onSelectClient && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
                      title="Ver cliente"
                      onClick={() => {
                        onOpenChange(false);
                        onSelectClient(row.client_id);
                      }}
                    >
                      <User className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              );
            })}

          {/* O painel para em 200; sem este aviso o usuário conta os cards e
              acha que trabalhou a lista inteira. */}
          {!isLoading && rows.length >= LIMITE && (
            <p className="pt-2 text-center text-xs text-muted-foreground leading-relaxed">
              Mostrando os {LIMITE} que mais gastaram. Use os filtros da lista para chegar no resto.
            </p>
          )}
        </div>

        {!isLoading && rows.length > 0 && (
          <div className="px-6 py-4 border-t border-border">
            <Button
              className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={irParaLista}
            >
              Ver na lista e disparar
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

export default OneTimeClientsSheet;
