import { useMemo } from "react";
import { RotateCw } from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import { Skeleton } from "@/components/ui/skeleton";
import {
  ClientesScreen,
  CLIENTES_PERIODO_TUDO,
} from "@/components/clients/ClientesScreen";
import type { ClientesFilterPayload } from "@/components/clients/clientesFilters";
import type { ClientesInsightsExtraTab } from "@/components/clients/ClientesInsightsV2";
import { cn } from "@/lib/utils";

import { INK_BG, INK_TEXT, chartTooltipProps, fmtInt, useLojaInk } from "./lojaDetailShared";
import { useLojaExclusividade } from "./lojaDetailQueries";

interface Props {
  sellerId: string | undefined;
  slug: string;
  label: string;
  /** Valor cru do seletor do cabeçalho ("7" … "365", "all"). */
  period: string;
  onPeriodChange: (period: string) => void;
  active: boolean;
}

/**
 * Os dois vocabulários de período casam 1:1; só o "todo" tem nome diferente
 * (`all` no cabeçalho da loja, 9999 dias na tela de Clientes). Traduzir aqui é
 * o que mantém UM seletor só valendo para as quatro abas — o próprio LojaHeader
 * documenta a regra ("período por aba faz o cabeçalho dizer 30 dias enquanto a
 * aba mostra 90").
 */
const paraClientes = (p: string) => (p === "all" ? CLIENTES_PERIODO_TUDO : p);
const paraLoja = (p: string) => (p === CLIENTES_PERIODO_TUDO ? "all" : p);

/* ------------------------------------------------------- donut de exclusividade */

