import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ClientDetailData {
  client: any;
  pipeline: any;
  orders: any[];
  interactions: any[];
  conversation: any;
  messages: any[];
  smsMessages: any[];
  emailLogs: any[];
  wflows: any[];
  metrics: any | null;
}

/**
 * Fonte única dos dados do detalhe do cliente, usada pelo ClientDetailSheet
 * (CRM, lista de clientes, RFV, performance de templates).
 *
 * Passe `includeMessagesAndWorkflows: false` quando a tela não abre a aba
 * Histórico — economiza quatro idas ao banco.
 */
export function useClientDetail(
  clientId: string | null | undefined,
  sellerId: string,
  options: { enabled?: boolean; includeMessagesAndWorkflows?: boolean } = {},
) {
  const enabled = (options.enabled ?? true) && !!clientId;
  const includeHistory = options.includeMessagesAndWorkflows ?? true;

  return useQuery<ClientDetailData | null>({
    queryKey: ["client-detail", clientId, sellerId, includeHistory],
    queryFn: async () => {
      if (!clientId) return null;
      const [
        { data: client },
        { data: pipeline },
        { data: orders },
        { data: interactions },
        { data: conversations },
        { data: metrics },
      ] = await Promise.all([
        supabase.from("clients").select("*").eq("id", clientId).single(),
        supabase.from("client_pipeline").select("*, pipeline_stages (name, color)").eq("client_id", clientId).eq("seller_id", sellerId).maybeSingle(),
        // O filtro por seller é obrigatório: o mesmo cliente pode comprar de
        // sellers diferentes e sem ele o sheet somaria pedidos de outra conta.
        supabase.from("orders").select("*").eq("client_id", clientId).eq("seller_id", sellerId).order("acquired_at", { ascending: false }),
        supabase.from("client_interactions").select("*").eq("client_id", clientId).eq("seller_id", sellerId).order("created_at", { ascending: false }),
        // TODAS as conversas do cliente (ele pode ter uma de WhatsApp e uma de SMS).
        // Buscar só a mais recente escondia o histórico de WhatsApp quando havia SMS depois.
        supabase.from("conversations").select("id, channel, last_inbound_message_at, last_message_at").eq("client_id", clientId).eq("seller_id", sellerId).order("last_message_at", { ascending: false }),
        supabase.from("client_metrics").select("total_orders, total_spent, first_order_at, last_order_at").eq("client_id", clientId).eq("seller_id", sellerId).maybeSingle(),
      ]);

      const convList: any[] = conversations ?? [];
      // A janela de 24h é do WhatsApp: prioriza a conversa de WhatsApp (fallback: a mais recente).
      const conversation =
        convList.find((c) => c.channel === "whatsapp" && c.last_inbound_message_at) ||
        convList.find((c) => c.channel === "whatsapp") ||
        convList[0] ||
        null;

      let messages: any[] = [];
      let smsMessages: any[] = [];
      let emailLogs: any[] = [];
      let wflows: any[] = [];
      if (includeHistory) {
        const convIds = convList.map((c) => c.id).filter(Boolean);
        if (convIds.length > 0) {
          const { data: msgs } = await supabase
            .from("messages")
            .select("id, direction, content, created_at, status")
            .in("conversation_id", convIds)
            .order("created_at", { ascending: false })
            .limit(200);
          messages = msgs ?? [];
        }
        const { data: wf } = await supabase
          .from("workflow_executions")
          .select("id, workflow_id, status, created_at, workflows (name)")
          .eq("client_id", clientId)
          .order("created_at", { ascending: false })
          .limit(100);
        wflows = wf ?? [];

        const { data: sms } = await (supabase as any)
          .from("sms_messages")
          .select("id, status, created_at, delivered_at, clicked_at, click_count, cost_cents, segments")
          .eq("client_id", clientId)
          .eq("seller_id", sellerId)
          .order("created_at", { ascending: false })
          .limit(500);
        smsMessages = sms ?? [];

        const clientEmail = (client as any)?.email;
        if (clientEmail) {
          const { data: emails } = await (supabase as any)
            .from("email_logs")
            .select("id, status, created_at, delivered_at, opened_at, clicked_at, bounced_at, subject")
            .eq("seller_id", sellerId)
            .ilike("to_email", clientEmail)
            .order("created_at", { ascending: false })
            .limit(500);
          emailLogs = emails ?? [];
        }
      }

      return {
        client,
        pipeline,
        orders: orders ?? [],
        interactions: interactions ?? [],
        conversation,
        messages,
        smsMessages,
        emailLogs,
        wflows,
        metrics: (metrics as any) ?? null,
      };
    },
    enabled,
  });
}
