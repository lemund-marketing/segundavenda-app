import { useEffect, useMemo, useRef, useState, type ChangeEvent, type UIEvent } from "react";
import { useSearchParams } from "react-router-dom";
import {
  AlertTriangle, ArrowLeft, CheckCheck, FileText, Film, Image as ImageIcon, Loader2, MessageSquare, Music,
  Paperclip, Search, Send, SlidersHorizontal, Sparkles, WifiOff, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import WhatsAppIcon from "@/components/WhatsAppIcon";
import { ConversationCard } from "@/components/omnichannel/ConversationCard";
import { OmnichannelFiltersSheet } from "@/components/omnichannel/OmnichannelFiltersSheet";
import QuickRepliesPopover from "@/components/omnichannel/QuickRepliesPopover";
import { OmnichannelClientPanel } from "@/components/omnichannel/OmnichannelClientPanel";
import { TemplateParamsDialog } from "@/components/omnichannel/TemplateParamsDialog";
import { extrairBotoesDoTemplate, type TemplateButton } from "@/components/omnichannel/TemplateButtonsPreview";
import { renderizarTemplate } from "@/components/omnichannel/templateCorpo";
import { ChatHeader } from "@/components/omnichannel/ChatHeader";
import type { ThreadChannel } from "@/components/omnichannel/ChannelToggle";
import { MlConversationCard } from "@/components/omnichannel/ml/MlConversationCard";
import { MlChatView } from "@/components/omnichannel/ml/MlChatView";
import { MlOrderPanel } from "@/components/omnichannel/ml/MlOrderPanel";
import { MlFalhaLista } from "@/components/omnichannel/ml/MlFalhaLista";
import { useMlConversations, useMlConversaAberta } from "@/components/omnichannel/ml/useMlConversations";
import { intercalarMl, type MlConversa } from "@/components/omnichannel/ml/mlTipos";
import type { ClientSavedPatch } from "@/components/clients/EditClientDialog";
import { useAuth } from "@/contexts/AuthContext";
import { useSellerContext } from "@/contexts/SellerContext";
import { useToast } from "@/hooks/use-toast";
import { useRfvFilterOptions } from "@/hooks/useRfv";
import { useMarketplaceAliases } from "@/hooks/useMarketplaceAliases";
import { formatMarketplaceName } from "@/utils/formatters";
import { corIntencao, rotuloIntencao } from "@/utils/conversionIntent";
import { conversationHasWhatsApp, conversationHasSms, conversationHasEmail } from "@/utils/conversationChannels";
import { LayoutApp } from "@/app/LayoutApp";
import { BolhaMensagem } from "@/app/blocos/whatsapp/BolhaMensagem";
import { useSemRede } from "@/app/nativo/useSemRede";
import { useVoltarFecha } from "@/app/nativo/useVoltarFecha";
import {
  useConversas, buscarConversaDoCliente, normalizeSearchTerm, LIMITE_OPORTUNIDADES,
  type Conversa, type SemTipo, type StatusLista,
} from "@/app/dados/useConversas";
import {
  useMensagens, useTemplatesAprovados, enviarPelaCloud, subirAnexo, getEdgeFunctionErrorMessage, type Mensagem,
} from "@/app/dados/useMensagens";

const MEDIA_LIMITS: Record<string, number> = {
  image: 5 * 1024 * 1024,
  video: 16 * 1024 * 1024,
  audio: 16 * 1024 * 1024,
  document: 100 * 1024 * 1024,
};

const getContentTypeFromFile = (file: File): string => {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("audio/")) return "audio";
  return "document";
};

const getFileIcon = (file: File) => {
  switch (getContentTypeFromFile(file)) {
    case "image":
      return <ImageIcon className="h-4 w-4" />;
    case "video":
      return <Film className="h-4 w-4" />;
    case "audio":
      return <Music className="h-4 w-4" />;
    default:
      return <FileText className="h-4 w-4" />;
  }
};

const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

// Cores para as tags de template (geradas deterministicamente pelo nome).
const templateTagColors = [
  { bg: "#3b82f6", text: "#fff" },
  { bg: "#10b981", text: "#fff" },
  { bg: "#f97316", text: "#fff" },
  { bg: "#a855f7", text: "#fff" },
  { bg: "#ec4899", text: "#fff" },
  { bg: "#06b6d4", text: "#fff" },
  { bg: "#f59e0b", text: "#fff" },
  { bg: "#6366f1", text: "#fff" },
  { bg: "#14b8a6", text: "#fff" },
  { bg: "#ef4444", text: "#fff" },
];

const getTemplateColor = (name: string) => {
  if (!name) return templateTagColors[0];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return templateTagColors[Math.abs(hash) % templateTagColors.length];
};

// Lógica estilo WhatsApp: "Não respondidas" = a última mensagem foi do cliente,
// ou o cliente nunca respondeu (só envios nossos).
const isUnanswered = (conv: Conversa) => {
  if (!conv.last_message_at) return false;
  if (!conv.last_inbound_message_at) return true;
  return new Date(conv.last_inbound_message_at).getTime() >= new Date(conv.last_message_at).getTime();
};

// Janela de 24 horas, contada da última mensagem DO CLIENTE.
const isWithin24HourWindow = (conversation: Conversa) => {
  if (!conversation || conversation.status !== "open") return false;
  if (!conversation.last_inbound_message_at) return false;
  const hoursDiff = (Date.now() - new Date(conversation.last_inbound_message_at).getTime()) / (1000 * 60 * 60);
  return hoursDiff < 24;
};

const canalDaBolha = (m: Mensagem): "whatsapp" | "sms" | "email" => (m?._sms ? "sms" : m?._email ? "email" : "whatsapp");

const CHIP_ATIVO_CLASS =
  "inline-flex items-center gap-1 max-w-full rounded-full bg-muted hover:bg-muted/70 transition-colors px-2.5 py-1 text-[11px] font-medium text-foreground";

const rotuloSentimento: Record<string, string> = {
  positive: "Positivo",
  neutral: "Neutro",
  negative: "Negativo",
  none: "sem classificação",
};

/**
 * WhatsApp, no desenho de celular do site (22/10/2026): três modos numa tela
 * só — a lista de conversas (título "Conversas", busca, abas em pílula e o
 * cartão com as conversas), a conversa aberta (cabeçalho de contato, bolhas
 * sobre o fundo da marca e o campo de digitar no rodapé, sem a barra de
 * baixo) e a ficha do cliente. O Voltar do Android faz ficha → conversa →
 * lista. O Mercado Livre entra misturado na lista, como no site.
 *
 * Mesmo estado e mesmas regras da página do site (src/pages/Omnichannel.tsx,
 * o ramo de celular); as consultas e o tempo real moram em dados/useConversas
 * e dados/useMensagens.
 */
