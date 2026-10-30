import { useEffect, useState, useRef, type ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Trash2, Check, X, Palette, LogIn } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const PRESET_COLORS = [
  "#6366f1", // indigo
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#f43f5e", // rose
  "#ef4444", // red
  "#f97316", // orange
  "#eab308", // yellow
  "#22c55e", // green
  "#14b8a6", // teal
  "#06b6d4", // cyan
  "#3b82f6", // blue
  "#64748b", // slate
];

interface EditableStageHeaderProps {
  stageId: string;
  stageName: string;
  stageColor: string;
  clientCount: number;
  sellerId: string;
  hasClients: boolean;
  /** Fase onde os clientes novos do marketplace entram (pipeline_stages.is_entry).
      É uma marca própria, independente da posição — reordenar não a move. */
  isEntry?: boolean;
  /**
   * Conteúdo à direita do nome, na mesma linha (no celular: ordenar, filtros
   * e o menu da coluna). No lugar dele, o computador põe essas ações numa
   * segunda linha do cabeçalho da coluna.
   */
  direita?: ReactNode;
  /** Sem a margem de baixo (quando a linha é o cabeçalho inteiro). */
  semMargem?: boolean;
  /**
   * Abre a confirmação de excluir a fase quando muda (um contador). No celular
   * a lixeira do hover não existe e o "Excluir fase" mora no menu da coluna.
   */
  pedidoExcluir?: number;
}

