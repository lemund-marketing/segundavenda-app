import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { UserPlus, Trash2, Crown, KeyRound, AlertTriangle, SlidersHorizontal, Eye, Pencil, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
// app: o botão de adicionar abre o site (ver o cabeçalho da lista de membros).
import { ExternalLink } from "lucide-react";
import { noSite } from "@/app/site";

/**
 * Aba Membros — modelo de PERMISSÃO POR ÁREA (06/08/2026).
 *
 * Saíram os papéis Gerente/Visualizador: agora o owner abre um sheet e marca,
 * aba por aba, se o membro não vê (Oculto), só vê (Ver) ou pode editar (Editar).
 * O backend guarda isso em member_permissions; a sidebar e a guarda de rota
 * escondem o que estiver Oculto.
 */

// 29/10/2026: o limite deixou de ser fixo — vem de sellers.max_members (o admin
// da plataforma aumenta por seller; o owner só vê). Este padrão vale enquanto a
// leitura carrega ou se ela falhar; quem barra de verdade é a edge
// invite-seller-member, que lê a mesma coluna.
const LIMITE_PADRAO = 5;

/** Ordem e rótulos espelham o menu. "Minha Conta" fica de fora — é sempre acessível. */
const AREAS = [
  { key: "dashboard", label: "Dashboard" },
  { key: "regioes", label: "Regiões" },
  { key: "pedidos", label: "Pedidos" },
  { key: "omnichannel", label: "WhatsApp" },
  { key: "clientes", label: "Clientes" },
  { key: "crm", label: "Kanban CRM" },
  { key: "rfv", label: "Análise RFV" },
  { key: "workflows", label: "Automações" },
  { key: "workflow_stats", label: "Performance" },
  { key: "lojas", label: "Marketplaces" },
  { key: "produtos", label: "Produtos" },
] as const;

type AreaKey = (typeof AREAS)[number]["key"];
type Nivel = "oculto" | "ver" | "editar";
type Matriz = Record<AreaKey, Nivel>;

const MATRIZ_ZERADA: Matriz = Object.fromEntries(AREAS.map((a) => [a.key, "oculto"])) as Matriz;

interface Member {
  id: string;
  seller_id: string;
  profile_id: string | null;
  role: string;
  email: string | null;
  full_name: string | null;
  created_at: string;
  login_criado_aqui: boolean | null;
}

/** Converte a matriz da UI no payload do banco: Oculto vira ausência de linha. */
const matrizParaPayload = (m: Matriz) =>
  AREAS.filter((a) => m[a.key] !== "oculto").map((a) => ({ area: a.key, access_level: m[a.key] }));

const MAX_TEXTO_CRU = 300;
async function mensagemRealDoErro(error: unknown): Promise<string> {
  const ctx = (error as { context?: Response })?.context;
  if (ctx && typeof (ctx as { text?: unknown }).text === "function") {
    try {
      const resposta = typeof ctx.clone === "function" ? ctx.clone() : ctx;
      const cru = (await resposta.text()).trim();
      if (cru) {
        try {
          const corpo = JSON.parse(cru) as Record<string, unknown> | null;
          const achado = corpo?.error ?? corpo?.message ?? corpo?.msg;
          if (achado) return String(achado);
        } catch {
          // não era JSON
        }
        return cru.length > MAX_TEXTO_CRU ? `${cru.slice(0, MAX_TEXTO_CRU)}…` : cru;
      }
    } catch {
      // corpo já consumido
    }
  }
  if (error instanceof Error && error.message) return error.message;
  return "Falha inesperada ao falar com o servidor.";
}

async function chamarFunction<T>(nome: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(nome, { body });
  if (error) throw new Error(await mensagemRealDoErro(error));
  if (data && typeof data === "object" && "error" in data && (data as { error?: unknown }).error) {
    throw new Error(String((data as { error: unknown }).error));
  }
  return data as T;
}

/** RPC não-tipada (as funções novas não estão nos types gerados). */
const rpc = (fn: string, args: Record<string, unknown>) =>
  (supabase as unknown as {
    rpc: (f: string, a: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
  }).rpc(fn, args);

const NIVEIS: { v: Nivel; label: string; icon: typeof Eye }[] = [
  { v: "oculto", label: "Oculto", icon: EyeOff },
  { v: "ver", label: "Ver", icon: Eye },
  { v: "editar", label: "Editar", icon: Pencil },
];

/** Segmento de 3 estados de uma área. */
function SeletorNivel({ valor, onChange }: { valor: Nivel; onChange: (n: Nivel) => void }) {
  return (
    <div className="flex items-center gap-0.5 rounded-lg bg-muted p-0.5">
      {NIVEIS.map(({ v, label, icon: Icon }) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          className={cn(
            "inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors",
            valor === v
              ? v === "editar"
                ? "bg-primary text-primary-foreground"
                : "bg-foreground text-background"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Icon className="h-3 w-3" />
          {label}
        </button>
      ))}
    </div>
  );
}

interface MembersTabProps {
  sellerId: string | null | undefined;
}

export function MembersTab({ sellerId }: MembersTabProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Sheet: 'novo' cria membro; 'editar' mexe nas permissões de quem já existe.
  const [sheetAberto, setSheetAberto] = useState(false);
  const [modo, setModo] = useState<"novo" | "editar">("novo");
  const [membroEditando, setMembroEditando] = useState<Member | null>(null);
  const [novoEmail, setNovoEmail] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [matriz, setMatriz] = useState<Matriz>(MATRIZ_ZERADA);

  const [membroDaSenha, setMembroDaSenha] = useState<Member | null>(null);
  const [senhaTrocada, setSenhaTrocada] = useState("");

  const { data: members = [], isLoading } = useQuery<Member[]>({
    queryKey: ["seller-members", sellerId],
    queryFn: async () => {
      if (!sellerId) return [];
      const { data, error } = await rpc("list_seller_members", { p_seller_id: sellerId });
      if (error) throw new Error(error.message);
      return ((data ?? []) as Member[]).slice().sort((a, b) => (a.created_at ?? "").localeCompare(b.created_at ?? ""));
    },
    enabled: !!sellerId,
  });

  // Contagem de áreas liberadas por membro, para o resumo da linha.
  const { data: permCounts = {} } = useQuery<Record<string, number>>({
    queryKey: ["member-permissions-counts", sellerId],
    queryFn: async () => {
      if (!sellerId) return {};
      const { data, error } = await (supabase as unknown as {
        from: (t: string) => {
          select: (c: string) => { eq: (k: string, v: string) => Promise<{ data: { member_id: string }[] | null; error: unknown }> };
        };
      })
        .from("member_permissions")
        .select("member_id")
        .eq("seller_id", sellerId);
      if (error) return {};
      const out: Record<string, number> = {};
      for (const row of data ?? []) out[row.member_id] = (out[row.member_id] ?? 0) + 1;
      return out;
    },
    enabled: !!sellerId,
  });

  // Limite de membros da conta. Membro/owner tem SELECT no próprio seller (RLS
  // "Members can view their sellers"). A chave é a MESMA do LimiteMembrosControl
  // do admin, para o Salvar de lá invalidar esta. O cast é porque a coluna é
  // nova e o types.ts gerado ainda não a conhece.
  const { data: limiteMembros = LIMITE_PADRAO } = useQuery<number>({
    queryKey: ["seller-max-members", sellerId],
    queryFn: async () => {
      if (!sellerId) return LIMITE_PADRAO;
      const { data, error } = await supabase
        .from("sellers")
        .select("max_members")
        .eq("id", sellerId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      const n = Number((data as unknown as { max_members?: unknown } | null)?.max_members);
      return Number.isInteger(n) && n >= 1 ? n : LIMITE_PADRAO;
    },
    enabled: !!sellerId,
  });

  const membroAtual = members.find((m) => m.profile_id === user?.id);
  const isOwner = membroAtual?.role === "owner";

  const invalidar = () => {
    queryClient.invalidateQueries({ queryKey: ["seller-members", sellerId] });
    queryClient.invalidateQueries({ queryKey: ["member-permissions-counts", sellerId] });
  };
  const erroToast = (err: Error) => toast({ title: err.message, variant: "destructive" });

  const abrirNovo = () => {
    setModo("novo");
    setMembroEditando(null);
    setNovoEmail("");
    setNovaSenha("");
    setMatriz(MATRIZ_ZERADA);
    setSheetAberto(true);
  };

  const abrirEditar = async (m: Member) => {
    setModo("editar");
    setMembroEditando(m);
    setMatriz(MATRIZ_ZERADA);
    setSheetAberto(true);
    // Carrega as permissões atuais do membro.
    const { data } = await rpc("member_permissions_of", { _seller_id: sellerId, _member_id: m.id });
    const linhas = (data ?? []) as { area: string; access_level: string }[];
    setMatriz((prev) => {
      const nova = { ...MATRIZ_ZERADA, ...prev };
      for (const l of linhas) {
        if (l.area in nova) nova[l.area as AreaKey] = l.access_level as Nivel;
      }
      return nova;
    });
  };

  const criarMutation = useMutation({
    mutationFn: (v: { email: string; password: string; permissions: { area: string; access_level: string }[] }) =>
      chamarFunction<{ message?: string }>("invite-seller-member", { seller_id: sellerId, ...v }),
    onSuccess: (data) => {
      toast({ title: data?.message ?? "Membro adicionado com sucesso!" });
      setSheetAberto(false);
      invalidar();
    },
    onError: erroToast,
  });

  const salvarPermsMutation = useMutation({
    mutationFn: async (v: { memberId: string; permissions: { area: string; access_level: string }[] }) => {
      const { error } = await rpc("set_member_permissions", {
        _seller_id: sellerId,
        _member_id: v.memberId,
        _permissions: v.permissions,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast({ title: "Permissões atualizadas!" });
      setSheetAberto(false);
      invalidar();
    },
    onError: erroToast,
  });

  const trocarSenhaMutation = useMutation({
    mutationFn: (v: { member_id: string; new_password: string }) =>
      chamarFunction<{ message?: string }>("update-member-password", { seller_id: sellerId, ...v }),
    onSuccess: (data) => {
      toast({ title: data?.message ?? "Senha atualizada com sucesso." });
      setMembroDaSenha(null);
      setSenhaTrocada("");
    },
    onError: erroToast,
  });

  const removerMutation = useMutation({
    // As permissões somem junto por ON DELETE CASCADE.
    mutationFn: async (memberId: string) => {
      const { error } = await supabase.from("seller_members").delete().eq("id", memberId).eq("seller_id", sellerId!);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Membro removido com sucesso!" });
      invalidar();
    },
    onError: (err: Error) => toast({ title: "Erro ao remover membro: " + err.message, variant: "destructive" }),
  });

  const nomeDoMembro = (m: Member) => m.full_name || m.email || "Usuário sem nome";
  const senhaCurta = novaSenha.length > 0 && novaSenha.length < 8;
  const senhaTrocadaCurta = senhaTrocada.length > 0 && senhaTrocada.length < 8;
  const nLiberadas = useMemo(() => matrizParaPayload(matriz).length, [matriz]);

  const setArea = (area: AreaKey, nivel: Nivel) => setMatriz((m) => ({ ...m, [area]: nivel }));
  const aplicarEmTodas = (nivel: Nivel) =>
    setMatriz(Object.fromEntries(AREAS.map((a) => [a.key, nivel])) as Matriz);

  const salvarSheet = () => {
    const permissions = matrizParaPayload(matriz);
    if (modo === "novo") {
      if (!novoEmail || novaSenha.length < 8) return;
      criarMutation.mutate({ email: novoEmail, password: novaSenha, permissions });
    } else if (membroEditando) {
      salvarPermsMutation.mutate({ memberId: membroEditando.id, permissions });
    }
  };

  const salvando = criarMutation.isPending || salvarPermsMutation.isPending;

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-foreground">Membros ativos</span>
            <span className="text-sm text-muted-foreground">{members.length} de {limiteMembros}</span>
          </div>
          <div className="w-full rounded-full h-2 bg-muted">
            <div
              className="h-2 rounded-full bg-primary transition-all"
              style={{ width: `${Math.min((members.length / limiteMembros) * 100, 100)}%` }}
            />
          </div>
          {members.length >= limiteMembros && (
            <p className="text-xs mt-2 flex items-center gap-1 text-destructive">
              <AlertTriangle className="w-3 h-3 shrink-0" />
              {/* 29/10/2026: o admin pode baixar o limite abaixo do que a conta
                  já tem (ninguém é removido). Acima do limite, tirar um só não
                  libera o botão — por isso diz quantos é preciso remover. */}
              {members.length > limiteMembros
                ? `A conta tem ${members.length} usuários e o limite é ${limiteMembros}: remova ${members.length - limiteMembros + 1} para adicionar um novo.`
                : "Limite atingido. Remova um membro para adicionar novos."}{" "}
              Para aumentar o limite, fale com o suporte da Segunda Venda.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between space-y-0 pb-4">
          <div>
            <CardTitle>Membros</CardTitle>
            <CardDescription>
              {isOwner
                ? "Cada membro vê e edita só as áreas que você liberar"
                : "Pessoas com acesso a esta conta. Somente o owner altera membros."}
            </CardDescription>
          </div>
          {/* app: adicionar membro cria um login (cadastro), e a Play exige que app
              que cria conta ofereça a exclusão dela: no app, adicionar abre o site. */}
          {isOwner && (members.length >= limiteMembros ? (
            <Button size="sm" disabled>
              <UserPlus className="w-4 h-4 mr-2" />
              Adicionar Membro
            </Button>
          ) : (
            <Button size="sm" asChild>
              <a href={noSite("/account?tab=membros")} target="_blank" rel="noopener noreferrer">
                <UserPlus className="w-4 h-4 mr-2" />
                Adicionar Membro
                <ExternalLink className="w-3.5 h-3.5 ml-1.5" />
              </a>
            </Button>
          ))}
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2].map((i) => <div key={i} className="h-16 rounded-lg animate-pulse bg-muted" />)}
            </div>
          ) : (
            <div className="space-y-3">
              {members.map((member) => {
                const souEu = member.profile_id === user?.id;
                const ehOwner = member.role === "owner";
                const podeMexer = isOwner && !souEu && !ehOwner;
                const podeTrocarSenha = podeMexer && member.login_criado_aqui === true;
                const areas = permCounts[member.id] ?? 0;
                return (
                  <div
                    key={member.id}
                    className="flex flex-col items-start gap-3 p-4 rounded-lg border border-border bg-card sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 bg-muted">
                        <span className="text-sm font-semibold text-primary">
                          {nomeDoMembro(member).charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm truncate text-foreground">{nomeDoMembro(member)}</span>
                          {souEu && <Badge variant="outline" className="text-xs shrink-0">Você</Badge>}
                          {ehOwner && (
                            <Badge className="text-xs gap-1 border bg-primary text-primary-foreground border-primary">
                              <Crown className="w-3 h-3" />Owner
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs truncate text-muted-foreground">{member.email || "—"}</p>
                        {!ehOwner && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {areas === 0
                              ? "Nenhuma área liberada"
                              : `${areas} ${areas === 1 ? "área liberada" : "áreas liberadas"}`}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {podeMexer && (
                        <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => abrirEditar(member)}>
                          <SlidersHorizontal className="w-3.5 h-3.5" />
                          Permissões
                        </Button>
                      )}
                      {podeTrocarSenha && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-9 w-9 sm:h-7 sm:w-7 p-0 text-muted-foreground"
                          title="Trocar senha"
                          onClick={() => { setMembroDaSenha(member); setSenhaTrocada(""); }}
                        >
                          <KeyRound className="w-4 h-4" />
                        </Button>
                      )}
                      {podeMexer && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-9 w-9 sm:h-7 sm:w-7 p-0 text-muted-foreground" title="Remover membro">
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Remover membro?</AlertDialogTitle>
                              <AlertDialogDescription>
                                <strong>{nomeDoMembro(member)}</strong> perderá o acesso a esta conta imediatamente.
                                A conta de login dele continua existindo.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction onClick={() => removerMutation.mutate(member.id)}>Remover</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ---- Sheet: adicionar / editar permissões ---- */}
      <Sheet open={sheetAberto} onOpenChange={setSheetAberto}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader className="text-left">
            <SheetTitle>{modo === "novo" ? "Adicionar Membro" : `Permissões de ${membroEditando ? nomeDoMembro(membroEditando) : ""}`}</SheetTitle>
            <SheetDescription>
              {modo === "novo"
                ? "Defina o acesso e escolha, aba por aba, o que a pessoa vê e o que pode editar."
                : "Escolha, aba por aba, o que este membro vê e o que pode editar."}
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-5 pt-5">
            {modo === "novo" && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="mb-email">E-mail</Label>
                  <Input id="mb-email" type="email" placeholder="pessoa@empresa.com" value={novoEmail} onChange={(e) => setNovoEmail(e.target.value)} />
                  <p className="text-[11px] text-muted-foreground">
                    Se o e-mail já tiver conta, ele é apenas vinculado e mantém a senha atual.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="mb-senha">Senha</Label>
                  <Input id="mb-senha" type="password" placeholder="Mínimo 8 caracteres" value={novaSenha} onChange={(e) => setNovaSenha(e.target.value)} />
                  {senhaCurta && <p className="text-xs text-destructive">A senha deve ter pelo menos 8 caracteres.</p>}
                </div>
              </>
            )}

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Acesso por área</Label>
                <div className="flex items-center gap-1 text-[11px]">
                  <button type="button" onClick={() => aplicarEmTodas("oculto")} className="rounded px-2 py-1 text-muted-foreground hover:bg-muted">Ocultar tudo</button>
                  <button type="button" onClick={() => aplicarEmTodas("ver")} className="rounded px-2 py-1 text-muted-foreground hover:bg-muted">Ver tudo</button>
                  <button type="button" onClick={() => aplicarEmTodas("editar")} className="rounded px-2 py-1 text-muted-foreground hover:bg-muted">Editar tudo</button>
                </div>
              </div>

              <div className="rounded-lg border border-border divide-y divide-border">
                {AREAS.map((a) => (
                  <div key={a.key} className="flex items-center justify-between gap-3 px-3 py-2.5">
                    <span className="text-sm text-foreground">{a.label}</span>
                    <SeletorNivel valor={matriz[a.key]} onChange={(n) => setArea(a.key, n)} />
                  </div>
                ))}
              </div>

              <p className="text-[11px] text-muted-foreground">
                {nLiberadas === 0
                  ? "Nenhuma área liberada — o membro entra e vê apenas a própria conta."
                  : `${nLiberadas} ${nLiberadas === 1 ? "área liberada" : "áreas liberadas"}. "Minha Conta" está sempre disponível.`}
              </p>
            </div>

            <Button
              className="w-full"
              disabled={salvando || (modo === "novo" && (!novoEmail || novaSenha.length < 8))}
              onClick={salvarSheet}
            >
              {salvando ? "Salvando..." : modo === "novo" ? "Adicionar Membro" : "Salvar permissões"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* ---- Trocar senha ---- */}
      <Dialog open={!!membroDaSenha} onOpenChange={(aberto) => { if (!aberto) { setMembroDaSenha(null); setSenhaTrocada(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Trocar senha</DialogTitle>
            <DialogDescription>
              Defina uma nova senha para <strong>{membroDaSenha ? nomeDoMembro(membroDaSenha) : ""}</strong>. Vale imediatamente — avise a pessoa.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label htmlFor="mb-nova-senha">Nova senha</Label>
              <Input id="mb-nova-senha" type="password" placeholder="Mínimo 8 caracteres" value={senhaTrocada} onChange={(e) => setSenhaTrocada(e.target.value)} />
              {senhaTrocadaCurta && <p className="text-xs text-destructive">A senha deve ter pelo menos 8 caracteres.</p>}
            </div>
            <Button
              className="w-full"
              disabled={senhaTrocada.length < 8 || trocarSenhaMutation.isPending || !membroDaSenha}
              onClick={() => membroDaSenha && trocarSenhaMutation.mutate({ member_id: membroDaSenha.id, new_password: senhaTrocada })}
            >
              {trocarSenhaMutation.isPending ? "Salvando..." : "Salvar nova senha"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
