/**
 * Oportunidade de venda detectada pela IA numa conversa (`whatsapp_conversion_cases`).
 *
 * A mesma leitura alimenta duas telas: a fila de curadoria do admin (Casos IA) e
 * a aba "Oportunidades" do WhatsApp do seller. Rótulos e cores moram aqui para
 * as duas dizerem a mesma coisa sobre o mesmo case — quando eram duas listas
 * soltas, "cross_sell" podia virar dois nomes diferentes na mesma empresa.
 */
export interface OportunidadeIA {
  tipo: string;
  resumo: string | null;
  confianca: number | null;
}

export const ROTULOS_INTENCAO: Record<string, string> = {
  recompra: "Recompra",
  cross_sell: "Cross-sell",
  catalogo: "Pediu catálogo",
  variacao: "Variação",
  outro: "Outro interesse",
  nenhum: "Sem sinal",
};

/**
 * Versão curta para o card da lista: a coluna tem 260px na maioria dos
 * notebooks, e "Pediu catálogo" sozinho come metade da linha de etiquetas,
 * empurrando fase, loja e o contador da janela de 24h para linhas extras.
 */
export const ROTULOS_INTENCAO_CURTOS: Record<string, string> = {
  recompra: "Recompra",
  cross_sell: "Cross-sell",
  catalogo: "Catálogo",
  variacao: "Variação",
  outro: "Interesse",
  nenhum: "Sem sinal",
};

/**
 * Tokens semânticos, nunca cor literal: o fallback antigo era
 * `text-slate-700`, sem variante dark, e no tema escuro o texto ficava quase
 * invisível — inclusive na faixa que mostra o resumo inteiro da IA. O tipo vem
 * cru do modelo (a coluna não tem CHECK), então o fallback é caminho real.
 */
export const CORES_INTENCAO: Record<string, string> = {
  recompra: "bg-primary/15 text-primary border-primary/30",
  cross_sell: "bg-secondary/15 text-secondary border-secondary/30",
  catalogo: "bg-secondary/15 text-secondary border-secondary/30",
  variacao: "bg-warning/15 text-warning border-warning/30",
  outro: "bg-muted text-foreground border-border",
  nenhum: "bg-muted text-muted-foreground border-border",
};

export const rotuloIntencao = (tipo?: string | null): string =>
  (tipo && ROTULOS_INTENCAO[tipo]) || "Oportunidade";

export const rotuloIntencaoCurto = (tipo?: string | null): string =>
  (tipo && ROTULOS_INTENCAO_CURTOS[tipo]) || "Oportunidade";

export const corIntencao = (tipo?: string | null): string =>
  (tipo && CORES_INTENCAO[tipo]) || CORES_INTENCAO.outro;
