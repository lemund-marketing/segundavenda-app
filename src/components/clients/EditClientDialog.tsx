import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { differenceInYears, parseISO } from "date-fns";
import { Info, Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useOptionalAuth } from "@/contexts/AuthContext";
import { formatDocument } from "@/utils/formatters";

/** Campos do cadastro que o diálogo devolve já aplicados, para quem guarda o cliente fora do react-query. */
export interface ClientSavedPatch {
  client: Record<string, any>;
  stageId?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  client: any;
  sellerId?: string;
  onSaved?: (patch: ClientSavedPatch) => void;
}

// O formulário do Segundo Pedido tem `number`, `neighborhood` e `notes`; nesta base as
// três colunas não existem. Número já vem embutido em `street` na maioria dos cadastros
// importados, e nota interna é opinião do seller sobre o cliente — `clients` é
// compartilhada entre sellers, então nota aqui vazaria para a outra loja. Nota per-seller
// já existe em `client_interactions` (bloco "Registrar interação", na aba Histórico).
const schema = z.object({
  full_name: z.string().trim().max(200).optional().nullable(),
  whatsapp: z.string().trim().max(30).optional().nullable(),
  // UM endereço só. `clients.email` é lido cru pelo disparo de e-mail, pelos filtros
  // de audiência e pelo export — só a Visão Geral faz split. Nenhum dos 8445 cadastros
  // do banco tem vírgula ou ponto-e-vírgula no campo, então a regra rígida não trava
  // cadastro nenhum e evita gravar um "a@b.com, c@d.com" que ninguém consegue enviar.
  email: z.string().trim().max(255).optional().nullable().refine(
    (v) => !v || /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(v),
    { message: "Informe um único e-mail válido" },
  ),
  birthdate: z.string().trim().optional().nullable().refine(
    (v) => !v || /^\d{4}-\d{2}-\d{2}$/.test(v),
    { message: "Data de nascimento inválida" },
  ),
  street: z.string().trim().max(200).optional().nullable(),
  complement: z.string().trim().max(120).optional().nullable(),
  city: z.string().trim().max(120).optional().nullable(),
  state_code: z.string().trim().max(4).optional().nullable(),
  zip_code: z.string().trim().max(15).optional().nullable(),
});

type FormState = Record<string, string>;

const VAZIO: FormState = {
  full_name: "", whatsapp: "", email: "", birthdate: "",
  street: "", complement: "", city: "", state_code: "", zip_code: "",
};

