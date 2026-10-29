/**
 * Ciclo mensal de captura — só FORMATAÇÃO, nunca régua.
 *
 * O ciclo é calculado no banco (`public.ciclo_captura`, a partir de
 * `subscriptions.ciclo_ancora`) e gravado por `public.recontar_captura` em
 * `captura_ciclo_inicio` (inclusivo) e `captura_ciclo_fim` (exclusivo), junto com
 * o `current_client_count` daquele mesmo ciclo. O limite mensal também vem pronto
 * (`subscriptions.limite_mensal`). O front não divide e não calcula ciclo: só lê
 * essas colunas e as imprime com as funções daqui.
 *
 * Contrato: docs/LIMITE_CAPTURA_MENSAL.md.
 */

// O ciclo vira à 00:00 de Brasília; formatar em outro fuso mostraria o dia errado.
const DIA_MES = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  timeZone: "America/Sao_Paulo",
});

export interface CicloCapturaFormatado {
  /** Primeiro dia do ciclo, "16/09". */
  inicio: string;
  /** Último dia que ainda conta no ciclo, "15/10" (o `fim` é exclusivo). */
  ultimoDia: string;
  /** Dia em que o contador zera, "16/10". */
  zeraEm: string;
}

/**
 * `{ inicio: "16/09", ultimoDia: "15/10", zeraEm: "16/10" }`, ou `null` quando
 * falta uma das pontas (assinatura ainda não recontada, ou function antiga).
 */
export const formatarCicloCaptura = (
  inicio?: string | null,
  fim?: string | null,
): CicloCapturaFormatado | null => {
  if (!inicio || !fim) return null;
  const i = new Date(inicio);
  const f = new Date(fim);
  if (Number.isNaN(i.getTime()) || Number.isNaN(f.getTime())) return null;
  return {
    inicio: DIA_MES.format(i),
    ultimoDia: DIA_MES.format(new Date(f.getTime() - 1)),
    zeraEm: DIA_MES.format(f),
  };
};

/**
 * Rótulo do contrato por `billing_interval`, para "60.000 no contrato anual".
 * O mensal não tem rótulo: nele o contrato e o mês são a mesma coisa.
 */
export const ROTULO_CONTRATO: Readonly<Record<string, string | undefined>> = {
  quarterly: "trimestral",
  semiannual: "semestral",
  yearly: "anual",
};
