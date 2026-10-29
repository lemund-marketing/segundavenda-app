import { useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronDown,
  ChevronRight,
  Copy,
  ShoppingCart,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { StoreBadge } from "@/components/clients/StoreBadge";
import { avatarToneFor, getInitials } from "@/components/clients/sections/shared";
import {
  DATE_FMT,
  SHORT_FMT,
  TIME_FMT,
  isSameDayAsToday,
  localDoCliente,
  parseOrderDate,
  statusToneClass,
} from "./orderRowShared";
import { PedidoCardMobile } from "./PedidoCardMobile";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, formatDocument } from "@/utils/formatters";
import { absoluteLabel } from "@/utils/relativeDate";
import { statusLabel } from "@/components/pedidos/statusPedido";
import type { OrderGroup } from "@/utils/groupOrdersByWindow";
import { cn } from "@/lib/utils";

export interface OrderRow {
  id: string;
  external_order_id: string;
  total_amount: number;
  marketplace: string;
  product: string;
  /** opcional: só é lido como fallback de `acquired_at`, e quem filtra por
   *  `acquired_at` (a lista da loja) nunca tem a coluna nula para cair nele. */
  created_at?: string;
  acquired_at?: string;
  client_id: string;
  is_second_sale?: boolean;
  order_status?: string;
  whatsapp_contacted_at?: string | null;
  clients?: {
    full_name: string;
    document: string;
    document_type: string;
    whatsapp: string;
    email: string;
    state_code?: string;
    city?: string;
  };
  /** hoje sempre nulo — `orders.store_id` só será preenchido pelo seller-webhook */
  stores?: { name: string } | null;
}

interface Props {
  groups: OrderGroup<OrderRow>[];
  loading?: boolean;
  /** coluna Status só aparece quando o seller tem pedido fora de "approved" */
  hasStatusUpdates?: boolean;
  expandedGroups: Set<string>;
  onToggleGroup: (id: string) => void;
  sortField: string;
  sortDir: "asc" | "desc";
  onSort: (field: string) => void;
  onViewClient: (clientId: string) => void;
  onWhatsApp: (order: OrderRow) => void;
  onEmail: (order: OrderRow) => void;
  onShipment: (order: OrderRow) => void;
  orderIdsWithShipment?: Set<string>;
  hasFilters?: boolean;
  onClearFilters?: () => void;
  /**
   * Esconde a coluna/badge "Marketplace". Só faz sentido quando TODAS as linhas são da
   * mesma loja por construção da query (ex.: /lojas/:marketplace). Default off,
   * porque a lista geral de /pedidos mistura marketplaces.
   */
  hideStoreColumn?: boolean;
}

type ColAlign = "left" | "center" | "right";

interface ColSpec {
  key: string;
  label: string;
  /** px — é também a parcela do `min-width` da tabela (ver `minWidth` abaixo) */
  width: number;
  sortable?: boolean;
  align?: ColAlign;
}

const ALIGN_CLASS: Record<ColAlign, string> = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
};

const BUTTON_ALIGN_CLASS: Record<ColAlign, string> = {
  left: "",
  center: "mx-auto",
  right: "ml-auto",
};

/**
 * As colunas são as MESMAS do `<thead>`, do corpo e do esqueleto — uma lista só.
 * Antes cada um tinha a sua e as três divergiram: o esqueleto continuou
 * desenhando Turno e Ações depois que as duas colunas saíram.
 */
function buildCols(hideStoreColumn?: boolean, hasStatusUpdates?: boolean): ColSpec[] {
  return [
    { key: "acquired_at", label: "Data", width: 130, sortable: true },
    { key: "external_order_id", label: "ID Pedido", width: 140 },
    // As duas colunas de texto livre são as que dão para encolher: a área útil
    // no notebook é 1366 − 220 (sidebar) − 32 (padding da página) ≈ 1.100px, e
    // com 230/240 a soma COM a coluna Status batia 1.150 — nascia barra de
    // rolagem horizontal dentro do card e a coluna Valor, a mais consultada,
    // ficava escondida à direita. O nome já trunca e o produto já é
    // `line-clamp-2` com tooltip, então nada de conteúdo se perde.
    { key: "full_name", label: "Cliente", width: 200, sortable: true },
    { key: "product", label: "Produto", width: 190 },
    // 120 e não 150: o conteúdo é uma etiqueta curta ("Mercado Livre"), e as
    // 30px extras viravam um vão entre ela e o Valor (pedido de 20/08).
    ...(hideStoreColumn ? [] : [{ key: "store", label: "Marketplace", width: 120 }]),
    ...(hasStatusUpdates ? [{ key: "status", label: "Status", width: 130 }] : []),
    // Valor à ESQUERDA como as demais: alinhado à direita ele encostava na borda
    // do card, longe do rótulo, e quebrava o padrão de leitura das outras colunas.
    { key: "total_amount", label: "Valor", width: 110, sortable: true },
  ];
}

