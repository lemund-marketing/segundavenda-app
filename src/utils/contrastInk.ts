/**
 * Cor de marca → cor de TEXTO legível, uma para cada tema.
 *
 * Cores de marketplace são feitas para logo: o amarelo do Mercado Livre
 * (#FFE600) tem 1,2:1 sobre o card claro e o preto do TikTok (#010101) tem
 * 1,07:1 sobre o card escuro. Em vez de escurecer "cores claras" no chute, aqui
 * a cor caminha em direção ao preto (tema claro) ou ao branco (tema escuro) até
 * cruzar 4,5:1 — o mínimo do WCAG AA para texto.
 *
 * O par sai como duas cores porque o tema é escolhido por CSS (`.dark` no html),
 * não em JS: quem usa aplica as duas em variáveis e deixa o `dark:` decidir.
 */

const LIGHT_BG = "#FFFFFF"; // --card claro é #FEFEFE; usar branco puro é o pior caso
const DARK_BG = "#18181B"; // --card escuro: hsl(240 7% 10%) (era #0E0E11 até 22/10/2026)
const MIN_CONTRAST = 4.5;

interface Rgb {
  r: number;
  g: number;
  b: number;
}

function toRgb(hex: string): Rgb {
  const h = (hex || "#8E9196").replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h.padEnd(6, "0").slice(0, 6);
  return {
    r: parseInt(full.slice(0, 2), 16) || 0,
    g: parseInt(full.slice(2, 4), 16) || 0,
    b: parseInt(full.slice(4, 6), 16) || 0,
  };
}

function toHex({ r, g, b }: Rgb): string {
  const c = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`.toUpperCase();
}

function luminance({ r, g, b }: Rgb): number {
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(a: Rgb, b: Rgb): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function mix(from: Rgb, to: Rgb, t: number): Rgb {
  return {
    r: from.r + (to.r - from.r) * t,
    g: from.g + (to.g - from.g) * t,
    b: from.b + (to.b - from.b) * t,
  };
}

function adjust(color: Rgb, bg: Rgb, towards: Rgb): string {
  if (contrast(color, bg) >= MIN_CONTRAST) return toHex(color);
  for (let t = 0.05; t <= 1; t += 0.05) {
    const candidate = mix(color, towards, t);
    if (contrast(candidate, bg) >= MIN_CONTRAST) return toHex(candidate);
  }
  return toHex(towards);
}

export interface InkPair {
  /** Legível sobre o card claro. */
  light: string;
  /** Legível sobre o card escuro. */
  dark: string;
}

// A tabela de marketplaces é curta e a página renderiza a mesma cor dezenas de
// vezes por tela; o cache evita refazer a busca binária linha a linha.
const cache = new Map<string, InkPair>();

/**
 * @param over Fundo real onde o texto vai cair, quando ele NÃO é o card puro.
 *   As etiquetas desta base pintam a própria cor a ~15% como fundo, e medir
 *   contra o card superestima o contraste: #eab308 a 15% dá 4,48:1 contra o
 *   card e 3,4:1 contra a pílula de verdade. Passar `over` mede no lugar certo.
 */
export function inkPair(hex: string, over?: { light: string; dark: string }): InkPair {
  const key = `${(hex || "").toUpperCase()}|${over?.light ?? ""}|${over?.dark ?? ""}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const color = toRgb(hex);
  const pair: InkPair = {
    light: adjust(color, toRgb(over?.light ?? LIGHT_BG), { r: 0, g: 0, b: 0 }),
    dark: adjust(color, toRgb(over?.dark ?? DARK_BG), { r: 255, g: 255, b: 255 }),
  };
  cache.set(key, pair);
  return pair;
}

/**
 * Achata `hex` a `alpha` sobre `bg` num hex opaco — o que o navegador desenha
 * quando a etiqueta usa `rgba(cor, alpha)` de fundo. Serve para medir contraste
 * no fundo real em vez de no card.
 */
export function flattenOn(hex: string, alpha: number, bg: string): string {
  return toHex(mix(toRgb(bg), toRgb(hex), alpha));
}
