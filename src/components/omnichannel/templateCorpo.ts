/**
 * Texto do template como o cliente recebeu: o HEADER de texto (se houver) e o
 * BODY, com as variáveis trocadas pelos valores que foram enviados.
 *
 * POR QUE ISSO EXISTE:
 * o envio manual pelo chat gravava só `[Template: nome]` em `messages.content`.
 * O cliente recebia a mensagem inteira, mas a conversa mostrava só o nome, e o
 * atendente achava que "foi só o título". Medido em 06/10/2026: 670 mensagens de
 * atendente assim, em 46 sellers, desde 18/12/2025, e mais 50 da automação
 * quando o template não estava sincronizado na hora do envio. O motor
 * (`process-workflow-queue`) já renderizava o BODY; esta função faz a mesma
 * conta no front, para o envio manual e para exibir as mensagens antigas.
 *
 * `params` é o `template_params` no formato da Meta, o mesmo que vai no envio e
 * fica gravado na mensagem:
 *   [{ type: "body", parameters: [{ type: "text", text: "Carlos" }, ...] }]
 * `{{1}}` pega o 1º parâmetro do componente, e `{{nome}}` pega o que tem
 * `parameter_name: "nome"`. Variável sem valor fica como está (`{{2}}`), para
 * não inventar texto que não foi enviado.
 *
 * Devolve null quando o template não tem BODY de texto. Quem chama decide o que
 * mostrar no lugar.
 */

type Componente = { type?: string; format?: string; text?: string };
type Parametro = { type?: string; text?: string; parameter_name?: string };
type ComponenteEnviado = { type?: string; parameters?: Parametro[] };

function preencher(texto: string, parametros: Parametro[]): string {
  return texto.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (inteiro, chaveBruta: string) => {
    const chave = String(chaveBruta).trim();
    if (/^\d+$/.test(chave)) {
      const valor = parametros[Number(chave) - 1]?.text;
      return typeof valor === "string" ? valor : inteiro;
    }
    const nomeado = parametros.find((p) => p?.parameter_name === chave)?.text;
    return typeof nomeado === "string" ? nomeado : inteiro;
  });
}

function parametrosDo(params: unknown, tipo: "body" | "header"): Parametro[] {
  if (!Array.isArray(params)) return [];
  const comp = (params as ComponenteEnviado[]).find(
    (c) => String(c?.type || "").toLowerCase() === tipo,
  );
  return Array.isArray(comp?.parameters) ? comp!.parameters! : [];
}

export function renderizarTemplate(components: unknown, params: unknown): string | null {
  if (!Array.isArray(components)) return null;
  const lista = components as Componente[];
  const corpo = lista.find((c) => String(c?.type || "").toUpperCase() === "BODY");
  if (!corpo?.text) return null;

  const texto = preencher(corpo.text, parametrosDo(params, "body"));
  const cabecalho = lista.find(
    (c) =>
      String(c?.type || "").toUpperCase() === "HEADER" &&
      String(c?.format || "TEXT").toUpperCase() === "TEXT" &&
      c?.text,
  );
  if (!cabecalho?.text) return texto;
  return `${preencher(cabecalho.text, parametrosDo(params, "header"))}\n\n${texto}`;
}

/** `[Template: nome]` (ou `[Template]`) gravado no lugar do texto. */
export function ehMarcadorDeTemplate(conteudo: unknown): boolean {
  return typeof conteudo === "string" && /^\[Template(: [^\]]*)?\]$/.test(conteudo.trim());
}

/**
 * O que a bolha deve mostrar. Para mensagem gravada só com o marcador, renderiza
 * pelo template aprovado do seller (`componentsPorNome`, já em memória nas telas
 * de conversa). Se o template não está mais aprovado, mantém o marcador, que ao
 * menos diz o nome.
 */
export function textoDaMensagem(
  message: { content?: string | null; template_name?: string | null; template_params?: unknown },
  componentsPorNome: Map<string, unknown>,
): string | null | undefined {
  if (!message.template_name || !ehMarcadorDeTemplate(message.content)) return message.content;
  const components = componentsPorNome.get(message.template_name);
  return renderizarTemplate(components, message.template_params) ?? message.content;
}
