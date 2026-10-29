import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight, ArrowRight, Minus } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

/**
 * Vocabulário visual do Dashboard v2. Mesmo verde da marca usado na tela de RFV
 * — as duas telas falam da mesma base e não podem parecer produtos diferentes.
 */
export const ACCENT = "#09AF68";

/** Funil CRM: quantas fases vazias são nomeadas antes de virar "e mais N" (computador e celular). */
export const VAZIAS_NOMEADAS = 6;

export const CARD =
  "rounded-2xl bg-card p-5 shadow-card transition-shadow duration-200 ease-out hover:shadow-hover";

/** Mesma moldura, sem padding: para cards cujo header sangra até a borda. */
export const CARD_SEM_PADDING =
  "rounded-2xl bg-card shadow-card transition-shadow duration-200 ease-out hover:shadow-hover";

/* ------------------------------------------------------------------ *
 * Lista-com-preenchimento: o padrão aprovado em 28/08/2026.
 *
 * A barra de participação deixou de ser um objeto embaixo da linha e virou o
 * FUNDO da própria linha. Ganha-se metade da altura por item e some a barra
 * indentada que nunca alinhava com o texto. Nasceu em "Estados com mais
 * pedidos" e hoje vale para DOIS blocos: Estados e Funil CRM. O Marketplaces
 * usou isto por algumas horas em 28/08 e saiu no mesmo dia, quando ganhou a
 * rosca — com o gráfico dando a proporção, o fundo proporcional dizia a mesma
 * coisa de novo.
 * ------------------------------------------------------------------ */

/** Amansa a escala: o líder come quase tudo (SP faz 47%; "Novos Clientes" faz
 *  100%) e, no linear, a lista vira uma barra cheia seguida de N invisíveis. */
export function intensidade(share: number): number {
  return Math.sqrt(Math.max(0, Math.min(1, share)));
}

/** Opacidade do verde no medalhão de 1º, 2º e 3º lugar. */
export const PODIO = ["2E", "1F", "14"];

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/**
 * A cor da fase vem do Kanban, escolhida pelo lojista, e chega sem validação.
 * Se vier "purple" ou "hsl(...)", a concatenação `${cor}12` produz uma cor
 * inválida: o browser descarta a regra inteira e a linha fica SEM fundo — sem
 * erro no console e sem ninguém perceber. Aqui, o que não for hex vira o verde
 * da marca; hex de 3 dígitos é expandido; e o canal alfa que já viesse na cor
 * é cortado, senão o sufixo de opacidade viraria o 9º dígito e seria ignorado.
 */
export function corSegura(c?: string | null): string {
  const v = (c ?? "").trim();
  if (!HEX.test(v)) return ACCENT;
  if (v.length === 4) return `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`;
  return v.slice(0, 7);
}

/**
 * Preenchimento proporcional DENTRO da linha. Exige um pai `relative
 * overflow-hidden`, e o conteúdo por cima precisa ser `relative`.
 *
 * `share <= 0` devolve null, e isso é o ponto: o código antigo tinha
 * `Math.max(1.5, …)` e pintava 1,5% de cor para uma fase com ZERO cliente —
 * o olho lia "tem um pouquinho" onde não tem nada. Zero agora não desenha.
 */
export function RowFill({ share, color = ACCENT }: { share: number; color?: string }) {
  if (!(share > 0)) return null;
  const c = corSegura(color);
  return (
    <div
      aria-hidden
      className="absolute inset-y-0 left-0 rounded-xl transition-[width] duration-500 ease-out"
      style={{
        width: `${intensidade(share) * 100}%`,
        background: `linear-gradient(90deg, ${c}12 0%, ${c}03 100%)`,
      }}
    />
  );
}

/**
 * Medalhão de posição. SÓ para lista que é ranking por tamanho — no Funil CRM
 * a ordem é de processo, não de grandeza, e o medalhão leria como pódio.
 *
 * Do 4º em diante o fundo é o do card (branco) com borda: o cinza-sobre-cinza
 * anterior sumia, ainda mais assentado sobre o degradê verde da linha.
 */
