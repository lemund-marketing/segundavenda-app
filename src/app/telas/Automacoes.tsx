import { useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AlertTriangle, BarChart3, ChevronLeft, Monitor, Search, Send, TestTube2, WifiOff, Zap } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Aviso, Bolinha, CabecalhoTela, Linha, Secao, textoPequeno } from "@/components/mobile/blocos";
import TestWorkflowDialog from "@/components/workflow/TestWorkflowDialog";
import { BulkDispatchPanel } from "@/components/workflow/BulkDispatchPanel";
import { NODE_CATALOG } from "@/components/workflow/nodeCatalog";
import { useSellerContext } from "@/contexts/SellerContext";
import type { Workflow } from "@/types/workflow";
import { cn } from "@/lib/utils";
import { LayoutApp } from "@/app/LayoutApp";
import { FluxoSomenteLeitura } from "@/app/blocos/FluxoSomenteLeitura";
import { useLigarPausar, useListaAutomacoes } from "@/app/dados/useAutomacoes";
import { useVoltarFecha } from "@/app/nativo/useVoltarFecha";

/**
 * O gatilho é o nó de 'Gatilhos' SEM aresta chegando: 'schedule' também é
 * usado como espera no meio do fluxo, e o primeiro do array podia ser ele.
 */
const gatilhoDe = (w: Workflow) => {
  const ehGatilho = (n: { type: string }) => NODE_CATALOG[n.type as keyof typeof NODE_CATALOG]?.category === "Gatilhos";
  const alvos = new Set((w.edges || []).map((e) => e.target));
  const t = (w.nodes || []).find((n) => ehGatilho(n) && !alvos.has(n.id)) ?? (w.nodes || []).find(ehGatilho);
  return t ? NODE_CATALOG[t.type]?.label ?? null : null;
};

const editadaHa = (w: Workflow) =>
  w.updated_at ? `editada ${formatDistanceToNow(new Date(w.updated_at), { addSuffix: true, locale: ptBR })}` : null;

/**
 * Automações, no desenho do celular do site (src/pages/Workflows.tsx, o ramo
 * `isMobile`): quantas estão rodando, a lista com ligar/pausar, as ferramentas
 * (disparo retroativo, desempenho) e o fluxo aberto só para ver, com Testar e
 * Disparar. Criar e editar fluxos é no computador. O fluxo aberto vive na URL
 * (?fluxo=id), como no site; o Voltar do Android o fecha antes de sair da tela.
 */
