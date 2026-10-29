/**
 * Nome e região das 27 UFs, sem o desenho do mapa.
 *
 * Separado de `brazilStatePaths.ts` (23/10/2026) porque quem só precisa do nome
 * do estado (o ranking da tela inicial, a contagem "N de 27") puxava junto os
 * ~100 KB de contornos do mapa para o pacote inicial do app. A geometria
 * continua lá e só carrega com o mapa.
 */
export type Regiao = "Norte" | "Nordeste" | "Centro-Oeste" | "Sudeste" | "Sul";

export const REGIOES: Regiao[] = ["Norte", "Nordeste", "Centro-Oeste", "Sudeste", "Sul"];

export const ESTADOS_BR: Record<string, { name: string; regiao: Regiao }> = {
  AC: { name: "Acre", regiao: "Norte" },
  AL: { name: "Alagoas", regiao: "Nordeste" },
  AM: { name: "Amazonas", regiao: "Norte" },
  AP: { name: "Amapá", regiao: "Norte" },
  BA: { name: "Bahia", regiao: "Nordeste" },
  CE: { name: "Ceará", regiao: "Nordeste" },
  DF: { name: "Distrito Federal", regiao: "Centro-Oeste" },
  ES: { name: "Espírito Santo", regiao: "Sudeste" },
  GO: { name: "Goiás", regiao: "Centro-Oeste" },
  MA: { name: "Maranhão", regiao: "Nordeste" },
  MG: { name: "Minas Gerais", regiao: "Sudeste" },
  MS: { name: "Mato Grosso do Sul", regiao: "Centro-Oeste" },
  MT: { name: "Mato Grosso", regiao: "Centro-Oeste" },
  PA: { name: "Pará", regiao: "Norte" },
  PB: { name: "Paraíba", regiao: "Nordeste" },
  PE: { name: "Pernambuco", regiao: "Nordeste" },
  PI: { name: "Piauí", regiao: "Nordeste" },
  PR: { name: "Paraná", regiao: "Sul" },
  RJ: { name: "Rio de Janeiro", regiao: "Sudeste" },
  RN: { name: "Rio Grande do Norte", regiao: "Nordeste" },
  RO: { name: "Rondônia", regiao: "Norte" },
  RR: { name: "Roraima", regiao: "Norte" },
  RS: { name: "Rio Grande do Sul", regiao: "Sul" },
  SC: { name: "Santa Catarina", regiao: "Sul" },
  SE: { name: "Sergipe", regiao: "Nordeste" },
  SP: { name: "São Paulo", regiao: "Sudeste" },
  TO: { name: "Tocantins", regiao: "Norte" },
};
