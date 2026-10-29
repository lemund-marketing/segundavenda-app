import type { ComponentType, CSSProperties, ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowDownRight, ArrowUpRight, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { LIMITE_PCT, variacao } from "@/components/dashboard/shared";
import { flattenOn, inkPair } from "@/utils/contrastInk";
import { tamanhoDoBloco } from "./tamanhoDoValor";

/**
 * Peças das telas do celular (22/10/2026), no padrão decidido com o dono:
 * estrutura do Phantom, fundo claro, verde de destaque e a cara do app —
 * números grandes, blocos e seções em cartão branco com divisórias, pílulas e
 * ícones em quadrado/círculo verde a 10%. Dashboard e Pedidos usam daqui, para
 * as telas falarem a mesma língua.
 */

export type Icone = ComponentType<{ className?: string; strokeWidth?: string | number }>;

export const pct1 = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
export const pct0 = (v: number) => `${v.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%`;

/** Selo de variação: seta e percentual sobre o verde ou o vermelho a 10%. */
export function Selo({ atual, anterior, base }: { atual: number; anterior: number; base?: string }) {
  const v = variacao(atual, anterior);
  if (v === null) return <span className="text-[12px] text-muted-foreground">sem base</span>;
  // Mesmo limiar da VariationPill: crescimento explosivo mostra o valor de antes.
  if (base && v > LIMITE_PCT) return <span className="text-[12px] text-muted-foreground">antes {base}</span>;
  if (Math.abs(v) < 0.05) {
    return <span className="rounded-full bg-muted px-2 py-0.5 text-[12px] font-medium text-muted-foreground ring-1 ring-inset ring-border">estável</span>;
  }
  const sobe = v > 0;
  const Seta = sobe ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[12px] font-medium tabular-nums ring-1 ring-inset",
        sobe ? "bg-emerald-500/10 text-emerald-700 ring-emerald-600/15" : "bg-rose-500/10 text-rose-700 ring-rose-600/15",
      )}
    >
      <Seta className="h-3 w-3" strokeWidth={2.5} />
      {pct1(Math.abs(v))}%
    </span>
  );
}

/**
 * O número com as partes miúdas em segundo plano (23/10/2026, "os cards estavam
 * simples demais"): o "R$" e os centavos, o "%" e a unidade ("dias") ficam a
 * 55% do tamanho e em cinza, e o número em si domina — como nos apps de banco.
 * Devolve só os pedaços: o tamanho vem de quem envolve (em `em`).
 */
export function ValorPartes({ valor }: { valor: string }) {
  // 55% do número, mas nunca abaixo de 11px: centavo é valor exato, tem que ler.
  const miudo = "text-[max(0.55em,11px)] font-semibold text-muted-foreground";
  // "R$ 1.234,56" (o espaço do Intl é NBSP), com o sinal de negativo na frente.
  const moeda = /^([−-]?)R\$\s?([\d.]+)(,\d+)?$/.exec(valor);
  const unidade = moeda ? null : /^([−-]?[\d.,]+)\s?(%|dias?|pedidos?|clientes?)$/.exec(valor);
  if (!moeda && !unidade) return <>{valor}</>;
  // O leitor de tela lê o valor inteiro de uma vez (o VoiceOver parava em cada
  // pedaço); os pedaços desenhados ficam escondidos dele. O NBSP fica dentro do
  // "R$" e da unidade, para copiar e colar sair com o espaço; a cópia do leitor
  // de tela fica fora da seleção (select-none), senão o valor colava duas vezes.
  return (
    <>
      <span className="sr-only select-none">{valor}</span>
      <span aria-hidden>
        {moeda ? (
          <>
            <span className={miudo}>{moeda[1]}R${"\u00a0"}</span>
            {moeda[2]}
            {moeda[3] && <span className={miudo}>{moeda[3]}</span>}
          </>
        ) : (
          <>
            {unidade![1]}
            <span className={miudo}>{unidade![2] === "%" ? "%" : `\u00a0${unidade![2]}`}</span>
          </>
        )}
      </span>
    </>
  );
}

