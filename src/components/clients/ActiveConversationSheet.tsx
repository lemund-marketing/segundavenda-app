import { useQuery } from "@tanstack/react-query";
import { MessageCircle, ArrowUpRight, User } from "lucide-react";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { relativeLabel } from "@/utils/relativeDate";
import { avatarToneFor, getInitials, tintaPorTema } from "@/components/clients/sections/shared";
import type { ClientesFilterPayload } from "@/components/clients/clientesFilters";
import { filtersKey } from "@/hooks/useClientesKpis";
import { noSite } from "@/app/site";

interface ActiveConversationRow {
  client_id: string;
  full_name: string | null;
  whatsapp: string | null;
  conversation_id: string | null;
  channel: string | null;
  last_inbound_message_at: string | null;
  last_message_preview: string | null;
  unread_count: number | null;
  total_orders: number | null;
  total_spent: number | null;
}

interface ActiveConversationSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sellerId?: string | null;
  windowHours?: number;
  /** O mesmo recorte do card "Conversas Ativas" — os dois contam junto. */
  filters?: ClientesFilterPayload;
  onSelectClient?: (clientId: string) => void;
}

const LIMITE = 200;

const NO_FILTERS: ClientesFilterPayload = {};

const CHANNEL_META: Record<string, { label: string; className: string }> = {
  whatsapp: { label: "WhatsApp", className: "bg-primary/10 text-primary" },
  sms: { label: "SMS", className: "bg-blue-500/10 text-blue-600 dark:text-blue-400" },
  email: { label: "E-mail", className: "bg-violet-500/10 text-violet-600 dark:text-violet-400" },
};

const TONE_CLASS: Record<"fresh" | "muted" | "stale", string> = {
  fresh: "text-primary",
  muted: "text-muted-foreground",
  stale: "text-amber-600 dark:text-amber-500",
};

export function ActiveConversationSheet({
  open,
  onOpenChange,
  sellerId,
  windowHours = 24,
  filters = NO_FILTERS,
  onSelectClient,
}: ActiveConversationSheetProps) {
  const { data: rows = [], isLoading } = useQuery<ActiveConversationRow[]>({
    queryKey: ["active-conversation-clients", sellerId, windowHours, filtersKey(filters)],
    enabled: open && !!sellerId,
    queryFn: async () => {
      // Esta RPC não tem `_period_start`: o período vive dentro do payload.
      const { data, error } = await (supabase as any).rpc("list_active_conversation_clients", {
        _seller_id: sellerId,
        _window_hours: windowHours,
        _limit: LIMITE,
        _filters: filters,
      });
      if (error) throw error;
      return (data || []) as ActiveConversationRow[];
    },
  });

  // A página Omnichannel lê o parâmetro `client_id` da URL para abrir a conversa certa.
  const abrirConversa = (clientId: string) => {
    onOpenChange(false);
    // app: o Omnichannel ainda não tem tela no app; abre a conversa no site, no navegador.
    window.open(noSite(`/omnichannel?client_id=${clientId}`), "_blank", "noopener,noreferrer");
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md p-0 flex flex-col gap-0">
        <SheetHeader className="px-6 pt-6 pb-4 border-b border-border space-y-1.5 text-left">
          <SheetTitle className="flex items-center gap-2.5 pr-8 text-foreground">
            <span className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <MessageCircle className="w-4 h-4" />
            </span>
            Conversas com janela aberta
          </SheetTitle>
          <SheetDescription className="text-xs leading-relaxed">
            Clientes que responderam nas últimas {windowHours}h. Dentro dessa janela o WhatsApp
            permite mensagem livre; depois dela, só template aprovado.
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
                    <Skeleton className="h-3 w-full" />
                  </div>
                </div>
              ))}
            </>
          )}

          {!isLoading && rows.length === 0 && (
            <div className="py-16 text-center space-y-2">
              <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                <MessageCircle className="w-5 h-5 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium text-foreground">Nenhuma janela aberta agora.</p>
              <p className="text-xs text-muted-foreground max-w-[16rem] mx-auto leading-relaxed">
                Assim que um cliente responder, ele aparece aqui e você tem {windowHours}h para
                escrever livremente.
              </p>
            </div>
          )}

          {!isLoading &&
            rows.map((row) => {
              const tone = avatarToneFor(row.full_name);
              const nome = row.full_name || "Cliente sem nome";
              const canal = CHANNEL_META[(row.channel || "").toLowerCase()] ?? {
                label: row.channel || "Canal",
                className: "bg-muted text-muted-foreground",
              };
              const quando = relativeLabel(row.last_inbound_message_at);
              const naoLidas = Number(row.unread_count || 0);

              return (
                <div
                  key={row.client_id}
                  className="flex items-start gap-3 p-3 rounded-2xl bg-card border border-border shadow-sm hover:shadow-hover transition-shadow"
                >
                  <div
                    className="w-10 h-10 rounded-full text-sm font-bold flex items-center justify-center shrink-0 text-[color:var(--tinta)] dark:text-[color:var(--tinta-escura)]"
                    style={{ background: tone.bg, ...tintaPorTema(tone.fg, tone.base) }}
                  >
                    {getInitials(nome)}
                  </div>

                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{nome}</p>
                      {naoLidas > 0 && (
                        <span className="shrink-0 min-w-[1.25rem] h-5 px-1.5 rounded-full bg-primary text-primary-foreground text-[11px] font-bold flex items-center justify-center tabular-nums">
                          {naoLidas > 99 ? "99+" : naoLidas}
                        </span>
                      )}
                    </div>

                    {row.last_message_preview && (
                      <p className="text-xs text-muted-foreground truncate">
                        {row.last_message_preview}
                      </p>
                    )}

                    <div className="flex items-center gap-2 text-[11px]">
                      <span className={`px-1.5 py-0.5 rounded-md font-medium ${canal.className}`}>
                        {canal.label}
                      </span>
                      <span className={TONE_CLASS[quando.tone]}>{quando.text}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
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
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-primary hover:bg-primary/10"
                      title="Abrir conversa no WhatsApp"
                      onClick={() => abrirConversa(row.client_id)}
                    >
                      <ArrowUpRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              );
            })}

          {!isLoading && rows.length >= LIMITE && (
            <p className="pt-2 text-center text-xs text-muted-foreground leading-relaxed">
              Mostrando as {LIMITE} conversas mais recentes — há outras com janela aberta.
            </p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default ActiveConversationSheet;
