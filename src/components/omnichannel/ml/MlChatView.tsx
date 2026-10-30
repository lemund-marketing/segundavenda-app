import { useEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties, type UIEvent } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ExternalLink,
  Loader2,
  Lock,
  MessageSquare,
  Paperclip,
  ReceiptText,
  RefreshCw,
  Send,
  ShieldAlert,
} from "lucide-react";
import { format, isToday, isYesterday } from "date-fns";
import { ptBR } from "date-fns/locale";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { MercadoLivreSelo } from "./MercadoLivreSelo";
import { MlOrderPanel } from "./MlOrderPanel";
import type { MlConversaAberta } from "./useMlConversations";
import {
  ML_MAX_CARACTERES,
  ML_TINTA,
  avisosConteudo,
  linkVendaMl,
  mesmoTextoMl,
  normalizarTextoMl,
  rotuloBloqueio,
  rotuloModeracao,
  tituloMl,
  validarTextoMl,
  type MlConversa,
  type MlMensagem,
} from "./mlTipos";

interface MlChatViewProps {
  /** Linha da lista no clique — mostrada já no primeiro quadro, antes da edge responder. */
  conversa: MlConversa;
  aberta: MlConversaAberta;
  isMobile: boolean;
  onBack: () => void;
  /** Celular: troca para a tela do pedido (a mesma view 'info' do WhatsApp). */
  onVerPedido?: () => void;
}

const rotuloDia = (d: Date) =>
  isToday(d) ? "Hoje" : isYesterday(d) ? "Ontem" : format(d, "dd 'de' MMMM 'de' yyyy", { locale: ptBR });

/**
 * Depois de um envio INCERTO, o mesmo texto fica travado ENQUANTO a releitura
 * não termina sem achar a mensagem — e nunca menos que isto. Só tempo não
 * bastava: no hub lento (o que gera o "incerto") a releitura passa de 15 s, e a
 * trava caía com ela ainda no ar.
 */
const TRAVA_MINIMA_MS = 15_000;
/** O texto de uma tentativa que falhou volta para a caixa ao reabrir a conversa por este tempo. */
const RESTAURAR_RASCUNHO_MS = 10 * 60_000;

/**
 * Conversa pós-venda do Mercado Livre aberta na aba WhatsApp.
 *
 * Tem cabeçalho, thread e compositor PRÓPRIOS de propósito: o ChatHeader e a
 * caixa do WhatsApp são presos ao CRM (fase, workflow, janela de 24h, template,
 * anexo no Storage) e nada disso existe no ML. As bolhas copiam as classes da
 * thread do Omnichannel.tsx (separador de dia, enviada `bg-primary`, recebida
 * `bg-muted`) para as duas conversas parecerem a mesma tela.
 *
 * O SV só RESPONDE: sem mensagem do comprador o ML não deixa escrever, e a
 * edge devolve `pode_responder` já com essa regra.
 */
