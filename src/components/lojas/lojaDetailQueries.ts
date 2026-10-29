import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { OrderRow } from "@/components/pedidos/OrdersTableV2";

import { NAO_PLATAFORMA, trimZeroEdges } from "./lojaDetailShared";
import { groupOrdersByWindow } from "@/utils/groupOrdersByWindow";

/**
 * Camada de dados da página de detalhe da loja.
 *
 * `types.ts` não conhece nenhuma destas RPCs (não regeneramos o arquivo), por
 * isso todo `rpc` passa por `(supabase as any)` — mesmo padrão de useClientesKpis.
 *
 * PostgREST serializa `numeric`/`bigint` como número JSON, mas a coerção
 * explícita evita `NaN` silencioso se alguma RPC passar a devolver texto.
 */

const n = (v: unknown) => Number(v ?? 0) || 0;

/**
 * Os mesmos rótulos que as RPCs excluem em `lower(order_status) not in (...)`.
 * Consulta feita por PostgREST tem que aplicar o mesmo corte, senão a lista de
 * pedidos passa a incluir cancelado e deixa de bater com o KPI logo acima.
 *
 * As três caixas saem de um `flatMap` (mesma receita de `CANCELLED_STATUS_VALUES`
 * em Pedidos.tsx): PostgREST não tem `lower()` no filtro, e a lista escrita à mão
 * esquecia a forma capitalizada de metade das palavras — no dia em que uma
 * integração gravasse "Cancelled", o KPI (RPC, com `lower()`) excluiria a linha e
 * a lista logo abaixo a incluiria.
 */
const STATUS_CANCELADOS = ["cancelado", "cancelled", "canceled", "refunded", "reembolsado"].flatMap(
  (s) => [s, s.toUpperCase(), s.charAt(0).toUpperCase() + s.slice(1)],
);

export const NOT_IN_CANCELADOS = `(${STATUS_CANCELADOS.map((s) => `"${s}"`).join(",")})`;

/** Slug fora do enum vira 22P02 no PostgREST — é URL digitada errado, não falha. */
export const isEnumSlugError = (e: unknown) => (e as { code?: string })?.code === "22P02";

/** "AAAA-MM-DD" do instante em São Paulo — mesma chave de dia da OrdersTableV2. */
const DAY_KEY_SP = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * Meia-noite de HOJE em America/Sao_Paulo.
 *
 * `new Date().setHours(0,0,0,0)` corta o dia no fuso do NAVEGADOR, e todo o resto
 * desta tela conta o dia em SP (a coluna Data da OrdersTableV2, o pontinho "Hoje"
 * e o `get_pedidos_kpis` da /pedidos, que ancora em `date_trunc('day', now() at
 * time zone 'America/Sao_Paulo')`). Num navegador em UTC a faixa 00:00–03:00
 * pertence ao dia SP anterior, e o KPI contava pedidos que a lista logo abaixo
 * mostrava com a data de ontem.
 *
 * O offset é fixo em -03:00 porque o Brasil não tem horário de verão desde 2019;
 * se voltar, é esta linha que muda.
 */
function startOfTodaySP(now = new Date()): Date {
  return new Date(`${DAY_KEY_SP.format(now)}T00:00:00-03:00`);
}

// ---------------------------------------------------------------------------
// 1) Métricas de TODAS as lojas do seller — a consulta-mãe da página
// ---------------------------------------------------------------------------

export interface LojaMetricsRow {
  marketplace: string;
  total_orders: number;
  prev_orders: number;
  total_revenue: number;
  prev_revenue: number;
  unique_clients: number;
  prev_unique_clients: number;
  repeat_clients: number;
  prev_repeat_clients: number;
  exclusive_clients: number;
  new_clients: number;
  prev_new_clients: number;
  second_sale_orders: number;
  last_order_at: string | null;
}

/**
 * Uma única chamada alimenta cabeçalho, KPIs, comparativo temporal, média das
 * outras lojas, rank e share. O Segundo Pedido chama a RPC equivalente duas
 * vezes (atual e anterior); aqui o período anterior já vem embutido, e usar uma
 * fonte só garante que /lojas e /lojas/:mp nunca discordem.
 */
