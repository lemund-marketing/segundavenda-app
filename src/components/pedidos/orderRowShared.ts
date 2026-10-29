/**
 * Formatação de data da LINHA DE PEDIDO — a mesma na aba Pedidos e no bloco
 * "Últimos pedidos" do Dashboard.
 *
 * Mora aqui desde 28/08/2026, quando o bloco do Dashboard passou a repetir a
 * linha da aba Pedidos. Enquanto cada tela tinha o seu `toLocaleDateString`, o
 * Dashboard formatava no fuso do navegador e a aba Pedidos em São Paulo: um
 * pedido das 21h de 28/08 aparecia como 29/08 num lugar e 28/08 no outro, para
 * quem estivesse fora do fuso de Brasília.
 *
 * TUDO nesta linha conta o dia em America/Sao_Paulo — inclusive o pontinho de
 * "hoje", que é o que decide se a bolinha verde acende.
 */
const SP_TZ = "America/Sao_Paulo";

export const DATE_FMT = new Intl.DateTimeFormat("pt-BR", {
  timeZone: SP_TZ,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

export const TIME_FMT = new Intl.DateTimeFormat("pt-BR", {
  timeZone: SP_TZ,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** "AAAA-MM-DD" em São Paulo — a chave de comparação do pontinho "Hoje". */
export const DAY_KEY_FMT = new Intl.DateTimeFormat("en-CA", {
  timeZone: SP_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function isSameDayAsToday(d: Date): boolean {
  return DAY_KEY_FMT.format(d) === DAY_KEY_FMT.format(new Date());
}

/** "Cidade — UF", com o que existir. Vazio quando não há nem um nem outro. */
export function localDoCliente(
  cliente?: { city?: string | null; state_code?: string | null } | null,
): string {
  return [cliente?.city, cliente?.state_code].filter(Boolean).join(" — ");
}

/**
 * Data "AAAA-MM-DD" pura é ancorada ao meio-dia DE SÃO PAULO: com meio-dia
 * local, um navegador a leste de -03 devolvia o dia anterior ao formatar de
 * volta em SP.
 *
 * Estava dentro do `OrdersTableV2` e veio para cá em 29/08/2026 — junto com os
 * formatadores, que é onde ela sempre pertenceu. O bloco de "Últimos pedidos"
 * do Dashboard fazia `new Date(raw)` cru e errava justamente o caso que esta
 * função existe para tratar.
 */
export function parseOrderDate(raw?: string | null): Date | null {
  if (!raw) return null;
  const d = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(`${raw}T12:00:00-03:00`) : new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Data curta "dd/MM HH:mm" — a linha-filha de grupo da tabela e o "quando" do
 * card de pedido do celular (aba Pedidos e Dashboard). Em São Paulo, como o
 * resto da linha: fora de -03 a coluna DATA discordava da própria linha (11,1%
 * dos pedidos de 30 dias caem entre 00:00 e 03:00 UTC).
 */
export const SHORT_FMT = new Intl.DateTimeFormat("pt-BR", {
  timeZone: SP_TZ,
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** Cor do selo de status do pedido (tabela e card do celular). */
export function statusToneClass(status: string): string {
  switch ((status || "").toLowerCase()) {
    case "cancelled":
    case "cancelado":
    case "canceled":
    case "refunded":
    case "reembolsado":
      return "bg-destructive/10 text-destructive border-destructive/30";
    case "enviado":
    case "shipped":
    case "entregue":
    case "delivered":
      return "bg-secondary/10 text-secondary border-secondary/30";
    case "preparando_envio":
    case "pronto_envio":
    case "preparing":
    case "printed":
    case "dropped_off":
    case "in_packing_list":
    case "pack_splitted":
      return "bg-warning/10 text-warning border-warning/30";
    default:
      return "bg-primary/10 text-primary border-primary/30";
  }
}
