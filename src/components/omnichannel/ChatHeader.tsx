import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, Clock, Copy, KanbanSquare, User, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TriggerWorkflowDialog } from "@/components/crm/TriggerWorkflowDialog";
import { ClientAvatar } from "@/components/crm/ClientAvatar";
import { conversationHasWhatsApp } from "@/utils/conversationChannels";
import { useWindowCountdown, formatRemaining } from "@/hooks/useWindowCountdown";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { ChannelToggle, type OmniChannel, type ThreadChannel } from "./ChannelToggle";
import { contactDisplayName, formatPhoneDisplay } from "@/utils/formatters";
import { useNumeroErrado } from "@/hooks/useNumeroErrado";
import { NumeroErradoAviso } from "@/components/clients/NumeroErrado";

interface ChatHeaderProps {
  conversation: any;
  client: any;
  sellerId: string | null;
  isMobile?: boolean;
  onBack?: () => void;
  onOpenProfile?: () => void;
  /** Janela de 24h calculada na página (last_inbound_message_at + status). */
  isWindowOpen: boolean;
  threadChannel: ThreadChannel;
  onThreadChannelChange: (c: ThreadChannel) => void;
  availableChannels: OmniChannel[];
  /** Último `to_email` visto na thread, quando o cliente não tem e-mail no cadastro. */
  fallbackEmail?: string;
  /** Devolve a nova fase para a página atualizar o mapa que alimenta lista e filtro. */
  onStageChanged?: (stageId: string) => void;
}

// A formatação virou utilitário compartilhado (formatters.ts): esta cópia local
// era aplicada só à linha de contato, então o mesmo número saía cru no título e
// pontuado três linhas abaixo.
const formatPhone = formatPhoneDisplay;

