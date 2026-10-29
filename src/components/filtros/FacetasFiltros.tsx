/**
 * Listas e chips alimentados pelas FACETAS do seller (`get_clientes_facetas`).
 *
 * Movidos de `ClientesMoreFiltersSheet.tsx` sem uma linha de mudança (contrato
 * `docs/GATILHO_FILTROS.md`, §S4.1) — o sheet de Clientes está em produção e o
 * render tem de continuar idêntico. As variações são props OPCIONAIS do
 * `FacetSearchList` — `pararRodaDoCanvas` e `incluirMunicipiosSemClientes` —,
 * todas com default `false`, ou seja: em Clientes nada muda.
 */
import { useEffect, useMemo, useState, type TouchEvent, type WheelEvent } from "react";
import { Loader2, Search, X } from "lucide-react";

import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { REGIAO_FILTRO_OPTIONS } from "@/lib/regioes";
import { buscarMunicipios, normalizarNomeCidade } from "@/lib/municipios";
import {
  NO_FACET_FILTERS,
  useClientesFacet,
  type FacetKind,
} from "@/hooks/useClientesFacets";
import { useMunicipiosBrasil } from "@/hooks/useMunicipiosBrasil";
import type { ClientesFilterPayload } from "@/components/clients/clientesFilters";

import { ChipFiltro as Chip } from "./SecaoFiltros";

/** Chips das opções que existem NO SELLER (UF, loja) — nunca uma lista fixa. */
export function FacetChips({
  sellerId,
  kind,
  selected,
  onChange,
  enabled,
  formatLabel,
  emptyText,
  filters = NO_FACET_FILTERS,
}: {
  sellerId: string;
  kind: FacetKind;
  selected: string[];
  onChange: (next: string[]) => void;
  enabled: boolean;
  formatLabel?: (o: { value: string; label: string }) => string;
  emptyText: string;
  filters?: ClientesFilterPayload;
}) {
  const { data: options = [], isLoading, isError } = useClientesFacet(
    sellerId,
    kind,
    "",
    enabled,
    filters,
  );

  if (isLoading) {
    return (
      <p className="flex items-center gap-2 py-1 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> Carregando opções…
      </p>
    );
  }
  // Erro tem de parecer erro: "nenhuma opção" e "não deu para perguntar" são
  // coisas diferentes, e a segunda disfarçada de primeira faz o usuário
  // concluir que a base não tem o dado.
  if (isError) {
    return <p className="py-1 text-xs text-destructive">Não foi possível carregar as opções.</p>;
  }
  if (options.length === 0) {
    return <p className="py-1 text-xs text-muted-foreground">{emptyText}</p>;
  }

  const toggle = (v: string) =>
    onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);

  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <Chip
          key={o.value}
          active={selected.includes(o.value)}
          onClick={() => toggle(o.value)}
          // O número é sempre CLIENTES, nas quatro facetas. Enquanto loja e
          // produto contavam pedidos, o mesmo painel mostrava números da mesma
          // cara com significados diferentes; o title deixa a unidade explícita
          // sem inflar o chip.
          title={`${o.total.toLocaleString("pt-BR")} clientes`}
        >
          {formatLabel ? formatLabel(o) : o.label}
          <span className="ml-1 tabular-nums opacity-60">{o.total.toLocaleString("pt-BR")}</span>
        </Chip>
      ))}
    </div>
  );
}

