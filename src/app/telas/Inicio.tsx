import { Link } from "react-router-dom";
import { LayoutGrid } from "lucide-react";
import { useSellerContext } from "@/contexts/SellerContext";
import { LayoutApp } from "@/app/LayoutApp";

/**
 * Início provisório do esqueleto. A próxima etapa troca isto pela tela Início
 * redesenhada (os números da loja, a curva de vendas e os atalhos).
 */
export default function Inicio() {
  const { activeSeller } = useSellerContext();
  return (
    <LayoutApp>
      <div className="mx-auto flex w-full max-w-lg flex-col gap-5 px-4 py-6">
        <div>
          <p className="text-[15px] text-muted-foreground">Olá,</p>
          <h1 className="truncate text-2xl font-bold text-foreground">{activeSeller?.name}</h1>
        </div>
        <div className="rounded-2xl border border-dashed border-border p-4">
          <p className="text-[15px] font-semibold text-foreground">Este é o app novo, ainda em construção</p>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Por enquanto ele tem o login e o menu. O Início com os números da sua loja é a próxima tela. As outras
            áreas abrem no site, pelo Menu.
          </p>
          <Link
            to="/menu"
            className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3.5 py-1.5 text-[13px] font-medium text-primary active:bg-primary/15"
          >
            <LayoutGrid className="h-3.5 w-3.5" />
            Abrir o Menu
          </Link>
        </div>
      </div>
    </LayoutApp>
  );
}
