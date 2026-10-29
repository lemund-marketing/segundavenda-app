import { supabase } from "@/integrations/supabase/client";

export type RespondedFilter = "all" | "yes" | "no";
export type SentimentKey = "positive" | "neutral" | "negative" | "unclassified";

export interface ExportOrdersFilters {
  startDate: string; // ISO date YYYY-MM-DD
  endDate: string;   // ISO date YYYY-MM-DD
  marketplaces: string[];
  states: string[];
  /** Valores CRUS de orders.order_status. O campo é texto livre e convive
   *  "enviado"/"ENVIADO"/"shipped"; o diálogo agrupa por lower() para exibir e
   *  manda aqui TODAS as variantes do grupo escolhido — o filtro fica burro
   *  (um .in) e a normalização mora num lugar só. */
  statuses: string[];
  minAmount: number | null;
  maxAmount: number | null;
  whatsappContacted: RespondedFilter;
  clientResponded: RespondedFilter;
  sentiments: SentimentKey[]; // applies only if clientResponded !== 'no'
  workflowIds: string[];
  hasClient: RespondedFilter;
}

export const defaultFilters = (): ExportOrdersFilters => ({
  startDate: "",
  endDate: "",
  marketplaces: [],
  states: [],
  statuses: [],
  minAmount: null,
  maxAmount: null,
  whatsappContacted: "all",
  clientResponded: "all",
  sentiments: ["positive", "neutral", "negative", "unclassified"],
  workflowIds: [],
  hasClient: "all",
});

/**
 * Resolve subsets of order_ids/client_ids based on filters that require joins.
 * Returns null arrays when filter is not active. Returns [] when active but
 * yielded zero matches (caller should treat as "no rows").
 */
export async function resolvePrefilters(
  sellerId: string,
  filters: ExportOrdersFilters
): Promise<{
  clientIds: string[] | null;
  workflowOrderIds: string[] | null;
  respondedOrderIds: Set<string> | null;
  sentimentOrderIds: Set<string> | null;
}> {
  let clientIds: string[] | null = null;
  let workflowOrderIds: string[] | null = null;
  let respondedOrderIds: Set<string> | null = null;
  let sentimentOrderIds: Set<string> | null = null;

  // UF filter → resolve client_ids of this seller in those states
  if (filters.states.length > 0) {
    const { data, error } = await supabase
      .from("clients_sellers")
      .select("client_id, clients!inner(state_code)")
      .eq("seller_id", sellerId)
      .in("clients.state_code", filters.states)
      .limit(50000);
    if (error) throw error;
    clientIds = Array.from(new Set((data || []).map((r: any) => r.client_id).filter(Boolean)));
  }

  // Workflow filter → orders that have at least one execution for the chosen workflows
  if (filters.workflowIds.length > 0) {
    const { data, error } = await supabase
      .from("workflow_executions")
      .select("order_id")
      .in("workflow_id", filters.workflowIds)
      .not("order_id", "is", null)
      .limit(50000);
    if (error) throw error;
    workflowOrderIds = Array.from(new Set((data || []).map((r: any) => r.order_id).filter(Boolean)));
  }

  const needResponded = filters.clientResponded !== "all";
  const sentimentActive =
    filters.clientResponded !== "no" &&
    filters.sentiments.length > 0 &&
    filters.sentiments.length < 4;

  if (needResponded || sentimentActive) {
    // Fetch inbound messages scoped to seller via conversations join.
    const { data: msgs, error: msgErr } = await supabase
      .from("messages")
      .select("workflow_execution_id, ai_analyzed, ai_sentiment, conversations!inner(seller_id)")
      .eq("direction", "inbound")
      .eq("conversations.seller_id", sellerId)
      .not("workflow_execution_id", "is", null)
      .limit(50000);
    if (msgErr) throw msgErr;

    const execIds = Array.from(
      new Set((msgs || []).map((m: any) => m.workflow_execution_id).filter(Boolean))
    );

    // Map exec_id → order_id
    let execToOrder = new Map<string, string>();
    if (execIds.length > 0) {
      // Chunk if > 1000
      const chunks: string[][] = [];
      for (let i = 0; i < execIds.length; i += 500) chunks.push(execIds.slice(i, i + 500));
      for (const chunk of chunks) {
        const { data: execs, error: execErr } = await supabase
          .from("workflow_executions")
          .select("id, order_id")
          .in("id", chunk)
          .not("order_id", "is", null);
        if (execErr) throw execErr;
        for (const e of execs || []) {
          if (e.order_id) execToOrder.set(e.id, e.order_id);
        }
      }
    }

    if (needResponded) {
      respondedOrderIds = new Set();
      for (const m of msgs || []) {
        const oid = execToOrder.get(m.workflow_execution_id);
        if (oid) respondedOrderIds.add(oid);
      }
    }

    if (sentimentActive) {
      sentimentOrderIds = new Set();
      const wantPos = filters.sentiments.includes("positive");
      const wantNeu = filters.sentiments.includes("neutral");
      const wantNeg = filters.sentiments.includes("negative");
      const wantUnc = filters.sentiments.includes("unclassified");
      for (const m of msgs || []) {
        const oid = execToOrder.get(m.workflow_execution_id);
        if (!oid) continue;
        const classified = m.ai_analyzed === true && !!m.ai_sentiment;
        if (classified) {
          if (m.ai_sentiment === "positive" && wantPos) sentimentOrderIds.add(oid);
          else if (m.ai_sentiment === "neutral" && wantNeu) sentimentOrderIds.add(oid);
          else if (m.ai_sentiment === "negative" && wantNeg) sentimentOrderIds.add(oid);
        } else if (wantUnc) {
          sentimentOrderIds.add(oid);
        }
      }
    }
  }

  return { clientIds, workflowOrderIds, respondedOrderIds, sentimentOrderIds };
}