function ExclusividadePainel({
  sellerId,
  slug,
  label,
  filters,
  enabled,
}: {
  sellerId: string | undefined;
  slug: string;
  label: string;
  filters: ClientesFilterPayload;
  enabled: boolean;
}) {
  const q = useLojaExclusividade(sellerId, slug, filters, enabled);

  const exclusivos = q.data?.exclusive_clients ?? 0;
  const compartilhados = q.data?.shared_clients ?? 0;
  const total = exclusivos + compartilhados;

  const dados = useMemo(
    () => [
      { name: `Só em ${label}`, value: exclusivos },
      { name: "Também em outra loja", value: compartilhados },
    ],
    [label, exclusivos, compartilhados],
  );

  if (q.isLoading && !q.data) {
    return (
      <div className="h-full min-h-[240px] flex flex-col items-center justify-center gap-4">
        <Skeleton className="w-[160px] h-[160px] rounded-full" />
        <Skeleton className="h-3 w-40" />
      </div>
    );
  }

  // Erro tem de parecer erro: sem isto, RPC fora do ar vira "nenhum cliente".
  if (q.isError) {
    return (
      <div className="h-full min-h-[240px] flex flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-destructive max-w-[18rem] leading-relaxed">
          Não foi possível carregar estes dados.
        </p>
        <button
          type="button"
          onClick={() => q.refetch()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted transition-colors"
        >
          <RotateCw className="w-3.5 h-3.5" />
          Tentar de novo
        </button>
      </div>
    );
  }

  if (total === 0) {
    return (
      <div className="h-full min-h-[240px] flex items-center justify-center px-6 text-center">
        <p className="text-sm text-muted-foreground max-w-[18rem] leading-relaxed">
          Nenhum cliente neste recorte.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3">
      {/* A tinta da loja vem por `currentColor`: cor crua em JS não responde à
          troca de tema, e a marca escura some no tema escuro. */}
      <div className={cn("relative w-[200px] h-[200px]", INK_TEXT)}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={dados}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={92}
              paddingAngle={3}
              dataKey="value"
              nameKey="name"
              startAngle={90}
              endAngle={450}
              isAnimationActive={false}
            >
              <Cell fill="currentColor" stroke="hsl(var(--card))" strokeWidth={3} />
              <Cell
                fill="hsl(var(--muted-foreground))"
                fillOpacity={0.35}
                stroke="hsl(var(--card))"
                strokeWidth={3}
              />
            </Pie>
            <Tooltip {...chartTooltipProps} formatter={(v: number) => fmtInt(v)} />
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none px-6 text-center">
          <span className="text-2xl font-bold text-foreground tabular-nums">{fmtInt(total)}</span>
          <span className="text-[10px] leading-tight text-muted-foreground">
            clientes
            <br />
            no recorte
          </span>
        </div>
      </div>

      <div className="flex flex-wrap justify-center gap-x-5 gap-y-2">
        <div className="flex items-center gap-2">
          <span className={cn("w-2.5 h-2.5 rounded-full shrink-0", INK_BG)} />
          <span className="text-xs font-medium text-foreground">Só em {label}</span>
          <span className="text-xs text-muted-foreground tabular-nums">
            {fmtInt(exclusivos)} · {((exclusivos / total) * 100).toFixed(0)}%
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-muted-foreground/40 shrink-0" />
          <span className="text-xs font-medium text-foreground">Também em outra loja</span>
          <span className="text-xs text-muted-foreground tabular-nums">
            {fmtInt(compartilhados)} · {((compartilhados / total) * 100).toFixed(0)}%
          </span>
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground text-center leading-snug">
        “Também em outra loja” olha o histórico inteiro do cliente, não só o período — a aba
        Sobreposição, em Lojas, responde a mesma pergunta dentro da janela.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------- a aba */

/**
 * A aba Clientes da loja É a tela `/clientes`, com a loja travada no recorte.
 *
 * Nada aqui refaz KPIs, gráficos, filtros ou paginação: tudo isso é
 * `ClientesScreen`, o mesmo componente que a página do menu monta. A trava
 * desce por UM ponto (`lockedMarketplace` → `marketplaces` + `marketplacesFrom`
 * no payload), então lista, os seis KPIs, os gráficos, as facetas do sheet e as
 * três sheets de KPI nascem recortados — e nenhum "Limpar", chip ou `?f=`
 * editado à mão devolve as outras lojas.
 *
 * A trava carrega o PERÍODO junto (`marketplacesFrom`): "clientes de Mercado
 * Livre nos últimos 30 dias" é quem comprou LÁ na janela, e é o mesmo conjunto
 * que o cabeçalho da loja e a aba Visão Geral contam.
 *
 * O que a versão anterior tinha e não voltou: os quatro KPIs de loja, "Top
 * estados" e "Atividade da base". Eram os únicos blocos fora do recorte da tela
 * (a faixa de recência é lifetime e ignorava até o período), e a tela principal
 * já responde as mesmas perguntas dentro do recorte. Sobreviveu só a
 * Exclusividade, refeita sobre o motor de filtros — ver ExclusividadePainel.
 */
export function LojaClientesTab({ sellerId, slug, label, period, onPeriodChange, active }: Props) {
  const ink = useLojaInk(slug);

  const abaExclusividade = useMemo<ClientesInsightsExtraTab>(
    () => ({
      key: "exclusividade",
      label: "Exclusividade",
      render: (filters) => (
        <ExclusividadePainel
          sellerId={sellerId}
          slug={slug}
          label={label}
          filters={filters}
          enabled={active}
        />
      ),
    }),
    [sellerId, slug, label, active],
  );

  return (
    <div style={ink.vars}>
      <ClientesScreen
        className="space-y-6"
        lockedMarketplace={slug}
        lockedMarketplaceLabel={label}
        period={paraClientes(period)}
        onPeriodChange={(p) => onPeriodChange(paraLoja(p))}
        // Um seletor só na tela: o do cabeçalho, que vale para as quatro abas.
        // Com os dois, o mesmo estado aparecia escrito de duas formas a 300px de
        // distância ("365 dias" no cabeçalho, "Último ano" na barra).
        hidePeriodSelect
        // O CSV de clientes sai por intervalo de datas e ignora os filtros da
        // tela (o próprio diálogo avisa em âmbar). Dentro da loja isso seria um
        // arquivo com o seller inteiro a um clique da tela que promete estar
        // travada — o export vive na aba Clientes do menu.
        showExport={false}
        // `get_clients_store_distribution` repete o predicado de canal: sob a
        // trava a aba "Lojas" vira uma barra em 100%, sem pergunta nenhuma.
        hideStoresTab
        insightsExtraTab={abaExclusividade}
        // No celular, a versão de app da tela, sem o título dela: o cabeçalho é o da loja.
        embutidaMobile
      />
    </div>
  );
}

export default LojaClientesTab;
