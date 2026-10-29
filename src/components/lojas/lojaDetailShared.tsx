import { useMemo, type CSSProperties, type ReactNode } from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  Minus,
  RotateCw,
  TrendingDown,
  TrendingUp,
  Trophy,
  type LucideIcon,
} from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { getMarketplaceColor } from "@/utils/marketplaceColors";
import { inkPair } from "@/utils/contrastInk";
import { cn } from "@/lib/utils";
import { CARD_SEM_PADDING } from "@/components/dashboard/shared";

/**
 * Origens que não são plataforma de venda. Entram nos totais (é receita real),
 * mas ficam fora do ranking e do denominador do "#N de M" — comparar "Outro"
 * com o Mercado Livre não responde nenhuma pergunta.
 */
export const NAO_PLATAFORMA = new Set(["other", "retroativo"]);

/** Os 37 rótulos do enum `marketplace_platform` casam todos com este formato. */
export const isMarketplaceSlug = (s: string) => /^[a-z0-9_]+$/.test(s);

export const LOJA_PERIODS = [
  { value: "7", label: "7 dias" },
  { value: "30", label: "30 dias" },
  { value: "90", label: "90 dias" },
  { value: "365", label: "365 dias" },
  { value: "all", label: "Todo período" },
] as const;

export const DEFAULT_PERIOD = "30";

export interface LojaRange {
  start: string;
  end: string;
  bucket: "day" | "month";
  label: string;
  /** "últimos 30 dias", "último ano", "todo o período" — o rótulo do número grande no celular. */
  rotulo: string;
  /**
   * false em "Todo período". O início ancora em 2000-01-01, então a janela
   * anterior que as RPCs calculam (`_start - (_end - _start)`) cai em 1974 e
   * volta zerada — comparar com ela renderiza "Novo vs anterior" em verde para
   * uma loja com anos de histórico. Quem exibe comparativo tem que suprimir.
   */
  comparable: boolean;
}

export function periodToRange(period: string): LojaRange {
  const end = new Date();
  const start = new Date(end);
  if (period === "all") start.setFullYear(2000, 0, 1);
  else start.setDate(start.getDate() - Number(period));

  return {
    start: start.toISOString(),
    end: end.toISOString(),
    // Janela longa em bucket diário são 365 pontos num gráfico de 240px:
    // ilegível, e o zero-fill do servidor multiplica linhas por loja.
    bucket: period === "365" || period === "all" ? "month" : "day",
    label: LOJA_PERIODS.find((o) => o.value === period)?.label ?? period,
    rotulo: period === "all" ? "todo o período" : period === "365" ? "último ano" : `últimos ${period} dias`,
    comparable: period !== "all",
  };
}

/**
 * Remove os buckets zerados das PONTAS da série. Zeros no meio ficam: um mês sem
 * venda entre dois com venda é informação. Nas pontas não é — em "Todo período"
 * o zero-fill do servidor materializa a janela inteira a partir de 2000-01-01 e
 * devolve ~320 pontos mensais, 98% deles vazios, que achatam o gráfico numa
 * linha reta no zero com um pico ilegível na borda direita.
 */
export function trimZeroEdges<T>(points: T[], isZero: (p: T) => boolean): T[] {
  let i = 0;
  while (i < points.length && isZero(points[i])) i++;
  let j = points.length - 1;
  while (j >= i && isZero(points[j])) j--;
  // Mesma referência quando não há o que cortar: o array entra em memo/queryKey.
  if (i === 0 && j === points.length - 1) return points;
  return points.slice(i, j + 1);
}

/** null = não havia base anterior; quem chama decide entre "Novo" e "—". */
export function pctChange(cur: number, prev: number): number | null {
  if (prev === 0) return null;
  return ((cur - prev) / prev) * 100;
}

export const fmtPct = (n: number) => Math.abs(n).toFixed(1).replace(/\.0$/, "");

export const fmtInt = (n: number) => Math.round(n).toLocaleString("pt-BR");

