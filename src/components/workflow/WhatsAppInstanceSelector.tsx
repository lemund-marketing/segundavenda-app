import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Loader2, Phone } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Link } from 'react-router-dom';
import { useWhatsAppCloudInstances, WhatsAppCloudInstance } from '@/hooks/useWhatsAppCloudInstances';

interface WhatsAppInstanceSelectorProps {
  selectedInstanceId?: string;
  useDefault?: boolean;
  onInstanceChange: (instanceId: string | undefined) => void;
  onUseDefaultChange: (useDefault: boolean) => void;
  label?: string;
  /** Quando informado, lista os números DESTE seller (e não os do usuário logado). */
  sellerId?: string;
  disabled?: boolean;
}

/**
 * Motivo pelo qual a instância não pode disparar — null = saudável.
 * Espelha as duas redes de segurança do servidor, que hoje divergem entre si:
 * o badStatus do envio (send-whatsapp-cloud/index.ts) e o circuit breaker
 * (_shared/whatsapp-guards.ts), que é quem barra `restricted`. Bloquear aqui
 * só antecipa uma falha que aconteceria de qualquer jeito no envio.
 */
export function motivoBloqueio(instance: WhatsAppCloudInstance): string | null {
  if (instance.dispatch_enabled === false) return 'Disparos desligados';
  switch (String(instance.status || '').toLowerCase()) {
    case 'restricted': return 'Restrito pela Meta';
    case 'banned': return 'Banido pela Meta';
    case 'disconnected':
    case 'error': return 'Conexão quebrada';
    case 'pending_registration': return 'Registro pendente';
    default: return null;
  }
}

function formatInstanceName(instance: WhatsAppCloudInstance) {
  const displayName = instance.display_name?.trim();
  const label = instance.label?.trim();
  const phone = instance.business_phone_number;

  // Preferência: nome de exibição oficial da Meta > label customizado do seller > "Principal"
  const primaryName = displayName || label || 'Principal';

  return (
    <span className="flex items-center gap-2 flex-wrap">
      <span className="font-medium">{primaryName}</span>
      {label && displayName && label !== displayName && (
        <span className="text-xs text-muted-foreground">({label})</span>
      )}
      {phone && (
        <span className="text-muted-foreground">({phone})</span>
      )}
    </span>
  );
}

export function WhatsAppInstanceSelector({
  selectedInstanceId,
  useDefault = true,
  onInstanceChange,
  onUseDefaultChange,
  label = 'Número WhatsApp',
  sellerId,
  disabled = false,
}: WhatsAppInstanceSelectorProps) {
  const { instances, loading } = useWhatsAppCloudInstances(sellerId);

  const defaultInstance = instances.find(i => i.is_default);
  const hasMultipleInstances = instances.length > 1;

  if (loading) {
    return (
      <div className="space-y-2">
        <Label>{label}</Label>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando números...
        </div>
      </div>
    );
  }

  if (instances.length === 0) {
    return (
      <div className="space-y-2">
        <Label>{label}</Label>
        <Alert>
          <Phone className="h-4 w-4" />
          <AlertDescription>
            Nenhum número WhatsApp Cloud configurado.{' '}
            <Link to="/account" className="underline">
              Conecte um agora
            </Link>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // Single instance - just show info
  if (!hasMultipleInstances) {
    return (
      <div className="space-y-2">
        <Label>{label}</Label>
        <div className="flex items-center gap-2 p-3 rounded-md border bg-muted/30">
          <Phone className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm">
            {formatInstanceName(instances[0])}
          </span>
        </div>
      </div>
    );
  }

  // Multiple instances - show selector
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label htmlFor="use-default-instance">{label}</Label>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Usar padrão</span>
          <Switch
            id="use-default-instance"
            checked={useDefault}
            disabled={disabled}
            onCheckedChange={(checked) => {
              onUseDefaultChange(checked);
              if (checked) {
                onInstanceChange(undefined);
              }
            }}
          />
        </div>
      </div>

      {useDefault ? (
        <div className="flex items-center gap-2 p-3 rounded-md border bg-muted/30">
          <Phone className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm">
            {defaultInstance ? formatInstanceName(defaultInstance) : 'Nenhum número padrão'}
          </span>
          <span className="text-xs text-primary ml-auto">Padrão</span>
        </div>
      ) : (
        <Select
          value={selectedInstanceId}
          onValueChange={onInstanceChange}
          disabled={disabled}
        >
          <SelectTrigger>
            <SelectValue placeholder="Selecione um número" />
          </SelectTrigger>
          <SelectContent>
            {instances.map((instance) => {
              // Número problemático fica visível porém desabilitado, com o motivo:
              // sumir com um número que o seller sabe que tem parece defeito.
              const motivo = motivoBloqueio(instance);
              const blocked = !!motivo;
              return (
                <SelectItem key={instance.id} value={instance.id} disabled={blocked}>
                  <div className="flex items-center gap-2">
                    {formatInstanceName(instance)}
                    {instance.is_default && !blocked && (
                      <span className="text-xs text-primary">Padrão</span>
                    )}
                    {blocked && (
                      <span className="text-xs text-destructive">{motivo}</span>
                    )}
                  </div>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      )}
      
      <p className="text-xs text-muted-foreground">
        {instances.length} número{instances.length !== 1 ? 's' : ''} configurado{instances.length !== 1 ? 's' : ''}
      </p>
    </div>
  );
}

