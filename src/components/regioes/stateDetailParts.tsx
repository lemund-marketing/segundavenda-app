import { Fragment, type ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight, Minus, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { ACCENT, Medalhao, RowFill, pct } from "@/components/dashboard/shared";
import { BRAZIL_VIEWBOX, ESTADOS_GEO, ESTADO_POR_UF } from "./brazilStatePaths";

/**
 * Peças do sheet do estado, no molde do sheet do cliente
 * (`clients/sections/shared.tsx` → CardWrap, `ClientHeader`).
 *
 * Moram aqui e não são importadas de `clients/` nem de `produtos/` de propósito:
 * os dois estão sendo mexidos por outras frentes, e o sheet de Regiões não pode
 * quebrar porque alguém mudou a assinatura do card de lá.
 */

/** Card de seção: as classes do CardWrap do cliente, mais um subtítulo opcional. */
export function SecaoCard({
  icon: Icon,
  titulo,
  subtitulo,
  iconClasse = "bg-primary/10 text-primary",
  acao,
  children,
}: {
  icon: LucideIcon;
  titulo: string;
  subtitulo?: ReactNode;
  /** Fundo + cor do quadradinho do ícone (mesmas variações do sheet do cliente). */
  iconClasse?: string;
  acao?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="space-y-4 rounded-lg bg-card p-4 shadow-sm sm:p-5">
      <header className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <div
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
              iconClasse,
            )}
          >
            <Icon className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <h3 className="text-[15px] font-semibold leading-tight text-foreground">{titulo}</h3>
            {subtitulo && (
              <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground">{subtitulo}</p>
            )}
          </div>
        </div>
        {acao && <div className="shrink-0">{acao}</div>}
      </header>
      {children}
    </section>
  );
}

/** Vazio dentro de um card — o mesmo tom do "Sem dados" do sheet do cliente. */
export function VazioSecao({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-sm text-muted-foreground">{children}</p>;
}

/**
 * Estados que somem no mini-mapa de 80px: o contorno deles vira 1 ou 2 pixels.
 * Ganham um anel em volta do centroide para o olho achar onde estão.
 */
const UF_PEQUENA = new Set(["DF", "SE", "AL", "RN", "PB", "ES", "RJ", "PE"]);

/**
 * "Avatar" do estado: o Brasil inteiro em verde claro com o estado em verde
 * cheio, num círculo do mesmo tamanho do avatar do cliente (80px), e a sigla
 * num selo no canto — o lugar onde a ficha do cliente põe a inicial.
 */
export function MiniMapaEstado({ uf, size = 80 }: { uf: string; size?: number }) {
  const alvo = ESTADO_POR_UF[uf];
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <div className="flex h-full w-full items-center justify-center rounded-full bg-primary/10">
        <svg
          viewBox={BRAZIL_VIEWBOX}
          className="h-[74%] w-[74%]"
          role="img"
          aria-label={alvo ? `Mapa do Brasil com ${alvo.name} em destaque` : "Mapa do Brasil"}
        >
          {ESTADOS_GEO.map((e) =>
            e.code === uf ? null : (
              <path
                key={e.code}
                d={e.d}
                className="fill-primary/25 stroke-card"
                strokeWidth={3}
                strokeLinejoin="round"
              />
            ),
          )}
          {alvo && (
            <path d={alvo.d} fill={ACCENT} stroke={ACCENT} strokeWidth={4} strokeLinejoin="round" />
          )}
          {alvo && UF_PEQUENA.has(uf) && (
            <circle
              cx={alvo.labelX}
              cy={alvo.labelY}
              r={42}
              fill="none"
              stroke={ACCENT}
              strokeWidth={12}
            />
          )}
        </svg>
      </div>
      <span
        className="absolute -bottom-0.5 -right-1 rounded-full bg-primary px-2 py-0.5 text-[11px] font-bold leading-tight tracking-wide text-primary-foreground ring-2 ring-background"
        aria-hidden
      >
        {uf}
      </span>
    </div>
  );
}

