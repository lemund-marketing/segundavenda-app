// Cópia do site (src/contexts/AuthContext.tsx) com ajustes do app:
// - sem cadastro: o app só entra em conta que já existe (regra da Play: quem
//   cria conta no app tem de oferecer exclusão de conta no app);
// - sair desconecta só este aparelho (scope "local"); o site, no navegador,
//   continua logado;
// - sem internet ao abrir, a sessão guardada não é apagada: o app espera a
//   conexão voltar (`semConexao`) em vez de mandar para o login.
import React, { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { isAuthRetryableFetchError, type Session, type User } from "@supabase/supabase-js";
import { validateEmail } from "@/utils/validation";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  /** Abriu sem internet com uma sessão guardada: ainda não dá para saber se ela vale. */
  semConexao: boolean;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};

export const useOptionalAuth = (): AuthContextType | null => useContext(AuthContext) ?? null;

/** Onde o supabase-js guarda a sessão (sb-<projeto>-auth-token). */
const CHAVE_SESSAO = `sb-${new URL(import.meta.env.VITE_SUPABASE_URL).hostname.split(".")[0]}-auth-token`;
const temSessaoGuardada = () => {
  try {
    return !!localStorage.getItem(CHAVE_SESSAO);
  } catch {
    return false;
  }
};

/**
 * Sem rede, renovar o token leva até ~30 s de tentativas antes de o supabase-js
 * desistir. Com sessão guardada, o app não espera tudo isso na tela de abertura:
 * passado este tempo (na hora, se o aparelho já diz que está sem rede), mostra
 * "Sem internet" e segue esperando por baixo.
 */
const ESPERA_SESSAO_MS = 4000;

/** Mesmo registro de segurança do site (RPC log_security_event). */
async function logSecurityEvent(action: string, status: string, details: Record<string, unknown>) {
  try {
    await supabase.rpc("log_security_event", {
      p_action: action,
      p_resource_type: "user",
      p_resource_id: null,
      p_status: status,
      p_details: { ...details, origem: "app" },
    });
  } catch (error) {
    console.error("Failed to log security event:", error);
  }
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [semConexao, setSemConexao] = useState(false);

  const userIdRef = React.useRef<string | undefined>(undefined);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, newSession) => {
      const newUserId = newSession?.user?.id;
      if (newSession) setSemConexao(false);

      // Mesmo guard do site: ao voltar para o app o supabase-js emite SIGNED_IN
      // com um objeto `user` novo de mesmo id; trocar o objeto re-dispararia
      // todo efeito que depende de `user`.
      if (newSession && newUserId && newUserId === userIdRef.current && event !== "USER_UPDATED") {
        setSession(newSession);
        return;
      }

      userIdRef.current = newUserId;
      setSession(newSession);
      setUser(newSession?.user ?? null);
      if (event === "SIGNED_OUT") sessionStorage.clear();
    });

    let resolvido = false;
    const espera = window.setTimeout(
      () => {
        if (resolvido || !temSessaoGuardada()) return;
        setSemConexao(true);
        setLoading(false);
      },
      navigator.onLine ? ESPERA_SESSAO_MS : 0,
    );
    // A conexão voltou: tenta renovar já, sem esperar o relógio do supabase-js.
    const aoVoltarRede = () => {
      if (!userIdRef.current && temSessaoGuardada()) void supabase.auth.getSession();
    };
    window.addEventListener("online", aoVoltarRede);

    supabase.auth.getSession().then(async ({ data, error }) => {
      resolvido = true;
      window.clearTimeout(espera);
      if (error && isAuthRetryableFetchError(error)) {
        // Sem rede para renovar o token. A sessão continua guardada e o
        // supabase-js tenta de novo sozinho; quando conseguir, o
        // onAuthStateChange acima entrega a sessão e o app segue.
        setSemConexao(true);
      } else if (error) {
        // Sessão que não vale mais (senha trocada, conta removida): sai só
        // deste aparelho e vai para o login.
        await supabase.auth.signOut({ scope: "local" });
        userIdRef.current = undefined;
        setSession(null);
        setUser(null);
      } else {
        userIdRef.current = data.session?.user?.id;
        setSemConexao(false);
        setSession(data.session);
        setUser(data.session?.user ?? null);
      }
      setLoading(false);
    });

    return () => {
      subscription.unsubscribe();
      window.clearTimeout(espera);
      window.removeEventListener("online", aoVoltarRede);
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!validateEmail(normalizedEmail)) {
      return { error: { message: "Invalid email format" } };
    }

    const { error } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password });
    if (error) {
      logSecurityEvent("authentication_failed", "failed", {
        reason: error.message,
        email: normalizedEmail.substring(0, 3) + "***",
      });
    }
    return { error };
  };

  const signOut = async () => {
    try {
      await supabase.auth.signOut({ scope: "local" });
    } catch (error) {
      console.error("Error signing out:", error);
    } finally {
      sessionStorage.clear();
      userIdRef.current = undefined;
      setSemConexao(false);
      setSession(null);
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, semConexao, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};
