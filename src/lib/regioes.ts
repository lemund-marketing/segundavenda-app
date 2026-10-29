/**
 * Regiões do IBGE — a MESMA régua da aba Regiões e do dashboard.
 *
 * Espelho em TypeScript de `public.dash_regiao` (SQL, migration
 * `20260806140000_dashboard_v2_e_regioes.sql`) e da cópia Deno em
 * `supabase/functions/_shared/regioes.ts`. É a mesma tabela três vezes por
 * falta de um lugar que as três linguagens leiam — mudou uma, muda as outras.
 * O mapa da aba Regiões (`components/regioes/brazilStatePaths.ts`) carrega a
 * mesma atribuição por estado, colada na geometria; esta aqui é a versão sem
 * desenho, para filtro e variável de fluxo.
 *
 * Chaves internas (payload do filtro, config de gatilho): `norte`, `nordeste`,
 * `centro_oeste`, `sudeste`, `sul` e `sem_regiao` (estado nulo/vazio/inválido,
 * o caso em que `dash_uf` devolve null). Os rótulos são os que o dashboard já
 * imprime.
 *
 * "Mesma tabela" é só a TABELA (27 UFs → 5 regiões, chaves, rótulos, ordem).
 * A cópia Deno (`_shared/regioes.ts`) diverge de propósito no resto: lá
 * `sem_regiao` é a 6ª entrada da lista e "sem UF" devolve 'sem_regiao'/""
 * (aqui: constante à parte e null); lá aceita nome por extenso e colapsa
 * espaço repetido (aqui só sigla; `dash_uf` aceita nome mas não colapsa).
 * Ao mexer na tabela, refaça a prova cruzada `integ/cruzado.ts` do integrador
 * (`deno run --allow-read`), que confere as 27 UFs nas duas cópias contra o
 * `dash_regiao` vivo e as bordas acima.
 */

export type RegiaoChave = "norte" | "nordeste" | "centro_oeste" | "sudeste" | "sul";

/** A chave sentinela do filtro: cliente sem UF válida. Nunca é região de UF. */
export const SEM_REGIAO = "sem_regiao" as const;

export type RegiaoFiltroChave = RegiaoChave | typeof SEM_REGIAO;

export interface RegiaoDef {
  chave: RegiaoChave;
  rotulo: string;
  ufs: readonly string[];
}

/** As 5 regiões na ordem fixa do dashboard (Norte → Sul). */
export const REGIOES: readonly RegiaoDef[] = [
  { chave: "norte", rotulo: "Norte", ufs: ["AC", "AM", "AP", "PA", "RO", "RR", "TO"] },
  {
    chave: "nordeste",
    rotulo: "Nordeste",
    ufs: ["AL", "BA", "CE", "MA", "PB", "PE", "PI", "RN", "SE"],
  },
  { chave: "centro_oeste", rotulo: "Centro-Oeste", ufs: ["DF", "GO", "MS", "MT"] },
  { chave: "sudeste", rotulo: "Sudeste", ufs: ["ES", "MG", "RJ", "SP"] },
  { chave: "sul", rotulo: "Sul", ufs: ["PR", "RS", "SC"] },
];

export const ROTULO_SEM_REGIAO = "Sem região informada";

/**
 * As 6 opções do filtro, na ordem em que os chips aparecem: as 5 regiões e
 * "Sem região informada" por último — a mesma ordem que a faceta `regions` de
 * `get_clientes_facetas` devolve.
 */
export const REGIAO_FILTRO_OPTIONS: readonly { value: RegiaoFiltroChave; label: string }[] = [
  ...REGIOES.map((r) => ({ value: r.chave, label: r.rotulo })),
  { value: SEM_REGIAO, label: ROTULO_SEM_REGIAO },
];

/** UF → região. DERIVADO de `REGIOES`; nunca editar à mão. */
export const REGIAO_POR_UF: Readonly<Record<string, RegiaoDef>> = Object.fromEntries(
  REGIOES.flatMap((r) => r.ufs.map((uf) => [uf, r] as const)),
);

const ROTULO_POR_CHAVE: Readonly<Record<string, string>> = Object.fromEntries(
  REGIAO_FILTRO_OPTIONS.map((o) => [o.value, o.label]),
);

/**
 * Sigla normalizada ("sp", " SP " → "SP"), ou null.
 *
 * Só a SIGLA: nome por extenso ("São Paulo") é trabalho de `dash_uf` no SQL,
 * que tem a tabela dos 27 nomes com e sem acento. `clients.state_code` guarda
 * sigla em quase toda a base; o que não for sigla de dois caracteres cai no
 * mesmo null que `dash_uf` devolve.
 */
const siglaUf = (uf: string | null | undefined): string | null => {
  const s = String(uf ?? "").trim().toUpperCase();
  return s.length === 2 ? s : null;
};

export function isRegiaoChave(v: unknown): v is RegiaoChave {
  return typeof v === "string" && REGIOES.some((r) => r.chave === v);
}

export function isRegiaoFiltroChave(v: unknown): v is RegiaoFiltroChave {
  return v === SEM_REGIAO || isRegiaoChave(v);
}

/** Chave da região da UF (`"SP"` → `"sudeste"`), ou null se a UF não é válida. */
export function chaveRegiaoDaUf(uf: string | null | undefined): RegiaoChave | null {
  const s = siglaUf(uf);
  return s ? (REGIAO_POR_UF[s]?.chave ?? null) : null;
}

/**
 * Rótulo da região da UF (`"SP"` → `"Sudeste"`), ou null — o MESMO contrato de
 * `dash_regiao(dash_uf(state_code))`: é o que a variável `{regiao}` do fluxo
 * imprime e o que a aba Regiões mostra.
 */
export function regiaoDaUf(uf: string | null | undefined): string | null {
  const chave = chaveRegiaoDaUf(uf);
  return chave ? ROTULO_POR_CHAVE[chave] : null;
}

/**
 * Rótulo de uma chave (`"sul"` → `"Sul"`, `"sem_regiao"` → "Sem região
 * informada"). Chave desconhecida volta como veio: um `?f=` editado à mão não
 * pode derrubar o chip.
 */
export function rotuloRegiao(chave: string): string {
  return ROTULO_POR_CHAVE[chave] ?? chave;
}

/** As UFs de uma chave de região (`"sul"` → PR, RS, SC); `sem_regiao` e chave desconhecida → []. */
export function ufsDaRegiao(chave: string): readonly string[] {
  return REGIOES.find((r) => r.chave === chave)?.ufs ?? [];
}
