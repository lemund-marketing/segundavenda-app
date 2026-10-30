import { Clock, Mail, Smartphone, Sparkles } from "lucide-react";
import { format, isToday, isYesterday, differenceInDays } from "date-fns";

import WhatsAppIcon from "@/components/WhatsAppIcon";
import { RfvBadge } from "@/components/rfv/RfvBadge";
import { ClientAvatar } from "@/components/crm/ClientAvatar";
import { useWindowCountdown, formatRemaining } from "@/hooks/useWindowCountdown";
import { conversationHasWhatsApp } from "@/utils/conversationChannels";
import { contactDisplayName } from "@/utils/formatters";
import { corIntencao, rotuloIntencaoCurto, type OportunidadeIA } from "@/utils/conversionIntent";

interface ConversationCardProps {
  conversation: any;
  isSelected: boolean;
  onClick: () => void;
  /** Tags do cliente ja resolvidas (id -> nome/cor). */
  tags?: { id: string; name: string; color?: string | null }[];
  rfvSegment?: string | null;
  /** Marketplaces onde o cliente ja comprou; so o primeiro vira etiqueta. */
  templateColor?: (name: string) => { bg: string; text: string };
  /** Oportunidade de venda que a IA achou nesta conversa, se houver. */
  opportunity?: OportunidadeIA | null;
  /**
   * "cartao": o card da coluna do computador. "whatsapp": a linha da lista de
   * conversas no desenho do WhatsApp, usada no celular (22/10) dentro do cartão
   * da lista — foto maior, nome e hora em cima, prévia e não lidas embaixo.
   */
  variante?: "cartao" | "whatsapp";
}

/**
 * Carimbo da última mensagem.
 *
 * "Qui." sozinho dizia o dia da semana mas não a data — e a partir de uns dias
 * atrás isso vira adivinhação. Desde 24/08/2026 dia e data andam juntos
 * ("Qui. 21/08"), inclusive no "Ontem". Hoje continua só a hora: a data do dia
 * corrente não acrescenta nada e a hora é o que o operador procura.
 *
 * Custa ~35px na linha do nome, que é truncada — foi por esses mesmos 50px que
 * os selos de canal desceram para a linha de baixo (ver comentário no JSX).
 */
const formatLastMessageDate = (dateStr: string | null | undefined) => {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return "";
  if (isToday(date)) return format(date, "HH:mm");
  const diaEMes = format(date, "dd/MM");
  if (isYesterday(date)) return `Ontem ${diaEMes}`;
  const daysDiff = differenceInDays(new Date(), date);
  if (daysDiff <= 6) {
    const dayNames = ["Dom.", "Seg.", "Ter.", "Qua.", "Qui.", "Sex.", "Sáb."];
    return `${dayNames[date.getDay()]} ${diaEMes}`;
  }
  return diaEMes;
};

/**
 * Item da lista de conversas do Omnichannel.
 *
 * Os selos de canal saem de `has_whatsapp/has_sms/has_email`, nao de
 * `conversations.channel`: aqui a conversa e UNICA por cliente e acumula os tres
 * canais, entao o `channel` so diz qual foi a ultima atividade. Mostrar so ele
 * esconderia que a mesma linha tambem tem SMS — que e justamente o que explica a
 * conversa aparecer em mais de uma pilula de filtro.
 */
