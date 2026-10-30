import { CornerUpLeft, ExternalLink, Phone, Copy } from "lucide-react";

/**
 * Botoes do template aprovado na Meta, desenhados na bolha da conversa.
 *
 * POR QUE ISSO EXISTE:
 * A mensagem enviada NAO guarda os botoes. Medido em producao
 * (ref fvyhjrqzklbfkmpajoyj, remedido na revisao): das 444.573 linhas de
 * `messages` com `template_name` preenchido — todas outbound —, 0 (zero) tem
 * qualquer botao em `metadata`, e so 2 tem a string "button" em
 * `template_params` — ou seja, o banco guarda apenas o
 * texto do corpo ja interpolado. Quem tem a definicao dos botoes e'
 * `whatsapp_templates.components` (jsonb): 653 dos 698 templates APPROVED tem um
 * componente de type "BUTTONS". Por isso a bolha mostrava so o texto: o dado
 * nunca esteve na mensagem, ele precisa ser cruzado com o template por
 * `template_name` + `seller_id`.
 *
 * O cruzamento sai de graca: as duas telas de conversa ja carregam
 * `whatsapp_templates` com `select("*")` filtrado pelo seller ativo e
 * status=APPROVED para o seletor de disparo, entao os `components` ja estao em
 * memoria. Nenhuma query nova foi adicionada.
 *
 * O mapa das telas e' chaveado so pelo nome, e existem 13 pares
 * (seller_id, name) repetidos entre os APPROVED (36 linhas). Conferido um a um na
 * revisao: nos 12 grupos que tem BUTTONS os textos dos botoes sao IDENTICOS entre
 * as linhas homonimas, entao a colisao nao muda o que aparece na tela. Se um dia
 * duas linhas de mesmo nome divergirem nos botoes, o mapa passa a mostrar a
 * ultima e sera' preciso desempatar (por `updated_at`, por exemplo).
 *
 * COBERTURA MEDIDA (444.577 mensagens outbound com template em producao):
 * 408.238 (91,8%) casam com um template APPROVED que tem BUTTONS e vao mostrar
 * os botoes; 26.075 (5,9%) apontam para template que nao esta mais APPROVED
 * (apagado/rejeitado/renomeado na Meta) e 10.264 (2,3%) sao template aprovado
 * sem botao. Nos dois ultimos casos a bolha fica exatamente como era antes —
 * nao inventamos botao que nao da pra provar que existiu.
 *
 * CUIDADO AO REMEDIR: casar so por `template_name`, ignorando o seller, da 93,1%
 * (413.716) e NAO e' a cobertura desta tela. O `templates` em memoria vem
 * filtrado por `seller_id`, entao a conta honesta e' name+seller_id: sao 5.478
 * mensagens cujo nome existe em OUTRO seller e que, aqui, nao mostram botao.
 *
 * ILUSTRATIVO, NAO CLICAVEL:
 * quem clica e' o cliente, no aparelho dele. Nada aqui e' <a> nem <button> e nao
 * existe onClick — sao <div> com cursor-default. Se o atendente clicar, nada
 * acontece, e e' isso mesmo que tem que acontecer.
 *
 * Formato real medido nos 653 templates APPROVED que tem BUTTONS: de 1 a 5
 * botoes por template (130 com 1, 217 com 2, 275 com 3, 24 com 4, 7 com 5) e o
 * texto mais longo tem 31 caracteres — por isso empilha na vertical, como o
 * WhatsApp faz. Sao 1.520 botoes no total, e os tipos que realmente aparecem:
 * QUICK_REPLY (1.357 botoes em 532 templates), URL (152 em 147), PHONE_NUMBER
 * (7 em 7) e COPY_CODE (4 em 4) — a soma por template passa de 653 porque um
 * mesmo template mistura tipos. O COPY_CODE nao estava no pedido mas existe no
 * banco, entao esta tratado para nao cair no generico. Nenhum botao em producao
 * esta sem `text`, mas o extrator descarta os sem texto assim mesmo.
 */

export interface TemplateButton {
  type?: string;
  text?: string;
  url?: string;
  phone_number?: string;
  example?: unknown;
}

/**
 * Extrai os botoes de `whatsapp_templates.components`.
 * Defensivo de proposito: `components` e' jsonb livre, e template velho pode vir
 * com shape inesperado. Qualquer coisa fora do previsto vira lista vazia e a
 * bolha volta a ser exatamente o que era antes.
 */
