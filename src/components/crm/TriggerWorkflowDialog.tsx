import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Zap } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

interface TriggerWorkflowDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string;
  sellerId: string;
  clientName?: string;
}

export function TriggerWorkflowDialog({
  open,
  onOpenChange,
  clientId,
  sellerId,
  clientName,
}: TriggerWorkflowDialogProps) {
  const [workflows, setWorkflows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [triggering, setTriggering] = useState<string | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (open) {
      loadWorkflows();
    }
  }, [open, sellerId]);

  const loadWorkflows = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("workflows")
        .select("*")
        .eq("seller_id", sellerId)
        .eq("active", true)
        .order("name");

      if (error) throw error;
      setWorkflows(data || []);
    } catch (error: any) {
      console.error("Error loading workflows:", error);
      toast.error("Erro ao carregar automações");
    } finally {
      setLoading(false);
    }
  };

  const handleTriggerWorkflow = async (workflowId: string, workflowName: string) => {
    setTriggering(workflowId);
    
    try {
      // Buscar último pedido do cliente para ter dados contextuais
      const { data: lastOrder } = await supabase
        .from("orders")
        .select("id, product, marketplace, total_amount")
        .eq("client_id", clientId)
        .order("acquired_at", { ascending: false })
        .limit(1)
        .single();

      // Enfileirar o workflow usando a função do banco
      const { error } = await supabase.rpc("enqueue_workflow", {
        _workflow_id: workflowId,
        _seller_id: sellerId,
        _client_id: clientId,
        _order_id: lastOrder?.id || null,
        _context: {
          manual_trigger: true,
          triggered_from: "crm",
          triggered_at: new Date().toISOString(),
        },
        _priority: 1, // Alta prioridade para disparos manuais
        _scheduled_for: new Date().toISOString(),
      });

      if (error) throw error;

      toast.success(`Automação "${workflowName}" disparada com sucesso!`, {
        description: `A automação será executada para ${clientName || "o cliente"} em instantes.`,
      });
      
      // Invalidar cache da fila de execução
      queryClient.invalidateQueries({ queryKey: ["workflow-queue"] });
      
      onOpenChange(false);
    } catch (error: any) {
      console.error("Error triggering workflow:", error);
      toast.error("Erro ao disparar automação", {
        description: error.message,
      });
    } finally {
      setTriggering(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-warning" />
            Disparar Automação
          </DialogTitle>
          <DialogDescription>
            Selecione a automação que deseja executar manualmente para{" "}
            <span className="font-medium">{clientName || "este cliente"}</span>
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : workflows.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            Nenhuma automação ativa encontrada
          </div>
        ) : (
          <ScrollArea className="max-h-[400px]">
            <div className="space-y-2 pr-4">
              {workflows.map((workflow) => (
                <div
                  key={workflow.id}
                  className="flex items-center justify-between gap-4 p-3 border rounded-lg hover:bg-accent transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">
                      {workflow.name}
                    </p>
                    {workflow.description && (
                      <p className="text-xs text-muted-foreground truncate">
                        {workflow.description}
                      </p>
                    )}
                  </div>
                  <Button
                    size="sm"
                    onClick={() => handleTriggerWorkflow(workflow.id, workflow.name)}
                    disabled={triggering !== null}
                  >
                    {triggering === workflow.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Zap className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}
