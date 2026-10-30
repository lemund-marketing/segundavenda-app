import { Card, CardContent } from "@/components/ui/card";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  SkeletonKpi,
  SkeletonLinhas,
  SkeletonGrafico,
  SkeletonTabela,
} from "@/components/skeletons/PageSkeletons";

/**
 * Esqueleto da página de PERFORMANCE (/workflow-stats).
 *
 * A página é QUATRO telas diferentes atrás do mesmo endereço (?tab=overview,
 * whatsapp, email, sms) e elas não têm a mesma forma:
 *
 *   overview  → 4 KPIs (2/4 colunas) + 3 cartões de canal
 *   whatsapp  → 6 KPIs (1/2/3) + funil de 4 etapas + gráfico(2)/top 3(1) + templates
 *   email     → mesma forma do whatsapp
 *   sms       → 8 KPIs (1/2/4) + funil + gráfico(2)/top 3(1) + cards de template
 *
 * Um esqueleto genérico prometeria a tela errada em três dos quatro casos, por
 * isso este componente recebe a aba ativa.
 *
 * Três escolhas que não são óbvias:
 *
 * 1) NÃO uso o SkeletonPanel. Ele desenha a faixa cinza do PanelHeader (ícone +
 *    título + subtítulo, ~56px de altura) e NENHUM bloco desta página tem essa
 *    faixa: funil, análise e top 3 são Card com um título de 14px dentro do
 *    corpo. Usá-lo somaria ~40px por bloco e empurraria a tela inteira quando o
 *    conteúdo real chegasse — exatamente o pulo que o esqueleto existe para
 *    evitar. Uso o Card/CardContent REAIS, com as mesmas classes, e ponho as
 *    peças de esqueleto no lugar do que depende de dado.
 *
 * 2) NÃO uso o SkeletonKpiRow: a grade dele é 1/sm:2/xl:4 e nenhuma das três
 *    faixas de KPI daqui usa essa grade. Monto a grade real e repito a peça
 *    SkeletonKpi dentro dela.
 *
 * 3) Os títulos FIXOS ("Funil de mensagens", "Análise Detalhada", "Desempenho
 *    por canal"…) aparecem de verdade, não como retângulo cinza: eles não
 *    dependem de nenhum dado, então não mudam quando a resposta chega e não há
 *    o que prometer. Já o título do top 3 do SMS muda com os dados ("por
 *    Cliques" ou "por Envios") — esse continua cinza.
 *
 * Regra ao mexer: se o bloco real mudar de forma (nº de KPIs, colunas do grid,
 * altura do gráfico), a peça daqui muda junto.
 */

export type AbaPerformance = "overview" | "whatsapp" | "email" | "sms";

/* ------------------------------------------------------------------ */
/* Auxiliares de composição (só arranjam as peças, não criam peça nova) */
/* ------------------------------------------------------------------ */

/** Faixa de KPIs: a MESMA contagem e a MESMA grade do bloco real. */
function GradeKpis({ quantidade, grade }: { quantidade: number; grade: string }) {
  return (
    <div className={grade}>
      {Array.from({ length: quantidade }, (_, i) => (
        <SkeletonKpi key={i} />
      ))}
    </div>
  );
}

/**
 * Retângulo de largura limitada — usado onde o real é uma linha curta de texto
 * (rodapé do cartão, "Ver detalhes") ou um controle (o grupo de abas do
 * gráfico). O SkeletonGrafico é `w-full`, então quem define a largura é o pai.
 */
function BarraCurta({ largura, altura = 14 }: { largura: string; altura?: number }) {
  return (
    <div className={largura}>
      <SkeletonGrafico altura={altura} />
    </div>
  );
}

/**
 * Área de gráfico que muda de altura em 2xl. O SkeletonGrafico só aceita px
 * (vai por `style`), e um `style` inline ganha de qualquer classe responsiva —
 * por isso são dois elementos alternados por breakpoint em vez de uma classe.
 */
function GraficoResponsivo({ altura, altura2xl }: { altura: number; altura2xl: number }) {
  return (
    <>
      <div className="2xl:hidden">
        <SkeletonGrafico altura={altura} />
      </div>
      <div className="hidden 2xl:block">
        <SkeletonGrafico altura={altura2xl} />
      </div>
    </>
  );
}

