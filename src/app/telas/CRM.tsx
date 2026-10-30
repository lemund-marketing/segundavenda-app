import { useCallback, useSyncExternalStore } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSellerContext } from "@/contexts/SellerContext";
import { KanbanBoard } from "@/components/crm/KanbanBoard";
import { CabecalhoTela } from "@/components/mobile/blocos";
import { LayoutApp } from "@/app/LayoutApp";
import { FaixaSemRede } from "@/app/blocos/FaixaSemRede";
import { useSemRede } from "@/app/nativo/useSemRede";

/**
 * Estado da consulta das fases, que mora dentro do KanbanBoard copiado do
 * site (mesma chave). Só lê o cache: um segundo useQuery com a mesma chave
 * trocaria as opções da consulta.
 */
function useEstadoDasFases(sellerId: string | undefined) {
  const queryClient = useQueryClient();
  const assinar = useCallback((avisar: () => void) => queryClient.getQueryCache().subscribe(avisar), [queryClient]);
  return useSyncExternalStore(assinar, () => queryClient.getQueryState(["pipeline-stages", sellerId]));
}

/**
 * Kanban CRM: a casca da página do site (src/pages/CRM.tsx) no desenho de
 * celular. O corpo (resumo do funil, busca e filtros, uma fase por vez com as
 * abas no topo, mover de fase, seleção em massa e a ficha do cliente) é o
 * `KanbanBoard` copiado do site, que no app sempre desenha o celular. As
 * guardas do site ficam na rota, em App.tsx.
 */
export default function CRM() {
  const { activeSeller } = useSellerContext();
  const queryClient = useQueryClient();
  // Sem internet as consultas ficam em espera (nem dado, nem erro, nem
  // carregando) e as colunas diriam "Nenhum lead nesta fase" com contagem 0.
  const semRede = useSemRede();
  // Erro não é "loja sem fases": com a leitura das fases falhando, o quadro
  // desenhava só o "Nova fase", como se o funil estivesse vazio.
  const fases = useEstadoDasFases(activeSeller?.id);
  const erroNasFases = fases?.status === "error" && fases.data === undefined;
  const tentando = fases?.fetchStatus === "fetching";

  return (
    <LayoutApp>
      {/* Altura exata da área entre a faixa do logo (h-12) e o espaço da
          cápsula de navegação, como o `alturaCheia` do AppLayout do site: o
          quadro mede 100cqh deste contêiner, então rolando até ele as abas
          das fases encostam no topo e a lista de cards rola por dentro. */}
      <div className="h-[calc(100dvh-8.5rem-env(safe-area-inset-bottom))] overflow-y-auto overflow-x-hidden [container-type:size]">
        {semRede && (
          <FaixaSemRede>
            Sem internet. Até a conexão voltar, as fases e os números abaixo podem estar zerados ou desatualizados.
          </FaixaSemRede>
        )}
        <div className="px-4 pt-4">
          <CabecalhoTela icone={UserCheck} titulo="CRM" />
        </div>
        {erroNasFases && (
          <div className="px-4 pb-6 pt-4">
            <div className="flex flex-col items-center gap-3 rounded-3xl border border-border/60 bg-card px-6 py-8 text-center">
              <AlertTriangle className="h-6 w-6 text-muted-foreground" />
              <p className="text-sm font-medium text-foreground">Não foi possível carregar as fases do funil.</p>
              <Button
                variant="outline"
                size="sm"
                className="rounded-full"
                disabled={tentando}
                onClick={() => queryClient.refetchQueries({ queryKey: ["pipeline-stages", activeSeller?.id] })}
              >
                {tentando ? "Tentando…" : "Tentar de novo"}
              </Button>
            </div>
          </div>
        )}
        {/* O quadro fica montado, só escondido, durante o erro: é ele que busca
            as fases, também de novo ao voltar para a tela. */}
        {activeSeller && (
          <div className={erroNasFases ? "hidden" : "contents"}>
            <KanbanBoard sellerId={activeSeller.id} />
          </div>
        )}
      </div>
    </LayoutApp>
  );
}
