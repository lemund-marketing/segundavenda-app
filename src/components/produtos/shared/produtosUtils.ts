export const PERIOD_OPTIONS = [
  { value: "7", label: "7 dias" },
  { value: "30", label: "30 dias" },
  { value: "90", label: "90 dias" },
  { value: "365", label: "365 dias" },
];

/** Paleta única das categorias — a mesma no seletor de cor e nas sugestões. */
export const CATEGORY_COLORS = [
  "#ef4444", "#f97316", "#eab308", "#22c55e",
  "#10b981", "#06b6d4", "#3b82f6", "#6366f1",
  "#8b5cf6", "#ec4899", "#f43f5e", "#6b7280",
];

export const fmtCurrency = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

/**
 * O que a tela mostra: o apelido do vendedor quando existe, senão o título cru
 * do marketplace. O apelido NUNCA entra na chave de identidade do produto
 * (products.name_key), então renomear aqui não desgruda nada dos pedidos.
 */
export const productLabel = (p: { display_name?: string | null; name: string }) =>
  p.display_name?.trim() || p.name;
