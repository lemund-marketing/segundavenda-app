import { useState, useEffect, useMemo, useRef } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PlayCircle, Loader2, CheckCircle2, XCircle, AlertTriangle, Phone, MessageSquare, Info, ChevronDown, Terminal, Sparkles, StopCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
// app: o @xyflow/react (editor de fluxos) não está no app; o diálogo só lê
// id, tipo, config e as ligações, que são os nós e arestas gravados no fluxo.
import type { WorkflowNode as Node, WorkflowEdge as Edge } from '@/types/workflow';
import { useWorkflowTestRun } from '@/hooks/useWorkflowTestRun';
import WorkflowTestTimeline from './WorkflowTestTimeline';
import { TemplatePreview } from './TemplatePreview';
import { WhatsAppInstanceSelector, motivoBloqueio } from './WhatsAppInstanceSelector';
import { useWhatsAppCloudInstances } from '@/hooks/useWhatsAppCloudInstances';

interface TestWorkflowDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workflowName?: string;
  workflowId?: string;
  nodes: Node[];
  edges: Edge[];
  sellerId: string;
  isWorkflowActive?: boolean;
  /** Callback acionado quando há um nó "ativo" no teste interativo, para destacar no canvas */
  onActiveTestNodeChange?: (nodeId: string | null) => void;
}

type TestStatus = 'idle' | 'testing' | 'success' | 'error';

interface DiagnosticInfo {
  sellerId: string;
  phoneNumberId?: string;
  wamid?: string;
  instanceId?: string;
  rawError?: string;
  metaErrorCode?: string | number;
  templateName?: string;
  paramsCount?: number;
}

// supabase-js embrulha respostas não-2xx num FunctionsHttpError cuja .message é
// sempre genérica ("Edge Function returned a non-2xx status code"); o motivo
// verdadeiro fica no corpo em error.context (Response). Mesmo padrão de
// mensagemRealDoErro em src/components/account/MembersTab.tsx (cópia local).
const MAX_TEXTO_CRU = 300;
async function mensagemRealDoErro(error: unknown): Promise<string> {
  const ctx = (error as { context?: Response })?.context;
  if (ctx && typeof (ctx as { text?: unknown }).text === 'function') {
    try {
      const resposta = typeof ctx.clone === 'function' ? ctx.clone() : ctx;
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
  return 'Falha inesperada ao falar com o servidor.';
}

const normalizeTemplateComponents = (components: unknown): any[] => {
  try {
    if (Array.isArray(components)) return components;
    if (typeof components === 'string') {
      const parsed = JSON.parse(components);
      return Array.isArray(parsed) ? parsed : [];
    }
    return [];
  } catch {
    return [];
  }
};

const extractBodyParamLabels = (components: unknown): string[] => {
  const comps = normalizeTemplateComponents(components);
  const body = comps.find((c: any) => c?.type === 'BODY');

  const named = (body as any)?.example?.body_text_named_params;
  if (Array.isArray(named) && named.length > 0) {
    return named.map((p: any) => p?.param_name || 'Parâmetro');
  }

  const text = typeof (body as any)?.text === 'string' ? (body as any).text : '';
  const matches = text.match(/\{\{([^}]+)\}\}/g);
  if (matches) {
    return matches.map((m: string) => m.replace(/\{\{|\}\}/g, ''));
  }
  return [];
};

function findFirstSendNode(nodes: Node[], edges: Edge[]): Node | null {
  const sendTypes = ['send-template', 'whatsapp'];

  const triggerNode = nodes.find(n => n.type === 'trigger' || n.type === 'schedule' || n.type === 'pipeline-stage-change' || n.type === 'rfv-segment-change' || n.type === 'message-received');
  if (!triggerNode) {
    return nodes.find(n => sendTypes.includes(n.type || '')) || null;
  }

  const visited = new Set<string>();
  const queue = [triggerNode.id];

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    if (visited.has(currentId)) continue;
    visited.add(currentId);

    const currentNode = nodes.find(n => n.id === currentId);
    if (currentNode && sendTypes.includes(currentNode.type || '')) {
      return currentNode;
    }

    const childEdges = edges.filter(e => e.source === currentId);
    for (const edge of childEdges) {
      if (!visited.has(edge.target)) {
        queue.push(edge.target);
      }
    }
  }

  return null;
}

