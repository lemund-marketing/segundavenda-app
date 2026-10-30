// Distribuição das respostas pelas saídas do classificador de IA de CADA fluxo.
//
// Por que separado por fluxo: o mesmo template roda em vários fluxos, e cada um
// desenha o próprio classificador com as perguntas que quer fazer. No mesmo
// seller há classificador com (positivo, negativo, Número Errado, neutro),
// outro com (grupo, contato, neutro) e outro com (fotos, negativa, neutro) —
// somar o "neutro" dos três seria somar perguntas diferentes.
//
// Por que a lista vem do DESENHO do nó e não do que ocorreu: saída com zero
// resposta é informação ("ninguém caiu em Número Errado"). Se listássemos só o
// que apareceu, essa leitura sumiria.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Sparkles, AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { inicioNoMinuto, fimNoMinuto } from "@/hooks/useWorkflowStatsData";

interface Saida {
  rotulo: string;
  valor: string;
  total: number;
  pct: number;
}

interface BlocoFluxo {
  workflow_id: string;
  workflow_name: string;
  workflow_active: boolean;
  node_id: string;
  disparos: number;
  respostas: number;
  classificadas: number;
  fora_do_classificador: number;
  saidas: Saida[];
}

/** Paleta por posição, não por nome: os rótulos são livres (cada fluxo escolhe
 *  os seus), então não dá para mapear "positivo = verde" de forma confiável. */
const CORES = [
  "bg-emerald-500",
  "bg-rose-500",
  "bg-amber-500",
  "bg-sky-500",
  "bg-violet-500",
  "bg-teal-500",
  "bg-orange-500",
  "bg-fuchsia-500",
];

/** Colunas da grade conforme o número de saídas do classificador.
 *
 *  Até 4 cabem numa linha só, dividindo o espaço igualmente (3 saídas = 1/3
 *  cada, 4 = 1/4). De 5 em diante fixa em 3 colunas e quebra em linhas — 5
 *  caixas espremidas numa linha ficam ilegíveis, e 3+2 respira. Assim 6 vira
 *  3x2, 7 vira 3+3+1, e por aí.
 *
 *  Classes ESTÁTICAS de propósito: o Tailwind varre o código em busca dos
 *  nomes, então `grid-cols-${n}` montado em tempo de execução não entraria no
 *  CSS final e a grade silenciosamente viraria uma coluna.
 *
 *  No celular são sempre 2 — qualquer coisa acima disso não cabe. */
const GRADE_POR_SAIDAS: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-2 sm:grid-cols-3",
  4: "grid-cols-2 sm:grid-cols-4",
};
const gradeDe = (n: number) => GRADE_POR_SAIDAS[n] ?? "grid-cols-2 sm:grid-cols-3";

/** Quantos fluxos aparecem antes do "ver mais". Três cabem sem rolagem; um
 *  seller com 20 fluxos viraria uma parede de blocos. */
const VISIVEIS = 3;

