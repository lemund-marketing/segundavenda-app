import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useSellerContext } from "@/contexts/SellerContext";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import logoFinal from "@/assets/logo-segunda-venda-final.svg";
import { NavInferior } from "@/app/navegacao/NavInferior";
import { cn } from "@/lib/utils";

/**
 * Moldura das telas do app: faixa do logo no topo, o conteúdo e a cápsula de
 * navegação embaixo. Mesmo desenho do celular no site redesenhado
 * (AppLayout), sem a barra lateral do computador.
 */
export function LayoutApp({
  children,
  ocultarNavInferior = false,
}: {
  children: ReactNode;
  /** Para telas que precisam do rodapé livre (a conversa do WhatsApp). */
  ocultarNavInferior?: boolean;
}) {
  const { user } = useAuth();
  const { activeSeller } = useSellerContext();
  const iniciais = (activeSeller?.name || user?.email || "SV").substring(0, 2).toUpperCase();

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      <div className="sticky top-0 z-40 flex h-12 shrink-0 items-center justify-between gap-2 border-b border-border bg-background px-4">
        <Link to="/" aria-label="Início">
          <img src={logoFinal} alt="Segunda Venda" className="h-6 w-auto object-contain" />
        </Link>
        <Link to="/menu" aria-label="Menu e conta" className="-mr-1 rounded-full p-1">
          <Avatar className="h-8 w-8">
            <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">{iniciais}</AvatarFallback>
          </Avatar>
        </Link>
      </div>
      {/* Espaço da cápsula de navegação (h-16 a 1rem do rodapé, mais a faixa
          do gesto e uma folga): o fim da tela não fica atrás dela. */}
      <main
        className={cn(
          "flex min-h-0 min-w-0 flex-1 flex-col",
          !ocultarNavInferior && "pb-[calc(5.5rem+env(safe-area-inset-bottom))]",
        )}
      >
        {children}
      </main>
      {!ocultarNavInferior && <NavInferior />}
    </div>
  );
}
