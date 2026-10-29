import type { ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WifiOff } from "lucide-react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { SellerProvider, useSellerContext } from "@/contexts/SellerContext";
import { SubscriptionProvider } from "@/contexts/SubscriptionContext";
import { Abertura } from "@/app/blocos/Abertura";
import { noSite } from "@/app/site";
import Conta from "@/app/telas/Conta";
import Entrar from "@/app/telas/Entrar";
import Inicio from "@/app/telas/Inicio";
import Menu from "@/app/telas/Menu";

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

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <SellerProvider>
          <SubscriptionProvider>
            <TooltipProvider>
              <BrowserRouter>
                <Routes>
                  <Route path="/entrar" element={<Entrar />} />
                  <Route path="/" element={<ComConta><Inicio /></ComConta>} />
                  <Route path="/menu" element={<ComConta><Menu /></ComConta>} />
                  <Route path="/account" element={<ComConta><Conta /></ComConta>} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
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
