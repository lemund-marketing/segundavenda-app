import { Component, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";

type Props = { children: ReactNode; chave: string };

/**
 * Rede de proteção das telas: um erro ao desenhar vira um aviso com "Tentar de
 * novo", em vez de tela branca (no app não há barra de endereço para
 * recarregar). Trocar de tela (`chave`) limpa o erro.
 */
export class ErroNaTela extends Component<Props, { erro: unknown }> {
  state = { erro: null as unknown };

  static getDerivedStateFromError(erro: unknown) {
    return { erro };
  }

  componentDidCatch(erro: unknown) {
    console.error("[ErroNaTela]", erro);
  }

  componentDidUpdate(anterior: Props) {
    if (this.state.erro && anterior.chave !== this.props.chave) this.setState({ erro: null });
  }

  render() {
    if (!this.state.erro) return this.props.children;
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-3 bg-background px-8 text-center">
        <AlertTriangle className="h-6 w-6 text-muted-foreground" />
        <h1 className="text-lg font-semibold text-foreground">Algo deu errado nesta tela</h1>
        <p className="max-w-xs text-[15px] text-muted-foreground">Tente de novo. Se continuar, avise o suporte.</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-2 rounded-full bg-primary px-5 py-2.5 text-[15px] font-medium text-primary-foreground"
        >
          Tentar de novo
        </button>
      </div>
    );
  }
}
