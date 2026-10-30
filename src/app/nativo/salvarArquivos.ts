import { Capacitor, registerPlugin } from "@capacitor/core";

/**
 * Arquivo gerado na própria página (o CSV do CRM, de Produtos e de
 * Performance; a foto, o áudio ou o PDF de uma conversa) sai num
 * `<a download href="blob:…">` ou `data:`, que o WebView não salva: o arquivo
 * não ia para lugar nenhum, e a tela ainda dizia "N clientes exportados".
 *
 * No app, o clique nesse link vira um pedido ao lado nativo
 * (android/…/ArquivosPlugin.java), que salva em Downloads e avisa. As cópias do
 * site continuam como estão: quem entrega o arquivo é o mesmo `a.click()`.
 */

export type ArquivoParaSalvar = { nome: string; tipo: string; base64: string };

const Arquivos = registerPlugin<{ salvar(arquivo: ArquivoParaSalvar): Promise<void> }>("Arquivos");

/** Blob de cada URL criada, até ser revogada: o `a.click()` só tem a URL. */
const blobs = new Map<string, Blob>();

function base64DoBlob(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => {
      const url = String(leitor.result);
      resolve(url.slice(url.indexOf(",") + 1));
    };
    leitor.onerror = () => reject(leitor.error);
    leitor.readAsDataURL(blob);
  });
}

/** O conteúdo do link, ou null se não é arquivo gerado na página. */
function conteudoDoLink(href: string): Promise<{ tipo: string; base64: string }> | null {
  if (href.startsWith("blob:")) {
    // Lido agora: quem baixa revoga a URL logo depois do click().
    const blob = blobs.get(href);
    if (!blob) return null;
    return base64DoBlob(blob).then((base64) => ({ tipo: blob.type, base64 }));
  }
  if (href.startsWith("data:")) {
    const virgula = href.indexOf(",");
    if (virgula === -1) return null;
    const cabecalho = href.slice(5, virgula);
    const tipo = cabecalho.split(";")[0] || "application/octet-stream";
    const corpo = href.slice(virgula + 1);
    if (/;base64$/i.test(cabecalho)) return Promise.resolve({ tipo, base64: corpo });
    try {
      const texto = decodeURIComponent(corpo);
      return base64DoBlob(new Blob([texto], { type: tipo })).then((base64) => ({ tipo, base64 }));
    } catch {
      return null;
    }
  }
  return null;
}

/** Entrega o arquivo do link e diz se cuidou dele (aí o clique não segue). */
function entregar(link: HTMLAnchorElement, salvar: (arquivo: ArquivoParaSalvar) => Promise<void>): boolean {
  if (!link.hasAttribute("download")) return false;
  const conteudo = conteudoDoLink(link.href);
  if (!conteudo) return false;
  const nome = link.getAttribute("download") || "arquivo";
  conteudo
    .then(({ tipo, base64 }) => salvar({ nome, tipo, base64 }))
    // O lado nativo já avisa a falha na tela; aqui só fica o registro.
    .catch((e) => console.error("Não foi possível salvar o arquivo", e));
  return true;
}

/**
 * Passa a entregar a `salvar` os links de download de arquivo gerado na
 * página: o `a.click()` das cópias (com o link solto ou dentro da página) e o
 * toque num link desses que esteja na tela.
 */
export function interceptarDownloads(salvar: (arquivo: ArquivoParaSalvar) => Promise<void>) {
  const criar = URL.createObjectURL.bind(URL);
  const revogar = URL.revokeObjectURL.bind(URL);
  URL.createObjectURL = (obj: Blob | MediaSource) => {
    const url = criar(obj);
    if (obj instanceof Blob) blobs.set(url, obj);
    return url;
  };
  URL.revokeObjectURL = (url: string) => {
    blobs.delete(url);
    revogar(url);
  };

  const clicar = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
    if (!entregar(this, salvar)) clicar.call(this);
  };

  document.addEventListener(
    "click",
    (e) => {
      const alvo = e.target instanceof Element ? e.target.closest("a[download]") : null;
      if (alvo instanceof HTMLAnchorElement && entregar(alvo, salvar)) e.preventDefault();
    },
    true,
  );
}

/** Só no app instalado: no navegador o download do próprio navegador funciona. */
export function ligarSalvarArquivos() {
  if (!Capacitor.isNativePlatform() || !Capacitor.isPluginAvailable("Arquivos")) return;
  interceptarDownloads((arquivo) => Arquivos.salvar(arquivo));
}
