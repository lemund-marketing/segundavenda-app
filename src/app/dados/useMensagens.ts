import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useSellerContext } from "@/contexts/SellerContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useNotifications } from "@/hooks/useNotifications";
import { nomeSeguroParaChave } from "@/utils/storageKey";
import type { Conversa, SemTipo } from "@/app/dados/useConversas";

/**
 * A conversa aberta do WhatsApp: a thread (WhatsApp, SMS e e-mail juntos),
 * os pedidos do cliente, o tempo real das três tabelas, os templates
 * aprovados e os envios. Mesmas consultas e assinaturas da página do site
 * (src/pages/Omnichannel.tsx), com os mesmos nomes, para o diff de lá se
 * portar para cá quase linha a linha.
 */

export type Mensagem = SemTipo;

// A thread foi escrita para linhas de `messages`. SMS e e-mail moram em tabelas
// próprias (sms_messages / email_logs), com nomes de coluna diferentes, então
// os dois viram o mesmo formato de bolha antes de entrar no estado.
const SMS_FAILED_STATUSES = new Set(["failed", "blocked", "expired", "rejected", "invalid_number"]);

const deriveSmsStatus = (m: SemTipo): string => {
  if (m.failed_at || SMS_FAILED_STATUSES.has(m.status)) return "failed";
  // Clique no link é a prova mais forte de leitura que o SMS oferece -> check duplo.
  if (m.clicked_at || m.first_clicked_at) return "read";
  if (m.delivered_at || m.status === "delivered") return "delivered";
  if (m.sent_at || m.status === "sent") return "sent";
  return "pending";
};

const normalizeSmsMessage = (m: SemTipo) => ({
  id: m.id,
  conversation_id: m.conversation_id,
  // sms_messages não tem `direction`: todo registro ali é envio nosso.
  direction: "outbound",
  content: m.message_text || "",
  content_type: "text",
  created_at: m.created_at,
  status: deriveSmsStatus(m),
  delivered_at: m.delivered_at,
  failed_reason: m.error_message || m.bhi_status_description || m.bhi_response_message,
  segments: m.segments,
  cost_cents: m.cost_cents,
  template_name: m.template_name,
  clicked_at: m.clicked_at || m.first_clicked_at,
  link_url: m.link_url,
  _sms: true,
});

const htmlToPlainText = (html: string): string =>
  html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|h[1-6]|li)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

const deriveEmailStatus = (m: SemTipo): string => {
  if (m.bounced_at || m.complaint_at || m.status === "failed" || m.status === "bounced" || m.status === "complaint") return "failed";
  if (m.clicked_at || m.opened_at) return "read";
  if (m.delivered_at || m.status === "delivered") return "delivered";
  if (m.status === "sent") return "sent";
  return "pending";
};

const normalizeEmailMessage = (m: SemTipo) => ({
  id: m.id,
  conversation_id: m.conversation_id,
  direction: "outbound",
  content: m.body_text || (m.body_html ? htmlToPlainText(m.body_html) : ""),
  subject: m.subject,
  content_type: "text",
  created_at: m.created_at,
  status: deriveEmailStatus(m),
  delivered_at: m.delivered_at,
  // Nesta base a coluna é `failed_reason`.
  failed_reason: m.failed_reason,
  opened_at: m.opened_at,
  clicked_at: m.clicked_at,
  bounced_at: m.bounced_at,
  to_email: m.to_email,
  _email: true,
});

