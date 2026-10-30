import { useQuery, useQueryClient } from "@tanstack/react-query";
import { UserPlus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";

interface NoStageClient {
  client_id: string;
  full_name: string | null;
  whatsapp: string | null;
  city: string | null;
  state_code: string | null;
  first_seen_at: string | null;
  total_count: number;
}

interface NoStageSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sellerId: string;
  firstStage?: { id: string; name: string } | null;
  onClientClick?: (clientId: string) => void;
}

const LIMIT = 200;

/**
 * Lista dos clientes do seller que não têm linha em client_pipeline — o que o
 * 4º KPI conta. Jogar um deles numa fase é um insert puro: client_pipeline não
 * tem gatilho de workflow nesta base, então nada é disparado.
 */
export function NoStageSheet({
  open,
  onOpenChange,
  sellerId,
  firstStage,
  onClientClick,
}: NoStageSheetProps) {
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState<string | null>(null);

  const { data: rows = [], isLoading } = useQuery<NoStageClient[]>({
    queryKey: ["crm-no-stage", sellerId],
    enabled: open && !!sellerId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("list_clients_without_stage", {
        _seller_id: sellerId,
        _limit: LIMIT,
      });
      if (error) throw error;
      return (data ?? []) as NoStageClient[];
    },
  });

  const total = rows[0]?.total_count ?? 0;

  const handleAdd = async (clientId: string) => {
    if (!firstStage) return;
    setAdding(clientId);
    try {
      const { error } = await supabase
        .from("client_pipeline")
        .upsert(
          { client_id: clientId, seller_id: sellerId, stage_id: firstStage.id },
          { onConflict: "client_id,seller_id" },
        );
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["crm-no-stage", sellerId] });
      queryClient.invalidateQueries({ queryKey: ["crm-metrics", sellerId] });
      queryClient.invalidateQueries({ queryKey: ["column-initial", sellerId, firstStage.id] });
      queryClient.invalidateQueries({ queryKey: ["column-count", sellerId, firstStage.id] });
      toast.success(`Cliente movido para ${firstStage.name}`);
    } catch {
      toast.error("Não foi possível colocar o cliente no funil");
    } finally {
      setAdding(null);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-lg">
        <SheetHeader className="border-b border-border p-6 pb-4">
          <SheetTitle>Clientes fora do funil</SheetTitle>
          <SheetDescription>
            {Number(total).toLocaleString("pt-BR")} cliente
            {Number(total) === 1 ? "" : "s"} deste seller sem nenhuma fase no Kanban.
            {Number(total) > LIMIT && ` Mostrando os ${LIMIT} mais recentes.`}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-4">
          {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
          {!isLoading && rows.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Todo mundo já está em alguma fase.
            </p>
          )}
          <div className="space-y-2">
            {rows.map((r) => (
              <div
                key={r.client_id}
                className="flex items-center gap-3 rounded-md border border-border bg-card p-3"
              >
                <button
                  type="button"
                  onClick={() => onClientClick?.(r.client_id)}
                  className="min-w-0 flex-1 text-left"
                >
                  <p className="truncate text-sm font-medium text-foreground">
                    {r.full_name || "Sem nome"}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {[r.city, r.state_code].filter(Boolean).join(", ") || r.whatsapp || "—"}
                  </p>
                </button>
                {firstStage && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    disabled={adding === r.client_id}
                    onClick={() => handleAdd(r.client_id)}
                    title={`Colocar em "${firstStage.name}"`}
                  >
                    <UserPlus className="mr-1.5 h-3.5 w-3.5" />
                    {firstStage.name}
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
