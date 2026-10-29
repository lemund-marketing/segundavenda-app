import { useSyncExternalStore } from "react";
import { WifiOff } from "lucide-react";
import { LayoutApp } from "@/app/LayoutApp";
import { ClientesScreen } from "@/components/clients/ClientesScreen";

const assinarRede = (avisar: () => void) => {
  window.addEventListener("online", avisar);
  window.addEventListener("offline", avisar);
  return () => {
    window.removeEventListener("online", avisar);
    window.removeEventListener("offline", avisar);
  };
};

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
  const semRede = useSyncExternalStore(assinarRede, () => !navigator.onLine);

  return (
    <LayoutApp>
      {semRede && (
        <div className="mx-4 mt-4 flex items-center gap-2.5 rounded-2xl border border-border/60 bg-card px-4 py-3">
          <WifiOff className="h-4 w-4 shrink-0 text-muted-foreground" />
          <p className="text-[13px] leading-snug text-muted-foreground">
            Sem internet. Até a conexão voltar, os números abaixo podem estar zerados ou desatualizados.
          </p>
        </div>
      )}
      <ClientesScreen tituloMobile="Clientes" />
    </LayoutApp>
  );
}
