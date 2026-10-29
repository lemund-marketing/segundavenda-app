import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSellerContext } from "@/contexts/SellerContext";

/**
 * Permissões por área do usuário logado no seller ativo.
 *
 * Fonte única: a RPC my_member_permissions (SECURITY DEFINER). Owner recebe
 * 'editar' em todas as áreas. Ausência de linha para uma área = oculta.
 * A sidebar e a guarda de rota consomem `canView`; telas que precisam ficar
 * somente-leitura consomem `canEdit`.
 */

export type AreaKey =
  | "dashboard" | "regioes" | "pedidos" | "omnichannel" | "clientes"
  | "crm" | "workflows" | "workflow_stats" | "lojas" | "produtos" | "rfv";

type Nivel = "ver" | "editar";

/** path da rota → área. O que não está aqui (Minha Conta, afiliados) é sempre visível. */
export const PATH_AREA: Record<string, AreaKey> = {
  "/": "dashboard",
  "/regioes": "regioes",
  "/pedidos": "pedidos",
  "/omnichannel": "omnichannel",
  "/clientes": "clientes",
  "/crm": "crm",
  "/workflows": "workflows",
  "/workflow-stats": "workflow_stats",
  "/lojas": "lojas",
  "/produtos": "produtos",
  "/rfv": "rfv",
};

interface Resultado {
  loading: boolean;
  /** Owner ou sem seller resolvido ainda: libera tudo para não travar por engano. */
  isOwner: boolean;
  canView: (area: AreaKey) => boolean;
  canEdit: (area: AreaKey) => boolean;
  /** Para onde mandar quem cair numa área oculta: a 1ª área visível, ou /account. */
  homePath: string;
}

export function useAreaPermissions(): Resultado {
  const { activeSeller } = useSellerContext();
  const sellerId = activeSeller?.id;

  // app: isPending e não isLoading. Sem internet a consulta fica pausada (isLoading
  // falso, sem dado) e o mapa vazio esconderia todas as áreas do membro.
  const { data, isPending: isLoading } = useQuery<{ mapa: Record<string, Nivel>; owner: boolean }>({
    queryKey: ["my-area-permissions", sellerId],
    enabled: !!sellerId,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const { data, error } = await (supabase as unknown as {
        rpc: (f: string, a: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
      }).rpc("my_member_permissions", { _seller_id: sellerId });
      if (error) throw new Error(error.message);
      const linhas = (data ?? []) as { area: string; access_level: Nivel }[];
      const mapa: Record<string, Nivel> = {};
      for (const l of linhas) mapa[l.area] = l.access_level;
      // Heurística de owner: quem recebe TODAS as 9 áreas como 'editar' é owner
      // (a RPC devolve exatamente isso para o dono). Não é usada para segurança
      // — só para a UI não pintar "somente leitura" no dono.
      const todasEditar =
        Object.keys(PATH_AREA).length > 0 &&
        (Object.values(PATH_AREA) as string[]).every((a) => mapa[a] === "editar");
      return { mapa, owner: todasEditar };
    },
  });

  return useMemo(() => {
    // Sem seller ainda, ou carregando: não esconde nada (evita flash de bloqueio
    // e não trava o dono no primeiro quadro). A RLS do banco é a trava real.
    const carregando = !sellerId || isLoading;
    const mapa = data?.mapa ?? {};
    const isOwner = data?.owner ?? false;

    const canView = (area: AreaKey) => carregando || isOwner || !!mapa[area];
    const canEdit = (area: AreaKey) => carregando || isOwner || mapa[area] === "editar";

    // Primeira área visível na ordem do menu, para o redirect.
    const ordem: AreaKey[] = [
      "dashboard", "regioes", "pedidos", "omnichannel", "clientes",
      "crm", "rfv", "workflows", "workflow_stats", "lojas", "produtos",
    ];
    const primeira = ordem.find((a) => isOwner || !!mapa[a]);
    const homePath = carregando
      ? "/"
      : primeira
        ? Object.entries(PATH_AREA).find(([, a]) => a === primeira)?.[0] ?? "/account"
        : "/account";

    return { loading: carregando, isOwner, canView, canEdit, homePath };
  }, [data, isLoading, sellerId]);
}
