import { Card, CardContent } from "@/components/ui/card";
import { Filter, ChevronRight, ShoppingBag } from "lucide-react";
import { MetricTooltip } from "@/components/ui/metric-tooltip";

export interface FunnelStep {
  label: string;
  value: number;
  highlight?: boolean;
  tooltip?: string;
  /**
   * Denominador explícito para a % desta etapa. Quando ausente, usa o valor da
   * etapa anterior (funil sequencial). Útil para etapas que NÃO são subconjunto
   * da anterior (ex.: "Compraram" não é subconjunto de "Responderam"), evitando
   * percentuais sem sentido (>100%).
   */
  pctOf?: number;
  /**
   * Como ler a % desta etapa no funil do celular ("das entregues", "dos
   * destinatários"). Sem ele: "de <etapa anterior>", ou "do total" quando há
   * `pctOf` (denominador que não é uma etapa).
   */
  pctLabel?: string;
}

interface Props {
  steps: FunnelStep[];
  loading?: boolean;
  title?: string;
  subtitle?: string;
}

function pctColor(pct: number) {
  if (pct >= 50) return "text-success";
  if (pct >= 25) return "text-warning";
  return "text-destructive";
}

export function ConversionFunnel({
  steps,
  loading,
  title = "Funil de Conversão",
  subtitle = "Como suas mensagens convertem em vendas",
}: Props) {
  return (
    <Card className="rounded-2xl shadow-sm border-0 bg-card">
      <CardContent className="p-4 space-y-5 md:p-5">
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-xl bg-primary/10 shrink-0">
            <Filter className="w-5 h-5 text-primary" strokeWidth={2} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold text-foreground">{title}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
          </div>
        </div>

        {loading ? (
          <div className="h-32 animate-pulse bg-muted rounded-xl" />
        ) : (
          <>
            {/* Desktop: horizontal */}
            <div className="hidden lg:flex items-stretch justify-between gap-2">
              {steps.map((step, i) => {
                const denom = step.pctOf ?? (i > 0 ? steps[i - 1].value : 0);
                const pct = i > 0 && denom > 0 ? Math.round((step.value / denom) * 100) : null;
                return (
                  <div key={step.label} className="flex items-stretch gap-2 flex-1">
                    {i > 0 && (
                      <div className="flex flex-col items-center justify-center px-1 shrink-0">
                        <ChevronRight className="w-5 h-5 text-muted-foreground/60" strokeWidth={2.5} />
                        <span
                          className={`text-[11px] font-semibold tabular-nums mt-0.5 ${
                            pct !== null ? pctColor(pct) : "text-muted-foreground"
                          }`}
                        >
                          {pct !== null ? `${pct}%` : "—"}
                        </span>
                      </div>
                    )}
                    <div
                      // Mesmo tratamento do bloco de classificação: fundo
                      // bg-muted/40 e SEM sombra — as duas juntas deixavam a
                      // caixa "flutuando" sobre um cinza que já a separa.
                      className={`flex-1 min-w-[110px] flex flex-col items-center justify-center text-center px-4 py-5 rounded-xl transition ${
                        step.highlight ? "bg-success/10 ring-1 ring-success/30" : "bg-muted/40"
                      }`}
                    >
                      {step.highlight && (
                        <ShoppingBag className="w-4 h-4 text-success mb-1" strokeWidth={2} />
                      )}
                      <p
                        className={`text-2xl font-bold tabular-nums leading-none ${
                          step.highlight ? "text-success" : "text-foreground"
                        }`}
                      >
                        {step.value.toLocaleString("pt-BR")}
                      </p>
                      {/* Régua do KPI padrão (21/08): título maiúsculo text-xs. */}
                      <p
                        className={`text-xs font-medium uppercase tracking-wide mt-1.5 leading-tight ${
                          step.highlight ? "text-success" : "text-muted-foreground"
                        }`}
                      >
                        {step.label}
                        {step.tooltip && (
                          <span className="inline-block ml-1">
                            <MetricTooltip text={step.tooltip} iconClassName="w-3 h-3" />
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Celular/tablet (22/10/2026): funil de verdade — cada etapa é uma
                barra do tamanho dela em relação ao topo (dá para VER onde
                o funil estreita), com o número à direita e a taxa da etapa
                escrita com o denominador ("69% das entregues"). As cores de
                semáforo saíram: 10% de resposta é normal e não pode ler como
                alarme. A etapa de resultado (highlight) fecha o funil num
                cartão verde. */}
            <div className="lg:hidden">
              <div className="space-y-4">
                {steps.map((step, i) => {
                  if (step.highlight) return null;
                  const topo = steps[0]?.value ?? 0;
                  const largura = topo > 0 ? Math.max(step.value > 0 ? 2 : 0, (step.value / topo) * 100) : 0;
                  const denom = step.pctOf ?? (i > 0 ? steps[i - 1].value : 0);
                  const pct = i > 0 && denom > 0 ? (step.value / denom) * 100 : null;
                  const leitura =
                    step.pctLabel ?? (step.pctOf !== undefined ? "do total" : i > 0 ? `de ${steps[i - 1].label.toLowerCase()}` : "");
                  return (
                    <div key={step.label}>
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="flex min-w-0 items-center gap-1 text-[14px] font-medium text-foreground">
                          <span className="truncate">{step.label}</span>
                          {step.tooltip && <MetricTooltip text={step.tooltip} iconClassName="w-3 h-3" />}
                        </p>
                        <p className="shrink-0 text-[17px] font-bold tabular-nums text-foreground">
                          {step.value.toLocaleString("pt-BR")}
                        </p>
                      </div>
                      <div className="mt-1.5 h-2.5 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary transition-[width] duration-500"
                          style={{ width: `${largura}%`, opacity: Math.max(0.45, 1 - i * 0.15) }}
                        />
                      </div>
                      <p className="mt-1 text-[12px] text-muted-foreground">
                        {i === 0 ? (
                          "base do funil"
                        ) : pct === null ? (
                          // Etapa sem denominador (nada entregue, nenhum envio no
                          // período): sem taxa, como o "—" do computador.
                          <>— {leitura}</>
                        ) : (
                          <>
                            <span className="font-semibold tabular-nums text-foreground">
                              {pct.toLocaleString("pt-BR", { maximumFractionDigits: pct < 10 ? 1 : 0 })}%
                            </span>{" "}
                            {leitura}
                          </>
                        )}
                      </p>
                    </div>
                  );
                })}
              </div>

              {steps.map((step, i) => {
                if (!step.highlight) return null;
                const denom = step.pctOf ?? (i > 0 ? steps[i - 1].value : 0);
                const pct = i > 0 && denom > 0 ? (step.value / denom) * 100 : null;
                const leitura =
                  step.pctLabel ?? (step.pctOf !== undefined ? "do total" : i > 0 ? `de ${steps[i - 1].label.toLowerCase()}` : "");
                return (
                  <div
                    key={step.label}
                    className="mt-4 flex items-center gap-3 rounded-2xl bg-success/10 p-3.5 ring-1 ring-success/25"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-success/15 text-success">
                      <ShoppingBag className="h-5 w-5" strokeWidth={2} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1 text-[13px] font-semibold text-success">
                        <span className="truncate">{step.label}</span>
                        {step.tooltip && <MetricTooltip text={step.tooltip} iconClassName="w-3 h-3" />}
                      </p>
                      {pct !== null && (
                        <p className="text-[12px] text-muted-foreground">
                          <span className="font-semibold tabular-nums text-foreground">
                            {pct.toLocaleString("pt-BR", { maximumFractionDigits: pct < 10 ? 1 : 0 })}%
                          </span>{" "}
                          {leitura}
                        </p>
                      )}
                    </div>
                    <p className="shrink-0 text-[24px] font-bold tabular-nums text-success">
                      {step.value.toLocaleString("pt-BR")}
                    </p>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