/**
 * Os 6 chips de região (as 5 do IBGE + "Sem região informada"), com a contagem
 * da faceta `regions` ao lado — mesmo desenho dos chips de UF e de loja.
 *
 * Difere do `FacetChips` num ponto de propósito: a LISTA é fixa
 * (`REGIAO_FILTRO_OPTIONS`), só o número vem do banco. A faceta `regions`
 * hoje devolve as 6 linhas sempre, mas a tela não aposta nisso: se a lista
 * viesse dela e um dia ela omitisse região sem cliente, um seller sem ninguém
 * no Norte não teria o chip — e um `?f=` com `norte` marcado seria filtro
 * preso, sem como desmarcar daqui. Região ausente na resposta aparece como zero.
 *
 * Por isso os chips também não esperam a resposta: nascem sem número e o
 * número chega. Erro na contagem não trava o filtro — o chip continua
 * marcável, só o número some e o aviso explica.
 *
 * NÃO é o `RegiaoChips` de `@/components/workflow/RegiaoChips` (gatilhos e nó
 * Condição): aquele grava `undefined` ao esvaziar e não tem contagem; este é
 * irmão do `FacetChips` acima e grava `[]` (vazio = sem filtro no payload).
 */
export function RegiaoFacetChips({
  sellerId,
  selected,
  onChange,
  enabled,
  filters = NO_FACET_FILTERS,
}: {
  sellerId: string;
  selected: string[];
  onChange: (next: string[]) => void;
  enabled: boolean;
  filters?: ClientesFilterPayload;
}) {
  const { data: options = [], isLoading, isError } = useClientesFacet(
    sellerId,
    "regions",
    "",
    enabled,
    filters,
  );
  const totais = useMemo(
    () => Object.fromEntries(options.map((o) => [o.value, o.total])) as Record<string, number>,
    [options],
  );

  const toggle = (v: string) =>
    onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-1.5">
        {REGIAO_FILTRO_OPTIONS.map((o) => {
          const total = isLoading || isError ? null : (totais[o.value] ?? 0);
          return (
            <Chip
              key={o.value}
              active={selected.includes(o.value)}
              onClick={() => toggle(o.value)}
              // A mesma unidade das outras facetas: o número é CLIENTES.
              title={total !== null ? `${total.toLocaleString("pt-BR")} clientes` : undefined}
            >
              {o.label}
              {total !== null && (
                <span className="ml-1 tabular-nums opacity-60">
                  {total.toLocaleString("pt-BR")}
                </span>
              )}
            </Chip>
          );
        })}
      </div>
      {isError && (
        <p className="text-[11px] text-destructive">Não foi possível carregar as contagens.</p>
      )}
    </div>
  );
}

/**
 * Busca + lista para as facetas grandes (401 cidades, 393 produtos no seller de
 * teste). A busca é do BANCO e ignora acento; o valor selecionado volta com a
 * grafia do banco, porque cidade casa por igualdade exata (`unaccent` não está
 * instalado neste projeto).
 *
 * A lista é inline, sem popover: dentro de um Sheet um popover portalizado fica
 * fora do foco do diálogo, e em 375px ele não tem para onde abrir. (Os
 * calendários de data são a exceção medida: o padrão do Omnichannel já roda
 * dentro de Sheet em produção sem esse problema.)
 */
