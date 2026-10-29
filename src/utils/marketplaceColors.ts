import { hexToRgba } from "@/components/clients/sections/shared";

export function getMarketplaceColor(platform: string): string {
  switch (platform?.toLowerCase()) {
    case 'mercado_livre': return '#FFE600';
    case 'ml_full': return '#FFD000';
    case 'shopee': return '#EE4D2D';
    case 'shopee_xpress': return '#EE4D2D';
    case 'amazon_br': return '#FF9900';
    case 'magalu': return '#0086FF';
    case 'americanas': return '#E60014';
    case 'shein': return '#333333';
    case 'tiktok': return '#010101';
    case 'kwai': return '#FF6600';
    case 'aliexpress': return '#E43225';
    case 'kabum': return '#FF6500';
    case 'casas_bahia': return '#0050AA';
    case 'carrefour': return '#004E9A';
    case 'ifood': return '#EA1D2C';
    case 'temu': return '#F05A28';
    case 'leroy_merlin': return '#78BE20';
    case 'madeira_madeira': return '#F58835';
    case 'tray': return '#1E40AF';
    case 'webcontinental': return '#1E66D0';
    default: return '#8E9196';
  }
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = (hex || "#8E9196").replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h.padEnd(6, "0").slice(0, 6);
  return {
    r: parseInt(full.slice(0, 2), 16) || 0,
    g: parseInt(full.slice(2, 4), 16) || 0,
    b: parseInt(full.slice(4, 6), 16) || 0,
  };
}

function toHex({ r, g, b }: { r: number; g: number; b: number }): string {
  const c = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`.toUpperCase();
}

// Luminância relativa (WCAG): canais linearizados antes da média ponderada.
function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

const LUMINANCE_CEILING = 0.65;
const DARKEN_FACTOR = 0.55;

/**
 * Fundo translúcido + borda derivados da cor da loja, legíveis em tema claro e escuro.
 * O amarelo do Mercado Livre (#FFE600) some quando usado como texto sobre fundo claro,
 * então cores muito luminosas têm o `fg` escurecido — o `bg`/`border` seguem a cor original.
 */
export function marketplaceTone(platform: string): { bg: string; fg: string; border: string } {
  const hex = getMarketplaceColor(platform);
  const { r, g, b } = hexToRgb(hex);
  const fg = relativeLuminance(hex) > LUMINANCE_CEILING
    ? toHex({ r: r * DARKEN_FACTOR, g: g * DARKEN_FACTOR, b: b * DARKEN_FACTOR })
    : hex;

  return {
    bg: hexToRgba(hex, 0.14),
    fg,
    border: hexToRgba(hex, 0.35),
  };
}