/**
 * Build the base orders query with all direct filters applied + prefiltered id intersections.
 * Caller adds .select() and .range()/.order().
 */
export function buildOrdersExportQuery(
  sellerId: string,
  filters: ExportOrdersFilters,
  prefilters: Awaited<ReturnType<typeof resolvePrefilters>>,
  selectExpr: string,
  countOption?: "exact"
) {
  let q: any =
    countOption
      ? supabase.from("orders").select(selectExpr, { count: countOption, head: true })
      : supabase.from("orders").select(selectExpr);
  q = q.eq("seller_id", sellerId);

  if (filters.startDate) q = q.gte("acquired_at", filters.startDate);
  if (filters.endDate) q = q.lte("acquired_at", filters.endDate + "T23:59:59");

  if (filters.marketplaces.length > 0) q = q.in("marketplace", filters.marketplaces as any);

  if (filters.statuses.length > 0) q = q.in("order_status", filters.statuses);

  if (filters.minAmount != null) q = q.gte("total_amount", filters.minAmount);
  if (filters.maxAmount != null) q = q.lte("total_amount", filters.maxAmount);

  if (filters.whatsappContacted === "yes") q = q.not("whatsapp_contacted_at", "is", null);
  if (filters.whatsappContacted === "no") q = q.is("whatsapp_contacted_at", null);

  if (filters.hasClient === "yes") q = q.not("client_id", "is", null);
  if (filters.hasClient === "no") q = q.is("client_id", null);

  // Intersect order_ids from prefilters
  const orderIdSets: string[][] = [];
  if (prefilters.workflowOrderIds) orderIdSets.push(prefilters.workflowOrderIds);

  if (filters.clientResponded === "yes" && prefilters.respondedOrderIds) {
    orderIdSets.push(Array.from(prefilters.respondedOrderIds));
  }
  if (prefilters.sentimentOrderIds) {
    orderIdSets.push(Array.from(prefilters.sentimentOrderIds));
  }

  if (orderIdSets.length > 0) {
    // Intersection
    let inter = new Set(orderIdSets[0]);
    for (let i = 1; i < orderIdSets.length; i++) {
      const s = new Set(orderIdSets[i]);
      inter = new Set([...inter].filter((x) => s.has(x)));
    }
    const arr = Array.from(inter);
    if (arr.length === 0) {
      // Force empty result
      q = q.eq("id", "00000000-0000-0000-0000-000000000000");
    } else {
      q = q.in("id", arr);
    }
  }

  if (filters.clientResponded === "no" && prefilters.respondedOrderIds) {
    const arr = Array.from(prefilters.respondedOrderIds);
    if (arr.length > 0) q = q.not("id", "in", `(${arr.join(",")})`);
  }

  if (prefilters.clientIds) {
    if (prefilters.clientIds.length === 0) {
      q = q.eq("id", "00000000-0000-0000-0000-000000000000");
    } else {
      q = q.in("client_id", prefilters.clientIds);
    }
  }

  return q;
}
