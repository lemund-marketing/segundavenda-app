import { useQuery } from "@tanstack/react-query";
import { Cake, User } from "lucide-react";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import WhatsAppIcon from "@/components/WhatsAppIcon";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/utils/formatters";
import { openWhatsApp } from "@/utils/whatsapp";
import { avatarToneFor, getInitials } from "@/components/clients/sections/shared";
import type { ClientesFilterPayload } from "@/components/clients/clientesFilters";
import { filtersKey } from "@/hooks/useClientesKpis";

interface BirthdayRow {
  client_id: string;
  full_name: string | null;
  whatsapp: string | null;
  email: string | null;
  birthdate: string | null;
  age: number | null;
  total_orders: number | null;
  total_spent: number | null;
  last_order_at: string | null;
}

const LIMITE = 200;

interface BirthdayTodaySheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sellerId?: string | null;
  /** O mesmo recorte do card "Aniversariantes Hoje" — os dois contam junto. */
  filters?: ClientesFilterPayload;
  onSelectClient?: (clientId: string) => void;
}

const NO_FILTERS: ClientesFilterPayload = {};

function birthdayMessage(fullName: string | null) {
  const firstName = (fullName || "").trim().split(/\s+/)[0];
  const saudacao = firstName ? `Oi, ${firstName}!` : "Oi!";
  return `${saudacao} Passando aqui só para desejar um feliz aniversário. Que o seu dia seja ótimo! 🎉`;
}

export function BirthdayTodaySheet({
  open,
  onOpenChange,
  sellerId,
  filters = NO_FILTERS,
  onSelectClient,
}: BirthdayTodaySheetProps) {
  const { data: rows = [], isLoading } = useQuery<BirthdayRow[]>({
    queryKey: ["birthday-today-clients", sellerId, filtersKey(filters)],
    enabled: open && !!sellerId,
    queryFn: async () => {
      // Esta RPC não tem `_period_start`: o período vive dentro do payload.
      const { data, error } = await (supabase as any).rpc("list_birthday_today_clients", {
        _seller_id: sellerId,
        _limit: LIMITE,
        _filters: filters,
      });
      if (error) throw error;
      return (data || []) as BirthdayRow[];
    },
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md p-0 flex flex-col gap-0">
        <SheetHeader className="px-6 pt-6 pb-4 border-b border-border space-y-1.5 text-left">
          <SheetTitle className="flex items-center gap-2.5 pr-8 text-foreground">
            <span className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <Cake className="w-4 h-4" />
            </span>
            Aniversariantes de hoje
          </SheetTitle>
          <SheetDescription className="text-xs leading-relaxed">
            Uma mensagem no dia certo custa nada e é a desculpa mais natural para reabrir a conversa.
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
              <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                <Cake className="w-5 h-5 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium text-foreground">Ninguém faz aniversário hoje.</p>
              <p className="text-xs text-muted-foreground max-w-[16rem] mx-auto leading-relaxed">
                A lista se renova todo dia — amanhã ela já mostra os aniversariantes da data seguinte.
              </p>
            </div>
          )}

          {!isLoading &&
            rows.map((row) => {
              const tone = avatarToneFor(row.full_name);
              const nome = row.full_name || "Cliente sem nome";
              const pedidos = Number(row.total_orders || 0);
              const gasto = Number(row.total_spent || 0);

              return (
                <div
                  key={row.client_id}
                  className="flex items-center gap-3 p-3 rounded-2xl bg-card border border-border shadow-sm hover:shadow-hover transition-shadow"
                >
                  <div
                    className="w-10 h-10 rounded-full text-sm font-bold flex items-center justify-center shrink-0"
                    style={{ background: tone.bg, color: tone.fg }}
                  >
                    {getInitials(nome)}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{nome}</p>
                    <p className="text-xs text-primary font-medium">
                      {row.age ? `Faz ${row.age} anos hoje` : "Aniversário hoje"}
                    </p>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {pedidos} {pedidos === 1 ? "pedido" : "pedidos"} · {formatCurrency(gasto)}
                    </p>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {row.whatsapp && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-primary hover:bg-primary/10"
                        title="Parabenizar no WhatsApp"
                        onClick={() => openWhatsApp(row.whatsapp!, birthdayMessage(row.full_name))}
                      >
                        <WhatsAppIcon size={16} />
                      </Button>
                    )}
                    {onSelectClient && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-muted-foreground hover:text-foreground"
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
                </div>
              );
            })}

          {!isLoading && rows.length >= LIMITE && (
            <p className="pt-2 text-center text-xs text-muted-foreground leading-relaxed">
              Mostrando os {LIMITE} que mais gastaram — há mais aniversariantes hoje.
            </p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default BirthdayTodaySheet;