export function Medalhao({ pos }: { pos: number }) {
  const podio = pos < 3;
  return (
    <span
      className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold tabular-nums"
      style={
        podio
          ? {
              backgroundColor: `${ACCENT}${PODIO[pos]}`,
              color: ACCENT,
              boxShadow: `inset 0 0 0 1px ${ACCENT}40`,
            }
          : {
              backgroundColor: "hsl(var(--card))",
              color: "hsl(var(--foreground))",
              boxShadow: "inset 0 0 0 1px hsl(var(--border))",
            }
      }
    >
      {pos + 1}
    </span>
  );
}

/**
 * Dinheiro COM centavos (pedido de 20/08/2026). Antes cortava em
 * `maximumFractionDigits: 0`, e "R$ 491.079" era na verdade R$ 491.078,53 —
 * arredondado na tela. Quem confere com o extrato do marketplace precisa do
 * valor exato.
 */
export const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Mantido como nome próprio para não quebrar quem já importa. */
export const brlExact = brl;

export const int = (v: number) => v.toLocaleString("pt-BR");

export const pct = (v: number, digits = 1) =>
  `${v.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`;

/** Eixo de valor curto: 12.500 → R$ 12,5 mil. */
export const brlAxis = (v: number) => {
  if (Math.abs(v) >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `R$ ${(v / 1_000).toFixed(0)}k`;
  return `R$ ${v.toFixed(0)}`;
};

/**
 * Variação percentual entre dois períodos.
 * Sem base anterior não existe percentual — devolve null e a tela mostra
 * "sem base anterior" em vez de um 100% inventado.
 */
export function variacao(atual: number, anterior: number): number | null {
  if (!anterior) return null;
  return ((atual - anterior) / Math.abs(anterior)) * 100;
}

/**
 * Acima disto, o percentual é verdade matemática e lixo informativo. Um canal
 * que saiu de R$ 25 mil para R$ 502 mil vira "+1844,9%", número que só diz que
 * o período anterior estava quase vazio — e ocupava a tela inteira em 28/08.
 * Um limiar só, sem faixa no meio: queda nunca passa de -100%, então este ramo
 * captura apenas crescimento explosivo.
 */
export const LIMITE_PCT = 300;

export function VariationPill({
  value,
  base,
  inverted = false,
  suffix = "vs. período anterior",
}: {
  value: number | null;
  /**
   * Valor do período anterior, JÁ FORMATADO. Quando presente e a variação passa
   * de LIMITE_PCT, a pílula mostra a base em vez da razão: "antes R$ 25,8 mil"
   * é um número que o lojista usa; "+1844,9%" não é. Sem `base`, o
   * comportamento é o de sempre — nenhuma chamada existente muda de aparência.
   */
  base?: ReactNode;
  /** true quando cair é bom (ex.: custo por conversão). */
  inverted?: boolean;
  suffix?: string;
}) {
  if (value === null) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <Minus className="h-3 w-3" />
        sem base anterior
      </span>
    );
  }

  // Só para cima: uma queda de -95% é informação legítima e continua em %.
  if (base != null && value > LIMITE_PCT) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <ArrowUpRight className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
        antes <span className="font-medium tabular-nums text-foreground">{base}</span>
      </span>
    );
  }

  const flat = Math.abs(value) < 0.05;
  const bom = flat ? null : inverted ? value < 0 : value > 0;
  const Icon = flat ? Minus : value > 0 ? ArrowUpRight : ArrowDownRight;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs font-medium",
        bom === null && "text-muted-foreground",
        bom === true && "text-emerald-600 dark:text-emerald-400",
        bom === false && "text-rose-600 dark:text-rose-400",
      )}
    >
      <Icon className="h-3 w-3" />
      {flat ? "estável" : `${value > 0 ? "+" : ""}${value.toFixed(1)}%`}
      {/* só renderiza quando existe: com suffix="" sobrava um <span> vazio
          somando o gap de 4px do flex e desalinhando a linha. */}
      {suffix && <span className="font-normal text-muted-foreground">{suffix}</span>}
    </span>
  );
}

/**
 * Botão padrão do canto direito de um header de bloco (referência de 20/08).
 * Branco sobre a faixa cinza, com aresta — lido como botão, não como texto.
 */
