import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { LayoutGrid } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAreaPermissions, PATH_AREA } from "@/hooks/useAreaPermissions";
import { atalhosNavInferior, TELAS_DO_APP, type ItemMenu } from "@/app/navegacao/itensMenu";

/**
 * Navegação do app: uma cápsula flutuante embaixo, só com ícones, no desenho
 * do Nubank, em Liquid Glass (o vidro do iOS 26). Até 4 atalhos para as áreas
 * mais usadas e, no fim, o Menu com todas as outras. O item da tela aberta
 * ganha o ícone verde sobre a pílula do mesmo verde a 10%.
 *
 * A cápsula tem h-16 e fica a 1rem do rodapé (mais a faixa do gesto do
 * iPhone). O LayoutApp desconta esse espaço embaixo do conteúdo: mudar um sem
 * o outro deixa conteúdo escondido atrás da cápsula.
 *
 * A pílula é UM elemento só, que desliza de um item para o outro com mola
 * (como as abas do perfil do Instagram). Ela anima `transform` (translateX)
 * e, se os itens tiverem larguras diferentes, `width` — que num elemento
 * absoluto não empurra nada ao redor.
 */

/**
 * Mola da pílula. stiffness = velocidade (mais alto, mais rápido); damping =
 * freio (mais baixo, mais "quique"; ~2·√(stiffness·mass) não quica nada);
 * mass = peso (mais alto, mais lento e mais solto). Com estes valores ela chega
 * em ~0,3 s e passa do ponto só um fio.
 */
const MOLA = { type: "spring", stiffness: 520, damping: 38, mass: 0.9 } as const;
const SEM_ANIMACAO = { duration: 0 } as const;

type Posicao = { x: number; y: number; largura: number; altura: number };

/**
 * Liquid Glass. O vidro (tom, aro especular, brilho, sombra e o fallback de
 * desfoque) está na classe `.vidro-liquido` do index.css. Aqui fica a parte
 * que a Apple chama de lente: um filtro SVG no backdrop-filter que desfoca o
 * que passa por trás e entorta a faixa perto da borda, como vidro curvo, com
 * uma leve separação de cores.
 *
 * Só o Chromium desenha filtro SVG dentro do backdrop-filter (o app Android
 * usa o WebView do Chrome, então lá funciona). Safari/iPhone e Firefox ficam
 * com o fallback da classe.
 *
 * Ajustes: `desfoque` = quanto o fundo borra (desvio do Gaussian, em px);
 * `escala` = força da lente na borda (deslocamento máximo ≈ metade, em px);
 * `faixa` = largura da borda que entorta (px); `dispersao` = separação de
 * cores (0 desliga).
 */
const LENTE = { desfoque: 2, escala: 44, faixa: 18, dispersao: 3 } as const;
const ID_FILTRO = "nav-vidro-liquido";

function navegadorDesenhaLente(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  // Todo navegador do iPhone/iPad é WebKit por baixo, até o Chrome (CriOS).
  if (/iPhone|iPad|iPod|CriOS|FxiOS|Firefox/.test(ua)) return false;
  const marcas = (navigator as Navigator & { userAgentData?: { brands?: { brand: string }[] } }).userAgentData?.brands;
  if (marcas?.length) return marcas.some((m) => /Chromium/i.test(m.brand));
  return /Chrome\/\d+/.test(ua);
}

/**
 * Mapa de deslocamento no formato exato da cápsula: vermelho = quanto puxar
 * na horizontal, verde = na vertical (128 = parado). Dentro da `faixa` da
 * borda o pixel busca o fundo mais para dentro, na direção da normal da borda,
 * cada vez mais forte perto dela; no miolo, nada mexe. Gerado no aparelho
 * (~20 mil pixels) e guardado por tamanho, porque a barra remonta a cada tela.
 */
