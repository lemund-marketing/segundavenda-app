import { AlertTriangle, ChevronRight, Clock, UserMinus, Users } from "lucide-react";

import { KpiPadrao } from "@/components/kpi/KpiPadrao";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Bloco, Distribuicao } from "@/components/mobile/blocos";
import { tamanhoComum } from "@/components/mobile/tamanhoDoValor";

import { STUCK_DAYS, isConditionalStage } from "./kanbanFilters";
import type { PipelineMetrics } from "./usePipelineMetrics";

interface Stage {
  id: string;
  name: string;
  color: string | null;
  stage_type?: string | null;
}

interface PipelineKpisProps {
  metrics: PipelineMetrics;
  stages: Stage[];
  onNoStageClick?: () => void;
}

const FALLBACK_COLOR = "#6366f1";

/**
 * Esqueleto do bloco, com a MESMA altura do conteúdo final.
 *
 * Sem ele o bloco era inserido acima da barra de filtros quando
 * get_pipeline_metrics respondia, empurrando barra, chips e quadro inteiro para
 * baixo — quase um card de cliente de salto, sempre que /crm abre.
 */
export function PipelineKpisSkeleton() {
  return (
    <div className="space-y-4 px-4 pt-4" aria-hidden>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          // 134px = KpiPadrao com uma linha de apoio (p-5 40 + chip 32 +
          // gap-3 12 + valor 30 + apoio 20). Mesma casca do card final.
          <div key={i} className="h-[134px] animate-pulse rounded-2xl bg-card shadow-card" />
        ))}
      </div>
      <Card className="h-[114px] animate-pulse bg-card shadow-sm dark:border dark:border-border" />
    </div>
  );
}

