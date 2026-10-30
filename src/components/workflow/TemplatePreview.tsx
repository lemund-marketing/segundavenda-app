import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Loader2, Mail, MessageSquare } from 'lucide-react';
import { ReactNode } from 'react';
import WhatsAppIcon from '@/components/WhatsAppIcon';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { summarizeSms } from '@/utils/sms';

export type TemplateChannel = 'whatsapp' | 'sms' | 'email';

export interface TemplateRef {
  channel: TemplateChannel;
  /** UUID do registro (sms_templates/email_templates). WhatsApp normalmente vem por nome. */
  id?: string;
  name?: string;
  /** Rótulo do chip que abre este preview. */
  label?: string;
  /** Conteúdo escrito no próprio nó (texto livre) — renderiza direto, sem ir ao banco. */
  inline?: { message?: string; subject?: string; html?: string };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Destaca as variáveis do texto: `{{1}}` / `{{ nome }}` (WhatsApp, posicionais da
 * Meta) e `{primeiro_nome}` (variáveis dinâmicas do executor daqui).
 */
function highlightVars(text: string): ReactNode[] {
  return (text || '')
    .split(/(\{\{\s*[\w.]+\s*\}\}|\{\s*[\w.]+\s*\})/g)
    .map((parte, i) =>
      /^\{/.test(parte) ? (
        <span
          key={i}
          className="rounded-sm bg-primary/10 px-1 text-[11px] font-medium text-primary"
        >
          {parte}
        </span>
      ) : (
        <span key={i}>{parte}</span>
      )
    );
}

const CANAIS = {
  whatsapp: { rotulo: 'WhatsApp', cor: 'text-emerald-600 dark:text-emerald-400' },
  sms: { rotulo: 'SMS', cor: 'text-blue-600 dark:text-blue-400' },
  email: { rotulo: 'E-mail', cor: 'text-sky-600 dark:text-sky-400' },
} as const;

function ChannelIcon({ channel, className }: { channel: TemplateChannel; className?: string }) {
  if (channel === 'whatsapp') return <WhatsAppIcon size={14} className={className} />;
  if (channel === 'sms') return <MessageSquare className={cn('h-3.5 w-3.5', className)} />;
  return <Mail className={cn('h-3.5 w-3.5', className)} />;
}

/** Moldura comum dos três canais: barra de identificação + corpo. */
function Moldura({
  channel,
  nome,
  children,
}: {
  channel: TemplateChannel;
  nome?: string | null;
  children: ReactNode;
}) {
  const canal = CANAIS[channel];
  return (
    <div className="overflow-hidden rounded-md border border-border bg-card">
      <div className="flex items-center gap-1.5 border-b border-border bg-muted/60 px-3 py-1.5 text-[11px] font-medium text-foreground">
        <ChannelIcon channel={channel} className={canal.cor} />
        <span>{canal.rotulo}</span>
        {nome && <span className="truncate text-muted-foreground">· {nome}</span>}
      </div>
      {children}
    </div>
  );
}

interface LinhaTemplate {
  name?: string | null;
  display_name?: string | null;
  components?: unknown;
  body?: string | null;
  subject_template?: string | null;
  body_template?: string | null;
}

/** Card renderizado de um template (WhatsApp/SMS/E-mail) com o conteúdo real do banco. */
export function TemplatePreview({ sellerId, tpl }: { sellerId: string; tpl: TemplateRef }) {
  const porId = !!tpl.id && UUID_RE.test(tpl.id);

  const { data, isLoading } = useQuery<LinhaTemplate | null>({
    queryKey: ['ai-tpl-preview', sellerId, tpl.channel, tpl.id ?? null, tpl.name ?? null],
    enabled: !!sellerId && !tpl.inline && (porId || !!tpl.name),
    staleTime: 60_000,
    queryFn: async () => {
      // sms_templates/email_templates ainda não estão no types.ts gerado — cast necessário.
      const db = supabase as any;
      const tabela =
        tpl.channel === 'whatsapp'
          ? 'whatsapp_templates'
          : tpl.channel === 'sms'
            ? 'sms_templates'
            : 'email_templates';
      const colunas =
        tpl.channel === 'whatsapp'
          ? 'name, components'
          : tpl.channel === 'sms'
            ? 'name, body'
            : 'name, display_name, subject_template, body_template';

      let q = db.from(tabela).select(colunas).eq('seller_id', sellerId);
      // Filtrar por um id que não é uuid derruba a query inteira (22P02): quando a
      // IA devolve só o nome, é por ele que a busca tem que ir.
      q = porId ? q.eq('id', tpl.id) : q.eq('name', tpl.name || '');

      const { data: linha, error } = await q.limit(1).maybeSingle();
      if (error) {
        console.warn('[TemplatePreview] erro ao carregar template:', error.message);
        return null;
      }
      return (linha as LinhaTemplate) ?? null;
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-3 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando preview…
      </div>
    );
  }

  if (!tpl.inline && !data) {
    return (
      <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-700 dark:border-amber-400/30 dark:bg-amber-500/10 dark:text-amber-300">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
        <span>
          Template não encontrado no cadastro deste cliente
          {tpl.name || tpl.id ? ` (${tpl.name || tpl.id})` : ''}.
        </span>
      </div>
    );
  }

  const nomeExibido = data?.display_name || data?.name || tpl.name || null;

  // ---------------------------------------------------------------- WhatsApp --
  if (tpl.channel === 'whatsapp') {
    const comps: any[] = Array.isArray(data?.components) ? (data!.components as any[]) : [];
    const header = comps.find((c) => c?.type === 'HEADER');
    const body = comps.find((c) => c?.type === 'BODY');
    const footer = comps.find((c) => c?.type === 'FOOTER');
    const botoes: any[] = comps.find((c) => c?.type === 'BUTTONS')?.buttons || [];
    const texto = tpl.inline?.message ?? body?.text ?? '';

    return (
      <Moldura channel="whatsapp" nome={nomeExibido}>
        <div className="bg-muted/40 p-3">
          <div className="max-w-[92%] overflow-hidden rounded-md rounded-tl-sm border border-border bg-card shadow-sm">
            {header?.format === 'TEXT' && header?.text && (
              <div className="px-3 pb-1 pt-2.5 text-sm font-semibold text-foreground">
                {highlightVars(header.text)}
              </div>
            )}
            {header && header.format !== 'TEXT' && (
              <div className="flex h-16 items-center justify-center bg-muted text-[11px] text-muted-foreground">
                {header.format === 'IMAGE'
                  ? 'Imagem de cabeçalho'
                  : header.format === 'VIDEO'
                    ? 'Vídeo de cabeçalho'
                    : 'Documento no cabeçalho'}
              </div>
            )}

            <div className="whitespace-pre-wrap break-words px-3 py-2 text-sm leading-relaxed text-foreground">
              {highlightVars(texto)}
            </div>

            {footer?.text && (
              <div className="px-3 pb-2 text-[11px] text-muted-foreground">{footer.text}</div>
            )}

            {botoes.length > 0 && (
              <div className="divide-y divide-border border-t border-border">
                {botoes.map((b, i) => (
                  <div key={i} className="px-3 py-2 text-center text-xs font-medium text-primary">
                    {b?.text}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </Moldura>
    );
  }

  // --------------------------------------------------------------------- SMS --
  if (tpl.channel === 'sms') {
    const texto = tpl.inline?.message ?? data?.body ?? '';
    const stats = summarizeSms(texto);
    return (
      <Moldura channel="sms" nome={nomeExibido}>
        <div className="bg-muted/40 p-3">
          <div className="max-w-[92%] whitespace-pre-wrap break-words rounded-md rounded-tl-sm border border-border bg-card px-3 py-2 text-sm leading-relaxed text-foreground shadow-sm">
            {highlightVars(texto)}
          </div>
          <div
            className={cn(
              'mt-1.5 text-[10px]',
              stats.overLimit ? 'text-destructive' : 'text-muted-foreground'
            )}
          >
            {stats.length} caracteres · {stats.segments} SMS
            {stats.overLimit ? ' · acima do limite de envio' : ''}
          </div>
        </div>
      </Moldura>
    );
  }

  // ------------------------------------------------------------------ E-mail --
  const assunto = tpl.inline?.subject ?? data?.subject_template ?? '(sem assunto)';
  const html = tpl.inline?.html ?? data?.body_template ?? '';

  return (
    <Moldura channel="email" nome={nomeExibido}>
      <div className="border-b border-border px-3 py-2 text-xs">
        <span className="text-muted-foreground">Assunto: </span>
        <span className="font-medium text-foreground">{assunto}</span>
      </div>
      {/* sandbox="" (sem allow-scripts/allow-same-origin): o HTML do template é
          conteúdo do seller e roda isolado, sem script e sem acesso à sessão.
          Fundo branco fixo, e não token: corpo de e-mail é escrito assumindo
          fundo claro e ficaria ilegível sobre o card escuro. */}
      <iframe
        title="Pré-visualização do e-mail"
        sandbox=""
        srcDoc={
          html ||
          '<p style="font-family:system-ui,sans-serif;color:#8a8a8a;padding:12px">Sem conteúdo.</p>'
        }
        className="h-56 w-full border-0 bg-white"
      />
    </Moldura>
  );
}