export function useLojaMetrics(sellerId: string | undefined, start: string, end: string, storeId: string | null = null) {
  return useQuery<LojaMetricsRow[]>({
    queryKey: ["loja-metrics", sellerId, start, end, storeId],
    enabled: !!sellerId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_marketplace_metrics", {
        ...(storeId ? { _store_id: storeId } : {}),
        _seller_id: sellerId,
        _start: start,
        _end: end,
      });
      if (error) throw error;

      return ((data ?? []) as any[]).map((r) => ({
        marketplace: String(r.marketplace ?? ""),
        total_orders: n(r.total_orders),
        prev_orders: n(r.prev_orders),
        total_revenue: n(r.total_revenue),
        prev_revenue: n(r.prev_revenue),
        unique_clients: n(r.unique_clients),
        prev_unique_clients: n(r.prev_unique_clients),
        repeat_clients: n(r.repeat_clients),
        prev_repeat_clients: n(r.prev_repeat_clients),
        exclusive_clients: n(r.exclusive_clients),
        new_clients: n(r.new_clients),
        prev_new_clients: n(r.prev_new_clients),
        second_sale_orders: n(r.second_sale_orders),
        last_order_at: r.last_order_at ?? null,
      }));
    },
  });
}

// ---------------------------------------------------------------------------
// 2) Série de faturamento (já vem zero-fillada do servidor)
// ---------------------------------------------------------------------------

export interface LojaSparkPoint {
  marketplace: string;
  dia: string;
  pedidos: number;
  receita: number;
}

/**
 * A RPC devolve as ≤7 séries de uma vez. O recorte por loja fica no `select`,
 * e não na `queryFn`, para o slug ficar FORA da queryKey: assim a grade de
 * /lojas e as abas do detalhe compartilham uma única entrada de cache em vez
 * de refazer a mesma consulta uma vez por loja.
 */
export function useLojaSparkline(
  sellerId: string | undefined,
  slug: string,
  start: string,
  end: string,
  bucket: "day" | "month",
  enabled: boolean,
  storeId: string | null = null,
) {
  return useQuery<LojaSparkPoint[], Error, LojaSparkPoint[]>({
    queryKey: ["loja-sparkline", sellerId, start, end, bucket, storeId],
    enabled: !!sellerId && !!slug && enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_marketplace_revenue_sparkline", {
        ...(storeId ? { _store_id: storeId } : {}),
        _seller_id: sellerId,
        _start: start,
        _end: end,
        _bucket: bucket,
      });
      if (error) throw error;

      return ((data ?? []) as any[]).map((r) => ({
        marketplace: String(r.marketplace ?? ""),
        dia: String(r.dia),
        pedidos: n(r.pedidos),
        receita: n(r.receita),
      }));
    },
    select: (all) =>
      trimZeroEdges(
        all.filter((p) => p.marketplace === slug).sort((a, b) => a.dia.localeCompare(b.dia)),
        (p) => p.pedidos === 0 && p.receita === 0,
      ),
  });
}

// ---------------------------------------------------------------------------
// 3) Dia da semana
// ---------------------------------------------------------------------------

export interface LojaWeekdayRow {
  dow: number;
  pedidos: number;
  receita: number;
}

export function useLojaWeekday(
  sellerId: string | undefined,
  slug: string,
  start: string,
  end: string,
  enabled: boolean,
  storeId: string | null = null,
) {
  return useQuery<LojaWeekdayRow[]>({
    queryKey: ["loja-weekday", sellerId, slug, start, end, storeId],
    enabled: !!sellerId && !!slug && enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_marketplace_weekday_distribution", {
        ...(storeId ? { _store_id: storeId } : {}),
        _seller_id: sellerId,
        _marketplace: slug,
        _start: start,
        _end: end,
      });
      if (error) throw error;

      const byDow = new Map<number, LojaWeekdayRow>();
      for (const r of (data ?? []) as any[]) {
        byDow.set(n(r.dow), { dow: n(r.dow), pedidos: n(r.pedidos), receita: n(r.receita) });
      }
      // Zero-fill: um domingo sem venda tem que aparecer como barra vazia, não sumir.
      return Array.from({ length: 7 }, (_, d) => byDow.get(d) ?? { dow: d, pedidos: 0, receita: 0 });
    },
  });
}

// ---------------------------------------------------------------------------
// 4) Lista de pedidos — PostgREST direto, sem RPC
// ---------------------------------------------------------------------------

/**
 * A lista da loja renderiza com a MESMA tabela de /pedidos (`OrdersTableV2`),
 * então a linha é o contrato dela: `clients` fica ANINHADO. A versão antiga
 * achatava em `client_name`/`client_document` — passar aquilo para a tabela
 * imprimia "Cliente não identificado" em todas as linhas, sem erro nenhum.
 */