/** Cartão do funil: título + 4 etapas lado a lado (Disparos → … → Responderam). */
function BlocoFunil({ titulo, gradeEtapas }: { titulo: string; gradeEtapas: string }) {
  return (
    <Card className="rounded-2xl shadow-sm bg-card">
      <CardContent className="p-6">
        <h3 className="text-sm font-semibold text-foreground mb-4">{titulo}</h3>
        <div className={gradeEtapas}>
          {/* cada etapa: ícone + rótulo, número grande e a barrinha de % */}
          {Array.from({ length: 4 }, (_, i) => (
            <SkeletonGrafico key={i} altura={104} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Lista de templates (TemplatesList).
 *
 * O modo de visualização é do USUÁRIO e fica no localStorage: quem deixou a
 * tela em tabela veria um esqueleto de cards e a tela trocaria de forma ao
 * carregar. Por isso lemos a mesma chave que o TemplatesList grava.
 */
const CHAVE_VIEW_TEMPLATES = "templates-view-mode";

function BlocoTemplates() {
  // No celular a lista é sempre em cards (TemplatesList), mesmo com "table"
  // salvo de antes: o esqueleto segue a mesma regra para não trocar de forma.
  const isMobile = useIsMobile();
  let salvoTabela = false;
  try {
    salvoTabela = typeof window !== "undefined" && localStorage.getItem(CHAVE_VIEW_TEMPLATES) === "table";
  } catch {
    /* armazenamento bloqueado */
  }
  const emTabela = !isMobile && salvoTabela;

  return (
    <div className="space-y-4">
      {/* Barra de filtros: busca + categoria + ordenação + "Mais filtros" +
          alternador de visão. Tudo com 40px de altura dentro de um cartão p-3. */}
      <Card className="rounded-2xl shadow-sm bg-card">
        <CardContent className="p-3">
          <SkeletonGrafico altura={40} />
        </CardContent>
      </Card>

      {emTabela ? (
        <Card className="rounded-2xl shadow-sm bg-card">
          <CardContent className="p-4">
            {/* ● · Nome · Envios · Entrega% · Leitura|Abertura% · Resp.|Clique% · Não entregues */}
            <SkeletonTabela linhas={8} colunas={7} />
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }, (_, i) => (
            <SkeletonGrafico key={i} altura={176} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Aba: visão geral                                                    */
/* ------------------------------------------------------------------ */

/** Um dos três cartões de resumo por canal (WhatsApp, Email, SMS). */
function CartaoCanal() {
  return (
    <Card className="rounded-2xl shadow-sm bg-card flex flex-col">
      <CardContent className="p-5 flex flex-col flex-1">
        {/* chip do ícone + nome do canal + selo "Ativo / Sem envios" */}
        <div className="mb-4">
          <SkeletonLinhas quantidade={1} />
        </div>
        {/* mini-sparkline (48px, igual à do componente real) */}
        <div className="mb-4">
          <SkeletonGrafico altura={48} />
        </div>
        {/* trio de KPIs do canal: Enviadas · Entrega · Leitura/Abertura/Clique */}
        <div className="grid grid-cols-3 gap-2 mb-3">
          {Array.from({ length: 3 }, (_, i) => (
            <SkeletonGrafico key={i} altura={38} />
          ))}
        </div>
        {/* rodapé: "N templates ativos · N não entregues" */}
        <div className="mb-3 pt-3 border-t border-border/60">
          <SkeletonGrafico altura={12} />
        </div>
        {/* CTA "Ver detalhes" */}
        <div className="mt-auto pt-1">
          <BarraCurta largura="w-24" />
        </div>
      </CardContent>
    </Card>
  );
}

function AbaVisaoGeral() {
  return (
    // Mesmos vãos da tela real: compacto por padrão, generoso só em 2xl.
    <div className="space-y-4 2xl:space-y-8">
      {/* Enviadas · Templates ativos · Gasto · Compraram após contato */}
      <GradeKpis quantidade={4} grade="grid grid-cols-2 lg:grid-cols-4 gap-4" />

      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground">Desempenho por canal</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {["whatsapp", "email", "sms"].map((canal) => (
            <CartaoCanal key={canal} />
          ))}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Abas de canal: WhatsApp e Email                                     */
/* ------------------------------------------------------------------ */

/**
 * WhatsApp e Email têm EXATAMENTE a mesma forma (6 KPIs, funil de 4 etapas,
 * gráfico 2/3 + top 3 1/3, lista de templates). Muda só o texto do top 3.
 */
function AbaCanal({ tituloTop3 }: { tituloTop3: string }) {
  return (
    <div className="space-y-4 2xl:space-y-6">
      <GradeKpis quantidade={6} grade="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" />

      <BlocoFunil titulo="Funil de mensagens" gradeEtapas="grid grid-cols-2 md:grid-cols-4 gap-3" />

      {/* Análise detalhada (2 colunas) + Top 3 templates (1 coluna) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 2xl:gap-6">
        <div className="lg:col-span-2">
          <Card className="rounded-2xl shadow-sm bg-card h-full">
            <CardContent className="p-4 2xl:p-6">
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <h3 className="text-sm font-semibold text-foreground">Análise Detalhada</h3>
                {/* grupo das abas: Evolução Diária · Melhor Horário · Não entregues */}
                <BarraCurta largura="w-[264px]" altura={34} />
              </div>
              {/* o gráfico real é h-[220px] e sobe para 300px a partir de 2xl */}
              <GraficoResponsivo altura={220} altura2xl={300} />
            </CardContent>
          </Card>
        </div>
        <div>
          <Card className="rounded-2xl shadow-sm bg-card h-full">
            <CardContent className="p-6">
              <h3 className="text-sm font-semibold text-foreground mb-4">{tituloTop3}</h3>
              {/* medalha + nome do template + métricas, com o número à direita */}
              <SkeletonLinhas quantidade={3} />
            </CardContent>
          </Card>
        </div>
      </div>

      <BlocoTemplates />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Aba: SMS                                                            */
/* ------------------------------------------------------------------ */

/**
 * Exportado à parte porque quem sabe que o SMS está carregando é o próprio
 * SmsWorkflowTab (ele tem as queries dele). Assim a aba não precisa esperar a
 * página para mostrar a forma certa, e a forma é a mesma definida aqui.
 */
export function SkeletonAbaSms() {
  return (
    <div className="space-y-6">
      {/* 8 KPIs: Enviados · Aceitação · Entrega · Clique · Custo · Não entrega ·
          Tempo até 1º clique · Tempo médio de entrega */}
      <GradeKpis quantidade={8} grade="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3" />

      <BlocoFunil titulo="Funil de Mensagens" gradeEtapas="grid grid-cols-2 lg:grid-cols-4 gap-3" />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <Card className="rounded-2xl shadow-sm h-full">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <h3 className="text-sm font-semibold text-foreground">Análise Detalhada</h3>
                <BarraCurta largura="w-[264px]" altura={34} />
              </div>
              {/* aqui o gráfico é 300px fixo, sem variação em 2xl */}
              <SkeletonGrafico altura={300} />
            </CardContent>
          </Card>
        </div>
        <div>
          <Card className="rounded-2xl shadow-sm h-full">
            <CardContent className="p-6">
              {/* o título depende dos dados ("por Cliques" ou "por Envios") */}
              <div className="mb-4">
                <BarraCurta largura="w-52" />
              </div>
              <SkeletonLinhas quantidade={3} />
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Templates SMS (grade de cards, não a TemplatesList das outras abas) */}
      <Card className="rounded-2xl shadow-sm">
        <CardContent className="p-6">
          <div className="mb-4">
            <h3 className="text-base font-semibold text-foreground">Templates SMS</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Todos os templates ativos. Clique para ver detalhes.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {Array.from({ length: 6 }, (_, i) => (
              <SkeletonGrafico key={i} altura={190} />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */

export function WorkflowStatsSkeleton({ aba }: { aba: AbaPerformance }) {
  if (aba === "overview") return <AbaVisaoGeral />;
  if (aba === "sms") return <SkeletonAbaSms />;
  return (
    <AbaCanal
      tituloTop3={
        aba === "email" ? "Top 3 Templates por Abertura" : "Top 3 Templates por Leitura"
      }
    />
  );
}

export default WorkflowStatsSkeleton;