export function ChatHeader({
  conversation,
  client,
  sellerId,
  isMobile,
  onBack,
  onOpenProfile,
  isWindowOpen,
  threadChannel,
  onThreadChannelChange,
  availableChannels,
  fallbackEmail,
  onStageChanged,
}: ChatHeaderProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [showWorkflow, setShowWorkflow] = useState(false);

  const clientId: string | undefined = client?.id || conversation?.client_id;
  const name = contactDisplayName(
    client?.full_name,
    client?.whatsapp || conversation?.whatsapp_contact_id,
    client?.email,
  );
  const phone = client?.whatsapp || conversation?.whatsapp_contact_id || "";
  const email = client?.email || fallbackEmail || "";

  // "Não sou eu": o motor para de mandar para este cliente neste telefone. O
  // contato da conversa vem primeiro (é por onde a mensagem sai); o do cadastro
  // cobre a conversa aberta antes de o cliente trocar de número.
  const { marca: numeroErrado } = useNumeroErrado(clientId, sellerId, [
    conversation?.whatsapp_contact_id,
    client?.whatsapp,
  ]);

  // A janela de 24h é do WhatsApp, então o selo segue a MESMA pergunta que o card
  // da lista faz: "esta conversa tem WhatsApp?" — `has_whatsapp`. Usar
  // `whatsapp_contact_id` (que é o que destrava a caixa de resposta) escondia o selo
  // em 1564 das 1565 conversas e ainda o mostrava justamente na única que é só SMS.
  const temWhatsApp = conversationHasWhatsApp(conversation);

  // Mesmo relógio e mesmo formato do card da lista: com duas contas diferentes os
  // dois números apareciam lado a lado divergindo em até 59 minutos.
  const minutosRestantes = useWindowCountdown(
    temWhatsApp ? conversation?.last_inbound_message_at : null,
  );
  // `isWindowOpen` vem da página (inclui o status da conversa) e só muda quando ela
  // re-renderiza; o tique do hook é quem percebe a janela virando com a conversa aberta.
  const windowOpen = isWindowOpen && minutosRestantes > 0;
  const windowLabel = windowOpen
    ? `${formatRemaining(minutosRestantes)} restantes`
    : "Janela 24h fechada";

  const { data: stages = [] } = useQuery({
    // Mesma chave e mesmo formato do ClientCRMPanel: os dois compartilham cache.
    queryKey: ["pipeline-stages", sellerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pipeline_stages")
        .select("*")
        .eq("seller_id", sellerId!)
        .order("position");
      if (error) throw error;
      return data || [];
    },
    enabled: !!sellerId,
  });

  const { data: clientPipeline } = useQuery({
    queryKey: ["client-pipeline", clientId, sellerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_pipeline")
        .select(`
          *,
          pipeline_stages!client_pipeline_stage_id_fkey (id, name, color, position)
        `)
        .eq("client_id", clientId!)
        .eq("seller_id", sellerId!)
        .maybeSingle();
      if (error && error.code !== "PGRST116") throw error;
      return data;
    },
    enabled: !!clientId && !!sellerId,
  });

  const currentStageId: string | null = (clientPipeline as any)?.stage_id ?? null;

  const changeStage = useMutation({
    mutationFn: async (newStageId: string) => {
      const newStage = (stages as any[]).find((s) => s.id === newStageId);
      const oldStage = (clientPipeline as any)?.pipeline_stages;
      const { error } = await supabase
        .from("client_pipeline")
        .upsert(
          {
            client_id: clientId!,
            seller_id: sellerId!,
            stage_id: newStageId,
            previous_stage_id: oldStage?.id || (clientPipeline as any)?.stage_id || null,
            moved_at: new Date().toISOString(),
          },
          { onConflict: "client_id,seller_id" },
        );
      if (error) throw error;
      if (user) {
        await supabase.from("client_interactions").insert({
          client_id: clientId!,
          seller_id: sellerId!,
          created_by: user.id,
          // `stage_changed` (com D): mesmo valor que o Kanban grava para o mesmo evento.
          interaction_type: "stage_changed",
          content: `Movido de "${oldStage?.name || "Sem fase"}" para "${newStage?.name}"`,
          metadata: { from_stage_id: oldStage?.id || null, to_stage_id: newStageId },
        });
      }
      return newStage;
    },
    onSuccess: (newStage: any, newStageId: string) => {
      queryClient.invalidateQueries({ queryKey: ["client-pipeline", clientId, sellerId] });
      queryClient.invalidateQueries({ queryKey: ["client-interactions", clientId, sellerId] });
      // O painel do cliente, na mesma tela, desenha a fase a partir do useClientDetail:
      // sem esta invalidação ele fica com a etiqueta antiga até trocar de conversa.
      // (Prefixo: a chave real termina com o flag de histórico.)
      queryClient.invalidateQueries({ queryKey: ["client-detail", clientId, sellerId] });
      queryClient.invalidateQueries({ queryKey: ["column-initial", sellerId] });
      queryClient.invalidateQueries({ queryKey: ["column-count", sellerId] });
      onStageChanged?.(newStageId);
      toast({ title: `Cliente movido para "${newStage?.name}"` });
    },
    onError: (e: any) => {
      toast({ title: "Erro ao atualizar fase", description: e.message, variant: "destructive" });
    },
  });

  // O contato mostrado acompanha o recorte da thread: vendo só e-mail, telefone
  // não ajuda em nada.
  const showingEmail = threadChannel === "email" || (!phone && !!email);
  const contact = showingEmail ? email : formatPhone(phone);

  const copyContact = async () => {
    const raw = showingEmail ? email : phone;
    if (!raw) return;
    try {
      await navigator.clipboard.writeText(raw);
      toast({ title: showingEmail ? "E-mail copiado" : "Telefone copiado" });
    } catch {
      toast({ title: "Não foi possível copiar", variant: "destructive" });
    }
  };

  const toggle = (
    <ChannelToggle
      value={threadChannel}
      onChange={onThreadChannelChange}
      available={availableChannels}
      size="sm"
    />
  );

  return (
    <TooltipProvider delayDuration={150}>
      <div className="border-b border-border bg-card">
        {isMobile ? (
          /* Celular: o cabeçalho do WhatsApp (22/10). Voltar, foto e nome numa
             faixa só; embaixo do nome, no lugar do "online", a pílula da janela
             de 24h, que é o que decide se dá para responder. Tocar no nome ou na
             foto abre a ficha do cliente, como tocar no contato no WhatsApp. O
             telefone e as ações (copiar, workflow, fase) ficam na ficha. */
          <div className="flex h-14 items-center gap-1 pl-1 pr-2">
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                aria-label="Voltar para as conversas"
                className="flex h-10 w-9 shrink-0 items-center justify-center rounded-full text-foreground active:bg-muted"
              >
                <ArrowLeft className="h-[22px] w-[22px]" />
              </button>
            )}
            <button
              type="button"
              onClick={onOpenProfile}
              disabled={!onOpenProfile}
              className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg py-1 text-left active:bg-muted"
            >
              <ClientAvatar name={name} size={40} fontSize={14} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[16px] font-semibold leading-tight text-foreground">{name}</span>
                {temWhatsApp ? (
                  <span
                    className={`mt-0.5 inline-flex max-w-full items-center gap-1 rounded-full px-2 py-px text-[11.5px] font-semibold ${
                      windowOpen ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                    }`}
                  >
                    <Clock className="h-3 w-3 shrink-0" />
                    <span className="truncate">{windowOpen ? `${windowLabel} para responder` : "Janela fechada · só template"}</span>
                  </span>
                ) : (
                  <span className="block truncate text-[13px] leading-tight text-muted-foreground">{contact}</span>
                )}
              </span>
            </button>
            {onOpenProfile && (
              <button
                type="button"
                onClick={onOpenProfile}
                aria-label="Ver perfil completo"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-foreground active:bg-muted"
              >
                <User className="h-[20px] w-[20px]" />
              </button>
            )}
          </div>
        ) : (
        <div className="flex items-center justify-between gap-3 px-4 md:px-6 py-3">
          {/* `flex-wrap`: o trio de canais fica na MESMA linha do nome enquanto couber
              e desce para a linha de baixo quando não cabe. Sem isso, numa coluna de
              chat estreita (1280px com o painel do cliente aberto sobram ~297px) o
              nome era espremido a zero e o cabeçalho ficava só com ícones. */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 min-w-0 flex-1">
            {isMobile && onBack && (
              <Button variant="ghost" size="icon" onClick={onBack} className="h-9 w-9 shrink-0 rounded-md">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            )}

            <ClientAvatar name={name} size={40} fontSize={14} />

            {/* `basis-40` é só a medida que decide a quebra de linha; `min-w-0` deixa o
                bloco encolher e truncar; `max-w-fit` impede que ele cresça além do
                próprio conteúdo — sem isso o bloco engolia a sobra e empurrava o trio
                de canais até 835px para longe do nome numa tela larga. Medido: com
                `max-w-fit` o grupo fica a 12px do nome em qualquer largura. */}
            <div className="min-w-0 flex-1 basis-40 max-w-fit">
              <div className="flex items-center gap-2 min-w-0">
                <p className="text-base font-semibold text-foreground truncate">{name}</p>
                {conversation?.status && conversation.status !== "open" && (
                  <Badge variant="outline" className="text-[10px] shrink-0">
                    {conversation.status === "closed" ? "Fechada" : "Arquivada"}
                  </Badge>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-0.5">
                {contact && (
                  <span className="text-sm text-muted-foreground tabular-nums truncate max-w-[240px]">
                    {contact}
                  </span>
                )}
                {temWhatsApp && (
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                      windowOpen ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                    }`}
                    title={
                      windowOpen
                        ? "Janela de 24h aberta: dá para responder livremente."
                        : "Janela de 24h fechada: envie um template aprovado. Ela reabre quando o cliente responder."
                    }
                  >
                    <Clock className="h-3 w-3 shrink-0" />
                    {windowLabel}
                  </span>
                )}
              </div>
            </div>

          </div>

          {/* Coluna da direita: as ações em cima, o trio de canais logo abaixo
              (pedido de 11/08). No notebook o trio vivia no bloco do cliente e
              quebrava para uma linha própria, alta e quase vazia — empilhado sob
              os ícones ele ocupa a altura que a coluna de ações já tinha. */}
          <div className="flex flex-col items-end gap-2 shrink-0">
            <div className="flex items-center gap-1">
              {onOpenProfile && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-9 w-9 rounded-md" onClick={onOpenProfile}>
                      <User className="h-[18px] w-[18px]" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Ver perfil completo</TooltipContent>
                </Tooltip>
              )}

              {!isMobile && (
                <>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 rounded-md"
                        onClick={copyContact}
                        disabled={!contact}
                      >
                        <Copy className="h-[18px] w-[18px]" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{showingEmail ? "Copiar e-mail" : "Copiar telefone"}</TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 rounded-md"
                        onClick={() => setShowWorkflow(true)}
                        disabled={!clientId || !sellerId}
                      >
                        <Zap className="h-[18px] w-[18px]" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Disparar workflow</TooltipContent>
                  </Tooltip>

                  <DropdownMenu>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9 rounded-md"
                            disabled={!clientId || !sellerId}
                          >
                            <KanbanSquare className="h-[18px] w-[18px]" />
                          </Button>
                        </DropdownMenuTrigger>
                      </TooltipTrigger>
                      <TooltipContent>{currentStageId ? "Mudar fase" : "Adicionar ao CRM"}</TooltipContent>
                    </Tooltip>
                    <DropdownMenuContent align="end" className="w-56">
                      <DropdownMenuLabel>{currentStageId ? "Mudar fase" : "Adicionar ao CRM"}</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      {(stages as any[]).map((s) => {
                        const active = s.id === currentStageId;
                        return (
                          <DropdownMenuItem
                            key={s.id}
                            disabled={active || changeStage.isPending}
                            onClick={() => !active && changeStage.mutate(s.id)}
                            className="gap-2"
                          >
                            {active ? (
                              <Check className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <span
                                className="h-2.5 w-2.5 rounded-full"
                                style={{ backgroundColor: s.color || "#94a3b8" }}
                              />
                            )}
                            <span className={active ? "text-muted-foreground" : ""}>{s.name}</span>
                          </DropdownMenuItem>
                        );
                      })}
                      {(stages as any[]).length === 0 && (
                        <div className="px-2 py-3 text-xs text-muted-foreground">
                          Nenhuma fase cadastrada no CRM.
                        </div>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </>
              )}
            </div>

            {/* empty:hidden: conversa de um canal só não mostra seletor, e sem
                isso sobraria o vão do gap-2 embaixo dos ícones. */}
            {!isMobile && <div className="empty:hidden">{toggle}</div>}
          </div>
        </div>
        )}

        {isMobile && <div className="px-4 pb-2 empty:hidden">{toggle}</div>}

        {numeroErrado && clientId && (
          <NumeroErradoAviso
            marca={numeroErrado}
            clientId={clientId}
            nome={client?.full_name?.trim() || null}
          />
        )}
      </div>

      {clientId && sellerId && (
        <TriggerWorkflowDialog
          open={showWorkflow}
          onOpenChange={setShowWorkflow}
          clientId={clientId}
          sellerId={sellerId}
          clientName={name}
        />
      )}
    </TooltipProvider>
  );
}

export default ChatHeader;
