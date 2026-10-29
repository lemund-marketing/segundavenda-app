/**
 * Busca nos municípios do IBGE (`municipiosBrasil.ts`) para o filtro
 * "Cidade (incluir)" do gatilho — funções puras, sem a lista: quem carrega a
 * lista (sob demanda) é `useMunicipiosBrasil`.
 */

/**
 * A régua do motor (`normalizeCityName` no seller-webhook): sem acento,
 * minúsculo e espaços colapsados. É por ela que o gatilho compara a cidade do
 * filtro com a do cadastro — "São Paulo", "SAO PAULO" e "Sao Paulo" são a mesma.
 * Hífen e apóstrofo NÃO são ignorados lá, e por isso também não aqui.
 */
export function normalizarNomeCidade(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export interface MunicipioAgrupado {
  /** Nome oficial do IBGE — é o que vai gravado em `cities`. */
  nome: string;
  /**
   * Estados com município desse nome. O filtro casa só pelo nome, então
   * "Bom Jesus" vale para os cinco estados que têm um — a tela mostra quais.
   */
  ufs: string[];
  /** `normalizarNomeCidade(nome)`, guardada para a busca não recalcular. */
  chave: string;
}

/** Um item por nome: os homônimos de estados diferentes viram um só, com as UFs juntas. */
export function agruparMunicipios(
  lista: ReadonlyArray<readonly [nome: string, uf: string]>,
): MunicipioAgrupado[] {
  const porChave = new Map<string, MunicipioAgrupado>();
  for (const [nome, uf] of lista) {
    const chave = normalizarNomeCidade(nome);
    const existente = porChave.get(chave);
    if (existente) {
      if (!existente.ufs.includes(uf)) existente.ufs.push(uf);
    } else {
      porChave.set(chave, { nome, ufs: [uf], chave });
    }
  }
  return [...porChave.values()];
}

/** Abaixo disso a busca não devolve nada: "s" casaria metade do país. */
export const MIN_CARACTERES_BUSCA_MUNICIPIO = 2;

/**
 * Municípios cujo nome contém o termo, sem os que já estão na lista do seller
 * (`jaListadas` traz as chaves normalizadas dela). Quem começa com o termo vem
 * primeiro — "são paulo" acha São Paulo antes de Bom Jesus de São Paulo —, e
 * dentro de cada grupo vale a ordem alfabética da lista.
 */
export function buscarMunicipios(
  grupos: readonly MunicipioAgrupado[],
  termo: string,
  jaListadas: ReadonlySet<string>,
  limite = 50,
): MunicipioAgrupado[] {
  const busca = normalizarNomeCidade(termo);
  if (busca.length < MIN_CARACTERES_BUSCA_MUNICIPIO) return [];
  const comecam: MunicipioAgrupado[] = [];
  const contem: MunicipioAgrupado[] = [];
  for (const g of grupos) {
    if (jaListadas.has(g.chave) || !g.chave.includes(busca)) continue;
    (g.chave.startsWith(busca) ? comecam : contem).push(g);
  }
  return [...comecam, ...contem].slice(0, limite);
}
