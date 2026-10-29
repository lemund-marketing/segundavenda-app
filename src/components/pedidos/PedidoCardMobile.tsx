import { Mail, Truck } from "lucide-react";

import WhatsAppIcon from "@/components/WhatsAppIcon";
import { StoreBadge } from "@/components/clients/StoreBadge";
import { avatarToneFor, getInitials } from "@/components/clients/sections/shared";
import { statusLabel } from "@/components/pedidos/statusPedido";
import { SHORT_FMT, TIME_FMT, isSameDayAsToday, statusToneClass } from "./orderRowShared";
import { formatCurrency } from "@/utils/formatters";
import { cn } from "@/lib/utils";

export interface PedidoCardMobileProps {
  nome: string;
  total: number;
  /** Dica do valor quando ele é a soma de um grupo ("Soma dos 3 pedidos"). */
  totalTitle?: string;
  produto: string;
  data: Date | null;
  /** "Cidade — UF"; vazio some. */
  local?: string | null;
  /** Slug de `orders.marketplace`; ausente = sem selo de loja. */
  marketplace?: string | null;
  storeName?: string | null;
  /** Status do pedido; ausente = sem selo de status. */
  status?: string | null;
  /** Toque na área de informação (a ficha do cliente). */
  onAbrir?: () => void;
  /** Atalho do WhatsApp; `contatado` apaga o círculo, como na tabela. */
  whatsapp?: { contatado: boolean; onClick: () => void } | null;
  onEmail?: (() => void) | null;
  onEntrega?: (() => void) | null;
}

/**
 * O card de pedido do celular (22/10/2026): avatar, nome e valor na primeira
 * linha; produto e quando na segunda; loja, status, local e os atalhos na
 * terceira — os atalhos em círculo verde a 10%, como o resto do app.
 *
 * Uma peça só para a lista da aba Pedidos e para os "Últimos pedidos" do
 * Dashboard, que pediu o mesmo desenho (23/10). Devolve o miolo sem moldura:
 * quem usa dá o espaçamento e a divisória (um `motion.div` na lista, um `<li>`
 * na seção do Dashboard).
 */
export function PedidoCardMobile({
  nome, total, totalTitle, produto, data, local, marketplace, storeName, status,
  onAbrir, whatsapp, onEmail, onEntrega,
}: PedidoCardMobileProps) {
  const today = data ? isSameDayAsToday(data) : false;
  const tone = avatarToneFor(nome);
  const quando = data ? (today ? `hoje, ${TIME_FMT.format(data)}` : SHORT_FMT.format(data).replace(",", "")) : "—";
  const atalho = "flex h-8 w-8 items-center justify-center rounded-full transition-colors active:opacity-70";

  return (
    <>
      {/* Botão dentro de botão é HTML inválido: só a área de informação
          abre a ficha; os atalhos ficam de fora. */}
      <button type="button" onClick={onAbrir} className="flex w-full min-w-0 items-start gap-3 text-left">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[13px] font-bold"
          style={{ background: tone.bg, color: tone.fg }}
        >
          {getInitials(nome)}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <p className="truncate text-[15px] font-medium text-foreground">{nome}</p>
            <span className="shrink-0 text-[15px] font-semibold tabular-nums text-foreground" title={totalTitle}>
              {formatCurrency(total)}
            </span>
          </div>
          <div className="mt-0.5 flex items-baseline justify-between gap-3">
            <p className="truncate text-[13px] text-muted-foreground">{produto}</p>
            <span className={cn("shrink-0 text-[12px] tabular-nums", today ? "font-semibold text-primary" : "text-muted-foreground")}>
              {quando}
            </span>
          </div>
        </div>
      </button>

      <div className="mt-2 flex items-center gap-2 pl-[52px]">
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          {marketplace !== undefined && <StoreBadge storeKey={marketplace ?? null} storeName={storeName ?? null} />}
          {status && (
            <span
              className={cn(
                "inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                statusToneClass(status),
              )}
            >
              {statusLabel(status)}
            </span>
          )}
          {local && <span className="truncate text-[12px] text-muted-foreground">{local}</span>}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {whatsapp && (
            <button
              type="button"
              className={cn(atalho, whatsapp.contatado ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary")}
              aria-label={`Abrir WhatsApp de ${nome}`}
              onClick={whatsapp.onClick}
            >
              <WhatsAppIcon className="h-4 w-4" />
            </button>
          )}
          {onEmail && (
            <button
              type="button"
              className={cn(atalho, "bg-muted text-muted-foreground")}
              aria-label={`Enviar e-mail para ${nome}`}
              onClick={onEmail}
            >
              <Mail className="h-4 w-4" />
            </button>
          )}
          {onEntrega && (
            <button
              type="button"
              className={cn(atalho, "bg-muted text-muted-foreground")}
              aria-label="Ver status de entrega"
              onClick={onEntrega}
            >
              <Truck className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </>
  );
}