export function ConversationCard({
  conversation,
  isSelected,
  onClick,
  tags = [],
  rfvSegment,
  templateColor,
  opportunity,
  variante = "cartao",
}: ConversationCardProps) {
  const conv = conversation;
  const client = conv.clients || {};
  // Contato de WhatsApp sem ficha nomeada: o número identifica melhor que "Sem
  // nome" — mas FORMATADO, senão o card mostra "5511942581027" enquanto a linha
  // de contato logo abaixo mostra o mesmo número pontuado.
  const name = contactDisplayName(
    client.full_name,
    client.whatsapp || conv.whatsapp_contact_id,
    client.email,
  );
  const unread = (conv.unread_count || 0) > 0;

  const temWhatsapp = conversationHasWhatsApp(conv);

  // A janela de 24h e do WhatsApp. Numa conversa que so tem SMS o contador seria
  // uma informacao inventada, entao nem aparece.
  const minutesRemaining = useWindowCountdown(temWhatsapp ? conv.last_inbound_message_at : null);
  const windowOpen = temWhatsapp && !!conv.last_inbound_message_at && minutesRemaining > 0;

  // UMA tag visivel: a coluna tem 320px e sobram ~222px para esta linha, que ja
  // carrega canais, RFV, fase e loja. A segunda etiqueta virava uma fileira nova.
  const tagsVisiveis = tags.slice(0, 1);
  const tagsExtras = tags.length - tagsVisiveis.length;

  if (variante === "whatsapp") {
    // Terceira linha, miúda: o que o WhatsApp não tem e o vendedor precisa —
    // outros canais, oportunidade da IA, janela de 24h, template e etiqueta.
    const temMeta =
      conv.has_sms || conv.has_email || !!opportunity || windowOpen || !!conv.template_tag || tagsVisiveis.length > 0 || !!rfvSegment;
    return (
      <button
        type="button"
        onClick={onClick}
        className={`flex w-full min-w-0 items-center gap-3 px-4 py-3 text-left transition-colors active:bg-muted ${
          isSelected ? "bg-primary/5" : ""
        }`}
      >
        <ClientAvatar name={name} size={50} fontSize={16} className="font-semibold" />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <p className={`min-w-0 flex-1 truncate text-[16px] text-foreground ${unread ? "font-semibold" : "font-medium"}`}>
              {name}
            </p>
            <span className={`shrink-0 text-[12px] tabular-nums ${unread ? "font-medium text-primary" : "text-muted-foreground"}`}>
              {formatLastMessageDate(conv.last_message_at)}
            </span>
          </div>
          <div className="mt-0.5 flex items-center gap-2">
            <p className={`min-w-0 flex-1 truncate text-[14px] ${unread ? "text-foreground" : "text-muted-foreground"}`}>
              {conv.last_message_preview || ""}
            </p>
            {unread && (
              <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold tabular-nums text-primary-foreground">
                {conv.unread_count}
              </span>
            )}
          </div>
          {temMeta && (
            <div className="mt-1 flex items-center gap-2 overflow-hidden text-[11px] text-muted-foreground">
              {conv.has_sms && <Smartphone className="h-3 w-3 shrink-0 text-blue-600" aria-label="Tem SMS" />}
              {conv.has_email && <Mail className="h-3 w-3 shrink-0 text-purple-600" aria-label="Tem e-mail" />}
              {opportunity && (
                <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-px font-semibold ${corIntencao(opportunity.tipo)}`}>
                  <Sparkles className="h-3 w-3 shrink-0" />
                  {rotuloIntencaoCurto(opportunity.tipo)}
                </span>
              )}
              {windowOpen && (
                <span className="inline-flex shrink-0 items-center gap-1 text-emerald-600" title="Tempo restante da janela de 24h do WhatsApp">
                  <Clock className="h-3 w-3" />
                  {formatRemaining(minutesRemaining)}
                </span>
              )}
              <RfvBadge segment={rfvSegment} variant="dot" />
              {conv.template_tag && (
                <span
                  className="max-w-[120px] shrink-0 truncate font-medium"
                  style={templateColor ? { color: templateColor(conv.template_tag).bg } : undefined}
                  title={`Template: ${conv.template_tag}`}
                >
                  {conv.template_tag}
                </span>
              )}
              {tagsVisiveis.map((tag) => (
                <span key={tag.id} className="max-w-[110px] shrink-0 truncate font-medium" style={{ color: tag.color || "#6366f1" }} title={tag.name}>
                  #{tag.name}
                </span>
              ))}
            </div>
          )}
        </div>
      </button>
    );
  }

  return (
    /* Sombra por utilitario do Tailwind (`shadow-sm`/`hover:shadow-hover`), NAO por
       `[box-shadow:...]` arbitrario: o ring tambem pinta via box-shadow, e a
       propriedade arbitraria sobrescrevia as duas classes de ring — selecionado e
       nao selecionado saiam com a mesma sombra e nenhum anel. Os utilitarios
       compoem (`--tw-ring-shadow` + `--tw-shadow` na mesma declaracao). */
    <button
      type="button"
      onClick={onClick}
      className={`relative w-full min-w-0 max-w-full text-left rounded-lg p-3 border-0 overflow-hidden transition-all duration-200 ease-out shadow-sm hover:shadow-hover hover:-translate-y-0.5 ${
        /* Verde bem lavado: cada cartao aqui e uma ilha `bg-card` sobre `bg-background`,
           entao o selecionado ja se destaca por PERDER a superficie branca. O `dark:` e
           explicito porque o mesmo alpha sobre fundo acromatico rende ~30% mais croma:
           e no escuro que "verde forte demais" e literal.
           O preenchimento sozinho da ~1,1:1 contra o cartao vizinho — invisivel. Quem
           diz "esta aberta" e a barra da esquerda; o fundo e o anel so acompanham. */
        isSelected
          ? "bg-primary/[0.07] dark:bg-primary/[0.09] ring-1 ring-primary/25 dark:ring-primary/30"
          : "bg-card ring-1 ring-transparent dark:ring-white/10 hover:bg-muted/50 dark:hover:bg-muted/40"
      }`}
    >
      {isSelected && (
        <span
          aria-hidden
          className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full bg-primary"
        />
      )}
      <div className="flex items-start gap-2.5">
        <ClientAvatar name={name} size={40} fontSize={13} className="font-semibold" />

        <div className="flex-1 min-w-0">
          {/* Linha 1: nome + horario + nao lidas. Os selos de canal ficam na linha
              de baixo: com eles aqui, um nome comprido perdia 50px e virava
              "Maria Apa...". */}
          <div className="flex items-center gap-2 mb-1">
            <p className={`text-sm truncate min-w-0 flex-1 ${unread ? "font-semibold text-foreground" : "font-medium text-foreground"}`}>
              {name}
            </p>
            <span
              className={`text-[11px] tabular-nums shrink-0 ${unread ? "text-primary font-medium" : "text-muted-foreground"}`}
            >
              {formatLastMessageDate(conv.last_message_at)}
            </span>
            {unread && (
              <span className="rounded-full bg-primary text-primary-foreground text-[11px] font-semibold px-2 py-0.5 tabular-nums shrink-0">
                {conv.unread_count}
              </span>
            )}
          </div>

          {/* Linha 2: canais presentes + etiquetas + janela */}
          <div className="flex items-center gap-1.5 flex-wrap mb-1 empty:hidden">
            <span className="flex items-center gap-1 shrink-0" title="Canais que esta conversa tem">
              {temWhatsapp && <WhatsAppIcon size={13} className="text-emerald-600 dark:text-emerald-400" />}
              {conv.has_sms && <Smartphone className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />}
              {conv.has_email && <Mail className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400" />}
            </span>
            {/* Oportunidade primeiro na fila de etiquetas: é o único selo aqui que
                pede uma AÇÃO do vendedor, e a linha corta o excedente à direita. */}
            {opportunity && (
              <span
                className={`inline-flex items-center gap-1 shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${corIntencao(opportunity.tipo)}`}
                title={opportunity.resumo || "A IA detectou intenção de nova compra nesta conversa"}
              >
                <Sparkles className="h-3 w-3 shrink-0" />
                {rotuloIntencaoCurto(opportunity.tipo)}
              </span>
            )}
            {/* `dot`: a pilula inteira do RFV ocupa ate 160px dos ~222px da linha. */}
            <RfvBadge segment={rfvSegment} variant="dot" />
            {/* Fase do Kanban e marketplace SAIRAM daqui (21/08): tres selos
                coloridos disputando ~222px viravam ruido, e nenhum dos dois muda
                a decisao de abrir ou nao a conversa. A fase continua visivel no
                painel do cliente, e o marketplace na ficha do pedido. O selo do
                TEMPLATE fica — e o que diz por que a conversa existe. */}
            {tagsVisiveis.map((tag) => (
              <span
                key={tag.id}
                className="inline-flex items-center gap-1 max-w-[110px] rounded-full border px-2 py-0.5 text-[10px] font-medium"
                style={{
                  color: tag.color || "#6366f1",
                  borderColor: `${tag.color || "#6366f1"}55`,
                  background: `${tag.color || "#6366f1"}14`,
                }}
                title={tag.name}
              >
                <span className="truncate">{tag.name}</span>
              </span>
            ))}
            {tagsExtras > 0 && (
              <span className="text-[10px] text-muted-foreground tabular-nums">+{tagsExtras}</span>
            )}
            {windowOpen && (
              <span
                className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-600 dark:text-emerald-400"
                title="Tempo restante da janela de 24h do WhatsApp"
              >
                <Clock className="h-3 w-3" />
                {formatRemaining(minutesRemaining)} restantes
              </span>
            )}
          </div>

          {/* Linha 3: previa da ultima mensagem — e o que o atendente le para decidir
              se abre a conversa. O selo do template mora aqui (e nao na linha 2, onde
              custava ate 130px dos ~222px disponiveis e empurrava tudo para baixo). */}
          <div className="flex items-center justify-between gap-2 min-w-0">
            <p
              className={`text-xs truncate flex-1 min-w-0 ${unread ? "text-foreground font-medium" : "text-muted-foreground"}`}
            >
              {conv.last_message_preview || ""}
            </p>
            {conv.template_tag && (
              <span
                className="inline-block shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium max-w-[110px] truncate border"
                style={
                  templateColor
                    ? {
                        backgroundColor: `${templateColor(conv.template_tag).bg}22`,
                        color: templateColor(conv.template_tag).bg,
                        borderColor: `${templateColor(conv.template_tag).bg}55`,
                      }
                    : undefined
                }
                title={`Template: ${conv.template_tag}`}
              >
                {conv.template_tag}
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

export default ConversationCard;