export function MlChatView({ conversa, aberta, isMobile, onBack, onVerPedido }: MlChatViewProps) {
  const { toast } = useToast();
  const [texto, setTexto] = useState("");
  const [pedidoAberto, setPedidoAberto] = useState(false);
  const caixaRef = useRef<HTMLTextAreaElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const pertoDoFimRef = useRef(true);
  const conversaAnteriorRef = useRef<string | null>(null);
  /**
   * A conversa que está NA TELA agora (null = o chat do ML saiu da tela). O
   * envio leva ~60 s no pior caso; quando ele volta, rascunho, toast e foco só
   * mexem na tela se ela ainda for a conversa que enviou.
   */
  const conversaAtualRef = useRef<string | null>(conversa.id);
  useEffect(() => {
    conversaAtualRef.current = conversa.id;
    return () => {
      conversaAtualRef.current = null;
    };
  }, [conversa.id]);

  const dados = aberta.dados?.conversa?.id === conversa.id ? aberta.dados : null;
  const atual: MlConversa = dados ? { ...conversa, ...dados.conversa } : conversa;
  // Memo: o efeito que confere a releitura depende da LISTA (não de um `[]` novo a cada render).
  const mensagens: MlMensagem[] = useMemo(() => dados?.mensagens ?? [], [dados]);
  const bloqueada = atual.status === "blocked";
  const pedido = atual.pedido_ml || atual.pack_id;
  const linkVenda = linkVendaMl(atual.pedido_ml);
  const nome = tituloMl(atual);

  const podeResponder = !!dados?.pode_responder && !bloqueada;
  const motivoNaoResponde = podeResponder
    ? null
    : bloqueada
      ? rotuloBloqueio(atual.motivo_bloqueio)
      : dados?.motivo_nao_responde ||
        (dados ? "O comprador ainda não escreveu — o Mercado Livre só deixa responder." : null);

  /** O envio que falhou NESTA conversa e ainda está pendente de conferência. */
  const tentativa =
    aberta.tentativa && aberta.tentativa.conversaId === conversa.id && !aberta.tentativa.saiu ? aberta.tentativa : null;

  // Rascunho é por conversa: trocar de comprador com o texto do anterior na caixa
  // é o jeito mais fácil de mandar a mensagem para a pessoa errada. A exceção é
  // o texto de um envio que FALHOU nesta conversa (inclusive com outra aberta):
  // ele volta para a caixa dela, em vez de sumir.
  useEffect(() => {
    const t = aberta.tentativa;
    const restaurar =
      t && t.conversaId === conversa.id && !t.saiu && Date.now() - t.em < RESTAURAR_RASCUNHO_MS ? t.texto : "";
    setTexto(restaurar);
    setPedidoAberto(false);
    // Só na troca de conversa: a tentativa é lida do render em que ela trocou.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversa.id]);

  const validacao = validarTextoMl(texto);
  const vazio = validacao.texto.length === 0;
  const avisos = vazio ? [] : avisosConteudo(validacao.texto);
  const passouDoLimite = validacao.texto.length > ML_MAX_CARACTERES;

  /**
   * Normaliza a cada tecla/colagem: aspa curva, travessão e reticências de um
   * caractere viram o equivalente que o ML aceita, e o atendente vê na hora o
   * que vai sair. Quando a troca muda o comprimento ('…' → '...'), o cursor é
   * reposto — o React jogaria para o fim.
   */
  const aoDigitar = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const bruto = e.target.value;
    const limpo = normalizarTextoMl(bruto);
    setTexto(limpo);
    if (limpo !== bruto) {
      const el = e.target;
      const pos = (el.selectionStart ?? bruto.length) + (limpo.length - bruto.length);
      requestAnimationFrame(() => {
        if (caixaRef.current === el) el.setSelectionRange(pos, pos);
      });
    }
  };

  /** O mesmo texto da tentativa incerta ainda não pode sair de novo? */
  const reenvioTravado = (textoNovo: string) =>
    !!tentativa?.incerto &&
    mesmoTextoMl(tentativa.texto, textoNovo) &&
    (aberta.conferindo || !tentativa.relidaSemAchar || Date.now() - tentativa.em < TRAVA_MINIMA_MS);

  /** `forcar`: o atendente conferiu no ML e escolheu "Enviar mesmo assim". */
  const enviar = async (forcar = false) => {
    if (!podeResponder || aberta.enviando) return;
    const v = validarTextoMl(texto);
    if (!v.ok) {
      toast({ title: "Não dá para enviar ainda", description: v.erro, variant: "destructive" });
      return;
    }
    // Envio incerto com o MESMO texto ainda não conferido: o Enter de novo é o
    // caminho mais curto para o comprador receber em dobro (no ML não existe
    // apagar). Espera a releitura terminar sem achar a mensagem.
    if (!forcar && reenvioTravado(v.texto)) {
      toast({
        title: "Confira antes de reenviar",
        description: aberta.conferindo
          ? "A conversa está sendo relida para ver se a tentativa anterior chegou ao comprador."
          : tentativa?.relidaSemAchar
            ? "A conversa acabou de ser relida no Mercado Livre e a mensagem não apareceu. Espere alguns segundos e envie de novo."
            : tentativa?.emCurso
              ? "O envio anterior demorou e ainda pode chegar ao comprador. Veja a conversa no Mercado Livre; se ela não estiver lá, use \"Enviar mesmo assim\"."
              : "Não deu para conferir se a tentativa anterior saiu. Veja a conversa no Mercado Livre; se ela não estiver lá, use \"Enviar mesmo assim\".",
      });
      return;
    }
    // A conversa e o nome são os DESTE envio: a resposta pode voltar com outra aberta.
    const id = conversa.id;
    const quem = nome;
    const idsAntes = mensagens.filter((m) => m.direcao === "outbound").map((m) => m.id);
    const r = await aberta.responder(v.texto, idsAntes);
    const aindaAqui = conversaAtualRef.current === id;
    if (r.ok === true) {
      if (!aindaAqui) {
        toast({ title: "Resposta enviada", description: `A resposta para ${quem} foi entregue ao Mercado Livre.` });
        return;
      }
      setTexto("");
      toast({ title: "Mensagem enviada", description: "Entregue ao Mercado Livre." });
      // A caixa fica `disabled` durante o envio e perde o foco; devolve para a
      // próxima resposta sair sem clique.
      requestAnimationFrame(() => caixaRef.current?.focus());
      return;
    }
    if (!aindaAqui) {
      // O hook guardou a tentativa na conversa dela: o texto volta para a caixa
      // quando ela for reaberta, e a releitura de lá confere se saiu.
      toast({
        title: r.incerto ? `A resposta para ${quem} pode ter saído` : `A resposta para ${quem} não saiu`,
        description: r.incerto ? r.erro : `${r.erro} O texto volta para a caixa quando você abrir a conversa.`,
        variant: "destructive",
      });
      return;
    }
    // Saiu e voltou para esta conversa com o POST no ar: a troca esvaziou a caixa.
    setTexto((atual) => (atual.trim() ? atual : v.texto));
    toast({
      title: r.incerto ? "A mensagem pode ter saído" : "Erro ao enviar",
      description: r.erro,
      variant: "destructive",
    });
  };

  // A releitura (do hook) achou a mensagem da tentativa: ela saiu. O rascunho
  // some e o atendente fica sabendo que não precisa reenviar. Só a tentativa
  // DESTA conversa, conferida nas mensagens DESTA conversa (o hook garante).
  const { tentativa: tentativaDoHook, descartarTentativa } = aberta;
  useEffect(() => {
    const t = tentativaDoHook;
    if (!t || !t.saiu || t.conversaId !== conversa.id) return;
    descartarTentativa(t.conversaId);
    setTexto((atual) => (mesmoTextoMl(validarTextoMl(atual).texto, t.texto) ? "" : atual));
    toast({ title: "A mensagem saiu", description: "A conversa relida mostra a sua resposta — não precisa reenviar." });
  }, [tentativaDoHook, descartarTentativa, conversa.id, toast]);

  // A thread nasce no FIM (mesma regra do Omnichannel.tsx): trocar de conversa
  // salta seco; mensagem nova só arrasta quem já estava perto do fim.
  useEffect(() => {
    const viewport = threadRef.current?.querySelector<HTMLElement>("[data-radix-scroll-area-viewport]");
    if (!viewport) return;
    const trocou = conversaAnteriorRef.current !== conversa.id;
    conversaAnteriorRef.current = conversa.id;
    if (trocou) pertoDoFimRef.current = true;
    if (!trocou && !pertoDoFimRef.current) return;
    const quadro = requestAnimationFrame(() => {
      viewport.scrollTo({ top: viewport.scrollHeight, behavior: trocou ? "auto" : "smooth" });
    });
    return () => cancelAnimationFrame(quadro);
  }, [conversa.id, mensagens.length]);

  const aoRolar = (e: UIEvent<HTMLDivElement>) => {
    const el = e.target as HTMLElement;
    if (!el?.hasAttribute?.("data-radix-scroll-area-viewport")) return;
    pertoDoFimRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  };

  const verPedido = () => {
    if (isMobile && onVerPedido) onVerPedido();
    else setPedidoAberto(true);
  };

  const tinta = { "--ml-tinta": ML_TINTA.light, "--ml-tinta-dark": ML_TINTA.dark } as CSSProperties;

  return (
    <>
      {/* ── Cabeçalho ─────────────────────────────────────────────────── */}
      <div className="border-b border-border bg-card" style={tinta}>
        <div className="flex items-center justify-between gap-3 px-4 md:px-6 py-3">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            {isMobile && (
              <Button variant="ghost" size="icon" onClick={onBack} className="h-9 w-9 shrink-0 rounded-md">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            )}
            <MercadoLivreSelo tamanho="md" />
            <div className="min-w-0 flex-1">
              <p className="text-base font-semibold text-foreground truncate">{nome}</p>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-0.5">
                {pedido && (atual.comprador_nome || "").trim() && (
                  <span className="text-sm text-muted-foreground tabular-nums truncate max-w-[240px]">
                    Pedido #{pedido}
                  </span>
                )}
                {bloqueada ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-red-300 bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700 dark:border-red-500/40 dark:bg-red-500/15 dark:text-red-300">
                    <Lock className="h-3 w-3 shrink-0" />
                    Bloqueada
                  </span>
                ) : (
                  <span className="inline-flex items-center rounded-full border border-[rgba(196,170,0,0.45)] dark:border-[rgba(255,230,0,0.3)] bg-[rgba(255,230,0,0.14)] px-2 py-0.5 text-[11px] font-semibold text-[color:var(--ml-tinta)] dark:text-[color:var(--ml-tinta-dark)]">
                    Mercado Livre · Pós-venda
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-md"
              onClick={aberta.recarregar}
              disabled={aberta.carregando}
              title="Atualizar a conversa com o Mercado Livre"
            >
              <RefreshCw className={`h-[18px] w-[18px] ${aberta.carregando ? "animate-spin" : ""}`} />
            </Button>
            {/* Acima de 1180px o pedido já está no painel da direita. */}
            <Button
              variant="ghost"
              size="icon"
              className={`h-9 w-9 rounded-md ${isMobile ? "" : "min-[1180px]:hidden"}`}
              onClick={verPedido}
              title="Ver o pedido"
            >
              <ReceiptText className="h-[18px] w-[18px]" />
            </Button>
            {linkVenda && !isMobile && (
              <Button variant="ghost" size="icon" className="h-9 w-9 rounded-md" asChild>
                <a href={linkVenda} target="_blank" rel="noopener noreferrer" title="Abrir a venda no Mercado Livre">
                  <ExternalLink className="h-[18px] w-[18px]" />
                </a>
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* ── Faixas: bloqueio e erro da edge ───────────────────────────── */}
      {bloqueada && (
        <div className="mx-4 mt-3 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
          <Lock className="mt-0.5 h-4 w-4 shrink-0" />
          <p className="text-[12px] leading-relaxed">
            <span className="font-semibold">Conversa bloqueada pelo Mercado Livre.</span>{" "}
            {rotuloBloqueio(atual.motivo_bloqueio)}
          </p>
        </div>
      )}
      {aberta.erro && (
        <div className="mx-4 mt-3 flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-foreground">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <div className="min-w-0 flex-1 text-[12px] leading-relaxed">
            <p>{aberta.erro}</p>
            <button
              type="button"
              onClick={aberta.recarregar}
              className="mt-1 font-semibold underline underline-offset-2 hover:no-underline"
            >
              Tentar de novo
            </button>
          </div>
        </div>
      )}

      {/* ── Thread ─────────────────────────────────────────────────────── */}
      {/* omnichannel-list-scroll: mesmo remendo do display:table do Radix que a
          thread do WhatsApp usa — sem ele o max-w das bolhas mede errado. */}
      <ScrollArea ref={threadRef} onScrollCapture={aoRolar} className="flex-1 p-4 omnichannel-list-scroll">
        <div className="space-y-4">
          {aberta.carregando && !dados && (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Buscando a conversa no Mercado Livre...
            </div>
          )}

          {mensagens.map((m, index) => {
            const quando = new Date(m.enviada_em);
            const valida = !isNaN(quando.getTime());
            const anterior = index > 0 ? new Date(mensagens[index - 1].enviada_em) : null;
            const separador =
              valida && (!anterior || isNaN(anterior.getTime()) || format(quando, "yyyy-MM-dd") !== format(anterior, "yyyy-MM-dd"));
            const saida = m.direcao === "outbound";
            const anexos = Number(m.anexos) || 0;
            const temTexto = m.estado_texto === "present" && !!(m.texto || "").trim();
            const moderada = m.moderacao === "rejected";
            const emAnalise = m.moderacao === "pending";
            const motivoMod = rotuloModeracao(m.motivo_moderacao);

            return (
              <div key={m.id}>
                {separador && (
                  <div className="flex items-center justify-center my-3">
                    <span className="text-[11px] text-muted-foreground bg-accent px-3 py-1 rounded-full border border-border">
                      {rotuloDia(quando)}
                    </span>
                  </div>
                )}
                <div className={`flex ${saida ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[70%] [overflow-wrap:anywhere] rounded-lg p-3 ${
                      saida ? "bg-primary text-primary-foreground" : "bg-muted"
                    } ${moderada ? "opacity-80" : ""}`}
                  >
                    {temTexto ? (
                      <p className="whitespace-pre-wrap break-words">{m.texto}</p>
                    ) : m.estado_texto === "expired" ? (
                      <p className="whitespace-pre-wrap opacity-70 text-sm italic">
                        [Texto apagado pela política de retenção de dados]
                      </p>
                    ) : anexos === 0 ? (
                      <p className="whitespace-pre-wrap opacity-70 text-sm italic">[Mensagem sem texto]</p>
                    ) : null}

                    {anexos > 0 && (
                      <p className="mt-1 flex items-center gap-1 text-[11px] font-medium opacity-80">
                        <Paperclip className="h-3 w-3 shrink-0" />
                        {anexos} {anexos === 1 ? "anexo" : "anexos"} — veja no Mercado Livre
                      </p>
                    )}

                    {(moderada || emAnalise) && (
                      <p className="mt-1 flex items-start gap-1 text-[11px] font-semibold opacity-90">
                        <ShieldAlert className="mt-px h-3 w-3 shrink-0" />
                        <span>
                          {moderada ? "Barrada pela moderação do Mercado Livre" : "Em análise pelo Mercado Livre"}
                          {motivoMod ? ` — ${motivoMod}` : ""}
                        </span>
                      </p>
                    )}

                    <div className="flex items-center justify-end gap-1 mt-1">
                      {saida && m.enviado_por && (
                        <span className="text-[10px] opacity-70 truncate max-w-[160px]" title={`Enviado por ${m.enviado_por}`}>
                          enviado por {m.enviado_por} ·
                        </span>
                      )}
                      <p className="text-xs opacity-70">{valida ? format(quando, "HH:mm") : ""}</p>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {dados && mensagens.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <MessageSquare className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p className="text-sm">Nenhuma mensagem registrada nesta conversa.</p>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* ── Compositor ─────────────────────────────────────────────────── */}
      {/* Sem anexo, sem template e sem janela de 24h: nada disso existe no ML. */}
      <div className="border-t p-3 bg-background space-y-2">
        {motivoNaoResponde && (
          <div className="bg-muted border rounded-lg p-3">
            <p className="text-sm text-muted-foreground flex items-start gap-2">
              <Lock className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{motivoNaoResponde}</span>
            </p>
          </div>
        )}

        {/* Envio incerto desta conversa ainda sem resposta: enquanto a releitura
            voa, o mesmo texto fica travado; se ela não conseguiu conferir (não
            chegou ao ML — relido_no_ml false — ou o envio de tempo/rede ainda
            pode estar chegando lá), só sai por ação explícita. */}
        {podeResponder && tentativa?.incerto && (aberta.conferindo || !tentativa.relidaSemAchar) && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
            {aberta.conferindo ? (
              <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin" />
            ) : (
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            )}
            <div className="min-w-0 flex-1 text-[12px] leading-relaxed">
              {aberta.conferindo ? (
                <p>Conferindo se a mensagem anterior saiu...</p>
              ) : (
                <>
                  <p>
                    {tentativa.emCurso
                      ? "O envio anterior demorou e ainda pode chegar ao comprador. Veja a conversa no Mercado Livre antes de reenviar."
                      : "Não deu para conferir se a mensagem anterior saiu. Veja a conversa no Mercado Livre antes de reenviar."}
                  </p>
                  {mesmoTextoMl(validacao.texto, tentativa.texto) && validacao.ok && !aberta.enviando && (
                    <button
                      type="button"
                      onClick={() => void enviar(true)}
                      className="mt-1 font-semibold underline underline-offset-2 hover:no-underline"
                    >
                      Enviar mesmo assim
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {/* Avisos NÃO bloqueiam: quem barra é a moderação do ML, e às vezes o
            atendente precisa mesmo citar um número. Erro de caractere bloqueia,
            porque o ML recusaria a mensagem inteira. */}
        {podeResponder && avisos.length > 0 && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
            {avisos.map((a) => (
              <p key={a.tipo} className="text-[12px] leading-relaxed flex items-start gap-1.5">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {a.mensagem}
              </p>
            ))}
          </div>
        )}
        {podeResponder && !vazio && !validacao.ok && (
          <p className="text-[12px] leading-relaxed text-red-700 dark:text-red-300">{validacao.erro}</p>
        )}

        <div className="flex gap-2">
          <Textarea
            ref={caixaRef}
            value={texto}
            onChange={aoDigitar}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void enviar();
              }
            }}
            placeholder={
              podeResponder
                ? "Responder ao comprador no Mercado Livre..."
                : !dados
                  ? aberta.erro
                    ? "A conversa não carregou"
                    : "Carregando a conversa..."
                  : "Não dá para responder esta conversa"
            }
            disabled={!podeResponder || aberta.enviando}
            // Mesmas medidas da caixa do WhatsApp (min-w-0 e min-h-[56px], ver
            // os comentários lá no Omnichannel.tsx).
            className="resize-none flex-1 min-w-0 min-h-[56px]"
            rows={2}
            aria-label="Resposta ao comprador do Mercado Livre"
          />
          <Button
            onClick={() => void enviar()}
            disabled={!podeResponder || aberta.enviando || !validacao.ok}
            size="icon"
            className="h-auto shrink-0"
            title="Enviar resposta"
          >
            {aberta.enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
        <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
          <span>Só texto: o Mercado Livre não aceita emoji nem anexo por aqui.</span>
          <span
            className={`tabular-nums shrink-0 ${passouDoLimite ? "font-semibold text-red-700 dark:text-red-300" : ""}`}
          >
            {validacao.texto.length}/{ML_MAX_CARACTERES}
          </span>
        </div>
      </div>

      {/* Pedido entre 768 e 1179px: o painel da direita não cabe ali. */}
      <Sheet open={pedidoAberto} onOpenChange={setPedidoAberto}>
        <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col">
          <SheetHeader className="sr-only">
            <SheetTitle>Pedido no Mercado Livre</SheetTitle>
          </SheetHeader>
          <MlOrderPanel conversa={conversa} aberta={aberta} />
        </SheetContent>
      </Sheet>
    </>
  );
}

export default MlChatView;
