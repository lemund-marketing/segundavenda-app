import { Suspense, useEffect, useLayoutEffect, type ReactNode } from "react";
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation, useNavigationType } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Lock, WifiOff } from "lucide-react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { SellerProvider, useSellerContext } from "@/contexts/SellerContext";
import { SubscriptionProvider } from "@/contexts/SubscriptionContext";
import { useAreaPermissions, type AreaKey } from "@/hooks/useAreaPermissions";
import { Abertura } from "@/app/blocos/Abertura";
import { LayoutApp } from "@/app/LayoutApp";
import { TELAS_DO_APP } from "@/app/navegacao/itensMenu";
import { noSite } from "@/app/site";
import { lazyComRecarga } from "@/utils/lazyComRecarga";
import { ErroNaTela } from "@/app/blocos/ErroNaTela";
import Entrar from "@/app/telas/Entrar";
import Inicio from "@/app/telas/Inicio";
import Menu from "@/app/telas/Menu";

// Login, Início e Menu vão no pacote inicial (é por eles que o app abre). As
// outras telas ficam em arquivos próprios, lidos do celular na primeira vez e
// adiantados logo depois da abertura (PreCarregarTelas).
const Pedidos = lazyComRecarga(() => import("@/app/telas/Pedidos"));
const Clientes = lazyComRecarga(() => import("@/app/telas/Clientes"));
const Lojas = lazyComRecarga(() => import("@/app/telas/Lojas"));
const LojaDetalhe = lazyComRecarga(() => import("@/app/telas/LojaDetalhe"));
const Conta = lazyComRecarga(() => import("@/app/telas/Conta"));
const WhatsApp = lazyComRecarga(() => import("@/app/telas/WhatsApp"));
const CRM = lazyComRecarga(() => import("@/app/telas/CRM"));
const Automacoes = lazyComRecarga(() => import("@/app/telas/Automacoes"));
const Performance = lazyComRecarga(() => import("@/app/telas/Performance"));
const PerformanceModeloWhatsApp = lazyComRecarga(() => import("@/app/telas/PerformanceModeloWhatsApp"));
const PerformanceModeloEmail = lazyComRecarga(() => import("@/app/telas/PerformanceModeloEmail"));
const PerformanceModeloSms = lazyComRecarga(() => import("@/app/telas/PerformanceModeloSms"));
const RFV = lazyComRecarga(() => import("@/app/telas/RFV"));
const Produtos = lazyComRecarga(() => import("@/app/telas/Produtos"));
const Regioes = lazyComRecarga(() => import("@/app/telas/Regioes"));
const TELAS_SOB_DEMANDA = [Pedidos, Clientes, Lojas, LojaDetalhe, Conta, WhatsApp, CRM, Automacoes, RFV, Produtos, Regioes];
const TELAS_SOB_DEMANDA = [
  Pedidos, Clientes, Lojas, LojaDetalhe, Conta,
  Performance, PerformanceModeloWhatsApp, PerformanceModeloEmail, PerformanceModeloSms,
];

function PreCarregarTelas() {
  useEffect(() => {
    const t = window.setTimeout(() => TELAS_SOB_DEMANDA.forEach((tela) => tela.preload()), 1500);
    return () => window.clearTimeout(t);
  }, []);
  return null;
}

const queryClient = new QueryClient({
  defaultOptions: {
    // O app volta do segundo plano o tempo todo: sem isto cada volta refaria
    // todas as consultas da tela.
    queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false },
  },
});

/**
 * Porta das telas de quem está logado: espera a sessão e a loja, manda para o
 * login quem não tem sessão e explica quando a conta não tem loja.
 */
function ComConta({ children }: { children: ReactNode }) {
  const { user, loading, semConexao } = useAuth();
  const { activeSeller, loading: carregandoLoja } = useSellerContext();

  if (loading) return <Abertura />;
  if (!user && semConexao) {
    return (
      <Aviso
        icone={<WifiOff className="h-6 w-6" />}
        titulo="Sem internet"
        texto="Assim que a conexão voltar, o app continua sozinho."
        botao={{ rotulo: "Tentar de novo", acao: () => window.location.reload() }}
      />
    );
  }
  if (!user) return <Navigate to="/entrar" replace />;
  if (carregandoLoja && !activeSeller) return <Abertura />;
  if (!activeSeller) {
    return (
      <Aviso
        titulo="Sua conta ainda não tem loja"
        texto="Termine a configuração da conta pelo site e volte aqui."
        link={{ rotulo: "Abrir o site", href: noSite("/") }}
      />
    );
  }
  return <>{children}</>;
}

/**
 * Guarda de área, como o AreaGuard das rotas do site: o membro a quem o dono
 * tirou a área vai para a primeira que ele vê, se ela tem tela no app; senão,
 * um aviso aponta o Menu. Enquanto as permissões carregam (inclusive paradas
 * sem internet), a tela aparece.
 */