export const fmtAxisCurrency = (v: number) =>
  v >= 1000 ? `R$ ${(v / 1000).toFixed(1)}k` : `R$ ${Math.round(v)}`;

// ---------------------------------------------------------------------------
// Tons
// ---------------------------------------------------------------------------

export type LojaTone = "primary" | "emerald" | "blue" | "violet" | "amber" | "rose" | "cyan";

export const TONE_CLASS: Record<LojaTone, { bg: string; fg: string }> = {
  primary: { bg: "bg-primary/10", fg: "text-primary" },
  emerald: { bg: "bg-emerald-500/10", fg: "text-emerald-600 dark:text-emerald-400" },
  blue: { bg: "bg-blue-500/10", fg: "text-blue-600 dark:text-blue-400" },
  violet: { bg: "bg-violet-500/10", fg: "text-violet-600 dark:text-violet-400" },
  amber: { bg: "bg-amber-500/10", fg: "text-amber-600 dark:text-amber-400" },
  rose: { bg: "bg-rose-500/10", fg: "text-rose-600 dark:text-rose-400" },
  cyan: { bg: "bg-cyan-500/10", fg: "text-cyan-600 dark:text-cyan-400" },
};

// ---------------------------------------------------------------------------
// Cor da loja, legível nos DOIS temas
// ---------------------------------------------------------------------------

/**
 * `marketplaceTone(slug).fg` devolve UMA cor só e só tem ramo para o extremo
 * claro (escurece o amarelo do ML). Marca escura em tema escuro fica invisível:
 * o preto do TikTok (#010101) dá 1,08:1 sobre o card `hsl(240 10% 6%)`.
 *
 * `inkPair` resolve os dois lados; como o tema é escolhido por CSS (classe
 * `dark` no <html>) e não em JS, o par vai em variáveis e o `dark:` decide.
 * Mesmo mecanismo que a grade de /lojas usa em `--row-ink`.
 */
export function useLojaInk(slug: string) {
  return useMemo(() => {
    const hex = getMarketplaceColor(slug);
    const ink = inkPair(hex);
    return {
      hex,
      light: ink.light,
      dark: ink.dark,
      /** Aplicar no elemento que envolve TODOS os usos da cor daquela tela. */
      vars: { "--loja-ink": ink.light, "--loja-ink-dark": ink.dark } as CSSProperties,
    };
  }, [slug]);
}

/** Tinta da loja como cor de TEXTO — e, via `currentColor`, de traço no recharts. */
export const INK_TEXT = "text-[color:var(--loja-ink)] dark:text-[color:var(--loja-ink-dark)]";

/** Tinta da loja como cor de FUNDO (barras de participação, bolinha de legenda). */
export const INK_BG = "bg-[color:var(--loja-ink)] dark:bg-[color:var(--loja-ink-dark)]";

/** Tooltip do recharts em tokens: hex cru não sobrevive à troca de tema. */
export const chartTooltipProps = {
  contentStyle: {
    borderRadius: 12,
    border: "1px solid hsl(var(--border))",
    background: "hsl(var(--card))",
    color: "hsl(var(--foreground))",
    fontSize: 12,
    boxShadow: "var(--shadow-md)",
  },
  labelStyle: { color: "hsl(var(--muted-foreground))", marginBottom: 2 },
  itemStyle: { color: "hsl(var(--foreground))" },
} as const;

export const barCursor = { fill: "hsl(var(--muted))", opacity: 0.45 };

// ---------------------------------------------------------------------------
// Comparativo temporal — verde/vermelho
// ---------------------------------------------------------------------------

/**
 * `neutral` existe porque nem toda queda é problema: ticket médio caindo pode
 * ser mix de produto barato vendendo mais. Pintar de vermelho o que não é
 * problema treina o usuário a ignorar a cor.
 */
export type DeltaSentiment = "up-good" | "neutral";

export interface TemporalDeltaProps {
  cur: number;
  prev: number;
  /** "pp" = as duas pontas já são percentuais; a diferença sai em pontos. */
  unit?: "%" | "pp";
  sentiment?: DeltaSentiment;
  /** "Todo período" não tem período anterior — a RPC devolve zero e o zero mentiria. */
  suppressed?: boolean;
  className?: string;
}

