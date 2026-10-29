import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { ArrowUpDown, ArrowUp, ArrowDown, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import WhatsAppIcon from "@/components/WhatsAppIcon";
import { StoreBadge } from "@/components/clients/StoreBadge";
import { avatarToneFor, getInitials, hexToRgba, tintaPorTema } from "@/components/clients/sections/shared";
import RfvBadge from "@/components/rfv/RfvBadge";
import { formatCurrency } from "@/utils/formatters";
import { relativeLabel, absoluteLabel } from "@/utils/relativeDate";
import { openWhatsApp } from "@/utils/whatsapp";
import { maskFullName } from "@/utils/showcaseMask";
import type { ClientExtras } from "@/hooks/useClientesPageExtras";
import { cn } from "@/lib/utils";

export interface ClienteRow {
  id: string;
  full_name: string;
  document: string;
  email: string;
  whatsapp: string;
  state_code: string;
  total_orders: number;
  total_spent: number;
  last_order_date: string;
  first_order_date: string;
}

interface Props {
  clients: ClienteRow[];
  extras: Record<string, ClientExtras>;
  loading?: boolean;
  /** Os extras chegam um round-trip depois da lista; sem isto, "—"/"Sem estágio". */
  extrasLoading?: boolean;
  colSort: { col: string; dir: "asc" | "desc" } | null;
  onSort: (col: string) => void;
  onSelectClient: (clientId: string) => void;
  /** Vitrine do admin: nome parcialmente mascarado e nenhuma ação por linha. */
  masked?: boolean;
  /** Muda o texto do estado vazio: filtro que cortou tudo ≠ base vazia. */
  hasFilters?: boolean;
  onClearFilters?: () => void;
  /**
   * Some com a coluna "Loja".
   *
   * Para quem já entrou com a loja travada no recorte: `get_clients_page_extras`
   * devolve o marketplace do pedido MAIS RECENTE do cliente no seller, sem
   * recorte de canal — dentro de "Clientes de Mercado Livre" a coluna nomeava
   * "Shopee" em 6 das 51 linhas. É o mesmo motivo pelo qual a aba "Lojas" do
   * painel some ali; quem também compra fora é assunto do donut de
   * Exclusividade.
   */
  hideStoreColumn?: boolean;
  /** Sobrescreve o texto de "filtro cortou tudo" — quem chama sabe o recorte. */
  emptyFilteredTitle?: string;
  emptyFilteredHint?: ReactNode;
}

const TONE_CLASS: Record<"fresh" | "muted" | "stale", string> = {
  fresh: "text-primary",
  muted: "text-muted-foreground",
  // O mesmo âmbar dos sheets: `muted-foreground/70` dava 2,73:1 justamente na
  // informação que o usuário procura para decidir quem reativar.
  stale: "text-amber-600 dark:text-amber-500",
};

type ColAlign = "left" | "center" | "right";

interface Col {
  key: string;
  label: string;
  sortable?: boolean;
  align?: ColAlign;
  thClass?: string;
  responsiveHide?: boolean;
  srOnlyLabel?: boolean;
}

// Tudo alinhado à esquerda de propósito: com número centralizado/à direita, o
// valor não nascia na mesma coluna vertical do título, e a leitura de cima para
// baixo ficava torta. Alinhado, o valor começa exatamente onde o título começa.
const COLS: Col[] = [
  { key: "name", label: "Cliente", sortable: true, align: "left", thClass: "w-[280px]" },
  { key: "orders", label: "Pedidos", sortable: true, align: "left", thClass: "w-[90px]" },
  { key: "spent", label: "Total Gasto", sortable: true, align: "left", thClass: "w-[130px]" },
  { key: "ticket", label: "Ticket Médio", sortable: true, align: "left", thClass: "w-[130px]", responsiveHide: true },
  { key: "last_order", label: "Última Compra", sortable: true, align: "left", thClass: "w-[130px] max-w-[130px]" },
  // Loja não é ordenável: o dado vem de get_clients_page_extras, só para a página
  // visível — ordenar por ele reordenaria a página, não a lista inteira.
  { key: "store", label: "Loja", align: "left", thClass: "w-[150px] max-w-[150px]", responsiveHide: true },
  { key: "stage", label: "Estágio CRM", align: "left", thClass: "w-[160px] max-w-[160px]" },
];

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

function whatsappMessage(nome: string) {
  const primeiro = (nome || "").trim().split(/\s+/)[0];
  return primeiro ? `Olá ${primeiro}! Tudo bem?` : "Olá! Tudo bem?";
}

/**
 * Skeleton da LISTA, não da página: o TableSkeleton genérico traz um card de
 * filtros falso e um card externo, e este componente já mora dentro do painel
 * "Lista de Clientes" — dava card dentro de card e uma barra de filtros fantasma.
 */
function ListaSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="divide-y divide-border/60">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-3">
          <Skeleton className="w-9 h-9 rounded-full shrink-0" />
          <div className="flex-1 min-w-0 space-y-2">
            <Skeleton className="h-3.5 w-40 max-w-full" />
            <Skeleton className="h-3 w-24 max-w-full" />
          </div>
          {/* No celular a linha é nome + valor; as colunas só existem do md para cima. */}
          <Skeleton className="h-3.5 w-8 shrink-0 hidden md:block" />
          <Skeleton className="h-3.5 w-20 shrink-0" />
          <Skeleton className="h-3.5 w-20 shrink-0 hidden lg:block" />
          <Skeleton className="h-3.5 w-14 shrink-0 hidden md:block" />
          <Skeleton className="h-5 w-24 rounded-full shrink-0 hidden lg:block" />
          <Skeleton className="h-6 w-24 rounded-full shrink-0 hidden md:block" />
        </div>
      ))}
    </div>
  );
}

