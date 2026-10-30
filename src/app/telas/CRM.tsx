import { useSyncExternalStore } from "react";
import { UserCheck, WifiOff } from "lucide-react";
import { useSellerContext } from "@/contexts/SellerContext";
import { KanbanBoard } from "@/components/crm/KanbanBoard";
import { CabecalhoTela } from "@/components/mobile/blocos";
import { LayoutApp } from "@/app/LayoutApp";

const assinarRede = (avisar: () => void) => {
  window.addEventListener("online", avisar);
  window.addEventListener("offline", avisar);
  return () => {
    window.removeEventListener("online", avisar);
    window.removeEventListener("offline", avisar);
  };
};

/**
 * Kanban CRM: a casca da página do site (src/pages/CRM.tsx) no desenho de
 * celular. O corpo (resumo do funil, busca e filtros, uma fase por vez com as
 * abas no topo, mover de fase, seleção em massa e a ficha do cliente) é o
 * `KanbanBoard` copiado do site, que no app sempre desenha o celular. As
 * guardas do site ficam na rota, em App.tsx.
 */
export default function CRM() {
  const { activeSeller } = useSellerContext();
  // Sem internet as consultas ficam em espera (nem dado, nem erro, nem
  // carregando) e as colunas diriam "Nenhum lead nesta fase" com contagem 0.
  const semRede = useSyncExternalStore(assinarRede, () => !navigator.onLine);

  return (
    <LayoutApp>
      {/* Altura exata da área entre a faixa do logo (h-12) e o espaço da
          cápsula de navegação, como o `alturaCheia` do AppLayout do site: o
          quadro mede 100cqh deste contêiner, então rolando até ele as abas
          das fases encostam no topo e a lista de cards rola por dentro. */}
      <div className="h-[calc(100dvh-8.5rem-env(safe-area-inset-bottom))] overflow-y-auto overflow-x-hidden [container-type:size]">
        {semRede && (
          <div className="mx-4 mt-4 flex items-center gap-2.5 rounded-2xl border border-border/60 bg-card px-4 py-3">
            <WifiOff className="h-4 w-4 shrink-0 text-muted-foreground" />
            <p className="text-[13px] leading-snug text-muted-foreground">
              Sem internet. Até a conexão voltar, as fases e os números abaixo podem estar zerados ou desatualizados.
            </p>
          </div>
        )}
        <div className="px-4 pt-4">
          <CabecalhoTela icone={UserCheck} titulo="CRM" />
        </div>
        {activeSeller && <KanbanBoard sellerId={activeSeller.id} />}
      </div>
    </LayoutApp>
  );
}
