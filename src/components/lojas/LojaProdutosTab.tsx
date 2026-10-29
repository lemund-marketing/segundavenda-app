// app: no site a tela mora numa página (src/pages/Produtos.tsx), que o app não
// copia; a versão de celular dela, embutida no marketplace, é do app.
import { ProdutosScreen } from "@/app/blocos/ProdutosScreen";

import type { LojaRange } from "./lojaDetailShared";
import type { LojaMetricsRow } from "./lojaDetailQueries";

/**
 * Histórico desta aba, porque ela some, volta e muda de natureza:
 *
 * - 10/08/2026 — "Produtos" saiu da lista de TABS de LojaDetail a pedido do
 *   dono. O componente ficou no repo, intacto, sem ninguém montá-lo.
 * - 29/08/2026 — a aba voltou, ainda como componente PRÓPRIO: o ranking "Mais
 *   vendidos" (`get_marketplace_top_products`) mais quatro KPIs.
 * - 29/08/2026, mesma tarde — pedido do dono, textual: "aba de produtos, deixar
 *   igual da aba produtos do seller". A aba passou a SER a tela `/produtos`
 *   inteira, travada neste marketplace, no mesmo desenho que a aba Clientes já
 *   usava com `ClientesScreen`. O ranking próprio, os KPIs próprios e a RPC
 *   `get_marketplace_top_products` saíram daqui — o que a tela do seller mostra
 *   (Analytics, Itens, Categorias, gaveta de detalhe, categorização) é
 *   estritamente mais do que havia, e uma cópia paralela divergiria no primeiro
 *   ajuste.
 */

interface Props {
  /**
   * Aceito para manter o contrato das cinco abas de LojaDetail idêntico, mas
   * não é repassado: `ProdutosScreen` lê o vendedor do `SellerContext`, que é
   * a mesma fonte de onde LojaDetail tira este valor.
   */
  sellerId: string | undefined;
  marketplace: string;
  /** Janela do cabeçalho da loja, com `start`/`end` já em ISO. */
  range: LojaRange;
  /**
   * Totais da loja que a página-mãe já baixou. Eram o denominador do share no
   * ranking próprio; a tela do seller calcula os dela a partir do próprio
   * recorte, então o valor entra só para o contrato não mudar.
   */
  row: LojaMetricsRow | null;
  active: boolean;
  /**
   * Loja em foco (orders.store_id), quando o seller tem 2+ lojas no mesmo
   * marketplace.
   *
   * ATENÇÃO: a tela de produtos NÃO honra este recorte —
   * `get_product_ranking_stats(p_seller_id, p_from, p_to, p_prev_from,
   * p_marketplace)` não tem parâmetro de loja. Com uma loja selecionada, os
   * números desta aba continuam sendo os do marketplace inteiro, enquanto o
   * cabeçalho acima mostra os da loja em foco. Aceito aqui para o contrato
   * continuar igual ao das outras abas; resolver de verdade pede um
   * `p_store_id` na RPC.
   */
  storeId?: string | null;
  storeName?: string | null;
  /**
   * Nome bonito da loja, já resolvido pelo alias em LojaDetail. Opcional: sem
   * ele a própria tela resolve pelo mesmo caminho (`useMarketplaceAliases`), o
   * que dá exatamente a mesma string.
   */
  label?: string;
}

/**
 * A aba Produtos da loja É a tela `/produtos`, com a loja travada no recorte.
 *
 * Nada aqui refaz KPIs, ranking, filtros ou gavetas: tudo isso é
 * `ProdutosScreen`, o mesmo componente que a página do menu monta. A trava
 * desce por UM ponto (`lockedMarketplace` → `p_marketplace` na RPC), então a
 * lista, os quatro KPIs, o ranking de categorias e as duas gavetas de detalhe
 * nascem recortados — e nenhum "Limpar todos" ou chip devolve as outras lojas,
 * porque a trava não mora no estado da barra de filtros.
 */
export function LojaProdutosTab({ marketplace, range, active, label }: Props) {
  return (
    <ProdutosScreen
      // A página tem padding próprio; aqui quem paga o padding é LojaDetail.
      // Mesma escala de espaçamento das abas vizinhas.
      className="space-y-4 2xl:space-y-6"
      lockedMarketplace={marketplace}
      lockedMarketplaceLabel={label}
      // O `range` inteiro serve como janela: `LojaRange` tem `start`/`end` em
      // ISO, que é exatamente o que a tela precisa. Passar o range PRONTO (e não
      // um número de dias) é o que preserva "Todo período", que a tela do
      // seller não sabe escrever no vocabulário dela — e é o que mantém UM
      // seletor só mandando, o do cabeçalho da loja.
      lockedRange={range}
      // Aba escondida não consulta: o gate desce até o `enabled` das duas
      // queries da tela.
      active={active}
      // No celular, a versão de app sem o título da tela (o cabeçalho é o da
      // loja), com o rótulo do período do cabeçalho.
      embutidaMobile
      rotuloPeriodo={range.rotulo}
      rotuloComparacao={range.comparable ? `${range.label} antes` : "o período anterior"}
    />
  );
}

export default LojaProdutosTab;
