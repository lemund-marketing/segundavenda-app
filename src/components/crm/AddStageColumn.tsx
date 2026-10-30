import { useState, useEffect } from "react";
import { Plus, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

interface AddStageColumnProps {
  sellerId: string;
  maxPosition: number;
  /** Celular: ocupa a largura da tela, como as colunas (uma por vez). */
  larguraCheia?: boolean;
}

type ConditionType = "min_orders" | "exact_orders" | "min_spent" | "last_order_within_days" | "no_order_days" | "order_cancelled" | "order_status_equals";
type StageType = "manual" | "auto_assign";

const conditionLabels: Record<ConditionType, string> = {
  min_orders: "Nº mínimo de compras",
  exact_orders: "Nº exato de compras",
  min_spent: "Valor mínimo gasto (R$)",
  last_order_within_days: "Comprou nos últimos X dias",
  no_order_days: "Sem compra há X dias",
  order_cancelled: "Pedido cancelado",
  order_status_equals: "Status do pedido",
};

const conditionPlaceholders: Record<ConditionType, string> = {
  min_orders: "Ex: 2",
  exact_orders: "Ex: 3",
  min_spent: "Ex: 500",
  last_order_within_days: "Ex: 30",
  no_order_days: "Ex: 60",
  order_cancelled: "",
  order_status_equals: "",
};

const stageTypeLabels: Record<StageType, { label: string; description: string }> = {
  manual: { label: "Padrão", description: "Arraste clientes manualmente" },
  auto_assign: { label: "Auto-atribuição", description: "Move clientes automaticamente quando atingem a condição" },
};

export function AddStageColumn({ sellerId, maxPosition, larguraCheia = false }: AddStageColumnProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [stageName, setStageName] = useState("");
  const [stageType, setStageType] = useState<StageType>("manual");
  const [conditionType, setConditionType] = useState<ConditionType>("min_orders");
  const [conditionValue, setConditionValue] = useState("");
  const [conditionStatusValue, setConditionStatusValue] = useState("enviado");
  const queryClient = useQueryClient();

  // Check if seller has orders with status other than approved
  const [hasStatusUpdates, setHasStatusUpdates] = useState(false);
  useEffect(() => {
    if (!sellerId) return;
    supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("seller_id", sellerId)
      .neq("order_status", "approved")
      .then(({ count }) => {
        setHasStatusUpdates((count || 0) > 0);
      });
  }, [sellerId]);

  const visibleConditionTypes = (Object.keys(conditionLabels) as ConditionType[]).filter(
    (ct) => ct !== "order_status_equals" || hasStatusUpdates
  );

  const isConditional = stageType !== "manual";

  const handleReset = () => {
    setStageName("");
    setStageType("manual");
    setConditionType("min_orders");
    setConditionValue("");
    setConditionStatusValue("enviado");
    setIsAdding(false);
  };

  const handleAddStage = async () => {
    if (!stageName.trim()) {
      toast.error("Digite um nome para a fase");
      return;
    }

    if (isConditional && conditionType !== "order_cancelled" && conditionType !== "order_status_equals" && (!conditionValue || Number(conditionValue) <= 0)) {
      toast.error("Digite um valor válido para a condição");
      return;
    }

    if (isConditional && conditionType === "order_status_equals" && !conditionStatusValue) {
      toast.error("Selecione um status de pedido");
      return;
    }

    try {
      const condition = isConditional
        ? conditionType === "order_cancelled"
          ? { type: conditionType, value: 1 }
          : conditionType === "order_status_equals"
          ? { type: conditionType, value: conditionStatusValue }
          : { type: conditionType, value: Number(conditionValue) }
        : null;

      const { error } = await supabase
        .from("pipeline_stages")
        .insert({
          seller_id: sellerId,
          name: stageName.trim(),
          position: maxPosition + 1,
          color: isConditional ? "#f59e0b" : "#6366f1",
          stage_type: stageType,
          condition: condition as any,
        });

      if (error) throw error;

      toast.success("Fase adicionada com sucesso");
      handleReset();
      queryClient.invalidateQueries({ queryKey: ["pipeline-stages", sellerId] });
    } catch (error) {
      console.error("Error adding stage:", error);
      toast.error("Erro ao adicionar fase");
    }
  };

  if (!isAdding) {
    return (
      <div data-kanban-column className={`flex-shrink-0 ${larguraCheia ? "w-full" : "w-80"}`}>
        <Button
          variant="outline"
          className="w-full h-full min-h-[200px] border-2 border-dashed hover:border-primary hover:bg-primary/5"
          onClick={() => setIsAdding(true)}
        >
          <Plus className="h-6 w-6 mr-2" />
          Adicionar Fase
        </Button>
      </div>
    );
  }

  return (
    <div data-kanban-column className={`flex-shrink-0 bg-muted/30 rounded-lg p-4 border-2 border-dashed border-primary ${larguraCheia ? "w-full" : "w-80"}`}>
      <div className="space-y-3">
        <Input
          placeholder="Nome da fase..."
          value={stageName}
          onChange={(e) => setStageName(e.target.value)}
          autoFocus
          className="bg-background"
        />

        {/* Stage Type Selector */}
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Tipo da fase</Label>
        <div className="grid grid-cols-2 gap-1.5">
            {(["manual", "auto_assign"] as StageType[]).map((type) => (
              <button
                key={type}
                onClick={() => setStageType(type)}
                className={`flex flex-col items-center justify-center gap-1 h-14 p-2 rounded-md border text-xs transition-colors ${
                  stageType === type
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-background text-muted-foreground hover:border-primary/50"
                }`}
              >
                {type === "manual" ? (
                  <Plus className="h-3.5 w-3.5" />
                ) : (
                  <Zap className="h-3.5 w-3.5" />
                )}
                <span className="font-medium">{stageTypeLabels[type].label}</span>
              </button>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground">
            {stageTypeLabels[stageType].description}
          </p>
        </div>

        {/* Condition Config (only for non-manual) */}
        {isConditional && (
          <div className="space-y-2 p-2.5 rounded-md bg-accent/30 border border-accent">
            <Label className="text-xs font-medium">Condição</Label>
            <Select
              value={conditionType}
              onValueChange={(v) => setConditionType(v as ConditionType)}
            >
              <SelectTrigger className="h-8 text-xs bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {visibleConditionTypes.map((ct) => (
                  <SelectItem key={ct} value={ct} className="text-xs">
                    {conditionLabels[ct]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {conditionType !== "order_cancelled" && conditionType !== "order_status_equals" && (
              <Input
                type="number"
                min="1"
                placeholder={conditionPlaceholders[conditionType]}
                value={conditionValue}
                onChange={(e) => setConditionValue(e.target.value)}
                className="h-8 text-xs bg-background"
              />
            )}
            {conditionType === "order_cancelled" && (
              <p className="text-[10px] text-muted-foreground">
                Clientes serão movidos automaticamente quando um pedido for cancelado via webhook.
              </p>
            )}
            {conditionType === "order_status_equals" && (
              <div className="space-y-1.5">
                <Select value={conditionStatusValue} onValueChange={setConditionStatusValue}>
                  <SelectTrigger className="h-8 text-xs bg-background">
                    <SelectValue placeholder="Selecione o status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="enviado" className="text-xs">Enviado</SelectItem>
                    <SelectItem value="entregue" className="text-xs">Entregue</SelectItem>
                    <SelectItem value="preparando_envio" className="text-xs">Preparando Envio</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-muted-foreground">
                  Clientes serão movidos automaticamente quando o pedido atingir esse status via webhook.
                </p>
              </div>
            )}
          </div>
        )}

        <div className="flex gap-2">
          <Button
            onClick={handleAddStage}
            size="sm"
            className="flex-1"
          >
            Adicionar
          </Button>
          <Button
            onClick={handleReset}
            variant="outline"
            size="sm"
            className="flex-1"
          >
            Cancelar
          </Button>
        </div>
      </div>
    </div>
  );
}
