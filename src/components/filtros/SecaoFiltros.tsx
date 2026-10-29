/**
 * Átomos visuais dos painéis de filtro — seção, campo, campo numérico e chip.
 *
 * Nasceram dentro de `ClientesMoreFiltersSheet.tsx` e foram movidos para cá sem
 * uma linha de mudança (contrato `docs/GATILHO_FILTROS.md`, §S4.1), para que o
 * painel dos gatilhos de pedido use a MESMA aparência do sheet "Mais filtros"
 * da aba Clientes — que está em produção e tem de continuar renderizando igual.
 *
 * O sheet de Clientes importa daqui com apelido (`SecaoFiltros as Secao`…), de
 * modo que nenhum dos ~40 call sites de JSX precisou ser editado.
 *
 * Regra da casa para o que entrar aqui depois: variação nova é prop OPCIONAL
 * cujo default reproduz o comportamento de hoje.
 */
import { type ReactNode } from "react";

import {
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

import { isNumericInputInvalid } from "./numeros";

/** Badge de contagem — mesmo desenho do Omnichannel (a referência do upgrade). */
export const CONTAGEM_CLASS =
  "min-w-[20px] h-5 px-1.5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold inline-flex items-center justify-center tabular-nums normal-case";

/**
 * Texto do title (e do sr-only) das pílulas de contagem: "2 filtros ligados" /
 * "1 filtro ligado nesta seção". Usado na pílula da seção e na do cabeçalho
 * dos painéis (`ConfigPanelShell`, `FiltrosSheetShell`).
 */
export function rotuloContagemFiltros(count: number, onde?: string): string {
  const base = count === 1 ? "1 filtro ligado" : `${count} filtros ligados`;
  return onde ? `${base} ${onde}` : base;
}

export function CampoFiltro({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
      {hint && <p className="text-[11px] leading-snug text-muted-foreground">{hint}</p>}
    </div>
  );
}

/**
 * Campo numérico que AVISA quando o texto não vira número.
 *
 * O `<Input>` é `type="text"` (`inputMode` só troca o teclado do celular), então
 * no desktop nada impede letras. Antes o texto inválido sumia em silêncio: o
 * payload saía sem a chave e a lista não mexia. Agora o badge não conta o campo
 * — e esta borda é o que explica por quê.
 */
export function CampoNumeroFiltro({
  label,
  hint,
  placeholder,
  inputMode,
  value,
  onChange,
}: {
  label: string;
  hint?: ReactNode;
  placeholder: string;
  inputMode: "numeric" | "decimal";
  value: string;
  onChange: (v: string) => void;
}) {
  const invalido = isNumericInputInvalid(value);
  return (
    <CampoFiltro
      label={label}
      hint={
        invalido ? (
          <span className="text-destructive">Só números — este filtro não está valendo.</span>
        ) : (
          hint
        )
      }
    >
      <Input
        inputMode={inputMode}
        className={cn("h-9", invalido && "border-destructive focus-visible:ring-destructive")}
        aria-invalid={invalido}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </CampoFiltro>
  );
}

export function ChipFiltro({
  active,
  onClick,
  children,
  title,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
        active
          ? "border-primary bg-primary/10 text-primary"
          : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

/**
 * Grupo no padrão da casa (PedidosFiltersSheet): border-b, título 13px
 * maiúsculo com tracking, chevron do próprio AccordionTrigger girando, e badge
 * de contagem dos filtros ativos do grupo (upgrade vindo do Omnichannel).
 */
export function SecaoFiltros({
  value,
  title,
  count,
  children,
}: {
  value: string;
  title: string;
  count: number;
  children: ReactNode;
}) {
  return (
    <AccordionItem value={value} className="border-b border-border">
      {/* py-5 (era py-3/3.5): com os títulos colados o painel virava uma pilha
          de linhas indistinguíveis, e num sheet de 8 grupos fechados o olho não
          achava onde começava cada um. Pedido de 29/08. */}
      <AccordionTrigger className="py-5 text-[13px] font-semibold uppercase tracking-wider text-foreground hover:no-underline">
        <span className="flex items-center gap-2">
          {title}
          {/* A pílula conta FILTROS, não itens: no gatilho, "2" ao lado de
              Produtos foi lido como "2 SKUs" com 399 colados. O title explica
              no hover; o leitor de tela lê a frase do sr-only no lugar do
              número solto. */}
          {count > 0 && (
            <span
              className={CONTAGEM_CLASS}
              title={rotuloContagemFiltros(count, "nesta seção")}
            >
              <span aria-hidden="true">{count}</span>
              <span className="sr-only">{rotuloContagemFiltros(count, "nesta seção")}</span>
            </span>
          )}
        </span>
      </AccordionTrigger>
      <AccordionContent className="space-y-4 pb-6 pt-1">{children}</AccordionContent>
    </AccordionItem>
  );
}

/**
 * Título de uma seção pela chave, lido da lista de seções da tela.
 *
 * Existe para o título viver num lugar só (a lista) e a seção não precisar
 * repeti-lo no JSX — era uma função local do sheet de Clientes.
 */
export function tituloDaSecao(
  secoes: readonly { key: string; title: string }[],
  key: string,
): string {
  return secoes.find((s) => s.key === key)?.title ?? key;
}