export default function WhatsApp() {
  const { activeSeller } = useSellerContext();
  const { aliases: marketplaceAliases, getDisplayName: getMarketplaceAlias } = useMarketplaceAliases(activeSeller?.id);
  const canEdit = true;
  const { user } = useAuth();
  const { toast } = useToast();
  const semRede = useSemRede();

  const [newMessage, setNewMessage] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const [sending, setSending] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTemplateFilters, setActiveTemplateFilters] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusLista>("all");
  const [sentimentFilter, setSentimentFilter] = useState<"all" | "positive" | "neutral" | "negative" | "none">("all");
  const [workflowFilter, setWorkflowFilter] = useState<string>("all");
  const [marketplaceFilter, setMarketplaceFilter] = useState<string>("all");
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [rfvFilter, setRfvFilter] = useState<string>("all");
  const rfvOptions = useRfvFilterOptions(activeSeller?.id);
  // Número de origem: qual whatsapp_cloud_instances atende a conversa.
  const [instanceFilter, setInstanceFilter] = useState<string>("all");
  // Data da última mensagem: vai na CONSULTA (last_message_at ordena e pagina a lista).
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(false);
  const [mobileView, setMobileView] = useState<"list" | "chat" | "info">("list");
  // Recorte da thread aberta ('all' = a conversa inteira, os três canais).
  const [threadChannel, setThreadChannel] = useState<ThreadChannel>("all");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  /** Se o leitor está colado no fim da thread — quem lê histórico não é puxado. */
  const pertoDoFimRef = useRef(true);
  const conversaAnteriorRef = useRef<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const clientIdFromUrl = searchParams.get("client_id");

  const {
    conversations, setConversations, selectedConversation, setSelectedConversation,
    loading, loadingMore, hasMoreData, waCursor, activeSellerId, erro: erroLista, tentarDeNovo, recarga,
    serverMatchedConvIds, oportunidades,
    pipelineStages, sellerTags, setSellerTags, sellerInstances, sellerMarketplaces,
    clientMarketplaces, clientStages, setClientStages, clientTagsMap, setClientTagsMap, clientRfvMap,
    markingAllRead, handleMarkAllAsRead, loadMoreConversations,
  } = useConversas({ searchQuery, dateFrom, dateTo, marketplaceFilter, stageFilter, rfvFilter, statusFilter });
  const {
    messages, clientOrders, carregando: carregandoThread, erro: erroThread, tentarDeNovo: tentarThreadDeNovo,
  } = useMensagens(selectedConversation, activeSellerId, setConversations);
  const templates = useTemplatesAprovados(recarga);

  // ── Suporte do Mercado Livre (via hub) ──
  // Estado À PARTE de `conversations`: contadores das abas, busca no servidor,
  // "marcar todas como lidas" e o tempo real do WhatsApp seguem vendo só
  // WhatsApp. Seller sem a chave ligada: `ml.habilitado` é false e nada muda.
  const [mlOnly, setMlOnly] = useState(false);
  const [selectedMl, setSelectedMl] = useState<MlConversa | null>(null);
  // Os filtros de CRM (fase, RFV, número, template, IA, workflow, loja) não
  // existem no ML: com algum ligado o ML sai da lista em vez de aparecer "sem filtro".
  const semFiltroCrm =
    stageFilter === "all" && rfvFilter === "all" && instanceFilter === "all" &&
    activeTemplateFilters.length === 0 && sentimentFilter === "all" &&
    workflowFilter === "all" && marketplaceFilter === "all";
  const ml = useMlConversations(activeSeller?.id, {
    busca: searchQuery,
    dateFrom,
    dateTo,
    // Com página do WhatsApp ainda no servidor, só entra ML até a data da última
    // conversa carregada; senão a ML de ontem passaria na frente de um WhatsApp
    // de hoje que só vem na próxima página. Busca mostra tudo.
    corte: !mlOnly && statusFilter === "all" && semFiltroCrm && hasMoreData && !searchQuery.trim() ? waCursor : null,
    somenteMl: mlOnly,
  });
  const somenteMl = mlOnly && ml.habilitado;
  const mlMistura = ml.habilitado && !somenteMl && statusFilter === "all" && semFiltroCrm;
  const mlAberta = useMlConversaAberta(selectedMl?.id ?? null);
  // Conversa do ML aberta não atravessa a troca de seller.
  useEffect(() => {
    setSelectedMl(null);
  }, [activeSeller?.id]);

  // A caixa de envio fala WhatsApp (send-whatsapp-cloud). O que habilita
  // responder é existir contato de WhatsApp, não o rótulo do último canal.
  const canUseWhatsApp = !!selectedConversation?.whatsapp_contact_id;
  const canReply = canEdit && canUseWhatsApp;

  const handleFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const contentType = getContentTypeFromFile(file);
    const limit = MEDIA_LIMITS[contentType];
    if (file.size > limit) {
      toast({
        title: "Arquivo muito grande",
        description: `O limite para ${contentType} é ${formatFileSize(limit)}.`,
        variant: "destructive",
      });
      return;
    }

    setSelectedFile(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // Abrir a conversa de um cliente pela URL (?client_id=xxx).
  useEffect(() => {
    // Com a lista sem rede (erroLista), espera a conexão em vez de avisar
    // "Erro ao buscar conversa" e perder o pedido.
    if (!clientIdFromUrl || !activeSellerId || loading || erroLista) return;

    const openConversationForClient = async () => {
      try {
        const { data: conversation, error } = await buscarConversaDoCliente(activeSellerId, clientIdFromUrl);
        if (error) {
          console.error("Error finding conversation for client:", error);
          toast({ title: "Erro ao buscar conversa", description: error.message, variant: "destructive" });
        } else if (conversation) {
          setSelectedConversation(conversation);
          setMobileView("chat");
          // Entra na lista se não estiver lá (ex.: conversa fechada).
          setConversations((prev) => (prev.some((c) => c.id === conversation.id) ? prev : [conversation, ...prev]));
        } else {
          toast({ title: "Sem conversa", description: "Este cliente ainda não tem conversa iniciada no omnichannel." });
        }
      } catch (err) {
        console.error("Error opening conversation from URL:", err);
      }

      const newParams = new URLSearchParams(searchParams);
      newParams.delete("client_id");
      setSearchParams(newParams, { replace: true });
    };

    void openConversationForClient();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientIdFromUrl, activeSellerId, loading, erroLista]);

  // Rolagem infinita: o mesmo gatilho do site, a 200px do fim.
  const handleConversationsScroll = (e: UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    const scrollBottom = scrollHeight - scrollTop - clientHeight;
    // "Somente ML" pagina o ML. Misturado, o WhatsApp manda enquanto tiver
    // página; acabado ele, o ML que sobrou continua chegando pela rolagem.
    if (scrollBottom < 200) {
      if (somenteMl) void ml.carregarMais();
      else if (hasMoreData && !loadingMore) void loadMoreConversations();
      else if (!hasMoreData && mlMistura) void ml.carregarMais();
    }
  };

  // Guarda única de envio: barra quem não tem contato de WhatsApp na conversa.
  const blockIfNotWhatsApp = () => {
    if (canUseWhatsApp) return false;
    toast({
      title: "Este cliente não tem WhatsApp nesta conversa",
      description: "Sem número de contato não há como responder por aqui. Use a área de SMS ou E-mail para falar com ele.",
      variant: "destructive",
    });
    return true;
  };

  const handleSendMedia = async () => {
    if (!selectedFile || !selectedConversation || !activeSellerId) return;
    if (blockIfNotWhatsApp()) return;

    try {
      setUploading(true);
      setUploadProgress(10);
      const contentType = getContentTypeFromFile(selectedFile);
      setUploadProgress(30);
      const mediaUrl = await subirAnexo(activeSellerId, selectedFile, setUploadProgress);
      setUploadProgress(80);
      await enviarPelaCloud({
        conversation_id: selectedConversation.id,
        sender_id: user?.id,
        content: newMessage.trim() || selectedFile.name,
        content_type: contentType,
        media_url: mediaUrl,
        media_filename: selectedFile.name,
        media_mime_type: selectedFile.type,
      });
      setUploadProgress(100);
      setSelectedFile(null);
      setNewMessage("");
      toast({ title: "Arquivo enviado", description: `${selectedFile.name} enviado com sucesso!` });
    } catch (err) {
      console.error("Error sending media:", err);
      toast({ title: "Erro ao enviar arquivo", description: await getEdgeFunctionErrorMessage(err), variant: "destructive" });
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const handleSendMessage = async () => {
    if (!selectedConversation) return;
    if (blockIfNotWhatsApp()) return;

    if (selectedTemplate) {
      setShowTemplateDialog(true);
      return;
    }

    if (!newMessage.trim()) return;

    try {
      setSending(true);
      await enviarPelaCloud({
        conversation_id: selectedConversation.id,
        sender_id: user?.id,
        content: newMessage,
        content_type: "text",
      });
      setNewMessage("");
      toast({ title: "Mensagem enviada", description: "Sua mensagem foi enviada com sucesso!" });
    } catch (err) {
      console.error("Error sending message:", err);
      toast({ title: "Erro ao enviar", description: await getEdgeFunctionErrorMessage(err), variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const handleSendTemplateWithParams = async (
    templateParams: Array<{ type: string; parameters: Array<{ type: string; text: string }> }>,
  ) => {
    if (!selectedConversation || !selectedTemplate) return;
    if (blockIfNotWhatsApp()) return;

    try {
      setSending(true);
      const selectedTemplateRow = templates.find((t) => t.name === selectedTemplate);
      await enviarPelaCloud({
        conversation_id: selectedConversation.id,
        sender_id: user?.id,
        content_type: "template",
        template_name: selectedTemplate,
        template_language: selectedTemplateRow?.language,
        template_params: templateParams,
        // O texto que o cliente recebe, não só o nome: com `[Template: x]` a
        // conversa parecia ter mandado "só o título".
        content: renderizarTemplate(selectedTemplateRow?.components, templateParams) ?? `[Template: ${selectedTemplate}]`,
      });
      setNewMessage("");
      setSelectedTemplate("");
      setShowTemplateDialog(false);
      toast({
        title: "Template aceito pela Meta",
        description: "A requisição foi aceita pela Meta. Isso ainda não confirma entrega no aparelho.",
      });
    } catch (err) {
      console.error("Error sending template:", err);
      toast({ title: "Erro ao enviar template", description: await getEdgeFunctionErrorMessage(err), variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  // Lista única de templates presentes nas conversas.
  const availableTemplates = Array.from(new Set(conversations.map((c) => c.template_tag).filter(Boolean))) as string[];

  // Botões do template por nome. A mensagem enviada não guarda os botões, então
  // a bolha cruza com `whatsapp_templates.components`, já em memória.
  const botoesPorTemplate = useMemo(() => {
    const mapa = new Map<string, TemplateButton[]>();
    for (const t of templates) {
      const nome = (t as { name?: string })?.name;
      if (!nome) continue;
      const botoes = extrairBotoesDoTemplate((t as { components?: unknown })?.components);
      if (botoes.length) mapa.set(nome, botoes);
    }
    return mapa;
  }, [templates]);

  // Corpo do template por nome, para a bolha gravada só com `[Template: x]`.
  const componentsPorTemplate = useMemo(() => {
    const mapa = new Map<string, unknown>();
    for (const t of templates) {
      const nome = (t as { name?: string })?.name;
      if (nome) mapa.set(nome, (t as { components?: unknown })?.components);
    }
    return mapa;
  }, [templates]);

  // Lista única de workflows presentes nas conversas.
  const availableWorkflows = Array.from(
    new Map(conversations.filter((c) => c.workflow_id && c.workflow_name).map((c) => [c.workflow_id, c.workflow_name])).entries(),
  ) as [string, string][];

  // Marketplaces do seller (independente das conversas carregadas).
  const availableMarketplaces = Array.from(
    new Set<string>([
      ...sellerMarketplaces,
      ...marketplaceAliases.map((alias) => alias.original_value).filter(Boolean),
      ...Object.values(clientMarketplaces).flat(),
    ]),
  ).sort();

  // Fase e tag chegam como id: o card precisa do nome e da cor.
  const stageById = new Map(pipelineStages.map((s: SemTipo) => [s.id, s]));
  const tagById = new Map(sellerTags.map((t: SemTipo) => [t.id, t]));

  // Peneira do aparelho SEM o filtro de status: os contadores das abas dizem
  // quantas conversas cada aba mostraria, e não quantas sobraram depois dela.
  const conversationsBeforeStatus = conversations.filter((conv) => {
    const clientName = normalizeSearchTerm(conv.clients?.full_name || "").toLowerCase();
    const clientEmail = (conv.clients?.email || "").toLowerCase();
    const clientPhone = (conv.clients?.whatsapp || "").replace(/\D/g, "");
    const query = normalizeSearchTerm(searchQuery).toLowerCase();
    const queryDigits = query.replace(/\D/g, "");
    const matchesSearch = !query
      ? true
      : serverMatchedConvIds.has(conv.id) ||
        clientName.includes(query) ||
        clientEmail.includes(query) ||
        (queryDigits.length >= 3 && clientPhone.includes(queryDigits));
    const matchesTemplate = activeTemplateFilters.length === 0 || activeTemplateFilters.includes(conv.template_tag);
    const matchesSentiment =
      sentimentFilter === "all" ? true : sentimentFilter === "none" ? !conv.last_sentiment : conv.last_sentiment === sentimentFilter;
    const matchesWorkflow =
      workflowFilter === "all" ? true : workflowFilter === "none" ? !conv.workflow_id : conv.workflow_id === workflowFilter;
    const convMarkets = clientMarketplaces[conv.client_id] || [];
    const matchesMarketplace =
      marketplaceFilter === "all" ? true : marketplaceFilter === "none" ? convMarkets.length === 0 : convMarkets.includes(marketplaceFilter);
    const convStage = clientStages[conv.client_id];
    const matchesStage = stageFilter === "all" ? true : stageFilter === "none" ? !convStage : convStage === stageFilter;
    const convRfv = clientRfvMap[conv.client_id];
    const matchesRfv = rfvFilter === "all" ? true : rfvFilter === "none" ? !convRfv : convRfv === rfvFilter;
    const matchesInstance = instanceFilter === "all" ? true : conv.whatsapp_instance_id === instanceFilter;
    return matchesSearch && matchesTemplate && matchesSentiment && matchesWorkflow && matchesMarketplace && matchesStage && matchesRfv && matchesInstance;
  });

  // Sem a lista, ou sem rede com a peneira vazia (a busca e os filtros que vão
  // ao servidor não rodaram), os números das pílulas seriam zeros falsos.
  const semBaseParaContar = erroLista || (semRede && conversationsBeforeStatus.length === 0);

  const totalOportunidades = Object.keys(oportunidades).length;
  const unansweredCount = conversationsBeforeStatus.filter(isUnanswered).length;
  const answeredCount = conversationsBeforeStatus.length - unansweredCount;

  const filteredWa = conversationsBeforeStatus.filter((conv) =>
    statusFilter === "all" ? true
      : statusFilter === "opportunity" ? !!oportunidades[conv.id]
        : statusFilter === "unanswered" ? isUnanswered(conv)
          : !isUnanswered(conv),
  );
  // O ML entra DEPOIS dos contadores: nenhuma aba conta conversa do ML.
  const filteredConversations: SemTipo[] =
    somenteMl ? intercalarMl([] as typeof filteredWa, ml.lista)
      : mlMistura ? intercalarMl(filteredWa, ml.lista)
        : filteredWa;
  const carregandoMaisLista = loadingMore || ((somenteMl || mlMistura) && ml.carregando);
  // Quem pagina a lista agora: a mesma regra da rolagem em handleConversationsScroll.
  const paginaDoMl = somenteMl || (!hasMoreData && mlMistura);
  // Falha da lista do ML: faixa com "Tentar de novo".
  const mlFalhou = !!ml.erro && (somenteMl || mlMistura || (ml.vinculoFalhou && statusFilter === "all"));
  const carregarMaisMl = () => void (ml.erro ? ml.tentarDeNovo() : ml.carregarMais());

  // ── "Mais filtros": contador do botão + chips do que está ligado ──
  const activeMoreFiltersCount =
    [stageFilter, rfvFilter, instanceFilter, sentimentFilter, workflowFilter, marketplaceFilter].filter((v) => v !== "all").length +
    activeTemplateFilters.length +
    (dateFrom ? 1 : 0) + (dateTo ? 1 : 0) +
    (somenteMl ? 1 : 0);

  // O contador de Oportunidades sai do servidor, MAS com busca ou filtro ligado
  // ele conta a mesma base da lista (senão a aba diria "30" e abriria com 2).
  const filtroExternoLigado = activeMoreFiltersCount > 0 || searchQuery.trim().length > 0;
  const oportunidadesNaBase = conversationsBeforeStatus.filter((c) => oportunidades[c.id]).length;
  const contadorOportunidades = filtroExternoLigado ? oportunidadesNaBase : totalOportunidades;
  const contadorOportunidadesExato = !filtroExternoLigado && totalOportunidades < LIMITE_OPORTUNIDADES;

  const instanceById = new Map(sellerInstances.map((i) => [i.id, i.label]));

  const activeFilterChips: { key: string; label: string; onRemove: () => void }[] = [];
  if (stageFilter !== "all") {
    activeFilterChips.push({
      key: "stage",
      label: `Fase: ${stageFilter === "none" ? "sem fase" : stageById.get(stageFilter)?.name || stageFilter}`,
      onRemove: () => setStageFilter("all"),
    });
  }
  if (rfvFilter !== "all") {
    activeFilterChips.push({
      key: "rfv",
      label: `RFV: ${rfvFilter === "none" ? "sem segmento" : rfvFilter}`,
      onRemove: () => setRfvFilter("all"),
    });
  }
  if (instanceFilter !== "all") {
    activeFilterChips.push({
      key: "instance",
      label: `Número: ${instanceById.get(instanceFilter) || instanceFilter}`,
      onRemove: () => setInstanceFilter("all"),
    });
  }
  for (const tpl of activeTemplateFilters) {
    activeFilterChips.push({
      key: `tpl:${tpl}`,
      label: `Template: ${tpl}`,
      onRemove: () => setActiveTemplateFilters((prev) => prev.filter((t) => t !== tpl)),
    });
  }
  if (sentimentFilter !== "all") {
    activeFilterChips.push({
      key: "sentiment",
      label: `IA: ${rotuloSentimento[sentimentFilter] || sentimentFilter}`,
      onRemove: () => setSentimentFilter("all"),
    });
  }
  if (workflowFilter !== "all") {
    activeFilterChips.push({
      key: "workflow",
      label: `Workflow: ${workflowFilter === "none" ? "sem workflow" : availableWorkflows.find(([id]) => id === workflowFilter)?.[1] || workflowFilter}`,
      onRemove: () => setWorkflowFilter("all"),
    });
  }
  if (marketplaceFilter !== "all") {
    activeFilterChips.push({
      key: "marketplace",
      label: `Loja: ${marketplaceFilter === "none" ? "sem pedido" : getMarketplaceAlias(marketplaceFilter) || formatMarketplaceName(marketplaceFilter)}`,
      onRemove: () => setMarketplaceFilter("all"),
    });
  }
  if (somenteMl) {
    activeFilterChips.push({ key: "ml", label: "Somente Mercado Livre", onRemove: () => setMlOnly(false) });
  }
  if (dateFrom || dateTo) {
    const dia = (d: Date) => d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
    const rotulo = dateFrom && dateTo ? `${dia(dateFrom)} – ${dia(dateTo)}` : dateFrom ? `de ${dia(dateFrom)}` : `até ${dia(dateTo!)}`;
    activeFilterChips.push({
      key: "data",
      label: `Data: ${rotulo}`,
      // Um chip só para as duas pontas: o X tira o recorte inteiro.
      onRemove: () => {
        setDateFrom(undefined);
        setDateTo(undefined);
      },
    });
  }

  // Limpa só o que mora no sheet; o status fica nas pílulas, com estado visível.
  const clearMoreFilters = () => {
    setStageFilter("all");
    setRfvFilter("all");
    setInstanceFilter("all");
    setSentimentFilter("all");
    setWorkflowFilter("all");
    setMarketplaceFilter("all");
    setActiveTemplateFilters([]);
    setDateFrom(undefined);
    setDateTo(undefined);
    setMlOnly(false);
  };
  const clearAllInboxFilters = () => {
    clearMoreFilters();
    setStatusFilter("all");
  };

  const canSendFreeMessage = !!selectedConversation && isWithin24HourWindow(selectedConversation);

  // Template já enviado depois da última mensagem do cliente: a janela só abre
  // com a resposta dele (regra da Meta), e a faixa precisa dizer isso.
  const templateAguardandoResposta = (() => {
    if (!selectedConversation || canSendFreeMessage) return false;
    const ultimoIn = selectedConversation.last_inbound_message_at
      ? new Date(selectedConversation.last_inbound_message_at).getTime()
      : 0;
    return messages.some(
      (m) => !m?._sms && !m?._email && m?.direction === "outbound" && m?.template_name &&
        m?.status !== "failed" && new Date(m.created_at).getTime() > ultimoIn,
    );
  })();

  const availableThreadChannels = (["whatsapp", "sms", "email"] as const).filter((c) => {
    // As flags has_* são a verdade do banco; as bolhas cobrem a flag atrasada.
    const flag = c === "whatsapp" ? conversationHasWhatsApp(selectedConversation)
      : c === "sms" ? conversationHasSms(selectedConversation)
        : conversationHasEmail(selectedConversation);
    return flag || messages.some((m) => canalDaBolha(m) === c);
  });

  const visibleMessages = threadChannel === "all" ? messages : messages.filter((m) => canalDaBolha(m) === threadChannel);

  /**
   * A thread nasce no FIM. Trocar de conversa salta seco; mensagem nova só
   * arrasta quem já estava perto do fim. O rAF espera as bolhas terem altura.
   */
  const idConversaAberta = selectedConversation?.id ?? null;

  useEffect(() => {
    const viewport = threadRef.current?.querySelector<HTMLElement>("[data-radix-scroll-area-viewport]");
    if (!viewport) return;

    const trocouDeConversa = conversaAnteriorRef.current !== idConversaAberta;
    conversaAnteriorRef.current = idConversaAberta;
    if (trocouDeConversa) pertoDoFimRef.current = true;
    if (!trocouDeConversa && !pertoDoFimRef.current) return;

    const quadro = requestAnimationFrame(() => {
      viewport.scrollTo({ top: viewport.scrollHeight, behavior: trocouDeConversa ? "auto" : "smooth" });
    });
    return () => cancelAnimationFrame(quadro);
  }, [idConversaAberta, visibleMessages.length]);

  // O teclado encolhe o WebView (o Capacitor tira a altura dele da janela) e a
  // thread perdia a parte de baixo sem rolar: a mensagem que se ia responder
  // sumia atrás da caixa. Quem estava no fim continua no fim, também com a
  // caixa de texto crescendo enquanto se digita. Encolher não dispara scroll,
  // então o pertoDoFimRef ainda diz onde a pessoa estava.
  useEffect(() => {
    const viewport = threadRef.current?.querySelector<HTMLElement>("[data-radix-scroll-area-viewport]");
    if (!viewport) return;
    const observador = new ResizeObserver(() => {
      if (pertoDoFimRef.current) viewport.scrollTop = viewport.scrollHeight;
    });
    observador.observe(viewport);
    return () => observador.disconnect();
  }, [idConversaAberta]);

  const aoRolarThread = (e: UIEvent<HTMLDivElement>) => {
    // e.target (o viewport do Radix): a raiz da ScrollArea nunca rola.
    const el = e.target as HTMLElement;
    if (!el?.hasAttribute?.("data-radix-scroll-area-viewport")) return;
    pertoDoFimRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  };

  // Cadastro editado na ficha: a lista e a conversa aberta vivem em useState, e
  // sem isto o nome novo aparecia só na ficha até recarregar.
  const aplicarPatchDoCliente = ({ client: dados, stageId }: ClientSavedPatch) => {
    const cid = selectedConversation?.client_id;
    if (!cid) return;
    setConversations((prev) => prev.map((c) => (c.client_id === cid ? { ...c, clients: { ...c.clients, ...dados } } : c)));
    setSelectedConversation((prev: Conversa) =>
      prev?.client_id === cid ? { ...prev, clients: { ...prev.clients, ...dados } } : prev,
    );
    if (stageId) setClientStages((prev) => ({ ...prev, [cid]: stageId }));
  };

  const handleSelectConversation = (conv: Conversa) => {
    setSelectedMl(null);
    setSelectedConversation(conv);
    // Cada conversa tem sua combinação de canais: o recorte anterior abriria a
    // próxima com a thread vazia.
    setThreadChannel("all");
    setMobileView("chat");
  };

  // Seleção EXCLUSIVA com a do WhatsApp.
  const handleSelectMl = (conv: MlConversa) => {
    setSelectedConversation(null);
    // Sem zerar, voltar para a MESMA conversa não contava como troca e ela
    // abria no topo, não no fim.
    conversaAnteriorRef.current = null;
    setSelectedMl(conv);
    ml.marcarVistaLocal(conv.id);
    setMobileView("chat");
  };

  const handleBackToList = () => {
    setSelectedConversation(null);
    setSelectedMl(null);
    conversaAnteriorRef.current = null;
    setMobileView("list");
  };

  const handleShowClientInfo = () => setMobileView("info");

  // Voltar do Android: da ficha volta para a conversa, e da conversa para a lista.
  useVoltarFecha(mobileView !== "list", handleBackToList);
  useVoltarFecha(mobileView === "info", () => setMobileView("chat"));

  // Só a PRIMEIRA carga apaga a tela: uma recarga com dados em memória mantém a
  // lista no lugar (trocar por esqueleto perde rolagem, foco e conversa aberta).
  const primeiraCarga = loading && conversations.length === 0;

  if (primeiraCarga) {
    return (
      <LayoutApp alturaCheia ocultarTopoMobile ocultarNavInferior={mobileView !== "list"}>
        <EsqueletoLista />
      </LayoutApp>
    );
  }

  const placeholderComposer = !canEdit
    ? "Sem permissão para responder..."
    : !canUseWhatsApp
      ? "Sem WhatsApp nesta conversa..."
      : canSendFreeMessage
        ? "Mensagem"
        : "Selecione um template acima...";
  const composerDesabilitado = !canReply || (!canSendFreeMessage && !selectedTemplate) || uploading;
  const envioDesabilitado =
    !canReply ||
    uploading ||
    sending ||
    (!canSendFreeMessage && !selectedTemplate && !selectedFile) ||
    (!newMessage.trim() && !selectedTemplate && !selectedFile);
  const aoEnviarComposer = () => (selectedFile ? handleSendMedia() : handleSendMessage());

  // As pílulas de status. O contador leva "+" enquanto houver página no
  // servidor: ele conta o que já foi carregado, não a caixa inteira.
  const abasStatus = [
    { id: "all", label: "Todas", count: conversationsBeforeStatus.length, exato: false },
    { id: "unanswered", label: "Não respondidas", count: unansweredCount, exato: false },
    { id: "answered", label: "Respondidas", count: answeredCount, exato: false },
    // As oportunidades vêm todas do servidor: este é o total real, sem "+".
    { id: "opportunity", label: "Oportunidades", count: contadorOportunidades, exato: contadorOportunidadesExato },
  ] as const;

  const oportunidadeAberta = selectedConversation ? oportunidades[selectedConversation.id] : undefined;

  return (
    <LayoutApp alturaCheia ocultarTopoMobile ocultarNavInferior={mobileView !== "list"}>
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        {/* Lista de conversas */}
        <div className={`flex flex-col border-r border-border bg-background ${mobileView === "list" ? "w-full" : "hidden"}`}>
          {/* O topo da lista de conversas do WhatsApp, na cara do app: título com
              o ícone no quadrado verde, ações à direita, busca e filtros rápidos
              nas pílulas do Início. "Mais filtros" é o ícone de ajustes, com o
              número de filtros ligados. */}
          <div className="shrink-0 space-y-3 bg-background px-4 pb-2 pt-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <WhatsAppIcon size={20} />
                </span>
                <h1 className="truncate text-[24px] font-bold tracking-tight text-foreground">Conversas</h1>
              </div>
              <div className="flex items-center">
                <button
                  type="button"
                  onClick={handleMarkAllAsRead}
                  disabled={markingAllRead || conversations.every((c) => !c.unread_count)}
                  aria-label="Marcar todas como lidas"
                  title="Marcar todas como lidas"
                  className="flex h-10 w-10 items-center justify-center rounded-full text-foreground active:bg-muted disabled:opacity-40"
                >
                  {markingAllRead ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCheck className="h-5 w-5" />}
                </button>
                <button
                  type="button"
                  onClick={() => setMoreFiltersOpen(true)}
                  aria-label="Mais filtros"
                  title="Mais filtros"
                  className="relative flex h-10 w-10 items-center justify-center rounded-full text-foreground active:bg-muted"
                >
                  <SlidersHorizontal className="h-5 w-5" />
                  {activeMoreFiltersCount > 0 && (
                    <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold tabular-nums text-primary-foreground">
                      {activeMoreFiltersCount}
                    </span>
                  )}
                </button>
              </div>
            </div>

            <div className="relative">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                placeholder="Pesquisar nome, telefone ou e-mail"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-11 w-full rounded-full border border-border/60 bg-card pl-11 pr-4 text-[16px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>

            {/* Somente ML: as abas contam só WhatsApp e não se aplicam. */}
            {!somenteMl && (
              <div className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]">
                {abasStatus.map((a) => {
                  const ativa = statusFilter === a.id;
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => setStatusFilter(a.id)}
                      aria-pressed={ativa}
                      className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-[14px] font-medium transition-colors ${
                        ativa ? "bg-primary/10 text-primary" : "border border-border/60 bg-card text-muted-foreground active:bg-muted"
                      }`}
                    >
                      {a.label}
                      {!semBaseParaContar && (
                        <span className="text-[12px] tabular-nums opacity-80">
                          {a.count}
                          {!a.exato && hasMoreData ? "+" : ""}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {(activeFilterChips.length > 0 || statusFilter !== "all") && (
              <div className="flex flex-wrap items-center gap-1.5">
                {activeFilterChips.map((chip) => (
                  <button key={chip.key} onClick={chip.onRemove} className={CHIP_ATIVO_CLASS} title={`Remover ${chip.label}`}>
                    <span className="max-w-[130px] truncate">{chip.label}</span>
                    <X className="h-3 w-3 shrink-0" />
                  </button>
                ))}
                <button onClick={clearAllInboxFilters} className="inline-flex h-6 items-center gap-1 px-1.5 text-[11px] text-muted-foreground">
                  <X className="h-3 w-3" />
                  Limpar todos
                </button>
              </div>
            )}
          </div>

          <ScrollArea className="omnichannel-list-scroll flex-1" onScrollCapture={handleConversationsScroll}>
            {mlFalhou && !(somenteMl && filteredConversations.length === 0) && (
              <MlFalhaLista erro={ml.erro!} onTentarDeNovo={carregarMaisMl} carregando={ml.carregando} />
            )}
            {/* A lista que sobrou na tela é de antes (outro período, outra busca):
                sem a página nova ela sai, para não passar por atual. Sem rede,
                lista vazia também não quer dizer "nenhuma": a busca, a aba e os
                filtros que vão ao servidor não chegaram a rodar. */}
            {semRede && (erroLista || filteredConversations.length === 0) ? (
              <div className="mx-3 mb-3 mt-1 flex flex-col items-center gap-2 rounded-3xl border border-border/60 bg-card px-6 py-8 text-center">
                <WifiOff className="h-6 w-6 text-muted-foreground" />
                <p className="text-sm font-medium text-foreground">Sem internet</p>
                <p className="text-[13px] text-muted-foreground">As conversas aparecem assim que a conexão voltar.</p>
              </div>
            ) : erroLista ? (
              <div className="mx-3 mb-3 mt-1 flex flex-col items-center gap-3 rounded-3xl border border-border/60 bg-card px-6 py-8 text-center">
                <AlertTriangle className="h-6 w-6 text-muted-foreground" />
                <p className="text-sm font-medium text-foreground">Não foi possível carregar as conversas.</p>
                <Button variant="outline" size="sm" className="rounded-full" onClick={() => void tentarDeNovo()} disabled={loading}>
                  {loading ? "Tentando…" : "Tentar de novo"}
                </Button>
              </div>
            ) : filteredConversations.length === 0 && statusFilter === "opportunity" && !filtroExternoLigado ? (
              /* Vazio próprio: aqui a lista vazia é a resposta certa e precisa dizer isso. */
              <div className="flex flex-col items-center justify-center px-6 py-10 text-center text-muted-foreground">
                <Sparkles className="mb-2 h-10 w-10 opacity-40" />
                <p className="text-sm font-medium text-foreground">Nenhuma oportunidade no momento</p>
                <p className="mt-1 max-w-[240px] text-[12px] leading-relaxed">
                  A IA lê as conversas de quem já comprou e avisa aqui quando o cliente demonstra interesse em comprar
                  de novo — recompra, outro produto ou catálogo.
                </p>
              </div>
            ) : somenteMl && mlFalhou && filteredConversations.length === 0 ? (
              <MlFalhaLista erro={ml.erro!} onTentarDeNovo={carregarMaisMl} carregando={ml.carregando} vazio />
            ) : filteredConversations.length === 0 ? (
              <div className="flex flex-col items-center justify-center px-6 py-10 text-center text-muted-foreground">
                <MessageSquare className="mb-2 h-12 w-12 opacity-50" />
                <p>Nenhuma conversa</p>
                {/* Busca e filtros do aparelho podem esvaziar a lista sem deixar
                    nada para rolar; aí a rolagem infinita nunca dispara. */}
                {(paginaDoMl ? ml.temMais || ml.carregando : hasMoreData) && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3 h-7 text-[11px]"
                    disabled={carregandoMaisLista}
                    onClick={paginaDoMl ? carregarMaisMl : () => void loadMoreConversations()}
                  >
                    {carregandoMaisLista ? <Loader2 className="h-3 w-3 animate-spin" /> : "Carregar mais conversas"}
                  </Button>
                )}
              </div>
            ) : (
              // As conversas num cartão branco com divisórias, o desenho das seções do Início.
              <div className="mx-3 mb-3 mt-1 min-w-0 max-w-full divide-y divide-border/60 overflow-hidden rounded-3xl border border-border/60 bg-card">
                {filteredConversations.map((conv) => {
                  if (conv.__ml) {
                    return (
                      <div key={`ml:${conv.id}`} className="px-3 py-1">
                        <MlConversationCard conversa={conv} isSelected={selectedMl?.id === conv.id} onClick={() => handleSelectMl(conv)} />
                      </div>
                    );
                  }
                  const convTags = (clientTagsMap[conv.client_id] || []).map((id: string) => tagById.get(id)).filter(Boolean);
                  return (
                    <ConversationCard
                      key={conv.id}
                      conversation={conv}
                      isSelected={selectedConversation?.id === conv.id}
                      onClick={() => handleSelectConversation(conv)}
                      tags={convTags}
                      rfvSegment={clientRfvMap[conv.client_id]}
                      templateColor={getTemplateColor}
                      opportunity={oportunidades[conv.id] ?? null}
                      variante="whatsapp"
                    />
                  );
                })}
                {carregandoMaisLista && (
                  <div className="flex justify-center py-4">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                )}
                {/* filteredWa, não a lista fundida: os cards do ML não podem
                    esconder o botão de quem filtrou o WhatsApp até sobrar pouco. */}
                {!carregandoMaisLista && (paginaDoMl ? ml.temMais : hasMoreData && filteredWa.length < conversations.length) && (
                  <div className="flex justify-center pt-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-[11px]"
                      onClick={paginaDoMl ? carregarMaisMl : () => void loadMoreConversations()}
                    >
                      Carregar mais conversas
                    </Button>
                  </div>
                )}
              </div>
            )}
          </ScrollArea>
        </div>

        {/* Conversa aberta. O fundo com os desenhos da marca (.fundo-conversa)
            fica na coluna inteira, contínuo atrás das bolhas e do campo de digitar. */}
        <div className={`flex min-w-0 flex-1 flex-col ${mobileView === "chat" ? "fundo-conversa w-full" : "hidden"}`}>
          {selectedMl ? (
            <MlChatView conversa={selectedMl} aberta={mlAberta} isMobile onBack={handleBackToList} onVerPedido={handleShowClientInfo} />
          ) : selectedConversation ? (
            <>
              <ChatHeader
                conversation={selectedConversation}
                client={selectedConversation.clients}
                sellerId={activeSellerId}
                isMobile
                onBack={handleBackToList}
                onOpenProfile={handleShowClientInfo}
                isWindowOpen={canSendFreeMessage}
                threadChannel={threadChannel}
                onThreadChannelChange={setThreadChannel}
                availableChannels={availableThreadChannels}
                fallbackEmail={messages.find((m) => m._email)?.to_email}
                onStageChanged={(stageId) => {
                  const cid = selectedConversation.client_id;
                  if (cid) setClientStages((prev) => ({ ...prev, [cid]: stageId }));
                }}
              />

              {/* O selo na lista diz QUE existe oportunidade; aqui vai o PORQUÊ.
                  line-clamp-3: o resumo pode ter 500 caracteres e a faixa comeria
                  a thread; o texto inteiro fica no title. */}
              {oportunidadeAberta && (
                <div className={`mx-4 mt-3 flex items-start gap-2 rounded-lg border px-3 py-2 ${corIntencao(oportunidadeAberta.tipo)}`}>
                  <Sparkles className="mt-0.5 h-4 w-4 shrink-0" />
                  <p className="line-clamp-3 text-[12px] leading-relaxed" title={oportunidadeAberta.resumo || undefined}>
                    <span className="font-semibold">Oportunidade de venda · {rotuloIntencao(oportunidadeAberta.tipo)}</span>
                    {oportunidadeAberta.resumo && <> — {oportunidadeAberta.resumo}</>}
                  </p>
                </div>
              )}

              {/* omnichannel-list-scroll: sem ele o max-w das bolhas mede contra
                  uma largura indefinida e um link comprido rolava a thread de lado. */}
              <ScrollArea ref={threadRef} onScrollCapture={aoRolarThread} className="omnichannel-list-scroll flex-1">
                <div className="px-3 py-2">
                  {visibleMessages.map((message, index) => (
                    <BolhaMensagem
                      key={message.id}
                      message={message}
                      prevMessage={index > 0 ? visibleMessages[index - 1] : null}
                      botoesPorTemplate={botoesPorTemplate}
                      componentsPorTemplate={componentsPorTemplate}
                      sellerId={activeSellerId}
                    />
                  ))}
                  {visibleMessages.length === 0 && (
                    <div className="py-12 text-center text-muted-foreground">
                      {carregandoThread ? (
                        <Loader2 className="mx-auto h-6 w-6 animate-spin" />
                      ) : erroThread ? (
                        // Sem a thread, "Nenhuma mensagem" seria mentira.
                        semRede ? (
                          <>
                            <WifiOff className="mx-auto mb-3 h-8 w-8 opacity-50" />
                            <p className="text-sm">Sem internet. As mensagens aparecem assim que a conexão voltar.</p>
                          </>
                        ) : (
                          <>
                            <AlertTriangle className="mx-auto mb-3 h-8 w-8 opacity-50" />
                            <p className="text-sm">Não foi possível carregar as mensagens.</p>
                            <Button variant="link" size="sm" className="mt-1" onClick={tentarThreadDeNovo}>
                              Tentar de novo
                            </Button>
                          </>
                        )
                      ) : (
                        <>
                          <MessageSquare className="mx-auto mb-3 h-10 w-10 opacity-40" />
                          {threadChannel !== "all" && messages.length > 0 ? (
                            <>
                              <p className="text-sm">
                                Nenhuma mensagem de {threadChannel === "sms" ? "SMS" : threadChannel === "email" ? "e-mail" : "WhatsApp"} nesta conversa.
                              </p>
                              <Button variant="link" size="sm" className="mt-1" onClick={() => setThreadChannel("all")}>
                                Ver a conversa inteira
                              </Button>
                            </>
                          ) : (
                            <p className="text-sm">Nenhuma mensagem registrada nesta conversa.</p>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              </ScrollArea>

              {/* O rodapé do WhatsApp: sem borda, sobre o mesmo fundo da conversa. */}
              <div className="space-y-2 bg-transparent px-2 pb-2 pt-1.5">
                {/* O recorte da thread NÃO muda o canal de envio: a caixa fala WhatsApp. */}
                {threadChannel !== "all" && threadChannel !== "whatsapp" && (
                  <p className="text-xs text-muted-foreground">
                    Mostrando só as bolhas de {threadChannel === "sms" ? "SMS" : "e-mail"}. A caixa abaixo envia WhatsApp.
                  </p>
                )}
                {!canEdit && (
                  <div className="rounded-lg border bg-muted p-3">
                    <p className="text-sm text-muted-foreground">
                      🔒 Você tem apenas permissão de leitura no WhatsApp. Solicite ao owner acesso de edição para responder conversas.
                    </p>
                  </div>
                )}
                {canEdit && !canUseWhatsApp && (
                  <div className="rounded-lg border bg-muted p-3">
                    <p className="text-sm text-muted-foreground">
                      🔒 Esta conversa não tem número de WhatsApp, então não dá para responder por aqui. Use a área de SMS ou
                      E-mail para falar com este cliente.
                    </p>
                  </div>
                )}
                {canReply && !canSendFreeMessage && (
                  <div className="rounded-lg border border-warning/30 bg-warning/10 p-3 dark:border-warning dark:bg-warning/20">
                    <p className="text-sm text-warning dark:text-white/90">
                      {templateAguardandoResposta
                        ? "📨 Template enviado. A conversa reabre quando o cliente responder — até lá, só dá para mandar outro template."
                        : !selectedConversation?.last_inbound_message_at
                          ? "⏳ Aguardando resposta do cliente. Use um template para iniciar a conversa."
                          : "⏰ Janela de 24 horas expirada. Envie um template aprovado: a conversa reabre quando o cliente responder."}
                    </p>
                  </div>
                )}

                {templates.length > 0 && canUseWhatsApp && (
                  <Select value={selectedTemplate} onValueChange={setSelectedTemplate} disabled={!canReply}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione um template (opcional)" />
                    </SelectTrigger>
                    <SelectContent>
                      {templates.map((template) => (
                        <SelectItem key={template.id} value={template.name}>
                          {template.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                {selectedFile && (
                  <div className="flex items-center gap-2 rounded-lg bg-accent p-2">
                    {getFileIcon(selectedFile)}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{selectedFile.name}</p>
                      <p className="text-xs text-muted-foreground">{formatFileSize(selectedFile.size)}</p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={() => setSelectedFile(null)}
                      disabled={uploading}
                      title="Remover anexo"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                )}

                {uploading && <Progress value={uploadProgress} className="h-1" />}

                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx"
                  onChange={handleFileSelect}
                />

                {/* A pílula do WhatsApp (respostas rápidas, texto que cresce até
                    5 linhas, anexo) e o botão redondo de enviar. Enter quebra
                    linha, como no WhatsApp do celular; envia pelo botão. */}
                <div className="flex items-end gap-1.5">
                  <div className="flex min-w-0 flex-1 items-end rounded-[24px] bg-card px-1 shadow-[0_1px_0.5px_rgba(11,20,26,0.13)]">
                    <QuickRepliesPopover
                      compacto
                      onSelect={(content) => setNewMessage(content)}
                      clientName={selectedConversation?.clients?.full_name}
                      disabled={!canReply || !canSendFreeMessage || uploading}
                    />
                    <Textarea
                      placeholder={placeholderComposer}
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      ref={composerRef}
                      rows={1}
                      className="max-h-32 min-h-[44px] min-w-0 flex-1 resize-none border-0 bg-transparent px-1 py-[11px] text-[16px] leading-[22px] shadow-none [field-sizing:content] focus-visible:ring-0 focus-visible:ring-offset-0"
                      disabled={composerDesabilitado}
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={!canReply || uploading}
                      aria-label="Anexar arquivo"
                      className="flex h-11 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground active:bg-muted disabled:opacity-40"
                    >
                      <Paperclip className="h-5 w-5 -rotate-45" />
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={aoEnviarComposer}
                    disabled={envioDesabilitado}
                    aria-label={selectedFile ? "Enviar anexo" : "Enviar mensagem"}
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md transition-opacity disabled:opacity-50"
                  >
                    {sending || uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5 translate-x-px" />}
                  </button>
                </div>
              </div>
            </>
          ) : null}
        </div>

        {/* Ficha do cliente (ou o pedido do ML), por cima da conversa. */}
        {(selectedConversation || selectedMl) && (
          <div className={`flex flex-col overflow-hidden border-l bg-background ${mobileView === "info" ? "absolute inset-0 z-10 w-full" : "hidden"}`}>
            {mobileView === "info" && (
              <div className="flex shrink-0 items-center gap-2 border-b bg-background p-3">
                <Button variant="ghost" size="icon" onClick={() => setMobileView("chat")} aria-label="Voltar para a conversa">
                  <ArrowLeft className="h-5 w-5" />
                </Button>
                <span className="font-medium">{selectedMl ? "Pedido no Mercado Livre" : "Informações do Cliente"}</span>
              </div>
            )}
            {selectedMl ? (
              <MlOrderPanel conversa={selectedMl} aberta={mlAberta} />
            ) : (
              <OmnichannelClientPanel
                clientId={selectedConversation.client_id}
                sellerId={activeSellerId}
                conversation={selectedConversation}
                orders={clientOrders}
                isWindowOpen={isWithin24HourWindow(selectedConversation)}
                onConversar={() => {
                  setMobileView("chat");
                  // Sem número de WhatsApp a caixa fica desabilitada e não recebe foco: diz o porquê.
                  if (!canUseWhatsApp) {
                    toast({ title: "Sem WhatsApp nesta conversa", description: "Esta conversa não tem número de WhatsApp para responder." });
                    return;
                  }
                  // A troca de modo só vale no próximo desenho: focar agora acharia
                  // o campo ainda dentro da coluna escondida.
                  requestAnimationFrame(() => composerRef.current?.focus());
                }}
                onStageChanged={(stageId) => {
                  const cid = selectedConversation.client_id;
                  if (cid) setClientStages((prev) => ({ ...prev, [cid]: stageId }));
                }}
                onClientSaved={aplicarPatchDoCliente}
                onTagsChanged={(tagIds, catalogo) => {
                  const cid = selectedConversation.client_id;
                  if (cid) setClientTagsMap((prev) => ({ ...prev, [cid]: tagIds }));
                  // A tag pode ter acabado de ser criada: sem entrar no catálogo,
                  // o card da lista não acharia o nome e a cor.
                  setSellerTags((prev) => {
                    const porId = new Map(prev.map((t: SemTipo) => [t.id, t]));
                    catalogo.forEach((t) => {
                      if (!porId.has(t.id)) porId.set(t.id, t);
                    });
                    return Array.from(porId.values());
                  });
                }}
              />
            )}
          </div>
        )}
      </div>

      <OmnichannelFiltersSheet
        open={moreFiltersOpen}
        onOpenChange={setMoreFiltersOpen}
        stageOptions={pipelineStages}
        stageFilter={stageFilter}
        setStageFilter={setStageFilter}
        rfvOptions={rfvOptions}
        rfvFilter={rfvFilter}
        setRfvFilter={setRfvFilter}
        instanceOptions={sellerInstances}
        instanceFilter={instanceFilter}
        setInstanceFilter={setInstanceFilter}
        templateOptions={availableTemplates}
        templateColor={getTemplateColor}
        templateFilters={activeTemplateFilters}
        setTemplateFilters={setActiveTemplateFilters}
        sentimentFilter={sentimentFilter}
        setSentimentFilter={(v) => setSentimentFilter(v as typeof sentimentFilter)}
        workflowOptions={availableWorkflows}
        workflowFilter={workflowFilter}
        setWorkflowFilter={setWorkflowFilter}
        marketplaceOptions={availableMarketplaces}
        marketplaceLabel={(mk) => getMarketplaceAlias(mk) || formatMarketplaceName(mk)}
        marketplaceFilter={marketplaceFilter}
        setMarketplaceFilter={setMarketplaceFilter}
        dateFrom={dateFrom}
        dateTo={dateTo}
        setDateFrom={setDateFrom}
        setDateTo={setDateTo}
        onClear={clearMoreFilters}
        activeCount={activeMoreFiltersCount}
        mlDisponivel={ml.habilitado}
        mlOnly={somenteMl}
        setMlOnly={setMlOnly}
      />

      <TemplateParamsDialog
        open={showTemplateDialog}
        onOpenChange={setShowTemplateDialog}
        template={templates.find((t) => t.name === selectedTemplate)}
        client={selectedConversation?.clients}
        lastOrder={clientOrders?.[0]}
        onSend={handleSendTemplateWithParams}
        sending={sending}
      />
    </LayoutApp>
  );
}

/** Esqueleto da lista, no desenho do topo e do cartão de conversas. */
function EsqueletoLista() {
  return (
    <div className="flex flex-col gap-3 px-4 pb-6 pt-3" aria-busy="true" aria-label="Carregando">
      <div className="flex items-center gap-2.5">
        <Skeleton className="h-9 w-9 rounded-xl" />
        <Skeleton className="h-7 w-36" />
      </div>
      <Skeleton className="h-11 w-full rounded-full" />
      <div className="flex gap-2">
        {[72, 150, 120].map((largura, i) => (
          <Skeleton key={i} className="h-8 shrink-0 rounded-full" style={{ width: largura }} />
        ))}
      </div>
      <div className="divide-y divide-border/60 overflow-hidden rounded-3xl border border-border/60 bg-card">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3">
            <Skeleton className="h-[50px] w-[50px] shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-10" />
              </div>
              <Skeleton className="h-3.5 w-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
