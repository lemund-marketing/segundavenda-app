import { useCallback, useEffect, useRef, useState, type ComponentType } from "react";

/**
 * O botão Voltar do Android fecha o que está aberto (gaveta, janela,
 * conversa) antes de trocar de tela.
 *
 * Como: cada janela aberta entra numa pilha. Ao apertar Voltar, o lado nativo
 * pergunta à página (`window.svVoltar()`, ver MainActivity) se há algo para
 * fechar; havendo, a janela do topo fecha e o Voltar para por aí. Sem nada
 * aberto, o nativo volta de tela ou manda o app para segundo plano.
 *
 * Nada aqui mexe no histórico do navegador.
 */

type Camada = { fechar: () => void };

/** Janelas abertas, da mais antiga para a do topo. */
const pilha: Camada[] = [];

declare global {
  interface Window {
    /** Chamada pelo lado nativo (Android) no Voltar: fecha a janela do topo e diz se fechou alguma. */
    svVoltar?: () => boolean;
  }
}

if (typeof window !== "undefined") {
  window.svVoltar = () => {
    // Sai da pilha antes de fechar: se a janela não fechar (aberta sem
    // onOpenChange), o próximo Voltar não fica preso nela.
    const topo = pilha.pop();
    if (!topo) return false;
    topo.fechar();
    return true;
  };
}

export function useVoltarFecha(aberto: boolean, fechar: () => void) {
  const fecharRef = useRef(fechar);
  fecharRef.current = fechar;

  useEffect(() => {
    if (!aberto) return;
    const camada: Camada = { fechar: () => fecharRef.current() };
    pilha.push(camada);
    return () => {
      const i = pilha.indexOf(camada);
      if (i !== -1) pilha.splice(i, 1);
    };
  }, [aberto]);
}

type PropsDeRaiz = { open?: boolean; defaultOpen?: boolean; onOpenChange?: (open: boolean) => void };

/**
 * Envolve a raiz de um Dialog/Sheet/AlertDialog do Radix com o Voltar que
 * fecha. Aceita o uso controlado (`open` + `onOpenChange`) e o solto (só
 * `defaultOpen` e o gatilho): no solto, o estado passa a morar aqui.
 */
export function comVoltarFecha<P extends PropsDeRaiz>(Raiz: ComponentType<P>) {
  function RaizComVoltar(props: P) {
    const { open, defaultOpen, onOpenChange } = props;
    const [interno, setInterno] = useState(defaultOpen ?? false);
    const controlado = open !== undefined;
    const aberto = controlado ? !!open : interno;
    const mudar = useCallback(
      (v: boolean) => {
        if (!controlado) setInterno(v);
        onOpenChange?.(v);
      },
      [controlado, onOpenChange],
    );
    useVoltarFecha(aberto, () => mudar(false));
    return <Raiz {...props} defaultOpen={undefined} open={aberto} onOpenChange={mudar} />;
  }
  RaizComVoltar.displayName = `ComVoltarFecha(${Raiz.displayName ?? Raiz.name ?? "Raiz"})`;
  return RaizComVoltar;
}
