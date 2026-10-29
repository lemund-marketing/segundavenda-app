import { ReactNode } from "react";
import type { CSSProperties } from "react";
import { flattenOn, inkPair } from "@/utils/contrastInk";

export const DAY_NAMES = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export const PERIOD_OPTIONS = [
  { value: "all", label: "Sempre" },
  { value: "12", label: "12 meses" },
  { value: "6", label: "6 meses" },
  { value: "3", label: "3 meses" },
  { value: "1", label: "1 mês" },
];

export function getInitials(name: string) {
  if (!name) return "?";

  // O nome vindo do marketplace costuma trazer o apelido entre parênteses
  // ("Fabio Shikasho (fabioshikasho)") e às vezes o CNPJ na frente
  // ("38.026.718 Kedima Priscylla"). Pegar o primeiro e o último token cru
  // gerava iniciais como "F(" e "3(" — daí tirar os parênteses e só considerar
  // token que começa com letra.
  const semApelido = name.replace(/\([^)]*\)/g, " ");
  const parts = semApelido
    .trim()
    .split(/\s+/)
    .filter((p) => /^\p{L}/u.test(p));

  // Nome só com espaços passa no `!name` e chega aqui com zero partes — vindo
  // de importação de marketplace com o campo em branco isso derrubava a tela.
  if (parts.length === 0) {
    const letra = name.match(/\p{L}/u);
    return letra ? letra[0].toUpperCase() : "?";
  }
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function hexToRgba(hex: string, alpha = 0.15) {
  if (!hex) return `rgba(9,175,104,${alpha})`;
  const h = hex.replace("#", "");
  const bigint = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  const r = (bigint >> 16) & 255, g = (bigint >> 8) & 255, b = bigint & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

// Paleta de avatar compartilhada entre a lista de clientes e os sheets.
// `base` é a mesma cor de `bg` em hex opaco: quem precisa MEDIR contraste tem de
// achatar o círculo (cor a 15% sobre o card) e não dá para fazer isso a partir da
// string rgba. Usada por `ClientAvatar`.
export const AVATAR_PALETTE = [
  { base: "#10b981", bg: "rgba(16,185,129,0.15)",  fg: "#047857" },
  { base: "#3b82f6", bg: "rgba(59,130,246,0.15)",  fg: "#1d4ed8" },
  { base: "#8b5cf6", bg: "rgba(139,92,246,0.15)",  fg: "#6d28d9" },
  { base: "#14b8a6", bg: "rgba(20,184,166,0.15)",  fg: "#0f766e" },
  { base: "#f59e0b", bg: "rgba(245,158,11,0.15)",  fg: "#b45309" },
  { base: "#ec4899", bg: "rgba(236,72,153,0.15)",  fg: "#be185d" },
  { base: "#6366f1", bg: "rgba(99,102,241,0.15)",  fg: "#4338ca" },
  { base: "#09AF68", bg: "rgba(9,175,104,0.15)",   fg: "#09AF68" },
];

export function avatarToneFor(name?: string | null) {
  const s = (name || "").trim();
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length];
}


export function CardWrap({
  icon,
  title,
  iconBg,
  action,
  children,
}: {
  icon: ReactNode;
  title: string;
  iconBg?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  // `rounded-lg` = 20px NESTA base (a escala é própria: 2xl seriam 28px).
  return (
    <div className="rounded-lg bg-card p-5 space-y-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${iconBg ?? "bg-primary/10 text-primary"}`}>
            {icon}
          </div>
          <h3 className="text-[15px] font-semibold text-foreground">{title}</h3>
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

/** `--card` dos dois temas (claro: hsl(0 0% 100%); escuro: hsl(240 7% 10%)). */
const TINTA_CARD_CLARO = "#FFFFFF";
const TINTA_CARD_ESCURO = "#18181B";

/**
 * Texto pintado com cor de DADO (iniciais do avatar, nome da fase do CRM) sobre
 * um fundo da própria cor a 15%.
 *
 * No CLARO a tinta é exatamente `cor` — a tela clara não muda nada. No ESCURO
 * as tintas escolhidas para fundo claro (#047857, #4338ca…) somem; entra a
 * mesma conta do `ClientAvatar` e do `StageBadge`: `inkPair` andando com a cor
 * até 4,5:1 sobre o fundo achatado (`base` a 15%) no card escuro.
 *
 * Usar com `text-[color:var(--tinta)] dark:text-[color:var(--tinta-escura)]`.
 * Cor que não é hex (ex.: "hsl(var(--primary))") passa igual nos dois temas.
 */
export function tintaPorTema(cor: string, base: string = cor): CSSProperties {
  const ehHex = /^#[0-9a-f]{3,8}$/i.test(cor) && /^#[0-9a-f]{3,8}$/i.test(base);
  const escura = ehHex
    ? inkPair(cor, {
        light: flattenOn(base, 0.15, TINTA_CARD_CLARO),
        dark: flattenOn(base, 0.15, TINTA_CARD_ESCURO),
      }).dark
    : cor;
  return { "--tinta": cor, "--tinta-escura": escura } as CSSProperties;
}
