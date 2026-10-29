import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Check, Truck, AlertTriangle, Package } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useOrderShipment } from "@/hooks/useOrderShipment";
import {
  getShipmentStatusLabel,
  getShipmentStatusTone,
  getShipmentBadgeClasses,
} from "@/utils/shipmentStatus";

interface OrderShipmentSheetProps {
  orderId: string | null;
  externalOrderId?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function OrderShipmentSheet({
  orderId,
  externalOrderId,
  open,
  onOpenChange,
}: OrderShipmentSheetProps) {
  const { data, isLoading } = useOrderShipment(orderId, open);
  const shipment = data?.shipment ?? null;
  const events = data?.events ?? [];

  const headerTone = getShipmentStatusTone(shipment?.current_status, !!shipment?.is_exception);
  const headerLabel = getShipmentStatusLabel(shipment?.current_status, !!shipment?.is_exception);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Truck className="w-5 h-5" />
            Status de entrega
          </SheetTitle>
          <SheetDescription>
            Acompanhamento de envio do pedido {externalOrderId || orderId?.slice(0, 8)}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-4">
          {isLoading && (
            <Card>
              <CardHeader>
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-4 w-56 mt-2" />
              </CardHeader>
              <CardContent className="space-y-4">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex gap-3">
                    <Skeleton className="w-6 h-6 rounded-full" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-3 w-40" />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {!isLoading && !shipment && (
            <div className="text-center py-12 text-muted-foreground">
              <Package className="w-10 h-10 mx-auto mb-3 opacity-60" />
              <p className="text-sm">Sem informações de envio para este pedido.</p>
            </div>
          )}

          {!isLoading && shipment && (
            <Card className="border-0 shadow-card">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-base font-semibold leading-tight">
                      Pedido {externalOrderId || orderId?.slice(0, 8)}
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1 truncate">
                      {shipment.carrier_name || "Transportadora não informada"}
                      {shipment.tracking_code ? ` · rastreio ${shipment.tracking_code}` : ""}
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className={cn("shrink-0", getShipmentBadgeClasses(headerTone))}
                  >
                    {headerLabel}
                  </Badge>
                </div>
              </CardHeader>

              <CardContent>
                {events.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-6 text-center">
                    Sem eventos registrados ainda.
                  </p>
                ) : (
                  <ol className="relative">
                    {events.map((ev, idx) => {
                      const isFirst = idx === 0;
                      const isLast = idx === events.length - 1;
                      const isException = !!ev.is_exception;
                      const label = getShipmentStatusLabel(ev.canonical_status, isException);
                      const dt = new Date(ev.event_at);
                      const when = format(dt, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });

                      return (
                        <li key={ev.id} className="flex gap-3 pb-5 last:pb-0 relative">
                          {/* connector line */}
                          {!isLast && (
                            <span
                              aria-hidden
                              className="absolute left-3 top-6 bottom-0 w-px bg-border"
                            />
                          )}
                          {/* dot */}
                          <span
                            className={cn(
                              "relative z-10 w-6 h-6 rounded-full border flex items-center justify-center shrink-0",
                              isException
                                ? "bg-destructive border-destructive text-destructive-foreground"
                                : isFirst
                                ? "bg-success border-success text-success-foreground"
                                : "bg-muted border-border text-muted-foreground"
                            )}
                          >
                            {isException ? (
                              <AlertTriangle className="w-3.5 h-3.5" />
                            ) : isFirst ? (
                              <Check className="w-3.5 h-3.5" />
                            ) : null}
                          </span>
                          {/* content */}
                          <div className="flex-1 min-w-0 pt-0.5">
                            <p
                              className={cn(
                                "text-sm font-medium leading-tight",
                                isException
                                  ? "text-destructive"
                                  : isFirst
                                  ? "text-foreground"
                                  : "text-foreground/90"
                              )}
                            >
                              {label}
                            </p>
                            <p
                              className={cn(
                                "text-xs mt-1",
                                isException ? "text-destructive/80" : "text-muted-foreground"
                              )}
                            >
                              {when}
                            </p>
                            {ev.raw_description && (
                              <p className="text-xs text-muted-foreground/80 mt-1 line-clamp-2">
                                {ev.raw_description}
                              </p>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