const mapasPorTamanho = new Map<string, string>();
function mapaDaLente(w: number, h: number, faixa: number): string {
  const chave = `${w}x${h}x${faixa}`;
  const pronto = mapasPorTamanho.get(chave);
  if (pronto) return pronto;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  const img = ctx.createImageData(w, h);
  const r = h / 2;
  const cx = w / 2;
  const cy = h / 2;
  const meioReto = Math.max(w / 2 - r, 0);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const px = Math.abs(dx) - meioReto;
      const py = Math.abs(dy);
      const qx = Math.max(px, 0);
      // Distância até a borda da cápsula, medida para dentro.
      const dentro = r - Math.hypot(qx, py);
      let nx = 0;
      let ny = 0;
      const l = Math.hypot(qx, py);
      if (l > 0) {
        nx = (qx / l) * Math.sign(dx);
        ny = (py / l) * Math.sign(dy);
      }
      const t = Math.min(Math.max(1 - dentro / faixa, 0), 1);
      const m = t * t;
      const i = (y * w + x) * 4;
      img.data[i] = 128 - nx * m * 127;
      img.data[i + 1] = 128 - ny * m * 127;
      img.data[i + 2] = 128;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const url = canvas.toDataURL();
  mapasPorTamanho.set(chave, url);
  return url;
}

/**
 * Onde a pílula estava na tela anterior. Se a barra remontar ao trocar de
 * tela, ela nasce sem saber de onde vem: sem isto a pílula só apareceria no
 * item novo, sem deslizar. A primeira
 * abertura do app começa sem posição e a pílula já nasce no lugar.
 */
let ultimaPosicao: Posicao | null = null;