export function PipelineKpis({ metrics, stages, onNoStageClick }: PipelineKpisProps) {
  const { total, byStage, avgDays, stuckCount, noStageCount } = metrics;

  // A barra descreve client_pipeline, e fase por regra não é listada por
  // client_pipeline — a coluna dela conta pela condição, em client_metrics.
  // get_pipeline_metrics (20260802110000) já não as soma; deixá-las aqui
  // renderizaria uma legenda fixa em "0 (0%)" ao lado de uma coluna cheia.
  const funnelStages = stages.filter((s) => !isConditionalStage(s));
  const ruleStages = stages.filter(isConditionalStage);

  return (
    <div className="space-y-4 px-4 pt-4">
      {/* Tooltips escritos do que get_pipeline_metrics (20260802110000) faz de
          verdade: só vínculos em fase manual, tempo desde moved_at (ou
          created_at), e "sem fase" = cliente da base sem vínculo manual. */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <KpiPadrao
          titulo="Total"
          valor={total.toLocaleString("pt-BR")}
          apoio="clientes no funil"
          icone={Users}
          tooltip="Clientes vinculados às fases manuais do funil. Fases por regra contam na própria coluna, e quem não está em nenhuma fase entra no indicador Sem fase."
        />
        <KpiPadrao
          titulo="Tempo médio"
          valor={`${Math.round(avgDays)}d`}
          apoio="na fase atual"
          icone={Clock}
          tooltip="Média de dias que os clientes do funil estão na fase atual, contados desde a última troca de fase — ou desde a entrada no funil, para quem nunca trocou."
        />
        <KpiPadrao
          titulo="Parados"
          valor={stuckCount.toLocaleString("pt-BR")}
          apoio={`+${STUCK_DAYS}d sem movimento`}
          icone={AlertTriangle}
          tooltip={`Clientes do funil que estão há mais de ${STUCK_DAYS} dias na fase atual, sem serem movidos.`}
        />
        {/*
          O 4º KPI do Segundo Pedido é "Inválidos" (clients.whatsapp_invalid).
          Essa coluna não existe nesta base e nada aqui a preencheria; a
          alternativa mais próxima (whatsapp_opted_out) está em 0 de 8.445
          clientes. "Sem fase" é o único indicador que muda quando alguém usa o
          Kanban — e fecha o buraco entre o Total (vínculos) e a base do seller.

          O clique vive num wrapper porque o KpiPadrao não tem onClick; o
          tooltip do card continua funcionando por hover no filho.
        */}
        {onNoStageClick ? (
          <button
            type="button"
            onClick={onNoStageClick}
            className="w-full rounded-2xl text-left transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <KpiPadrao
              titulo="Sem fase"
              valor={noStageCount.toLocaleString("pt-BR")}
              apoio="fora do funil"
              icone={UserMinus}
              className="h-full"
              tooltip="Clientes da sua base que não estão em nenhuma fase manual do funil. Somados ao Total, fecham a base inteira da loja. Clique para ver a lista."
            />
          </button>
        ) : (
          <KpiPadrao
            titulo="Sem fase"
            valor={noStageCount.toLocaleString("pt-BR")}
            apoio="fora do funil"
            icone={UserMinus}
            tooltip="Clientes da sua base que não estão em nenhuma fase manual do funil. Somados ao Total, fecham a base inteira da loja."
          />
        )}
      </div>

      {funnelStages.length > 0 && total > 0 && (
        <Card
          className="bg-card p-4 shadow-sm dark:border dark:border-border"
          title="Métricas do funil inteiro; não acompanham os filtros acima."
        >
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-foreground">Distribuição por fase</p>
            <p className="text-xs tabular-nums text-muted-foreground">
              {total.toLocaleString("pt-BR")} no funil
              {noStageCount > 0 && (
                <span className="text-muted-foreground">
                  {" "}
                  · {noStageCount.toLocaleString("pt-BR")} sem fase
                </span>
              )}
            </p>
          </div>

          {/* O fundo `bg-muted` que sobrar denuncia stage_id órfão (fase apagada
              ou de outro seller): defeito de dado, não de layout. */}
          <div className="flex h-3 overflow-hidden rounded-full bg-muted">
            {funnelStages.map((stage) => {
              const count = byStage[stage.id] || 0;
              const pct = total > 0 ? (count / total) * 100 : 0;
              if (pct === 0) return null;
              return (
                <div
                  key={stage.id}
                  // `pipeline_stages.color` não é único por seller — AddStageColumn
                  // distribui duas cores padrão, e há sellers com 9 fases no mesmo
                  // indigo. Sem o filete, faixas vizinhas viram um bloco só.
                  className="border-r border-card transition-all duration-300 last:border-r-0"
                  style={{ backgroundColor: stage.color || FALLBACK_COLOR, width: `${pct}%` }}
                  title={`${stage.name}: ${count} (${Math.round(pct)}%)`}
                />
              );
            })}
          </div>

          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
            {funnelStages.map((stage) => {
              const count = byStage[stage.id] || 0;
              const pct = total > 0 ? Math.round((count / total) * 100) : 0;
              const color = stage.color || FALLBACK_COLOR;
              return (
                <div key={stage.id} className="flex items-center gap-1.5 text-xs">
                  {/* Anel do fundo do card em volta da bolinha: mesma razão do
                      filete da barra — duas fases na mesma cor precisam ler
                      como duas entradas. */}
                  <span
                    className="size-2 shrink-0 rounded-full ring-1 ring-card"
                    style={{ backgroundColor: color }}
                  />
                  <span className="font-medium text-foreground">{stage.name}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {count} ({pct}%)
                  </span>
                </div>
              );
            })}
          </div>

          {ruleStages.length > 0 && (
            <p className="mt-2.5 text-[11px] leading-snug text-muted-foreground">
              Por regra, contadas na própria coluna:{" "}
              {ruleStages.map((s) => s.name).join(" · ")}
            </p>
          )}
        </Card>
      )}
    </div>
  );
}

/**
 * Resumo do funil no celular (22/10/2026), no desenho do Dashboard: o total
 * grande com o "sem fase" que abre a lista, a barra de distribuição nas cores
 * das fases (as abas do quadro, logo abaixo, fazem de legenda) e tempo médio
 * e parados em blocos. Mesmas métricas do PipelineKpis — funil inteiro, sem
 * seguir os filtros.
 */
export function PipelineResumoMobile({ metrics, stages, onNoStageClick }: PipelineKpisProps) {
  const { total, byStage, avgDays, stuckCount, noStageCount } = metrics;
  const funnelStages = stages.filter((s) => !isConditionalStage(s));

  return (
    <div className="flex flex-col gap-4 px-4 pt-4">
      <section className="flex flex-col gap-3">
        <div>
          <p className="text-sm font-medium text-muted-foreground">No funil</p>
          <p className="mt-1 text-[38px] font-semibold leading-tight tracking-tight tabular-nums text-foreground">
            {total.toLocaleString("pt-BR")}
          </p>
          {noStageCount > 0 && (
            <button
              type="button"
              onClick={onNoStageClick}
              disabled={!onNoStageClick}
              className="mt-0.5 inline-flex items-center gap-1 text-[13px] font-semibold text-primary"
            >
              <UserMinus className="h-3.5 w-3.5" strokeWidth={2.25} />
              {noStageCount.toLocaleString("pt-BR")} {noStageCount === 1 ? "cliente" : "clientes"} sem fase
              <ChevronRight className="h-3.5 w-3.5" strokeWidth={2.5} />
            </button>
          )}
        </div>
        {total > 0 && (
          <Distribuicao
            partes={funnelStages.map((st) => ({
              chave: st.id,
              cor: st.color || FALLBACK_COLOR,
              valor: byStage[st.id] || 0,
            }))}
          />
        )}
      </section>

      <div className="grid grid-cols-2 gap-2">
        <Bloco tamanho={tamanhoComum(`${Math.round(avgDays)} dias`, stuckCount.toLocaleString("pt-BR"))} icone={Clock} rotulo="Tempo médio" valor={`${Math.round(avgDays)} dias`} apoio="na fase atual" />
        <Bloco
          tamanho={tamanhoComum(`${Math.round(avgDays)} dias`, stuckCount.toLocaleString("pt-BR"))}
          icone={AlertTriangle}
          rotulo="Parados"
          valor={stuckCount.toLocaleString("pt-BR")}
          apoio={`há mais de ${STUCK_DAYS} dias`}
        />
      </div>
    </div>
  );
}

export function PipelineResumoMobileSkeleton() {
  return (
    <div className="flex flex-col gap-4 px-4 pt-4" aria-hidden>
      <div className="space-y-2">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-10 w-28" />
        <Skeleton className="h-2 w-full rounded-full" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Skeleton className="h-[104px] rounded-2xl" />
        <Skeleton className="h-[104px] rounded-2xl" />
      </div>
    </div>
  );
}
