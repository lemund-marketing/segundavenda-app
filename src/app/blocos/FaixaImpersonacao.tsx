import { useEffect, useLayoutEffect } from "react";
import { Loader2, UserRound } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useSellerContext } from "@/contexts/SellerContext";
import {
  esquecerImpersonacao, marcarLojaAberta, trocaEmAndamento, useRegistroImpersonacao,
} from "@/app/dados/impersonacao";
import { useSairDaConta } from "@/app/dados/useSairDaConta";

/**
 * Faixa do admin que entrou como cliente, no topo de todas as telas (como o
 * ImpersonationBanner do site): quem é a conta e o "Voltar para Admin".
 *
 * A altura dela vai em `--faixa-admin` no <html>: o topo do LayoutApp gruda
 * logo abaixo e as telas de altura cheia descontam.
 *
 * Abre a loja que o admin tocou, quando o dono tem mais de uma.
 *
 * Também cuida do registro guardado: sessão que não é mais a do cliente (o
 * cliente saiu, outra conta entrou) apaga a sessão guardada do admin, para o
 * botão nunca aparecer para quem não começou a impersonação.
 */
export function FaixaImpersonacao() {
  const { user, loading, semConexao } = useAuth();
  const { sellers, activeSeller, setActiveSeller, loading: carregandoLojas } = useSellerContext();
  const registro = useRegistroImpersonacao();
  const { voltar, saindo } = useSairDaConta();
  const id = user?.id ?? null;
  const visivel = !!registro && !!id && registro.alvo.userId === id && registro.admin.userId !== id;

  useEffect(() => {
    if (loading || semConexao || !registro || trocaEmAndamento()) return;
    if (id !== registro.alvo.userId) esquecerImpersonacao();
  }, [loading, semConexao, registro, id]);

  // O dono pode ter mais de uma loja: abre na que o admin tocou, não na
  // "preferida" do SellerContext. Uma vez só; depois a troca é livre.
  useEffect(() => {
    if (!visivel || registro.lojaAberta || carregandoLojas || sellers.length === 0) return;
    const escolhida = sellers.find((s) => s.id === registro.alvo.sellerId);
    if (escolhida && activeSeller?.id !== escolhida.id) {
      setActiveSeller(escolhida);
      return;
    }
    marcarLojaAberta();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visivel, registro, carregandoLojas, sellers, activeSeller?.id]);

  useLayoutEffect(() => {
    const raiz = document.documentElement.style;
    if (visivel) raiz.setProperty("--faixa-admin", "calc(2.25rem + env(safe-area-inset-top))");
    else raiz.removeProperty("--faixa-admin");
  }, [visivel]);

  if (!visivel) return null;
  // A loja aberta na tela; enquanto ela carrega, a que o admin escolheu.
  const nome = activeSeller?.name || registro.alvo.loja || registro.alvo.email || "cliente";

  return (
    // z abaixo das janelas (z-50) e do fluxo em tela cheia das Automações
    // (z-45), acima do topo do app (z-40).
    <div
      role="status"
      data-faixa-admin
      className="sticky top-0 z-[41] shrink-0 bg-amber-400 pt-[env(safe-area-inset-top)] text-amber-950"
    >
      <div className="flex h-9 items-center gap-2 px-3">
        <UserRound className="h-4 w-4 shrink-0" strokeWidth={2} />
        <p className="min-w-0 flex-1 truncate text-[13px]">
          Você está como <strong className="font-semibold">{nome}</strong>
        </p>
        <button
          type="button"
          onClick={() => void voltar()}
          disabled={saindo}
          className="flex shrink-0 items-center gap-1 rounded-full bg-amber-950/10 px-2.5 py-1 text-[12px] font-semibold active:bg-amber-950/20 disabled:opacity-60"
        >
          {saindo && <Loader2 className="h-3 w-3 animate-spin" />}
          {saindo ? "Voltando…" : "Voltar para Admin"}
        </button>
      </div>
    </div>
  );
}