const totalWidth = (cols: ColSpec[]) => cols.reduce((s, c) => s + c.width, 0);



/** Um bloco de placeholder por COLUNA REAL — o mapa é chaveado por `col.key`. */
function CellSkeleton({ colKey }: { colKey: string }) {
  switch (colKey) {
    case "acquired_at":
      return (
        <div className="space-y-1.5 pl-5">
          <Skeleton className="h-3.5 w-16" />
          <Skeleton className="h-3 w-10" />
        </div>
      );
    case "external_order_id":
      return <Skeleton className="h-3.5 w-20" />;
    case "full_name":
      return (
        <div className="flex items-center gap-2.5">
          <Skeleton className="h-8 w-8 rounded-full shrink-0" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-full max-w-[120px]" />
            <Skeleton className="h-3 w-full max-w-[80px]" />
          </div>
        </div>
      );
    case "product":
      return (
        <div className="space-y-1.5">
          <Skeleton className="h-3.5 w-full max-w-[180px]" />
          <Skeleton className="h-3.5 w-full max-w-[110px]" />
        </div>
      );
    case "store":
    case "status":
      return <Skeleton className="h-5 w-24 max-w-full rounded-full" />;
    case "total_amount":
      return <Skeleton className="ml-auto h-3.5 w-20" />;
    default:
      return <Skeleton className="h-3.5 w-16" />;
  }
}

/**
 * Skeleton da LISTA, não da página: o TableSkeleton genérico traz um card de
 * filtros falso e este componente já mora dentro do painel "Lista de Pedidos".
 *
 * Recebe as MESMAS `cols` que a tabela vai desenhar (e o mesmo par
 * tabela/cards do breakpoint `md`), então o número e a largura dos blocos
 * batem com o que chega depois — o esqueleto antigo era fixo em 8 blocos, com
 * um botão de "Ações" e um Turno que não existem mais, e a lista pulava quando
 * os dados chegavam.
 */