/**
 * Tamanho do número do bloco pela largura que ele ocupa — a parte grande conta
 * inteira, as miúdas ("R$", centavos, unidade) a 55% — para caber em meia tela
 * de 360px sem reticências.
 */

/**
 * Bloco de um número (os pares embaixo do número principal da tela).
 * Redesenhado em 23/10/2026: o ícone verde ao lado do rótulo em cima (sem o
 * quadrado, que comia a largura do rótulo), o número grande com as partes
 * miúdas em cinza (`ValorPartes`), um brilho verde bem leve no canto e o
 * "afundar" no toque quando abre outra tela.
 */
export function Bloco({
  to, icone: I, rotulo, valor, selo, apoio, tamanho, className,
}: {
  to?: string;
  icone: Icone;
  rotulo: string;
  valor: string;
  /** O mesmo tamanho para a fileira inteira (`tamanhoComum`); sem ele, o do próprio valor. */
  tamanho?: string;
  selo?: ReactNode;
  apoio?: ReactNode;
  className?: string;
}) {
  const miolo = (
    <>
      <span aria-hidden className="pointer-events-none absolute -right-10 -top-12 h-28 w-28 rounded-full bg-primary/[0.08] blur-2xl" />
      <div className="relative flex items-center gap-1.5">
        <I className="h-4 w-4 shrink-0 text-primary" strokeWidth={2.25} />
        <p className="truncate text-[13px] text-muted-foreground">{rotulo}</p>
      </div>
      <p
        className={cn(
          "relative mt-2 truncate font-semibold tracking-tight tabular-nums text-foreground",
          tamanho ?? tamanhoDoBloco(valor),
        )}
        title={valor}
      >
        <ValorPartes valor={valor} />
      </p>
      {(selo || apoio) && (
        <div className="relative mt-2.5 flex flex-wrap items-center gap-x-1.5 gap-y-1">
          {selo}
          {apoio && <p className="text-[12px] leading-snug text-muted-foreground">{apoio}</p>}
        </div>
      )}
    </>
  );
  const classe = cn(
    "relative flex min-w-0 flex-col overflow-hidden rounded-3xl border border-border/60 bg-card p-4",
    to && "transition-transform duration-150 active:scale-[0.97]",
    className,
  );
  return to ? <Link to={to} className={classe}>{miolo}</Link> : <div className={classe}>{miolo}</div>;
}

/** Os tons do Aviso: caixa, título, texto, ícone e a pílula da ação. */
const TONS_AVISO = {
  ambar: {
    caixa: "border-amber-400/70 bg-amber-50 dark:bg-amber-500/10",
    titulo: "text-amber-900 dark:text-amber-200",
    texto: "text-amber-800/90 dark:text-amber-200/80",
    icone: "text-amber-600 dark:text-amber-400",
    acao: "bg-amber-500/15 text-amber-900 ring-1 ring-inset ring-amber-500/25 dark:text-amber-200",
  },
  vermelho: {
    caixa: "border-rose-400/70 bg-rose-50 dark:bg-rose-500/10",
    titulo: "text-rose-900 dark:text-rose-200",
    texto: "text-rose-800/90 dark:text-rose-200/80",
    icone: "text-rose-600 dark:text-rose-400",
    acao: "bg-rose-500/15 text-rose-900 ring-1 ring-inset ring-rose-500/25 dark:text-rose-200",
  },
  verde: {
    caixa: "border-emerald-400/70 bg-emerald-50 dark:bg-emerald-500/10",
    titulo: "text-emerald-900 dark:text-emerald-200",
    texto: "text-emerald-800/90 dark:text-emerald-200/80",
    icone: "text-emerald-600 dark:text-emerald-400",
    acao: "bg-emerald-500/15 text-emerald-900 ring-1 ring-inset ring-emerald-500/25 dark:text-emerald-200",
  },
  neutro: {
    // Fundo de card: sobre o cinza do muted o texto apagado caía abaixo de 4,5:1.
    caixa: "border-foreground/20 bg-card",
    titulo: "text-foreground",
    texto: "text-muted-foreground",
    icone: "text-muted-foreground",
    acao: "bg-card text-foreground ring-1 ring-inset ring-border",
  },
} as const;

