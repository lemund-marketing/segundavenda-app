import { brl, int } from "@/components/dashboard/shared";

// Fora do BrazilChoropleth (23/10/2026): as telas usam estas constantes já no
// primeiro desenho, e importá-las de lá puxava o mapa inteiro (com os contornos
// dos estados) para o pacote inicial mesmo onde o mapa carrega depois.

export type Metrica = "orders" | "revenue" | "clients" | "avg_ticket";

/**
 * `fmt` é o valor exato do estado; `legendFmt` é o corte da escala, que sai de
 * um quantil e portanto vem quebrado. "0 – 2,8 pedidos" não existe: corte de
 * contagem se arredonda antes de virar texto.
 */
export const METRICAS: {
  key: Metrica;
  label: string;
  fmt: (v: number) => string;
  legendFmt: (v: number) => string;
}[] = [
  { key: "orders", label: "Pedidos", fmt: int, legendFmt: (v) => int(Math.round(v)) },
  { key: "revenue", label: "Receita", fmt: brl, legendFmt: brl },
  { key: "clients", label: "Clientes", fmt: int, legendFmt: (v) => int(Math.round(v)) },
  { key: "avg_ticket", label: "Ticket médio", fmt: brl, legendFmt: brl },
];

/**
 * Altura do mapa. Exportada porque os esqueletos de carregamento PRECISAM usar
 * a mesma: com alturas diferentes a tela pulava ~180px quando a query
 * respondia (ver Dashboard.tsx, Regioes.tsx, LojaVisaoGeralTab.tsx).
 *
 * A escada acompanha a proporção do desenho (~0.96, quase quadrado): em tela
 * estreita quem manda é a largura, então altura demais só criaria tarja; em
 * tela larga quem manda é a altura, e é onde crescer faz diferença.
 */
export const ALTURA_MAPA = "h-[400px] md:h-[500px] xl:h-[580px] 2xl:h-[680px]";
