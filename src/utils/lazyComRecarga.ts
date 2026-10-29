import { createElement, lazy, useState, type ComponentType } from "react";

const CHAVE = "sv:recarga-por-pedaco";
/** Uma recarga a cada 30 s no máximo: se o pedaço continua faltando, o erro aparece. */
const INTERVALO_MS = 30_000;
/** Sem a página ter saído neste tempo, a recarga foi cancelada (aviso de "sair do site?"). */
const ESPERA_RECARGA_MS = 10_000;

/**
 * Depois de uma falha, uma montagem nova só tenta baixar de novo passado este
 * tempo. Logo após a falha o React remonta a peça sozinho (ela não chegou a
 * montar), e tentar de novo ali viraria um laço preso na tela de carregamento.
 */
const NOVA_TENTATIVA_MS = 3_000;

/** Marca do erro de "pedaço não chegou", para o PedacoComFalha não engolir erro de verdade. */
export const PEDACO_FALTANDO = "__svPedacoFaltando";

type Opcoes = {
  /**
   * Tela inteira (rota): recarrega a página uma vez para pegar a versão nova.
   * Peça dentro de uma tela (painel, gráfico, gaveta): `false` — recarregar
   * jogaria fora o que a pessoa está fazendo; o erro vai para o PedacoComFalha
   * em volta, que oferece o "Atualizar".
   */
  recarregar?: boolean;
};

function tentarRecarregar(erro: unknown): Promise<never> {
  let ultima = 0;
  try {
    ultima = Number(sessionStorage.getItem(CHAVE) || 0);
  } catch {
    // sessionStorage bloqueado: sem como evitar laço, não recarrega.
    return Promise.reject(erro);
  }
  if (Date.now() - ultima < INTERVALO_MS) return Promise.reject(erro);
  try {
    sessionStorage.setItem(CHAVE, String(Date.now()));
  } catch {
    return Promise.reject(erro);
  }
  window.location.reload();
  // Se a recarga acontece, a página some antes disto. Se foi cancelada, desiste
  // e devolve o erro: uma promessa que nunca termina deixaria a tela presa. A
  // trava de 30 s continua valendo (numa recarga só lenta, apagá-la abriria
  // caminho para um laço de recargas com a rede ruim).
  return new Promise<never>((_, rejeitar) => {
    const t = window.setTimeout(() => rejeitar(erro), ESPERA_RECARGA_MS);
    window.addEventListener("pagehide", () => window.clearTimeout(t), { once: true });
  });
}

/**
 * `React.lazy` que sobrevive a um deploy no meio da sessão e pode ser
 * pré-carregado.
 *
 * Cada tela é um arquivo com nome de versão (`Pedidos-a1b2c3.js`). Quando um
 * deploy novo sai, os arquivos da versão anterior deixam de existir no
 * servidor, e o service worker apaga os dele ao ativar a versão nova. Quem
 * estava com o app aberto na versão velha e abre uma tela pela primeira vez
 * pede um arquivo que não existe mais. Numa rota, a página recarrega uma vez,
 * já na versão nova, e abre a tela pedida (a URL já é a dela); numa peça de
 * dentro da tela, o erro sobe para quem a envolve (ver `recarregar`).
 *
 * `preload()` baixa o pedaço antes de alguém abrir a tela (App.tsx faz isso com
 * as telas da barra de baixo): com o pedaço já em memória, a tela abre direto,
 * sem passar pela tela de carregamento.
 */
export function lazyComRecarga<P extends object>(
  carregar: () => Promise<{ default: ComponentType<P> }>,
  { recarregar = true }: Opcoes = {},
) {
  let pronto: ComponentType<P> | null = null;
  let emCurso: Promise<{ default: ComponentType<P> }> | null = null;
  const baixar = () => {
    if (!emCurso) {
      emCurso = carregar().then(
        (m) => {
          pronto = m.default;
          return m;
        },
        (erro) => {
          emCurso = null; // a próxima tentativa (outro preload, outra montagem) baixa de novo
          if (erro && typeof erro === "object") (erro as Record<string, unknown>)[PEDACO_FALTANDO] = true;
          throw erro;
        },
      );
    }
    return emCurso;
  };

  // O React.lazy guarda a falha para sempre. Uma montagem feita depois de
  // NOVA_TENTATIVA_MS ganha um lazy novo, que tenta baixar de novo.
  let falhouEm = 0;
  const criarPreguicoso = () =>
    lazy(() =>
      baixar().catch((erro) => {
        falhouEm = Date.now();
        return recarregar ? tentarRecarregar(erro) : Promise.reject(erro);
      }),
    );
  let Preguicoso = criarPreguicoso();
  const preguicosoAtual = () => {
    if (falhouEm && Date.now() - falhouEm > NOVA_TENTATIVA_MS) {
      falhouEm = 0;
      Preguicoso = criarPreguicoso();
    }
    return Preguicoso;
  };

  function Pedaco(props: P) {
    // Decide uma vez por montagem: trocar de Preguicoso para o componente pronto
    // no meio da vida da tela a remontaria e perderia o estado.
    const [Componente] = useState<ComponentType<P>>(() => pronto ?? (preguicosoAtual() as unknown as ComponentType<P>));
    return createElement(Componente, props);
  }
  Pedaco.preload = () => {
    baixar().catch(() => {
      // pré-carga é só adiantamento: se falhar, a abertura de verdade tenta de novo
    });
  };
  return Pedaco;
}