const TestWorkflowDialog = ({ open, onOpenChange, workflowName, workflowId, nodes, edges, sellerId, isWorkflowActive, onActiveTestNodeChange }: TestWorkflowDialogProps) => {
  const [mode, setMode] = useState<'simple' | 'interactive'>('simple');

  const [phoneNumber, setPhoneNumber] = useState('');
  const [clientFirstName, setClientFirstName] = useState('Teste');
  const [status, setStatus] = useState<TestStatus>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [diagnostic, setDiagnostic] = useState<DiagnosticInfo | null>(null);
  const [diagOpen, setDiagOpen] = useState(false);

  // Cru do banco: todos os templates APROVADOS do seller, de todos os números.
  // A lista que a UI mostra (`templates`, mais abaixo) é derivada e filtrada pelo número.
  const [allTemplates, setAllTemplates] = useState<any[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');

  // De qual número o teste sai
  const [useDefaultInstance, setUseDefaultInstance] = useState(true);
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | undefined>(undefined);
  const instanciaInicializadaRef = useRef(false);
  const labelsKeyRef = useRef('');
  const { instances } = useWhatsAppCloudInstances(sellerId);

  const [paramValues, setParamValues] = useState<string[]>([]);
  const [paramLabels, setParamLabels] = useState<string[]>([]);

  // Estado do modo interativo
  const [testRunId, setTestRunId] = useState<string | null>(null);
  const [startingTest, setStartingTest] = useState(false);
  const { events, activeNodeId, status: runStatus } = useWorkflowTestRun(testRunId);

  const firstSendNode = useMemo(() => findFirstSendNode(nodes, edges), [nodes, edges]);

  // Número que de fato vai enviar.
  //
  // O padrão pula número doente, igual à blindagem do servidor faz. Se apontássemos
  // para o padrão cru, um seller cujo número padrão está `banned` veria a caixa
  // "Usar padrão" exibindo com orgulho um número que o servidor recusa — e o teste
  // que hoje funciona (a blindagem troca por um irmão saudável) passaria a dar 400.
  const instanciaPadrao = useMemo(() => {
    const saudaveis = instances.filter(i => !motivoBloqueio(i));
    return (saudaveis.find(i => i.is_default) || saudaveis[0] || instances[0])?.id;
  }, [instances]);

  // Desligar "Usar padrão" NÃO pode zerar o número efetivo: o Switch só avisa
  // `onUseDefaultChange(false)` e deixa a escolha vazia, e um efetivo indefinido
  // devolvia a lista de templates misturada de todas as WABAs — exatamente o bug
  // que este seletor veio matar.
  const effectiveInstanceId = useMemo(
    () => (useDefaultInstance ? instanciaPadrao : (selectedInstanceId ?? instanciaPadrao)),
    [useDefaultInstance, selectedInstanceId, instanciaPadrao],
  );

  // Só quando o usuário mexeu no seletor. O servidor usa isto para separar escolha
  // de gente (não pode ser desviada calada) de resolução automática (pode).
  const escolhaExplicita = !useDefaultInstance && !!selectedInstanceId;

  // Cada instância tem o SEU template (whatsapp_templates é único por
  // whatsapp_instance_id + name + language). Sem este filtro o Select mostra N linhas
  // visualmente idênticas e o par número×template desemparelha no servidor, que busca o
  // template escopado pela instância resolvida: sem achar, ele não valida os parâmetros
  // nem injeta o header e a Meta devolve 132001 falando de template quando o problema é o número.
  // Aqui NÃO existe o fallback "se não houver template do número, mostra todos" que o
  // painel do nó Enviar Template tem — nesta tela isso recriaria exatamente esse bug.
  const templates = useMemo(() => {
    const list = allTemplates || [];
    // Sem número resolvido (seller sem nenhum) a lista fica VAZIA, e não "todos":
    // mostrar todos é o desemparelhamento que gera 132001.
    const scoped = effectiveInstanceId
      ? list.filter((t: any) => t.whatsapp_instance_id === effectiveInstanceId)
      : (instances.length > 0 ? [] : list);
    const seen = new Set<string>();
    return scoped.filter((t: any) => {
      const k = `${t.name}::${t.language}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }, [allTemplates, effectiveInstanceId, instances.length]);

  // Propaga active node para o canvas
  const lastReportedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!onActiveTestNodeChange) return;
    if (lastReportedRef.current !== activeNodeId) {
      lastReportedRef.current = activeNodeId;
      onActiveTestNodeChange(activeNodeId);
    }
  }, [activeNodeId, onActiveTestNodeChange]);

  useEffect(() => {
    if (open && sellerId) {
      loadTemplates();
      if (!sellerId || sellerId.length < 10) {
        setDiagnostic({ sellerId: sellerId || '⚠️ VAZIO', rawError: 'sellerId inválido ou não resolvido' });
        setDiagOpen(true);
      }
    }
  }, [open, sellerId]);

  // Pré-seleciona o número declarado no nó de envio; senão, "usar padrão".
  // O ref-guard é obrigatório: o modal nunca desmonta e `firstSendNode` vem de um useMemo
  // sobre [nodes, edges] — arrastar qualquer nó no canvas com o modal aberto geraria
  // identidade nova e este efeito atropelaria a escolha manual do usuário. O reset em
  // `!open` é o que impede o número escolhido no workflow A de vazar para o teste do B.
  useEffect(() => {
    if (!open) {
      // Zerar TUDO que é escolha desta abertura. O modal nunca desmonta, então o que
      // ficar aqui reaparece no teste do próximo workflow: já dava para abrir o teste
      // do workflow B e ver o banner anunciando o template de B enquanto o campo
      // mostrava o de A — e, se os rótulos batessem, os parâmetros digitados em A
      // vinham preenchidos junto.
      instanciaInicializadaRef.current = false;
      labelsKeyRef.current = '';
      setSelectedTemplateId('');
      setParamLabels([]);
      setParamValues([]);
      return;
    }
    if (instanciaInicializadaRef.current || instances.length === 0) return;
    instanciaInicializadaRef.current = true;

    const cfg = firstSendNode?.data?.config as any;
    // O painel do nó zera whatsappCloudInstanceId quando "usar padrão" está ligado,
    // então campo ausente significa mesmo "padrão", sem ambiguidade.
    const numeroDoNo = cfg?.useDefaultCloudInstance === false ? cfg?.whatsappCloudInstanceId : undefined;
    if (numeroDoNo && instances.some(i => i.id === numeroDoNo)) {
      setSelectedInstanceId(numeroDoNo);
      setUseDefaultInstance(false);
    } else {
      setSelectedInstanceId(undefined);
      setUseDefaultInstance(true);
    }
  }, [open, instances, firstSendNode]);

  useEffect(() => {
    if (templates.length === 0) {
      if (selectedTemplateId) setSelectedTemplateId('');
      return;
    }
    // Seleção atual continua válida para o número atual: não mexe.
    if (templates.some((t: any) => t.id === selectedTemplateId)) return;

    // Trocou de número: preserva a ESCOLHA do usuário pelo par nome+idioma, já que o
    // mesmo template existe replicado em cada instância com id diferente.
    const anterior = (allTemplates || []).find((t: any) => t.id === selectedTemplateId);
    const equivalente = anterior
      ? templates.find((t: any) => t.name === anterior.name && t.language === anterior.language)
      : null;
    if (equivalente) {
      setSelectedTemplateId(equivalente.id);
      return;
    }

    const cfg = firstSendNode?.type === 'send-template' ? (firstSendNode.data?.config as any) : null;
    const doNo = cfg?.templateName ? templates.find((t: any) => t.name === cfg.templateName) : null;
    setSelectedTemplateId((doNo || templates[0]).id);
  }, [templates, allTemplates, selectedTemplateId, firstSendNode]);

  useEffect(() => {
    const template = templates.find(t => t.id === selectedTemplateId);
    if (!template) return;

    const labels = extractBodyParamLabels(template.components);
    // `templates` muda de identidade a cada troca de número, e o template equivalente do
    // número novo tem outro id — sem esta guarda por rótulos, trocar de número apagaria
    // tudo que o usuário já tinha digitado nos campos de parâmetro.
    const key = labels.join('|');
    if (key === labelsKeyRef.current) return;
    labelsKeyRef.current = key;

    setParamLabels(labels);
    setParamValues(labels.map(label => `Teste ${label}`));
  }, [selectedTemplateId, templates]);

  const loadTemplates = async () => {
    try {
      setLoadingTemplates(true);

      try {
        await supabase.functions.invoke('sync-whatsapp-templates', {
          body: { seller_id: sellerId },
        });
      } catch (syncErr) {
        console.warn('[TEST-WORKFLOW] Falha ao sincronizar templates:', syncErr);
      }

      const { data }: any = await supabase
        .from('whatsapp_templates' as any)
        .select('*')
        .eq('seller_id', sellerId)
        .eq('status', 'APPROVED')
        .order('name');

      setAllTemplates(data || []);
    } catch (error) {
      console.error('Error loading templates:', error);
    } finally {
      setLoadingTemplates(false);
    }
  };

  // ============= MODO SIMPLES (envio direto, comportamento original) =============
  const handleSubmitSimple = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('testing');
    setErrorMessage('');
    setDiagnostic(null);

    const diagInfo: DiagnosticInfo = { sellerId };

    try {
      const template = templates.find(t => t.id === selectedTemplateId);
      if (!template) throw new Error('Selecione um template');

      diagInfo.templateName = template.name;

      let formattedPhone = phoneNumber.replace(/\D/g, '');
      if (!formattedPhone.startsWith('55')) {
        formattedPhone = `55${formattedPhone}`;
      }
      if (formattedPhone.length < 12) {
        throw new Error('Número inválido. Use o formato: DDD + Número (ex: 41999999999)');
      }

      const labels = extractBodyParamLabels(template.components);
      const expectedParams = labels.length;
      diagInfo.paramsCount = expectedParams;

      const templateComponents: any[] = expectedParams > 0
        ? [{
            type: 'body',
            parameters: labels.map((label, i) => {
              const isNamed = label && !/^\d+$/.test(label);
              return {
                type: 'text',
                text: paramValues[i]?.trim() || `Teste_${label}`,
                ...(isNamed ? { parameter_name: label } : {}),
              };
            }),
          }]
        : [];

      const { data, error } = await supabase.functions.invoke('send-whatsapp-cloud', {
        body: {
          seller_id: sellerId,
          to: formattedPhone,
          template_name: template.name,
          template_language: template.language || 'pt_BR',
          template_params: templateComponents,
          // Manda o número escolhido; sem ele o servidor resolve o padrão do seller.
          ...(effectiveInstanceId ? { whatsapp_instance_id: effectiveInstanceId } : {}),
          explicit_instance_choice: escolhaExplicita,
        },
      });

      if (data?.phoneNumberId) diagInfo.phoneNumberId = data.phoneNumberId;
      if (data?.instanceId) diagInfo.instanceId = data.instanceId;
      if (data?.messageId || data?.wamid) diagInfo.wamid = data?.messageId || data?.wamid;
      if (data?.debug) {
        diagInfo.phoneNumberId = diagInfo.phoneNumberId || data.debug?.phoneNumberId;
        diagInfo.instanceId = diagInfo.instanceId || data.debug?.instanceId;
      }

      if (error) {
        let realMessage = error.message;
        try {
          if (error.context?.body) {
            const reader = (error.context.body as ReadableStream).getReader();
            const { value } = await reader.read();
            const text = new TextDecoder().decode(value);
            const parsed = JSON.parse(text);
            realMessage = parsed?.error?.message || parsed?.error || parsed?.message || realMessage;
            diagInfo.rawError = text;
            diagInfo.metaErrorCode = parsed?.error?.code || parsed?.code;
            if (parsed?.debug?.phoneNumberId) diagInfo.phoneNumberId = parsed.debug.phoneNumberId;
          }
        } catch {}
        diagInfo.rawError = diagInfo.rawError || error.message;
        setDiagnostic(diagInfo);
        setDiagOpen(true);
        throw new Error(realMessage);
      }

      if (data?.error) {
        diagInfo.rawError = typeof data.error === 'string' ? data.error : JSON.stringify(data.error);
        diagInfo.metaErrorCode = data?.errorCode || data?.error?.code;
        if (data?.debug?.phoneNumberId) diagInfo.phoneNumberId = data.debug.phoneNumberId;
        if (data?.debug?.instanceId) diagInfo.instanceId = data.debug.instanceId;
        setDiagnostic(diagInfo);
        setDiagOpen(true);
        throw new Error(diagInfo.rawError);
      }

      if (data?.success || data?.messageId) {
        if (data?.messageId) diagInfo.wamid = data.messageId;
        if (data?.debug?.phoneNumberId) diagInfo.phoneNumberId = data.debug.phoneNumberId;
        setDiagnostic(diagInfo);
        setStatus('success');
        setTimeout(() => {
          onOpenChange(false);
          setStatus('idle');
          setDiagnostic(null);
        }, 4000);
      } else {
        diagInfo.rawError = `Resposta inesperada: ${JSON.stringify(data)}`;
        setDiagnostic(diagInfo);
        setDiagOpen(true);
        throw new Error(data?.message || 'Resposta inesperada do servidor');
      }
    } catch (error) {
      setStatus('error');
      let msg = error instanceof Error ? error.message : 'Erro ao executar teste';

      if (msg.includes('133010')) msg = 'Conta não registrada. Complete a verificação no WhatsApp Manager.';
      else if (msg.includes('130472')) msg = 'Saldo insuficiente. Configure pagamento no WhatsApp Manager.';
      else if (msg.includes('131026')) msg = 'Não entregável. Verifique pagamento, nome de exibição e número do destinatário.';
      else if (msg.includes('132000')) msg = 'Número de parâmetros incorreto. Verifique os campos do template.';
      else if (msg.includes('rate limit')) msg = 'Limite de envios atingido. Aguarde alguns minutos.';
      else if (msg.includes('not configured') || msg.includes('not found')) msg = `Instância WhatsApp não encontrada para seller_id: ${sellerId.substring(0, 8)}... Verifique se o WhatsApp Cloud API está configurado para este seller.`;

      setErrorMessage(msg);
      if (!diagnostic) setDiagnostic({ ...diagInfo, rawError: diagInfo.rawError || msg });
    }
  };

  // ============= MODO INTERATIVO (chama start-workflow-test) =============
  const handleStartInteractive = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!workflowId) {
      setErrorMessage('workflow_id ausente. Salve o workflow antes de iniciar o teste interativo.');
      setStatus('error');
      return;
    }

    setStartingTest(true);
    setErrorMessage('');
    setStatus('testing');

    try {
      const template = templates.find(t => t.id === selectedTemplateId);
      if (!template) throw new Error('Selecione um template');

      let formattedPhone = phoneNumber.replace(/\D/g, '');
      if (!formattedPhone.startsWith('55')) formattedPhone = `55${formattedPhone}`;
      if (formattedPhone.length < 12) throw new Error('Número inválido (ex: 41999999999)');

      const labels = extractBodyParamLabels(template.components);
      const templateComponents: any[] = labels.length > 0
        ? [{
            type: 'body',
            parameters: labels.map((label, i) => {
              const isNamed = label && !/^\d+$/.test(label);
              return {
                type: 'text',
                text: paramValues[i]?.trim() || `Teste_${label}`,
                ...(isNamed ? { parameter_name: label } : {}),
              };
            }),
          }]
        : [];

      // Em erro não-2xx o invoke devolve um FunctionsHttpError genérico;
      // mensagemRealDoErro extrai a causa verdadeira de error.context.
      const { data, error } = await supabase.functions.invoke('start-workflow-test', {
        body: {
          workflow_id: workflowId,
          seller_id: sellerId,
          test_phone: formattedPhone,
          template_name: template.name,
          template_language: template.language || 'pt_BR',
          template_params: templateComponents,
          start_node_id: firstSendNode?.id,
          client_first_name: clientFirstName?.trim() || 'Teste',
          // O primeiro envio e os nós "Enviar Template" saem por este número. O nó
          // "Responder no WhatsApp" segue a instância da CONVERSA — se o telefone de
          // teste já tinha conversa por outro número, a resposta sai por ele.
          ...(effectiveInstanceId ? { whatsapp_instance_id: effectiveInstanceId } : {}),
          explicit_instance_choice: escolhaExplicita,
        },
      });

      if (error) throw new Error(await mensagemRealDoErro(error));
      if (data?.error) throw new Error(typeof data.error === 'string' ? data.error : JSON.stringify(data.error));
      if (!data?.test_run_id) throw new Error('Resposta inválida do servidor');

      setTestRunId(data.test_run_id);
      setStatus('idle');
    } catch (err: any) {
      setStatus('error');
      setErrorMessage(err.message || 'Erro ao iniciar teste interativo');
    } finally {
      setStartingTest(false);
    }
  };

  const handleCancelInteractive = async () => {
    if (!testRunId) return;
    try {
      await supabase
        .from('workflow_test_runs' as any)
        .update({ status: 'cancelled', finished_at: new Date().toISOString() })
        .eq('id', testRunId);
    } catch (err) {
      console.error('Cancel error', err);
    }
    setTestRunId(null);
    onActiveTestNodeChange?.(null);
  };

  const handleClose = (open: boolean) => {
    if (!open) {
      setStatus('idle');
      setErrorMessage('');
      setDiagnostic(null);
      setDiagOpen(false);
      // Limpa highlight do canvas, mas mantém testRunId para usuário poder reabrir
      onActiveTestNodeChange?.(null);
    }
    onOpenChange(open);
  };

  const handleNewInteractive = () => {
    setTestRunId(null);
    setStatus('idle');
    setErrorMessage('');
    onActiveTestNodeChange?.(null);
  };

  const selectedTemplate = templates.find(t => t.id === selectedTemplateId);
  const bodyText = selectedTemplate
    ? normalizeTemplateComponents(selectedTemplate.components).find((c: any) => c?.type === 'BODY')?.text
    : null;

  // Corpo do template com os parâmetros digitados aplicados em tempo real.
  // Parâmetro vazio mantém o placeholder ({{...}}), que o preview destaca.
  const previewMessage = useMemo(() => {
    let texto = typeof bodyText === 'string' ? bodyText : '';
    paramLabels.forEach((label, i) => {
      const valor = paramValues[i]?.trim();
      if (!valor) return;
      const escapado = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      texto = texto.replace(new RegExp(`\\{\\{\\s*${escapado}\\s*\\}\\}`, 'g'), valor);
    });
    return texto;
  }, [bodyText, paramLabels, paramValues]);

  const isInteractiveRunning = mode === 'interactive' && !!testRunId && (runStatus === 'running' || runStatus === 'waiting_reply');

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PlayCircle className="h-5 w-5 text-primary" />
            Testar Workflow
          </DialogTitle>
          <DialogDescription>
            {workflowName
              ? `Teste do workflow "${workflowName}"`
              : 'Envie um template para testar o workflow.'}
          </DialogDescription>
        </DialogHeader>

        {firstSendNode && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-md px-3 py-2">
            <Info className="h-3.5 w-3.5 flex-shrink-0" />
            <span>
              Nó de envio detectado: <strong>{firstSendNode.type === 'send-template' ? 'Enviar Template' : 'WhatsApp'}</strong>
              {firstSendNode.type === 'send-template' && (firstSendNode.data?.config as any)?.templateName && (
                <> — template: <strong>{(firstSendNode.data?.config as any).templateName}</strong></>
              )}
            </span>
          </div>
        )}

        {isWorkflowActive === false && (
          <Alert className="border-warning bg-warning/10">
            <AlertTriangle className="h-4 w-4 text-warning" />
            <AlertDescription className="text-warning dark:text-warning text-xs">
              <strong>Workflow desativado.</strong> Pedidos reais não vão disparar este workflow. Ative-o após o teste.
            </AlertDescription>
          </Alert>
        )}

        {/* Fica FORA das Tabs de propósito: (1) as duas abas compartilham o mesmo estado de
            número/template, e um render só evita divergência entre elas; (2) dentro das abas o
            formulário inteiro está sob o ternário `templates.length === 0` — escolher um número
            sem template esconderia o próprio seletor e deixaria o usuário sem saída. */}
        {!(mode === 'interactive' && testRunId) && (
          <WhatsAppInstanceSelector
            sellerId={sellerId}
            label="Número que vai enviar o teste"
            selectedInstanceId={selectedInstanceId}
            useDefault={useDefaultInstance}
            /* ATENÇÃO à ordem: ao ligar "usar padrão" o seletor chama onUseDefaultChange(true)
               e LOGO DEPOIS onInstanceChange(undefined). Por isso só desligamos "usar padrão"
               quando chega um id de verdade — senão o Switch liga e volta sozinho. */
            onInstanceChange={(id) => { setSelectedInstanceId(id); if (id) setUseDefaultInstance(false); }}
            onUseDefaultChange={(v) => { setUseDefaultInstance(v); if (v) setSelectedInstanceId(undefined); }}
            disabled={status === 'testing' || startingTest}
          />
        )}

        {/* Aviso honesto sobre o alcance da escolha. No modo interativo o número vale
            para o template inicial e para os nós "Enviar Template"; os nós "Responder no
            WhatsApp" e o agente de IA têm rodízio próprio. Enquanto o
            process-workflow-queue não for publicado, nem os "Enviar Template" seguem a
            escolha — então prometer "o fluxo inteiro" seria mentira na tela. */}
        {mode === 'interactive' && !testRunId && !useDefaultInstance && selectedInstanceId && (
          <p className="text-xs text-muted-foreground">
            O template inicial sai por este número. Nós de resposta automática podem sair
            por outro, se o telefone de teste já tiver conversa aberta.
          </p>
        )}

        <Tabs value={mode} onValueChange={(v) => setMode(v as any)} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="simple" disabled={isInteractiveRunning}>
              <MessageSquare className="h-3.5 w-3.5 mr-1.5" />
              Simples (1 envio)
            </TabsTrigger>
            <TabsTrigger value="interactive" disabled={status === 'testing'}>
              <Sparkles className="h-3.5 w-3.5 mr-1.5" />
              Interativo (fluxo completo)
            </TabsTrigger>
          </TabsList>

          {/* ============= SIMPLE TAB ============= */}
          <TabsContent value="simple" className="space-y-4 mt-4">
            {status === 'success' && (
              <Alert className="border-primary bg-primary/10">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                <AlertDescription className="text-primary dark:text-primary">
                  Mensagem aceita pela Meta! Verifique o WhatsApp em até 1 minuto.
                  {diagnostic?.wamid && (
                    <div className="mt-1 font-mono text-[10px] opacity-70">wamid: {diagnostic.wamid}</div>
                  )}
                </AlertDescription>
              </Alert>
            )}

            {status === 'error' && (
              <Alert variant="destructive">
                <XCircle className="h-4 w-4" />
                <AlertDescription>{errorMessage}</AlertDescription>
              </Alert>
            )}

            {diagnostic && (
              <Collapsible open={diagOpen} onOpenChange={setDiagOpen}>
                <CollapsibleTrigger asChild>
                  <button className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground w-full transition-colors px-3 py-1.5 rounded-md bg-muted/40 hover:bg-muted/70">
                    <Terminal className="h-3.5 w-3.5" />
                    <span className="font-medium">Diagnóstico técnico</span>
                    <ChevronDown className={`h-3 w-3 ml-auto transition-transform ${diagOpen ? 'rotate-180' : ''}`} />
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="mt-1 rounded-md bg-muted/60 border border-border p-3 font-mono text-[10px] space-y-1 text-muted-foreground">
                    <div><span className="text-foreground font-semibold">seller_id:</span> {diagnostic.sellerId || '⚠️ não definido'}</div>
                    {diagnostic.templateName && <div><span className="text-foreground font-semibold">template:</span> {diagnostic.templateName} ({diagnostic.paramsCount ?? 0} parâmetros)</div>}
                    {diagnostic.phoneNumberId && <div><span className="text-foreground font-semibold">phone_number_id:</span> {diagnostic.phoneNumberId}</div>}
                    {diagnostic.instanceId && <div><span className="text-foreground font-semibold">instance_id:</span> {diagnostic.instanceId}</div>}
                    {diagnostic.wamid && <div><span className="text-primary dark:text-primary font-semibold">wamid:</span> {diagnostic.wamid}</div>}
                    {diagnostic.metaErrorCode && <div><span className="text-destructive font-semibold">código Meta:</span> {diagnostic.metaErrorCode}</div>}
                    {diagnostic.rawError && (
                      <div className="mt-1 pt-1 border-t border-border">
                        <span className="text-destructive font-semibold">erro:</span>
                        <pre className="whitespace-pre-wrap break-all mt-0.5 text-[9px] opacity-80">{diagnostic.rawError}</pre>
                      </div>
                    )}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            )}

            {loadingTemplates ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : templates.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground border rounded-lg bg-muted/30">
                <AlertTriangle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm font-medium">Nenhum template aprovado para este número</p>
                <p className="text-xs mt-1">Escolha outro número acima ou aprove um template para ele.</p>
                <p className="text-[10px] mt-2 font-mono opacity-60">seller_id: {sellerId?.substring(0, 16)}...</p>
              </div>
            ) : (
              <form onSubmit={handleSubmitSimple} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="test_phone">WhatsApp para receber o teste *</Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="test_phone"
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value.replace(/\D/g, ''))}
                      placeholder="41999999999"
                      className="pl-10"
                      required
                      disabled={status === 'testing'}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">DDD + Número (o +55 é adicionado automaticamente)</p>
                </div>

                <div className="space-y-2">
                  <Label>Template aprovado</Label>
                  <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId} disabled={status === 'testing'}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione um template" />
                    </SelectTrigger>
                    <SelectContent>
                      {templates.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          <div className="flex items-center gap-2">
                            <MessageSquare className="h-3.5 w-3.5 text-primary" />
                            <span>{t.name}</span>
                            <Badge variant="outline" className="text-[10px] ml-1">{t.category}</Badge>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {bodyText && (
                  <div className="rounded-lg p-3 text-sm shadow-sm max-h-24 overflow-y-auto bg-primary/10 dark:bg-primary/30 text-primary dark:text-primary">
                    {bodyText}
                  </div>
                )}

                {paramValues.length > 0 && (
                  <div className="space-y-2 p-3 border rounded-lg bg-muted/20">
                    <Label className="text-xs font-medium flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3 text-warning" />
                      {paramValues.length} parâmetro(s) do template
                    </Label>
                    {paramValues.map((val, idx) => (
                      <div key={idx} className="space-y-1">
                        <Label className="text-[10px] text-muted-foreground">
                          {paramLabels[idx] || `Parâmetro ${idx + 1}`}
                        </Label>
                        <Input
                          placeholder={`Valor para ${paramLabels[idx] || `{{${idx + 1}}}`}`}
                          value={val}
                          onChange={(e) => {
                            const newValues = [...paramValues];
                            newValues[idx] = e.target.value;
                            setParamValues(newValues);
                          }}
                          className="text-sm"
                          disabled={status === 'testing'}
                        />
                      </div>
                    ))}
                  </div>
                )}

                <Alert className="bg-muted/50">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription className="text-xs">
                    O teste enviará uma mensagem real via WhatsApp Cloud API. Apenas o template inicial — não simula respostas.
                  </AlertDescription>
                </Alert>

                <div className="flex gap-2 pt-2">
                  <Button type="button" variant="outline" onClick={() => handleClose(false)} className="flex-1" disabled={status === 'testing'}>
                    Cancelar
                  </Button>
                  <Button type="submit" className="flex-1 bg-primary hover:bg-primary" disabled={status === 'testing' || !phoneNumber || !selectedTemplateId}>
                    {status === 'testing' ? (
                      <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Enviando...</>
                    ) : (
                      <><PlayCircle className="h-4 w-4 mr-2" />Enviar Teste</>
                    )}
                  </Button>
                </div>
              </form>
            )}
          </TabsContent>

          {/* ============= INTERACTIVE TAB ============= */}
          <TabsContent value="interactive" className="space-y-4 mt-4">
            {!testRunId ? (
              <>
                <Alert className="border-primary/30 bg-primary/5">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <AlertDescription className="text-xs">
                    <strong>Modo interativo:</strong> envia o template inicial, escuta sua resposta real e percorre o workflow completo. Delays são pulados automaticamente.
                  </AlertDescription>
                </Alert>

                {status === 'error' && (
                  <Alert variant="destructive">
                    <XCircle className="h-4 w-4" />
                    <AlertDescription>{errorMessage}</AlertDescription>
                  </Alert>
                )}

                {loadingTemplates ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : templates.length === 0 ? (
                  <div className="text-center py-6 text-muted-foreground border rounded-lg bg-muted/30">
                    <AlertTriangle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm font-medium">Nenhum template aprovado para este número</p>
                    <p className="text-xs mt-1">Escolha outro número acima ou aprove um template para ele.</p>
                  </div>
                ) : (
                  <form onSubmit={handleStartInteractive} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="i_phone">WhatsApp do destinatário *</Label>
                      <div className="relative">
                        <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="i_phone"
                          value={phoneNumber}
                          onChange={(e) => setPhoneNumber(e.target.value.replace(/\D/g, ''))}
                          placeholder="41999999999"
                          className="pl-10"
                          required
                          disabled={startingTest}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">Vai escutar respostas deste número via webhook real.</p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="i_name">Primeiro nome (para variável dinâmica)</Label>
                      <Input
                        id="i_name"
                        value={clientFirstName}
                        onChange={(e) => setClientFirstName(e.target.value)}
                        placeholder="Teste"
                        disabled={startingTest}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Template inicial</Label>
                      <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId} disabled={startingTest}>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione um template" />
                        </SelectTrigger>
                        <SelectContent>
                          {templates.map((t) => (
                            <SelectItem key={t.id} value={t.id}>
                              <div className="flex items-center gap-2">
                                <MessageSquare className="h-3.5 w-3.5 text-primary" />
                                <span>{t.name}</span>
                                <Badge variant="outline" className="text-[10px] ml-1">{t.category}</Badge>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {paramValues.length > 0 && (
                      <div className="space-y-2 p-3 border rounded-lg bg-muted/20">
                        <Label className="text-xs font-medium">Parâmetros do template</Label>
                        {paramValues.map((val, idx) => (
                          <div key={idx} className="space-y-1">
                            <Label className="text-[10px] text-muted-foreground">
                              {paramLabels[idx] || `Parâmetro ${idx + 1}`}
                            </Label>
                            <Input
                              value={val}
                              onChange={(e) => {
                                const next = [...paramValues];
                                next[idx] = e.target.value;
                                setParamValues(next);
                              }}
                              className="text-sm"
                              disabled={startingTest}
                            />
                          </div>
                        ))}
                      </div>
                    )}

                    {selectedTemplate && (
                      <div className="space-y-2">
                        <Label className="text-xs font-medium">Prévia do template</Label>
                        <TemplatePreview
                          sellerId={sellerId}
                          tpl={{
                            channel: 'whatsapp',
                            name: selectedTemplate.name,
                            inline: { message: previewMessage },
                          }}
                        />
                      </div>
                    )}

                    <div className="flex gap-2 pt-2">
                      <Button type="button" variant="outline" onClick={() => handleClose(false)} className="flex-1" disabled={startingTest}>
                        Cancelar
                      </Button>
                      <Button type="submit" className="flex-1" disabled={startingTest || !phoneNumber || !selectedTemplateId || !workflowId}>
                        {startingTest ? (
                          <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Iniciando...</>
                        ) : (
                          <><Sparkles className="h-4 w-4 mr-2" />Iniciar Teste Interativo</>
                        )}
                      </Button>
                    </div>
                  </form>
                )}
              </>
            ) : (
              <>
                <WorkflowTestTimeline events={events} status={runStatus} />

                {runStatus === 'waiting_reply' && (
                  <Alert className="border-warning/30 bg-warning/5">
                    <MessageSquare className="h-4 w-4 text-warning" />
                    <AlertDescription className="text-xs">
                      Responda no WhatsApp do número <strong>{phoneNumber}</strong> para continuar o fluxo.
                    </AlertDescription>
                  </Alert>
                )}

                {runStatus === 'completed' && (
                  <Alert className="border-primary/30 bg-primary/10">
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                    <AlertDescription className="text-xs text-primary dark:text-primary">
                      Workflow concluído com sucesso!
                    </AlertDescription>
                  </Alert>
                )}

                {runStatus === 'error' && (
                  <Alert variant="destructive">
                    <XCircle className="h-4 w-4" />
                    <AlertDescription className="text-xs">
                      Ocorreu um erro durante a execução. Veja a timeline para detalhes.
                    </AlertDescription>
                  </Alert>
                )}

                <div className="flex gap-2 pt-2">
                  {(runStatus === 'running' || runStatus === 'waiting_reply') ? (
                    <Button type="button" variant="destructive" onClick={handleCancelInteractive} className="flex-1">
                      <StopCircle className="h-4 w-4 mr-2" />
                      Encerrar teste
                    </Button>
                  ) : (
                    <Button type="button" variant="outline" onClick={handleNewInteractive} className="flex-1">
                      Novo teste
                    </Button>
                  )}
                  <Button type="button" variant="outline" onClick={() => handleClose(false)} className="flex-1">
                    Fechar
                  </Button>
                </div>
              </>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};

export default TestWorkflowDialog;
