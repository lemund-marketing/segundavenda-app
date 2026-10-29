import { useState, useMemo } from "react";
import { formatCurrency, formatMarketplaceName } from "@/utils/formatters";
import { groupOrdersByWindow } from "@/utils/groupOrdersByWindow";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useClientRfvTimeline, RFV_COLORS } from "@/hooks/useRfv";
import { RfvBadge } from "@/components/rfv/RfvBadge";
import { statusLabel } from "@/components/pedidos/statusPedido";
import { useClientOrderStatusHistory } from "@/hooks/useClientOrderStatusHistory";

interface Props {
  client: any;
  sellerId?: string;
  orders: any[];
  messages: any[];
  smsMessages?: any[];
  emailLogs?: any[];
  wflows: any[];
  interactions: any[];
  /** Vitrine do admin: só leitura, ninguém escreve interação em nome do seller. */
  masked?: boolean;
}

/**
 * `client_interactions.interaction_type` → como o evento se apresenta.
 * As chaves são os valores realmente gravados: as cinco do seletor da caixa de
 * registro (note/call/email/whatsapp/meeting) e `stage_changed`, que o Kanban, o
 * cabeçalho da conversa e o diálogo de edição gravam sem ninguém digitar nada.
 */
const TIPOS_DE_INTERACAO: Record<string, { icon: string; title: string; color: string }> = {
  note: { icon: "📝", title: "Nota", color: "#3b82f6" },
  call: { icon: "📞", title: "Ligação", color: "#3b82f6" },
  email: { icon: "📧", title: "E-mail registrado", color: "#3b82f6" },
  whatsapp: { icon: "💬", title: "WhatsApp registrado", color: "#3b82f6" },
  meeting: { icon: "📅", title: "Reunião", color: "#3b82f6" },
  stage_changed: { icon: "🔀", title: "Fase do CRM alterada", color: "#8b5cf6" },
};