/**
 * Linha de ranking no padrão aprovado em 28/08 (TopStates): a barra de
 * participação é o FUNDO da linha (RowFill), e zero não desenha nada — a barra
 * antiga com `Math.max(1.5, …)` pintava "um pouquinho" onde não havia nada.
 *
 * O nome quebra em até 2 linhas antes de cortar, com o texto inteiro no
 * `title`: produto de marketplace tem nome de 120 caracteres, e a versão de uma
 * linha só mostrava "Kit 3 Camisetas Masculinas Algod…".
 */
export function LinhaRanking({
  pos,
  share,
  titulo,
  sub,
  valor,
  valorSub,
  destaque = false,
  inicio,
}: {
  pos: number;
  /** 0–1, em relação ao líder da lista. */
  share: number;
  titulo: string;
  /** Linha de baixo do nome. Para várias partes, use `<Itens>`. */
  sub?: ReactNode;
  valor: ReactNode;
  valorSub?: ReactNode;
  /** Valor da direita em verde (dinheiro), como no ranking de estados. */
  destaque?: boolean;
  /** Substitui o medalhão (ex.: avatar do cliente). */
  inicio?: ReactNode;
}) {
  return (
    <li className="relative overflow-hidden rounded-xl transition-colors hover:bg-muted/40">
      <RowFill share={share} />
      {/* No celular o valor desce para baixo do nome: na mesma linha ele levava
          ~96px fixos e o nome ficava com ~137px ("Kit 3 Camisetas / Masculinas
          Básica…"). Do `sm` para cima o valor volta para a direita. */}
      <div className="relative flex items-start gap-3 px-2.5 py-2.5 sm:items-center">
        {inicio ?? <Medalhao pos={pos} />}
        <div className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
          <div className="min-w-0 sm:flex-1">
            <p
              className="line-clamp-2 break-words text-sm font-semibold leading-snug text-foreground"
              title={titulo}
            >
              {titulo}
            </p>
            {sub && <div className="mt-0.5 text-xs leading-snug text-muted-foreground">{sub}</div>}
          </div>
          <div className="flex flex-wrap items-baseline gap-x-2 sm:block sm:shrink-0 sm:text-right">
            <p
              className="whitespace-nowrap text-sm font-bold tabular-nums text-foreground"
              style={destaque ? { color: ACCENT } : undefined}
            >
              {valor}
            </p>
            {valorSub && (
              <p className="whitespace-nowrap text-[11px] tabular-nums text-muted-foreground">
                {valorSub}
              </p>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}

/**
 * Partes de uma linha de apoio ("320 pedidos · ticket R$ 200,00"). Cada parte
 * é inquebrável — "ticket" não pode ficar numa linha e o valor na outra — e a
 * quebra só acontece ENTRE partes.
 *
 * O "·" é o `::before` de cada parte, numa faixa de 12px. A lista inteira anda
 * 12px para a esquerda dentro de uma caixa `overflow-hidden`: o ponto da
 * primeira parte de CADA linha cai fora da caixa e some. Sem isso, o ponto
 * ficava pendurado no fim da linha de cima (o mesmo motivo de o cabeçalho não
 * usar separador).
 */
export function Itens({ itens }: { itens: ReactNode[] }) {
  const lista = itens.filter((i) => i !== null && i !== undefined && i !== false && i !== "");
  return (
    <span className="block overflow-hidden">
      <span className="-ml-3 flex flex-wrap">
        {lista.map((item, i) => (
          <span
            key={i}
            className="whitespace-nowrap before:inline-block before:w-3 before:text-center before:content-['·']"
          >
            {item}
          </span>
        ))}
      </span>
    </span>
  );
}

/** Rodapé de card ("o resto"), o mesmo da lista de lojas do sheet do cliente. */
export function NotaRodape({ children }: { children: ReactNode }) {
  return (
    <p className="border-t border-border/60 pt-3 text-[11px] leading-relaxed text-muted-foreground">
      {children}
    </p>
  );
}

/**
 * Régua ÚNICA de "está na média" para a pílula do KPI e para o card de
 * comparação, que aparecem um embaixo do outro na Visão Geral. Com réguas
 * diferentes (0,05 x 0,5) o mesmo +0,3% saía verde num e "na média" no outro.
 * 0,05 = só o que arredonda para "0,0%" vira média; o resto mostra o delta com
 * uma casa, como o sheet antigo fazia.
 */
const LIMIAR_NA_MEDIA = 0.05;
const FRASE_NA_MEDIA = "na média nacional";
const naMedia = (variacao: number) => Math.abs(variacao) < LIMIAR_NA_MEDIA;
const COR_ACIMA = "text-emerald-600 dark:text-emerald-400";
const COR_ABAIXO = "text-rose-600 dark:text-rose-400";

/**
 * Variação contra a média nacional, no visual da VariationPill do Dashboard.
 * Não reaproveita a pílula porque ela formata com `toFixed` ("+10.1%") e o card
 * de comparação logo abaixo fala "10,1%" — dois formatos do mesmo número na
 * mesma tela. E o "sem base anterior" dela não faz sentido aqui.
 */
export function PilulaVsMedia({ valor }: { valor: number }) {
  if (naMedia(valor)) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <Minus className="h-3 w-3" />
        {FRASE_NA_MEDIA}
      </span>
    );
  }
  const acima = valor > 0;
  const Icone = acima ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs font-medium",
        acima ? COR_ACIMA : COR_ABAIXO,
      )}
    >
      <Icone className="h-3 w-3" />
      {acima ? "+" : "−"}
      {pct(Math.abs(valor), 1)}
      <span className="font-normal text-muted-foreground">vs. média nacional</span>
    </span>
  );
}

