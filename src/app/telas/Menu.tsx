import { Link } from "react-router-dom";
import { ChevronRight, ExternalLink, LogOut } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useSellerContext } from "@/contexts/SellerContext";
import { useAreaPermissions, PATH_AREA } from "@/hooks/useAreaPermissions";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { LayoutApp } from "@/app/LayoutApp";
import { LimiteCaptura } from "@/app/blocos/LimiteCaptura";
import {
  overviewItems, gestaoItems, TELAS_DO_APP, SO_NO_SITE, type ItemMenu,
} from "@/app/navegacao/itensMenu";
import { noSite } from "@/app/site";

/**
 * Menu (último botão da barra de baixo), no padrão dos apps de banco: quem é a
 * conta, o limite de captura e todas as áreas em lista. Área que já tem tela
 * no app abre aqui dentro; as outras abrem a página do site no navegador, com
 * o ícone de "sai do app" no lugar da seta.
 */
export default function Menu() {
  const { user, signOut } = useAuth();
  const { activeSeller } = useSellerContext();
  const { canView } = useAreaPermissions();

  const visivel = (i: ItemMenu) => {
    if (SO_NO_SITE.has(i.path)) return false;
    const area = PATH_AREA[i.path];
    return !area || canView(area);
  };
  const grupos = [
    { titulo: "Visão geral", itens: overviewItems.filter(visivel) },
    { titulo: "Gestão", itens: gestaoItems.filter(visivel) },
  ];
  // A legenda do ícone só quando algum item mostra o ícone.
  const algumNoSite = grupos.some((g) => g.itens.some((i) => !TELAS_DO_APP.has(i.path)));
  const iniciais = (activeSeller?.name || user?.email || "SV").substring(0, 2).toUpperCase();

  return (
    <LayoutApp>
      <div className="mx-auto flex w-full max-w-lg flex-col gap-6 px-4 py-5">
        <div className="flex items-center gap-3">
          <Avatar className="h-12 w-12 shrink-0">
            <AvatarFallback className="bg-primary/10 text-sm font-semibold text-primary">{iniciais}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate text-base font-semibold text-foreground">{activeSeller?.name ?? "Minha conta"}</p>
            <p className="truncate text-sm text-muted-foreground">{user?.email}</p>
          </div>
        </div>

        <LimiteCaptura />

        {grupos.map((g) =>
          g.itens.length === 0 ? null : (
            <section key={g.titulo} className="flex flex-col gap-2">
              <h2 className="px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{g.titulo}</h2>
              <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
                {g.itens.map((item) => (
                  <li key={item.path}>
                    <ItemDoMenu item={item} />
                  </li>
                ))}
              </ul>
            </section>
          ),
        )}

        {algumNoSite && (
          <p className="px-1 text-xs text-muted-foreground">
            <ExternalLink className="mr-1 inline h-3 w-3 align-[-1px]" />
            abre no site, no navegador do celular, até ganhar tela no app.
          </p>
        )}

        <button
          type="button"
          onClick={() => void signOut()}
          className="flex items-center justify-center gap-2 rounded-2xl border border-border bg-card px-4 py-3.5 text-[15px] font-medium text-destructive transition-colors active:bg-destructive/10"
        >
          <LogOut className="h-[18px] w-[18px]" strokeWidth={1.75} />
          Sair da conta
        </button>
      </div>
    </LayoutApp>
  );
}

function ItemDoMenu({ item: { path, label, icon: Icone } }: { item: ItemMenu }) {
  const noApp = TELAS_DO_APP.has(path);
  const miolo = (
    <>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Icone className="h-[18px] w-[18px]" strokeWidth={1.75} />
      </span>
      <span className="flex-1 text-[15px] font-medium text-foreground">{label}</span>
      {noApp ? (
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
      ) : (
        <ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground" aria-label="abre no site" />
      )}
    </>
  );
  const classe = "flex items-center gap-3 px-4 py-3.5 transition-colors active:bg-muted";
  if (noApp) {
    return (
      <Link to={path} className={classe}>
        {miolo}
      </Link>
    );
  }
  // Link de outro endereço: no app o Android abre no navegador; no navegador
  // (desenvolvimento), numa aba nova.
  return (
    <a href={noSite(path)} target="_blank" rel="noopener noreferrer" className={classe}>
      {miolo}
    </a>
  );
}
