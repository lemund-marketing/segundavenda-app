import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";

interface MlFalhaListaProps {
  /** Texto do erro (`useMlConversations().erro`). */
  erro: string;
  onTentarDeNovo: () => void;
  carregando?: boolean;
  /**
   * true = a lista está VAZIA por causa da falha ("Somente Mercado Livre"): vira
   * o vazio da lista. false = faixa no topo da lista misturada.
   */
  vazio?: boolean;
}

/**
 * Falha ao carregar a lista do Mercado Livre, com "Tentar de novo".
 *
 * Sem isto a falha sumia em `console.warn`: a paginação do ML parava pelo resto
 * da sessão e, no "Somente Mercado Livre", a tela dizia "Nenhuma conversa" —
 * igual a um seller sem conversa nenhuma. Componente próprio (e não JSX solto
 * no Omnichannel.tsx) para a página só ganhar duas linhas.
 */
export function MlFalhaLista({ erro, onTentarDeNovo, carregando = false, vazio = false }: MlFalhaListaProps) {
  if (vazio) {
    return (
      <div className="flex flex-col items-center justify-center px-6 py-10 text-center text-muted-foreground">
        <AlertTriangle className="h-10 w-10 mb-2 opacity-50 text-destructive" />
        <p className="text-sm font-medium text-foreground">{erro}</p>
        <p className="mt-1 text-[12px] leading-relaxed max-w-[240px]">
          As conversas do WhatsApp não foram afetadas.
        </p>
        <Button
          variant="outline"
          size="sm"
          className="mt-3 h-7 text-[11px]"
          disabled={carregando}
          onClick={onTentarDeNovo}
        >
          {carregando ? <Loader2 className="h-3 w-3 animate-spin" /> : "Tentar de novo"}
        </Button>
      </div>
    );
  }

  return (
    <div
      role="alert"
      className="mx-3 mt-3 flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-foreground"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
      <div className="min-w-0 flex-1 text-[12px] leading-relaxed">
        <p>{erro}</p>
        <button
          type="button"
          onClick={onTentarDeNovo}
          disabled={carregando}
          className="mt-1 inline-flex items-center gap-1 font-semibold underline underline-offset-2 hover:no-underline disabled:opacity-60"
        >
          <RefreshCw className={`h-3 w-3 ${carregando ? "animate-spin" : ""}`} />
          Tentar de novo
        </button>
      </div>
    </div>
  );
}

export default MlFalhaLista;
