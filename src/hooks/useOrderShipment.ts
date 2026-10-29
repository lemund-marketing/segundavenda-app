import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ShipmentRow {
  order_id: string;
  seller_id: string;
  carrier_name: string | null;
  tracking_code: string | null;
  current_status: string | null;
  current_idstatus: number | null;
  is_exception: boolean | null;
  delivered_at: string | null;
  last_event_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ShipmentEventRow {
  id: string;
  order_id: string;
  shipment_id: string;
  raw_carrier: string | null;
  raw_idstatus: number | null;
  raw_description: string | null;
  canonical_status: string;
  is_exception: boolean | null;
  event_at: string;
  event_key: string | null;
  created_at: string;
}

/**
 * Loads the shipment + ordered events for a single order_id.
 * Reads from shipments / shipment_events (NOT orders.shipment_status).
 * Relies on existing RLS: "Members can view their seller shipments".
 */
export function useOrderShipment(orderId: string | null, enabled = true) {
  return useQuery({
    queryKey: ["order-shipment", orderId],
    enabled: enabled && !!orderId,
    staleTime: 30_000,
    queryFn: async () => {
      if (!orderId) return null;

      const { data: shipment, error: sErr } = await supabase
        .from("shipments")
        .select(
          "order_id, seller_id, carrier_name, tracking_code, current_status, current_idstatus, is_exception, delivered_at, last_event_at, created_at, updated_at"
        )
        .eq("order_id", orderId)
        .maybeSingle();

      if (sErr) throw sErr;
      if (!shipment) return { shipment: null, events: [] as ShipmentEventRow[] };

      const { data: events, error: eErr } = await supabase
        .from("shipment_events")
        .select(
          "id, order_id, shipment_id, raw_carrier, raw_idstatus, raw_description, canonical_status, is_exception, event_at, event_key, created_at"
        )
        .eq("order_id", orderId)
        .order("event_at", { ascending: false });

      if (eErr) throw eErr;

      return {
        shipment: shipment as ShipmentRow,
        events: (events || []) as ShipmentEventRow[],
      };
    },
  });
}

/**
 * Returns the set of order ids (from the given list) that currently have a shipment row.
 * Used to conditionally render the "Entrega" action on order rows.
 */
export function useOrdersWithShipments(orderIds: string[]) {
  const key = [...orderIds].sort().join(",");
  return useQuery({
    queryKey: ["orders-with-shipments", key],
    enabled: orderIds.length > 0,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shipments")
        .select("order_id")
        .in("order_id", orderIds);
      if (error) throw error;
      return new Set<string>((data || []).map((r: any) => r.order_id));
    },
  });
}
