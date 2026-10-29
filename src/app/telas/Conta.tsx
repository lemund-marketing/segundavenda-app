import { useEffect, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { AlertTriangle, ExternalLink, LifeBuoy, Mail, MessageSquare, User as UserIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { useSellerContext } from "@/contexts/SellerContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { MembersTab } from "@/components/account/MembersTab";
import FormSkeleton from "@/components/skeletons/FormSkeleton";
import WhatsAppIcon from "@/components/WhatsAppIcon";
import { Aviso, Bolinha, CabecalhoTela, Pilulas, Secao, type Icone } from "@/components/mobile/blocos";
import { getInitials } from "@/components/clients/sections/shared";
import { LayoutApp } from "@/app/LayoutApp";
import { noSite } from "@/app/site";

/**
 * Minha Conta, no desenho de celular do site (Account): quem está logado, as
 * abas em pílulas na mesma ?tab= e, no Perfil, os dados cadastrais.
 *
 * Plano e Número virtual não entram: um é assinatura e o outro é contratação
 * de linha paga, e a Play não aceita app que leve para compra fora dela. Sem
 * link para eles, nem o selo do plano no cartão de cima. WhatsApp (o login da
 * Meta não abre dentro do app) e os modelos de e-mail e SMS (editores feitos
 * para o computador) ficam como abas que abrem a mesma aba no site.
 */
const ABAS = [
  { value: "perfil", label: "Perfil" },
  { value: "membros", label: "Membros" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "email", label: "Email" },
  { value: "sms", label: "SMS" },
];

const ABAS_NO_SITE: Record<string, { icone: Icone; titulo: string; texto: string }> = {
  whatsapp: {
    icone: WhatsAppIcon,
    titulo: "O WhatsApp se conecta pelo site",
    texto: "Conectar ou trocar o número usa o login da Meta, que não funciona dentro do app.",
  },
  email: {
    icone: Mail,
    titulo: "Os modelos de e-mail ficam no site",
    texto: "O editor dos modelos e o consumo do canal abrem no navegador do celular.",
  },
  sms: {
    icone: MessageSquare,
    titulo: "Os modelos de SMS ficam no site",
    texto: "O editor dos modelos e o consumo do canal abrem no navegador do celular.",
  },
};

interface Perfil {
  full_name: string;
  email: string;
  company_name: string;
  cnpj: string;
  whatsapp: string;
}

type ErroDoBanco = { message?: string; code?: string; status?: number; details?: string; hint?: string };

const CAMPO = "h-11 rounded-xl text-[15px]";

export default function Conta() {
  const [searchParams, setSearchParams] = useSearchParams();
  // Link antigo para uma aba que o app não tem (?tab=plano) cai no Perfil.
  const abaAtiva = ABAS.find((a) => a.value === searchParams.get("tab"))?.value ?? "perfil";
  const trocarAba = (v: string) => {
    const p = new URLSearchParams(searchParams);
    p.set("tab", v);
    setSearchParams(p, { replace: true });
  };
  const { activeSeller } = useSellerContext();
  const sellerId = activeSeller?.id;
  const { user } = useAuth();
  const { toast } = useToast();
  const [salvando, setSalvando] = useState(false);
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [erroAoCarregar, setErroAoCarregar] = useState(false);
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    if (!user) return;
    setErroAoCarregar(false);
    void (async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("full_name, email, company_name, cnpj, whatsapp")
        .eq("id", user.id)
        .single();
      if (error) {
        toast({ title: "Erro ao carregar perfil", description: error.message, variant: "destructive" });
        setErroAoCarregar(true);
        return;
      }
      setPerfil(data);
    })();
    // user?.id e não user: o TOKEN_REFRESHED troca o objeto e refaria a busca.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, tentativa]);

  const salvarPerfil = async () => {
    if (!user || !perfil) return;
    try {
      setSalvando(true);
      const { data: sessao, error: erroSessao } = await supabase.auth.getSession();
      if (erroSessao || !sessao.session) {
        throw erroSessao || new Error("Sessão expirada. Faça login novamente antes de salvar.");
      }
      const { data, error } = await supabase
        .from("profiles")
        .update({
          full_name: perfil.full_name,
          company_name: perfil.company_name,
          cnpj: perfil.cnpj,
          whatsapp: perfil.whatsapp,
        })
        .eq("id", user.id)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        throw new Error("Nenhuma linha foi atualizada. Sua sessão pode não ter permissão para editar este perfil.");
      }
      toast({ title: "Perfil atualizado", description: "Suas informações foram atualizadas com sucesso!" });
    } catch (e) {
      const erro = (e ?? {}) as ErroDoBanco;
      const partes = [
        erro.message,
        erro.code ? `Código: ${erro.code}` : null,
        erro.status ? `Status: ${erro.status}` : null,
        erro.details ? `Detalhes: ${erro.details}` : null,
        erro.hint ? `Dica: ${erro.hint}` : null,
      ].filter(Boolean);
      toast({
        title: "Erro ao atualizar perfil",
        description:
          partes.length > 0
            ? partes.join(" | ")
            : "A atualização falhou antes de retornar detalhes. Feche e abra o app, entre de novo e tente outra vez.",
        variant: "destructive",
      });
    } finally {
      setSalvando(false);
    }
  };

  // No site o esqueleto fica até recarregar a página; no app não há o que
  // recarregar, e sem internet a tela ficaria presa nele.
  if (!perfil && erroAoCarregar) {
    return (
      <LayoutApp>
        <div className="px-4 pb-6 pt-4">
          <div className="flex flex-col items-center gap-3 rounded-3xl border border-border/60 bg-card px-6 py-8 text-center">
            <AlertTriangle className="h-6 w-6 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">Não foi possível carregar o seu perfil.</p>
            <Button variant="outline" size="sm" className="rounded-full" onClick={() => setTentativa((n) => n + 1)}>
              Tentar de novo
            </Button>
          </div>
        </div>
      </LayoutApp>
    );
  }

  if (!perfil) {
    return (
      <LayoutApp>
        <FormSkeleton sections={1} fieldsPerSection={4} />
      </LayoutApp>
    );
  }

  const noSiteDaAba = ABAS_NO_SITE[abaAtiva];

  return (
    <LayoutApp>
      <div className="flex flex-col gap-5 px-4 pb-6 pt-4">
        <div className="flex flex-col gap-3">
          <CabecalhoTela icone={UserIcon} titulo="Minha Conta" />
          <div className="flex items-center gap-3 rounded-3xl border border-border/60 bg-card p-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[15px] font-bold text-primary">
              {getInitials(perfil.full_name || perfil.email || "?")}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[17px] font-bold text-foreground">{perfil.full_name || "Sem nome"}</p>
              <p className="truncate text-[13px] text-muted-foreground">{perfil.email}</p>
              {perfil.company_name && <p className="truncate text-[13px] text-muted-foreground">{perfil.company_name}</p>}
            </div>
          </div>
          <div className="-mx-4 border-t border-border/60 px-4 pt-3">
            <Pilulas rotulo="Aba" opcoes={ABAS} valor={abaAtiva} onChange={trocarAba} />
          </div>
        </div>

        <div className="mt-4 space-y-4">
          {abaAtiva === "perfil" && (
            <div className="flex flex-col gap-7">
              <Secao titulo="Dados cadastrais" semLista>
                <div className="flex flex-col gap-4 p-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="m_full_name">Nome completo</Label>
                    <Input
                      id="m_full_name"
                      className={CAMPO}
                      value={perfil.full_name || ""}
                      onChange={(e) => setPerfil({ ...perfil, full_name: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="m_email">Email</Label>
                    <Input id="m_email" className={CAMPO} value={perfil.email} disabled />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="m_company_name">Nome da empresa</Label>
                    <Input
                      id="m_company_name"
                      className={CAMPO}
                      value={perfil.company_name || ""}
                      onChange={(e) => setPerfil({ ...perfil, company_name: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="m_cnpj">CNPJ</Label>
                    <Input
                      id="m_cnpj"
                      className={CAMPO}
                      inputMode="numeric"
                      value={perfil.cnpj || ""}
                      onChange={(e) => setPerfil({ ...perfil, cnpj: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="m_whatsapp">Número de contato</Label>
                    <Input
                      id="m_whatsapp"
                      className={CAMPO}
                      inputMode="tel"
                      value={perfil.whatsapp || ""}
                      onChange={(e) => setPerfil({ ...perfil, whatsapp: e.target.value })}
                    />
                  </div>
                  <Button onClick={salvarPerfil} disabled={salvando} className="h-11 w-full rounded-full">
                    {salvando ? "Salvando..." : "Salvar alterações"}
                  </Button>
                </div>
              </Secao>

              {/* Sem o Programa de Afiliados do site: Afiliados fica fora do app
                  (SO_NO_SITE), e a entrada de quem não é afiliado é um cadastro. */}
              <Secao titulo="Atalhos">
                <LinhaNoSite
                  caminho="/ajuda"
                  icone={<Bolinha neutra><LifeBuoy className="h-5 w-5" strokeWidth={2} /></Bolinha>}
                  titulo="Central de Ajuda"
                  apoio="Dúvidas e tutoriais"
                />
              </Secao>
            </div>
          )}

          {abaAtiva === "membros" && <MembersTab sellerId={sellerId} />}

          {noSiteDaAba && (
            <Aviso tom="neutro" icone={noSiteDaAba.icone} titulo={noSiteDaAba.titulo}>
              {noSiteDaAba.texto}
              <a
                href={noSite(`/account?tab=${abaAtiva}`)}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 flex h-8 w-fit items-center gap-1.5 rounded-full bg-card px-3.5 text-[13px] font-medium text-foreground ring-1 ring-inset ring-border active:opacity-80"
              >
                Abrir no site
                <ExternalLink className="h-3.5 w-3.5" strokeWidth={2.25} />
              </a>
            </Aviso>
          )}
        </div>
      </div>
    </LayoutApp>
  );
}

/** A Linha das seções, para página do site: abre no navegador do celular. */
function LinhaNoSite({
  caminho,
  icone,
  titulo,
  apoio,
}: {
  caminho: string;
  icone: ReactNode;
  titulo: string;
  apoio?: string;
}) {
  return (
    <li>
      <a
        href={noSite(caminho)}
        target="_blank"
        rel="noopener noreferrer"
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors active:bg-muted"
      >
        {icone}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-medium text-foreground">{titulo}</p>
          {apoio && <p className="truncate text-[13px] text-muted-foreground">{apoio}</p>}
        </div>
        <ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground" aria-label="abre no site" />
      </a>
    </li>
  );
}
