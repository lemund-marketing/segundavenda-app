import { createElement, useEffect, useSyncExternalStore } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { PushNotifications, type PushNotificationSchema } from "@capacitor/push-notifications";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useSellerContext } from "@/contexts/SellerContext";
import { toast } from "@/hooks/use-toast";
import { ToastAction, type ToastActionElement } from "@/components/ui/toast";

/**
 * Notificação de oportunidade de venda (FCM). O servidor manda uma por
 * oportunidade que a IA detecta; o app só cuida do aparelho:
 *
 * - guarda o token do aparelho em `app_push_aparelhos` (CONTRATO-BANCO.md), a
 *   cada abertura com sessão: o upsert com `visto_em` cobre a troca de token e
 *   diz ao servidor qual conta usa o aparelho agora;
 * - o toque na notificação (também com o app fechado) troca a loja ativa, se
 *   for o caso, e abre a conversa;
 * - com o app aberto, a notificação vira o aviso da própria tela;
 * - sair da conta apaga o token e desliga o aparelho no Firebase.
 *
 * No navegador (o `npm run dev` e o teste com banco simulado) nada aqui chama
 * o plugin.
 */

const CANAL = "oportunidades";
const TABELA = "app_push_aparelhos";
/** Pedir a permissão uma vez só: quem negou muda nas configurações do Android. */
const CHAVE_JA_PEDIU = "sv_push_pediu_permissao";

/** A tabela é do app e não está nos tipos gerados do banco do site. */
const banco = supabase as unknown as SupabaseClient;

const ativo = () => Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("PushNotifications");

type Toque = { rota: string; sellerId: string | null };

let ligado = false;
let tokenAtual: string | null = null;
let usuarioAtual: string | null = null;
/** `usuario:token` já gravado nesta abertura: o evento de registro pode repetir. */
let gravado: string | null = null;
let registrou = false;
let esperaRegistro: number | undefined;

// O toque fica guardado até a sessão e as lojas carregarem: com o app fechado,
// ele chega antes de qualquer tela existir.
let pendente: Toque | null = null;
const ouvintes = new Set<() => void>();
function definirPendente(t: Toque | null) {
  pendente = t;
  ouvintes.forEach((avisar) => avisar());
}
function assinar(avisar: () => void) {
  ouvintes.add(avisar);
  return () => {
    ouvintes.delete(avisar);
  };
}

function toqueDosDados(data: unknown): Toque | null {
  const d = (data ?? {}) as Record<string, unknown>;
  const rota = typeof d.rota === "string" ? d.rota : "";
  // Só caminho de dentro do app: "//host" sairia para outro endereço.
  if (!rota.startsWith("/") || rota.startsWith("//")) return null;
  const sellerId = typeof d.seller_id === "string" && d.seller_id ? d.seller_id : null;
  return { rota, sellerId };
}

async function gravarToken() {
  const token = tokenAtual;
  const usuario = usuarioAtual;
  if (!token || !usuario || gravado === `${usuario}:${token}`) return;
  const { error } = await banco.from(TABELA).upsert(
    {
      profile_id: usuario,
      token,
      plataforma: Capacitor.getPlatform() === "ios" ? "ios" : "android",
      visto_em: new Date().toISOString(),
    },
    { onConflict: "profile_id,token" },
  );
  // Sem a tabela ainda (o servidor não foi aplicado), o resto do app segue.
  if (error) console.warn("[push] não deu para guardar o aparelho:", error.message);
  else gravado = `${usuario}:${token}`;
}

function jaPediu() {
  try {
    return localStorage.getItem(CHAVE_JA_PEDIU) === "1";
  } catch {
    return false;
  }
}
function marcarQuePediu() {
  try {
    localStorage.setItem(CHAVE_JA_PEDIU, "1");
  } catch {
    /* sem armazenamento: pode pedir de novo na próxima abertura */
  }
}

async function prepararAparelho() {
  let { receive } = await PushNotifications.checkPermissions();
  // "prompt-with-rationale" é quem já negou uma vez: não insiste.
  if (receive === "prompt" && !jaPediu()) {
    marcarQuePediu();
    ({ receive } = await PushNotifications.requestPermissions());
  }
  if (receive !== "granted" || registrou) return;
  registrou = true;
  await PushNotifications.register();
}

function definirUsuario(id: string | null) {
  usuarioAtual = id;
  window.clearTimeout(esperaRegistro);
  if (!id) return;
  if (tokenAtual) void gravarToken();
  // Um pouco depois da abertura: a janela de permissão não disputa com a
  // primeira tela.
  esperaRegistro = window.setTimeout(() => {
    prepararAparelho().catch((e) => {
      registrou = false;
      console.warn("[push] registro falhou:", e);
    });
  }, 1200);
}

