import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { pedidosRpcArgs, type PedidosDataFilters } from "@/hooks/usePedidosKpis";
import { MAX_VALUE_CAP, type AdvancedFilters } from "@/components/pedidos/PedidosFiltersSheet";
import type { OrderRow } from "@/components/pedidos/OrdersTableV2";
import type { LojaOption } from "@/components/pedidos/LojaMultiSelect";

/**
 * As consultas da tela Pedidos, tiradas de dentro da página do site
 * (src/pages/Pedidos.tsx), onde moram em efeitos soltos. Consultas, filtros,
 * ordenação e paginação são as mesmas de lá, e os nomes das variáveis também:
 * quando a comparação semanal avisar que a página do site mudou, o diff dela
 * se porta para cá quase linha a linha.
 */

/**
 * PostgREST não tem `lower()` no filtro, então o "não cancelado" precisa listar
 * as variações de caixa que existem na base (`cancelado` e `CANCELADO` convivem).
 * `orders.order_status` é NOT NULL com default 'approved' — nenhuma linha some
 * por NULL neste `not.in`.
 */
const CANCELLED_STATUS_VALUES = ["cancelled", "cancelado", "canceled", "refunded", "reembolsado"].flatMap(
  (s) => [s, s.toUpperCase(), s.charAt(0).toUpperCase() + s.slice(1)],
);

/**
 * `stores(name)` fica de fora de propósito: `orders.store_id` é nulo em 100% das
 * linhas, então o embed só custaria join. A etiqueta de loja sai de
 * `orders.marketplace` via StoreBadge.
 */
const ORDERS_CLIENT_FIELDS = "full_name, document, document_type, whatsapp, email, state_code, city";
const ORDERS_SELECT = `*, clients(${ORDERS_CLIENT_FIELDS})`;
const ORDERS_SELECT_INNER = `*, clients!inner(${ORDERS_CLIENT_FIELDS})`;

/**
 * O construtor do PostgREST muda de tipo a cada filtro encadeado e as RPCs
 * desta tela não estão nos tipos gerados: como no site, essa parte vai sem tipo.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SemTipo = any;
const rpc = (fn: string, args: Record<string, unknown>) => (supabase.rpc as SemTipo)(fn, args);

export type Sugestao = { id: string; text: string; type: string; originalText?: string };

/** O recorte que a lista aplica — o mesmo estado da página do site. */
export interface RecortePedidos {
  sellerId: string | undefined;
  /** Janela ISO (`to` exclusivo no fim do dia do personalizado, como no site). */
  dateRange: { from: string; to: string };
  /** Em período personalizado, só depois do "Aplicar" a janela existe. */
  rangeReady: boolean;
  clienteId: string | null;
  filterLojas: string[];
  filterState: string;
  advanced: AdvancedFilters;
  searchTerm: string;
  sortField: string;
  sortDir: "asc" | "desc";
  currentPage: number;
  itemsPerPage: number;
  /** O mesmo recorte, no formato das RPCs (contagem, KPIs e gráfico). */
  dataFilters: PedidosDataFilters;
}

/**
 * A página de pedidos da lista e o total do recorte. Com busca, junta duas
 * consultas (campos do pedido e clientes que casam) e pagina no aparelho; sem
 * busca, conta pela RPC `get_pedidos_count` e pede só a página ao banco.
 */