export type LojaOrderRow = OrderRow;

// Igual à lista principal (/pedidos). Com o agrupamento por janela de 3 min, 25
// pedidos viravam ~20 linhas numa tabela de largura inteira.
export const LOJA_ORDERS_PAGE_SIZE = 50;

export function useLojaOrders(
  sellerId: string | undefined,
  slug: string,
  start: string,
  end: string,
  page: number,
  enabled: boolean,
  sortField: string = "acquired_at",
  sortDir: "asc" | "desc" = "desc",
  /** Filtro opcional por loja (orders.store_id) dentro do marketplace. */
  storeId: string | null = null,
) {
  return useQuery<{ rows: LojaOrderRow[]; total: number }>({
    // sortField/sortDir NA CHAVE: fora dela o react-query serviria a página já
    // cacheada na ordem anterior e o clique no cabeçalho não faria nada.
    queryKey: ["loja-orders", sellerId, slug, start, end, page, sortField, sortDir, storeId],
    enabled: !!sellerId && !!slug && enabled,
    staleTime: 60_000,
    // Sem isto a tabela E o paginador somem a cada avanço de página: `data` volta
    // a undefined, `total` vira 0 e a renderização cai no estado vazio.
    placeholderData: (prev) => prev,
    queryFn: async () => {
      const from = (page - 1) * LOJA_ORDERS_PAGE_SIZE;

      /**
       * Ordenação SEMPRE com desempate por `id` — as duas armadilhas são as
       * mesmas já documentadas em Pedidos.tsx:
       * 1. `order('full_name', { referencedTable: 'clients' })` ordena o recurso
       *    EMBUTIDO (no-op num to-one) e a query de cima fica sem `order by`,
       *    com o `.range()` fatiando um resultado sem ordem. O que ordena o
       *    nível de cima é o nome qualificado `clients(full_name)`.
       * 2. Sem chave secundária, `limit/offset` não é determinístico: linhas de
       *    mesmo valor repetem ou somem entre páginas.
       */
      const applySort = (q: any) => {
        const asc = sortDir === "asc";
        const sorted =
          sortField === "full_name"
            ? q.order("clients(full_name)", { ascending: asc, nullsFirst: false })
            : q.order(sortField, { ascending: asc });
        return sorted.order("id", { ascending: true });
      };

      // Todas as colunas de `orders` aqui são cobertas por
      // idx_orders_export_covering (inclusive `marketplace` e
      // `whatsapp_contacted_at`). `created_at` ficou DE FORA de propósito: é
      // só fallback de `acquired_at`, que o filtro acima já garante não-nulo,
      // e é a única que quebraria o index-only scan.
      let listBase = supabase
        .from("orders")
        .select(
          "id, external_order_id, acquired_at, product, total_amount, order_status, marketplace, whatsapp_contacted_at, client_id, clients(full_name, document, document_type, whatsapp, email, state_code, city)",
        )
        .eq("seller_id", sellerId!)
        .eq("marketplace", slug as any)
        .not("order_status", "in", NOT_IN_CANCELADOS)
        .gte("acquired_at", start)
        .lte("acquired_at", end);
      if (storeId) listBase = listBase.eq("store_id", storeId);
      const listQuery = applySort(listBase).range(from, from + LOJA_ORDERS_PAGE_SIZE - 1);

      let countBase = supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("seller_id", sellerId!)
        .eq("marketplace", slug as any)
        .not("order_status", "in", NOT_IN_CANCELADOS)
        .gte("acquired_at", start)
        .lte("acquired_at", end);
      if (storeId) countBase = countBase.eq("store_id", storeId);
      const countQuery = countBase;

      const [listRes, countRes] = await Promise.all([listQuery, countQuery]);

      // Slug fora do enum vira 22P02 no PostgREST. É uma URL digitada errado,
      // não uma falha: a tela mostra o estado vazio e o seletor de período segue vivo.
      if (listRes.error) {
        if (isEnumSlugError(listRes.error)) return { rows: [], total: 0 };
        throw listRes.error;
      }

      const rows: LojaOrderRow[] = ((listRes.data ?? []) as any[]).map((o) => ({
        id: String(o.id),
        external_order_id: o.external_order_id ?? "",
        acquired_at: o.acquired_at ?? undefined,
        product: o.product ?? "",
        total_amount: n(o.total_amount),
        order_status: o.order_status ?? undefined,
        // `marketplace` sempre existe (é o predicado da query); o fallback só
        // protege o StoreBadge do card de celular contra um NULL inesperado.
        marketplace: String(o.marketplace ?? slug),
        whatsapp_contacted_at: o.whatsapp_contacted_at ?? null,
        client_id: o.client_id ?? "",
        clients: (o.clients ?? undefined) as LojaOrderRow["clients"],
      }));

      return { rows, total: countRes.error ? rows.length : (countRes.count ?? 0) };
    },
  });
}

