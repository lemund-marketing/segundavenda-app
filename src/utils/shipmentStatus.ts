// pt-BR labels and visual tokens for shipment canonical statuses.
// Source of truth: shipments.current_status / shipment_events.canonical_status
// (orders.shipment_status is a stale mirror — DO NOT USE).

export type CanonicalShipmentStatus =
  | "posted"
  | "in_transit"
  | "out_for_delivery"
  | "delivered"
  | "returned"
  | "exception"
  | string;

export function getShipmentStatusLabel(status?: string | null, isException?: boolean): string {
  if (isException) return "Ocorrência";
  switch ((status || "").toLowerCase()) {
    case "posted":
      return "Despachado";
    case "in_transit":
      return "Em trânsito";
    case "out_for_delivery":
      return "Saiu para entrega";
    case "delivered":
      return "Entregue";
    case "returned":
      return "Devolvido";
    case "exception":
      return "Ocorrência";
    default:
      return status || "Sem informação";
  }
}

export type ShipmentStatusTone = "success" | "danger" | "info" | "neutral";

export function getShipmentStatusTone(status?: string | null, isException?: boolean): ShipmentStatusTone {
  if (isException) return "danger";
  switch ((status || "").toLowerCase()) {
    case "delivered":
      return "success";
    case "returned":
    case "exception":
      return "danger";
    case "out_for_delivery":
    case "in_transit":
    case "posted":
      return "info";
    default:
      return "neutral";
  }
}

export function getShipmentBadgeClasses(tone: ShipmentStatusTone): string {
  switch (tone) {
    case "success":
      return "bg-success/15 text-success border-success/30 hover:bg-success/20";
    case "danger":
      return "bg-destructive/15 text-destructive border-destructive/30 hover:bg-destructive/20";
    case "info":
      return "bg-primary/15 text-primary border-primary/30 hover:bg-primary/20";
    case "neutral":
    default:
      return "bg-muted text-muted-foreground border-border hover:bg-muted/80";
  }
}