export function FacetSearchList({
  sellerId,
  kind,
  selected,
  onChange,
  enabled,
  placeholder,
  emptyText,
  filters = NO_FACET_FILTERS,
  pararRodaDoCanvas = false,
  incluirMunicipiosSemClientes = false,
}: {
  sellerId: string;
  kind: FacetKind;
  selected: string[];
  onChange: (next: string[]) => void;
  enabled: boolean;
  placeholder: string;
  emptyText: string;
  filters?: ClientesFilterPayload;
  /**
   * Dentro do painel de um nó do canvas, rolar esta lista dá ZOOM no fluxo: a
   * roda sobe até o `@xyflow/react`. Ligada, a lista segura o evento. Default
   * `false` para o sheet de Clientes continuar exatamente como está.
   */
  pararRodaDoCanvas?: boolean;
  /**
   * Só com `kind="cities"`: depois das cidades do seller, a busca mostra também
   * os municípios do IBGE em que ele AINDA NÃO tem cliente — o gatilho precisa
   * disso para montar o fluxo de uma cidade antes do primeiro pedido de lá. Lá
   * o motor compara a cidade sem acento e sem maiúscula, então o nome oficial
   * casa com qualquer grafia do cadastro. Default `false`: em Clientes o filtro
   * compara a grafia exata do banco, e uma cidade sem cliente só daria lista vazia.
   */
  incluirMunicipiosSemClientes?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 250);
    return () => clearTimeout(t);
  }, [query]);

  const {
    data: options = [],
    isFetching,
    isError,
  } = useClientesFacet(sellerId, kind, debounced, enabled, filters);

  const comMunicipios = incluirMunicipiosSemClientes && kind === "cities";
  const { data: municipios } = useMunicipiosBrasil(enabled && comMunicipios);
  // A lista do seller manda: quem já está nela (em qualquer grafia — "SAO PAULO"
  // cobre o "São Paulo" do IBGE pela régua do motor) não aparece de novo aqui.
  const municipiosSemClientes = useMemo(() => {
    if (!comMunicipios || !municipios) return [];
    const jaListadas = new Set(options.map((o) => normalizarNomeCidade(o.value)));
    return buscarMunicipios(municipios, debounced, jaListadas);
  }, [comMunicipios, municipios, options, debounced]);

  const toggle = (v: string) =>
    onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);

  return (
    <div className="space-y-2">
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => toggle(v)}
              className="inline-flex max-w-full items-center gap-1 rounded-full bg-primary/10 py-1 pl-2.5 pr-1.5 text-[11px] font-medium text-primary hover:bg-primary/20"
            >
              <span className="truncate">{v}</span>
              <X className="h-3 w-3 shrink-0" />
            </button>
          ))}
        </div>
      )}

      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          className="h-9 pl-8 pr-8"
        />
        {isFetching && (
          <Loader2 className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>

      <div
        className="max-h-48 space-y-0.5 overflow-y-auto rounded-lg border border-border p-1"
        {...(pararRodaDoCanvas
          ? {
              onWheelCapture: (e: WheelEvent) => e.stopPropagation(),
              onTouchMoveCapture: (e: TouchEvent) => e.stopPropagation(),
            }
          : {})}
      >
        {isError ? (
          <p className="px-2 py-3 text-center text-xs text-destructive">
            Não foi possível carregar as opções.
          </p>
        ) : options.length === 0 && municipiosSemClientes.length === 0 ? (
          <p className="px-2 py-3 text-center text-xs text-muted-foreground">{emptyText}</p>
        ) : (
          <>
            {options.map((o) => (
              <label
                key={o.value}
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted"
              >
                <Checkbox
                  checked={selected.includes(o.value)}
                  onCheckedChange={() => toggle(o.value)}
                />
                <span className="min-w-0 flex-1 truncate text-xs text-foreground">{o.label}</span>
                <span
                  className="shrink-0 text-[11px] tabular-nums text-muted-foreground"
                  title={`${o.total.toLocaleString("pt-BR")} clientes`}
                >
                  {o.total.toLocaleString("pt-BR")}
                </span>
              </label>
            ))}
            {municipiosSemClientes.length > 0 && (
              <p className="px-2 pb-0.5 pt-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Sem clientes ainda
              </p>
            )}
            {municipiosSemClientes.map((m) => (
              <label
                key={`ibge:${m.chave}`}
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted"
              >
                <Checkbox
                  checked={selected.includes(m.nome)}
                  onCheckedChange={() => toggle(m.nome)}
                />
                <span className="min-w-0 flex-1 truncate text-xs text-foreground">{m.nome}</span>
                <span
                  className="max-w-[40%] shrink-0 truncate text-[11px] text-muted-foreground"
                  title={
                    m.ufs.length > 1
                      ? `Há cidade com este nome em ${m.ufs.join(", ")} — o filtro vale para todas`
                      : undefined
                  }
                >
                  {m.ufs.join(", ")}
                </span>
              </label>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