export default function Automacoes() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { activeSeller } = useSellerContext();

  const fluxoId = searchParams.get("fluxo");
  // Fica no histórico, e não num ref: a tela remonta ao voltar de outra (o
  // "Conecte um agora" do Testar leva a Minha Conta), e o fluxo reaberto pelo
  // Voltar tem de fechar com navigate(-1) também, sem deixar /workflows dobrado.
  const abriuFluxoPorToque = (useLocation().state as { fluxoPorToque?: boolean } | null)?.fluxoPorToque === true;
  const [busca, setBusca] = useState("");

  const [testeAberto, setTesteAberto] = useState(false);
  const [noEmTeste, setNoEmTeste] = useState<string | null>(null);
  const [disparoAberto, setDisparoAberto] = useState(false);
  const [disparoConfig, setDisparoConfig] = useState<{ workflowId: string } | null>(null);

  const listaQ = useListaAutomacoes(activeSeller?.id);
  const { alternar, salvando } = useLigarPausar();
  const workflows = listaQ.data ?? [];
  // Sem internet a consulta fica em espera (nem dado, nem erro, nem carregando)
  // e volta sozinha com a conexão: não pode cair no "0 de 0".
  const semInternet = listaQ.isPending && listaQ.isPaused;

  // No celular nada se edita: o fluxo aberto é sempre a linha mais nova da
  // lista (pausado ou editado no computador enquanto isso).
  const fluxo = fluxoId ? workflows.find((w) => w.id === fluxoId) ?? null : null;

  const abrirFluxo = (w: Workflow) => {
    const p = new URLSearchParams(searchParams);
    p.set("fluxo", w.id);
    setSearchParams(p, { state: { fluxoPorToque: true } });
  };
  const fecharFluxo = () => {
    if (abriuFluxoPorToque) {
      navigate(-1);
      return;
    }
    const p = new URLSearchParams(searchParams);
    p.delete("fluxo");
    setSearchParams(p, { replace: true });
  };
  useVoltarFecha(!!fluxo, fecharFluxo);

  const abrirDisparo = (workflowId: string | null) => {
    setDisparoConfig(workflowId ? { workflowId } : null);
    setDisparoAberto(true);
  };

  const ativas = workflows.filter((w) => w.active).length;
  const termo = busca.trim().toLowerCase();
  const lista = termo ? workflows.filter((w) => w.name.toLowerCase().includes(termo)) : workflows;

  const listaView = (
    <div className="flex flex-col gap-7 px-4 pb-6 pt-4">
      <CabecalhoTela
        icone={Zap}
        titulo="Automações"
        direita={
          <Link
            to="/workflow-stats"
            className="flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-border/60 bg-card px-3 text-[13px] font-semibold text-foreground active:bg-muted"
          >
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
            Desempenho
          </Link>
        }
      />

      {listaQ.isError ? (
        <Aviso
          tom="vermelho"
          icone={AlertTriangle}
          titulo="Não foi possível carregar as automações"
          acao={{ rotulo: listaQ.isFetching ? "Tentando…" : "Tentar de novo", onClick: () => listaQ.refetch() }}
        >
          A consulta falhou. Tente de novo em alguns instantes.
        </Aviso>
      ) : semInternet ? (
        <div className="flex flex-col items-center gap-2 rounded-3xl border border-border/60 bg-card px-6 py-8 text-center">
          <WifiOff className="h-6 w-6 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">Sem internet</p>
          <p className="text-[13px] text-muted-foreground">Suas automações aparecem assim que a conexão voltar.</p>
        </div>
      ) : listaQ.isPending ? (
        <>
          <div className="space-y-2">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-11 w-32" />
            <Skeleton className="h-4 w-64" />
          </div>
          <Skeleton className="h-[260px] rounded-3xl" />
        </>
      ) : (
        <>
          <section>
            <p className="text-sm font-medium text-muted-foreground">Rodando agora</p>
            <p className="mt-1 text-[38px] font-semibold leading-tight tracking-tight tabular-nums text-foreground">
              {ativas}
              <span className="text-[20px] font-semibold text-muted-foreground"> de {workflows.length}</span>
            </p>
            <p className="mt-1 text-[13px] text-muted-foreground">
              {ativas === 1 ? "automação ativa" : "automações ativas"} · as pausadas não disparam nada
            </p>
          </section>

          {workflows.length > 6 && (
            <div className="relative -mt-3">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar automação"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="h-11 rounded-full border-border/60 bg-card pl-10 text-[15px]"
              />
            </div>
          )}

          <Secao titulo="Suas automações" direita={textoPequeno("toque para ver o fluxo")}>
            {lista.length === 0 ? (
              <li className="px-4 py-6 text-center text-sm text-muted-foreground">
                {workflows.length === 0 ? "Nenhuma automação criada ainda." : "Nenhuma automação com esse nome."}
              </li>
            ) : (
              lista.map((w) => {
                const gatilho = gatilhoDe(w);
                const etapas = (w.nodes || []).length;
                const editada = editadaHa(w);
                return (
                  <li key={w.id} className="flex items-center gap-3 px-4 py-3">
                    <button
                      type="button"
                      onClick={() => abrirFluxo(w)}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    >
                      <span
                        className={cn(
                          "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
                          w.active ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
                        )}
                      >
                        <Zap className="h-5 w-5" strokeWidth={2} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-medium text-foreground">{w.name}</span>
                        <span className="block truncate text-[13px] text-muted-foreground">
                          {[w.active ? "Ativa" : "Pausada", gatilho, `${etapas} ${etapas === 1 ? "etapa" : "etapas"}`]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                        {editada && <span className="block truncate text-[12px] text-muted-foreground/80">{editada}</span>}
                      </span>
                    </button>
                    <Switch
                      checked={w.active}
                      disabled={salvando.has(w.id)}
                      onCheckedChange={() => void alternar(w)}
                      aria-label={w.active ? `Pausar ${w.name}` : `Ativar ${w.name}`}
                    />
                  </li>
                );
              })
            )}
          </Secao>
        </>
      )}

      <Secao titulo="Ferramentas">
        <Linha
          onClick={() => abrirDisparo(null)}
          icone={
            <Bolinha neutra>
              <Send className="h-5 w-5" strokeWidth={2} />
            </Bolinha>
          }
          titulo="Disparo retroativo"
          apoio="mandar uma automação para clientes que já compraram"
        />
        <Linha
          to="/workflow-stats"
          icone={
            <Bolinha neutra>
              <BarChart3 className="h-5 w-5" strokeWidth={2} />
            </Bolinha>
          }
          titulo="Desempenho"
          apoio="envios, respostas e vendas por automação"
        />
      </Secao>

      <Aviso tom="neutro" icone={Monitor} titulo="Criar e editar fluxos é no computador">
        O editor precisa de espaço para arrastar e ligar as etapas. Aqui você vê o fluxo, liga, pausa e testa.
      </Aviso>
    </div>
  );

  // O fluxo cobre a tela inteira, sem o topo do app nem a barra de baixo, como
  // no site. A lista continua montada embaixo: ao fechar, ela está onde estava.
  // `touch-none`: o dedo no cabeçalho ou no rodapé do fluxo não rola a lista
  // escondida embaixo (no site ela nem fica montada).
  const fluxoView = fluxo && (
    <div className="fixed inset-0 z-[45] flex touch-none flex-col bg-background">
      <div className="flex shrink-0 items-center gap-2 border-b border-border/60 bg-card px-2 pb-2 pt-[calc(0.5rem+env(safe-area-inset-top))]">
        <button
          type="button"
          onClick={fecharFluxo}
          aria-label="Voltar para a lista"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full active:bg-muted"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[16px] font-semibold text-foreground">{fluxo.name}</p>
          <p className="truncate text-[12px] text-muted-foreground">
            {fluxo.active ? "Ativa" : "Pausada"} · {(fluxo.nodes || []).length}{" "}
            {(fluxo.nodes || []).length === 1 ? "etapa" : "etapas"}
          </p>
        </div>
        <Switch
          className="mr-2"
          checked={fluxo.active}
          disabled={salvando.has(fluxo.id)}
          onCheckedChange={() => void alternar(fluxo)}
          aria-label={fluxo.active ? "Pausar automação" : "Ativar automação"}
        />
      </div>

      <div className="relative min-h-0 flex-1">
        {/* `key`: outro fluxo começa enquadrado do zero. */}
        <FluxoSomenteLeitura key={fluxo.id} nodes={fluxo.nodes || []} edges={fluxo.edges || []} noEmTeste={noEmTeste} />
        <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
          <span className="rounded-full border border-border/60 bg-card/95 px-3 py-1 text-[12px] font-medium text-muted-foreground shadow-sm">
            Só visualização · edite no computador
          </span>
        </div>
      </div>

      <div className="flex shrink-0 gap-2 border-t border-border/60 bg-card px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3">
        <Button variant="outline" className="h-11 flex-1 rounded-full border-border/60" onClick={() => setTesteAberto(true)}>
          <TestTube2 className="mr-2 h-4 w-4" />
          Testar
        </Button>
        {(fluxo.nodes || []).some((n) => n.type === "retroactive-trigger") && (
          <Button className="h-11 flex-1 rounded-full" onClick={() => abrirDisparo(fluxo.id)}>
            <Send className="mr-2 h-4 w-4" />
            Disparar
          </Button>
        )}
      </div>
    </div>
  );

  return (
    <LayoutApp ocultarNavInferior={!!fluxo}>
      {listaView}
      {fluxoView}

      <TestWorkflowDialog
        open={testeAberto}
        onOpenChange={setTesteAberto}
        workflowName={fluxo?.name}
        workflowId={fluxo?.id}
        nodes={fluxo?.nodes ?? []}
        edges={fluxo?.edges ?? []}
        sellerId={activeSeller?.id || ""}
        isWorkflowActive={fluxo?.active ?? false}
        onActiveTestNodeChange={setNoEmTeste}
      />
      <BulkDispatchPanel
        open={disparoAberto}
        onOpenChange={(v) => {
          setDisparoAberto(v);
          if (!v) setDisparoConfig(null);
        }}
        workflows={workflows}
        sellerId={activeSeller?.id || ""}
        initialConfig={disparoConfig}
      />
    </LayoutApp>
  );
}
