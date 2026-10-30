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
  alturaCheia = false,
  ocultarTopoMobile = false,
}: {
  children: ReactNode;
  /** Para telas que precisam do rodapé livre (a conversa do WhatsApp). */
  ocultarNavInferior?: boolean;
  /**
   * Telas que ocupam EXATAMENTE a altura da janela e rolam por dentro (o
   * WhatsApp). Só uma altura definida faz o `flex-1` dos filhos resolver como
   * "o que sobrou"; com `min-height` ele cresce até o conteúdo e o campo de
   * digitar da conversa sumia abaixo da dobra.
   */
  alturaCheia?: boolean;
  /** Sem a faixa do logo: a tela traz o próprio cabeçalho de app (o WhatsApp). */
  ocultarTopoMobile?: boolean;
}) {
  const { user } = useAuth();
  const { activeSeller } = useSellerContext();
  const iniciais = (activeSeller?.name || user?.email || "SV").substring(0, 2).toUpperCase();

  return (
    // dvh e não vh: acompanha o teclado subindo.
    <div className={cn("flex flex-col bg-background", alturaCheia ? "h-[100dvh] overflow-hidden" : "min-h-[100dvh]")}>
      {!ocultarTopoMobile && (
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
      )}
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