export function ClientesTableV2({
  clients,
  extras,
  loading,
  extrasLoading,
  colSort,
  onSort,
  onSelectClient,
  masked,
  hasFilters,
  onClearFilters,
  hideStoreColumn,
  emptyFilteredTitle,
  emptyFilteredHint,
}: Props) {
  // O botão de "Ver ficha" saiu porque a linha inteira já abre a ficha — mas o de
  // WhatsApp faz OUTRA coisa (abre a conversa no WhatsApp sem passar pela ficha) e
  // não tinha substituto no desktop; só o cartão mobile o manteve.
  // Sem coluna de ações: o usuário pediu para tirar os ícones de WhatsApp e olho.
  // A linha inteira abre a ficha, e o WhatsApp segue no cartão mobile.
  const cols = hideStoreColumn ? COLS.filter((c) => c.key !== "store") : COLS;

  const SortIcon = ({ col }: { col: string }) => {
    if (colSort?.col !== col) return <ArrowUpDown className="w-3 h-3 ml-1 opacity-40" />;
    return colSort.dir === "asc" ? <ArrowUp className="w-3 h-3 ml-1" /> : <ArrowDown className="w-3 h-3 ml-1" />;
  };

  if (loading) return <ListaSkeleton />;

  if (!clients.length) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
        <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center">
          <Users className="w-6 h-6 text-muted-foreground" />
        </div>
        {hasFilters ? (
          <>
            <p className="text-sm font-medium text-foreground">
              {emptyFilteredTitle ?? "Nenhum cliente com esses filtros."}
            </p>
            <p className="text-xs text-muted-foreground max-w-[22rem] leading-relaxed">
              {/* O período vem de quem chama: cravado, o texto mandava ampliar
                  para "Últimos 30 dias" com a tela em 7 dias. */}
              {emptyFilteredHint ??
                "Amplie o período ou remova algum filtro para ver mais clientes."}
            </p>
            {onClearFilters && (
              <Button variant="outline" size="sm" className="mt-1" onClick={onClearFilters}>
                Limpar filtros
              </Button>
            )}
          </>
        ) : (
          <>
            <p className="text-sm font-medium text-foreground">Nenhum cliente por aqui ainda.</p>
            <p className="text-xs text-muted-foreground max-w-[22rem] leading-relaxed">
              Assim que o primeiro pedido chegar de uma loja conectada, o cliente aparece nesta lista.
            </p>
          </>
        )}
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={150}>
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full table-fixed">
          <thead>
            <tr className="border-b border-border">
              {cols.map((c) => {
                const align = c.align ?? "left";
                return (
                  <th
                    key={c.key}
                    className={cn(
                      "px-4 py-3 text-[12px] font-semibold text-muted-foreground tracking-[0.02em]",
                      ALIGN_CLASS[align],
                      c.thClass,
                      c.responsiveHide && "hidden lg:table-cell",
                    )}
                  >
                    {c.sortable ? (
                      <button
                        type="button"
                        onClick={() => onSort(c.key)}
                        className={cn(
                          "flex items-center hover:text-foreground transition-colors",
                          BUTTON_ALIGN_CLASS[align],
                        )}
                      >
                        {c.label} <SortIcon col={c.key} />
                      </button>
                    ) : c.srOnlyLabel ? (
                      <span className="sr-only">{c.label}</span>
                    ) : (
                      c.label
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {clients.map((client, i) => {
              const e = extras[client.id];
              const nome = masked ? maskFullName(client.full_name) : client.full_name || "Cliente sem nome";
              const tone = avatarToneFor(nome);
              const last = relativeLabel(client.last_order_date);
              const ticket = client.total_orders > 0 ? client.total_spent / client.total_orders : null;
              const local = [e?.city, client.state_code].filter(Boolean).join(" — ");

              return (
                <motion.tr
                  key={client.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.2, delay: Math.min(i * 0.015, 0.3) }}
                  onClick={() => onSelectClient(client.id)}
                  className="group cursor-pointer border-b border-border/60 hover:bg-muted/40 transition-colors"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {/* Avatar de 36px e `py-3`: a linha sai de 72 para 60px, e
                          é isso que decide quantos clientes cabem na dobra do
                          notebook — 1,9 linha antes deste ajuste. */}
                      <div
                        className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0 text-[color:var(--tinta)] dark:text-[color:var(--tinta-escura)]"
                        style={{ background: tone.bg, ...tintaPorTema(tone.fg, tone.base) }}
                      >
                        {getInitials(nome)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-[14px] font-medium text-foreground truncate leading-snug">{nome}</p>
                        {/* A etiqueta RFV desceu para a segunda linha: ao lado do nome,
                            "Não posso perdê-los" comia 125px dos ~196px da coluna e
                            sobrava espaço para 6 letras do nome. */}
                        <div className="flex items-center gap-1.5 min-w-0">
                          <RfvBadge segment={e?.rfv_segment} className="shrink-0" />
                          {local && <span className="text-xs text-muted-foreground truncate">{local}</span>}
                        </div>
                      </div>
                    </div>
                  </td>

                  <td className="px-4 py-3 text-[14px] font-semibold text-foreground tabular-nums">
                    {client.total_orders}
                  </td>

                  <td className="px-4 py-3 text-[14px] font-semibold text-foreground tabular-nums">
                    {formatCurrency(client.total_spent)}
                  </td>

                  <td className="px-4 py-3 text-[14px] font-semibold text-foreground tabular-nums hidden lg:table-cell">
                    {ticket !== null ? formatCurrency(ticket) : <span className="font-normal text-muted-foreground">—</span>}
                  </td>

                  <td className="px-4 py-3 whitespace-nowrap">
                    {client.last_order_date ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className={cn("text-[13px] font-medium tabular-nums", TONE_CLASS[last.tone])}>
                            {last.text}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>{absoluteLabel(client.last_order_date)}</TooltipContent>
                      </Tooltip>
                    ) : (
                      <span className="text-[13px] text-muted-foreground">—</span>
                    )}
                  </td>

                  {!hideStoreColumn && (
                    <td className="px-4 py-3 hidden lg:table-cell">
                      {extrasLoading && !e ? (
                        <Skeleton className="h-5 w-20 rounded-full" />
                      ) : (
                        <StoreBadge storeKey={e?.store_key} storeName={e?.store_name} extraStores={e?.extra_stores} />
                      )}
                    </td>
                  )}

                  <td className="px-4 py-3">
                    {extrasLoading && !e ? (
                      <Skeleton className="h-6 w-24 rounded-full" />
                    ) : e?.stage_name ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span
                            className="inline-flex max-w-full items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-semibold whitespace-nowrap text-[color:var(--tinta)] dark:text-[color:var(--tinta-escura)]"
                            style={{
                              background: hexToRgba(e.stage_color || "#09AF68", 0.15),
                              ...tintaPorTema(e.stage_color || "hsl(var(--primary))"),
                            }}
                          >
                            <span
                              className="w-1.5 h-1.5 rounded-full shrink-0"
                              style={{ background: e.stage_color || "#09AF68" }}
                            />
                            <span className="truncate">{e.stage_name}</span>
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>{e.stage_name}</TooltipContent>
                      </Tooltip>
                    ) : (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-border px-2.5 py-1">
                            <span className="w-1.5 h-1.5 rounded-full border border-muted-foreground/50 shrink-0" />
                            <span className="text-xs text-muted-foreground">Sem estágio</span>
                          </span>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-[240px] text-xs">
                          Este cliente ainda não entrou em nenhuma fase do funil. Arraste-o para uma coluna no Kanban.
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </td>

                </motion.tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Abaixo de md, linhas de app (22/10/2026, no desenho de Pedidos): nome
          e total gasto; pedidos, local e a última compra; loja, segmento RFV e
          fase do funil, com o atalho do WhatsApp em círculo verde a 10%. A
          linha abre a ficha; o WhatsApp abre a conversa direto. */}
      <div className="md:hidden divide-y divide-border/60">
        {clients.map((client, i) => {
          const e = extras[client.id];
          const nome = masked ? maskFullName(client.full_name) : client.full_name || "Cliente sem nome";
          const tone = avatarToneFor(nome);
          const last = relativeLabel(client.last_order_date);
          const local = [e?.city, client.state_code].filter(Boolean).join(" — ");
          const pedidos = `${client.total_orders} ${client.total_orders === 1 ? "pedido" : "pedidos"}`;
          const carregandoExtras = extrasLoading && !e;

          return (
            <motion.div
              key={client.id}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: Math.min(i * 0.02, 0.3) }}
              className="px-4 py-3.5"
            >
              {/* Botão dentro de botão é HTML inválido: só a área de informação
                  abre a ficha; o WhatsApp fica de fora. */}
              <button
                type="button"
                onClick={() => onSelectClient(client.id)}
                className="flex w-full min-w-0 items-start gap-3 text-left"
              >
                <div
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[13px] font-bold text-[color:var(--tinta)] dark:text-[color:var(--tinta-escura)]"
                  style={{ background: tone.bg, ...tintaPorTema(tone.fg, tone.base) }}
                >
                  {getInitials(nome)}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="truncate text-[15px] font-medium text-foreground">{nome}</p>
                    <span className="shrink-0 text-[15px] font-bold tabular-nums text-foreground">
                      {formatCurrency(client.total_spent)}
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-baseline justify-between gap-3">
                    <p className="truncate text-[13px] text-muted-foreground">
                      {local ? `${pedidos} · ${local}` : pedidos}
                    </p>
                    {client.last_order_date && (
                      <span
                        className={cn("shrink-0 text-[12px] font-medium tabular-nums", TONE_CLASS[last.tone])}
                        title={absoluteLabel(client.last_order_date)}
                      >
                        {last.text}
                      </span>
                    )}
                  </div>
                </div>
              </button>

              <div className="mt-2 flex items-center gap-2 pl-[52px]">
                <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
                  {!hideStoreColumn &&
                    (carregandoExtras ? (
                      <Skeleton className="h-5 w-20 shrink-0 rounded-full" />
                    ) : (
                      // Teto de 60% para a loja: um apelido longo ganha reticências
                      // (o "+N" fica) em vez de empurrar a etiqueta RFV para fora.
                      <span className="flex min-w-0 max-w-[60%]">
                        <StoreBadge storeKey={e?.store_key} storeName={e?.store_name} extraStores={e?.extra_stores} />
                      </span>
                    ))}
                  {/* A fase do funil fica na ficha e no Kanban: com loja, RFV e fase
                      na mesma linha, a 360px os três saíam cortados. */}
                  <RfvBadge segment={e?.rfv_segment} className="min-w-0" />
                </div>

                {!masked && client.whatsapp && (
                  <button
                    type="button"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary transition-colors active:opacity-70"
                    aria-label={`Conversar com ${nome} no WhatsApp`}
                    onClick={() => openWhatsApp(client.whatsapp, whatsappMessage(client.full_name))}
                  >
                    <WhatsAppIcon size={16} />
                  </button>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>
    </TooltipProvider>
  );
}

export default ClientesTableV2;
