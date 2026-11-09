import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useInfiniteQuery } from "@tanstack/react-query";
import { ArrowLeft, ChevronRight, Loader2, LogOut, Search, Store } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { entrarComoCliente, type ClienteAlvo } from "@/app/dados/impersonacao";
import { useSairDaConta } from "@/app/dados/useSairDaConta";

/**
 * Escolher cliente: o admin entra como o dono de uma loja (impersonacao.ts).
 * Aparece no lugar do "Sua conta ainda não tem loja" para o admin sem loja, e
 * pelo Menu ("Entrar como cliente") para o admin que tem loja.
 *
 * A lista é a de `sellers`: a RLS deixa o admin ler todas (is_admin_user),
 * a mesma leitura das telas de admin do site. Mais recentes primeiro, 30 por
 * página, busca pelo nome da loja.
 */

const POR_PAGINA = 30;

interface LinhaCliente extends ClienteAlvo {
  contact_email: string | null;
  created_at: string;
}

/** `%`, `_` e `\` são curingas do ilike: na busca valem como texto. */
const escaparIlike = (t: string) => t.replace(/[\\%_]/g, (c) => `\\${c}`);

function useClientesDoAdmin(termo: string) {
  return useInfiniteQuery({
    queryKey: ["app-admin-clientes", termo],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      let consulta = supabase
        .from("sellers")
        .select("id, name, contact_email, created_at, created_by")
        .order("created_at", { ascending: false })
        .order("id", { ascending: true })
        .range(pageParam, pageParam + POR_PAGINA - 1);
      if (termo) consulta = consulta.ilike("name", `%${escaparIlike(termo)}%`);
      const { data, error } = await consulta;
      if (error) throw new Error(error.message);
      return (data ?? []) as LinhaCliente[];
    },
    getNextPageParam: (ultima, paginas) =>
      ultima.length < POR_PAGINA ? undefined : paginas.length * POR_PAGINA,
  });
}

const dataCurta = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("pt-BR");
};

export default function EscolherCliente({ comVoltar = false }: { comVoltar?: boolean }) {
  const { user } = useAuth();
  const { sair, saindo } = useSairDaConta();
  const [texto, setTexto] = useState("");
  const [termo, setTermo] = useState("");
  const [entrandoEm, setEntrandoEm] = useState<string | null>(null);

  // A busca espera a pessoa parar de digitar.
  useEffect(() => {
    const t = window.setTimeout(() => setTermo(texto.trim()), 300);
    return () => window.clearTimeout(t);
  }, [texto]);

  const { data, isLoading, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } = useClientesDoAdmin(termo);
  const clientes = data?.pages.flat() ?? [];

  const entrar = async (c: LinhaCliente) => {
    if (entrandoEm) return;
    setEntrandoEm(c.id);
    try {
      // Com sucesso o app recarrega já como o cliente.
      await entrarComoCliente(c);
    } catch (e) {
      setEntrandoEm(null);
      toast({
        title: "Não deu para entrar como o cliente",
        description: e instanceof Error ? e.message : "Tente de novo.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="flex min-h-[calc(100dvh-var(--faixa-admin,0px))] flex-col bg-background">
      <header className="sticky top-[var(--faixa-admin,0px)] z-40 flex flex-col gap-3 border-b border-border bg-background px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))]">
        <div className="flex items-center gap-2">
          {comVoltar && (
            <Link to="/menu" aria-label="Voltar para o Menu" className="-ml-2 rounded-full p-2 active:bg-muted">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          )}
          <div className="min-w-0">
            <h1 className="text-lg font-semibold text-foreground">Escolher cliente</h1>
            <p className="truncate text-[13px] text-muted-foreground">Admin: {user?.email}</p>
          </div>
        </div>
        <label className="flex h-10 items-center gap-2 rounded-xl border border-input bg-card px-3">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            type="search"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Buscar pelo nome da loja"
            aria-label="Buscar pelo nome da loja"
            className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground"
          />
        </label>
      </header>

      <main className="flex flex-1 flex-col gap-3 px-4 py-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
        <p className="px-1 text-[13px] text-muted-foreground">
          Tocar numa loja abre o app como o dono dela. Para sair, use "Voltar para Admin" na faixa do topo.
        </p>

        {isLoading ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-2xl" />
            ))}
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-card px-6 py-8 text-center">
            <p className="text-sm text-foreground">Não deu para carregar os clientes.</p>
            <button
              type="button"
              onClick={() => void refetch()}
              className="rounded-full bg-primary/10 px-3.5 py-1.5 text-[13px] font-medium text-primary active:bg-primary/15"
            >
              Tentar de novo
            </button>
          </div>
        ) : clientes.length === 0 ? (
          <p className="rounded-2xl border border-border bg-card px-6 py-8 text-center text-sm text-muted-foreground">
            {termo ? `Nenhuma loja com "${termo}" no nome.` : "Nenhum cliente encontrado."}
          </p>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card" data-lista-clientes>
            {clientes.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => void entrar(c)}
                  disabled={!!entrandoEm}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors active:bg-muted disabled:opacity-60"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Store className="h-[18px] w-[18px]" strokeWidth={1.75} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-medium text-foreground">{c.name || "Sem nome"}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {[c.contact_email, `desde ${dataCurta(c.created_at)}`].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  {entrandoEm === c.id ? (
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}

        {hasNextPage && (
          <button
            type="button"
            onClick={() => void fetchNextPage()}
            disabled={isFetchingNextPage}
            className="self-center rounded-full bg-primary/10 px-4 py-2 text-[13px] font-medium text-primary active:bg-primary/15 disabled:opacity-60"
          >
            {isFetchingNextPage ? "Carregando…" : "Mostrar mais"}
          </button>
        )}

        {!comVoltar && (
          <button
            type="button"
            onClick={() => void sair()}
            disabled={saindo}
            className="mt-2 flex items-center justify-center gap-2 rounded-2xl border border-border bg-card px-4 py-3.5 text-[15px] font-medium text-destructive transition-colors active:bg-destructive/10"
          >
            <LogOut className="h-[18px] w-[18px]" strokeWidth={1.75} />
            Sair da conta
          </button>
        )}
      </main>
    </div>
  );
}