/**
 * A coluna Status da `OrdersTableV2` só aparece quando há algo fora de
 * "approved" — aqui o recorte é por seller **e** loja, e ignora os cancelados
 * porque a própria lista os esconde: senão a coluna nasceria só para repetir
 * "Aprovado" em todas as linhas.
 *
 * O recorte de DATA é o mesmo da lista: sem ele um único pedido "enviado" de
 * fora da janela abria a coluna (130px numa `table-fixed`, tirados de Cliente e
 * Produto) para desenhar "Aprovado" em todas as linhas visíveis.
 */
export function useLojaHasStatusUpdates(
  sellerId: string | undefined,
  slug: string,
  start: string,
  end: string,
  enabled: boolean,
) {
  return useQuery<boolean>({
    queryKey: ["loja-has-status-updates", sellerId, slug, start, end],
    enabled: !!sellerId && !!slug && enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("seller_id", sellerId!)
        .eq("marketplace", slug as any)
        .not("order_status", "in", NOT_IN_CANCELADOS)
        .neq("order_status", "approved")
        .gte("acquired_at", start)
        .lte("acquired_at", end);
      if (error) {
        if (isEnumSlugError(error)) return false;
        throw error;
      }
      return (count ?? 0) > 0;
    },
  });
}

/** Pedidos de HOJE (fora da janela do período, por definição). */
export function useLojaPedidosHoje(
  sellerId: string | undefined,
  slug: string,
  enabled: boolean,
  storeId: string | null = null,
) {
  return useQuery<number>({
    queryKey: ["loja-pedidos-hoje", sellerId, slug, storeId],
    enabled: !!sellerId && !!slug && enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const inicio = startOfTodaySP();
      // Teto explícito: sem ele um `acquired_at` no futuro (fuso do integrador
      // adiantado, importação com data errada) entrava na conta de "hoje".
      const fim = new Date(inicio.getTime() + 86_400_000);
      // Linhas do dia (poucas) para agrupar em COMPRAS: o desdobro do Bling
      // fazia o KPI dizer 2 enquanto a lista logo abaixo, agrupada, mostrava 1.
      let q = supabase
        .from("orders")
        .select("id, client_id, acquired_at, product, total_amount")
        .eq("seller_id", sellerId!)
        .eq("marketplace", slug as any)
        .not("order_status", "in", NOT_IN_CANCELADOS)
        .gte("acquired_at", inicio.toISOString())
        .lt("acquired_at", fim.toISOString());
      if (storeId) q = q.eq("store_id", storeId);
      const { data, error } = await q;
      if (error) {
        if (isEnumSlugError(error)) return 0;
        throw error;
      }
      return groupOrdersByWindow(data ?? []).length;
    },
  });
}

// ---------------------------------------------------------------------------
// 5) Clientes da loja
// ---------------------------------------------------------------------------

export interface LojaExclusividade {
  exclusive_clients: number;
  shared_clients: number;
}

/**
 * "Estes clientes compram só aqui?" — a única pergunta da aba Clientes da loja
 * que não existe fora dela.
 *
 * Recebe o MESMO `_filters` da lista e dos KPIs (já com a loja travada), e não
 * o escopo próprio de `get_marketplace_client_kpis`: com a versão antiga, o
 * usuário filtrava SP, a lista caía para 166 e o donut continuava dizendo 587.
 * A aba "Lojas" do painel de gráficos, que responderia isso, degenera para uma
 * barra em 100% sob a trava — este gráfico ocupa o lugar dela.
 */