function mostrarAviso(n: PushNotificationSchema) {
  if (!n.title && !n.body) return;
  const toque = toqueDosDados(n.data);
  // O aviso não toca som: com o app aberto o Android não mostra a notificação
  // (o capacitor.config não tem presentationOptions).
  toast({
    title: n.title,
    description: n.body,
    duration: 8000,
    // O tipo do shadcn (ReactElement<typeof ToastAction>) só casa com JSX.
    action: toque
      ? (createElement(
          ToastAction,
          { altText: "Abrir a conversa", onClick: () => definirPendente(toque) },
          "Abrir",
        ) as unknown as ToastActionElement)
      : undefined,
  });
}

/**
 * Liga os ouvintes do plugin. Chamado uma vez em main.tsx, sem esperar nada:
 * o plugin guarda o toque que abriu o app até haver ouvinte.
 */
export function ligarPush() {
  if (ligado || !ativo()) return;
  ligado = true;
  const avisar = (o: string) => (e: unknown) => console.warn(`[push] ${o}:`, e);

  // Canal só existe no Android 8+; no iPhone a chamada não existe.
  if (Capacitor.getPlatform() === "android") {
    PushNotifications.createChannel({
      id: CANAL,
      name: "Oportunidades de venda",
      description: "Quando a IA encontra um cliente querendo comprar no WhatsApp.",
      importance: 4,
      visibility: 0,
      vibration: true,
    }).catch(avisar("canal"));
  }

  PushNotifications.addListener("registration", ({ value }) => {
    tokenAtual = value;
    void gravarToken();
  }).catch(avisar("ouvinte"));
  PushNotifications.addListener("registrationError", avisar("registro")).catch(avisar("ouvinte"));
  PushNotifications.addListener("pushNotificationReceived", mostrarAviso).catch(avisar("ouvinte"));
  PushNotifications.addListener("pushNotificationActionPerformed", ({ notification }) => {
    const toque = toqueDosDados(notification.data);
    if (toque) definirPendente(toque);
  }).catch(avisar("ouvinte"));
}

/**
 * Antes de sair da conta: apaga o token deste aparelho (só as linhas da
 * própria conta, pela RLS; por isso antes do signOut) e desliga o aparelho no
 * Firebase. Nunca segura o logout por mais de 2,5 s.
 */
export async function esquecerAparelho(): Promise<void> {
  if (!ativo()) return;
  const token = tokenAtual;
  const usuario = usuarioAtual;
  tokenAtual = null;
  gravado = null;
  registrou = false;
  definirPendente(null);
  const trabalho = (async () => {
    if (token && usuario) {
      const { error } = await banco.from(TABELA).delete().eq("profile_id", usuario).eq("token", token);
      if (error) console.warn("[push] não deu para apagar o aparelho:", error.message);
    }
    await PushNotifications.unregister();
  })().catch((e) => console.warn("[push] sair:", e));
  await Promise.race([trabalho, new Promise((r) => window.setTimeout(r, 2500))]);
}

/**
 * Dentro do Router: acompanha a conta logada (registro do aparelho) e leva o
 * toque pendente até a conversa, trocando a loja ativa antes se a
 * oportunidade for de outra loja.
 */
export function usePushNativo() {
  const { user, loading: carregandoSessao } = useAuth();
  const { sellers, activeSeller, setActiveSeller, loading: carregandoLojas } = useSellerContext();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const toque = useSyncExternalStore(assinar, () => pendente, () => null);
  const userId = user?.id ?? null;

  useEffect(() => {
    if (ativo()) definirUsuario(userId);
  }, [userId]);

  useEffect(() => {
    // Sem lojas ainda também é "carregando": logo depois do login há um
    // instante com a conta e a lista vazia.
    if (!toque || carregandoSessao || !user || carregandoLojas || !activeSeller || sellers.length === 0) return;
    if (toque.sellerId && activeSeller.id !== toque.sellerId) {
      const loja = sellers.find((s) => s.id === toque.sellerId);
      if (loja) {
        // A navegação fica para a volta deste efeito, já com a loja nova: a
        // conversa é procurada na loja ativa.
        setActiveSeller(loja);
        return;
      }
      definirPendente(null);
      toast({
        title: "Oportunidade de outra loja",
        description: "Esta conta não tem acesso à loja dessa oportunidade.",
      });
      return;
    }
    definirPendente(null);
    // seller_id já foi usado aqui; a tela só precisa do client_id.
    const destino = new URL(toque.rota, "https://app.local");
    destino.searchParams.delete("seller_id");
    // Já no WhatsApp, troca a URL em vez de empilhar: o Voltar sai da tela.
    navigate(destino.pathname + destino.search, { replace: destino.pathname === pathname });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toque, carregandoSessao, user, carregandoLojas, activeSeller?.id, sellers]);
}