export function ClassificacaoPorFluxo({
  sellerId,
  templateName,
  start,
  end,
}: {
  sellerId: string | null | undefined;
  templateName: string;
  start: string;
  end: string;
}) {
  const [expandido, setExpandido] = useState(false);
  // Minuto cheio na chave (06/10/2026): `start`/`end` chegavam com milissegundos
  // e cada abertura criava chave nova — o cache nunca servia. A chamada usa as
  // mesmas datas da chave (janela só alarga < 1 min; ver inicioNoMinuto).
  const inicio = inicioNoMinuto(new Date(start));
  const fim = fimNoMinuto(new Date(end));
  const { data, isLoading } = useQuery<BlocoFluxo[]>({
    queryKey: ["template-classificacao", sellerId, templateName, inicio, fim],
    enabled: !!sellerId && !!templateName,
    // 5 min, como as outras consultas da tela, e reabrir a tela usa o cache
    // (06/10/2026): com 60 s, trocar de período e voltar depois de 1 min (ou
    // sair e voltar, com o refetchOnMount 'always' do App) refazia a RPC.
    staleTime: 5 * 60 * 1000,
    refetchOnMount: true,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc(
        "get_template_classification_breakdown",
        { _seller_id: sellerId, _template: templateName, _start: inicio, _end: fim },
      );
      if (error) throw error;
      return (data ?? []) as BlocoFluxo[];
    },
  });

  if (isLoading) {
    return (
      <Card className="rounded-2xl shadow-sm border-0 bg-card">
        <CardContent className="p-5 space-y-5">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-primary/10 shrink-0">
              <Sparkles className="w-5 h-5 text-primary" strokeWidth={2} />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-base font-semibold text-foreground">
                Respostas por classificação da IA
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                As saídas que cada fluxo configurou no seu classificador
              </p>
            </div>
          </div>
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  // Sem classificador em nenhum fluxo: dizer isso é melhor que mostrar card vazio.
  if (!data || data.length === 0) {
    return null;
  }

  return (
    <Card className="rounded-2xl shadow-sm border-0 bg-card">
      <CardContent className="p-5 space-y-6">
        {/* Cabeçalho no mesmo molde do Funil de Conversão e da Evolução diária:
            ícone em caixa bg-primary/10, título text-base semibold, subtítulo
            xs logo abaixo. */}
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-xl bg-primary/10 shrink-0">
            <Sparkles className="w-5 h-5 text-primary" strokeWidth={2} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold text-foreground">
              Respostas por classificação da IA
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              As saídas que cada fluxo configurou no seu classificador
            </p>
          </div>
        </div>
        {/* space-y-7 entre fluxos: com 5 os blocos encostavam e a leitura
            embolava — o nome do fluxo seguinte parecia legenda do anterior. */}
        <div className="space-y-7">
        {(expandido ? data : data.slice(0, VISIVEIS)).map((bloco) => {
          const semClassificador = bloco.saidas.length === 0;
          return (
            <div key={`${bloco.workflow_id}-${bloco.node_id}`} className="space-y-2.5">
              <div className="flex items-baseline justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm font-medium text-foreground truncate">
                    {bloco.workflow_name}
                  </span>
                  {!bloco.workflow_active && (
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground bg-muted rounded px-1.5 py-0.5 shrink-0">
                      pausado
                    </span>
                  )}
                </div>
                <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                  {bloco.classificadas.toLocaleString("pt-BR")} de{" "}
                  {bloco.respostas.toLocaleString("pt-BR")} respostas classificadas
                </span>
              </div>

              {semClassificador ? (
                <p className="text-xs text-muted-foreground">
                  Este fluxo não tem classificação de IA depois do template.
                </p>
              ) : (
                <>
                  {/* Barra empilhada: dá a proporção num relance, antes de ler os números. */}
                  <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
                    {bloco.saidas.map((s, i) =>
                      s.pct > 0 ? (
                        <div
                          key={s.valor}
                          className={CORES[i % CORES.length]}
                          style={{ width: `${s.pct}%` }}
                          title={`${s.rotulo}: ${s.total} (${s.pct}%)`}
                        />
                      ) : null,
                    )}
                  </div>

                  <div className={`grid gap-2 ${gradeDe(bloco.saidas.length)}`}>
                    {bloco.saidas.map((s, i) => (
                      <div
                        key={s.valor}
                        className="rounded-xl bg-muted/40 px-3.5 py-3"
                      >
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span
                            className={`h-2 w-2 rounded-full shrink-0 ${CORES[i % CORES.length]}`}
                          />
                          <span className="text-[11px] text-muted-foreground truncate capitalize">
                            {s.rotulo}
                          </span>
                        </div>
                        <div className="mt-1.5 flex items-baseline gap-1.5">
                          <span className="text-lg font-semibold text-foreground tabular-nums">
                            {s.pct.toFixed(1)}%
                          </span>
                          <span className="text-[11px] text-muted-foreground tabular-nums">
                            {s.total.toLocaleString("pt-BR")}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {bloco.fora_do_classificador > 0 && (
                <div className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-warning" />
                  <span>
                    {bloco.fora_do_classificador.toLocaleString("pt-BR")} resposta
                    {bloco.fora_do_classificador === 1 ? "" : "s"} com classificação que não existe
                    mais neste classificador — provavelmente o nó foi editado depois.
                  </span>
                </div>
              )}
            </div>
          );
        })}
        </div>

        {data.length > VISIVEIS && (
          <button
            type="button"
            onClick={() => setExpandido((v) => !v)}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-muted/40 py-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground"
          >
            {expandido ? (
              <>
                <ChevronUp className="h-3.5 w-3.5" />
                Ver menos
              </>
            ) : (
              <>
                <ChevronDown className="h-3.5 w-3.5" />
                Ver os outros {data.length - VISIVEIS} fluxo
                {data.length - VISIVEIS === 1 ? "" : "s"}
              </>
            )}
          </button>
        )}
      </CardContent>
    </Card>
  );
}
