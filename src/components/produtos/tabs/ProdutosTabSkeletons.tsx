import {
  SkeletonPanel,
  SkeletonLinhas,
  SkeletonTabela,
  SkeletonGrafico,
} from "@/components/skeletons/PageSkeletons";
import { Skeleton } from "@/components/ui/skeleton";
import { ProductKPIRowSkeleton } from "../shared/ProductKPICard";

/**
 * Esqueletos das três abas de /produtos — um por aba, com a MESMA FORMA do que
 * carrega depois: mesmo número de KPIs, mesmo grid, mesmos blocos, mesma ordem.
 *
 * Ficam num arquivo só, ao lado das abas: quando o bloco real mudar de forma, a
 * peça daqui muda junto.
 *
 * Nada de barra de topo aqui: o AppLayout já renderiza a de verdade por trás, e
 * o PageHeader da página fica fora do conteúdo que troca de aba.
 *
 * Por que a fileira de KPIs usa `ProductKPIRowSkeleton` e não o `SkeletonKpiRow`
 * comum: o cartão desta página (`ProductKPICard`) é HORIZONTAL — chip do ícone
 * de 40px à esquerda, rótulo/valor/subtítulo à direita — e abre em 4 colunas já
 * no `lg`. O `SkeletonKpiRow` desenha o cartão vertical do dashboard (ícone no
 * canto superior direito) e só abre em 4 colunas no `xl`: entre 1024 e 1280px
 * ele prometeria 2 colunas onde a tela mostra 4. `ProductKPIRowSkeleton` já é o
 * espelho exato deste cartão — é a peça certa justamente pela regra de ouro.
 */

/** Analytics: 4 KPIs + Ranking de Produtos e Ranking de Categorias lado a lado. */
export function AnalyticsTabSkeleton() {
  return (
    <div className="space-y-6 mt-6">
      <ProductKPIRowSkeleton />

      {/* O ProductCategorizationBanner NÃO entra: ele só existe quando há
          produto sem categoria. Prometer a faixa e não entregar empurraria o
          grid inteiro para cima na hora em que os dados chegam — o mesmo pulo
          que o esqueleto existe para evitar. */}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Ranking de Produtos: linha com o chip da posição (#1), nome,
            categoria/loja e os números à direita. */}
        <SkeletonPanel>
          <SkeletonLinhas quantidade={5} />
        </SkeletonPanel>

        {/* Ranking de Categorias: a linha é bolinha da cor + nome + barra, não
            tem avatar redondo. */}
        <SkeletonPanel>
          <SkeletonLinhas quantidade={5} comAvatar={false} />
        </SkeletonPanel>
      </div>
    </div>
  );
}

/** Itens: 3 KPIs (Sem Categoria saiu em 21/08) + a tabela do catálogo. */
export function ItensTabSkeleton() {
  return (
    <div className="mt-6 space-y-6">
      <ProductKPIRowSkeleton count={3} />

      {/* `comAcao` porque a faixa real tem texto à direita ("ℹ️ Os itens são
          extraídos dos pedidos recebidos"), e não porque haja um botão. */}
      <SkeletonPanel comAcao>
        {/* 8 colunas = Item, SKU, Categoria, Status, Pedidos, Receita, Última
            venda e Ações. A 9ª (caixa de seleção) fica em opacity-0 até o hover
            ou até haver seleção — desenhá-la seria prometer o que não se vê.
            8 linhas e não as 50 da página: é o que cabe até a dobra. */}
        <SkeletonTabela linhas={8} colunas={8} />
      </SkeletonPanel>
    </div>
  );
}

/** Categorias: 4 KPIs + botão de nova categoria + lista de categorias. */
export function CategoriasTabSkeleton() {
  return (
    <div className="mt-6 space-y-6">
      <ProductKPIRowSkeleton />

      {/* O estado inicial da aba é o BOTÃO tracejado "Adicionar nova categoria"
          (h-12, largura cheia); o formulário só aparece no clique. `SkeletonGrafico`
          é a peça de "retângulo da altura do conteúdo real" — aqui 48px = h-12 —
          então ela serve sem inventar peça nova nem soltar um <Skeleton> cru. */}
      <SkeletonGrafico altura={48} />

      {/* Lista de categorias: bolinha da cor + nome + contagens, sem avatar. */}
      <SkeletonPanel>
        <SkeletonLinhas quantidade={4} comAvatar={false} />
      </SkeletonPanel>
    </div>
  );
}

/**
 * Celular (as três abas): o número grande ou a faixa de resumo, os blocos e a
 * seção com as linhas — o mesmo esqueleto das outras telas do celular.
 */
export function ProdutosMobileSkeleton({ blocos = 4 }: { blocos?: number }) {
  return (
    <div className="flex flex-col gap-5">
      <div className="space-y-2">
        <Skeleton className="h-4 w-44" />
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-5 w-52" />
      </div>
      {blocos > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {Array.from({ length: blocos }, (_, i) => (
            <Skeleton key={i} className="h-[118px] rounded-3xl" />
          ))}
        </div>
      )}
      <Skeleton className="h-[320px] rounded-3xl" />
    </div>
  );
}
