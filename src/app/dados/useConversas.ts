import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useSellerContext } from "@/contexts/SellerContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useNotifications } from "@/hooks/useNotifications";
import type { OportunidadeIA } from "@/utils/conversionIntent";

/**
 * As consultas e o tempo real da lista de conversas do WhatsApp, tirados de
 * dentro da página do site (src/pages/Omnichannel.tsx), onde moram em efeitos
 * soltos. Consultas, filtros, ordem, paginação e assinaturas são as mesmas de
 * lá, e os nomes também: quando a comparação semanal avisar que a página do
 * site mudou, o diff dela se porta para cá quase linha a linha.
 */

/**
 * Como no site, as linhas vão sem tipo: passam por componentes copiados
 * (ConversationCard, ChatHeader, painel do cliente) que as recebem assim, e
 * o PostgREST muda o tipo a cada filtro encadeado.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SemTipo = any;
export type Conversa = SemTipo;

/** Teto da aba Oportunidades: acima disso o contador admite imprecisão com "+". */
export const LIMITE_OPORTUNIDADES = 1000;

const pageSize = 20;

/**
 * Termo de busca comparável com o que está gravado em `clients.full_name`.
 *
 * A vírgula e os parênteses separam termos dentro do `.or()` do PostgREST, então
 * saem. Mas a vírgula quase sempre vem seguida de espaço: trocar só ela deixava
 * "Silva, Joao" como "Silva  Joao" (espaço DUPLO), e o ilike continuava sem casar
 * com o nome real. Colapsar os espaços é o que faz a busca voltar a encontrar.
 */
export const normalizeSearchTerm = (raw: string) =>
  (raw || "").replace(/[,()]/g, " ").replace(/\s+/g, " ").trim();

const porMaisRecente = (a: Conversa, b: Conversa) =>
  new Date(b.last_message_at || 0).getTime() - new Date(a.last_message_at || 0).getTime();

export type StatusLista = "all" | "unanswered" | "answered" | "opportunity";

/** O que da tela muda a CONSULTA (e não só a peneira no aparelho). */
export interface FiltrosConversas {
  searchQuery: string;
  dateFrom: Date | undefined;
  dateTo: Date | undefined;
  marketplaceFilter: string;
  stageFilter: string;
  rfvFilter: string;
  statusFilter: StatusLista;
}

