import { useSyncExternalStore } from "react";
import { isAuthRetryableFetchError } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

/**
 * "Entrar como cliente" do admin, como o impersonarCliente.ts do site: o
 * admin não vê dados de cliente na própria sessão, ele passa a ser o DONO da
 * loja (sellers.created_by) neste aparelho.
 *
 * A edge do site `admin-impersonate-user` (só chamada, nunca alterada) devolve
 * o magic link do dono. No site o navegador segue o link; no app não dá (o
 * link volta para o site), então o `token` do link, que é o hashed_token do
 * Auth, vai direto para o `verifyOtp({ token_hash })` e a sessão do dono entra
 * no supabase-js sem sair do app.
 *
 * Antes da troca, a sessão do admin (access + refresh) fica guardada no
 * localStorage, para sobreviver ao app fechado: é o que o "Voltar para Admin"
 * restaura com `setSession`, sem novo login. É a mesma exposição da sessão que
 * o supabase-js já guarda ali. Nenhum token vai para o console.
 *
 * Enquanto impersona, o aparelho não é gravado na conta do cliente
 * (`contaImpersonada`, lida pelo push.ts), e "Sair da conta" vira "Voltar para
 * Admin": nada aqui desloga o cliente de outro lugar.
 */

const CHAVE = "sv_app_admin_impersonacao";

export interface Impersonacao {
  admin: { userId: string; email: string | null; access_token: string; refresh_token: string };
  alvo: { userId: string; email: string | null; loja: string | null; sellerId: string };
  desde: string;
  /** A loja tocada já foi aberta: depois disso o admin troca de loja à vontade. */
  lojaAberta?: boolean;
}

export interface ClienteAlvo {
  id: string;
  name: string | null;
  created_by: string | null;
  contact_email?: string | null;
  created_at?: string;
}

// ── Registro guardado, com aviso para quem desenha ───────────────────────────
const ouvintes = new Set<() => void>();
let emCache: Impersonacao | null | undefined;

function lerDoArmazenamento(): Impersonacao | null {
  try {
    const bruto = localStorage.getItem(CHAVE);
    if (!bruto) return null;
    const r = JSON.parse(bruto) as Impersonacao;
    const valido =
      !!r?.admin?.userId && !!r.admin.access_token && !!r.admin.refresh_token && !!r?.alvo?.userId &&
      // A foto só vale se o token guardado é mesmo do admin registrado.
      usuarioDoToken(r.admin.access_token) === r.admin.userId;
    if (valido) return r;
    localStorage.removeItem(CHAVE);
    return null;
  } catch {
    try {
      localStorage.removeItem(CHAVE);
    } catch {
      /* sem armazenamento */
    }
    return null;
  }
}

export function lerImpersonacao(): Impersonacao | null {
  if (emCache === undefined) emCache = lerDoArmazenamento();
  return emCache;
}

function guardar(r: Impersonacao | null) {
  emCache = r;
  try {
    if (r) localStorage.setItem(CHAVE, JSON.stringify(r));
    else localStorage.removeItem(CHAVE);
  } catch {
    /* sem armazenamento: o Voltar para Admin não sobrevive a reabrir o app */
  }
  ouvintes.forEach((avisar) => avisar());
}

/** Marca que a loja escolhida já abriu (FaixaImpersonacao). */
export function marcarLojaAberta() {
  const r = lerImpersonacao();
  if (r && !r.lojaAberta) guardar({ ...r, lojaAberta: true });
}

export function esquecerImpersonacao() {
  if (lerImpersonacao()) guardar(null);
}

function assinar(avisar: () => void) {
  ouvintes.add(avisar);
  return () => {
    ouvintes.delete(avisar);
  };
}

/** O registro, para a tela: muda quando entra ou volta. */
export function useRegistroImpersonacao(): Impersonacao | null {
  return useSyncExternalStore(assinar, lerImpersonacao, () => null);
}

/**
 * Esta conta é a de um cliente em que o admin entrou neste aparelho? Lido pelo
 * push.ts: aparelho não vai para a conta do cliente.
 */
export function contaImpersonada(userId: string | null | undefined): boolean {
  const r = lerImpersonacao();
  return !!userId && !!r && r.alvo.userId === userId && r.admin.userId !== userId;
}

/** Entrada ou volta em andamento: a sessão troca por baixo e o registro não pode ser julgado. */
let emTroca = false;
export const trocaEmAndamento = () => emTroca;

