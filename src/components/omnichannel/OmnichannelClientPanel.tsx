import { useRef, useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { UserX } from "lucide-react";
import { useClientDetail } from "@/components/clients/sections/useClientDetail";
import { ClientHeader } from "@/components/clients/sections/ClientHeader";
import type { ClientSavedPatch } from "@/components/clients/EditClientDialog";
import { ClientOverviewTab } from "@/components/clients/sections/ClientOverviewTab";
import { ClientBehaviorTab } from "@/components/clients/sections/ClientBehaviorTab";
import { ClientOrdersTab } from "@/components/clients/sections/ClientOrdersTab";
import { ClientHistoryTab } from "@/components/clients/sections/ClientHistoryTab";

interface Props {
  clientId: string | null | undefined;
  sellerId: string | null | undefined;
  /** Linha de `conversations` aberta: fallback do cliente enquanto o hook não volta. */
  conversation: any;
  /** Pedidos já carregados pela página — evita tela vazia no primeiro quadro. */
  orders?: any[];
  /** Janela de 24h calculada pela página (mesma conta do cabeçalho da conversa). */
  isWindowOpen: boolean;
  /** Foca a caixa de resposta: "Conversar" não pode navegar para a própria tela. */
  onConversar?: () => void;
  /** Nova fase escolhida no diálogo de edição — a lista de conversas guarda o mapa. */
  onStageChanged?: (stageId: string) => void;
  /** Tags depois da mudança na Visão Geral + catálogo do seller. */
  onTagsChanged?: (tagIds: string[], catalogo: { id: string; name: string; color?: string | null }[]) => void;
  /** Cadastro editado: a conversa aberta e o card da lista vivem em useState, não no react-query. */
  onClientSaved?: (patch: ClientSavedPatch) => void;
}

export function OmnichannelClientPanel({
  clientId, sellerId, conversation, orders: ordersDaPagina = [],
  isWindowOpen, onConversar, onStageChanged, onTagsChanged, onClientSaved,
}: Props) {
  const [tab, setTab] = useState("overview");

  // As consultas de mensagens/SMS/e-mail/workflows custam quatro idas ao banco e só
  // servem a Comportamento e Histórico, então são feitas sob demanda
  // (`includeMessagesAndWorkflows` entra na queryKey do hook).
  //
  // Comportamento PRECISA delas: alimentá-lo com a thread da página dava números
  // diferentes dos do sheet de /clientes para o mesmo cliente. A thread é do escopo
  // `conversation_id` (os 2 e-mails da base têm conversation_id NULL e sumiam), suas
  // bolhas são normalizadas para EXIBIÇÃO (perdem click_count, e clique vira
  // status 'read') e os workflows nunca vinham.
  const precisaComunicacao = tab === "history" || tab === "behavior";
  const { data } = useClientDetail(clientId, sellerId ?? "", {
    enabled: !!clientId && !!sellerId,
    includeMessagesAndWorkflows: precisaComunicacao,
  });

  // Abrir a aba Histórico troca a queryKey (o flag entra nela) e o `data` volta a
  // undefined por um instante. Sem segurar o último resultado do MESMO cliente, o
  // painel inteiro pisca a cada ida e volta entre as abas.
  const ultimoRef = useRef<{ id: string | null | undefined; data: any }>({ id: null, data: null });
  if (data) ultimoRef.current = { id: clientId, data };
  const detalhe = data ?? (ultimoRef.current.id === clientId ? ultimoRef.current.data : null);

  const client = detalhe?.client ?? conversation?.clients ?? null;
  // A página zera `clientOrders` ao trocar de conversa, então este fallback nunca
  // é dos pedidos do cliente anterior — só cobre o quadro em que o hook ainda não voltou.
  const orders = detalhe?.orders ?? ordersDaPagina;

  const smsMessages = detalhe?.smsMessages ?? [];
  const emailLogs = detalhe?.emailLogs ?? [];
  const messagesWa = detalhe?.messages ?? [];
  const wflows = detalhe?.wflows ?? [];

  if (!clientId || !sellerId) {
    return (
      <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-3 px-8 text-center bg-background">
        <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center">
          <UserX className="h-6 w-6 text-muted-foreground" />
        </div>
        <p className="text-sm font-semibold text-foreground">Conversa sem cliente vinculado</p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Esta conversa não está ligada a nenhum cadastro, então não há pedidos, RFV nem
          histórico para mostrar aqui.
        </p>
      </div>
    );
  }

  if (!client) {
    return (
      <div className="flex-1 min-h-0 flex items-center justify-center bg-background text-sm text-muted-foreground">
        Carregando…
      </div>
    );
  }

  const abaClasse =
    "rounded-md px-1 text-[11px] data-[state=active]:bg-foreground data-[state=active]:text-background py-2";

  return (
    <div className="flex-1 min-h-0 overflow-y-auto bg-background">
      <ClientHeader
        client={client}
        pipeline={detalhe?.pipeline}
        orders={orders}
        sellerId={sellerId}
        isWindowOpen={isWindowOpen}
        hideConversarButton
        onClientSaved={(patch) => {
          if (patch.stageId) onStageChanged?.(patch.stageId);
          onClientSaved?.(patch);
        }}
      />

      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <div className="px-4 pt-4">
          {/* O breakpoint mede a JANELA, não este painel — e o painel só existe a
              partir de 1180px, então `min-[420px]` estava sempre ligado e as 4
              abas de 72px se sobrepunham ("Comportamento" precisa de ~83px).
              1440px é onde o painel passa a 390px e as quatro cabem. */}
          <TabsList className="w-full grid grid-cols-2 min-[1440px]:grid-cols-4 gap-1 bg-muted rounded-lg p-1 h-auto">
            <TabsTrigger value="overview" className={abaClasse}>Visão Geral</TabsTrigger>
            <TabsTrigger value="behavior" className={abaClasse}>Comportamento</TabsTrigger>
            <TabsTrigger value="orders" className={abaClasse}>Pedidos</TabsTrigger>
            <TabsTrigger value="history" className={abaClasse}>Histórico</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="overview" className="px-4 py-4 mt-0">
          <ClientOverviewTab
            client={client}
            sellerId={sellerId}
            onConversar={onConversar}
            onTagsChanged={onTagsChanged}
          />
        </TabsContent>

        <TabsContent value="behavior" className="px-4 py-4 mt-0">
          <ClientBehaviorTab
            client={client}
            orders={orders}
            messages={messagesWa}
            wflows={wflows}
            smsMessages={smsMessages}
            emailLogs={emailLogs}
            sellerId={sellerId}
            compact
          />
        </TabsContent>

        <TabsContent value="orders" className="px-4 py-4 mt-0">
          <ClientOrdersTab orders={orders} />
        </TabsContent>

        <TabsContent value="history" className="px-4 py-4 mt-0">
          <ClientHistoryTab
            client={client}
            sellerId={sellerId}
            orders={orders}
            messages={messagesWa}
            smsMessages={smsMessages}
            emailLogs={emailLogs}
            wflows={wflows}
            interactions={detalhe?.interactions ?? []}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default OmnichannelClientPanel;
