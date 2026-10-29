import React, { createContext, useContext, useState, useEffect, useMemo, ReactNode } from 'react';
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "./AuthContext";

export interface Seller {
  id: string;
  name: string;
  tax_id: string | null;
  contact_email: string | null;
  status: 'pending' | 'configured' | 'active' | 'inactive';
  active: boolean;
  created_at: string;
}

interface SellerContextType {
  sellers: Seller[];
  activeSeller: Seller | null;
  setActiveSeller: (seller: Seller | null) => void;
  loading: boolean;
  refreshSellers: () => Promise<void>;
  createSeller: (name: string, taxId?: string) => Promise<Seller | null>;
  updateSellerActive: (sellerId: string, isActive: boolean) => Promise<void>;
  deleteSeller: (sellerId: string) => Promise<void>;
}

const SellerContext = createContext<SellerContextType | undefined>(undefined);

export const useSellerContext = () => {
  const context = useContext(SellerContext);
  if (!context) {
    throw new Error('useSellerContext must be used within a SellerProvider');
  }
  return context;
};

/**
 * Versão segura do useSellerContext: devolve null fora de um SellerProvider em
 * vez de lançar. Para painéis que podem ser montados sem o provider por cima.
 */
export const useOptionalSellerContext = (): SellerContextType | null =>
  useContext(SellerContext) ?? null;

// ─── Cache helpers (sessionStorage) ───────────────────────────────────────────
const CACHE_KEY_SELLERS = 'sv_sellers_cache';
const CACHE_KEY_ACTIVE  = 'sv_active_seller_cache';

const CACHE_KEY_OWNER = 'sv_sellers_cache_owner';

/** Descarta o cache se ele pertence a outro usuário (caso da impersonação). */
function cacheEhDoUsuario(userId: string | null | undefined): boolean {
  try {
    const dono = sessionStorage.getItem(CACHE_KEY_OWNER);
    return !!userId && !!dono && dono === userId;
  } catch { return false; }
}

function readCachedSellers(userId?: string | null): Seller[] {
  try {
    if (!cacheEhDoUsuario(userId)) return [];
    const raw = sessionStorage.getItem(CACHE_KEY_SELLERS);
    return raw ? (JSON.parse(raw) as Seller[]) : [];
  } catch { return []; }
}

function readCachedActiveSeller(userId?: string | null): Seller | null {
  try {
    if (!cacheEhDoUsuario(userId)) return null;
    const raw = sessionStorage.getItem(CACHE_KEY_ACTIVE);
    return raw ? (JSON.parse(raw) as Seller) : null;
  } catch { return null; }
}

function writeSellersCache(sellers: Seller[], active: Seller | null, userId?: string | null) {
  try {
    if (userId) sessionStorage.setItem(CACHE_KEY_OWNER, userId);
    sessionStorage.setItem(CACHE_KEY_SELLERS, JSON.stringify(sellers));
    if (active) {
      sessionStorage.setItem(CACHE_KEY_ACTIVE, JSON.stringify(active));
    } else {
      sessionStorage.removeItem(CACHE_KEY_ACTIVE);
    }
  } catch { /* quota exceeded – silencioso */ }
}

function clearSellersCache() {
  sessionStorage.removeItem(CACHE_KEY_SELLERS);
  sessionStorage.removeItem(CACHE_KEY_ACTIVE);
  sessionStorage.removeItem(CACHE_KEY_OWNER);
}
// ──────────────────────────────────────────────────────────────────────────────

interface SellerProviderProps {
  children: ReactNode;
}