export function EditClientDialog({ open, onOpenChange, client, sellerId, onSaved }: Props) {
  const qc = useQueryClient();
  // `useOptionalAuth`: este diálogo é montado pelo ClientHeader, que roda também
  // dentro do embed (sem AuthProvider). Só serve para carimbar `created_by`.
  const user = useOptionalAuth()?.user ?? null;
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState>(VAZIO);
  const [stageId, setStageId] = useState<string>("");

  // O cadastro vem SEMPRE do banco, nunca do objeto recebido por prop.
  //
  // O painel do Omnichannel passa a linha que veio junto com a conversa
  // (`attachClientsToConversations` seleciona 11 colunas e NÃO traz street,
  // complement nem zip_code). Semear o formulário com esse objeto deixava os três
  // campos em branco e o "Salvar" gravava NULL neles — apagando o endereço de
  // 7855 dos 8445 cadastros, que ainda por cima é compartilhado entre as lojas.
  // Buscar aqui resolve para QUALQUER chamador, atual ou futuro.
  const { data: cadastro, isLoading: carregandoCadastro, isError: erroCadastro } = useQuery({
    queryKey: ["client-edit-row", client?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("*")
        .eq("id", client.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!client?.id && open,
    gcTime: 0,
  });

  const { data: stages = [] } = useQuery({
    // Mesma chave e mesmo shape do ChatHeader/ClientCRMPanel: no Omnichannel o
    // dropdown já está em cache e o diálogo abre sem nova ida ao banco.
    queryKey: ["pipeline-stages", sellerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pipeline_stages")
        .select("*")
        .eq("seller_id", sellerId!)
        .order("position");
      if (error) throw error;
      return data || [];
    },
    enabled: !!sellerId && open,
  });

  const { data: clientPipeline } = useQuery({
    queryKey: ["client-pipeline", client?.id, sellerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_pipeline")
        .select(`
          *,
          pipeline_stages!client_pipeline_stage_id_fkey (id, name, color, position)
        `)
        .eq("client_id", client.id)
        .eq("seller_id", sellerId!)
        .maybeSingle();
      if (error && error.code !== "PGRST116") throw error;
      return data;
    },
    enabled: !!sellerId && !!client?.id && open,
  });

  // Snapshot do que veio do banco: o save compara contra ele e só manda o que MUDOU.
  const originalRef = useRef<FormState>(VAZIO);
  // Guarda de "já semeei este cliente nesta abertura". Sem ela, cada refetch
  // (o cabeçalho da conversa invalida `client-detail` ao trocar a fase, por exemplo)
  // rodava o setForm de novo e apagava o que o usuário estava digitando.
  const semeadoRef = useRef<string | null>(null);

  useEffect(() => {
    if (!open) {
      semeadoRef.current = null;
      return;
    }
    if (!cadastro) return;
    const chave = String((cadastro as any).id);
    if (semeadoRef.current === chave) return;
    semeadoRef.current = chave;

    const c = cadastro as any;
    const inicial: FormState = {
      full_name: c.full_name ?? "",
      whatsapp: c.whatsapp ?? "",
      email: c.email ?? "",
      // `date` no Postgres volta como "YYYY-MM-DD", que é exatamente o que o
      // <input type="date"> espera — não passar por new Date() (viraria véspera em BRT).
      birthdate: c.birthdate ?? "",
      street: c.street ?? "",
      complement: c.complement ?? "",
      city: c.city ?? "",
      state_code: c.state_code ?? "",
      zip_code: c.zip_code ?? "",
    };
    originalRef.current = inicial;
    setForm(inicial);
  }, [open, cadastro]);

  useEffect(() => {
    if (open) setStageId((clientPipeline as any)?.stage_id ?? "");
  }, [(clientPipeline as any)?.stage_id, open]);

  const update = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const invalidar = (fase: boolean) => {
    // Prefixo: a chave real do detalhe termina com sellerId + flag de histórico.
    qc.invalidateQueries({ queryKey: ["client-detail", client?.id] });
    if (!sellerId) return;
    qc.invalidateQueries({ queryKey: ["client-pipeline", client?.id, sellerId] });
    if (fase) {
      qc.invalidateQueries({ queryKey: ["client-interactions", client?.id, sellerId] });
      qc.invalidateQueries({ queryKey: ["crm-metrics", sellerId] });
    }
    // O card do Kanban guarda `cached_client_name`, reescrito por trigger no update:
    // as colunas precisam recarregar mesmo quando só o nome mudou.
    qc.invalidateQueries({ queryKey: ["column-initial", sellerId] });
    qc.invalidateQueries({ queryKey: ["column-count", sellerId] });
  };

  const save = async () => {
    if (!client?.id || !cadastro) return;
    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      toast.error(parsed.error.errors[0]?.message ?? "Dados inválidos");
      return;
    }

    const original = originalRef.current;
    // Apagar o nome não é um "campo em branco" qualquer: o cliente passa a ser
    // "Sem nome" na lista de conversas, no Kanban e em todo lugar. Só bloqueia quem
    // TINHA nome — cadastro importado sem nome continua editável nos outros campos.
    if (original.full_name.trim() && !(parsed.data.full_name ?? "").trim()) {
      toast.error("O nome do cliente não pode ficar em branco");
      return;
    }

    setSaving(true);
    try {
      // Só o que MUDOU. Mandar o formulário inteiro faria o diálogo reescrever
      // colunas que ele nem exibe caso alguma delas não tenha chegado — e `clients`
      // é compartilhada entre os sellers que atendem a mesma pessoa.
      const payload: Record<string, any> = {};
      for (const [k, v] of Object.entries(parsed.data)) {
        const novo = (v ?? "") as string;
        if (novo === (original[k] ?? "")) continue;
        payload[k] = novo === "" ? null : novo;
      }

      // Nenhum trigger recalcula `age`. Sem isto, limpar o nascimento faria a idade
      // antiga reaparecer (ClientHeader e Visão Geral caem no fallback `client.age`),
      // e trocar o nascimento deixaria os dois números brigando na mesma tela.
      if ("birthdate" in payload) {
        payload.age = payload.birthdate
          ? differenceInYears(new Date(), parseISO(payload.birthdate))
          : null;
      }

      if (Object.keys(payload).length) {
        // RLS filtra por LINHA: um update barrado volta 200 com zero linhas e `error: null`.
        // Sem o .select() o diálogo diria "Cliente atualizado" para quem não pode editar.
        const { data: linhas, error } = await supabase
          .from("clients")
          .update(payload)
          .eq("id", client.id)
          .select("id");
        if (error) throw error;
        if (!linhas?.length) throw new Error("Você não tem permissão para editar este cliente.");
      }

      let stageMsg = "";
      const oldStageId: string | null = (clientPipeline as any)?.stage_id ?? null;
      if (sellerId && stageId && stageId !== oldStageId) {
        try {
          const oldStage = (clientPipeline as any)?.pipeline_stages;
          const newStage = (stages as any[]).find((s) => s.id === stageId);

          // Mesmo upsert do Kanban e do cabeçalho da conversa: `previous_stage_id` e
          // `moved_at` são o "veio de qual fase, quando" que as três telas mantêm.
          // (Não existe coluna `position` em client_pipeline nesta base.)
          const { error: pipeErr } = await supabase
            .from("client_pipeline")
            .upsert(
              {
                client_id: client.id,
                seller_id: sellerId,
                stage_id: stageId,
                previous_stage_id: oldStage?.id || oldStageId || null,
                moved_at: new Date().toISOString(),
              },
              { onConflict: "client_id,seller_id" },
            );
          if (pipeErr) throw pipeErr;

          if (user) {
            await supabase.from("client_interactions").insert({
              client_id: client.id,
              seller_id: sellerId,
              created_by: user.id,
              // `stage_changed` (com D): é o valor que o Kanban, o TemplatePerformance
              // e o nó de workflow já gravam. Um segundo nome para o mesmo evento
              // deixaria a aba Histórico e os filtros sem como agrupá-los.
              interaction_type: "stage_changed",
              content: `Movido de "${oldStage?.name || "Sem fase"}" para "${newStage?.name ?? "outra fase"}"`,
              metadata: { from_stage_id: oldStage?.id || oldStageId || null, to_stage_id: stageId },
            });
          }
          stageMsg = " — fase atualizada";
        } catch (stageErr: any) {
          toast.error("Dados salvos, mas falha ao atualizar a fase", {
            description: stageErr?.message,
          });
          invalidar(false);
          onSaved?.({ client: payload });
          onOpenChange(false);
          return;
        }
      }

      toast.success("Cliente atualizado" + stageMsg);
      invalidar(!!stageMsg);
      onSaved?.({ client: payload, stageId: stageMsg ? stageId : undefined });
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const doc = (cadastro as any)?.document ?? client?.document ?? "";
  const tipoDoc = (cadastro as any)?.document_type ?? client?.document_type;
  const rotuloDocumento = tipoDoc ? String(tipoDoc).toUpperCase() : "CPF/CNPJ";

  if (open && (carregandoCadastro || erroCadastro || !cadastro)) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar cliente</DialogTitle>
            <DialogDescription>Atualize os dados deste cliente.</DialogDescription>
          </DialogHeader>
          {/* Enquanto o cadastro completo não chega, NÃO existe formulário: um campo
              vazio aqui viraria NULL no banco. */}
          <div className="py-10 flex flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
            {carregandoCadastro ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Carregando cadastro…
              </>
            ) : (
              <p className="text-center px-6 leading-relaxed">
                Não foi possível carregar o cadastro deste cliente. Feche e tente de novo.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!saving) onOpenChange(v); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar cliente</DialogTitle>
          <DialogDescription>Atualize os dados deste cliente.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="flex gap-2 rounded-md bg-muted/60 px-3 py-2.5 text-[11px] leading-relaxed text-muted-foreground">
            <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <p>
              O cadastro é da <strong className="font-semibold text-foreground">pessoa</strong>, não da loja:
              se este cliente também for atendido por outra loja, a alteração vale para as duas.
              A <strong className="font-semibold text-foreground">fase do CRM</strong> é só desta loja.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ec-nome">Nome completo</Label>
            <Input id="ec-nome" value={form.full_name} onChange={(e) => update("full_name", e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ec-whats">WhatsApp</Label>
              <Input id="ec-whats" value={form.whatsapp} onChange={(e) => update("whatsapp", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ec-email">Email</Label>
              <Input id="ec-email" type="email" value={form.email} onChange={(e) => update("email", e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ec-nasc">Nascimento</Label>
              <Input id="ec-nasc" type="date" value={form.birthdate} onChange={(e) => update("birthdate", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              {/* Rótulo dinâmico: 207 cadastros têm document_type='whatsapp' e o número
                  sairia rotulado como se fosse CPF. O VALOR sai por formatDocument, que
                  só mascara quando o conteúdo é mesmo um CPF/CNPJ (a maioria dos
                  cadastros da base guarda um identificador de importação). */}
              <Label htmlFor="ec-doc">{rotuloDocumento}</Label>
              <Input
                id="ec-doc"
                value={doc ? formatDocument(doc) : ""}
                disabled
                title="O documento identifica o cadastro e não é editável por aqui."
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ec-rua">Rua</Label>
            <Input
              id="ec-rua"
              value={form.street}
              onChange={(e) => update("street", e.target.value)}
              placeholder="Rua e número"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ec-compl">Complemento</Label>
              <Input id="ec-compl" value={form.complement} onChange={(e) => update("complement", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ec-cep">CEP</Label>
              <Input id="ec-cep" value={form.zip_code} onChange={(e) => update("zip_code", e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="ec-cidade">Cidade</Label>
              <Input id="ec-cidade" value={form.city} onChange={(e) => update("city", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ec-uf">UF</Label>
              <Input
                id="ec-uf"
                value={form.state_code}
                onChange={(e) => update("state_code", e.target.value.toUpperCase())}
                maxLength={2}
              />
            </div>
          </div>

          {sellerId && (
            <div className="space-y-1.5">
              <Label>Fase do CRM</Label>
              <Select value={stageId} onValueChange={setStageId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma fase" />
                </SelectTrigger>
                <SelectContent>
                  {(stages as any[]).map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      <span className="inline-flex items-center gap-2">
                        <span
                          className="inline-block h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: s.color || "#94a3b8" }}
                        />
                        {s.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {saving ? "Salvando…" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default EditClientDialog;