export function DeltaTemporal({
  cur,
  prev,
  unit = "%",
  sentiment = "up-good",
  suppressed,
  className,
}: TemporalDeltaProps) {
  const isPp = unit === "pp";
  const diff = isPp ? cur - prev : pctChange(cur, prev);

  const base = cn("flex items-center gap-1 text-xs font-medium", className);

  // Mesma redação da grade de /lojas: as duas telas não podem discordar sobre
  // existir ou não comparativo no mesmo preset.
  if (suppressed) return <span className={cn(base, "text-muted-foreground")}>no período</span>;

  if (diff === null || (isPp && cur === 0 && prev === 0)) {
    if (cur > 0) {
      return (
        <span className={cn(base, "text-emerald-600 dark:text-emerald-400")}>
          <TrendingUp className="w-3 h-3 shrink-0" />
          Novo vs anterior
        </span>
      );
    }
    return (
      <span className={cn(base, "text-muted-foreground")}>
        <Minus className="w-3 h-3 shrink-0" />— vs anterior
      </span>
    );
  }

  const Icon = diff > 0 ? TrendingUp : diff < 0 ? TrendingDown : Minus;
  const color =
    sentiment === "neutral" || diff === 0
      ? "text-muted-foreground"
      : diff > 0
        ? "text-emerald-600 dark:text-emerald-400"
        : "text-rose-600 dark:text-rose-400";

  return (
    <span className={cn(base, color)}>
      <Icon className="w-3 h-3 shrink-0" />
      {diff > 0 ? "+" : diff < 0 ? "−" : ""}
      {fmtPct(diff)}
      {isPp ? "pp" : "%"} vs anterior
    </span>
  );
}

// ---------------------------------------------------------------------------
// Comparativo posicional — âmbar/cinza/rosa, NUNCA verde
// ---------------------------------------------------------------------------

/**
 * Separado do temporal de propósito: "eu melhorei" e "eu estou bem colocado"
 * são perguntas diferentes, e duas linhas verdes no mesmo card competem.
 */
export interface PosicionalProps {
  text: string;
  kind?: "good" | "neutral" | "bad";
  className?: string;
}