/** `sub` (id do usuário) de um JWT, sem validar. */
function usuarioDoToken(token: string): string | null {
  try {
    const corpo = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return String(JSON.parse(atob(corpo))?.sub ?? "") || null;
  } catch {
    return null;
  }
}

/** Conta logada é admin? Mesma consulta do site (a RLS deixa ler a própria linha). */
export async function ehAdmin(userId: string): Promise<boolean> {
  const { data, error } = await supabase.from("admin_users").select("id").eq("user_id", userId).maybeSingle();
  if (error) throw new Error(error.message);
  return !!data;
}

/** Mensagem do corpo da resposta de erro da edge ({ success: false, error }). */
async function erroDaEdge(error: unknown): Promise<string> {
  try {
    const resposta = (error as { context?: Response })?.context;
    if (resposta && typeof resposta.json === "function") {
      const corpo = await resposta.json();
      if (typeof corpo?.error === "string" && corpo.error) return corpo.error;
    }
  } catch {
    /* corpo ilegível: segue com a mensagem genérica */
  }
  return "Não deu para gerar o acesso ao cliente.";
}

/**
 * Troca a sessão deste aparelho pela do dono do cliente e reabre o app já
 * como ele. Lança com mensagem legível; quem chama mostra o aviso.
 */
export async function entrarComoCliente(cliente: ClienteAlvo): Promise<void> {
  const { data: sessaoData } = await supabase.auth.getSession();
  const sessao = sessaoData.session;
  if (!sessao?.user?.id) throw new Error("Sessão não encontrada. Entre de novo com a conta admin.");
  if (contaImpersonada(sessao.user.id)) throw new Error("Volte para o admin antes de entrar em outro cliente.");
  if (!(await ehAdmin(sessao.user.id))) throw new Error("Esta conta não é admin.");

  // O alvo é um USUÁRIO, não a loja: o dono da conta.
  const alvoId = cliente.created_by;
  if (!alvoId) throw new Error("Este cliente não tem um usuário dono para entrar como ele.");
  if (alvoId === sessao.user.id) throw new Error("Esta loja já é sua: ela abre na sua própria conta.");

  const { data, error } = await supabase.functions.invoke("admin-impersonate-user", {
    body: { targetUserId: alvoId },
  });
  if (error) throw new Error(await erroDaEdge(error));
  if (!data?.success || typeof data?.actionUrl !== "string") throw new Error("Falha ao gerar o acesso como o cliente.");

  // O action_link do Auth é .../auth/v1/verify?token=<hashed_token>&type=magiclink&redirect_to=...
  let tokenHash: string | null = null;
  let tipo: "magiclink" | "email" = "magiclink";
  try {
    const link = new URL(data.actionUrl);
    tokenHash = link.searchParams.get("token");
    if (link.searchParams.get("type") === "email") tipo = "email";
  } catch {
    tokenHash = null;
  }
  if (!tokenHash) throw new Error("O acesso gerado para o cliente veio sem o código.");

  // A sessão é lida de novo agora, depois da edge: nesses segundos o
  // supabase-js pode ter renovado o token, e o refresh_token da foto do começo
  // já estaria gasto (rotação) quando o admin tentasse voltar.
  const { data: agoraData } = await supabase.auth.getSession();
  const agora = agoraData.session;
  if (!agora?.refresh_token || agora.user?.id !== sessao.user.id) {
    throw new Error("A sessão do admin mudou no meio da troca. Tente de novo.");
  }

  emTroca = true;
  // Guardado ANTES da troca: o push lê o registro no instante em que a sessão
  // do cliente aparece, e não grava o aparelho na conta dele.
  guardar({
    admin: {
      userId: agora.user.id,
      email: agora.user.email ?? null,
      access_token: agora.access_token,
      refresh_token: agora.refresh_token,
    },
    alvo: {
      userId: alvoId,
      email: typeof data.targetEmail === "string" ? data.targetEmail : null,
      loja: cliente.name,
      sellerId: cliente.id,
    },
    desde: new Date().toISOString(),
  });

  const { data: verificado, error: erroVerificar } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: tipo });
  if (erroVerificar || !verificado.session || verificado.user?.id !== alvoId) {
    // verifyOtp que falha não troca a sessão: o admin continua onde estava.
    // Se trocou para outra conta (não deveria), volta para o admin.
    if (verificado?.session && verificado.user?.id !== alvoId) {
      await supabase.auth.setSession({ access_token: agora.access_token, refresh_token: agora.refresh_token });
    }
    guardar(null);
    emTroca = false;
    throw new Error("Não deu para entrar como o cliente. Tente de novo.");
  }

  // Recarrega em vez de navegar, como o site: Auth, loja e assinatura são
  // contextos montados uma vez, e trocar a sessão por baixo deles misturaria a
  // loja do admin com o JWT do cliente por um instante.
  window.location.replace("/");
}

