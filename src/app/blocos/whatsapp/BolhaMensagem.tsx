import { memo } from "react";
import { format, isToday, isYesterday } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Check, Mail, Smartphone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { MessageMediaContent } from "@/components/omnichannel/MessageMediaContent";
import { TemplateButtonsPreview, type TemplateButton } from "@/components/omnichannel/TemplateButtonsPreview";
import { textoDaMensagem } from "@/components/omnichannel/templateCorpo";
import type { Mensagem } from "@/app/dados/useMensagens";

/**
 * Uma mensagem da thread no desenho de celular do site (22/10): a mecânica do
 * WhatsApp com a cara do Segunda Venda. Mensagens seguidas do mesmo lado ficam
 * coladas e só a primeira tem o canto de cima mais fechado; a hora mora dentro
 * da bolha, na última linha do texto. A enviada leva o degradê verde do logo;
 * lido é o roxo da marca. A thread mistura WhatsApp, SMS e e-mail, então cada
 * bolha diz por onde saiu.
 */
function Bolha({
  message,
  prevMessage,
  botoesPorTemplate,
  componentsPorTemplate,
  sellerId,
}: {
  message: Mensagem;
  /** A anterior na lista JÁ recortada por canal (separador de dia e agrupamento). */
  prevMessage: Mensagem | null;
  botoesPorTemplate: Map<string, TemplateButton[]>;
  componentsPorTemplate: Map<string, unknown>;
  sellerId: string | null;
}) {
  const msgDate = new Date(message.created_at);
  const textoBolha = message._sms || message._email ? message.content : textoDaMensagem(message, componentsPorTemplate);
  const prevDate = prevMessage ? new Date(prevMessage.created_at) : null;
  const showDateSeparator = !prevDate || format(msgDate, "yyyy-MM-dd") !== format(prevDate, "yyyy-MM-dd");

  let dateSeparatorLabel = "";
  if (showDateSeparator) {
    if (isToday(msgDate)) dateSeparatorLabel = "Hoje";
    else if (isYesterday(msgDate)) dateSeparatorLabel = "Ontem";
    else dateSeparatorLabel = format(msgDate, "dd 'de' MMMM 'de' yyyy", { locale: ptBR });
  }

  const saida = message.direction === "outbound";
  const primeiraDoGrupo = showDateSeparator || !prevMessage || prevMessage.direction !== message.direction;
  const temBotoesTemplate =
    !message._sms && !message._email && saida && !!message.template_name &&
    (botoesPorTemplate.get(message.template_name) ?? []).length > 0;
  const horaNaLinha =
    !!textoBolha && textoBolha.trim() !== "" && !temBotoesTemplate && !(message._sms && message.cost_cents != null);
  const corTique = "text-[#6B7C72] dark:text-[#8FA39A]";
  const corLido = "text-secondary";

  return (
    <div className={primeiraDoGrupo ? "mt-2" : "mt-0.5"}>
      {showDateSeparator && (
        <div className="my-3 flex items-center justify-center">
          <span className="rounded-full border border-border/60 bg-card/95 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground shadow-sm">
            {dateSeparatorLabel}
          </span>
        </div>
      )}
      <div className={`flex ${saida ? "justify-end" : "justify-start"}`}>
        <div
          className={`relative max-w-[82%] [overflow-wrap:anywhere] rounded-[18px] px-3 pb-2 pt-2 text-[15px] leading-[1.35] shadow-[0_1px_2px_rgba(16,24,20,0.08)] ${
            saida
              ? "bg-gradient-to-br from-[#E2F6EC] to-[#DAF1EE] text-[#10231A] dark:from-[#0E3F2C] dark:to-[#0E3A38] dark:text-[#E7F2EC]"
              : "bg-card text-foreground"
          } ${primeiraDoGrupo ? (saida ? "rounded-tr-[6px]" : "rounded-tl-[6px]") : ""}`}
        >
          {message.content_type === "button" && (
            <div className="mb-1 flex items-center gap-2">
              <span className="text-lg">📱</span>
              <Badge variant="outline" className="text-xs">Resposta Rápida</Badge>
            </div>
          )}

          {message.media_url && sellerId && (
            <MessageMediaContent
              mediaUrl={message.media_url}
              mediaMimeType={message.media_mime_type}
              contentType={message.content_type}
              sellerId={sellerId}
              direction={message.direction}
            />
          )}

          {message._sms && (
            <p className="mb-1 flex items-center gap-1 text-[11px] font-semibold opacity-80">
              <Smartphone className="h-3 w-3 shrink-0" /> SMS
            </p>
          )}

          {message._email && (
            <p className="mb-1 flex items-center gap-1 text-xs font-semibold opacity-90">
              <Mail className="h-3 w-3 shrink-0" /> {message.subject || "E-mail"}
            </p>
          )}

          {textoBolha && textoBolha.trim() !== "" && (
            <p className="whitespace-pre-wrap break-words">
              {textoBolha}
              {/* Reserva o lugar da hora na última linha; a hora em si fica por
                  cima, no canto da bolha. */}
              {horaNaLinha && <span aria-hidden className={`inline-block align-bottom ${saida ? "w-[60px]" : "w-[42px]"}`} />}
            </p>
          )}

          {message.content_type === "reaction" && <p className="text-2xl">{message.content || "👍"}</p>}

          {!message.media_url && (!message.content || message.content.trim() === "") && message.content_type !== "reaction" && (
            <p className="whitespace-pre-wrap text-sm italic opacity-70">[Sem conteúdo]</p>
          )}

          <div className={horaNaLinha ? "absolute bottom-1.5 right-3 flex items-center gap-1" : "mt-1 flex items-center justify-end gap-1"}>
            <p className="text-[11px] text-[#6B7C72] dark:text-[#8FA39A]">{format(msgDate, "HH:mm")}</p>
            {message._sms && message.cost_cents != null && (
              <span className="text-[10px] tabular-nums opacity-70">
                · {message.segments}seg · R$ {((message.cost_cents || 0) / 100).toFixed(2).replace(".", ",")}
              </span>
            )}
            {saida && (
              <div className="flex items-center">
                {message.status === "read" ? (
                  <div className="flex -space-x-1">
                    <Check className={`h-3.5 w-3.5 ${corLido}`} />
                    <Check className={`h-3.5 w-3.5 ${corLido}`} />
                  </div>
                ) : message.status === "delivered" || message.delivered_at ? (
                  <div className="flex -space-x-1">
                    <Check className={`h-3.5 w-3.5 ${corTique}`} />
                    <Check className={`h-3.5 w-3.5 ${corTique}`} />
                  </div>
                ) : message.status === "sent" ? (
                  <Check className={`h-3.5 w-3.5 ${corTique}`} />
                ) : message.status === "failed" ? (
                  <span className="text-xs text-muted-foreground" title={message.failed_reason || "Não entregue"}>✕</span>
                ) : (
                  <span className="text-xs opacity-50">🕐</span>
                )}
              </div>
            )}
          </div>

          {/* Botões do template (ilustrativos): só na enviada e só quando o
              template aprovado na Meta tem BUTTONS. SMS e e-mail ficam de fora
              porque o `template_name` deles é de outro catálogo. */}
          {!message._sms && !message._email && saida && message.template_name && (
            <TemplateButtonsPreview buttons={botoesPorTemplate.get(message.template_name) ?? []} />
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Com memo: o texto que se digita é estado da tela da conversa, e sem isto
 * cada tecla redesenhava todas as bolhas (143 ms por letra numa conversa de 800
 * mensagens, com a CPU a 4x). As props são estáveis: a mensagem só vira outro
 * objeto quando muda, e os mapas de template são useMemo.
 */
export const BolhaMensagem = memo(Bolha);