/**
 * Uma métrica do estado contra a média nacional: duas barras na MESMA escala
 * (o maior dos dois vale 100%) e uma frase direta em cima. A versão anterior
 * mostrava só "R$ 150 vs. R$ 130 (média nacional)" e uma pílula — o olho tinha
 * de fazer a conta para saber quem era maior.
 */
export function BarrasComparacao({
  titulo,
  nomeEstado,
  valorEstado,
  valorPais,
  formatar,
  variacao,
}: {
  titulo: string;
  nomeEstado: string;
  valorEstado: number;
  valorPais: number;
  formatar: (v: number) => string;
  /** % do estado sobre a média; null = sem média para comparar. */
  variacao: number | null;
}) {
  const maior = Math.max(valorEstado, valorPais);
  const larg = (v: number) => (maior > 0 && v > 0 ? `${(v / maior) * 100}%` : "0%");

  let frase: ReactNode;
  if (variacao === null) {
    frase = <span className="text-muted-foreground">sem média nacional para comparar</span>;
  } else if (naMedia(variacao)) {
    frase = <span className="text-muted-foreground">{FRASE_NA_MEDIA}</span>;
  } else {
    const acima = variacao > 0;
    frase = (
      <span className={cn("font-semibold", acima ? COR_ACIMA : COR_ABAIXO)}>
        {pct(Math.abs(variacao), 1)} {acima ? "acima" : "abaixo"} da média
      </span>
    );
  }

  const linhas = [
    { rotulo: nomeEstado, valor: valorEstado, cor: ACCENT, forte: true },
    { rotulo: "Média nacional", valor: valorPais, cor: "hsl(var(--muted-foreground) / 0.45)", forte: false },
  ];

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <p className="text-[13px] font-semibold text-foreground">{titulo}</p>
        <p className="text-[12px] tabular-nums">{frase}</p>
      </div>
      {/* Uma grade só para as duas linhas: a coluna do rótulo cresce até o maior
          nome ("Rio Grande do Norte", ~118px) sem cortar, e as duas barras
          continuam começando no mesmo x. A coluna fixa de 6.5rem cortava RN e MS. */}
      <div className="grid grid-cols-[max-content_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2">
        {linhas.map((l) => (
          <Fragment key={l.rotulo}>
            <span
              className={cn(
                "whitespace-nowrap text-[12px]",
                l.forte ? "font-medium text-foreground" : "text-muted-foreground",
              )}
            >
              {l.rotulo}
            </span>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full transition-[width] duration-500 ease-out"
                style={{ width: larg(l.valor), backgroundColor: l.cor }}
              />
            </div>
            <span
              className={cn(
                "min-w-[5.5rem] text-right text-[13px] tabular-nums",
                l.forte ? "font-semibold text-foreground" : "text-muted-foreground",
              )}
            >
              {formatar(l.valor)}
            </span>
          </Fragment>
        ))}
      </div>
    </div>
  );
}
