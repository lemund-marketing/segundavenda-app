import { useQuery } from "@tanstack/react-query";

import { agruparMunicipios, type MunicipioAgrupado } from "@/lib/municipios";

/**
 * Os municípios do IBGE já agrupados por nome. A lista (~150 KB) vem por
 * `import()` dinâmico, então só desce para o navegador na primeira vez que
 * alguém abre o filtro de cidade do gatilho — e fica em cache a sessão toda.
 */
export function useMunicipiosBrasil(enabled: boolean) {
  return useQuery<MunicipioAgrupado[]>({
    queryKey: ["municipios-brasil"],
    enabled,
    staleTime: Infinity,
    gcTime: Infinity,
    queryFn: async () => {
      const { MUNICIPIOS_BRASIL } = await import("@/lib/municipiosBrasil");
      return agruparMunicipios(MUNICIPIOS_BRASIL);
    },
  });
}