export function extrairBotoesDoTemplate(components: unknown): TemplateButton[] {
  if (!Array.isArray(components)) return [];

  const componenteBotoes = components.find(
    (c) =>
      c &&
      typeof c === "object" &&
      String((c as { type?: unknown }).type ?? "").toUpperCase() === "BUTTONS"
  ) as { buttons?: unknown } | undefined;

  if (!componenteBotoes || !Array.isArray(componenteBotoes.buttons)) return [];

  return (componenteBotoes.buttons as unknown[]).filter(
    (b): b is TemplateButton =>
      !!b && typeof b === "object" && !!(b as TemplateButton).text
  );
}

/** Icone e tooltip por tipo. O destino da URL/telefone vai no title. */
function detalhesDoBotao(botao: TemplateButton) {
  const tipo = String(botao.type ?? "").toUpperCase();

  switch (tipo) {
    case "URL": {
      // Pedido do dono: destino da URL visivel no tooltip. URL da Meta pode ter
      // sufixo dinamico ({{1}}) — visto em producao em
      // "https://soldiersnutrition.com.br/{{1}}" — entao avisa que varia por cliente.
      if (!botao.url) return { Icone: ExternalLink, title: "Abre um link" };
      const dinamica = botao.url.includes("{{");
      return {
        Icone: ExternalLink,
        title: dinamica
          ? `Abre: ${botao.url} (o trecho {{...}} muda por cliente)`
          : `Abre: ${botao.url}`,
      };
    }
    case "PHONE_NUMBER":
      return {
        Icone: Phone,
        title: botao.phone_number
          ? `Liga para: ${botao.phone_number}`
          : "Liga para um número",
      };
    case "COPY_CODE": {
      // O codigo em si fica em `example[0]` (ex.: ["PEG10"]), nao num campo proprio.
      const codigo = Array.isArray(botao.example) ? botao.example[0] : undefined;
      return {
        Icone: Copy,
        title: codigo ? `Copia o código: ${codigo}` : "Copia um código",
      };
    }
    case "QUICK_REPLY":
      return { Icone: CornerUpLeft, title: "Resposta rápida do cliente" };
    default:
      // Tipo novo da Meta que ainda nao conhecemos: mostra o texto sem inventar icone.
      return { Icone: CornerUpLeft, title: "Botão do template" };
  }
}

interface TemplateButtonsPreviewProps {
  buttons: TemplateButton[];
  /**
   * Margem negativa que anula o padding da bolha, pra linha divisoria atravessar
   * de ponta a ponta. As duas telas tem padding diferente: a pagina
   * /omnichannel usa `p-3` (default abaixo) e o /embed/omnichannel usa
   * `px-4 py-2`, que precisa passar "-mx-4 -mb-2".
   */
  bleedClassName?: string;
}

export function TemplateButtonsPreview({
  buttons,
  bleedClassName = "-mx-3 -mb-3",
}: TemplateButtonsPreviewProps) {
  if (!buttons.length) return null;

  return (
    /* Fundo proprio porque a bolha de saida e' verde saturado (--primary, hue
       154) com texto branco: o azul do WhatsApp em cima do verde fica ilegivel. */
    <div
      className={`${bleedClassName} mt-2 overflow-hidden rounded-b-lg bg-background/95 select-none`}
      /* role="group" e' o que faz o aria-label ser lido: num <div> sem role o
         leitor de tela ignora o rotulo e a faixa entraria muda. */
      role="group"
      aria-label="Botões do template (ilustrativos)"
    >
      {buttons.map((botao, i) => {
        const { Icone, title } = detalhesDoBotao(botao);
        return (
          <div
            key={`${botao.type ?? "btn"}-${i}`}
            title={title}
            /* cursor-default: nao pode parecer clicavel pelo atendente. */
            className="flex items-center justify-center gap-1.5 border-t border-border/60 px-3 py-2 text-sm font-medium text-[#00A5F4] cursor-default dark:text-[#53BDEB]"
          >
            <Icone className="h-3.5 w-3.5 shrink-0" />
            {/* Quebra em vez de cortar: o texto mais longo em producao tem 31
                caracteres ("2, nao gostei sendo sincera(o).", ~217px a 14px) e a
                bolha estreita mais do que isso. Na /omnichannel ela e' max-w-[70%]
                da coluna de conversa, entao numa janela estreita sobram ~208px
                para o texto e um `truncate` comeria o fim do botao sem que o
                atendente tivesse como ler o resto — o title aqui explica o TIPO,
                nao repete o texto. Corte silencioso e' defeito; duas linhas nao. */}
            <span className="min-w-0 text-center [overflow-wrap:anywhere]">{botao.text}</span>
          </div>
        );
      })}
      <p className="border-t border-border/60 px-3 py-1 text-center text-[10px] text-muted-foreground">
        Botões do template — quem clica é o cliente
      </p>
    </div>
  );
}