export function EditableStageHeader({
  stageId,
  stageName,
  stageColor,
  clientCount,
  sellerId,
  hasClients,
  isEntry = false,
  direita,
  semMargem = false,
  pedidoExcluir = 0,
}: EditableStageHeaderProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedName, setEditedName] = useState(stageName);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  useEffect(() => {
    if (pedidoExcluir > 0) setShowDeleteDialog(true);
  }, [pedidoExcluir]);
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const [currentColor, setCurrentColor] = useState(stageColor);
  const customColorRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const handleSave = async () => {
    if (!editedName.trim()) {
      toast.error("O nome da fase não pode estar vazio");
      return;
    }

    try {
      const { error } = await supabase
        .from("pipeline_stages")
        .update({ name: editedName.trim() })
        .eq("id", stageId);

      if (error) throw error;

      toast.success("Fase atualizada");
      setIsEditing(false);
      queryClient.invalidateQueries({ queryKey: ["pipeline-stages", sellerId] });
    } catch (error) {
      console.error("Error updating stage:", error);
      toast.error("Erro ao atualizar fase");
    }
  };

  const handleColorChange = async (color: string) => {
    setCurrentColor(color);
    try {
      const { error } = await supabase
        .from("pipeline_stages")
        .update({ color })
        .eq("id", stageId);

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ["pipeline-stages", sellerId] });
    } catch (error) {
      console.error("Error updating color:", error);
      toast.error("Erro ao atualizar cor");
      setCurrentColor(stageColor); // revert
    }
  };

  const handleDelete = async () => {
    // O banco re-marca sozinho a manual de menor posição se a entrada for
    // apagada (trigger), mas quem apaga precisa saber que está mudando onde
    // os clientes novos vão cair — então aqui a escolha é explícita.
    if (isEntry) {
      toast.error("Esta é a fase de entrada. Defina outra fase como entrada antes de excluí-la.");
      setShowDeleteDialog(false);
      return;
    }
    try {
      // Move clients back to their previous stage before deleting
      if (hasClients) {
        // Get all clients in this stage
        const { data: clientsInStage } = await supabase
          .from('client_pipeline')
          .select('id, client_id, previous_stage_id')
          .eq('stage_id', stageId)
          .eq('seller_id', sellerId);

        if (clientsInStage && clientsInStage.length > 0) {
          // Get first available stage that isn't this one as fallback
          const { data: fallbackStages } = await supabase
            .from('pipeline_stages')
            .select('id')
            .eq('seller_id', sellerId)
            .neq('id', stageId)
            .order('position')
            .limit(1);

          const fallbackStageId = fallbackStages?.[0]?.id;

          if (!fallbackStageId) {
            toast.error("Não é possível deletar a única fase existente");
            return;
          }

          // Move each client back to previous stage or fallback
          for (const cp of clientsInStage) {
            const targetStageId = cp.previous_stage_id || fallbackStageId;
            await supabase
              .from('client_pipeline')
              .update({ 
                stage_id: targetStageId, 
                previous_stage_id: stageId,
                moved_at: new Date().toISOString() 
              })
              .eq('id', cp.id);
          }
        }
      }

      const { error } = await supabase
        .from("pipeline_stages")
        .delete()
        .eq("id", stageId);

      if (error) throw error;

      toast.success("Fase deletada. Clientes movidos para fase anterior.");
      queryClient.invalidateQueries({ queryKey: ["pipeline-stages", sellerId] });
      queryClient.invalidateQueries({ queryKey: ["pipeline-clients", sellerId] });
      queryClient.invalidateQueries({ queryKey: ["column-initial", sellerId] });
      queryClient.invalidateQueries({ queryKey: ["column-count", sellerId] });
    } catch (error) {
      console.error("Error deleting stage:", error);
      toast.error("Erro ao deletar fase");
    }
  };

  if (isEditing) {
    return (
      <div className="flex items-center gap-2 mb-2">
        <Input
          value={editedName}
          onChange={(e) => setEditedName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              handleSave();
            } else if (e.key === "Escape") {
              setEditedName(stageName);
              setIsEditing(false);
            }
          }}
          autoFocus
          className="h-8"
        />
        <Button onClick={handleSave} size="icon" variant="ghost" className="h-8 w-8">
          <Check className="h-4 w-4" />
        </Button>
        <Button
          onClick={() => {
            setEditedName(stageName);
            setIsEditing(false);
          }}
          size="icon"
          variant="ghost"
          className="h-8 w-8"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <>
      <div className={`flex items-center justify-between ${direita ? "gap-2" : ""} ${semMargem ? "" : "mb-2"}`}>
        <button
          onClick={() => setIsEditing(true)}
          className="flex items-center gap-2 flex-1 text-left hover:opacity-70 transition-opacity min-w-0"
        >
          {/* Color dot — click to open color picker (stop propagation) */}
          <Popover open={colorPickerOpen} onOpenChange={setColorPickerOpen}>
            <PopoverTrigger asChild>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setColorPickerOpen(true);
                }}
                className="w-4 h-4 rounded-full flex-shrink-0 ring-2 ring-transparent hover:ring-white/60 transition-all relative group/dot"
                style={{ backgroundColor: currentColor }}
                title="Alterar cor"
              >
                <Palette className="absolute inset-0 m-auto h-2 w-2 text-white opacity-0 group-hover/dot:opacity-100 transition-opacity" />
              </button>
            </PopoverTrigger>
            <PopoverContent
              className="w-auto p-3 pointer-events-auto"
              align="start"
              onClick={(e) => e.stopPropagation()}
            >
              <p className="text-xs font-medium text-muted-foreground mb-2">Cor da fase</p>
              {/* Preset swatches */}
              <div className="grid grid-cols-6 gap-1.5 mb-3">
                {PRESET_COLORS.map((color) => (
                  <button
                    key={color}
                    className="w-6 h-6 rounded-full transition-transform hover:scale-110 focus:outline-none"
                    style={{
                      backgroundColor: color,
                      boxShadow: currentColor === color ? `0 0 0 2px hsl(var(--popover)), 0 0 0 3.5px ${color}` : undefined,
                    }}
                    onClick={() => {
                      handleColorChange(color);
                      setColorPickerOpen(false);
                    }}
                    title={color}
                  />
                ))}
              </div>
              {/* Custom color input */}
              <div className="flex items-center gap-2 pt-2 border-t">
                <div
                  className="w-6 h-6 rounded-full flex-shrink-0 cursor-pointer border border-border"
                  style={{ backgroundColor: currentColor }}
                  onClick={() => customColorRef.current?.click()}
                />
                <input
                  ref={customColorRef}
                  type="color"
                  value={currentColor}
                  onChange={(e) => setCurrentColor(e.target.value)}
                  onBlur={(e) => handleColorChange(e.target.value)}
                  className="sr-only"
                />
                <Input
                  value={currentColor}
                  onChange={(e) => setCurrentColor(e.target.value)}
                  onBlur={(e) => {
                    if (/^#[0-9A-Fa-f]{6}$/.test(e.target.value)) {
                      handleColorChange(e.target.value);
                    }
                  }}
                  placeholder="#6366f1"
                  className="h-7 text-xs font-mono"
                  maxLength={7}
                />
              </div>
            </PopoverContent>
          </Popover>

          <h3 className="font-semibold text-sm truncate">{stageName}</h3>
          <span className="text-xs text-muted-foreground flex-shrink-0">({clientCount})</span>
          {isEntry && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium leading-none text-primary flex-shrink-0"
                  onClick={(e) => e.stopPropagation()}
                >
                  <LogIn className="h-3 w-3" />
                  Entrada
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-56 text-xs">
                Clientes novos do marketplace entram nesta fase. Reordenar as colunas não muda isso —
                para trocar, use "Definir como fase de entrada" no menu de outra coluna.
              </TooltipContent>
            </Tooltip>
          )}
        </button>
        {direita}
        <Button
          onClick={() => setShowDeleteDialog(true)}
          size="icon"
          variant="ghost"
          className={`h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 ${direita ? "hidden" : ""}`}
        >
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </div>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deletar fase?</AlertDialogTitle>
            <AlertDialogDescription>
              {hasClients
                ? "Os clientes desta fase serão movidos de volta para a fase anterior automaticamente."
                : "Tem certeza que deseja deletar esta fase? Esta ação não pode ser desfeita."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">
              Deletar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