export function DeltaPosicional({ text, kind = "neutral", className }: PosicionalProps) {
  const color =
    kind === "good"
      ? "text-amber-600 dark:text-amber-400"
      : kind === "bad"
        ? "text-rose-600 dark:text-rose-400"
        : "text-muted-foreground";

  return (
    <span className={cn("flex items-center gap-1 text-xs", color, className)}>
      <Trophy className="w-3 h-3 shrink-0" />
      <span className="truncate">{text}</span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Cartão de KPI
// ---------------------------------------------------------------------------

export interface LojaKpiProps {
  index?: number;
  icon: LucideIcon;
  tone: LojaTone;
  label: string;
  value: string;
  loading?: boolean;
  delta?: TemporalDeltaProps | null;
  rank?: PosicionalProps | null;
}

export function LojaKpi({
  index = 0,
  icon: Icon,
  tone,
  label,
  value,
  loading,
  delta,
  rank,
}: LojaKpiProps) {
  const t = TONE_CLASS[tone];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.25 }}
      className="rounded-2xl bg-card shadow-sm p-4 2xl:p-5 h-full min-h-[112px] 2xl:min-h-[136px] min-w-0 flex flex-col justify-between gap-2 2xl:gap-3 transition-shadow hover:shadow-hover"
    >
      {/* Rótulo e ícone na MESMA linha, como o Kpi da aba Pedidos: com o ícone
          em linha própria este cartão media 184px contra os 142px do irmão, e
          trocar de aba deslocava tudo o que vem abaixo. */}
      <div className="flex items-start justify-between gap-3">
        <p className="text-[13px] font-medium leading-tight text-muted-foreground">{label}</p>
        <div
          className={cn(
            "w-8 h-8 2xl:w-10 2xl:h-10 rounded-md flex items-center justify-center shrink-0",
            t.bg,
          )}
        >
          <Icon className={cn("w-4 h-4 2xl:w-5 2xl:h-5", t.fg)} strokeWidth={2} />
        </div>
      </div>

      <div className="min-w-0">
        {/* Skeleton, não "—": o traço se lê como "sem dado" e as outras faixas de
            KPI da feature (Pedidos, Produtos, /lojas) já usam shimmer. A altura
            acompanha o valor em cada degrau, senão a tela pula ao carregar. */}
        {loading ? (
          <Skeleton className="h-[22px] 2xl:h-[26px] w-24" />
        ) : (
          // `title`: em telas estreitas o card corta "R$ 1.243.869,95" e o valor
          // exato não aparece em nenhum outro lugar.
          <div
            title={value}
            className="text-[22px] 2xl:text-[26px] font-bold tabular-nums text-foreground leading-none tracking-tight truncate"
          >
            {value}
          </div>
        )}
        {!loading && (delta || rank) && (
          <div className="space-y-0.5 mt-1.5">
            {delta && <DeltaTemporal {...delta} />}
            {rank && <DeltaPosicional {...rank} />}
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Painel
// ---------------------------------------------------------------------------

export function LojaPanel({
  icon,
  tone = "primary",
  title,
  subtitle,
  action,
  className,
  children,
}: {
  icon: ReactNode;
  tone?: LojaTone;
  title: string;
  subtitle?: string;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  const t = TONE_CLASS[tone];

  // Header IDÊNTICO ao do resto do sistema (20/08/2026): a faixa, a escala de
  // texto e o tamanho do ícone vêm de um lugar só. Antes este painel usava
  // título 16px e subtítulo 14px, enquanto Dashboard e Regiões usavam 14/12 —
  // dois blocos lado a lado na mesma tela pareciam de produtos diferentes.
  // O que fica local é a COR do ícone, que aqui varia por tom.
  return (
    <div className={cn(CARD_SEM_PADDING, "overflow-hidden", className)}>
      <header className="flex items-center justify-between gap-3 border-b border-border/70 bg-[hsl(0_0%_95.88%_/_40%)] dark:bg-muted/40 px-5 py-3.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className={cn("h-8 w-8 rounded-lg flex items-center justify-center shrink-0", t.bg, t.fg)}>
            {icon}
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold leading-tight text-foreground">{title}</h3>
            {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
          </div>
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </header>
      <div className="p-4 2xl:p-6">{children}</div>
    </div>
  );
}

/**
 * Barra de proporção na tinta da loja. A cor vem das variáveis de `useLojaInk`
 * postas num ancestral — cor crua em JS não tem como responder ao tema.
 */
export function ShareBar({ pct, className }: { pct: number; className?: string }) {
  return (
    <div className={cn("h-1.5 rounded-full bg-muted overflow-hidden", className)}>
      <div
        className={cn("h-full rounded-full transition-all", INK_BG)}
        style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
      />
    </div>
  );
}

export function EmptyBlock({ children, height = 240 }: { children: ReactNode; height?: number }) {
  return (
    <div
      className="flex items-center justify-center text-sm text-muted-foreground"
      style={{ height }}
    >
      {children}
    </div>
  );
}

/**
 * Falha de consulta NÃO pode cair no estado vazio: "amplie o período" manda o
 * usuário mexer numa janela que não tem nada a ver com o erro.
 */
export function ErrorBlock({
  title = "Não foi possível carregar estes dados.",
  hint = "A consulta falhou. Tente de novo em alguns instantes.",
  onRetry,
  className,
}: {
  title?: string;
  hint?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border border-rose-500/20 bg-rose-500/10 p-5 flex items-start gap-3",
        className,
      )}
    >
      <AlertTriangle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="shrink-0 inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-muted"
        >
          <RotateCw className="w-3.5 h-3.5" />
          Tentar de novo
        </button>
      )}
    </div>
  );
}
