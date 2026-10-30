/**
 * Fonte única do custo de SMS na UI (centavos por segmento de 160 chars).
 * O preço por mensagem fica em Admin › Gestão SMS › Preços & Markup (`channel_pricing`, channel = 'sms'; a aba do
 * seller lê por `get_channel_unit_prices`). Esta constante é a estimativa dos editores de SMS — mantenha igual ao
 * preço de lá (14/10/2026: R$ 0,03).
 * NÃO repetir esse número em componentes — sempre importar daqui.
 */
export const SMS_COST_PER_SEGMENT_CENTS = 3;

/**
 * Alias histórico do mesmo valor. A aba de templates de SMS
 * (src/components/account/sms-templates/types.ts) importa e reexporta este nome;
 * manter os dois exports evita quebrar o build de quem já usa qualquer um deles.
 */
export const COST_PER_SMS_CENTS = SMS_COST_PER_SEGMENT_CENTS;

/** Limite de caracteres de uma mensagem SMS única (8 segmentos concatenados). */
export const SMS_MAX_LENGTH = 1280;

export function normalizePhone(raw: string): string {
  const digits = (raw ?? "").replace(/\D/g, "");
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) return digits;
  if (digits.length === 10 || digits.length === 11) return "55" + digits;
  throw new Error("Telefone inválido");
}

export function tryNormalizePhone(raw: string): string | null {
  try { return normalizePhone(raw); } catch { return null; }
}

export function countSmsSegments(text: string): number {
  const len = (text ?? "").length;
  if (len === 0) return 1;
  return Math.max(1, Math.ceil(len / 160));
}

export function estimateCostCents(
  text: string,
  costPerSmsCents: number = SMS_COST_PER_SEGMENT_CENTS,
): number {
  return countSmsSegments(text) * costPerSmsCents;
}

export interface SmsStats {
  /** Quantidade de caracteres do texto. */
  length: number;
  /** Segmentos de 160 chars (mínimo 1). */
  segments: number;
  /** Custo estimado em centavos. */
  costCents: number;
  /** true quando o texto ultrapassa SMS_MAX_LENGTH. */
  overLimit: boolean;
}

/** Resumo de tamanho/segmentos/custo usado pelos painéis de SMS do canvas. */
export function summarizeSms(
  text: string | null | undefined,
  costPerSmsCents: number = SMS_COST_PER_SEGMENT_CENTS,
): SmsStats {
  const body = text ?? "";
  const segments = countSmsSegments(body);
  return {
    length: body.length,
    segments,
    costCents: segments * costPerSmsCents,
    overLimit: body.length > SMS_MAX_LENGTH,
  };
}

export function formatPhoneBR(normalized: string): string {
  const d = (normalized ?? "").replace(/\D/g, "");
  if (d.length === 13 && d.startsWith("55")) {
    return `+55 (${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`;
  }
  if (d.length === 12 && d.startsWith("55")) {
    return `+55 (${d.slice(2, 4)}) ${d.slice(4, 8)}-${d.slice(8)}`;
  }
  return normalized;
}

export function formatBRL(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export function maskPhoneInput(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}
