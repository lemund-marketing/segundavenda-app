import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { contaImpersonada, ehAdmin } from "@/app/dados/impersonacao";

/**
 * A conta logada é admin (linha própria em `admin_users`, como o site
 * confere)? Durante a impersonação a resposta é sempre "não": o admin precisa
 * voltar antes de entrar em outro cliente.
 */
export function useEhAdmin(): {
  ehAdmin: boolean;
  carregando: boolean;
  /** A checagem falhou (rede): não dá para dizer que não é admin. */
  falhou: boolean;
  tentarDeNovo: () => void;
} {
  const { user } = useAuth();
  const id = user?.id ?? null;
  const impersonada = contaImpersonada(id);
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["app-eh-admin", id],
    queryFn: () => ehAdmin(id as string),
    enabled: !!id && !impersonada,
    staleTime: 10 * 60_000,
    refetchOnMount: true,
  });
  const tentarDeNovo = () => void refetch();
  if (!id || impersonada) return { ehAdmin: false, carregando: false, falhou: false, tentarDeNovo };
  return { ehAdmin: data === true, carregando: isLoading, falhou: isError && data === undefined, tentarDeNovo };
}