export function useConversas({
  searchQuery, dateFrom, dateTo, marketplaceFilter, stageFilter, rfvFilter, statusFilter,
}: FiltrosConversas) {
  const { user } = useAuth();
  const { activeSeller } = useSellerContext();
  const { toast } = useToast();
  const { showNotification, playNotificationSound } = useNotifications();

  const [conversations, setConversations] = useState<Conversa[]>([]);
  /**
   * A conversa aberta mora aqui, junto da lista, porque o tempo real da lista
   * a atualiza (nome, janela de 24h, prévia) enquanto ela está na tela.
   */
  const [selectedConversation, setSelectedConversation] = useState<Conversa>(null);
  const selectedConversationIdRef = useRef<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [serverMatchedConvIds, setServerMatchedConvIds] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(0);
  const [hasMoreData, setHasMoreData] = useState(true);
  const [activeSellerId, setActiveSellerId] = useState<string | null>(null);
  /** conversation_id -> oportunidade de venda que a IA achou (whatsapp_conversion_cases). */
  const [oportunidades, setOportunidades] = useState<Record<string, OportunidadeIA>>({});
  /** Evita repetir as 6 consultas de carga a cada ida e volta na aba. */
  const oportunidadesCarregadasRef = useRef<string>("");
  const [clientMarketplaces, setClientMarketplaces] = useState<Record<string, string[]>>({});
  const [pipelineStages, setPipelineStages] = useState<SemTipo[]>([]);
  const [sellerTags, setSellerTags] = useState<SemTipo[]>([]);
  const [sellerInstances, setSellerInstances] = useState<{ id: string; label: string }[]>([]);
  const [sellerMarketplaces, setSellerMarketplaces] = useState<string[]>([]);
  const [clientStages, setClientStages] = useState<Record<string, string>>({});
  const [clientTagsMap, setClientTagsMap] = useState<Record<string, string[]>>({});
  const [clientRfvMap, setClientRfvMap] = useState<Record<string, string>>({});
  /** last_message_at da última conversa da PÁGINA do WhatsApp (não da lista fundida). */
  const [waCursor, setWaCursor] = useState<string | null>(null);
  const [markingAllRead, setMarkingAllRead] = useState(false);
  /**
   * Do app: a primeira página não veio. No site a falha vira um toast e a lista
   * vazia diz "Nenhuma conversa", o que no celular sem internet seria mentira.
   */
  const [erro, setErro] = useState(false);

  useEffect(() => {
    selectedConversationIdRef.current = selectedConversation?.id ?? null;
  }, [selectedConversation?.id]);

  const handleMarkAllAsRead = async () => {
    if (!activeSellerId || markingAllRead) return;
    const unreadConvs = conversations.filter((c) => (c.unread_count || 0) > 0);
    if (unreadConvs.length === 0) {
      toast({ title: "Nenhuma conversa não lida", description: "Todas as conversas já estão marcadas como lidas." });
      return;
    }
    try {
      setMarkingAllRead(true);
      const { error } = await supabase
        .from("conversations")
        .update({ unread_count: 0 })
        .eq("seller_id", activeSellerId)
        .gt("unread_count", 0);
      if (error) throw error;
      setConversations((prev) => prev.map((c) => ({ ...c, unread_count: 0 })));
      toast({
        title: "Conversas marcadas como lidas",
        description: `${unreadConvs.length} ${unreadConvs.length === 1 ? "conversa marcada" : "conversas marcadas"} como lida${unreadConvs.length === 1 ? "" : "s"}.`,
      });
    } catch (err: SemTipo) {
      console.error("Error marking all as read:", err);
      toast({
        title: "Erro ao marcar como lidas",
        description: err.message || "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setMarkingAllRead(false);
    }
  };

  const enrichConversationsWithMetadata = async (baseConversations: Conversa[]) => {
    if (!baseConversations.length) return baseConversations;

    const conversationIds = baseConversations.map((conv) => conv.id).filter(Boolean);
    if (!conversationIds.length) return baseConversations;

    try {
      const [templateMessages, workflowMessages, sentimentMessages] = await Promise.all([
        supabase
          .from("messages" as SemTipo)
          .select("conversation_id, template_name, created_at")
          .in("conversation_id", conversationIds)
          .eq("direction", "outbound")
          .not("template_name", "is", null)
          .order("created_at", { ascending: true }),
        supabase
          .from("messages" as SemTipo)
          .select("conversation_id, workflow_id, created_at, workflows(name)")
          .in("conversation_id", conversationIds)
          .eq("direction", "outbound")
          .not("workflow_id", "is", null)
          .order("created_at", { ascending: true }),
        supabase
          .from("messages" as SemTipo)
          .select("conversation_id, ai_sentiment, created_at")
          .in("conversation_id", conversationIds)
          .eq("direction", "inbound")
          .not("ai_sentiment", "is", null)
          .order("created_at", { ascending: false }),
      ]);

      const metadataError = templateMessages.error || workflowMessages.error || sentimentMessages.error;
      if (metadataError) {
        console.warn("Metadata da lista de conversas não carregou:", metadataError);
        return baseConversations;
      }

      const primeiraPorConversa = (linhas: SemTipo[] | null) => {
        const mapa = new Map<string, SemTipo>();
        (linhas || []).forEach((msg) => {
          if (!mapa.has(msg.conversation_id)) mapa.set(msg.conversation_id, msg);
        });
        return mapa;
      };
      const firstTemplateByConversation = primeiraPorConversa(templateMessages.data);
      const firstWorkflowByConversation = primeiraPorConversa(workflowMessages.data);
      // Ordem decrescente na consulta: a "primeira" aqui é a última classificada.
      const lastSentimentByConversation = primeiraPorConversa(sentimentMessages.data);

      return baseConversations.map((conv) => {
        const templateMsg = firstTemplateByConversation.get(conv.id);
        const workflowMsg = firstWorkflowByConversation.get(conv.id);
        const sentimentMsg = lastSentimentByConversation.get(conv.id);

        return {
          ...conv,
          template_tag: templateMsg?.template_name || null,
          workflow_id: workflowMsg?.workflow_id || null,
          workflow_name: workflowMsg?.workflows?.name || null,
          last_sentiment: sentimentMsg?.ai_sentiment || null,
        };
      });
    } catch (error) {
      console.warn("Falha ao enriquecer conversas:", error);
      return baseConversations;
    }
  };

  const attachClientsToConversations = async (baseConversations: Conversa[]) => {
    if (!baseConversations.length) return baseConversations;

    const clientIds = Array.from(new Set(baseConversations.map((conv) => conv.client_id).filter(Boolean)));
    if (!clientIds.length) return baseConversations;

    const { data: clients, error } = await supabase
      .from("clients")
      .select("id, full_name, whatsapp, email, birthdate, age, gender, city, state_code, document, document_type")
      .in("id", clientIds as string[]);

    if (error) {
      console.warn("Clientes da lista de conversas não carregaram:", error);
      return baseConversations;
    }

    const clientsById = new Map((clients || []).map((client: SemTipo) => [client.id, client]));
    return baseConversations.map((conv) => ({
      ...conv,
      clients: clientsById.get(conv.client_id) || conv.clients || null,
    }));
  };

  /** O mesmo recorte de data em toda consulta de conversas (ver fetchConversationsPage). */
  const recorteDeData = (q: SemTipo) => {
    // O Calendar devolve meia-noite LOCAL, então toISOString() já entrega o
    // instante certo para um timestamptz. O fim é a meia-noite do dia SEGUINTE
    // com `lt`, para o dia escolhido entrar inteiro.
    if (dateFrom) q = q.gte("last_message_at", dateFrom.toISOString());
    if (dateTo) q = q.lt("last_message_at", new Date(dateTo.getTime() + 86400000).toISOString());
    return q;
  };

  const fetchConversationsPage = async (pageNumber: number, sellerId: string) => {
    const offset = pageNumber * pageSize;
    const query = recorteDeData(supabase.from("conversations").select("*").eq("seller_id", sellerId).eq("status", "open"));
    const { data, error } = await query
      .order("last_message_at", { ascending: false })
      .range(offset, offset + pageSize - 1);
    if (error) throw error;

    return attachClientsToConversations(data || []);
  };

  /** Pagina de 1000 em 1000 (até 10 mil) uma coluna `client_id` filtrada pelo seller. */
  const coletarClientIds = async (montar: (from: number, to: number) => SemTipo) => {
    const ids = new Set<string>();
    const pageLength = 1000;

    for (let from = 0; from < 10000; from += pageLength) {
      const { data, error } = await montar(from, from + pageLength - 1);
      if (error) throw error;
      (data || []).forEach((row: SemTipo) => {
        if (row.client_id) ids.add(row.client_id);
      });
      if (!data || data.length < pageLength) break;
    }

    return Array.from(ids);
  };

  const fetchClientIdsByMarketplace = (sellerId: string, marketplace: string) =>
    coletarClientIds((from, to) =>
      supabase
        .from("orders")
        .select("client_id")
        .eq("seller_id", sellerId)
        .eq("marketplace", marketplace as SemTipo)
        .not("client_id", "is", null)
        .range(from, to),
    );

  const fetchClientIdsByStage = (sellerId: string, stageId: string) =>
    coletarClientIds((from, to) =>
      supabase
        .from("client_pipeline")
        .select("client_id")
        .eq("seller_id", sellerId)
        .eq("stage_id", stageId)
        .not("client_id", "is", null)
        .range(from, to),
    );

  /**
   * Busca no servidor as conversas de uma lista de clientes e as funde na lista
   * atual. Existe porque os filtros de loja e de fase do Kanban rodam NO
   * APARELHO sobre a página carregada (20 conversas): sem esta carga, filtrar
   * por algo que não está entre as 20 mais recentes devolve lista vazia.
   */
  const carregarConversasDosClientes = async (clientIds: string[], sellerId: string, cancelado: () => boolean) => {
    if (clientIds.length === 0) return;

    const convs: Conversa[] = [];
    const chunkSize = 300;
    for (let index = 0; index < clientIds.length && convs.length < 300; index += chunkSize) {
      const chunk = clientIds.slice(index, index + chunkSize);
      const q = recorteDeData(
        supabase.from("conversations").select("*").eq("seller_id", sellerId).eq("status", "open").in("client_id", chunk),
      );
      const { data, error } = await q.order("last_message_at", { ascending: false }).limit(300);
      if (error) throw error;
      convs.push(...(data || []));
    }

    await fundirConversasNaLista(convs, sellerId, cancelado);
  };

  /**
   * Busca as conversas de uma lista de IDs de CONVERSA (o filtro de
   * oportunidades e o de segmento RFV já sabem a conversa, não o cliente) e
   * funde na lista. Percorre TODOS os pedaços: cada id é uma oportunidade que
   * a aba promete mostrar.
   */
  const carregarConversasPorIds = async (conversationIds: string[], sellerId: string, cancelado: () => boolean) => {
    if (conversationIds.length === 0) return;

    const alvo = conversationIds.slice(0, LIMITE_OPORTUNIDADES);
    const convs: Conversa[] = [];
    const chunkSize = 200;
    for (let index = 0; index < alvo.length; index += chunkSize) {
      if (cancelado()) return;
      const chunk = alvo.slice(index, index + chunkSize);
      const q = recorteDeData(
        supabase.from("conversations").select("*").eq("seller_id", sellerId).eq("status", "open").in("id", chunk),
      );
      const { data, error } = await q.order("last_message_at", { ascending: false }).limit(chunkSize);
      if (error) throw error;
      convs.push(...(data || []));
    }

    await fundirConversasNaLista(convs, sellerId, cancelado, { teto: LIMITE_OPORTUNIDADES });
  };

  /** Ordena, anexa cliente, funde na lista e carrega os acessórios (loja, fase, tags). */
  const fundirConversasNaLista = async (
    convs: Conversa[],
    sellerId: string,
    cancelado: () => boolean,
    opcoes?: { teto?: number },
  ) => {
    const teto = opcoes?.teto ?? 300;
    if (cancelado()) return;
    convs.sort(porMaisRecente);

    const withClients = await attachClientsToConversations(convs.slice(0, teto));
    if (cancelado()) return;
    const loadedClientIds = withClients.map((c) => c.client_id).filter(Boolean);

    setConversations((prev) => {
      const byId = new Map(prev.map((c) => [c.id, c]));
      withClients.forEach((c) => {
        const existing = byId.get(c.id);
        byId.set(c.id, existing ? { ...existing, ...c } : c);
      });
      return Array.from(byId.values()).sort(porMaisRecente);
    });

    await fetchMarketplacesForClients(loadedClientIds, sellerId, false);
    // Sem isto o clientStages não conhece as conversas recém-trazidas e o
    // filtro de fase as descartaria justamente por falta do dado que motivou a busca.
    await fetchStagesAndTagsForClients(loadedClientIds, sellerId, false);
  };

  const fetchMarketplacesForClients = async (clientIds: string[], sellerId: string, reset: boolean) => {
    if (!clientIds.length) {
      if (reset) setClientMarketplaces({});
      return;
    }
    const { data, error } = await supabase
      .from("orders")
      .select("client_id, marketplace")
      .eq("seller_id", sellerId)
      .in("client_id", clientIds)
      .neq("marketplace", "retroativo");
    if (error) {
      console.error("Error loading marketplaces for clients:", error);
      return;
    }
    const map: Record<string, Set<string>> = {};
    (data || []).forEach((o: SemTipo) => {
      if (!o.client_id || !o.marketplace) return;
      if (!map[o.client_id]) map[o.client_id] = new Set();
      map[o.client_id].add(o.marketplace);
    });
    setClientMarketplaces((prev) => {
      const base = reset ? {} : { ...prev };
      Object.entries(map).forEach(([cid, set]) => {
        base[cid] = Array.from(set);
      });
      return base;
    });
  };

  const fetchStagesAndTagsForClients = async (clientIds: string[], sellerId: string, reset: boolean) => {
    if (!clientIds.length) {
      if (reset) {
        setClientStages({});
        setClientTagsMap({});
        setClientRfvMap({});
      }
      return;
    }
    const [{ data: pipelineRows }, { data: tagRows }, { data: rfvRows }] = await Promise.all([
      supabase.from("client_pipeline").select("client_id, stage_id").eq("seller_id", sellerId).in("client_id", clientIds),
      supabase.from("client_tag_assignments").select("client_id, tag_id").eq("seller_id", sellerId).in("client_id", clientIds),
      (supabase as SemTipo).from("client_rfv").select("client_id, segment").eq("seller_id", sellerId).in("client_id", clientIds),
    ]);
    setClientStages((prev) => {
      const base = reset ? {} : { ...prev };
      (pipelineRows || []).forEach((r: SemTipo) => {
        if (r.client_id && r.stage_id) base[r.client_id] = r.stage_id;
      });
      return base;
    });
    setClientTagsMap((prev) => {
      const base: Record<string, string[]> = reset ? {} : { ...prev };
      (tagRows || []).forEach((r: SemTipo) => {
        if (!r.client_id || !r.tag_id) return;
        const arr = base[r.client_id] ? [...base[r.client_id]] : [];
        if (!arr.includes(r.tag_id)) arr.push(r.tag_id);
        base[r.client_id] = arr;
      });
      return base;
    });
    setClientRfvMap((prev) => {
      const base: Record<string, string> = reset ? {} : { ...prev };
      ((rfvRows as SemTipo[]) || []).forEach((r) => {
        if (r.client_id && r.segment) base[r.client_id] = r.segment;
      });
      return base;
    });
  };

  /** Funde os metadados (template, workflow, sentimento) que chegam depois da página. */
  const aplicarMetadados = (lote: Conversa[]) => {
    void enrichConversationsWithMetadata(lote).then((enriched) => {
      setConversations((current) => current.map((conv) => enriched.find((item) => item.id === conv.id) || conv));
    });
  };

  const loadInitialConversations = async () => {
    if (!user) return;
    const sellerId = activeSeller?.id;
    if (!sellerId) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setActiveSellerId(sellerId);
      const data = await fetchConversationsPage(0, sellerId);
      setConversations(data);
      setErro(false);
      // Cursor, página e "tem mais" no MESMO lote da lista: o corte do ML depende
      // dos três, e com os dois últimos depois dos awaits abaixo os cards do ML
      // apareciam e desapareciam por um instante.
      setWaCursor(data.length ? data[data.length - 1].last_message_at ?? null : null);
      setPage(0);
      setHasMoreData(data.length === pageSize);
      aplicarMetadados(data);
      const ids = data.map((c) => c.client_id).filter(Boolean);
      await fetchMarketplacesForClients(ids, sellerId, true);
      await fetchStagesAndTagsForClients(ids, sellerId, true);
      setLoading(false);
    } catch (error) {
      console.error("Error loading conversations:", error);
      setErro(true);
      // app: sem internet o aviso fica na própria lista ("Sem internet"); o toast
      // diria só "Failed to fetch".
      if (navigator.onLine) {
        toast({
          title: "Erro ao carregar conversas",
          description: error instanceof Error ? error.message : "Erro desconhecido",
          variant: "destructive",
        });
      }
      setLoading(false);
    }
  };

  const loadMoreConversations = async () => {
    if (loadingMore || !hasMoreData || !user) return;
    const sellerId = activeSeller?.id;
    if (!sellerId) return;
    setLoadingMore(true);
    const nextPage = page + 1;
    try {
      const newData = await fetchConversationsPage(nextPage, sellerId);
      if (newData.length > 0) {
        // Dedupe por id: a paginação vai por offset e não conhece as conversas
        // que os filtros de oportunidade/loja/fase injetaram fora de página.
        setConversations((prev) => {
          const vistos = new Set(prev.map((c) => c.id));
          return [...prev, ...newData.filter((c) => !vistos.has(c.id))];
        });
        // No MESMO lote da página nova (ver loadInitialConversations).
        setPage(nextPage);
        setWaCursor(newData[newData.length - 1].last_message_at ?? null);
        setHasMoreData(newData.length === pageSize);
        aplicarMetadados(newData);
        const ids = newData.map((c) => c.client_id).filter(Boolean);
        await fetchMarketplacesForClients(ids, sellerId, false);
        await fetchStagesAndTagsForClients(ids, sellerId, false);
      } else {
        setHasMoreData(false);
      }
    } catch (error) {
      console.error("Error loading more conversations:", error);
    } finally {
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    if (user && activeSeller?.id) void loadInitialConversations();
    // `user?.id` e não `user`: o supabase-js emite SIGNED_IN ao voltar ao app com
    // um objeto `user` novo de mesmo id, e depender do objeto refazia a carga.
    // dateFrom/dateTo mudam a CONSULTA, não a peneira: recarrega da página 0.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, activeSeller?.id, dateFrom?.getTime(), dateTo?.getTime()]);

  // Do app: a lista que não veio por falta de rede volta sozinha com a conexão.
  const erroRef = useRef(erro);
  erroRef.current = erro;
  useEffect(() => {
    const aoVoltarRede = () => {
      if (erroRef.current) void loadInitialConversations();
    };
    window.addEventListener("online", aoVoltarRede);
    return () => window.removeEventListener("online", aoVoltarRede);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, activeSeller?.id, dateFrom?.getTime(), dateTo?.getTime()]);

  // Busca no servidor: quando a pessoa digita algo, buscamos clientes que casam
  // com o termo (mesmo que a conversa ainda não esteja na lista paginada) e
  // fundimos as conversas deles na lista.
  useEffect(() => {
    const sellerId = activeSeller?.id;
    if (!sellerId) return;
    const raw = searchQuery.trim();
    if (raw.length < 2) {
      setServerMatchedConvIds(new Set());
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const digits = raw.replace(/\D/g, "");

        // 1) Clientes direto na tabela `clients` (a RLS já restringe ao que o
        //    usuário pode ver).
        const termo = normalizeSearchTerm(raw);
        const orFilters: string[] = [];
        if (termo) {
          orFilters.push(`full_name.ilike.%${termo}%`);
          orFilters.push(`email.ilike.%${termo}%`);
        }
        // Piso de 3 dígitos: o final curto do número é o que a pessoa lembra.
        if (digits.length >= 3) orFilters.push(`whatsapp.ilike.%${digits}%`);
        if (!orFilters.length) return;
        const { data: clientMatches, error: clientsErr } = await supabase
          .from("clients")
          .select("id, full_name, whatsapp")
          .or(orFilters.join(","))
          .limit(200);
        if (clientsErr) {
          console.warn("[omnichannel] client search error:", clientsErr);
          return;
        }
        const candidateIds = (clientMatches || []).map((c: SemTipo) => c.id);
        if (!candidateIds.length || cancelled) return;

        // 2) Só os vinculados ao seller ativo.
        const { data: linkedRows } = await supabase
          .from("clients_sellers")
          .select("client_id")
          .eq("seller_id", sellerId)
          .in("client_id", candidateIds);
        const linkedIds = (linkedRows || []).map((r: SemTipo) => r.client_id);
        if (!linkedIds.length || cancelled) return;

        // 3) As conversas destes clientes.
        const { data: convs } = await supabase
          .from("conversations")
          .select("*")
          .eq("seller_id", sellerId)
          .in("client_id", linkedIds)
          .order("last_message_at", { ascending: false })
          .limit(100);
        if (cancelled) return;

        const withClients = await attachClientsToConversations(convs || []);
        if (cancelled) return;

        setServerMatchedConvIds(new Set(withClients.map((c) => c.id)));

        setConversations((prev) => {
          const byId = new Map(prev.map((c) => [c.id, c]));
          withClients.forEach((c) => {
            const existing = byId.get(c.id);
            byId.set(c.id, existing ? { ...existing, ...c } : c);
          });
          return Array.from(byId.values()).sort(porMaisRecente);
        });

        void enrichConversationsWithMetadata(withClients).then((enriched) => {
          if (cancelled) return;
          setConversations((current) => current.map((conv) => enriched.find((item) => item.id === conv.id) || conv));
        });
        const newClientIds = withClients.map((c) => c.client_id).filter(Boolean);
        void fetchMarketplacesForClients(newClientIds, sellerId, false);
        void fetchStagesAndTagsForClients(newClientIds, sellerId, false);
      } catch (err) {
        console.warn("Falha na busca server-side do omnichannel:", err);
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [searchQuery, activeSeller?.id]);

  // Tempo real da lista, separado da carga inicial.
  useEffect(() => {
    if (!user || !activeSeller?.id) return;
    const sellerId = activeSeller.id;
    let updateTimeout: ReturnType<typeof setTimeout>;
    const conversationsChannel = supabase
      .channel(`conversations-updates-${sellerId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conversations", filter: `seller_id=eq.${sellerId}` },
        async (payload) => {
          if ((payload.new as SemTipo)?.seller_id !== sellerId) return;
          clearTimeout(updateTimeout);
          updateTimeout = setTimeout(async () => {
            if (payload.eventType === "UPDATE" || payload.eventType === "INSERT") {
              const { data: fullConversation, error } = await supabase
                .from("conversations")
                .select("*")
                .eq("id", (payload.new as SemTipo).id)
                .eq("seller_id", sellerId)
                .maybeSingle();
              if (!error && fullConversation) {
                const typedConversation = (await attachClientsToConversations([fullConversation]))[0];
                setConversations((prev) => {
                  const existing = prev.find((c) => c.id === typedConversation.id);
                  if (existing) {
                    // Sempre reordena para mostrar a conversa mais recente no topo.
                    return prev
                      .map((c) => (c.id === typedConversation.id ? typedConversation : c))
                      .sort((a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime());
                  }
                  return page === 0 ? [typedConversation, ...prev] : prev;
                });
                if (typedConversation.id === selectedConversationIdRef.current) {
                  setSelectedConversation(typedConversation);
                }
                if (typedConversation.unread_count > 0 && typedConversation.id !== selectedConversationIdRef.current) {
                  playNotificationSound();
                  showNotification({
                    title: "Nova mensagem",
                    body: `${typedConversation.clients?.full_name || "Cliente"}: ${typedConversation.last_message_preview || "Nova mensagem"}`,
                    playSound: false,
                  });
                }
              }
            }
          }, 300);
        },
      )
      .subscribe();
    return () => {
      clearTimeout(updateTimeout);
      supabase.removeChannel(conversationsChannel);
    };
    // As funções de notificação ficam fora das deps: são estáveis (useCallback no
    // useNotifications) e tê-las aqui refazia o subscribe a cada desenho, abrindo
    // uma janela em que mensagem que chega se perde.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, activeSeller?.id, page]);

  // Fases, tags, marketplaces e números do seller, para os filtros.
  useEffect(() => {
    const sellerId = activeSeller?.id;
    if (!sellerId) return;
    (async () => {
      const [{ data: stages }, { data: tags }, marketplacesRes, instancesRes] = await Promise.all([
        supabase.from("pipeline_stages").select("id, name, color, position").eq("seller_id", sellerId).order("position"),
        supabase.from("client_tags").select("id, name, color").eq("seller_id", sellerId).order("name"),
        supabase.rpc("get_omnichannel_marketplaces", { p_seller_id: sellerId }),
        supabase
          .from("whatsapp_cloud_instances")
          .select("id, label, business_phone_number")
          .eq("seller_id", sellerId)
          .order("is_default", { ascending: false }),
      ]);
      setPipelineStages(stages || []);
      setSellerTags(tags || []);
      if (marketplacesRes.error) console.warn("[omnichannel] get_omnichannel_marketplaces error:", marketplacesRes.error);
      setSellerMarketplaces((marketplacesRes.data || []).map((d: SemTipo) => d.marketplace).filter(Boolean));
      // Rótulo dado pelo usuário quando existir; senão o próprio número do WhatsApp.
      if (instancesRes.error) console.warn("[omnichannel] whatsapp_cloud_instances error:", instancesRes.error);
      setSellerInstances(
        (instancesRes.data || []).map((i: SemTipo) => ({
          id: i.id,
          label: i.label?.trim() || i.business_phone_number || "Número",
        })),
      );
    })();
  }, [activeSeller?.id]);

  // Filtro de loja: traz do servidor as conversas de quem comprou nela.
  useEffect(() => {
    const sellerId = activeSeller?.id;
    if (!sellerId || marketplaceFilter === "all" || marketplaceFilter === "none") return;

    let cancelled = false;
    (async () => {
      try {
        const clientIds = await fetchClientIdsByMarketplace(sellerId, marketplaceFilter);
        if (cancelled) return;
        await carregarConversasDosClientes(clientIds, sellerId, () => cancelled);
      } catch (err) {
        console.warn("[omnichannel] marketplace filter full-load error:", err);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSeller?.id, marketplaceFilter]);

  // Oportunidades de venda que a IA achou nas conversas deste seller. Carrega
  // TODAS de uma vez (o contador da aba precisa do número real). O embed
  // conversations!inner + status=open garante que o contador é o mesmo que a
  // lista consegue mostrar. Só detected + validated_case: o que o admin
  // descartou não volta como oportunidade.
  useEffect(() => {
    const sellerId = activeSeller?.id;
    // Zera SEMPRE: na troca de seller o mapa do anterior ficaria na tela.
    setOportunidades({});
    oportunidadesCarregadasRef.current = "";
    if (!sellerId) return;

    let cancelado = false;
    (async () => {
      const { data, error } = await supabase
        .from("whatsapp_conversion_cases")
        .select("conversation_id, intent_type, intent_summary, intent_confidence, conversations!inner(status)")
        .eq("seller_id", sellerId)
        .in("status", ["detected", "validated_case"])
        .eq("conversations.status", "open")
        .limit(LIMITE_OPORTUNIDADES);

      if (cancelado) return;
      if (error) {
        console.warn("[omnichannel] falha ao carregar oportunidades da IA:", error.message);
        return;
      }

      const mapa: Record<string, OportunidadeIA> = {};
      (data || []).forEach((r: SemTipo) => {
        if (!r.conversation_id) return;
        mapa[r.conversation_id] = {
          tipo: r.intent_type,
          resumo: r.intent_summary ?? null,
          confianca: r.intent_confidence ?? null,
        };
      });
      setOportunidades(mapa);
    })();

    return () => {
      cancelado = true;
    };
  }, [activeSeller?.id]);

  // Aba Oportunidades: sem esta carga ela filtraria só as 20 conversas da página.
  useEffect(() => {
    const sellerId = activeSeller?.id;
    if (!sellerId || statusFilter !== "opportunity") return;

    const ids = Object.keys(oportunidades);
    if (ids.length === 0) return;

    // Alternar entre abas é a triagem normal: não refaz as 6 consultas a cada volta.
    const assinatura = `${sellerId}:${ids.length}:${ids[0]}`;
    if (oportunidadesCarregadasRef.current === assinatura) return;
    oportunidadesCarregadasRef.current = assinatura;

    let cancelado = false;
    (async () => {
      try {
        await carregarConversasPorIds(ids, sellerId, () => cancelado);
      } catch (err) {
        oportunidadesCarregadasRef.current = "";
        console.warn("[omnichannel] falha ao carregar conversas das oportunidades:", err);
      }
    })();

    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSeller?.id, statusFilter, oportunidades]);

  // Filtro de fase do Kanban: mesma carga do filtro de loja. 'none' (sem fase)
  // fica de fora: não dá para enumerar quem NÃO tem linha em client_pipeline.
  useEffect(() => {
    const sellerId = activeSeller?.id;
    if (!sellerId || stageFilter === "all" || stageFilter === "none") return;

    let cancelled = false;
    (async () => {
      try {
        const clientIds = await fetchClientIdsByStage(sellerId, stageFilter);
        if (cancelled) return;
        await carregarConversasDosClientes(clientIds, sellerId, () => cancelled);
      } catch (err) {
        console.warn("[omnichannel] stage filter full-load error:", err);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSeller?.id, stageFilter]);

  // Filtro de segmento RFV: a RPC pagina por segmento no servidor e devolve id
  // de CONVERSA (as 300 mais recentes; o resto chega pela paginação normal).
  useEffect(() => {
    const sellerId = activeSeller?.id;
    if (!sellerId || rfvFilter === "all" || rfvFilter === "none") return;

    let cancelled = false;
    (async () => {
      try {
        const { data: ids, error } = await (supabase as SemTipo).rpc("conversation_ids_by_rfv_segments", {
          p_seller_id: sellerId,
          p_segments: [rfvFilter],
          p_limit: 300,
          p_offset: 0,
        });
        if (error) throw error;
        await carregarConversasPorIds((ids as string[]) || [], sellerId, () => cancelled);
      } catch (err) {
        console.warn("[omnichannel] rfv filter full-load error:", err);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSeller?.id, rfvFilter]);

  return {
    conversations, setConversations, selectedConversation, setSelectedConversation,
    loading, loadingMore, page, hasMoreData, waCursor, activeSellerId, erro,
    serverMatchedConvIds, oportunidades,
    pipelineStages, sellerTags, setSellerTags, sellerInstances, sellerMarketplaces,
    clientMarketplaces, clientStages, setClientStages, clientTagsMap, setClientTagsMap, clientRfvMap,
    markingAllRead, handleMarkAllAsRead, loadMoreConversations,
    tentarDeNovo: loadInitialConversations,
  };
}

/** A conversa de um cliente (abrir pelo `?client_id=`), com o cliente embutido. */
export async function buscarConversaDoCliente(sellerId: string, clientId: string) {
  return supabase
    .from("conversations")
    .select(`
      *,
      clients!inner(
        id,
        full_name,
        whatsapp,
        email,
        birthdate,
        age,
        gender,
        city,
        state_code,
        document,
        document_type
      )
    `)
    .eq("seller_id", sellerId)
    .eq("client_id", clientId)
    .order("last_message_at", { ascending: false })
    .limit(1)
    .maybeSingle();
}