export function PanelAction({
  to,
  onClick,
  children,
}: {
  /** Link interno. Sem `to`, vira <button> e usa o onClick. */
  to?: string;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  // Hover no verde da marca com texto branco (pedido de 20/08). `hover:border`
  // junto: sem trocar a borda, sobra uma aresta cinza em volta do verde.
  const classe =
    "inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 " +
    "text-xs font-semibold text-foreground shadow-sm transition-colors " +
    "hover:bg-primary hover:border-primary hover:text-primary-foreground";
  const conteudo = (
    <>
      {children}
      <ArrowRight className="h-3 w-3" />
    </>
  );
  if (to) {
    return (
      <Link to={to} className={classe} onClick={onClick}>
        {conteudo}
      </Link>
    );
  }
  return (
    <button type="button" className={classe} onClick={onClick}>
      {conteudo}
    </button>
  );
}

/**
 * Header padrão de bloco: faixa de fundo levemente mais escura, ícone + título +
 * subtítulo à esquerda, ação opcional à direita (pedido de 20/08/2026).
 *
 * Mora aqui e é exportado porque os OUTROS dois headers do projeto (LojaPanel,
 * nos marketplaces, e os Card+CardHeader de Produtos) passam a consumi-lo. Antes
 * eram três implementações da mesma ideia, com três escalas diferentes: título
 * 14px aqui, 16px lá, e subtítulo 12px de um lado e 14px do outro.
 *
 * A escala escolhida foi a compacta (14/12/ícone 32): é a da referência e é a
 * que sobra mais altura para o conteúdo do bloco em tela de notebook.
 */
export function PanelHeader({
  icon: Icon,
  iconBg,
  iconFg,
  title,
  subtitle,
  right,
}: {
  icon?: LucideIcon | React.ComponentType<{ className?: string }>;
  /** Cor de fundo do quadradinho. Sem isso, usa o verde da marca. */
  iconBg?: string;
  iconFg?: string;
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <header className="flex items-center justify-between gap-3 border-b border-border/70 bg-[hsl(0_0%_95.88%_/_40%)] dark:bg-muted/40 px-5 py-3.5">
      <div className="flex min-w-0 items-center gap-2.5">
        {Icon && (
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
            style={{ backgroundColor: iconBg ?? `${ACCENT}1A`, color: iconFg ?? ACCENT }}
          >
            <Icon className="h-4 w-4" />
          </span>
        )}
        <div className="min-w-0">
          {/* Sem `truncate`: no notebook o painel fica estreito e "Estados com
              mais pedidos" virava "Estados com mai…". Título de painel é curto e
              pode ocupar duas linhas — cortar a palavra esconde o que o bloco mostra. */}
          <h3 className="text-sm font-semibold leading-tight text-foreground">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </header>
  );
}

export function PanelCard({
  icon,
  title,
  subtitle,
  right,
  className,
  onClick,
  children,
}: {
  icon?: LucideIcon;
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  className?: string;
  /** Card inteiro clicável (usado pelo bloco de últimos pedidos). */
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <section
      // flex-col: o painel estica para acompanhar o vizinho na mesma fileira do
      // grid, e sem isso o conteúdo ficava no topo com metade do card vazia.
      // p-0 + overflow-hidden: a faixa do header vai de borda a borda, então o
      // padding mudou para DENTRO do corpo.
      className={cn(
        CARD_SEM_PADDING,
        "flex min-h-0 flex-col overflow-hidden",
        onClick && "cursor-pointer",
        className,
      )}
      onClick={onClick}
    >
      <PanelHeader icon={icon} title={title} subtitle={subtitle} right={right} />
      <div className="flex min-h-0 flex-1 flex-col p-5">{children}</div>
    </section>
  );
}

export function EmptyState({
  height = 220,
  className,
  children = "Sem dados no período",
}: {
  height?: number;
  /** Classe de altura, para casos responsivos (o mapa). Quando vem, vence o `height`. */
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-xl border border-dashed border-border text-sm text-muted-foreground",
        className,
      )}
      style={className ? undefined : { height }}
    >
      {children}
    </div>
  );
}

/** Tooltip do recharts com a moldura do tema (o default é branco fixo). */
export const tooltipProps = {
  contentStyle: {
    borderRadius: 12,
    border: "1px solid hsl(var(--border))",
    background: "hsl(var(--popover))",
    color: "hsl(var(--popover-foreground))",
    fontSize: 12,
    boxShadow: "var(--shadow-md)",
  },
  labelStyle: { color: "hsl(var(--muted-foreground))", marginBottom: 4 },
} as const;

export const barCursor = { fill: "hsl(var(--muted))", opacity: 0.5 };