/** Encerra no servidor só a sessão que o magic link abriu (scope local), nunca as outras do cliente. */
async function encerrarSessaoImpersonada(accessToken: string | undefined) {
  if (!accessToken) return;
  try {
    await Promise.race([
      fetch(`${import.meta.env.VITE_SUPABASE_URL}/auth/v1/logout?scope=local`, {
        method: "POST",
        headers: {
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${accessToken}`,
        },
      }),
      new Promise((r) => window.setTimeout(r, 2500)),
    ]);
  } catch {
    /* sem rede: a sessão do magic link só deixa de ser usada */
  }
}

/** Desfecho do "Voltar para Admin". */
export type Volta = "ok" | "sem_rede" | "recusado";

/** Falha de rede ou do servidor (5xx): o Auth não recusou nada, dá para tentar de novo. */
function ehFalhaPassageira(e: unknown): boolean {
  if (isAuthRetryableFetchError(e)) return true;
  return e instanceof TypeError || /failed to fetch|network|load failed/i.test(e instanceof Error ? e.message : "");
}

/**
 * Restaura a sessão guardada do admin.
 *
 * - `ok`: o app recarrega já como admin.
 * - `sem_rede`: sem internet ou servidor fora. Nada muda: a sessão do cliente
 *   continua aberta, a do admin continua guardada e a faixa fica, para tentar
 *   de novo. (O setSession que falha por rede não troca a sessão, e o
 *   supabase-js também não apaga a atual nesse caso.)
 * - `recusado`: o Auth recusou de fato (refresh vencido ou já usado, outra
 *   conta) ou a conta deixou de ser admin. A sessão do magic link sai do
 *   servidor, `sair` desliga o aparelho e sai deste aparelho, e só então o
 *   registro é apagado (antes disso, o push poderia gravar o aparelho na
 *   conta do cliente).
 */
export async function voltarParaAdmin(sair: () => Promise<void>): Promise<Volta> {
  const r = lerImpersonacao();
  if (r && typeof navigator !== "undefined" && navigator.onLine === false) return "sem_rede";
  emTroca = true;
  const { data: atual } = await supabase.auth.getSession();
  const tokenCliente = atual.session?.user?.id === r?.alvo.userId ? atual.session?.access_token : undefined;

  let desfecho: Volta = "recusado";
  if (r) {
    try {
      const { data, error } = await supabase.auth.setSession({
        access_token: r.admin.access_token,
        refresh_token: r.admin.refresh_token,
      });
      if (error) {
        desfecho = ehFalhaPassageira(error) ? "sem_rede" : "recusado";
        console.warn("[admin] sessão do admin não pôde ser restaurada:", error.message);
      } else if (data.user?.id === r.admin.userId) {
        // A sessão já é a do próprio admin. A checagem de admin só confirma
        // que a linha continua lá; sem rede para ela, segue como admin (é a
        // conta dele, e a lista de clientes depende da RLS do servidor).
        try {
          desfecho = (await ehAdmin(r.admin.userId)) ? "ok" : "recusado";
        } catch {
          desfecho = "ok";
        }
      }
    } catch (e) {
      desfecho = ehFalhaPassageira(e) ? "sem_rede" : "recusado";
      console.warn("[admin] voltar para o admin falhou:", e instanceof Error ? e.message : "erro");
    }
  }

  if (desfecho === "sem_rede") {
    emTroca = false;
    return desfecho;
  }
  // A sessão do magic link sai do servidor nos dois desfechos que encerram.
  await encerrarSessaoImpersonada(tokenCliente);
  if (desfecho === "ok") {
    guardar(null);
    window.location.replace("/");
    return desfecho;
  }
  try {
    await sair();
  } finally {
    guardar(null);
    emTroca = false;
  }
  return desfecho;
}