/**
 * Quadro de aviso tracejado (23/10/2026, da referência que o dono gostou): a
 * caixa no tom do assunto com borda tracejada, ícone, título, texto e, se
 * houver, uma ação em pílula. Para o que pede atenção sem ser erro de tela
 * ("3 produtos sem categoria", "perto do limite do plano"); o neutro, para
 * instrução ("crie fluxos no computador").
 */
export function Aviso({
  tom = "ambar", icone: I, titulo, children, acao,
}: {
  tom?: keyof typeof TONS_AVISO;
  icone?: Icone;
  titulo?: ReactNode;
  children?: ReactNode;
  acao?: { rotulo: string; onClick?: () => void; to?: string };
}) {
  const c = TONS_AVISO[tom];
  const classeAcao = cn("mt-3 inline-flex h-8 items-center gap-1 rounded-full px-3.5 text-[13px] font-medium active:opacity-80", c.acao);
  return (
    <div className={cn("rounded-3xl border-[1.5px] border-dashed p-4", c.caixa)}>
      <div className="flex items-start gap-3">
        {I && <I className={cn("mt-0.5 h-5 w-5 shrink-0", c.icone)} strokeWidth={2} />}
        <div className="min-w-0 flex-1">
          {titulo && <p className={cn("text-[15px] font-medium leading-snug", c.titulo)}>{titulo}</p>}
          {children && <div className={cn("text-[13px] leading-relaxed", titulo && "mt-0.5", c.texto)}>{children}</div>}
          {acao &&
            (acao.to ? (
              <Link to={acao.to} className={classeAcao}>
                {acao.rotulo}
                <ChevronRight className="h-3.5 w-3.5" strokeWidth={2.25} />
              </Link>
            ) : (
              <button type="button" onClick={acao.onClick} className={classeAcao}>
                {acao.rotulo}
                <ChevronRight className="h-3.5 w-3.5" strokeWidth={2.25} />
              </button>
            ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Indicador de nível em segmentos (23/10/2026, da mesma referência): um
 * segmento por nível, cheios até o atual na cor de cada um (os anteriores mais
 * claros), os seguintes em cinza, e o nome de cada nível embaixo — o atual em
 * destaque. Lê-se de relance "em que faixa estou".
 */
export function IndicadorNivel({
  niveis, atual, rotulo,
}: {
  niveis: { rotulo: string; cor: string }[];
  atual: number;
  /** Nome do que é medido, para o leitor de tela ("Uso do plano"). */
  rotulo: string;
}) {
  const i = Math.min(Math.max(atual, 0), niveis.length - 1);
  return (
    <div
      role="meter"
      aria-label={rotulo}
      aria-valuemin={0}
      aria-valuemax={niveis.length - 1}
      aria-valuenow={i}
      aria-valuetext={niveis[i]?.rotulo}
    >
      <div className="flex gap-1.5">
        {niveis.map((n, k) => (
          <span
            key={n.rotulo}
            className={cn("h-2 flex-1 rounded-full", k > i && "bg-muted")}
            style={k <= i ? { backgroundColor: n.cor, opacity: k < i ? 0.45 : 1 } : undefined}
          />
        ))}
      </div>
      <div className="mt-1.5 flex gap-1.5" aria-hidden>
        {niveis.map((n, k) => (
          <span
            key={n.rotulo}
            className={cn(
              "flex-1 text-center text-[11px] leading-tight",
              k === i ? "font-semibold text-foreground" : "text-muted-foreground",
            )}
          >
            {n.rotulo}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Barra fina com a fatia de cada parte, nas cores das linhas logo abaixo. */
export function Distribuicao({ partes }: { partes: { chave: string; cor: string; valor: number }[] }) {
  const total = partes.reduce((s, p) => s + p.valor, 0);
  if (total <= 0) return null;
  return (
    <div className="flex h-2 w-full gap-[3px] overflow-hidden rounded-full">
      {partes
        .filter((p) => p.valor > 0)
        .map((p) => (
          <span key={p.chave} className="h-full rounded-full" style={{ width: `${(p.valor / total) * 100}%`, backgroundColor: p.cor }} />
        ))}
    </div>
  );
}

/**
 * Seção: título (com "›" quando abre outra tela) e um cartão branco com
 * divisórias. `semLista` para quem desenha o próprio conteúdo no cartão.
 */
export function Secao({
  titulo, to, aoVerTudo, direita, topo, rodape, semLista, children,
}: {
  titulo: ReactNode;
  to?: string;
  /** O "Ver tudo" como botão, para quem troca de aba em vez de rota. */
  aoVerTudo?: () => void;
  direita?: ReactNode;
  topo?: ReactNode;
  rodape?: ReactNode;
  semLista?: boolean;
  children: ReactNode;
}) {
  // Título em peso médio e, quando a seção abre outra tela, o "Ver tudo" no
  // canto direito (23/10/2026). Com algo próprio à direita, o título vira o link.
  const cabecalho =
    to && direita ? (
      <Link to={to} className="flex items-center gap-0.5 self-start text-[18px] font-semibold tracking-tight text-foreground">
        {titulo}
        <ChevronRight className="h-4 w-4 text-muted-foreground" strokeWidth={2.25} />
      </Link>
    ) : (
      <h2 className="text-[18px] font-semibold tracking-tight text-foreground">{titulo}</h2>
    );
  const classeVerTudo = "flex shrink-0 items-center gap-0.5 text-[13px] font-medium text-muted-foreground active:text-foreground";
  const lado =
    direita ??
    (to ? (
      <Link to={to} className={classeVerTudo}>
        Ver tudo<span className="sr-only">: {titulo}</span>
        <ChevronRight className="h-4 w-4" strokeWidth={2} />
      </Link>
    ) : aoVerTudo ? (
      <button type="button" onClick={aoVerTudo} className={classeVerTudo}>
        Ver tudo<span className="sr-only">: {titulo}</span>
        <ChevronRight className="h-4 w-4" strokeWidth={2} />
      </button>
    ) : null);
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        {cabecalho}
        {lado}
      </div>
      <div className="overflow-hidden rounded-3xl border border-border/60 bg-card">
        {topo && <div className="px-4 pb-1 pt-4">{topo}</div>}
        {semLista ? children : <ul className="divide-y divide-border/60">{children}</ul>}
        {rodape && <div className="border-t border-border/60 px-4 py-3 text-[13px] text-muted-foreground">{rodape}</div>}
      </div>
    </section>
  );
}

/** A linha das seções: ícone, nome + apoio, valor + rodapé à direita. */
export function Linha({
  to, onClick, icone, titulo, apoio, valor, rodape,
}: {
  to?: string;
  onClick?: () => void;
  icone: ReactNode;
  titulo: ReactNode;
  apoio?: ReactNode;
  valor?: ReactNode;
  rodape?: ReactNode;
}) {
  const miolo = (
    <>
      {icone}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-medium text-foreground">{titulo}</p>
        {apoio && <p className="truncate text-[13px] text-muted-foreground">{apoio}</p>}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-0.5">
        {valor && <p className="text-[15px] font-semibold tabular-nums text-foreground">{valor}</p>}
        {rodape}
      </div>
    </>
  );
  const classe = "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors active:bg-muted";
  return (
    <li>
      {to ? (
        <Link to={to} className={classe}>{miolo}</Link>
      ) : onClick ? (
        <button type="button" onClick={onClick} className={classe}>{miolo}</button>
      ) : (
        <div className={classe}>{miolo}</div>
      )}
    </li>
  );
}

/**
 * Círculo da esquerda das linhas. `neutra`: o círculo claro com leve degradê e
 * o ícone escuro (23/10/2026) — para ícone de assunto; a cor fica para o que é
 * marca (marketplace), pessoa (avatar) ou status.
 */
export function Bolinha({
  children, cor, fundo, neutra, className,
}: {
  children: ReactNode;
  cor?: string;
  fundo?: string;
  neutra?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[13px] font-bold",
        neutra && "bg-gradient-to-b from-card to-muted text-foreground/75 shadow-[0_1px_2px_hsl(var(--foreground)/0.06)] ring-1 ring-inset ring-border/80",
        className,
      )}
      style={{ color: cor, backgroundColor: fundo }}
    >
      {children}
    </span>
  );
}

/** Opacidade do fundo da BolinhaMarca: a mesma no desenho e na conta do contraste. */
const ALFA_MARCA = 0x29 / 255;

/**
 * Círculo de MARCA (marketplace): a cor dela a 16% no fundo e a sigla na
 * versão escura da mesma cor — no lugar do círculo cheio, que pesava ao lado
 * do resto (23/10/2026). O contraste da sigla é medido sobre o fundo tingido
 * achatado no card, não sobre o card puro: senão Americanas, Shopee e outras
 * ficavam abaixo de 4,5:1.
 */
export function BolinhaMarca({ cor, children }: { cor: string; children: ReactNode }) {
  const hex = /^#[0-9a-f]{6}$/i.test(cor) ? cor : "#09AF68";
  const tinta = inkPair(hex, {
    light: flattenOn(hex, ALFA_MARCA, "#FFFFFF"),
    dark: flattenOn(hex, ALFA_MARCA, "#0E0E11"),
  });
  return (
    <span
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[13px] font-bold text-[color:var(--tinta)] dark:text-[color:var(--tinta-escura)]"
      style={{ backgroundColor: `${hex}29`, "--tinta": tinta.light, "--tinta-escura": tinta.dark } as CSSProperties}
    >
      {children}
    </span>
  );
}

/** Texto escuro ou claro sobre a cor da marca do marketplace (o amarelo do ML pede texto escuro). */
export function corDoTexto(hex: string): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 160 ? "#1f2937" : "#ffffff";
}

export const textoPequeno = (t: string) => <span className="text-[12px] text-muted-foreground">{t}</span>;

/** Pílula de filtro (gatilho de Select numa fileira rolável) e o tom de quando ela está filtrando. */
export const PILULA_FILTRO =
  "h-9 w-auto shrink-0 gap-1.5 rounded-full border-border/60 bg-card px-3.5 text-[13px] font-medium text-foreground shadow-none focus:ring-0 focus:ring-offset-0";
export const PILULA_ATIVA = "border-transparent bg-primary/10 text-primary";

/** Pílulas roláveis de escolha única (período, abas): a ativa no verde a 10%. */
export function Pilulas<T extends string>({
  opcoes, valor, onChange, rotulo,
}: {
  opcoes: { value: T; label: string }[];
  valor: T;
  onChange: (v: T) => void;
  rotulo?: string;
}) {
  return (
    <div role="group" aria-label={rotulo} className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]">
      {opcoes.map((p) => (
        <button
          key={p.value}
          type="button"
          onClick={() => onChange(p.value)}
          aria-pressed={valor === p.value}
          className={cn(
            "h-9 shrink-0 rounded-full px-4 text-sm font-medium transition-colors",
            valor === p.value
              ? "bg-primary/10 text-primary ring-1 ring-inset ring-primary/20"
              : "border border-border/60 bg-card text-muted-foreground active:bg-muted",
          )}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}

/** Topo de tela: ícone no quadrado verde e o título grande (como "Conversas"). */
export function CabecalhoTela({ icone: I, titulo, direita }: { icone: Icone; titulo: string; direita?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-b from-card to-muted text-foreground/75 shadow-[0_1px_2px_hsl(var(--foreground)/0.06)] ring-1 ring-inset ring-border/80">
          <I className="h-[18px] w-[18px]" strokeWidth={2} />
        </span>
        <h1 className="truncate text-[22px] font-semibold tracking-tight text-foreground">{titulo}</h1>
      </div>
      {direita}
    </div>
  );
}
