import { LayoutApp } from "@/app/LayoutApp";
import { ClientesScreen } from "@/components/clients/ClientesScreen";

/**
 * Clientes: a casca da página do site (src/pages/Clientes.tsx) no desenho de
 * celular. O corpo inteiro (números do topo, lista com busca, filtros e a
 * ficha do cliente) é o `ClientesScreen` copiado do site; com `tituloMobile`
 * ele desenha o próprio topo de app. A guarda de sessão do site fica a cargo
 * do `ComConta`.
 */
export default function Clientes() {
  return (
    <LayoutApp>
      <ClientesScreen tituloMobile="Clientes" />
    </LayoutApp>
  );
}