export function useListaPedidos(r: RecortePedidos) {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [totalOrders, setTotalOrders] = useState(0);
  const [loading, setLoading] = useState(true);
  /** Só o primeiro carregamento mostra esqueleto; refetch mantém a lista na tela. */
  const [firstLoadDone, setFirstLoadDone] = useState(false);

  const {
    sellerId, dateRange, rangeReady, clienteId, filterLojas, filterState, advanced, searchTerm,
    sortField, sortDir, currentPage, itemsPerPage, dataFilters,
  } = r;

  useEffect(() => {
    let isMounted = true;

    const loadOrders = async () => {
      if (!sellerId) {
        setLoading(false);
        return;
      }
      // Período personalizado escolhido mas datas ainda não aplicadas: não busca.
      if (!rangeReady) return;

      try {
        setLoading(true);
        const daysAgo = dateRange.from;
        const endDate = dateRange.to;

        /**
         * Todo filtro da barra e do sheet passa por aqui — lista, contagem e
         * cabeçalho "(N)" precisam sair do mesmo recorte, senão o card do topo
         * diz um número e o rodapé outro.
         */
        const applyFilters = (q: SemTipo) => {
          if (clienteId) q = q.eq("client_id", clienteId);
          if (filterLojas.length > 0) q = q.in("marketplace", filterLojas);
          if (advanced.status !== "all") q = q.eq("order_status", advanced.status);
          // Status explícito manda (mesma regra das RPCs de KPI/gráfico): aplicar
          // os dois juntos zerava a lista com o card dizendo 10 pedidos.
          if (advanced.status === "all" && !advanced.includeCancelled) {
            q = q.not("order_status", "in", `(${CANCELLED_STATUS_VALUES.join(",")})`);
          }
          // `is_second_sale` é nullable com default false: "primeira compra" tem
          // de aceitar NULL, e `.eq(false)` deixaria essas linhas de fora.
          if (advanced.type === "second") q = q.is("is_second_sale", true);
          if (advanced.type === "first") q = q.not("is_second_sale", "is", true);
          if (advanced.minValue > 0) q = q.gte("total_amount", advanced.minValue);
          if (advanced.maxValue < MAX_VALUE_CAP) q = q.lte("total_amount", advanced.maxValue);
          if (advanced.whatsappContacted === "yes") q = q.not("whatsapp_contacted_at", "is", null);
          if (advanced.whatsappContacted === "no") q = q.is("whatsapp_contacted_at", null);

          // Filtros em `clients.*` só valem com o embed !inner, que quem monta o
          // select decide pela MESMA condição (temFiltroDeCliente). As colunas
          // computadas (uf, genero_norm, cep_limpo) são as mesmas funções das RPCs.
          if (advanced.states.length > 0) q = q.in("clients.uf", advanced.states);
          if (advanced.cities.length > 0) q = q.in("clients.city", advanced.cities);
          // ilike sem % = igualdade sem caso — casa o lower() da RPC.
          if (advanced.documentType !== "all") q = q.ilike("clients.document_type", advanced.documentType);
          if (advanced.genders.length > 0) q = q.in("clients.genero_norm", advanced.genders);
          const cepDigitos = advanced.cepPrefix.replace(/\D/g, "");
          if (cepDigitos) q = q.like("clients.cep_limpo", `${cepDigitos}%`);

          const prodTermo = advanced.productText.trim();
          if (prodTermo) {
            // O texto é DADO: escapa os curingas do LIKE, como a RPC. O `*` fica
            // de fora de propósito (o PostgREST o troca por `%` nos dois lados).
            const esc = prodTermo.replace(/[\\%_]/g, (m) => `\\${m}`);
            // Coluna computada lower(coalesce(product,'')), a mesma das RPCs.
            const col = "produto_texto";
            switch (advanced.productOperator) {
              case "not-contains": q = q.not(col, "ilike", `%${esc}%`); break;
              case "starts-with":  q = q.ilike(col, `${esc}%`); break;
              case "ends-with":    q = q.ilike(col, `%${esc}`); break;
              case "exact":        q = q.ilike(col, esc); break;
              default:             q = q.ilike(col, `%${esc}%`);
            }
          }
          return q;
        };

        /** Alguma dimensão de cliente ativa? Decide o embed !inner nos selects. */
        const temFiltroDeCliente =
          filterState !== "all" ||
          advanced.states.length > 0 ||
          advanced.cities.length > 0 ||
          advanced.documentType !== "all" ||
          advanced.genders.length > 0 ||
          !!advanced.cepPrefix.replace(/\D/g, "");

        /**
         * Ordenação SEMPRE com desempate por `id`, e o nome do cliente pelo nome
         * qualificado `clients(full_name)`: o `referencedTable` ordenaria só o
         * embed e o `.range()` fatiaria um resultado sem ordem.
         */
        const applySort = (q: SemTipo) => {
          const asc = sortDir === "asc";
          const sorted = sortField === "full_name"
            ? q.order("clients(full_name)", { ascending: asc, nullsFirst: false })
            : q.order(sortField, { ascending: asc });
          return sorted.order("id", { ascending: true });
        };

        const sortMerged = (list: OrderRow[]) => {
          const dir = sortDir === "asc" ? 1 : -1;
          return [...list].sort((a, b) => {
            if (sortField === "total_amount") {
              return ((Number(a.total_amount) || 0) - (Number(b.total_amount) || 0)) * dir;
            }
            if (sortField === "full_name") {
              return (a.clients?.full_name || "").localeCompare(b.clients?.full_name || "", "pt-BR") * dir;
            }
            const da = new Date(a.acquired_at || a.created_at || 0).getTime();
            const db = new Date(b.acquired_at || b.created_at || 0).getTime();
            return (da - db) * dir;
          });
        };

        // Busca no servidor (o teto de 1000 linhas do Supabase fazia a busca
        // perder resultados em períodos largos como 365 dias).
        if (searchTerm.trim()) {
          const raw = searchTerm.trim();
          const escaped = raw.replace(/[%,()]/g, "\\$&");
          const digits = raw.replace(/\D/g, "");
          const searchHasOnlyNumbers = digits.length >= 3 && /^\d+$/.test(raw.replace(/[.\-\s]/g, ""));

          // 1) client_ids que casam por nome/documento/e-mail/telefone, direto
          // nos clientes (o `.or()` no embed falhava em alguns sellers).
          let matchingClientIds: string[] = [];
          try {
            const { data: rpcClientRows, error: rpcClientError } = await rpc("search_kanban_clients", {
              _seller_id: sellerId,
              _search: raw,
              _limit: 5000,
            });

            if (!rpcClientError) {
              matchingClientIds = Array.from(new Set(
                ((rpcClientRows || []) as SemTipo[])
                  .map((row) => String(row.client_id || row))
                  .filter(Boolean),
              ));
            } else {
              console.warn("search_kanban_clients failed, falling back to direct client search", rpcClientError);
              const clientOr = searchHasOnlyNumbers
                ? `full_name.ilike.%${escaped}%,email.ilike.%${escaped}%,document.ilike.%${digits}%,whatsapp.ilike.%${digits}%`
                : `full_name.ilike.%${escaped}%,email.ilike.%${escaped}%`;
              const { data: clientRows, error: clientError } = await supabase
                .from("clients")
                .select("id")
                .or(clientOr)
                .limit(10000);
              if (clientError) throw clientError;
              matchingClientIds = Array.from(new Set(
                (clientRows || []).map((row) => row.id).filter(Boolean),
              ));
            }
          } catch (e) {
            console.warn("client resolve failed, falling back to order-only search", e);
          }

          // 2) Duas buscas independentes em paralelo, juntadas aqui: centenas de
          // UUIDs num `.or()` só estouram o limite de URL do PostgREST.
          const applyCommon = (q: SemTipo) => {
            q = q
              .gte("acquired_at", daysAgo)
              .lte("acquired_at", endDate)
              .eq("seller_id", sellerId);
            return applyFilters(q);
          };

          const sel = ORDERS_SELECT_INNER;

          // A: pedidos cujos campos casam (external_order_id / product)
          let qA: SemTipo = supabase.from("orders").select(sel);
          qA = applyCommon(qA)
            .or(`external_order_id.ilike.%${escaped}%,product.ilike.%${escaped}%`);
          if (filterState !== "all") qA = qA.eq("clients.state_code", filterState);
          qA = qA.limit(5000);

          // B: pedidos dos clientes que casaram, em lotes por causa da URL
          const chunkSize = 150;
          const chunks: string[][] = [];
          for (let i = 0; i < matchingClientIds.length; i += chunkSize) {
            chunks.push(matchingClientIds.slice(i, i + chunkSize));
          }
          const chunkQueries = chunks.map((ids) => {
            let q: SemTipo = supabase.from("orders").select(sel);
            q = applyCommon(q).in("client_id", ids);
            if (filterState !== "all") q = q.eq("clients.state_code", filterState);
            return q.limit(5000);
          });

          const results = await Promise.all([qA, ...chunkQueries]);
          const merged: OrderRow[] = [];
          const seen = new Set<string>();
          for (const res of results) {
            for (const o of ((res?.data || []) as OrderRow[])) {
              if (o && !seen.has(o.id)) {
                seen.add(o.id);
                merged.push(o);
              }
            }
          }
          const sorted = sortMerged(merged);
          const from = (currentPage - 1) * itemsPerPage;
          const pageData = sorted.slice(from, from + itemsPerPage);

          if (!isMounted) return;
          setTotalOrders(sorted.length);
          setOrders(pageData);
          return;
        }

        // Contagem exata com o mesmo recorte da lista, pela RPC que divide o
        // predicado com as de KPI/gráfico (o count=exact com clients!inner
        // estourava os 8s nos sellers grandes).
        let exactCount: number | null = null;
        {
          const { data: rpcCount, error: rpcCountErr } = await rpc(
            "get_pedidos_count",
            pedidosRpcArgs(sellerId, daysAgo, endDate, dataFilters),
          );
          if (!rpcCountErr && rpcCount !== null && rpcCount !== undefined) {
            exactCount = Number(rpcCount);
          } else if (rpcCountErr) {
            console.warn("get_pedidos_count falhou; caindo para o count do PostgREST", rpcCountErr);
          }
        }
        if (exactCount === null) {
          // Reserva: o caminho antigo, para a tela não morrer se a RPC falhar.
          const countSelect = temFiltroDeCliente ? "id, clients!inner(state_code)" : "id";
          let countQuery: SemTipo = supabase
            .from("orders")
            .select(countSelect, { count: "exact", head: true })
            .gte("acquired_at", daysAgo)
            .lte("acquired_at", endDate)
            .eq("seller_id", sellerId);
          countQuery = applyFilters(countQuery);
          if (filterState !== "all") countQuery = countQuery.eq("clients.state_code", filterState);
          const { count, error: countError } = await countQuery;
          if (countError) throw countError;
          exactCount = count || 0;
        }

        if (!isMounted) return;
        setTotalOrders(exactCount || 0);

        const from = (currentPage - 1) * itemsPerPage;
        const to = from + itemsPerPage - 1;

        // Embed !inner quando há filtro de cliente, para o filtro valer de fato.
        const selectClause = temFiltroDeCliente ? ORDERS_SELECT_INNER : ORDERS_SELECT;

        let dataQuery: SemTipo = supabase
          .from("orders")
          .select(selectClause)
          .gte("acquired_at", daysAgo)
          .lte("acquired_at", endDate)
          .eq("seller_id", sellerId);

        dataQuery = applyFilters(dataQuery);
        if (filterState !== "all") {
          dataQuery = dataQuery.eq("clients.state_code", filterState);
        }
        // Ordenar por acquired_at usa o índice composto (idx_orders_seller_acquired).
        dataQuery = applySort(dataQuery).range(from, to);

        const { data: ordersData, error } = await dataQuery;
        if (error) throw error;
        if (!isMounted) return;

        // A fatia já vem ordenada do banco (ver `applySort`).
        setOrders((ordersData || []) as OrderRow[]);
      } catch (error) {
        console.error("Error loading orders:", error);
      } finally {
        if (isMounted) {
          setLoading(false);
          setFirstLoadDone(true);
        }
      }
    };

    loadOrders();

    return () => {
      isMounted = false;
    };
  }, [
    sellerId, clienteId, currentPage, itemsPerPage, searchTerm, filterState, filterLojas,
    advanced, sortField, sortDir, rangeReady, dateRange.from, dateRange.to, dataFilters,
  ]);

  return { orders, setOrders, totalOrders, loading, firstLoadDone };
}

