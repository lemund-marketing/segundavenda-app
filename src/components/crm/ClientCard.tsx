import { useState, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Cake, MoreVertical, Zap } from "lucide-react";
import WhatsAppIcon from "@/components/WhatsAppIcon";
import { toast } from "sonner";
import { formatCurrency, formatMarketplaceName } from "@/utils/formatters";
import { hexToRgba } from "@/components/clients/sections/shared";
import { getMarketplaceColor } from "@/utils/marketplaceColors";
import { inkPair } from "@/utils/contrastInk";
import { relativeLabel, absoluteLabel } from "@/utils/relativeDate";
import { useMarketplaceAliases } from "@/hooks/useMarketplaceAliases";
import RfvBadge from "@/components/rfv/RfvBadge";
import { ClientAvatar } from "./ClientAvatar";
import { isConditionalStage } from "./kanbanFilters";
import { TriggerWorkflowDialog } from "./TriggerWorkflowDialog";

const HEX_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

interface ClientCardProps {
  client: any;
  allStages: any[];
  currentStageId: string;
  sellerId: string;
  onClientClick: (clientId: string) => void;
  onMoveClient: (clientId: string, newStageId: string, oldStageId?: string) => void;
  /** Segmento RFV — dimensão independente da fase, resolvido uma vez por coluna. */
  rfvSegment?: string | null;
  isMoving?: boolean;
  selectionMode?: boolean;
  selected?: boolean;
  onToggleSelected?: (clientId: string) => void;
  /** No embed não há sessão: Omnichannel e disparo saem do menu. */
  embedded?: boolean;
  /**
   * Celular: card no padrão do app (borda fina, sem sombra nem salto no
   * hover) e "Mover para" com as fases direto no menu — arrastar não existe
   * no toque, e submenu lateral numa tela de 360px abre por cima do próprio
   * menu.
   */
  mobile?: boolean;
}

/** Etiqueta do marketplace do último pedido, legível nos dois temas. */
function MarketplaceBadge({ marketplace, sellerId }: { marketplace: string; sellerId: string }) {
  const { getDisplayName, getBadgeColor } = useMarketplaceAliases(sellerId);

  const alias = getBadgeColor(marketplace);
  const hex = alias && HEX_RE.test(alias) ? alias : getMarketplaceColor(marketplace);
  const label = getDisplayName(marketplace) || formatMarketplaceName(marketplace);

  // A cor da marca serve de fundo como está, mas como TEXTO precisa passar em
  // 4,5:1 — e quem escolhe o tema é o CSS, então as duas tintas viajam juntas.
  const ink = inkPair(hex);
  const style = {
    background: hexToRgba(hex, 0.14),
    borderColor: hexToRgba(hex, 0.32),
    "--pill-ink": ink.light,
    "--pill-ink-dark": ink.dark,
  } as CSSProperties;

  return (
    <span
      className="inline-flex max-w-[120px] items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium leading-none text-[color:var(--pill-ink)] dark:text-[color:var(--pill-ink-dark)]"
      style={style}
    >
      <span className="truncate">{label}</span>
    </span>
  );
}

function isBirthdayThisMonth(birthdate?: string | null) {
  if (!birthdate) return false;
  // `birthdate` é DATE ("1990-04-17"): partir a string evita o fuso virar o mês.
  const month = Number(String(birthdate).slice(5, 7));
  return month >= 1 && month <= 12 && month === new Date().getMonth() + 1;
}

