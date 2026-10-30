import { LayoutApp } from "@/app/LayoutApp";
import { FaixaSemRede } from "@/app/blocos/FaixaSemRede";
import { useSemRede } from "@/app/nativo/useSemRede";
import { ClientesScreen } from "@/components/clients/ClientesScreen";

/**
 * Clientes: a casca da página do site (src/pages/Clientes.tsx) no desenho de
 * celular. O corpo inteiro (números do topo, lista com busca, filtros e a
 * ficha do cliente) é o `ClientesScreen` copiado do site; com `tituloMobile`
 * ele desenha o próprio topo de app. As guardas do site ficam na rota, em
 * App.tsx: a de sessão no `ComConta` e o AreaGuard no `ComArea`.
 */
export default function Clientes() {
  // Sem internet as consultas dos números ficam em espera (nem dado, nem erro,
  // nem carregando) e o ClientesScreen desenha zero: "0 clientes" numa troca de
  // período no metrô. O aviso diz que aquele zero não é da loja.
  const semRede = useSemRede();

  return (
    <LayoutApp>
      {semRede && (
        <FaixaSemRede>Sem internet. Até a conexão voltar, os números abaixo podem estar zerados ou desatualizados.</FaixaSemRede>
      )}
      <ClientesScreen tituloMobile="Clientes" />
    </LayoutApp>
  );
}
