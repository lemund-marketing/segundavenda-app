import { useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { Eye, EyeOff, Loader2, Lock, Mail } from "lucide-react";
import { isAuthRetryableFetchError } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { validateEmail } from "@/utils/validation";
import logoFinal from "@/assets/logo-segunda-venda-final.svg";
import { noSite } from "@/app/site";

/**
 * Login do app (a partir do Auth.tsx do site). Só entra em conta que já
 * existe: cadastro, plano e o resto da conta ficam no site.
 *
 * "Esqueci minha senha" manda o mesmo e-mail do site, com o link para a página
 * de troca de senha do site (que já existe e é dele): o app não recebe esse
 * link. Depois de trocar a senha lá, a pessoa volta e entra aqui.
 */
export default function Entrar() {
  const { user, signIn } = useAuth();
  const [modo, setModo] = useState<"entrar" | "recuperar">("entrar");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [verSenha, setVerSenha] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [linkEnviadoPara, setLinkEnviadoPara] = useState<string | null>(null);

  if (user) return <Navigate to="/" replace />;

  const entrar = async (e: FormEvent) => {
    e.preventDefault();
    setErro(null);
    if (!email.trim() || !senha) {
      setErro("Digite o e-mail e a senha.");
      return;
    }
    setEnviando(true);
    const { error } = await signIn(email, senha);
    setEnviando(false);
    if (error) setErro(mensagemDeErro(error));
    // Com sucesso, o AuthContext recebe a sessão e esta tela vira o Início.
  };

  const recuperar = async (e: FormEvent) => {
    e.preventDefault();
    setErro(null);
    const alvo = email.trim().toLowerCase();
    if (!validateEmail(alvo)) {
      setErro("Digite o e-mail da sua conta.");
      return;
    }
    setEnviando(true);
    const { error } = await supabase.auth.resetPasswordForEmail(alvo, { redirectTo: noSite("/reset-password") });
    setEnviando(false);
    if (error) {
      setErro(mensagemDeErro(error));
      return;
    }
    setLinkEnviadoPara(alvo);
  };

  const trocarModo = (novo: "entrar" | "recuperar") => {
    setModo(novo);
    setErro(null);
    setLinkEnviadoPara(null);
  };

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background px-6">
      <div className="flex flex-1 flex-col justify-center py-10">
        <div className="mx-auto w-full max-w-sm">
          <img src={logoFinal} alt="Segunda Venda" className="mx-auto mb-10 h-9 w-auto" />

          <h1 className="text-2xl font-bold text-foreground">
            {modo === "entrar" ? "Bem-vindo de volta!" : "Recuperar senha"}
          </h1>
          <p className="mt-1.5 text-[15px] text-muted-foreground">
            {modo === "entrar"
              ? "Entre com o e-mail e a senha da sua conta."
              : "Digite o e-mail da conta: mandamos um link para criar uma senha nova."}
          </p>

          {modo === "recuperar" && linkEnviadoPara ? (
            <div className="mt-8 rounded-2xl border border-dashed border-border p-4 text-[15px] text-foreground" role="status">
              Pronto: o link foi para <strong className="break-all">{linkEnviadoPara}</strong>. Abra o e-mail, crie a
              senha nova na página que abrir e volte aqui para entrar.
            </div>
          ) : (
            <form className="mt-8 space-y-4" onSubmit={modo === "entrar" ? entrar : recuperar} noValidate>
              <div className="space-y-1.5">
                <Label htmlFor="email">E-mail</Label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    inputMode="email"
                    autoComplete="username"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    placeholder="voce@empresa.com.br"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="h-12 pl-11 text-base"
                  />
                </div>
              </div>

              {modo === "entrar" && (
                <div className="space-y-1.5">
                  <Label htmlFor="senha">Senha</Label>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="senha"
                      type={verSenha ? "text" : "password"}
                      autoComplete="current-password"
                      value={senha}
                      onChange={(e) => setSenha(e.target.value)}
                      className="h-12 pl-11 pr-12 text-base"
                    />
                    <button
                      type="button"
                      onClick={() => setVerSenha((v) => !v)}
                      aria-label={verSenha ? "Esconder a senha" : "Mostrar a senha"}
                      className="absolute right-1.5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground active:bg-muted"
                    >
                      {verSenha ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
                    </button>
                  </div>
                </div>
              )}

              {erro && (
                <p className="text-sm font-medium text-destructive" role="alert">
                  {erro}
                </p>
              )}

              <Button type="submit" className="h-12 w-full text-base" disabled={enviando}>
                {enviando && <Loader2 className="h-4 w-4 animate-spin" />}
                {modo === "entrar" ? "Entrar" : "Enviar link"}
              </Button>
            </form>
          )}

          <button
            type="button"
            onClick={() => trocarModo(modo === "entrar" ? "recuperar" : "entrar")}
            className="mt-5 w-full py-2 text-center text-[15px] font-medium text-primary"
          >
            {modo === "entrar" ? "Esqueci minha senha" : "Voltar para o login"}
          </button>
        </div>
      </div>
      <p className="pb-[calc(1.5rem+env(safe-area-inset-bottom))] text-center text-xs text-muted-foreground">
        A conta é criada pelo site do Segunda Venda.
      </p>
    </div>
  );
}

/** As mensagens do Supabase vêm em inglês e técnicas: aqui viram português. */
function mensagemDeErro(error: { message?: string; status?: number } & object): string {
  if (isAuthRetryableFetchError(error) || /failed to fetch|network/i.test(error.message ?? "")) {
    return "Sem conexão com a internet. Confira e tente de novo.";
  }
  const m = error.message ?? "";
  if (/invalid login credentials/i.test(m)) return "E-mail ou senha incorretos.";
  if (/email not confirmed/i.test(m)) return "Confirme o seu e-mail antes de entrar: procure a mensagem do Segunda Venda na caixa de entrada.";
  if (/invalid email/i.test(m)) return "Digite um e-mail válido.";
  if (error.status === 429 || /rate limit|too many/i.test(m)) return "Muitas tentativas seguidas. Espere um minuto e tente de novo.";
  return "Não deu para continuar agora. Tente de novo em instantes.";
}