export const NavInferior = () => {
  const location = useLocation();
  const { canView } = useAreaPermissions();
  const reduzirMovimento = useReducedMotion();

  // Os 4 primeiros que já existem no app e que o membro pode ver; quem vê
  // menos áreas fica com menos atalhos.
  const atalhos = atalhosNavInferior
    .filter((i) => {
      if (!TELAS_DO_APP.has(i.path)) return false;
      const area = PATH_AREA[i.path];
      return !area || canView(area);
    })
    .slice(0, 4);

  const ativo = (path: string) =>
    path === "/"
      ? location.pathname === "/"
      : location.pathname === path || location.pathname.startsWith(`${path}/`);
  // Fora dos atalhos quem fica aceso é o Menu: é por ele que se chega lá.
  const menuAtivo = !atalhos.some((a) => ativo(a.path));
  const chaveAtiva = menuAtivo ? "menu" : atalhos.find((a) => ativo(a.path))!.path;

  const itens = useRef(new Map<string, HTMLAnchorElement>());
  const caixa = useRef<HTMLDivElement>(null);
  // De onde a pílula parte ao montar: a posição da tela anterior, lida uma vez só.
  const [partida] = useState(ultimaPosicao);
  const [alvo, setAlvo] = useState<Posicao | null>(null);
  // true quando a mudança de posição não é troca de item (a tela mudou de
  // tamanho): aí a pílula acompanha na hora, sem deslizar.
  const [saltar, setSaltar] = useState(false);

  const medir = useCallback((): Posicao | null => {
    const el = itens.current.get(chaveAtiva);
    if (!el) return null;
    return { x: el.offsetLeft, y: el.offsetTop, largura: el.offsetWidth, altura: el.offsetHeight };
  }, [chaveAtiva]);

  // Antes da pintura: a pílula já aparece no lugar certo no primeiro quadro.
  useLayoutEffect(() => {
    const p = medir();
    if (!p) return;
    setSaltar(false);
    setAlvo(p);
    ultimaPosicao = p;
  }, [medir, atalhos.length]);

  // Tela girou ou mudou de largura: reposiciona sem animar.
  useLayoutEffect(() => {
    const el = caixa.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    // O observer avisa uma vez logo ao começar a observar; essa leitura é a
    // mesma do efeito acima e não pode cortar o deslize de quem veio de outra tela.
    let primeira = true;
    const obs = new ResizeObserver(() => {
      if (primeira) {
        primeira = false;
        return;
      }
      const p = medir();
      if (!p) return;
      setSaltar(true);
      setAlvo(p);
      ultimaPosicao = p;
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, [medir]);

  const transicao = reduzirMovimento || saltar ? SEM_ANIMACAO : MOLA;

  // Lente do Liquid Glass: decide uma vez se o navegador desenha e gera o
  // mapa no tamanho da cápsula (de novo se ela mudar de tamanho).
  const [desenhaLente] = useState(navegadorDesenhaLente);
  const [mapa, setMapa] = useState<{ url: string; w: number; h: number } | null>(null);
  useLayoutEffect(() => {
    const el = caixa.current;
    if (!desenhaLente || !el) return;
    const gerar = () => {
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      if (!w || !h) return;
      const url = mapaDaLente(w, h, LENTE.faixa);
      if (url) setMapa((atual) => (atual?.url === url ? atual : { url, w, h }));
    };
    gerar();
    if (typeof ResizeObserver === "undefined") return;
    const obs = new ResizeObserver(gerar);
    obs.observe(el);
    return () => obs.disconnect();
  }, [desenhaLente]);
  const comLente = desenhaLente && !!mapa;
  const filtroDaLente = `url(#${ID_FILTRO}) saturate(1.6)`;

  const item = (chave: string, to: string, label: string, Icone: ItemMenu["icon"], aceso: boolean) => (
    <li key={chave}>
      <Link
        to={to}
        ref={(el) => {
          if (el) itens.current.set(chave, el);
          else itens.current.delete(chave);
        }}
        aria-label={label}
        title={label}
        aria-current={aceso ? "page" : undefined}
        className={cn(
          "relative z-[1] flex h-[52px] w-[52px] items-center justify-center rounded-full transition-colors duration-200",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          aceso ? "text-primary" : "text-muted-foreground active:bg-foreground/5",
        )}
      >
        <Icone className="h-[22px] w-[22px]" strokeWidth={aceso ? 2.25 : 1.75} />
      </Link>
    </li>
  );

  return (
    <nav
      aria-label="Navegação principal"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-40 flex justify-center px-4"
    >
      {/* O filtro da lente (só existe onde o navegador desenha). Tamanho
          zero: não ocupa espaço nem aparece. */}
      {comLente && (
        <svg aria-hidden width="0" height="0" className="absolute">
          <defs>
            <filter id={ID_FILTRO} x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
              <feImage href={mapa!.url} x="0" y="0" width={mapa!.w} height={mapa!.h} preserveAspectRatio="none" result="mapa" />
              <feGaussianBlur in="SourceGraphic" stdDeviation={LENTE.desfoque} result="borrado" />
              <feDisplacementMap in="borrado" in2="mapa" scale={LENTE.escala + LENTE.dispersao} xChannelSelector="R" yChannelSelector="G" result="dR" />
              <feColorMatrix in="dR" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="r" />
              <feDisplacementMap in="borrado" in2="mapa" scale={LENTE.escala} xChannelSelector="R" yChannelSelector="G" result="dG" />
              <feColorMatrix in="dG" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="g" />
              <feDisplacementMap in="borrado" in2="mapa" scale={LENTE.escala - LENTE.dispersao} xChannelSelector="R" yChannelSelector="G" result="dB" />
              <feColorMatrix in="dB" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="b" />
              <feBlend in="r" in2="g" mode="screen" result="rg" />
              <feBlend in="rg" in2="b" mode="screen" />
            </filter>
          </defs>
        </svg>
      )}

      {/* Liquid Glass: o vidro vem da classe .vidro-liquido (index.css) e,
          onde dá, a lente entra no lugar do desfoque simples. A borda
          transparente de 1px segura o tamanho de antes; o aro de brilho mora
          no ::after da classe. */}
      <div
        ref={caixa}
        className={cn(
          "vidro-liquido pointer-events-auto relative rounded-full border border-transparent px-1.5",
          comLente && "vidro-liquido--refracao",
        )}
        style={comLente ? { backdropFilter: filtroDaLente, WebkitBackdropFilter: filtroDaLente } : undefined}
      >

        {alvo && (
          <motion.span
            aria-hidden
            className="pointer-events-none absolute left-0 top-0 rounded-full bg-primary/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] ring-1 ring-primary/10 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
            style={{ top: alvo.y, height: alvo.altura }}
            // Vinda de outra tela: parte de onde estava e desliza até aqui.
            // Primeira abertura (sem posição anterior): nasce no lugar.
            // `transform` inteiro, e não `x`: assim o framer roda a mola na
            // placa de vídeo (WAAPI) e ela não engasga enquanto a tela nova
            // ainda está sendo montada. O `x` solto é animado pelo JavaScript.
            initial={partida ? { transform: `translateX(${partida.x}px)`, width: partida.largura } : false}
            animate={{ transform: `translateX(${alvo.x}px)`, width: alvo.largura }}
            transition={transicao}
          />
        )}

        <ul className="flex h-16 items-center gap-1">
          {atalhos.map((a) => item(a.path, a.path, a.label, a.icon, ativo(a.path)))}
          {item("menu", "/menu", "Menu", LayoutGrid, menuAtivo)}
        </ul>
      </div>
    </nav>
  );
};