export function useMensagens(
  selectedConversation: Conversa,
  activeSellerId: string | null,
  setConversations: Dispatch<SetStateAction<Conversa[]>>,
) {
  const { toast } = useToast();
  const { showNotification, playNotificationSound } = useNotifications();
  const [messages, setMessages] = useState<Mensagem[]>([]);
  const [clientOrders, setClientOrders] = useState<SemTipo[]>([]);
  /**
   * Do app: a thread ainda vindo ou que não veio. No site as duas aparecem como
   * "Nenhuma mensagem registrada", o que sem internet seria mentira.
   */
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState(false);
  const [tentativa, setTentativa] = useState(0);
  /** O nome da notificação sai da conversa da hora, não da que abriu a assinatura. */
  const conversaRef = useRef(selectedConversation);
  conversaRef.current = selectedConversation;

  useEffect(() => {
    if (!selectedConversation) {
      setMessages([]);
      setClientOrders([]);
      setCarregando(false);
      setErro(false);
      return;
    }
    let ativo = true;

    // Zerar ANTES de buscar: o cabeçalho já mostra o cliente novo no primeiro
    // quadro, e sem isso a thread e os pedidos do ANTERIOR ficavam na tela.
    setMessages([]);
    setClientOrders([]);

    // Marcar como lida IMEDIATAMENTE ao abrir.
    const markAsRead = async () => {
      if (selectedConversation.unread_count > 0) {
        await supabase.from("conversations").update({ unread_count: 0 }).eq("id", selectedConversation.id);
        setConversations((prev) =>
          prev.map((conv) => (conv.id === selectedConversation.id ? { ...conv, unread_count: 0 } : conv)),
        );
      }
    };
    void markAsRead();

    // A thread MESCLA os três canais: a conversa é única por cliente (UNIQUE
    // seller_id+client_id) e WhatsApp, SMS e e-mail moram na MESMA linha.
    const conv = selectedConversation;

    const loadMessagesForConversation = async () => {
      setCarregando(true);
      setErro(false);
      try {
        const [waRes, smsRes, emailRes] = await Promise.all([
          supabase.from("messages").select("*").eq("conversation_id", conv.id).order("created_at", { ascending: true }),
          supabase.from("sms_messages" as SemTipo).select("*").eq("conversation_id", conv.id).order("created_at", { ascending: true }),
          supabase.from("email_logs" as SemTipo).select("*").eq("conversation_id", conv.id).order("created_at", { ascending: true }),
        ]);
        if (waRes.error) throw waRes.error;
        // SMS/e-mail são acessórios: um erro neles não pode apagar a thread de WhatsApp.
        if (smsRes.error) console.warn("[omnichannel] sms_messages:", smsRes.error);
        if (emailRes.error) console.warn("[omnichannel] email_logs:", emailRes.error);

        const emailRows = (emailRes.data as SemTipo[]) || [];
        // O send-email grava em email_logs E espelha um resumo em `messages`
        // (metadata.channel='email'). Fica a linha de email_logs, que é a rica.
        const mirroredLogIds = new Set(emailRows.map((e) => e.id));
        const waRows = ((waRes.data as SemTipo[]) || []).filter((m) => {
          if (m?.metadata?.channel !== "email") return true;
          return !mirroredLogIds.has(m?.metadata?.email_log_id);
        });

        const merged = [
          ...waRows,
          ...((smsRes.data as SemTipo[]) || []).map(normalizeSmsMessage),
          ...emailRows.map(normalizeEmailMessage),
        ].sort((a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime());

        if (ativo) setMessages(merged);
      } catch (error) {
        console.error("Error loading messages:", error);
        if (ativo) setErro(true);
      } finally {
        if (ativo) setCarregando(false);
      }
    };

    const loadClientOrders = async () => {
      if (!selectedConversation.client_id) return;
      try {
        // Filtrar por seller é obrigatório: o mesmo cliente pode comprar de
        // sellers diferentes e o painel somaria pedidos de outra conta.
        const sellerDaConversa = selectedConversation.seller_id || activeSellerId;
        let query = supabase.from("orders").select("*").eq("client_id", selectedConversation.client_id);
        if (sellerDaConversa) query = query.eq("seller_id", sellerDaConversa);
        const { data, error } = await query.order("acquired_at", { ascending: false });
        if (error) {
          console.error("Error loading orders:", error);
          return;
        }
        if (ativo) setClientOrders(data || []);
      } catch (error) {
        console.error("Error loading client orders:", error);
      }
    };

    void loadMessagesForConversation();
    void loadClientOrders();

    // Tempo real da conversa aberta: as TRÊS tabelas, porque a thread é mesclada.
    const smsChannel = supabase
      .channel(`sms-messages-${conv.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "sms_messages", filter: `conversation_id=eq.${conv.id}` },
        (payload: SemTipo) => {
          const row = payload.new || payload.old;
          if (!row) return;
          if (payload.eventType === "INSERT") {
            setMessages((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, normalizeSmsMessage(row)]));
          } else if (payload.eventType === "UPDATE") {
            setMessages((prev) => {
              // O aviso de falha sai da transição no estado local, não de
              // `payload.old` (que só vem completo com REPLICA IDENTITY FULL).
              const anterior = prev.find((m) => m.id === row.id);
              if (row.failed_at && anterior && anterior.status !== "failed") {
                toast({
                  title: "SMS não entregue",
                  description: row.error_message || row.bhi_status_description || "SMS não entregue ao destinatário.",
                });
              }
              return prev.map((m) => (m.id === row.id ? { ...m, ...normalizeSmsMessage(row) } : m));
            });
          }
        },
      )
      .subscribe();

    const emailChannel = supabase
      .channel(`email-logs-${conv.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "email_logs", filter: `conversation_id=eq.${conv.id}` },
        (payload: SemTipo) => {
          const row = payload.new || payload.old;
          if (!row) return;
          if (payload.eventType === "INSERT") {
            setMessages((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, normalizeEmailMessage(row)]));
          } else if (payload.eventType === "UPDATE") {
            setMessages((prev) => prev.map((m) => (m.id === row.id ? { ...m, ...normalizeEmailMessage(row) } : m)));
          }
        },
      )
      .subscribe();

    const channel = supabase
      .channel(`messages-${conv.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conv.id}` },
        (payload) => {
          const row: SemTipo = payload.new;
          setMessages((prev) => {
            if (prev.some((m) => m.id === row.id)) return prev;
            // O espelho do e-mail em `messages` não entra: a linha de email_logs
            // já chega (ou vai chegar) pela assinatura acima.
            if (row?.metadata?.channel === "email" && prev.some((m) => m.id === row?.metadata?.email_log_id)) {
              return prev;
            }
            return [...prev, row];
          });

          if (row.direction === "inbound") {
            playNotificationSound();
            // Não notifica quem já está vendo a conversa.
            if (document.hidden) {
              showNotification({
                title: conversaRef.current?.clients?.full_name || "Cliente",
                body: row.content || "Nova mensagem",
                playSound: false,
              });
            }
          }
        },
      )
      .subscribe();

    return () => {
      ativo = false;
      supabase.removeChannel(smsChannel);
      supabase.removeChannel(emailChannel);
      supabase.removeChannel(channel);
    };
    // Só a troca de conversa reabre a thread; a linha atualizada pelo tempo real
    // da lista não pode zerar as mensagens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedConversation?.id, tentativa]);

  // Do app: a thread que não veio por falta de rede volta sozinha com a conexão.
  useEffect(() => {
    if (!erro) return;
    const aoVoltarRede = () => setTentativa((t) => t + 1);
    window.addEventListener("online", aoVoltarRede);
    return () => window.removeEventListener("online", aoVoltarRede);
  }, [erro]);

  return { messages, clientOrders, carregando, erro, tentarDeNovo: () => setTentativa((t) => t + 1) };
}

/**
 * Templates aprovados do seller, para o seletor e para desenhar as bolhas de
 * template. `recarga` (de useConversas) relê quando a conexão volta: sem
 * template, a conversa com a janela fechada não tem como ser respondida.
 */
export function useTemplatesAprovados(recarga = 0) {
  const { user } = useAuth();
  const { activeSeller } = useSellerContext();
  const [templates, setTemplates] = useState<SemTipo[]>([]);
  const userId = user?.id;

  useEffect(() => {
    const sellerId = activeSeller?.id;
    if (!userId || !sellerId) return;
    let cancelado = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from("whatsapp_templates" as SemTipo)
          .select("*")
          .eq("seller_id", sellerId)
          .eq("status", "APPROVED")
          .order("name");
        // Uma releitura que falhe não apaga a lista que já veio.
        if (!cancelado && !error) setTemplates(data || []);
      } catch (error) {
        console.error("Error loading templates:", error);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [userId, activeSeller?.id, recarga]);

  return templates;
}

/** A caixa de envio fala WhatsApp: tudo sai por esta edge function. */
export async function enviarPelaCloud(payload: Record<string, unknown>) {
  const { error } = await supabase.functions.invoke("send-whatsapp-cloud", { body: payload });
  if (error) throw error;
}

/**
 * Sobe o anexo para o Storage (`chat-media`) e devolve a URL assinada por 1h
 * que vai para a Meta.
 */
export async function subirAnexo(sellerId: string, arquivo: File, aoAvancar?: (porcento: number) => void) {
  // O nome do arquivo NÃO pode ir cru para a chave: o Supabase recusa a chave
  // inteira em qualquer acento. O nome original segue em media_filename.
  const filePath = `${sellerId}/${Date.now()}-${nomeSeguroParaChave(arquivo.name)}`;
  const { error: uploadError } = await supabase.storage.from("chat-media").upload(filePath, arquivo);
  if (uploadError) throw new Error(`Upload falhou: ${uploadError.message}`);
  aoAvancar?.(60);

  const { data: signedUrlData, error: signedUrlError } = await supabase.storage
    .from("chat-media")
    .createSignedUrl(filePath, 3600);
  if (signedUrlError || !signedUrlData?.signedUrl) throw new Error("Falha ao gerar URL do arquivo");
  return signedUrlData.signedUrl;
}

export const getEdgeFunctionErrorMessage = async (err: SemTipo) => {
  const fallback = err?.message || "Erro ao enviar";

  // Erro das edge functions pode vir com `context: Response`.
  if (err?.context) {
    try {
      let body: SemTipo = null;
      if (typeof err.context.json === "function") {
        body = await err.context.json();
      } else if (err.context instanceof Response) {
        body = await err.context.clone().json();
      }
      if (body?.error) return String(body.error);
      if (body?.message) return String(body.message);
    } catch {
      // segue com o fallback
    }
  }

  if (err?.name === "FunctionsHttpError" && err?.message) return err.message;

  return fallback;
};