/** O seller tem pedido com status fora de "approved"? Decide o selo de status nos cards. */
export function useTemStatusAtualizado(sellerId: string | undefined) {
  const [hasStatusUpdates, setHasStatusUpdates] = useState(false);
  useEffect(() => {
    if (!sellerId) return;
    supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("seller_id", sellerId)
      .neq("order_status", "approved")
      .then(({ count }) => {
        setHasStatusUpdates((count || 0) > 0);
      });
  }, [sellerId]);
  return hasStatusUpdates;
}

/**
 * Sugestões da busca enquanto digita (300 ms depois da última tecla): pedido,
 * produto, cliente e CPF/CNPJ que aparecem nos pedidos do período.
 */
export function useSugestoesBusca(
  sellerId: string | undefined,
  searchInput: string,
  dateRange: { from: string; to: string },
) {
  const [suggestions, setSuggestions] = useState<Sugestao[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  /**
   * Texto que veio de uma sugestão tocada. No site, escolher a sugestão troca o
   * texto da busca e a lista reabria sozinha 300 ms depois, só com a escolhida,
   * por cima do resultado; aqui ela fica fechada até o texto mudar de novo.
   */
  const escolhidaRef = useRef<string | null>(null);
  const escolherSugestao = (texto: string) => {
    escolhidaRef.current = texto;
    setShowSuggestions(false);
  };

  useEffect(() => {
    if (!searchInput.trim() || searchInput.length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    if (searchInput === escolhidaRef.current) return;
    escolhidaRef.current = null;

    const delayTimer = setTimeout(async () => {
      try {
        if (!sellerId) return;

        const { data } = await supabase
          .from("orders")
          .select(`
            id,
            external_order_id,
            product,
            clients(full_name, document, document_type)
          `)
          .eq("seller_id", sellerId)
          .gte("acquired_at", dateRange.from)
          .lte("acquired_at", dateRange.to)
          .not("clients", "is", null)
          .limit(500);

        if (!data) return;

        const newSuggestions: Sugestao[] = [];
        const searchLower = searchInput.toLowerCase();

        data.forEach((order) => {
          if (order.external_order_id?.toLowerCase().includes(searchLower)) {
            newSuggestions.push({
              id: order.id,
              text: order.external_order_id,
              originalText: order.external_order_id,
              type: "Pedido",
            });
          }

          if (order.product?.toLowerCase().includes(searchLower)) {
            const productText = order.product.length > 50 ? order.product.substring(0, 50) + "..." : order.product;
            newSuggestions.push({
              id: order.id,
              text: productText,
              originalText: order.product,
              type: "Produto",
            });
          }

          if (order.clients?.full_name?.toLowerCase().includes(searchLower)) {
            newSuggestions.push({
              id: order.id,
              text: order.clients.full_name,
              originalText: order.clients.full_name,
              type: "Cliente",
            });
          }

          // CPF/CNPJ com ou sem pontuação.
          if (order.clients?.document) {
            const cleanDocument = order.clients.document.replace(/\D/g, "");
            const searchClean = searchInput.replace(/\D/g, "");

            if (cleanDocument.includes(searchClean) && searchClean.length >= 3) {
              newSuggestions.push({
                id: order.id,
                text: `${order.clients.document} - ${order.clients.full_name || "Cliente"}`,
                originalText: order.clients.document,
                type: order.clients.document_type?.toUpperCase() || "DOC",
              });
            }
          }
        });

        const uniqueSuggestions = newSuggestions.filter((item, index, self) =>
          index === self.findIndex((t) => (t.originalText || t.text) === (item.originalText || item.text)),
        );

        setSuggestions(uniqueSuggestions.slice(0, 6));
        setShowSuggestions(true);
      } catch (error) {
        console.error("Error loading suggestions:", error);
      }
    }, 300);

    return () => clearTimeout(delayTimer);
  }, [searchInput, sellerId, dateRange.from, dateRange.to]);

  return { suggestions, showSuggestions, setShowSuggestions, escolherSugestao };
}

/**
 * Marketplaces com pedido na JANELA INTEIRA, com a contagem, para o filtro de
 * marketplace. É a mesma `get_pedidos_chart_series` da aba "Por loja" do
 * gráfico, então os dois números não divergem. De propósito só a janela e o
 * "incluir cancelados" entram: marcar uma loja não muda a lista de lojas.
 */
export function useLojasDoPeriodo(
  sellerId: string | undefined,
  dateRange: { from: string; to: string },
  rangeReady: boolean,
  includeCancelled: boolean,
) {
  const [lojaOptions, setLojaOptions] = useState<LojaOption[]>([]);

  useEffect(() => {
    const fetchLojas = async () => {
      if (!sellerId || !rangeReady) return;

      const { data, error } = await rpc("get_pedidos_chart_series", {
        _seller_id: sellerId,
        _start: dateRange.from,
        _end: dateRange.to,
        _group_by: "store",
        _include_cancelled: includeCancelled,
      });

      if (error) {
        console.error("Error loading loja options:", error);
        return;
      }

      const options: LojaOption[] = ((data || []) as SemTipo[])
        .map((row) => ({ value: String(row.bucket), count: Number(row.pedidos) || 0 }))
        .filter((o) => o.value)
        .sort((a, b) => b.count - a.count);

      setLojaOptions(options);
    };

    fetchLojas();
  }, [sellerId, dateRange.from, dateRange.to, rangeReady, includeCancelled]);

  return lojaOptions;
}

/**
 * Status presentes no período, para o filtro de status do "Filtros". A RPC
 * agrega no banco: o `select order_status` cru parava no teto de 1000 linhas e
 * um status raro nunca entrava na lista.
 */
export function useStatusDoPeriodo(
  sellerId: string | undefined,
  hasStatusUpdates: boolean,
  dateRange: { from: string; to: string },
  rangeReady: boolean,
) {
  const [availableStatuses, setAvailableStatuses] = useState<string[] | null>(null);

  useEffect(() => {
    const fetchAvailableStatuses = async () => {
      if (!hasStatusUpdates || !sellerId || !rangeReady) return;

      const { data, error } = await rpc("get_pedidos_order_statuses", {
        _seller_id: sellerId,
        _start: dateRange.from,
        _end: dateRange.to,
      });

      if (error) {
        console.error("Error loading status options:", error);
        return;
      }

      setAvailableStatuses(((data || []) as SemTipo[]).map((row) => String(row.order_status)).filter(Boolean));
    };

    fetchAvailableStatuses();
  }, [sellerId, hasStatusUpdates, dateRange.from, dateRange.to, rangeReady]);

  return availableStatuses;
}

/** Toque no WhatsApp do card: marca o pedido como contatado (mesma gravação do site). */
export async function marcarWhatsAppContatado(orderId: string, quando: string) {
  const { error } = await supabase
    .from("orders")
    .update({ whatsapp_contacted_at: quando })
    .eq("id", orderId);
  return error;
}
