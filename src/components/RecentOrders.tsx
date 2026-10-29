import { ShoppingCart } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { PanelCard, PanelAction } from "@/components/dashboard/shared";
import { StoreBadge } from "@/components/clients/StoreBadge";
import { avatarToneFor, getInitials } from "@/components/clients/sections/shared";
import {
  DATE_FMT,
  TIME_FMT,
  isSameDayAsToday,
  localDoCliente,
  parseOrderDate,
} from "@/components/pedidos/orderRowShared";
import { formatCurrency } from "@/utils/formatters";
import { cn } from "@/lib/utils";

/**
 * Os últimos pedidos do período, no Dashboard.
 *
 * É A MESMA LINHA DA ABA PEDIDOS (28/08/2026), de propósito e até o detalhe:
 * mesmas colunas e larguras, mesmo `<thead>` em maiúsculas, mesmo divisor
 * `border-b border-border/60`, mesma bolinha verde de "hoje" na calha da
 * primeira célula, mesmos tamanhos de fonte (13px no principal, 11px no apoio,
 * 14px bold no valor) e o mesmo avatar de iniciais tingido por hash do nome.
 * Os formatadores de data vêm de `orderRowShared` — se um dia mudarem, mudam
 * nas duas telas juntas.
 *
 * Por que copiar em vez de reaproveitar o `OrdersTableV2`: aquele componente
 * carrega agrupamento de compras, ordenação, expandir/recolher, cópia de ID e
 * quatro ações por linha. Aqui são cinco pedidos sem interação nenhuma; herdar
 * tudo aquilo para desligar 90% sairia mais caro de manter do que estas 60
 * linhas.
 *
 * ORDENAÇÃO: o RPC já devolve por `acquired_at DESC`, e a lista não é
 * ordenável — o rótulo do cabeçalho é texto, não botão, para não prometer uma
 * interação que não existe.
 */

/** Mesmas larguras da aba Pedidos, menos a coluna Status (que lá é condicional). */
const COLS = [
  { key: "acquired_at", label: "Data", width: 130 },
  { key: "full_name", label: "Cliente", width: 200 },
  { key: "product", label: "Produto", width: 190 },
  { key: "store", label: "Marketplace", width: 120 },
  { key: "total_amount", label: "Valor", width: 110 },
];

interface Order {
  id: string;
  total_amount: number;
  product: string;
  marketplace: string;
  acquired_at: string;
  client_id?: string;
  clients?: {
    full_name?: string;
    city?: string | null;
    state_code?: string | null;
  } | null;
}

const RecentOrders = ({ orders }: { orders: Order[] }) => {
  const navigate = useNavigate();
  const recentOrders = orders.slice(0, 5);

  return (
    <PanelCard
      icon={ShoppingCart}
      title="Últimos pedidos"
      subtitle="Os 5 mais recentes do período"
      right={<PanelAction to="/pedidos">Ver todos</PanelAction>}
    >
      {recentOrders.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum pedido encontrado</p>
      ) : (
        // -mx-5: o card tem p-5 e a tabela precisa sangrar até as bordas, senão
        // os divisores param antes do fim e leem como linha cortada.
        <div className="-mx-5 overflow-x-auto">
          <table className="w-full table-fixed" style={{ minWidth: 750 }}>
            <thead>
              <tr className="border-b border-border">
                {COLS.map((c) => (
                  <th
                    key={c.key}
                    style={{ width: c.width }}
                    className={cn(
                      "px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground",
                      // A coluna Data reserva a mesma calha da aba Pedidos para
                      // a bolinha de "hoje" (16 de padding + 26). Sem o mesmo
                      // recuo aqui, o rótulo ficava à esquerda do próprio valor.
                      c.key === "acquired_at" && "pl-[42px]",
                    )}
                  >
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recentOrders.map((order) => {
                const date = parseOrderDate(order.acquired_at);
                const hoje = date ? isSameDayAsToday(date) : false;
                const nome = order.clients?.full_name || "Cliente não identificado";
                const tone = avatarToneFor(nome);
                const local = localDoCliente(order.clients);

                return (
                  <tr
                    key={order.id}
                    onClick={() => navigate("/pedidos")}
                    className="group cursor-pointer border-b border-border/60 transition-colors last:border-0 hover:bg-muted/40"
                  >
                    {/* Data */}
                    <td className="relative py-3.5 pl-[42px] pr-4">
                      {/* Mesma calha da aba Pedidos: a bolinha em left-[18px] e o
                          texto começando em 42px. Antes ela estava em 6px, quase
                          encostada na data — o dono pediu o mesmo respiro dos
                          dois lados que a outra tela tem. Os 42px de lá vêm de
                          16 de padding + 20 do slot da seta + 6 de gap; aqui não
                          há seta, mas o recuo é copiado para as duas telas
                          ficarem idênticas. */}
                      {hoje && (
                        <span
                          className="absolute left-[18px] top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-success"
                          title="Hoje"
                        />
                      )}
                      <div className="min-w-0 leading-tight">
                        <div className="font-tabular text-[13px] font-medium text-foreground">
                          {date ? DATE_FMT.format(date) : "—"}
                        </div>
                        <div className="font-tabular text-[11px] text-muted-foreground">
                          {date ? TIME_FMT.format(date) : ""}
                        </div>
                      </div>
                    </td>

                    {/* Cliente */}
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <div
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[12px] font-bold"
                          style={{ background: tone.bg, color: tone.fg }}
                        >
                          {getInitials(nome)}
                        </div>
                        <div className="min-w-0">
                          <div className="truncate text-[13px] font-semibold text-foreground">
                            {nome}
                          </div>
                          <div className="truncate text-[11px] text-muted-foreground">
                            {local || "—"}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Produto */}
                    <td className="px-4 py-3.5">
                      <span
                        className="line-clamp-2 text-[13px] text-foreground"
                        title={order.product || undefined}
                      >
                        {order.product || "Produto não especificado"}
                      </span>
                    </td>

                    {/* Marketplace */}
                    <td className="px-4 py-3.5">
                      <StoreBadge storeKey={order.marketplace} />
                    </td>

                    {/* Valor — à esquerda como as demais, igual à aba Pedidos. */}
                    <td className={cn("px-4 py-3.5")}>
                      <span className="font-tabular text-[14px] font-bold text-foreground">
                        {formatCurrency(order.total_amount)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </PanelCard>
  );
};

export default RecentOrders;