export const SellerProvider: React.FC<SellerProviderProps> = ({ children }) => {
  const { toast } = useToast();
  const { user, loading: authLoading } = useAuth();

  // Cache só vale se for do MESMO usuário — senão, ao impersonar, o seller do
  // admin vazava para a sessão do seller e todas as telas ficavam vazias.
  const [sellers, setSellers] = useState<Seller[]>(() => readCachedSellers(user?.id));
  const [activeSeller, setActiveSellerState] = useState<Seller | null>(() => readCachedActiveSeller(user?.id));
  const [loading, setLoading] = useState(true);

  // Wrapper que mantém o cache sincronizado
  const setActiveSeller = (seller: Seller | null) => {
    setActiveSellerState(seller);
    writeSellersCache(sellers, seller, user?.id);
  };

  const fetchSellers = async () => {
    try {
      // Só mostra loading se não há cache (primeira vez)
      if (sellers.length === 0) setLoading(true);

      if (!user) {
        setSellers([]);
        setActiveSellerState(null);
        clearSellersCache();
        setLoading(false);
        return;
      }

      // Verify session is valid before fetching
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session) {
        console.error('[SellerContext] Invalid session:', sessionError);
        setSellers([]);
        setActiveSellerState(null);
        clearSellersCache();
        setLoading(false);
        // Sign out to clear invalid tokens
        await supabase.auth.signOut({ scope: "local" }); // app: sai só deste aparelho
        return;
      }

      // Fetch sellers through seller_members to respect RLS
      const { data: memberData, error: memberError } = await supabase
        .from('seller_members')
        .select('seller_id, created_at')
        .eq('profile_id', user.id);

      if (memberError) {
        console.error('[SellerContext] Error fetching seller_members:', memberError);
        
        // Check if it's an auth error
        if (memberError.message?.includes('JWT') || memberError.message?.includes('token')) {
          await supabase.auth.signOut({ scope: "local" }); // app: sai só deste aparelho
        }
        throw memberError;
      }

      if (!memberData || memberData.length === 0) {
        setSellers([]);
        setActiveSellerState(null);
        clearSellersCache();
        setLoading(false);
        return;
      }

      const sellerIds = memberData.map(m => m.seller_id);

      // Now fetch the actual sellers data
      const { data: sellersData, error: sellersError } = await supabase
        .from('sellers')
        .select('*')
        .in('id', sellerIds)
        .order('created_at', { ascending: false })
        .limit(50); // Máximo 50 sellers por usuário

      if (sellersError) {
        console.error('[SellerContext] Error fetching sellers:', sellersError);
        throw sellersError;
      }

      const fetchedSellers = (sellersData as Seller[]) || [];
      setSellers(fetchedSellers);

      // Qual seller abrir por padrão.
      //
      // Antes era simplesmente o MAIS RECENTE (a lista vem ordenada por
      // created_at desc, e pegávamos [0]). Isso quebrou para quem é convidado:
      // até 28/08/2026 o cadastro de um membro criava um "seller próprio" vazio
      // para ele, que por ser o mais novo virava o padrão — o convidado entrava
      // e via pedidos, clientes e tudo zerado, olhando o seller errado. O
      // gatilho já não cria mais esse seller, mas os que existem continuam na
      // conta de quem foi convidado antes.
      //
      // Agora o padrão é o seller com MAIS MOVIMENTO. Um seller sem nada não
      // ganha de um com dados só por ser mais novo — e para quem tem um seller
      // só, nada muda.
      // Critério: com mais de um seller, prefere o que NÃO foi criado por mim.
      // Quem é convidado tem o seller de quem o convidou (criado por outra
      // pessoa, com os dados) e, se foi cadastrado antes de 28/08, um seller
      // próprio vazio — que por ser o mais novo virava o padrão.
      //
      // Usa `created_by`, que já vem no select('*'). Não dá para usar contagem
      // de pedidos: `sellers` não tem esse número, e buscar em `orders` por
      // seller a cada carregamento sairia caro no login.
      //
      // Quem tem um seller só (a esmagadora maioria) não é afetado. Dono com
      // dois sellers próprios cai no desempate antigo — o mais recente.
      const preferido = (lista: Seller[]): Seller | null => {
        if (lista.length === 0) return null;
        if (lista.length === 1) return lista[0];
        const deOutraPessoa = lista.filter(
          (s) => (s as unknown as { created_by?: string }).created_by !== user.id,
        );
        return deOutraPessoa[0] ?? lista[0];
      };

      let newActive: Seller | null = null;

      if (activeSeller) {
        // Mantém o seller ativo atual SE ele pertencer a este usuário; senão cai
        // no preferido (protege contra cache de outra sessão).
        const stillExists = fetchedSellers.find(s => s.id === activeSeller.id);
        newActive = stillExists ?? preferido(fetchedSellers);
      } else {
        newActive = preferido(fetchedSellers);
      }

      setActiveSellerState(newActive);
      writeSellersCache(fetchedSellers, newActive, user.id);
    } catch (error) {
      console.error('[SellerContext] Error in fetchSellers:', error);
      toast({
        title: "Erro ao carregar sellers",
        description: "Não foi possível carregar os sellers. Por favor, tente novamente.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const createSeller = async (name: string, taxId?: string): Promise<Seller | null> => {
    try {
      if (!user) throw new Error('Usuário não autenticado');

      // Insert without returning to avoid RLS SELECT on the returning clause
      const { error: insertError } = await supabase
        .from('sellers')
        .insert({
          name,
          tax_id: taxId || null,
          created_by: user.id,
        }, { returning: 'minimal' } as any);

      if (insertError) throw insertError;

      // The AFTER INSERT trigger creates membership; now we can fetch the newly created row
      const { data: latest, error: fetchError } = await supabase
        .from('sellers')
        .select('*')
        .eq('created_by', user.id)
        .eq('name', name)
        .order('created_at', { ascending: false })
        .limit(1);

      if (fetchError) throw fetchError;

      // Refresh full list in context
      await refreshSellers();

      const created = latest && latest[0] ? latest[0] as Seller : null;
      if (created) {
        setActiveSeller(created);
      }

      toast({
        title: "Integração Cadastrada",
        description: "Nossa equipe entrará em contato em breve para configurar.",
        duration: 6000,
      });

      return created;
    } catch (error) {
      console.error('Error creating seller:', error);
      toast({
        title: "Erro",
        description: "Falha ao cadastrar integração",
        variant: "destructive",
      });
      return null;
    }
  };

  const updateSellerActive = async (sellerId: string, isActive: boolean) => {
    try {
      const { error } = await supabase
        .from('sellers')
        .update({ active: isActive })
        .eq('id', sellerId);

      if (error) throw error;

      setSellers(prev => {
        const updated = prev.map(s => s.id === sellerId ? { ...s, active: isActive } : s);
        writeSellersCache(updated, activeSeller);
        return updated;
      });
      toast({
        title: isActive ? "Integração ativada" : "Integração desativada",
        description: isActive ? "Novos clientes serão processados." : "Clientes desta integração ficarão pausados.",
      });
    } catch (err) {
      console.error('Error updating seller active:', err);
      toast({ title: "Erro", description: "Não foi possível atualizar status.", variant: "destructive" });
    }
  };

  const deleteSeller = async (sellerId: string) => {
    try {
      const { error } = await supabase.from('sellers').delete().eq('id', sellerId);
      if (error) throw error;

      setSellers(prev => {
        const updated = prev.filter(s => s.id !== sellerId);
        const newActive = activeSeller?.id === sellerId ? (updated[0] ?? null) : activeSeller;
        writeSellersCache(updated, newActive);
        return updated;
      });
      if (activeSeller?.id === sellerId) setActiveSellerState(sellers.find(s => s.id !== sellerId) ?? null);
      toast({ title: "Integração excluída", description: "Clientes não foram removidos." });
    } catch (err) {
      console.error('Error deleting seller:', err);
      toast({ title: "Erro", description: "Não foi possível excluir a integração.", variant: "destructive" });
    }
  };

  const refreshSellers = async () => {
    await fetchSellers();
  };

  useEffect(() => {
    // Only fetch sellers when auth is ready and user exists
    if (authLoading) {
      return;
    }

    if (!user) {
      setSellers([]);
      setActiveSellerState(null);
      clearSellersCache();
      setLoading(false);
      return;
    }

    fetchSellers();

    // Setup realtime listener with debounce to prevent overload
    const channel = supabase
      .channel('sellers_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'sellers'
        },
        debounce(() => {
          fetchSellers();
        }, 1000) // Debounce 1 segundo
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, authLoading]); // user?.id ao invés de user para evitar re-fetch em TOKEN_REFRESHED

  // Helper debounce function
  function debounce<T extends (...args: any[]) => any>(func: T, wait: number) {
    let timeout: NodeJS.Timeout | null = null;
    return function executedFunction(...args: Parameters<T>) {
      const later = () => {
        timeout = null;
        func(...args);
      };
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  const value: SellerContextType = {
    sellers,
    activeSeller,
    setActiveSeller,
    loading,
    refreshSellers,
    createSeller,
    updateSellerActive,
    deleteSeller,
  };

  return (
    <SellerContext.Provider value={value}>
      {children}
    </SellerContext.Provider>
  );
};

/**
 * Provider aninhado que FIXA o seller ativo (docs/FLUXOS_PROPOSTA.md §5.5).
 *
 * Usado pelo editor de propostas do admin: o admin roda com o próprio JWT, mas
 * os painéis de configuração dos nós precisam enxergar o CLIENTE como seller
 * ativo (fases, números, templates dele). Herda o resto do contexto externo
 * (refreshSellers, createSeller...) e neutraliza o setActiveSeller — trocar de
 * seller aqui dentro não faz sentido. Precisa de um SellerProvider por cima.
 */
export const SellerOverrideProvider: React.FC<{ seller: Seller; children: ReactNode }> = ({
  seller,
  children,
}) => {
  const externo = useSellerContext();
  // useMemo: sem ele o value nasceria com referência nova a cada render do
  // editor, e todo consumidor do contexto (um painel por card) re-renderizaria.
  const value = useMemo<SellerContextType>(
    () => ({
      ...externo,
      sellers: [seller],
      activeSeller: seller,
      setActiveSeller: () => {},
      loading: false,
    }),
    [externo, seller],
  );

  return <SellerContext.Provider value={value}>{children}</SellerContext.Provider>;
};
