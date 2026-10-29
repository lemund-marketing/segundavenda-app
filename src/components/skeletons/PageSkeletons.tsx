import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Peças de esqueleto que ESPELHAM os componentes reais (20/08/2026).
 *
 * O esqueleto do Dashboard tinha 3 KPIs enquanto a tela mostra 4, um grid de 2
 * colunas onde a tela usa 5, e desenhava uma barra de topo falsa que hoje o
 * AppLayout já renderiza de verdade. O efeito é o pior de um esqueleto: a tela
 * "pula" quando os dados chegam, porque a promessa não era o que veio.
 *
 * Regra ao mexer: se o bloco real mudar de forma, a peça daqui muda junto.
 */

/** Faixa branca do topo — mesma altura e padding do PageHeader real. */
export function SkeletonPageHeader({ comAcao = true }: { comAcao?: boolean }) {
  return (
    // min-h-[72px] + py-3 espelham PageHeader.tsx, que ganhou essa altura em
    // 28/08 para a borda de baixo bater com a borda da logo na lateral. Sem
    // copiar aqui, o esqueleto fechava em 64px e a página pulava 8px quando os
    // dados chegavam.
    <div className="flex min-h-[72px] items-center justify-between gap-3 border-b border-border bg-card px-4 py-3 2xl:px-6">
      <div className="space-y-1.5">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-3 w-64" />
      </div>
      {comAcao && <Skeleton className="h-9 w-32 rounded-xl" />}
    </div>
  );
}

/** Um KPI do topo: rótulo, chip do ícone, número grande e a variação. */
export function SkeletonKpi() {
  return (
    <div className="rounded-2xl bg-card p-5 shadow-card">
      <div className="flex items-start justify-between gap-2">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-8 w-8 rounded-lg" />
      </div>
      <Skeleton className="mt-3 h-7 w-32" />
      <Skeleton className="mt-2 h-3 w-40" />
      <Skeleton className="mt-2 h-3 w-28" />
    </div>
  );
}

export function SkeletonKpiRow({ quantidade = 4 }: { quantidade?: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: quantidade }, (_, i) => (
        <SkeletonKpi key={i} />
      ))}
    </div>
  );
}

/**
 * Bloco com a MESMA faixa de header dos painéis reais (ícone 32px + título +
 * subtítulo, fundo levemente mais escuro, borda embaixo).
 */
export function SkeletonPanel({
  className,
  comAcao = false,
  children,
}: {
  className?: string;
  comAcao?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <section className={cn("overflow-hidden rounded-2xl bg-card shadow-card", className)}>
      <div className="flex items-center justify-between gap-3 border-b border-border/70 bg-[hsl(0_0%_95.88%_/_40%)] dark:bg-muted/40 px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <Skeleton className="h-8 w-8 rounded-lg" />
          <div className="space-y-1.5">
            <Skeleton className="h-3.5 w-36" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
        {comAcao && <Skeleton className="h-7 w-24 rounded-lg" />}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

/** Linhas de lista (cliente, pedido, estado…): avatar/marcador + 2 linhas + valor. */
export function SkeletonLinhas({ quantidade = 5, comAvatar = true }: { quantidade?: number; comAvatar?: boolean }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: quantidade }, (_, i) => (
        <div key={i} className="flex items-center gap-3">
          {comAvatar && <Skeleton className="h-8 w-8 shrink-0 rounded-full" />}
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-1/2" />
            <Skeleton className="h-3 w-1/3" />
          </div>
          <Skeleton className="h-4 w-20 shrink-0" />
        </div>
      ))}
    </div>
  );
}

/** Área de gráfico/mapa: um retângulo da altura do conteúdo real. */
export function SkeletonGrafico({ altura = 260 }: { altura?: number }) {
  return <Skeleton className="w-full rounded-xl" style={{ height: altura }} />;
}

/** Cabeçalho + linhas de uma tabela. */
export function SkeletonTabela({ linhas = 8, colunas = 5 }: { linhas?: number; colunas?: number }) {
  return (
    <div className="space-y-3">
      <div className="flex gap-4 border-b border-border/60 pb-3">
        {Array.from({ length: colunas }, (_, i) => (
          <Skeleton key={i} className="h-3 flex-1" />
        ))}
      </div>
      {Array.from({ length: linhas }, (_, i) => (
        <div key={i} className="flex gap-4 py-1">
          {Array.from({ length: colunas }, (_, j) => (
            <Skeleton key={j} className="h-4 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}
