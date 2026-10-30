import { LayoutApp } from "@/app/LayoutApp";
import { ProdutosScreen } from "@/app/blocos/ProdutosScreen";

/**
 * Produtos: a página do site (src/pages/Produtos.tsx) no desenho de celular.
 * O corpo é o `ProdutosScreen` do app, o mesmo da aba Produtos do
 * marketplace, aqui solto: com título, período e filtro de marketplace. A
 * guarda de área do site fica na rota, em App.tsx.
 */
export default function Produtos() {
  return (
    <LayoutApp>
      <ProdutosScreen tituloMobile="Produtos" />
    </LayoutApp>
  );
}