export function useLojaExclusividade(
  sellerId: string | undefined,
  slug: string,
  filters: Record<string, unknown>,
  enabled: boolean,
) {
  return useQuery<LojaExclusividade>({
    queryKey: ["loja-exclusividade", sellerId, slug, JSON.stringify(filters ?? {})],
    enabled: !!sellerId && !!slug && enabled,
    staleTime: 60_000,
    // Sem isto o donut pisca em branco a cada mudança de filtro.
    placeholderData: (prev) => prev,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_clientes_exclusividade", {
        _seller_id: sellerId,
        _marketplace: slug,
        _filters: filters ?? {},
      });
      if (error) throw error;

      const v = (data ?? {}) as Record<string, unknown>;
      return {
        exclusive_clients: n(v.exclusive_clients),
        shared_clients: n(v.shared_clients),
      };
    },
  });
}

// ---------------------------------------------------------------------------
// 6) Produtos
// ---------------------------------------------------------------------------

export interface LojaProductRow {
  produto: string;
  pedidos: number;
  receita: number;
  ticket: number;
  clientes: number;
  total_produtos: number;
}

export function useLojaTopProducts(
  sellerId: string | undefined,
  slug: string,
  start: string,
  end: string,
  enabled: boolean,
  limit = 50,
  storeId: string | null = null,
) {
  return useQuery<LojaProductRow[]>({
    queryKey: ["loja-products", sellerId, slug, start, end, limit, storeId],
    enabled: !!sellerId && !!slug && enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_marketplace_top_products", {
        ...(storeId ? { _store_id: storeId } : {}),
        _seller_id: sellerId,
        _marketplace: slug,
        _start: start,
        _end: end,
        _limit: limit,
      });
      if (error) throw error;

      return ((data ?? []) as any[]).map((r) => ({
        produto: String(r.produto ?? "(sem produto)"),
        pedidos: n(r.pedidos),
        receita: n(r.receita),
        ticket: n(r.ticket),
        clientes: n(r.clientes),
        total_produtos: n(r.total_produtos),
      }));
    },
  });
}

// ---------------------------------------------------------------------------
// Derivados de posição — 100% no cliente, sobre as ≤7 linhas já carregadas
// ---------------------------------------------------------------------------

export type LojaMetricKey = "total_revenue" | "total_orders" | "unique_clients";

export interface LojaPosition {
  /** 0 = sem posição (loja é `other`/`retroativo`, ou não vendeu no período). */
  rank: number;
  totalPlataformas: number;
  /** Média das OUTRAS lojas, não a média incluindo a própria. */
  mediaOutras: number;
}

export function positionOf(
  rows: LojaMetricsRow[],
  slug: string,
  metric: LojaMetricKey,
): LojaPosition {
  const plataformas = rows.filter((r) => !NAO_PLATAFORMA.has(r.marketplace));
  const ranked = [...plataformas].sort((a, b) => b[metric] - a[metric]);
  const rank = ranked.findIndex((r) => r.marketplace === slug) + 1;

  const outras = plataformas.filter((r) => r.marketplace !== slug);
  const mediaOutras = outras.length ? outras.reduce((s, r) => s + r[metric], 0) / outras.length : 0;

  return { rank, totalPlataformas: plataformas.length, mediaOutras };
}

export interface LojaDoMarketplace {
  store_id: string | null;
  nome: string;
  pedidos: number;
  receita: number;
  clientes: number;
  ultimo_pedido: string | null;
}

/**
 * Comparativo por LOJA dentro do marketplace (um seller pode ter várias lojas
 * na mesma plataforma — caso real: 6 lojas Shopee). Volta vazio para a maioria
 * dos sellers, que não têm store_id nos pedidos; a tela só mostra o seletor
 * quando há 2+ lojas com pedidos no período.
 */
export function useLojasDoMarketplace(
  sellerId: string | undefined,
  slug: string,
  start: string,
  end: string,
  enabled: boolean,
) {
  return useQuery<LojaDoMarketplace[]>({
    queryKey: ["lojas-do-marketplace", sellerId, slug, start, end],
    enabled: !!sellerId && !!slug && enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("lojas_do_marketplace", {
        _seller_id: sellerId,
        _marketplace: slug,
        _start: start,
        _end: end,
      });
      if (error) throw error;
      return ((data ?? []) as any[]).map((r) => ({
        store_id: r.store_id ?? null,
        nome: String(r.nome ?? "Sem loja vinculada"),
        pedidos: Number(r.pedidos ?? 0),
        receita: Number(r.receita ?? 0),
        clientes: Number(r.clientes ?? 0),
        ultimo_pedido: r.ultimo_pedido ?? null,
      }));
    },
  });
}
