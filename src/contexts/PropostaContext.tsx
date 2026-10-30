import { createContext, useContext } from 'react';

/**
 * Sinaliza aos painéis de configuração dos nós que o editor está em MODO
 * PROPOSTA (docs/FLUXOS_PROPOSTA.md §5.5): o admin monta um fluxo não
 * funcional para um cliente, então ações que mexem na conta dele de verdade
 * (criar/apagar fase, por exemplo) ficam escondidas — só a seleção continua.
 *
 * Default `false`: o builder normal (aba Automações) não precisa envolver nada.
 */
export interface PropostaContextType {
  modoProposta: boolean;
  /**
   * Largura do bloco no canvas da proposta (card + ficha de valores como uma
   * peça só). O BaseNode usa isto no lugar da prop `width` quando
   * `modoProposta`; sem ele, cada card fica na largura de sempre.
   */
  larguraBloco?: number;
  /**
   * Proposta fora dos status editáveis (aprovada, enviada…): os painéis dos nós
   * ABREM para consulta, mas em somente leitura (15/10/2026). Quem aplica é o
   * ConfigPanelShell: aviso no topo, digitação e controles travados, rodapé só
   * com "Fechar". Antes o editor barrava o clique e nenhum painel abria.
   */
  somenteLeitura?: boolean;
}

export const PropostaContext = createContext<PropostaContextType>({ modoProposta: false });

export const usePropostaContext = () => useContext(PropostaContext);