function ComArea({ area, children }: { area: AreaKey; children: ReactNode }) {
  const { loading, canView, homePath } = useAreaPermissions();
  const { pathname } = useLocation();
  if (loading || canView(area)) return <>{children}</>;
  if (TELAS_DO_APP.has(homePath) && homePath !== pathname) return <Navigate to={homePath} replace />;
  return (
    <LayoutApp>
      <div className="px-4 pb-6 pt-4">
        <div className="flex flex-col items-center gap-2 rounded-3xl border border-border/60 bg-card px-6 py-8 text-center">
          <Lock className="h-6 w-6 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">Seu acesso nesta loja não inclui esta área</p>
          <p className="text-[13px] text-muted-foreground">As áreas liberadas para você estão no Menu.</p>
          <Link
            to="/menu"
            className="mt-2 rounded-full bg-primary/10 px-3.5 py-1.5 text-[13px] font-medium text-primary active:bg-primary/15"
          >
            Abrir o Menu
          </Link>
        </div>
      </div>
    </LayoutApp>
  );
}

/**
 * Quem rola é a janela, e trocar de rota não a leva ao topo: a tela nova abria
 * na altura em que a anterior estava. No Voltar (POP) não mexe, para a lista
 * voltar onde estava.
 */
function TopoAoTrocarDeTela() {
  const { pathname } = useLocation();
  const tipo = useNavigationType();
  useLayoutEffect(() => {
    if (tipo !== "POP") window.scrollTo({ top: 0 });
  }, [pathname, tipo]);
  return null;
}

function Aviso({
  icone,
  titulo,
  texto,
  link,
  botao,
}: {
  icone?: ReactNode;
  titulo: string;
  texto: string;
  link?: { rotulo: string; href: string };
  botao?: { rotulo: string; acao: () => void };
}) {
  const { signOut } = useAuth();
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-3 bg-background px-8 text-center">
      {icone && <span className="text-muted-foreground">{icone}</span>}
      <h1 className="text-lg font-semibold text-foreground">{titulo}</h1>
      <p className="max-w-xs text-[15px] text-muted-foreground">{texto}</p>
      {link && (
        <a
          href={link.href}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 rounded-full bg-primary px-5 py-2.5 text-[15px] font-medium text-primary-foreground"
        >
          {link.rotulo}
        </a>
      )}
      {botao && (
        <button
          type="button"
          onClick={botao.acao}
          className="mt-2 rounded-full bg-primary px-5 py-2.5 text-[15px] font-medium text-primary-foreground"
        >
          {botao.rotulo}
        </button>
      )}
      <button type="button" onClick={() => void signOut()} className="mt-1 py-2 text-sm text-muted-foreground">
        Sair da conta
      </button>
    </div>
  );
}

function Telas() {
  const { pathname } = useLocation();
  return (
    <ErroNaTela chave={pathname}>
      <Suspense fallback={<Abertura />}>
        <Routes>
          <Route path="/entrar" element={<Entrar />} />
          <Route path="/" element={<ComConta><ComArea area="dashboard"><Inicio /></ComArea></ComConta>} />
          <Route path="/menu" element={<ComConta><Menu /></ComConta>} />
          <Route path="/pedidos" element={<ComConta><ComArea area="pedidos"><Pedidos /></ComArea></ComConta>} />
          <Route path="/clientes" element={<ComConta><ComArea area="clientes"><Clientes /></ComArea></ComConta>} />
          <Route path="/lojas" element={<ComConta><ComArea area="lojas"><Lojas /></ComArea></ComConta>} />
          {/* Sem guarda de área, como no site: o detalhe também abre pelo Início. */}
          <Route path="/lojas/:marketplace" element={<ComConta><LojaDetalhe /></ComConta>} />
          <Route path="/account" element={<ComConta><Conta /></ComConta>} />
          <Route path="/omnichannel" element={<ComConta><ComArea area="omnichannel"><WhatsApp /></ComArea></ComConta>} />
          <Route path="/crm" element={<ComConta><ComArea area="crm"><CRM /></ComArea></ComConta>} />
          <Route path="/workflows" element={<ComConta><ComArea area="workflows"><Automacoes /></ComArea></ComConta>} />
          <Route path="/workflow-stats" element={<ComConta><ComArea area="workflow_stats"><Performance /></ComArea></ComConta>} />
          {/* Os detalhes de template ficam sem guarda de área, como no site. */}
          <Route path="/workflow-stats/template/:templateName" element={<ComConta><PerformanceModeloWhatsApp /></ComConta>} />
          <Route path="/workflow-stats/email-template/:templateId" element={<ComConta><PerformanceModeloEmail /></ComConta>} />
          <Route path="/workflow-stats/sms-template/:templateName" element={<ComConta><PerformanceModeloSms /></ComConta>} />
          <Route path="/rfv" element={<ComConta><ComArea area="rfv"><RFV /></ComArea></ComConta>} />
          <Route path="/produtos" element={<ComConta><ComArea area="produtos"><Produtos /></ComArea></ComConta>} />
          <Route path="/regioes" element={<ComConta><ComArea area="regioes"><Regioes /></ComArea></ComConta>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </ErroNaTela>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <SellerProvider>
          <SubscriptionProvider>
            <TooltipProvider>
              <BrowserRouter>
                <TopoAoTrocarDeTela />
                <PreCarregarTelas />
                <Telas />
              </BrowserRouter>
              <Toaster />
              <Sonner />
            </TooltipProvider>
          </SubscriptionProvider>
        </SellerProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