function ListaSkeleton({ cols, rows = 8 }: { cols: ColSpec[]; rows?: number }) {
  return (
    <>
      {/* app: o app é sempre o desenho de celular, também deitado e no tablet (ver use-mobile) */}
      <div className="hidden overflow-x-auto">
        <table className="w-full table-fixed" style={{ minWidth: totalWidth(cols) }}>
          <tbody className="divide-y divide-border/60">
            {Array.from({ length: rows }).map((_, i) => (
              <tr key={i}>
                {cols.map((c) => (
                  <td key={c.key} className="px-4 py-4 align-middle" style={{ width: c.width }}>
                    <CellSkeleton colKey={c.key} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="divide-y divide-border/60">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-start gap-3 px-4 py-4">
            <Skeleton className="h-10 w-10 rounded-full shrink-0" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-3.5 w-40 max-w-full" />
              <Skeleton className="h-3 w-24 max-w-full" />
              <Skeleton className="h-3 w-48 max-w-full" />
            </div>
            <Skeleton className="h-3.5 w-16 shrink-0" />
          </div>
        ))}
      </div>
    </>
  );
}

export function OrdersTableV2({
  groups,
  loading,
  hasStatusUpdates,
  expandedGroups,
  onToggleGroup,
  sortField,
  sortDir,
  onSort,
  onViewClient,
  onWhatsApp,
  onEmail,
  onShipment,
  orderIdsWithShipment,
  hasFilters,
  onClearFilters,
  hideStoreColumn,
}: Props) {
  const { toast } = useToast();
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const cols = buildCols(hideStoreColumn, hasStatusUpdates);

  const SortIcon = ({ col }: { col: string }) => {
    if (sortField !== col) return <ArrowUpDown className="w-3 h-3 ml-1 opacity-40" />;
    return sortDir === "asc" ? <ArrowUp className="w-3 h-3 ml-1" /> : <ArrowDown className="w-3 h-3 ml-1" />;
  };

  const handleCopy = async (e: React.MouseEvent, value: string, id: string) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(value);
      setCopiedId(id);
      toast({ description: `ID copiado: ${value}` });
      setTimeout(() => setCopiedId((cur) => (cur === id ? null : cur)), 800);
    } catch {
      toast({ description: "Não foi possível copiar o ID.", variant: "destructive" });
    }
  };

  if (loading) return <ListaSkeleton cols={cols} />;

  if (!groups.length) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
        <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center">
          <ShoppingCart className="w-6 h-6 text-muted-foreground" />
        </div>
        {hasFilters ? (
          <>
            <p className="text-sm font-medium text-foreground">Nenhum pedido com esses filtros.</p>
            <p className="text-xs text-muted-foreground max-w-[22rem] leading-relaxed">
              A lista começa em "30 dias" e esconde cancelados — quem comprou antes disso, ou pedidos
              cancelados, só aparecem ampliando o período ou em "Mais filtros".
            </p>
            {onClearFilters && (
              <Button variant="outline" size="sm" className="mt-1" onClick={onClearFilters}>
                Limpar filtros
              </Button>
            )}
          </>
        ) : (
          <>
            <p className="text-sm font-medium text-foreground">Nenhum pedido por aqui ainda.</p>
            <p className="text-xs text-muted-foreground max-w-[22rem] leading-relaxed">
              Assim que o primeiro pedido chegar de uma loja conectada, ele aparece nesta lista.
            </p>
          </>
        )}
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={150}>
      {/*
        `min-width` é a SOMA das larguras declaradas em `cols`, não uma constante:
        940px na /pedidos, 790px na página da loja (sem a coluna Loja) e 1.070px
        com a coluna Status. O valor fixo de 1.080px sobrou da versão com Turno e
        Ações e forçava barra de rolagem horizontal na loja mesmo quando o
        conteúdo cabia. Todos os três cabem nos ~1.100px úteis de um notebook de
        1366. Abaixo de `md` a tabela sai e entra a lista de cards, o mesmo par
        que a tabela de Clientes usa.
      */}
      {/* app: o app é sempre o desenho de celular, também deitado e no tablet (ver use-mobile) */}
      <div className="hidden overflow-x-auto">
        <table className="w-full table-fixed" style={{ minWidth: totalWidth(cols) }}>
          <thead>
            <tr className="border-b border-border">
              {cols.map((c) => {
                const align = c.align ?? "left";
                return (
                  <th
                    key={c.key}
                    style={{ width: c.width }}
                    className={cn(
                      "px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground",
                      ALIGN_CLASS[align],
                    )}
                  >
                    {c.sortable ? (
                      <button
                        type="button"
                        onClick={() => onSort(c.key)}
                        className={cn(
                          "flex items-center hover:text-foreground transition-colors uppercase tracking-wider",
                          BUTTON_ALIGN_CLASS[align],
                          // A coluna Data reserva 26px na linha para o botão de
                          // expandir (20 do slot + 6 do gap). Sem o mesmo recuo
                          // aqui, o rótulo ficava à esquerda do próprio valor.
                          c.key === "acquired_at" && "ml-[26px]",
                        )}
                      >
                        {c.label} <SortIcon col={c.key} />
                      </button>
                    ) : (
                      c.label
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {groups.flatMap((group, i) => {
              const order = group.primary;
              const isGroup = group.count > 1;
              const isExpanded = expandedGroups.has(group.id);
              const rawDate = order.acquired_at || order.created_at;
              const date = parseOrderDate(rawDate);
              const today = date ? isSameDayAsToday(date) : false;
              const nome = order.clients?.full_name || "Cliente não identificado";
              const tone = avatarToneFor(nome);
              const local = localDoCliente(order.clients);
              const produto = isGroup
                ? `${order.product || "Produto"} + ${group.count - 1} ite${group.count - 1 === 1 ? "m" : "ns"}`
                : order.product || "Produto não especificado";
              const produtoTitle = isGroup
                ? group.orders.map((o) => o.product).filter(Boolean).join(" · ")
                : order.product || "Produto não especificado";

              const rows: JSX.Element[] = [];

              rows.push(
                <motion.tr
                  key={group.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.2, delay: Math.min(i * 0.015, 0.3) }}
                  onClick={() => order.client_id && onViewClient(order.client_id)}
                  className="group cursor-pointer border-b border-border/60 transition-colors hover:bg-muted/40"
                >
                  {/* Data */}
                  <td className="relative px-4 py-3.5">
                    {/* O ponto de "hoje" mora na calha (padding) da célula: no
                        fluxo ele empurrava a data mais 12px para a direita, e era
                        parte do desalinhamento com o cabeçalho. */}
                    {today && (
                      <span
                        // Vertical: top-1/2 + -translate-y-1/2 centra na altura
                        // REAL da linha (top fixo errava quando a linha crescia).
                        //
                        // Horizontal: o vão antes da data tem 42px — 16 de
                        // padding + 20 do slot da seta + 6 do gap. Em left-1 a
                        // bolinha ficava colada na borda; 18px a põe no MEIO
                        // desse vão (18 + 3 de metade da bolinha = 21 = 42/2).
                        //
                        // Linha de GRUPO é a exceção: ali a seta ocupa 16→36px e
                        // a bolinha bateria em cima dela, então volta para a calha.
                        className={cn(
                          "absolute top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-success",
                          isGroup ? "left-1" : "left-[18px]",
                        )}
                        title="Hoje"
                      />
                    )}
                    <div className="flex items-start gap-1.5">
                      {isGroup ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleGroup(group.id);
                          }}
                          className="p-0.5 rounded-sm hover:bg-muted text-muted-foreground shrink-0"
                          title={isExpanded ? "Recolher pedidos" : "Expandir pedidos da mesma compra"}
                        >
                          {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </button>
                      ) : (
                        <span className="w-5 shrink-0" />
                      )}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="leading-tight min-w-0">
                            <div className="text-[13px] font-medium text-foreground font-tabular">
                              {date ? DATE_FMT.format(date) : "—"}
                            </div>
                            <div className="text-[11px] text-muted-foreground font-tabular">
                              {date ? TIME_FMT.format(date) : ""}
                            </div>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>{absoluteLabel(rawDate)}</TooltipContent>
                      </Tooltip>
                    </div>
                  </td>

                  {/* ID Pedido */}
                  <td className="px-4 py-3.5">
                    <button
                      type="button"
                      onClick={(e) => handleCopy(e, order.external_order_id || order.id, order.id)}
                      className="inline-flex items-center gap-1.5 max-w-full font-mono text-[12px] text-foreground hover:text-primary transition-colors group/copy"
                      title="Clique para copiar"
                    >
                      <span className="truncate">{order.external_order_id || order.id.slice(0, 8)}</span>
                      <Copy
                        className={cn(
                          "w-3 h-3 shrink-0 opacity-0 group-hover/copy:opacity-100 transition-opacity",
                          copiedId === order.id && "opacity-100 text-success",
                        )}
                      />
                    </button>
                  </td>

                  {/* Cliente */}
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-2.5">
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-bold shrink-0"
                        style={{ background: tone.bg, color: tone.fg }}
                      >
                        {getInitials(nome)}
                      </div>
                      <div className="min-w-0">
                        <div
                          className="text-[13px] font-semibold text-foreground truncate"
                          title={order.clients?.document ? formatDocument(order.clients.document) : undefined}
                        >
                          {nome}
                        </div>
                        <div className="text-[11px] text-muted-foreground truncate">{local || "—"}</div>
                      </div>
                    </div>
                  </td>

                  {/* Produto */}
                  <td className="px-4 py-3.5">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="text-[13px] text-foreground line-clamp-2 cursor-help">{produto}</span>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-md">{produtoTitle}</TooltipContent>
                    </Tooltip>
                  </td>

                  {/* Loja */}
                  {!hideStoreColumn && (
                    <td className="px-4 py-3.5">
                      <StoreBadge storeKey={order.marketplace} storeName={order.stores?.name ?? null} />
                    </td>
                  )}

                  {/* Status */}
                  {hasStatusUpdates && (
                    <td className="px-4 py-3.5">
                      <span
                        className={cn(
                          "inline-flex max-w-full items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold",
                          statusToneClass(order.order_status || "approved"),
                        )}
                      >
                        <span className="truncate">{statusLabel(order.order_status || "approved")}</span>
                      </span>
                    </td>
                  )}

                  {/* Valor */}
                  <td className="px-4 py-3.5">
                    <span className="text-[14px] font-bold text-foreground font-tabular">
                      {formatCurrency(group.total_amount)}
                    </span>
                    {isGroup && (
                      <p className="text-[10px] text-muted-foreground leading-none mt-0.5">
                        soma dos {group.count} pedidos
                      </p>
                    )}
                  </td>

                </motion.tr>,
              );

              if (isGroup && isExpanded) {
                for (const child of group.orders) {
                  const childDate = parseOrderDate(child.acquired_at || child.created_at);
                  rows.push(
                    <tr key={`${group.id}-child-${child.id}`} className="bg-muted/30 border-b border-border/60">
                      <td className="px-4 py-2">
                        <span className="pl-[26px] text-[11px] text-muted-foreground font-tabular">
                          {childDate ? SHORT_FMT.format(childDate) : "—"}
                        </span>
                      </td>
                      <td className="px-4 py-2">
                        <span className="font-mono text-[11px] text-muted-foreground truncate block">
                          {child.external_order_id || child.id.slice(0, 8)}
                        </span>
                      </td>
                      <td className="px-4 py-2">
                        <span className="text-muted-foreground text-xs">—</span>
                      </td>
                      <td className="px-4 py-2">
                        <span className="text-[12px] text-muted-foreground line-clamp-1" title={child.product || ""}>
                          {child.product || "—"}
                        </span>
                      </td>
                      {/* Uma célula por coluna do <thead> — nem uma a mais. Numa
                          `table-fixed`, `<td>` sobrando (restos de Turno/Ações)
                          empurrava Valor para fora da coluna ao expandir. */}
                      {!hideStoreColumn && (
                        <td className="px-4 py-2">
                          <span className="text-muted-foreground text-xs">—</span>
                        </td>
                      )}
                      {hasStatusUpdates && (
                        <td className="px-4 py-2">
                          <span className="text-muted-foreground text-xs">—</span>
                        </td>
                      )}
                      <td className="px-4 py-2">
                        <span className="text-[12px] font-medium text-foreground font-tabular">
                          {formatCurrency(Number(child.total_amount) || 0)}
                        </span>
                      </td>
                    </tr>,
                  );
                }
              }

              return rows;
            })}
          </tbody>
        </table>
      </div>

      {/* ── Mesma lista, em linhas de app, abaixo de md ──
          Desenho das telas do celular (22/10/2026): avatar, nome e valor na
          primeira linha; produto e quando na segunda; loja, status, local e os
          atalhos na terceira — os atalhos em círculo verde a 10%, como o resto
          do app. O toque na linha abre a ficha do cliente. */}
      <div className="divide-y divide-border/60">
        {groups.map((group, i) => {
          const order = group.primary;
          const isGroup = group.count > 1;
          const nome = order.clients?.full_name || "Cliente não identificado";

          return (
            <motion.div
              key={`m-${group.id}`}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: Math.min(i * 0.02, 0.3) }}
              className="px-4 py-3.5"
            >
              <PedidoCardMobile
                nome={nome}
                total={group.total_amount}
                totalTitle={isGroup ? `Soma dos ${group.count} pedidos` : undefined}
                produto={
                  isGroup
                    ? `${order.product || "Produto"} + ${group.count - 1} ite${group.count - 1 === 1 ? "m" : "ns"}`
                    : order.product || "Produto não especificado"
                }
                data={parseOrderDate(order.acquired_at || order.created_at)}
                local={localDoCliente(order.clients)}
                marketplace={hideStoreColumn ? undefined : order.marketplace}
                storeName={order.stores?.name ?? null}
                status={hasStatusUpdates ? order.order_status || "approved" : null}
                onAbrir={() => order.client_id && onViewClient(order.client_id)}
                whatsapp={
                  order.clients?.whatsapp
                    ? { contatado: !!order.whatsapp_contacted_at, onClick: () => onWhatsApp(order) }
                    : null
                }
                onEmail={order.clients?.email ? () => onEmail(order) : null}
                onEntrega={orderIdsWithShipment?.has(order.id) ? () => onShipment(order) : null}
              />
            </motion.div>
          );
        })}
      </div>
    </TooltipProvider>
  );
}

export default OrdersTableV2;
