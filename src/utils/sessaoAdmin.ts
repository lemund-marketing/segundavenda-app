import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

/**
 * Identidade do admin durante a impersonação.
 *
 * Ao impersonar, a sessão ativa do navegador passa a ser a DO CLIENTE. Quem
 * denuncia o admin por trás é a sessão guardada em
 * sessionStorage('admin_impersonation') — chave que só existe no navegador dele.
 *
 * Isso importa porque as telas de admin continuam visíveis durante a
 * impersonação (é justamente o ponto do copiloto flutuante), mas as consultas
 * saem com o JWT do cliente. E o padrão do banco aqui é filtrar por
 * `is_admin_user(auth.uid())` DENTRO da consulta — que não dá erro: devolve
 * zero linhas. O resultado é uma falha de permissão vestida de estado vazio,
 * exatamente o que já tinha acontecido com o histórico do copiloto e voltou a
 * acontecer no seletor de responsável ("não puxa os membros").
 *
 * Use `clienteAdmin()` em qualquer chamada que dependa de ser admin.
 */
export function tokenAdminGuardado(): string | null {
  try {
    const bruto = sessionStorage.getItem("admin_impersonation");
    if (!bruto) return null;
    const token: string | null = JSON.parse(bruto)?.adminSession?.access_token ?? null;
    if (!token || fotoVelha(token)) return null;
    return token;
  } catch {
    // sessionStorage bloqueado ou JSON corrompido: seguir com a sessão normal.
    return null;
  }
}

/** `sub` (id do usuário) de um JWT, sem validar. Null se ilegível. */
function usuarioDoToken(token: string): string | null {
  try {
    return String(JSON.parse(atob(token.split(".")[1]))?.sub ?? "") || null;
  } catch {
    return null;
  }
}

/** Id do usuário da sessão ATIVA (a que o supabase-js guarda no localStorage). */
function usuarioDaSessaoAtiva(): string | null {
  try {
    const ref = new URL(URL_SUPABASE).hostname.split(".")[0];
    const bruto = localStorage.getItem(`sb-${ref}-auth-token`);
    if (!bruto) return null;
    const sessao = JSON.parse(bruto);
    return sessao?.user?.id ?? (sessao?.access_token ? usuarioDoToken(sessao.access_token) : null);
  } catch {
    return null;
  }
}

/**
 * A foto guardada só faz sentido enquanto a sessão ativa é a do CLIENTE. Se a
 * sessão ativa já é a do próprio admin, a impersonação acabou (ou nem chegou a
 * trocar de sessão) e a foto é velha — pode inclusive ser de uma sessão que um
 * "Sair" encerrou no servidor. Nesse caso a sessão ativa é a fonte certa: é o
 * mesmo admin, com token vivo. A foto NÃO é apagada aqui: logo depois de salvar
 * a foto o magic link do cliente ainda não foi processado, e apagar nessa
 * janela mataria o "Voltar para admin" e o destino da impersonação.
 */
function fotoVelha(tokenDaFoto: string): boolean {
  const admin = usuarioDoToken(tokenDaFoto);
  const ativo = usuarioDaSessaoAtiva();
  return !!admin && !!ativo && admin === ativo;
}

const URL_SUPABASE =
  import.meta.env.VITE_SUPABASE_URL || "https://fvyhjrqzklbfkmpajoyj.supabase.co";
const CHAVE_SUPABASE =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ2eWhqcnF6a2xiZmttcGFqb3lqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY2NDg5NjQsImV4cCI6MjA3MjIyNDk2NH0.4CHkbDcEWdfK7dSbJAugOtreEfdS5vr0eewIHsfUkUk";

// Cache por token: sem isso cada consulta abriria um cliente novo.
const _cache = new Map<string, SupabaseClient>();

/** Segundos até o JWT vencer (negativo = já venceu). NaN se ilegível. */
function segundosAteVencer(token: string): number {
  try {
    const corpo = JSON.parse(atob(token.split(".")[1]));
    return Number(corpo?.exp) - Math.floor(Date.now() / 1000);
  } catch {
    return NaN;
  }
}

// Uma renovação por vez: o refresh_token do Supabase é de uso único (rotação),
// e duas renovações em paralelo queimariam o mesmo token.
let _renovando: Promise<string | null> | null = null;

/**
 * Devolve um access_token de admin VÁLIDO durante a impersonação, renovando
 * pelo refresh_token quando faltar pouco para vencer — e null fora da
 * impersonação (ou se a renovação falhar).
 *
 * Por que existe: o token guardado no sessionStorage é uma foto do momento em
 * que a impersonação começou, e vale 1 hora. Depois disso o copiloto levava
 * 401 "Não autenticado" (medido nos logs: 3 chamadas com exp vencido em
 * 20/08 18:11–18:15) e toda tela de admin via clienteAdmin() apodrecia junto.
 * A renovação usa fetch direto no endpoint de auth para NÃO tocar a sessão
 * ativa do navegador, que durante a impersonação é a do CLIENTE.
 */
export async function renovarTokenAdmin(
  opcoes: { forcar?: boolean } = {},
): Promise<string | null> {
  try {
    const bruto = sessionStorage.getItem("admin_impersonation");
    if (!bruto) return null;
    const info = JSON.parse(bruto);
    const atual: string | null = info?.adminSession?.access_token ?? null;
    const refresh: string | null = info?.adminSession?.refresh_token ?? null;
    if (!atual || fotoVelha(atual)) return null;

    // Margem de 5 min: renovar cedo demais gasta rotação à toa; tarde demais
    // corre contra o relógio de uma investigação longa do copiloto.
    // `forcar` ignora a margem: é o caminho de quem levou 401 com um token que
    // ainda não venceu — a sessão pode ter sido encerrada no servidor (um
    // "Sair" em outra aba ou dispositivo), e só a renovação revela isso. Se
    // ela falhar, devolve o token de sempre: quem chamou compara e vê que nada
    // mudou.
    if (!opcoes.forcar && segundosAteVencer(atual) > 300) return atual;
    if (!refresh) return atual;

    if (!_renovando) {
      _renovando = (async () => {
        try {
          const r = await fetch(`${URL_SUPABASE}/auth/v1/token?grant_type=refresh_token`, {
            method: "POST",
            headers: { "Content-Type": "application/json", apikey: CHAVE_SUPABASE },
            body: JSON.stringify({ refresh_token: refresh }),
          });
          if (!r.ok) return atual;
          const nova = await r.json();
          if (!nova?.access_token) return atual;
          // Guarda o PAR novo: o refresh antigo morreu na rotação, e o botão
          // "voltar para admin" do banner depende do par guardado aqui.
          info.adminSession = {
            access_token: nova.access_token,
            refresh_token: nova.refresh_token ?? refresh,
          };
          sessionStorage.setItem("admin_impersonation", JSON.stringify(info));
          return nova.access_token as string;
        } catch {
          return atual;
        } finally {
          _renovando = null;
        }
      })();
    }
    return await _renovando;
  } catch {
    return null;
  }
}

/**
 * Devolve o cliente que carrega a identidade de admin. Fora da impersonação é o
 * cliente normal — nada muda.
 */
export function clienteAdmin(): SupabaseClient {
  const token = tokenAdminGuardado();
  if (!token) return supabase as unknown as SupabaseClient;

  let c = _cache.get(token);
  if (!c) {
    c = createClient(URL_SUPABASE, CHAVE_SUPABASE, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      // persistSession: false para NÃO sobrescrever a sessão do cliente
      // impersonado guardada no localStorage.
      auth: { persistSession: false, autoRefreshToken: false },
    });
    _cache.set(token, c);
  }
  return c;
}
