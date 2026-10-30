import { ReactNode, useState, MouseEvent } from 'react';
import { Trash2, AlertCircle } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { NodeStyle, nodeShadow } from '@/utils/workflowColors';
import { cn } from '@/lib/utils';
import { usePropostaContext } from '@/contexts/PropostaContext';

export interface BaseNodeProps {
  icon: React.ComponentType<any>;
  title: string;
  subtitle?: ReactNode;
  style: NodeStyle;
  isConfigured?: boolean;
  /** Mostra badge âmbar quando !isConfigured. Default: true. */
  showStatus?: boolean;
  /** Ausente = card não clicável (sem cursor-pointer, sem handler). */
  onClick?: () => void;
  onDelete?: () => void;
  /** Texto exibido no diálogo de confirmação de exclusão. */
  deleteTitle?: string;
  /** Linhas de resumo da config. */
  children?: ReactNode;
  /** Rodapé (ex: rótulos de saídas múltiplas). */
  footer?: ReactNode;
  /** Slot do header (etiqueta "Gatilho", "não oficial"...). */
  headerBadge?: ReactNode;
  /** <Handle> do xyflow. */
  handles?: ReactNode;
  width?: number;
  /** Título e subtítulo por extenso (sem truncate/line-clamp). Ficha da proposta. */
  semClamp?: boolean;
}

export const BaseNode = ({
  icon: Icon,
  title,
  subtitle,
  style,
  isConfigured = true,
  showStatus = true,
  onClick,
  onDelete,
  deleteTitle = 'Excluir nó?',
  children,
  footer,
  headerBadge,
  handles,
  width = 220,
  semClamp = false,
}: BaseNodeProps) => {
  const [showDelete, setShowDelete] = useState(false);
  // Editor de proposta: card e ficha de valores formam um bloco só, então a
  // largura vem do contexto. Default { modoProposta: false } → builder real
  // segue com a prop `width`.
  const { modoProposta, larguraBloco } = usePropostaContext();
  const largura = modoProposta && larguraBloco ? larguraBloco : width;
  // A sombra é tingida com o accent do nó, então precisa ser inline — CSS puro
  // não alcança o hex por tipo. Daí o hover virar estado de React.
  const [hovered, setHovered] = useState(false);

  const handleDeleteClick = (e: MouseEvent) => {
    e.stopPropagation();
    setShowDelete(true);
  };

  const confirmDelete = () => {
    onDelete?.();
    setShowDelete(false);
  };

  return (
    <>
      {/* Este div precisa continuar sendo o PRIMEIRO filho do Fragment:
          o .react-flow__node.selected > * do index.css desenha o halo nele. */}
      <div
        className={cn(
          'group relative rounded-md bg-card transition-all duration-200',
          onClick && 'cursor-pointer'
        )}
        style={{ width: largura, boxShadow: nodeShadow(style.accentHex, hovered) }}
        onClick={onClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {onDelete && (
          // Fora do card: dentro dele o botão cobria o headerBadge e o aviso âmbar,
          // que ficam na mesma quina. O pointer-events-none evita um alvo de clique
          // invisível enquanto ele está transparente; a classe workflow-node-delete
          // é o gancho do index.css que o mantém visível em ponteiro sem hover.
          <button
            type="button"
            onClick={handleDeleteClick}
            className="workflow-node-delete absolute -top-2 -right-2 h-6 w-6 rounded-full bg-card border border-border shadow-sm flex items-center justify-center opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto focus-visible:opacity-100 focus-visible:pointer-events-auto transition-opacity hover:bg-destructive/10 hover:border-destructive/30 z-10"
            aria-label="Excluir nó"
          >
            <Trash2 className="h-3 w-3 text-muted-foreground" />
          </button>
        )}

        <div className="p-3 pl-4">
          <div className="flex items-center gap-2.5">
            <div
              className={cn(
                'w-8 h-8 rounded-sm flex items-center justify-center flex-shrink-0',
                style.iconBg
              )}
            >
              <Icon className={cn('h-4 w-4', style.iconColor)} size={16} />
            </div>
            <div className="min-w-0 flex-1">
              <div
                className={cn(
                  'text-sm font-semibold text-foreground leading-tight',
                  semClamp ? 'whitespace-normal break-words' : 'truncate'
                )}
                title={title}
              >
                {title}
              </div>
              {subtitle && (
                <div
                  className={cn(
                    'text-xs text-muted-foreground mt-0.5',
                    semClamp ? 'whitespace-normal break-words' : 'line-clamp-1'
                  )}
                >
                  {subtitle}
                </div>
              )}
            </div>

            {headerBadge}

            {showStatus && !isConfigured && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div
                      className="w-5 h-5 rounded-full bg-amber-500/15 dark:bg-amber-400/20 flex items-center justify-center flex-shrink-0"
                      aria-label="Configuração necessária"
                    >
                      <AlertCircle className="w-3 h-3 text-amber-700 dark:text-amber-300" />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>Configuração necessária</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>

          {children && <div className="mt-2 space-y-1 text-xs">{children}</div>}
        </div>

        {footer && (
          <div className="px-3 pt-2 pb-2 border-t border-border">{footer}</div>
        )}

        {handles}
      </div>

      {/* Irmão do card, nunca filho: dentro do card o dialog herdaria o
          transform do viewport do React Flow e apareceria escalado/deslocado. */}
      <AlertDialog open={showDelete} onOpenChange={setShowDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{deleteTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O nó será removido do workflow.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

/**
 * Estilo padrão de handle (entrada/saída simples).
 * Use em nós de saída única; nós multi-saída montam os handles inline.
 */
export const handleStyle = (accentHex: string) => ({
  width: 12,
  height: 12,
  background: 'hsl(var(--card))',
  border: `2px solid ${accentHex}`,
});
