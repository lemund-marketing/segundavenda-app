/**
 * Nome em português do status do pedido (o que a loja manda cru: "shipped",
 * "preparando_envio"...). Saiu de PedidosFiltersSheet em 23/10/2026: o card de
 * pedido do Dashboard só precisa desta tabela, e importá-la de lá trazia junto
 * a gaveta de filtros e o diálogo de exportar para o pacote inicial do app.
 */
export const STATUS_LABELS: Record<string, string> = {
  approved: "Pago",
  paid: "Pago",
  completed: "Concluído",
  finalizado: "Concluído",
  enviado: "Enviado",
  shipped: "Enviado",
  entregue: "Entregue",
  delivered: "Entregue",
  preparando_envio: "Preparando envio",
  pronto_envio: "Pronto para envio",
  preparing: "Preparando envio",
  printed: "Etiqueta impressa",
  dropped_off: "Postado",
  in_packing_list: "Em separação",
  pack_splitted: "Em separação",
  to_confirm_receive: "Aguardando recebimento",
  cancelled: "Cancelado",
  cancelado: "Cancelado",
  canceled: "Cancelado",
  refunded: "Reembolsado",
  reembolsado: "Reembolsado",
};

export function statusLabel(status: string): string {
  return STATUS_LABELS[(status || "").toLowerCase()] || status;
}
