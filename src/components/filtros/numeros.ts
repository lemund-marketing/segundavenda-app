/**
 * Leitura de número digitado em pt-BR — compartilhada pelos filtros da casa.
 *
 * Nasceu em `src/components/clients/clientesFilters.ts` e foi movida para cá
 * SEM uma linha de mudança quando o painel dos gatilhos de pedido passou a usar
 * os mesmos campos (contrato `docs/GATILHO_FILTROS.md`, §S4.1). O arquivo de
 * Clientes continua reexportando os três nomes, então nenhum call site antigo
 * precisou ser tocado.
 */

/**
 * Aceita "1.234,56", "1234.56", "10.000" e "1234" — o usuário digita em pt-BR e
 * o payload precisa de número JSON (o banco casa `'^\s*\d+(\.\d+)?\s*$'` sobre
 * o texto).
 */
export function parseNumberInput(raw: string): number | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const limpo = s.replace(/[^\d.,-]/g, "");
  if (!limpo) return null;
  // Vírgula presente: ela é o decimal e o ponto é milhar — o caso fácil.
  // Sem vírgula, o ponto é AMBÍGUO, e o desempate tem de ser pt-BR: é o formato
  // que as colunas de dinheiro desta tela imprimem. Grupos de exatamente três
  // dígitos ("10.000", "1.234.567") são milhar; qualquer outra coisa ("10.5",
  // "1234.56") é decimal. Sem esse desempate, "10.000" virava 10 e o filtro de
  // "gastou dez mil" devolvia a base inteira.
  const milharPtBr = /^-?\d{1,3}(\.\d{3})+$/.test(limpo);
  const normalizado = limpo.includes(",")
    ? limpo.replace(/\./g, "").replace(",", ".")
    : milharPtBr
      ? limpo.replace(/\./g, "")
      : limpo;
  const n = Number(normalizado);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function parseIntFilterInput(raw: string): number | null {
  const n = parseNumberInput(raw);
  if (n === null) return null;
  const i = Math.trunc(n);
  return i >= 0 ? i : null;
}

/**
 * Texto digitado que não vira número.
 *
 * Existe para o sheet poder MARCAR o campo em vez de engolir: contar no badge o
 * que o payload não carrega era a versão local do defeito que este arquivo diz
 * ter evitado ("10 contam no badge sem filtrar nada"). Agora o badge só conta o
 * que filtra — e este predicado é o que avisa o usuário do resto.
 */
export function isNumericInputInvalid(raw: string): boolean {
  return !!String(raw ?? "").trim() && parseNumberInput(raw) === null;
}
