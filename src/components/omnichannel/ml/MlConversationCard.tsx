import type { CSSProperties } from "react";
import { Lock } from "lucide-react";
import { differenceInDays, format, isToday, isYesterday } from "date-fns";

import { MercadoLivreSelo } from "./MercadoLivreSelo";
import { ML_TINTA, mlAguardandoNaoVista, tituloMl, type MlConversa } from "./mlTipos";

interface MlConversationCardProps {
  conversa: MlConversa;
  isSelected: boolean;
  onClick: () => void;
}

/**
 * Carimbo da última mensagem — cópia de `formatLastMessageDate` do
 * ConversationCard (lá é local e o card do WhatsApp não muda por causa do ML).
 * Hoje só a hora; ontem e a semana com dia e data; depois só a data.
 */
const formatarQuando = (iso: string | null | undefined) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  if (isToday(d)) return format(d, "HH:mm");
  const diaEMes = format(d, "dd/MM");
  if (isYesterday(d)) return `Ontem ${diaEMes}`;
  if (differenceInDays(new Date(), d) <= 6) {
    const dias = ["Dom.", "Seg.", "Ter.", "Qua.", "Qui.", "Sex.", "Sáb."];
    return `${dias[d.getDay()]} ${diaEMes}`;
  }
  return diaEMes;
};

/**
 * Card de uma conversa pós-venda do Mercado Livre na lista da aba WhatsApp.
 *
 * Mesma caixa do ConversationCard (p-3, avatar de 40px, três linhas de texto),
 * para a lista misturada não ficar serrilhada; o que muda é a superfície
 * amarelada e o selo do ML no lugar das iniciais.
 *
 * O amarelo vai como TINTA de fundo (12% no claro, 9% no escuro): cheio, ele
 * ofuscava a lista e brigava com o texto. A barra verde da esquerda continua
 * sendo o "está aberta" de qualquer card — o fundo só fica mais denso.
 */
export function MlConversationCard({ conversa, isSelected, onClick }: MlConversationCardProps) {
  const c = conversa;
  const nome = tituloMl(c);
  const aguardando = mlAguardandoNaoVista(c);
  const bloqueada = c.status === "blocked";
  const pedido = c.pedido_ml || c.pack_id;
  // Nome real do comprador na linha 1 → o pedido desce para a linha 2; sem nome,
  // o pedido JÁ é o título e não se repete.
  const mostrarPedidoNaLinha2 = !!(c.comprador_nome || "").trim() && !!pedido;

  const tinta = {
    "--ml-tinta": ML_TINTA.light,
    "--ml-tinta-dark": ML_TINTA.dark,
  } as CSSProperties;

  return (
    <button
      type="button"
      onClick={onClick}
      style={tinta}
      className={`relative w-full min-w-0 max-w-full text-left rounded-lg p-3 border-0 overflow-hidden transition-all duration-200 ease-out shadow-sm hover:shadow-hover hover:-translate-y-0.5 ring-1 ${
        isSelected
          ? "bg-[rgba(255,230,0,0.22)] dark:bg-[rgba(255,230,0,0.14)] ring-primary/30 dark:ring-primary/40"
          : "bg-[rgba(255,230,0,0.12)] dark:bg-[rgba(255,230,0,0.09)] ring-[rgba(196,170,0,0.45)] dark:ring-[rgba(255,230,0,0.22)] hover:bg-[rgba(255,230,0,0.18)] dark:hover:bg-[rgba(255,230,0,0.13)]"
      }`}
      aria-label={`Conversa do Mercado Livre: ${nome}`}
    >
      {isSelected && (
        <span aria-hidden className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full bg-primary" />
      )}
      <div className="flex items-start gap-2.5">
        <MercadoLivreSelo tamanho="md" />

        <div className="flex-1 min-w-0">
          {/* Linha 1: comprador (ou pedido) + horário + bolinha de "esperando você". */}
          <div className="flex items-center gap-2 mb-1">
            <p
              className={`text-sm truncate min-w-0 flex-1 text-foreground ${aguardando ? "font-semibold" : "font-medium"}`}
            >
              {nome}
            </p>
            <span
              className={`text-[11px] tabular-nums shrink-0 ${aguardando ? "text-primary font-medium" : "text-muted-foreground"}`}
            >
              {formatarQuando(c.ultima_mensagem_em)}
            </span>
            {aguardando && (
              <span
                className="h-2.5 w-2.5 rounded-full bg-primary shrink-0"
                title="O comprador escreveu e ninguém abriu a conversa desde então"
              />
            )}
          </div>

          {/* Linha 2: canal + estado + pedido/produto. Pílulas de 14px (py-px +
              leading-none), a mesma altura dos ícones de canal da linha 2 do
              WhatsApp: com py-0.5 o card do ML ficava 7px mais alto e a lista
              misturada serrilhava. */}
          <div className="flex items-center gap-1.5 min-w-0 mb-1">
            {bloqueada ? (
              /* red-700/red-300 e não `text-destructive`: o vermelho do tema
                 dá 3,2:1 sobre o card amarelado; estes passam de 5,9:1. */
              <span
                className="inline-flex items-center gap-1 shrink-0 rounded-full border border-red-300 bg-red-50 px-2 py-px text-[10px] leading-none font-semibold text-red-700 dark:border-red-500/40 dark:bg-red-500/15 dark:text-red-300"
                title="O Mercado Livre bloqueou as respostas nesta conversa"
              >
                <Lock className="h-2.5 w-2.5 shrink-0" />
                Bloqueada
              </span>
            ) : (
              <span
                className="inline-flex items-center shrink-0 rounded-full border border-[rgba(196,170,0,0.45)] dark:border-[rgba(255,230,0,0.3)] bg-[rgba(255,230,0,0.14)] px-2 py-px text-[10px] leading-none font-semibold text-[color:var(--ml-tinta)] dark:text-[color:var(--ml-tinta-dark)]"
                title="Conversa pós-venda do Mercado Livre"
              >
                Mercado Livre
              </span>
            )}
            <span className="text-[11px] leading-[14px] text-muted-foreground truncate min-w-0" title={c.produto_titulo || undefined}>
              {mostrarPedidoNaLinha2 ? `#${pedido}` : ""}
              {mostrarPedidoNaLinha2 && c.produto_titulo ? " · " : ""}
              {c.produto_titulo || ""}
            </span>
          </div>

          {/* Linha 3: prévia — sem ela (texto expirado, só anexo) cai para a contagem. */}
          <p
            className={`text-xs truncate min-w-0 ${aguardando ? "text-foreground font-medium" : "text-muted-foreground"}`}
          >
            {c.previa
              ? `${c.ultima_direcao === "outbound" ? "Você: " : ""}${c.previa}`
              : c.qtd_mensagens > 0
                ? `${c.qtd_mensagens} mensage${c.qtd_mensagens === 1 ? "m" : "ns"}`
                : ""}
          </p>
        </div>
      </div>
    </button>
  );
}

export default MlConversationCard;
