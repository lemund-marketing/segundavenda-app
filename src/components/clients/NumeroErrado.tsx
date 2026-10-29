import { useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { PhoneOff, Undo2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { formatPhoneDisplay } from "@/utils/formatters";
import {
  ESCOPO_NUMERO_ERRADO,
  FONTE_NUMERO_ERRADO,
  useDesfazerNumeroErrado,
  type NumeroErrado,
} from "@/hooks/useNumeroErrado";

/** "de Fulana" / "deste cliente": o nome pode faltar (ficha sem nome). */
const deQuem = (nome: string | null) => (nome ? `de ${nome}` : "deste cliente");

const quando = (iso: string, padrao: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : format(d, padrao, { locale: ptBR });
};

/** O que a pessoa respondeu, entre aspas; resposta vazia vira o rótulo da IA. */
const respostaLegivel = (m: NumeroErrado) => {
  const r = (m.resposta ?? "").trim();
  if (r) return `“${r}”`;
  return m.classificacao ? `(sem texto — classificado como “${m.classificacao}”)` : "(sem texto)";
};

/** Linhas de detalhe usadas no popover da etiqueta e no aviso do chat. */
function DetalhesMarca({ marca }: { marca: NumeroErrado }) {
  return (
    <dl className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1.5 text-[12px]">
      <dt className="text-muted-foreground">Desde</dt>
      <dd className="font-medium tabular-nums">{quando(marca.criado_em, "dd/MM/yyyy 'às' HH:mm")}</dd>
      <dt className="text-muted-foreground">Telefone</dt>
      <dd className="font-medium tabular-nums">{formatPhoneDisplay(marca.telefone)}</dd>
      <dt className="text-muted-foreground">Respondeu</dt>
      <dd className="font-medium break-words line-clamp-4">{respostaLegivel(marca)}</dd>
      <dt className="text-muted-foreground">Como</dt>
      <dd className="font-medium">{FONTE_NUMERO_ERRADO[marca.fonte]?.longo ?? marca.fonte}</dd>
      <dt className="text-muted-foreground">Vale para</dt>
      <dd className="font-medium">{ESCOPO_NUMERO_ERRADO[marca.escopo] ?? marca.escopo}</dd>
    </dl>
  );
}

/**
 * Confirmação do "Desfazer (a IA errou)". A RPC confere quem pode (admin ou
 * membro da loja); o erro dela aparece no toast.
 */
export function DesfazerNumeroErradoDialog({
  marca,
  clientId,
  nome,
  open,
  onOpenChange,
}: {
  marca: NumeroErrado;
  clientId: string;
  /** `full_name` do cliente; null quando a ficha não tem nome. */
  nome: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const desfazer = useDesfazerNumeroErrado(clientId);
  const [motivo, setMotivo] = useState("");

  const confirmar = () => {
    desfazer.mutate(
      { id: marca.id, motivo: motivo.trim() || "a IA errou (desfeito pela tela)" },
      {
        onSuccess: () => {
          toast({ title: "Marcação desfeita", description: "As automações voltam a mandar mensagem para este número." });
          setMotivo("");
          onOpenChange(false);
        },
        onError: (e: unknown) => {
          toast({
            title: "Não foi possível desfazer",
            description: e instanceof Error ? e.message : String(e),
            variant: "destructive",
          });
        },
      },
    );
  };

  return (
    <AlertDialog open={open} onOpenChange={(v) => !desfazer.isPending && onOpenChange(v)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Desfazer “número inválido”?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>
                As automações voltam a mandar WhatsApp e SMS para{" "}
                <strong className="text-foreground tabular-nums">{formatPhoneDisplay(marca.telefone)}</strong>{" "}
                {deQuem(nome)}
                {marca.escopo === "global" ? ", em todas as lojas" : ", nesta loja"}.
              </p>
              <p>
                Use só se a pessoa <strong className="text-foreground">não</strong> disse que o número é de outra
                pessoa. Ela respondeu: {respostaLegivel(marca)}
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Textarea
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="Motivo (opcional) — ex.: era resposta automática da empresa"
          className="min-h-[72px] text-sm"
          maxLength={500}
        />
        <AlertDialogFooter>
          <AlertDialogCancel disabled={desfazer.isPending}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            disabled={desfazer.isPending}
            onClick={(e) => {
              // Sem isto o Radix fecha o diálogo antes da RPC responder e o erro
              // de permissão apareceria com a janela já fechada.
              e.preventDefault();
              confirmar();
            }}
          >
            {desfazer.isPending ? "Desfazendo…" : "Desfazer"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * Etiqueta "Número inválido" do cabeçalho do cliente. Clicar abre os detalhes
 * (desde quando, o que respondeu, como foi marcado, alcance) e o Desfazer.
 * Em modo vitrine (`masked`) só a etiqueta: a resposta pode conter nome.
 */
export function NumeroErradoEtiqueta({
  marca,
  clientId,
  nome,
  masked = false,
}: {
  marca: NumeroErrado;
  clientId: string;
  /** `full_name` do cliente; null quando a ficha não tem nome. */
  nome: string | null;
  masked?: boolean;
}) {
  const [confirmarAberto, setConfirmarAberto] = useState(false);
  const [popoverAberto, setPopoverAberto] = useState(false);

  const pilula = (
    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold bg-destructive/10 text-destructive">
      <PhoneOff className="h-3.5 w-3.5" />
      Número inválido
    </span>
  );

  if (masked) return pilula;

  return (
    <>
      <Popover open={popoverAberto} onOpenChange={setPopoverAberto}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-destructive/40"
            title={`Número inválido desde ${quando(marca.criado_em, "dd/MM/yyyy")}`}
          >
            {pilula}
          </button>
        </PopoverTrigger>
        <PopoverContent align="center" className="w-80 text-left">
          <p className="text-sm font-semibold text-foreground">Número inválido</p>
          <p className="text-[12px] text-muted-foreground mt-0.5 mb-3">
            A pessoa deste telefone disse que não é {nome ?? "este cliente"}. As automações não mandam mais WhatsApp nem SMS para ele
            {marca.escopo === "global" ? " em nenhuma loja" : " nesta loja"}.
          </p>
          <DetalhesMarca marca={marca} />
          <Button
            size="sm"
            variant="outline"
            className="w-full mt-4 h-8"
            onClick={() => {
              setPopoverAberto(false);
              setConfirmarAberto(true);
            }}
          >
            <Undo2 className="h-3.5 w-3.5 mr-1.5" /> Desfazer (a IA errou)
          </Button>
        </PopoverContent>
      </Popover>
      <DesfazerNumeroErradoDialog
        marca={marca}
        clientId={clientId}
        nome={nome}
        open={confirmarAberto}
        onOpenChange={setConfirmarAberto}
      />
    </>
  );
}

/**
 * Faixa do cabeçalho do chat: "Este número disse que não é de {nome} —
 * automação parada", com os detalhes num popover e o mesmo Desfazer.
 */
export function NumeroErradoAviso({
  marca,
  clientId,
  nome,
}: {
  marca: NumeroErrado;
  clientId: string;
  /** `full_name` do cliente; null quando a ficha não tem nome. */
  nome: string | null;
}) {
  const [confirmarAberto, setConfirmarAberto] = useState(false);
  const fonte = FONTE_NUMERO_ERRADO[marca.fonte]?.curto ?? marca.fonte;

  return (
    <>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 md:px-6 py-2 border-t border-destructive/20 bg-destructive/10 text-destructive">
        <PhoneOff className="h-4 w-4 shrink-0" />
        <div className="min-w-0 flex-1 basis-56">
          <p className="text-[13px] font-semibold leading-snug">
            Este número disse que não é {deQuem(nome)} — automação parada
          </p>
          <p className="text-[11px] text-destructive/80 leading-snug">
            Desde {quando(marca.criado_em, "dd/MM/yyyy")} · {fonte} · {ESCOPO_NUMERO_ERRADO[marca.escopo] ?? marca.escopo}
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Popover>
            <PopoverTrigger asChild>
              <Button size="sm" variant="ghost" className="h-7 px-2 text-[12px] text-destructive hover:text-destructive hover:bg-destructive/10">
                Detalhes
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80">
              <DetalhesMarca marca={marca} />
            </PopoverContent>
          </Popover>
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-2.5 text-[12px] border-destructive/30 bg-background/60 text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={() => setConfirmarAberto(true)}
          >
            <Undo2 className="h-3.5 w-3.5 mr-1" /> Desfazer (a IA errou)
          </Button>
        </div>
      </div>
      <DesfazerNumeroErradoDialog
        marca={marca}
        clientId={clientId}
        nome={nome}
        open={confirmarAberto}
        onOpenChange={setConfirmarAberto}
      />
    </>
  );
}
