import { Component, type ReactNode } from "react";
import { RefreshCw } from "lucide-react";
import { PEDACO_FALTANDO } from "@/utils/lazyComRecarga";

type Props = {
  children: ReactNode;
  fallback?: ReactNode;
  /** Mudou (outro cliente, outro estado, painel reaberto): tenta carregar de novo. */
  chave?: unknown;
};

/**
 * Em volta de uma peça carregada sob demanda dentro de uma tela (gráfico,
 * painel, gaveta). Se o pedaço não chega — quase sempre porque saiu uma versão
 * nova do app e o arquivo velho não existe mais —, a tela continua de pé e só a
 * peça vira o aviso, sem recarregar a página por conta própria (lazyComRecarga
 * com `recarregar: false`). `fallback={null}` para peças sem lugar fixo na tela
 * (gavetas, o painel do Copiloto).
 *
 * Só trata "pedaço não chegou". Qualquer outro erro sobe para o ErrorBoundary
 * de cima, com a mensagem de verdade: um defeito na peça não pode virar um
 * "saiu versão nova" que recarrega para o mesmo erro.
 */
export class PedacoComFalha extends Component<Props, { erro: unknown; falhou: boolean }> {
  state = { erro: null as unknown, falhou: false };

  static getDerivedStateFromError(erro: unknown) {
    return { falhou: true, erro };
  }

  componentDidCatch(erro: unknown) {
    console.error("[PedacoComFalha] Peça não carregou:", erro);
  }

  componentDidUpdate(anterior: Props) {
    if (this.state.falhou && anterior.chave !== this.props.chave) this.setState({ falhou: false, erro: null });
  }

  render() {
    if (!this.state.falhou) return this.props.children;
    const e = this.state.erro as Record<string, unknown> | null;
    if (!(e && typeof e === "object" && e[PEDACO_FALTANDO])) throw this.state.erro;
    if (this.props.fallback !== undefined) return this.props.fallback;
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border px-4 py-6 text-center">
        <p className="text-[13px] text-muted-foreground">Saiu uma versão nova do app.</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3.5 py-1.5 text-[13px] font-medium text-primary active:bg-primary/15"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Atualizar
        </button>
      </div>
    );
  }
}
