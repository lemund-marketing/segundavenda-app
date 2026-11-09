import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { desligarAparelho, esquecerAparelho } from "@/app/nativo/push";
import { contaImpersonada, esquecerImpersonacao, voltarParaAdmin } from "@/app/dados/impersonacao";

/**
 * "Sair da conta" e "Voltar para Admin" num lugar só.
 *
 * Durante a impersonação, sair É voltar para o admin: deslogar o cliente
 * deixaria o aparelho sem conta (o admin entraria de novo com senha) e não há
 * por que mexer em sessão do cliente fora do aparelho. O aparelho também não
 * é apagado: ele nunca foi gravado na conta do cliente (push.ts), e a linha do
 * admin continua lá.
 *
 * Sem internet, nada muda: o cliente continua aberto, a sessão do admin
 * continua guardada e o aviso pede para tentar de novo.
 *
 * Se o Auth recusa a sessão guardada do admin (refresh vencido, deixou de ser
 * admin), desliga o aparelho no Firebase (a linha do admin não dá para apagar
 * sem a sessão dele), sai só deste aparelho (scope local, como todo sair do
 * app) e vai para o login com o aviso.
 */
export function useSairDaConta() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [saindo, setSaindo] = useState(false);
  const impersonando = contaImpersonada(user?.id);

  const voltar = async () => {
    if (saindo) return;
    setSaindo(true);
    const desfecho = await voltarParaAdmin(async () => {
      await desligarAparelho();
      await signOut();
    });
    // ok: o app já está recarregando como admin.
    if (desfecho === "ok") return;
    setSaindo(false);
    if (desfecho === "sem_rede") {
      toast({
        title: "Sem conexão",
        description: "Não deu para voltar para o Admin agora. Tente de novo.",
      });
      return;
    }
    navigate("/entrar", { replace: true });
    toast({
      title: "A sessão do admin expirou",
      description: "Entre de novo com a sua conta admin. Se ela deixou de ser admin, fale com o responsável.",
    });
  };

  const sair = async () => {
    if (impersonando) return voltar();
    if (saindo) return;
    setSaindo(true);
    esquecerImpersonacao();
    await esquecerAparelho().finally(signOut);
    setSaindo(false);
  };

  return { impersonando, saindo, sair, voltar };
}
