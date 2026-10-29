import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { noSite } from "@/app/site"; // app: conversa abre no site
import { Button } from "@/components/ui/button";
import { ShoppingBag, DollarSign, Clock, Cake, MessageSquare, Pencil, Zap } from "lucide-react";
import { formatCurrency } from "@/utils/formatters";
import { differenceInCalendarDays, differenceInYears, parseISO } from "date-fns";
import { TooltipProvider } from "@/components/ui/tooltip";
import { TriggerWorkflowDialog } from "@/components/crm/TriggerWorkflowDialog";
import { EditClientDialog, type ClientSavedPatch } from "@/components/clients/EditClientDialog";
import { maskFullName } from "@/utils/showcaseMask";
import { contactDisplayName } from "@/utils/formatters";
import { ClientAvatar } from "@/components/crm/ClientAvatar";
import { useClientRfv, RFV_COLORS } from "@/hooks/useRfv";
import { StageBadge } from "@/components/crm/StageBadge";
import { groupOrdersByWindow } from "@/utils/groupOrdersByWindow";
import { useNumeroErrado } from "@/hooks/useNumeroErrado";
import { NumeroErradoEtiqueta } from "@/components/clients/NumeroErrado";

interface Props {
  client: any;
  pipeline?: any;
  orders: any[];
  sellerId: string;
  isWindowOpen: boolean;
  /** Vitrine do admin: esconde nome real e os botões que agem sobre o cliente. */
  masked?: boolean;
  /** Painel lateral do Omnichannel: já se está na conversa, o botão não leva a lugar nenhum. */
  hideConversarButton?: boolean;
  /** Sobrescreve o clique em "Conversar" (default: navega para /omnichannel). */
  onConversar?: () => void;
  /**
   * Avisa quem guarda o cliente FORA do react-query (a lista de conversas do
   * Omnichannel, a tabela de /clientes) que os dados mudaram. Opcional: quem não
   * passa nada continua igual — o react-query já é invalidado pelo diálogo.
   */
  onClientSaved?: (patch: ClientSavedPatch) => void;
}

