import { ExternalLink } from "lucide-react";
import { noSite } from "@/app/site";

/**
 * O "Ver tudo" das seções (Secao, em components/mobile/blocos) para área que o
 * app ainda não tem: abre a página do site no navegador do celular. Mesmo
 * lugar e mesmo tom do "Ver tudo" de lá; o ícone de "abre fora" no lugar da
 * seta é o mesmo aviso do Menu.
 */
export function VerTudoNoSite({ caminho, titulo }: { caminho: string; titulo: string }) {
  return (
    <a
      href={noSite(caminho)}
      target="_blank"
      rel="noopener noreferrer"
      className="flex shrink-0 items-center gap-1 text-[13px] font-medium text-muted-foreground active:text-foreground"
    >
      Ver tudo<span className="sr-only">: {titulo}, abre no site</span>
      <ExternalLink className="h-3.5 w-3.5" strokeWidth={2} />
    </a>
  );
}
