import { useMemo } from "react";
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useClientDetail } from "@/components/clients/sections/useClientDetail";
import { ClientHeader } from "@/components/clients/sections/ClientHeader";
import { ClientOverviewTab } from "@/components/clients/sections/ClientOverviewTab";
import { ClientBehaviorTab } from "@/components/clients/sections/ClientBehaviorTab";
import { ClientOrdersTab } from "@/components/clients/sections/ClientOrdersTab";
import { ClientHistoryTab } from "@/components/clients/sections/ClientHistoryTab";
import type { ClientSavedPatch } from "@/components/clients/EditClientDialog";
import { maskFullName } from "@/utils/showcaseMask";
import { noSite } from "@/app/site";

interface ClientDetailSheetProps {
  clientId: string | null;
  sellerId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Vitrine do admin: esconde dados pessoais do cliente. */
  masked?: boolean;
  /** Cadastro editado aqui dentro: para a tela de trás recarregar a linha da lista. */
  onClientSaved?: (patch: ClientSavedPatch) => void;
}

export function ClientDetailSheet({ clientId, sellerId, open, onOpenChange, masked = false, onClientSaved }: ClientDetailSheetProps) {
  const { data } = useClientDetail(clientId, sellerId, { enabled: open });

  const client = data?.client;
  const orders = data?.orders ?? [];
  const messages = data?.messages ?? [];
  const smsMessages = data?.smsMessages ?? [];
  const emailLogs = data?.emailLogs ?? [];
  const wflows = data?.wflows ?? [];
  const interactions = data?.interactions ?? [];

  const isWindowOpen = useMemo(() => {
    const last = data?.conversation?.last_inbound_message_at;
    return !!last && Date.now() - new Date(last).getTime() < 24 * 60 * 60 * 1000;
  }, [data?.conversation]);

  if (!client) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full sm:max-w-[600px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="sr-only">Cliente</SheetTitle>
            <SheetDescription className="sr-only">Detalhes do cliente</SheetDescription>
          </SheetHeader>
          <div className="py-20 text-center text-muted-foreground text-sm">Carregando…</div>
        </SheetContent>
      </Sheet>
    );
  }

  // app: o Omnichannel ainda não tem tela no app; "Conversar" e o telefone abrem a
  // conversa no site, no navegador (sem isto iam para /omnichannel, que o app não tem).
  const conversarNoSite = () =>
    window.open(noSite(`/omnichannel?client_id=${client.id}`), "_blank", "noopener,noreferrer");

  const abaClasse =
    "rounded-lg text-[12px] data-[state=active]:bg-foreground data-[state=active]:text-background py-2";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-[600px] overflow-y-auto p-0">
        <SheetHeader className="sr-only">
          <SheetTitle>{masked ? maskFullName(client.full_name || "") : (client.full_name || "Cliente")}</SheetTitle>
          <SheetDescription>Detalhes completos do cliente</SheetDescription>
        </SheetHeader>

        <ClientHeader
          client={client}
          pipeline={data?.pipeline}
          orders={orders}
          sellerId={sellerId}
          isWindowOpen={isWindowOpen}
          masked={masked}
          onConversar={conversarNoSite}
          onClientSaved={onClientSaved}
        />

        <Tabs defaultValue="overview" className="w-full">
          <div className="px-6 pt-5">
            <TabsList className="w-full grid grid-cols-2 sm:grid-cols-4 gap-1 bg-muted rounded-xl p-1 h-auto">
              <TabsTrigger value="overview" className={abaClasse}>Visão Geral</TabsTrigger>
              <TabsTrigger value="behavior" className={abaClasse}>Comportamento</TabsTrigger>
              <TabsTrigger value="orders" className={abaClasse}>Pedidos</TabsTrigger>
              <TabsTrigger value="history" className={abaClasse}>Histórico</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="overview" className="px-6 py-5 mt-0">
            <ClientOverviewTab client={client} sellerId={sellerId} masked={masked} onConversar={conversarNoSite} />
          </TabsContent>

          <TabsContent value="behavior" className="px-6 py-5 mt-0">
            <ClientBehaviorTab
              client={client}
              orders={orders}
              messages={messages}
              wflows={wflows}
              smsMessages={smsMessages}
              emailLogs={emailLogs}
              sellerId={sellerId}
            />
          </TabsContent>

          <TabsContent value="orders" className="px-6 py-5 mt-0">
            <ClientOrdersTab orders={orders} />
          </TabsContent>

          <TabsContent value="history" className="px-6 py-5 mt-0">
            <ClientHistoryTab
              client={client}
              sellerId={sellerId}
              orders={orders}
              messages={messages}
              smsMessages={smsMessages}
              emailLogs={emailLogs}
              wflows={wflows}
              interactions={interactions}
              masked={masked}
            />
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}

export default ClientDetailSheet;