export function ClientHeader({
  client, pipeline, orders, sellerId, isWindowOpen, masked = false,
  hideConversarButton = false, onConversar, onClientSaved,
}: Props) {
  const navigate = useNavigate();
  const [workflowOpen, setWorkflowOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const { data: rfv } = useClientRfv(client?.id, sellerId);
  const rfvColor = rfv?.segment ? (RFV_COLORS[rfv.segment] ?? "#94a3b8") : "#94a3b8";
  const stageColor = pipeline?.pipeline_stages?.color ?? null;
  const stageName = pipeline?.pipeline_stages?.name;
  // "Não sou eu": marca ativa no telefone ATUAL do cliente (global ou desta loja).
  const { marca: numeroErrado } = useNumeroErrado(client?.id, sellerId, [client?.whatsapp]);
  // Sem ficha nomeada, o telefone identifica melhor que "Cliente sem nome" — era
  // o que a tela do Omnichannel mostrava com o número visível bem ao lado.
  // No modo mascarado o telefone NÃO entra: mascarar o nome e vazar o contato
  // logo abaixo não mascara nada.
  const nome = masked
    ? (maskFullName(client?.full_name || "") || "Cliente sem nome")
    : contactDisplayName(client?.full_name, client?.whatsapp, client?.email, "Cliente sem nome");

  const stats = useMemo(() => {
    const totalSpent = orders.reduce((s, o) => s + Number(o.total_amount || 0), 0);
    // COMPRAS, não linhas de pedido: o desdobro do Bling virava "2 pedidos" no
    // chip enquanto a aba Pedidos do MESMO sheet agrupava e mostrava 1.
    const compras = groupOrdersByWindow(orders);
    const totalOrders = compras.length;
    const lastOrder = compras[0]?.primary ?? orders[0];
    // Dias de CALENDÁRIO, não períodos de 24h: é a mesma conta que gera a nota R
    // do RFV no banco (current_date - last_order::date). Com differenceInDays um
    // pedido de 2d20h sairia "há 2 dias" aqui e "há 3 dias" no card de RFV logo
    // abaixo — dois números diferentes para a mesma coisa na mesma tela.
    const daysSinceLast = lastOrder?.acquired_at
      ? differenceInCalendarDays(new Date(), new Date(lastOrder.acquired_at))
      : null;
    const nascimento = client?.birthdate ? parseISO(client.birthdate) : null;
    const idade = nascimento ? differenceInYears(new Date(), nascimento) : (client?.age ?? null);
    return { totalSpent, totalOrders, daysSinceLast, idade };
  }, [orders, client?.birthdate, client?.age]);

  return (
    <TooltipProvider delayDuration={200}>
      <div className="px-6 pt-8 pb-5 flex flex-col items-center text-center border-b">
        {/* O avatar identifica a PESSOA (mesmo sorteio pelo nome usado no card da
            lista e no cabeçalho da conversa). Tingi-lo com a cor da fase deixava o
            mesmo cliente com três cores diferentes na mesma tela. */}
        <ClientAvatar name={client?.full_name} size={80} fontSize={28} className="mb-4" />
        <h2 className="text-[24px] font-bold text-foreground leading-tight">{nome}</h2>

        <div className="flex flex-wrap items-center justify-center gap-2 mt-3">
          <StageBadge name={stageName} color={stageColor} size="lg" />
          <span className={`px-3 py-1.5 rounded-full text-[12px] font-semibold ${
            isWindowOpen ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
          }`}>
            {isWindowOpen ? "Janela 24h Aberta" : "Janela 24h Fechada"}
          </span>
          {rfv?.segment && (
            <span
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold"
              style={{ background: `${rfvColor}18`, color: rfvColor }}
              title={`Análise RFV — score ${rfv.r}${rfv.f}${rfv.v}`}
            >
              <span className="h-2 w-2 rounded-full" style={{ background: rfvColor }} />
              {rfv.segment}
            </span>
          )}
          {numeroErrado && client?.id && (
            <NumeroErradoEtiqueta
              marca={numeroErrado}
              clientId={client.id}
              nome={client?.full_name?.trim() || null}
              masked={masked}
            />
          )}
        </div>

        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 mt-3 text-[13px] font-medium text-muted-foreground">
          <span className="inline-flex items-center gap-1 tabular-nums">
            <ShoppingBag className="h-3.5 w-3.5" /> {stats.totalOrders} pedido{stats.totalOrders === 1 ? "" : "s"}
          </span>
          <span>·</span>
          <span className="inline-flex items-center gap-1 tabular-nums">
            <DollarSign className="h-3.5 w-3.5" /> {formatCurrency(stats.totalSpent)}
          </span>
          {stats.daysSinceLast !== null && (
            <>
              <span>·</span>
              <span className="inline-flex items-center gap-1 tabular-nums">
                <Clock className="h-3.5 w-3.5" /> há {stats.daysSinceLast} dia{stats.daysSinceLast === 1 ? "" : "s"}
              </span>
            </>
          )}
          {stats.idade !== null && (
            <>
              <span>·</span>
              <span className="inline-flex items-center gap-1 tabular-nums">
                <Cake className="h-3.5 w-3.5" /> {stats.idade} anos
              </span>
            </>
          )}
        </div>

        {!masked && (
          <div className="flex flex-wrap items-center justify-center gap-2 mt-4">
            {!hideConversarButton && (
              <Button
                size="sm"
                // A página lê `client_id` do querystring; com `client` o link abria o
                // Omnichannel sem selecionar ninguém.
                onClick={onConversar ?? (() => window.open(noSite(`/omnichannel?client_id=${client?.id}`), "_blank"))} // app: o WhatsApp ainda não tem tela no app
                className="rounded-md h-9 px-4"
              >
                <MessageSquare className="h-4 w-4 mr-1.5" /> Conversar
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => setEditOpen(true)} className="rounded-md h-9 px-4">
              <Pencil className="h-4 w-4 mr-1.5" /> Editar
            </Button>
            <Button size="sm" variant="outline" onClick={() => setWorkflowOpen(true)} className="rounded-md h-9 px-4">
              <Zap className="h-4 w-4 mr-1.5" /> Workflow
            </Button>
          </div>
        )}
      </div>

      {client?.id && !masked && (
        <>
          <TriggerWorkflowDialog
            open={workflowOpen}
            onOpenChange={setWorkflowOpen}
            clientId={client.id}
            sellerId={sellerId}
            clientName={client.full_name ?? undefined}
          />
          <EditClientDialog
            open={editOpen}
            onOpenChange={setEditOpen}
            client={client}
            sellerId={sellerId}
            onSaved={onClientSaved}
          />
        </>
      )}
    </TooltipProvider>
  );
}
