import {
  Home, ShoppingCart, Users, Store, UserCheck, Zap, User, Map, Package, BarChart2, PieChart,
} from "lucide-react";
import WhatsAppIcon from "@/components/WhatsAppIcon";

/**
 * Itens de navegação do app, numa fonte só: a barra inferior e a tela de Menu
 * leem daqui. Mesmos nomes, ordem e ícones do menu do site (AppSidebar), para
 * o lojista se achar nos dois. O ícone é tipado como componente solto de propósito: a maioria vem do
 * lucide, mas o do WhatsApp é nosso (aceita className/size, não strokeWidth), e
 * amarrar o tipo ao do lucide impediria a mistura.
 */
export type ItemMenu = {
  path: string;
  label: string;
  // strokeWidth como string|number porque é assim que o lucide declara.
  icon: React.ComponentType<{ className?: string; strokeWidth?: string | number }>;
};

/** Mesma divisão e ordem do menu do Segundo Pedido: o que se olha (Overview)
 *  antes do que se opera (Gestão). "Filiais" lá equivale a "Lojas" aqui. */
export const overviewItems: ItemMenu[] = [
  // "Início" no app (no site é "Dashboard"): o mesmo nome da barra de baixo.
  { path: "/", label: "Início", icon: Home },
  { path: "/pedidos", label: "Pedidos", icon: ShoppingCart },
  // Regiões saiu do menu em 10/08 e voltou a pedido em 20/08/2026.
  { path: "/regioes", label: "Regiões", icon: Map },
  // Renomeado a pedido (11/08): "Omnichannel" era o nome interno da arquitetura,
  // não o que o lojista usa. A rota segue /omnichannel — link antigo continua abrindo.
  { path: "/omnichannel", label: "WhatsApp", icon: WhatsAppIcon },
];

export const gestaoItems: ItemMenu[] = [
  { path: "/clientes", label: "Clientes", icon: Users },
  { path: "/crm", label: "Kanban CRM", icon: UserCheck },
  // Análise RFV saiu do menu em 06/08 e VOLTOU a pedido em 29/08/2026. Estava
  // fora não só do menu: a tabela `client_rfv` estava vazia para os 257 sellers,
  // porque a função que faz a primeira carga (`rfv_snapshot_all`) estourava o
  // statement_timeout todos os dias. Religar o item de menu sem consertar aquilo
  // teria entregado uma tela vazia. Ver a migração 20260829180000.
  { path: "/rfv", label: "Análise RFV", icon: PieChart },
  { path: "/workflows", label: "Automações", icon: Zap },
  { path: "/workflow-stats", label: "Performance", icon: BarChart2 },
  // Rótulo "Marketplaces" (20/08): a tela lista Mercado Livre, Shopee, Amazon —
  // canais de venda. "Loja" no sistema é outra coisa: a conta/loja DENTRO de um
  // marketplace (o filtro dentro da tela de detalhe). A rota segue /lojas para
  // não quebrar link salvo.
  { path: "/lojas", label: "Marketplaces", icon: Store },
  // Produtos e Planejamento saíram do menu em 06/08; Produtos voltou a pedido
  // em 20/08/2026. Planejamento segue só pela rota.
  { path: "/produtos", label: "Produtos", icon: Package },
  { path: "/account", label: "Minha Conta", icon: User },
];

/**
 * Telas que já existem dentro do app. As outras aparecem no Menu e abrem a
 * página do site no navegador (app/site.ts). A cada tela portada, o caminho
 * entra aqui e ela passa a abrir dentro do app.
 */
export const TELAS_DO_APP = new Set<string>(["/", "/pedidos", "/clientes"]);

/**
 * Fora do app até ter tela própria: Minha Conta tem compra e troca de plano, e
 * a Play não aceita app que leve para pagamento fora dela. Afiliados idem.
 */
export const SO_NO_SITE = new Set<string>(["/account", "/affiliate-dashboard"]);

/** Afiliados entra antes de "Minha Conta", o rodapé lógico do grupo Gestão. */
export const itemAfiliados: ItemMenu = { path: "/affiliate-dashboard", label: "Afiliados", icon: Users };

export const comAfiliados = (itens: ItemMenu[], ehAfiliado: boolean): ItemMenu[] =>
  ehAfiliado ? [...itens.slice(0, -1), itemAfiliados, ...itens.slice(-1)] : itens;

/**
 * Atalhos da barra inferior, em ordem de prioridade. Entram os 4 primeiros que
 * já existem no app e que o membro pode ver; o último lugar é sempre o Menu.
 * Rótulos curtos de propósito: a barra tem ~75px por item num celular de 375px.
 */
export const atalhosNavInferior: ItemMenu[] = [
  { path: "/", label: "Início", icon: Home },
  { path: "/omnichannel", label: "WhatsApp", icon: WhatsAppIcon },
  { path: "/pedidos", label: "Pedidos", icon: ShoppingCart },
  { path: "/clientes", label: "Clientes", icon: Users },
  { path: "/crm", label: "CRM", icon: UserCheck },
  { path: "/workflows", label: "Automações", icon: Zap },
  { path: "/workflow-stats", label: "Performance", icon: BarChart2 },
  { path: "/lojas", label: "Marketplaces", icon: Store },
  { path: "/produtos", label: "Produtos", icon: Package },
  { path: "/regioes", label: "Regiões", icon: Map },
  { path: "/rfv", label: "RFV", icon: PieChart },
];
