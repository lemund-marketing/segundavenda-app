/**
 * Agrupa pedidos do mesmo cliente que caíram em uma janela curta (default 3min)
 * como se fossem uma única compra. Espelha a lógica de
 * `count_deduplicated_orders` / `get_clients_with_deduped_metrics` no banco.
 *
 * Os registros originais permanecem intactos no banco — esta função apenas
 * agrupa visualmente para exibição.
 */

export interface OrderLike {
  id: string;
  client_id?: string | null;
  acquired_at?: string | null;
  total_amount?: number | string | null;
  product?: string | null;
  status?: string | null;
  marketplace?: string | null;
  [key: string]: any;
}

export interface OrderGroup<T extends OrderLike = OrderLike> {
  /** id do pedido mais antigo (representante do grupo) */
  id: string;
  /** pedidos no grupo, ordenados do mais antigo p/ mais novo */
  orders: T[];
  /** quantidade de pedidos agrupados */
  count: number;
  /** data do pedido mais antigo (representa a compra) */
  acquired_at: string | null | undefined;
  /** soma dos valores */
  total_amount: number;
  /** pedido representante (mais antigo) — usar para client_*, marketplace, etc */
  primary: T;
}

/**
 * Janela ESTENDIDA para pedidos idênticos (mesmo produto E mesmo valor): o
 * desdobro do Bling nem sempre chega em 3 minutos — medido na base (90 dias),
 * há milhares de pares idênticos entre 3 e 10 minutos (ex.: 3m37s no caso que
 * motivou isto). Pedidos DIFERENTES seguem só na janela curta: duas compras
 * reais distintas em poucos minutos não podem ser fundidas.
 * Espelho desta regra no banco: compras_agrupadas / count_deduplicated_orders.
 */
const JANELA_IDENTICOS_MS = 10 * 60 * 1000;

function pedidosIdenticos(a: OrderLike, b: OrderLike): boolean {
  const prodA = (a.product ?? "").trim();
  const prodB = (b.product ?? "").trim();
  if (!prodA || prodA !== prodB) return false;
  return Number(a.total_amount ?? 0) === Number(b.total_amount ?? 0);
}

export function groupOrdersByWindow<T extends OrderLike>(
  orders: T[] | null | undefined,
  windowMinutes = 3,
): OrderGroup<T>[] {
  if (!orders || orders.length === 0) return [];

  const windowMs = windowMinutes * 60 * 1000;

  // agrupa por client_id (fallback: id próprio, nunca agrupa)
  const byClient = new Map<string, T[]>();
  for (const o of orders) {
    const key = o.client_id || `__no_client_${o.id}`;
    const arr = byClient.get(key);
    if (arr) arr.push(o);
    else byClient.set(key, [o]);
  }

  const groups: OrderGroup<T>[] = [];

  for (const list of byClient.values()) {
    // ordena ascendente por acquired_at
    const tsOf = (o: T) => (o.acquired_at ? new Date(o.acquired_at).getTime() : 0);
    const sorted = [...list].sort((a, b) => tsOf(a) - tsOf(b));

    let current: T[] = [];
    let lastTs = 0;

    const flush = () => {
      if (current.length === 0) return;
      const primary = current[0];
      const total = current.reduce(
        (s, o) => s + Number(o.total_amount ?? 0),
        0,
      );
      groups.push({
        id: primary.id,
        orders: current,
        count: current.length,
        acquired_at: primary.acquired_at,
        total_amount: total,
        primary,
      });
      current = [];
    };

    for (const o of sorted) {
      const ts = tsOf(o);
      const anterior = current[current.length - 1];
      const encadeia =
        current.length === 0 ||
        ts - lastTs <= windowMs ||
        (ts - lastTs <= JANELA_IDENTICOS_MS && pedidosIdenticos(anterior, o));
      if (encadeia) {
        current.push(o);
      } else {
        flush();
        current.push(o);
      }
      lastTs = ts;
    }
    flush();
  }

  // ordena grupos descendente por data (mais recente primeiro)
  groups.sort(
    (a, b) => (b.acquired_at ? new Date(b.acquired_at).getTime() : 0) - (a.acquired_at ? new Date(a.acquired_at).getTime() : 0),
  );

  return groups;
}