export function ClientHistoryTab({
  client, sellerId, orders, messages, smsMessages = [], emailLogs = [], wflows, interactions,
  masked = false,
}: Props) {
  const [filter, setFilter] = useState<string>("all");
  const { data: rfvTimeline } = useClientRfvTimeline(client?.id, sellerId);
  const { data: mudancasDeStatus } = useClientOrderStatusHistory(client?.id, sellerId);

  const events = useMemo(() => {
    // `dayOnly` marca evento cuja origem só tem precisão de dia — a linha do tempo
    // omite a hora nesses casos em vez de exibir um horário que não existe.
    // `badge` é o segmento RFV: quando presente, a linha ganha a etiqueta colorida
    // (RfvBadge) em vez de repetir o nome do segmento dentro do título.
    const e: { ts: number; type: string; icon: string; title: string; subtitle?: string; color: string; dayOnly?: boolean; badge?: string }[] = [];

    // Mesma regra da listagem de pedidos: o Bling as vezes desdobra 1 compra em
    // 2 pedidos (mesmo cliente, ~1 min de diferenca). Sem agrupar, a compra
    // aparecia DUAS vezes na linha do tempo.
    const grupoDoPedido = new Map<string, string>();
    for (const g of groupOrdersByWindow(orders)) {
      for (const membro of g.orders) grupoDoPedido.set(membro.id, g.id);
      const o = g.primary;
      e.push({
        ts: new Date(g.acquired_at ?? o.acquired_at).getTime(),
        type: "order",
        icon: "📦",
        title: `Pedido — ${o.product || "Produto"}`,
        subtitle: `${formatCurrency(g.total_amount)}${o.marketplace ? ` · ${formatMarketplaceName(o.marketplace)}` : ""}${g.count > 1 ? ` · ${g.count} pedidos agrupados` : ""}`,
        color: "#09AF68",
      });
    }
    // Mudanças de status dos pedidos (13/10/2026), um item por troca, no filtro
    // "Pedidos". Toda troca que a integração manda fica gravada, com ou sem fluxo.
    // Pela mesma razão do agrupamento acima, os pedidos desdobrados da mesma compra
    // mudam de status juntos: a mesma troca, no mesmo grupo e nos mesmos 2 minutos,
    // aparece uma vez só (também some o webhook repetido que grava a troca 2x).
    // Troca que não muda o nome exibido (approved → paid são os dois "Pago";
    // "ENVIADO" → "enviado") também fica de fora: na tela seria "Pago → Pago".
    const trocasVistas = new Set<string>();
    for (const s of mudancasDeStatus ?? []) {
      if (s.old_status && statusLabel(s.old_status) === statusLabel(s.new_status)) continue;
      const ts = new Date(s.changed_at).getTime();
      const chave = `${grupoDoPedido.get(s.order_id) ?? s.order_id}|${s.old_status ?? ""}|${s.new_status}|${Math.floor(ts / 120_000)}`;
      if (trocasVistas.has(chave)) continue;
      trocasVistas.add(chave);
      const novo = (s.new_status || "").toLowerCase();
      const cancelou = /cancel|reembols|refund|devol/.test(novo);
      const pedido = s.external_order_id ? `Pedido #${s.external_order_id}` : `Pedido — ${s.product || "Produto"}`;
      e.push({
        ts,
        type: "order",
        icon: cancelou ? "❌" : "🚚",
        title: s.old_status
          ? `Status do pedido: ${statusLabel(s.old_status)} → ${statusLabel(s.new_status)}`
          : `Status do pedido: ${statusLabel(s.new_status)}`,
        subtitle: `${pedido}${s.marketplace ? ` · ${formatMarketplaceName(s.marketplace)}` : ""}`,
        color: cancelou ? "#ef4444" : "#f59e0b",
      });
    }
    for (const m of messages) {
      e.push({
        ts: new Date(m.created_at).getTime(),
        type: "message",
        icon: m.direction === "inbound" ? "📩" : "📱",
        title: m.direction === "inbound" ? "WhatsApp recebido" : "WhatsApp enviado",
        subtitle: String(m.content || "").slice(0, 100),
        color: "#22c55e",
      });
    }
    for (const s of smsMessages) {
      const st = s.clicked_at ? "clicado" : s.delivered_at ? "entregue" : (s.status || "enviado");
      e.push({
        ts: new Date(s.created_at).getTime(),
        type: "message",
        icon: "📲",
        title: "SMS enviado",
        subtitle: `Status: ${st}${s.segments ? ` · ${s.segments} seg` : ""}`,
        color: "#0ea5e9",
      });
    }
    for (const em of emailLogs) {
      const st = em.clicked_at ? "clicado" : em.opened_at ? "aberto" : em.bounced_at ? "bounce" : em.delivered_at ? "entregue" : (em.status || "enviado");
      e.push({
        ts: new Date(em.created_at).getTime(),
        type: "message",
        icon: "✉️",
        title: "E-mail enviado",
        subtitle: `${em.subject ? em.subject + " · " : ""}${st}`,
        color: "#6366f1",
      });
    }
    for (const w of wflows) {
      e.push({
        ts: new Date(w.created_at).getTime(),
        type: "workflow",
        icon: "⚡",
        title: `Workflow ${w.workflows?.name ? `"${w.workflows.name}"` : ""} executado`,
        subtitle: w.status,
        color: "#8b5cf6",
      });
    }
    for (const i of interactions) {
      const meta = TIPOS_DE_INTERACAO[i.interaction_type as string];
      e.push({
        ts: new Date(i.created_at).getTime(),
        type: "crm",
        icon: meta?.icon ?? "📌",
        // Sem isto, uma mudança AUTOMÁTICA de fase (gravada pelo Kanban, pelo
        // cabeçalho da conversa e pelo diálogo de edição) aparecia como
        // "Interação manual" — uma nota que ninguém escreveu.
        title: meta?.title ?? "Interação manual",
        subtitle: i.content,
        color: meta?.color ?? "#3b82f6",
      });
    }
    // Eventos de RFV, de volta em 29/08 (tinham saído em 07/08, no cc8be12c).
    // O histórico anterior à feature é RECONSTRUÍDO a partir dos pedidos usando a
    // régua atual da base — os quintis de valor de meses atrás não são recuperáveis
    // (é a fatia `source = 'backfill'` de client_rfv_events). As datas de transição
    // são exatas quanto ao comportamento de compra, mas com a régua de hoje.
    for (const [idx, t] of (rfvTimeline ?? []).entries()) {
      // Nenhuma das TRÊS origens de client_rfv_events grava um INSTANTE de negócio
      // em `changed_at`: rfv_backfill_events crava 12:00 UTC do dia (09:00 BRT),
      // rfv_take_snapshot grava a hora do cron `rfv-snapshot-diario` (07:10 UTC =
      // 04:10 BRT) e rfv_fill_new_clients, no cron `rfv-preenche-novos`, grava
      // now() a cada 15 minutos — qualquer hora do dia, e também com source
      // 'snapshot'. Exibir "às 04:10" seria mostrar o horário da rotina, não o do
      // cliente: daí `dayOnly`.
      // A data sai do calendário LOCAL, não do UTC. É para isso que a migração
      // 20260730140000 escolheu meio-dia UTC no backfill ("a tela formata no fuso
      // do navegador"): lido em BRT (UTC-3), 12:00 UTC e 07:10 UTC caem no mesmo
      // dia. Ler pelo calendário UTC quebrava justamente o preenchimento dos
      // clientes novos: quem entra entre 21:00 e 23:59 BRT (00:00–02:59 UTC do dia
      // seguinte) — horário de pico de pedidos — aparecia com a data de amanhã.
      // Ancoramos no FIM do dia local para a virada ficar depois dos pedidos
      // daquele mesmo dia, que são o que a causou.
      const d = new Date(t.changed_at);
      const ts = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59).getTime();
      e.push({
        ts,
        type: "rfv",
        icon: "🎯",
        // Os 11 rótulos não flexionam (plurais, orações inteiras como "Não posso
        // perdê-los"), então o nome fica isolado na etiqueta em vez de encaixado
        // na frase.
        title: idx === 0 ? "Segmento RFV" : "Segmento RFV mudou para",
        badge: t.segment,
        subtitle: t.previous_segment ? `Antes: ${t.previous_segment}` : undefined,
        // Token, não hex, no fallback: o marcador precisa existir nos dois temas.
        color: RFV_COLORS[t.segment] || "hsl(var(--muted-foreground))",
        dayOnly: true,
      });
    }
    if (client?.created_at) {
      e.push({
        ts: new Date(client.created_at).getTime(),
        type: "crm",
        icon: "🆕",
        title: "Cliente criado",
        color: "hsl(var(--muted-foreground))",
      });
    }
    e.sort((a, b) => b.ts - a.ts);
    if (filter !== "all") return e.filter((x) => x.type === filter);
    return e;
  }, [orders, messages, smsMessages, emailLogs, wflows, interactions, rfvTimeline, mudancasDeStatus, client?.created_at, filter]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {[
          { v: "all", l: "Todos" },
          { v: "message", l: "Mensagens" },
          { v: "order", l: "Pedidos" },
          { v: "rfv", l: "RFV" },
          { v: "crm", l: "CRM" },
          { v: "workflow", l: "Workflows" },
        ].map((c) => (
          <button
            key={c.v}
            onClick={() => setFilter(c.v)}
            className={`px-3 py-1.5 rounded-full text-[11px] font-semibold border ${
              filter === c.v
                ? "bg-foreground text-background border-foreground"
                : "bg-card text-foreground border-border hover:border-foreground/30"
            }`}
          >
            {c.l}
          </button>
        ))}
      </div>

      {events.length === 0 ? (
        <div className="text-center py-10 text-sm text-muted-foreground">Nenhum histórico ainda.</div>
      ) : (
        <div className="space-y-0">
          {events.map((e, i) => (
            <div key={i} className="flex gap-3 group hover:bg-muted/40 -mx-2 px-2 py-2 rounded-lg transition-colors">
              <div className="flex flex-col items-center pt-1">
                <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: e.color }} />
                {i < events.length - 1 && <div className="w-px flex-1 bg-border mt-1" />}
              </div>
              <div className="flex-1 pb-3 min-w-0">
                <p className="text-[11px] text-muted-foreground">
                  {format(new Date(e.ts), e.dayOnly ? "dd/MM/yyyy" : "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                </p>
                <p className="text-sm font-medium mt-0.5">
                  <span className="mr-1">{e.icon}</span>{e.title}
                  {e.badge && <RfvBadge segment={e.badge} className="ml-1.5 align-middle" />}
                </p>
                {e.subtitle && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{e.subtitle}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
