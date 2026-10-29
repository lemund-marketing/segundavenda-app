/**
 * Tamanho do número dos cards de destaque (Bloco), num arquivo sem componente
 * para o tamanho comum poder ser importado pelas telas sem quebrar o Fast
 * Refresh de blocos.tsx.
 */
const TAMANHOS_BLOCO = ["text-[26px]/none", "text-[23px]/none", "text-[20px]/none", "text-[17px]/none"] as const;

function degrauDoBloco(valor: string): number {
  const moeda = /^([−-]?)R\$\s?([\d.]+)(,\d+)?$/.exec(valor);
  const unidade = /^([−-]?[\d.,]+)\s?(%|dias?|pedidos?|clientes?)$/.exec(valor);
  const largura = moeda
    ? moeda[1].length + moeda[2].length + 0.55 * (3 + (moeda[3]?.length ?? 0))
    : unidade
      ? unidade[1].length + 0.55 * (unidade[2].length + 1)
      : valor.length;
  if (largura <= 6) return 0;
  if (largura <= 8) return 1;
  if (largura <= 10.5) return 2;
  return 3;
}

/**
 * O tamanho (com a altura de linha junto, no formato "/none": `leading-none`
 * solto era removido pelo tailwind-merge ao lado de um `text-[..]`).
 */
export const tamanhoDoBloco = (valor: string) => TAMANHOS_BLOCO[degrauDoBloco(valor)];

/**
 * Um tamanho para os blocos lado a lado: o do valor mais largo. Sem isso, cada
 * card escolhia o seu e os selos da mesma fileira ficavam em alturas diferentes.
 */
export const tamanhoComum = (...valores: string[]) =>
  TAMANHOS_BLOCO[Math.max(0, ...valores.map(degrauDoBloco))];