export function ClientCard({
  client,
  allStages,
  currentStageId,
  sellerId,
  onClientClick,
  onMoveClient,
  rfvSegment,
  isMoving = false,
  selectionMode = false,
  selected = false,
  onToggleSelected,
  embedded = false,
  mobile = false,
}: ClientCardProps) {
  const [showWorkflowDialog, setShowWorkflowDialog] = useState(false);
  const navigate = useNavigate();

  const clientData = client.clients || {};
  const orderData = client.orders;
  const clientId: string | undefined = clientData.id || client.client_id;

  const movedAt = client.moved_at || client.created_at || null;
  const time = relativeLabel(movedAt);

  // O valor vem do cache do pipeline (trigger client_pipeline_cache_update); a
  // coluna dinâmica não tem linha em client_pipeline e cai no último pedido.
  const amount = Number(client.cached_order_value ?? orderData?.total_amount ?? 0);
  const marketplace: string | undefined = orderData?.marketplace || client.last_marketplace;
  const location = [clientData.city, clientData.state_code].filter(Boolean).join(", ");
  const showBirthday = isBirthdayThisMonth(clientData.birthdate);
  const lastInteraction = client.cached_last_interaction_at || null;

  // Fase por regra fica de fora: ela lista pela condição e não lê
  // client_pipeline, então mover alguém para lá tira o card da coluna de origem
  // sem colocá-lo em lugar nenhum.
  const otherStages = allStages.filter((s) => s.id !== currentStageId && !isConditionalStage(s));

  const handleDragStart = (e: React.DragEvent) => {
    if (selectionMode || !clientId) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("clientId", clientId);
    e.dataTransfer.setData("currentStageId", currentStageId);
  };

  const handleClick = () => {
    if (!clientId) return;
    if (selectionMode) {
      onToggleSelected?.(clientId);
    } else {
      onClientClick(clientId);
    }
  };

  const handleOmnichannel = () => {
    if (!clientData.whatsapp) {
      toast.error("Cliente não possui WhatsApp cadastrado");
      return;
    }
    navigate(`/omnichannel?client_id=${clientId}`);
  };

  const timeTitle = movedAt
    ? `Entrou na fase em ${absoluteLabel(movedAt)}${
        lastInteraction ? ` · última interação ${absoluteLabel(lastInteraction)}` : ""
      }`
    : undefined;

  return (
    <Card
      className={`p-3 group transition-all duration-200 ease-out cursor-pointer ${
        mobile
          ? "rounded-2xl border border-border/60 shadow-none active:bg-muted"
          : "hover:shadow-hover hover:-translate-y-0.5 dark:border dark:border-border"
      } ${isMoving ? "opacity-40 pointer-events-none scale-95" : ""} ${selected ? "ring-2 ring-primary" : ""}`}
      onClick={handleClick}
      draggable={!mobile && !isMoving && !selectionMode}
      onDragStart={handleDragStart}
    >
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          {selectionMode ? (
            <div className="w-8 flex justify-center shrink-0">
              <Checkbox
                checked={selected}
                onCheckedChange={() => clientId && onToggleSelected?.(clientId)}
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          ) : (
            <ClientAvatar name={clientData.full_name} size={32} />
          )}

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 min-w-0">
              <h4 className="font-semibold text-sm text-foreground truncate leading-tight">
                {clientData.full_name || "Cliente sem nome"}
              </h4>
              {showBirthday && (
                <Cake className="h-3 w-3 text-pink-600 dark:text-pink-400 shrink-0" aria-label="Aniversariante do mês" />
              )}
            </div>
            {movedAt && (
              <p className="text-[11px] text-muted-foreground leading-tight truncate" title={timeTitle}>
                {time.text}
              </p>
            )}
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0 text-muted-foreground">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className={mobile ? "max-h-[70vh] overflow-y-auto" : undefined}
              onClick={(e) => e.stopPropagation()}
            >
              <DropdownMenuItem onClick={() => clientId && onClientClick(clientId)}>
                Ver detalhes
              </DropdownMenuItem>

              {!embedded && (
                <>
                  <DropdownMenuItem onClick={handleOmnichannel}>
                    <WhatsAppIcon className="h-4 w-4 mr-2 text-primary" />
                    Abrir no WhatsApp
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setShowWorkflowDialog(true)}>
                    <Zap className="h-4 w-4 mr-2 text-warning" />
                    Disparar automação
                  </DropdownMenuItem>
                </>
              )}

              {otherStages.length > 0 && mobile && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">Mover para</DropdownMenuLabel>
                  {otherStages.map((stage) => (
                    <DropdownMenuItem
                      key={stage.id}
                      onClick={() => clientId && onMoveClient(clientId, stage.id, currentStageId)}
                    >
                      <span
                        className="w-2 h-2 rounded-full mr-2 shrink-0"
                        style={{ backgroundColor: stage.color }}
                      />
                      {stage.name}
                    </DropdownMenuItem>
                  ))}
                </>
              )}

              {otherStages.length > 0 && !mobile && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>Mover para...</DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                      {otherStages.map((stage) => (
                        <DropdownMenuItem
                          key={stage.id}
                          onClick={() => clientId && onMoveClient(clientId, stage.id, currentStageId)}
                        >
                          <span
                            className="w-2 h-2 rounded-full mr-2 shrink-0"
                            style={{ backgroundColor: stage.color }}
                          />
                          {stage.name}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {(amount > 0 || marketplace || location || rfvSegment) && (
          <div className="flex items-center gap-2 flex-wrap pl-10 -mt-0.5">
            {amount > 0 && (
              <span className="text-sm font-semibold tabular-nums text-foreground">
                {formatCurrency(amount)}
              </span>
            )}
            {marketplace && <MarketplaceBadge marketplace={marketplace} sellerId={sellerId} />}
            <RfvBadge segment={rfvSegment} variant="dot" />
            {location && (
              <span className="text-[11px] text-muted-foreground truncate">{location}</span>
            )}
          </div>
        )}
      </div>

      {showWorkflowDialog && clientId && (
        <TriggerWorkflowDialog
          open={showWorkflowDialog}
          onOpenChange={setShowWorkflowDialog}
          clientId={clientId}
          sellerId={sellerId}
          clientName={clientData.full_name}
        />
      )}
    </Card>
  );
}
