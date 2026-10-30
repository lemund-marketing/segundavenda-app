import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";

interface TemplateParamsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: any;
  client: any;
  lastOrder?: any;
  onSend: (params: Array<{ type: string; parameters: Array<{ type: string; text: string }> }>) => void;
  sending: boolean;
}

export function TemplateParamsDialog({
  open,
  onOpenChange,
  template,
  client,
  lastOrder,
  onSend,
  sending,
}: TemplateParamsDialogProps) {
  const [paramValues, setParamValues] = useState<string[]>([]);
  const [variableCount, setVariableCount] = useState(0);

  const normalizeComponents = (raw: any): any[] => {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    if (typeof raw === "string") {
      try {
        const parsed = JSON.parse(raw);
        return normalizeComponents(parsed);
      } catch {
        return [];
      }
    }
    if (typeof raw === "object" && Array.isArray(raw.components)) return raw.components;
    return [];
  };

  const getBodyText = (tmpl: any): string => {
    if (!tmpl) return "";

    if (typeof tmpl.body_text === "string") return tmpl.body_text;

    const components = normalizeComponents(tmpl.components);
    const body = components.find((c: any) => String(c?.type || "").toUpperCase() === "BODY");
    return typeof body?.text === "string" ? body.text : "";
  };

  const getVariableCount = (text: string): number => {
    const matches = text.match(/\{\{(\d+)\}\}/g);
    if (!matches) return 0;

    let max = 0;
    for (const m of matches) {
      const n = Number(m.replace(/[{}]/g, ""));
      if (Number.isFinite(n)) max = Math.max(max, n);
    }
    return max;
  };

  const formatOrderValue = (value: any, currency: string = "BRL") => {
    const num = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(num)) return "";
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency,
    }).format(num);
  };

  useEffect(() => {
    if (!template || !open) return;

    const bodyText = getBodyText(template);
    const count = getVariableCount(bodyText);
    setVariableCount(count);

    const firstName = client?.full_name?.split(" ")?.[0] || "";
    const lastProduct = lastOrder?.product || "";
    const lastOrderId = lastOrder?.external_order_id || "";
    const lastOrderValue = formatOrderValue(lastOrder?.total_amount, lastOrder?.currency || "BRL");
    const lastMarketplace = lastOrder?.marketplace || "";

    const initialValues: string[] = [];
    for (let i = 0; i < count; i++) {
      if (i === 0) initialValues.push(firstName);
      else if (i === 1) initialValues.push(lastProduct || lastOrderId);
      else if (i === 2) initialValues.push(lastOrderValue);
      else if (i === 3) initialValues.push(lastMarketplace);
      else initialValues.push("");
    }

    setParamValues(initialValues);
  }, [template, client, lastOrder, open]);

  const handleSend = () => {
    if (sending) return; // previne duplo envio
    // Construir o formato correto para a API da Meta
    const components: Array<{ type: string; parameters: Array<{ type: string; text: string }> }> = [];
    
    if (paramValues.length > 0) {
      components.push({
        type: 'body',
        parameters: paramValues.map(value => ({
          type: 'text',
          text: value,
        })),
      });
    }

    onSend(components);
  };

  const getBodyPreview = () => {
    if (!template) return "";

    let text = getBodyText(template);

    // Substituir variáveis pelos valores
    paramValues.forEach((value, index) => {
      text = text.replace(`{{${index + 1}}}`, value || `[Parâmetro ${index + 1}]`);
    });

    return text;
  };

  if (!template) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Enviar Template: {template.name}</DialogTitle>
          <DialogDescription>
            {variableCount > 0 
              ? 'Preencha os parâmetros do template antes de enviar.'
              : 'Confirme o envio do template.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Campos de parâmetros */}
          {paramValues.map((value, index) => (
            <div key={index} className="space-y-2">
              <Label htmlFor={`param-${index}`}>
                Parâmetro {index + 1} {index === 0 && '(Nome do cliente)'}
              </Label>
              <Input
                id={`param-${index}`}
                value={value}
                onChange={(e) => {
                  const newValues = [...paramValues];
                  newValues[index] = e.target.value;
                  setParamValues(newValues);
                }}
                placeholder={`Digite o valor para {{${index + 1}}}`}
              />
            </div>
          ))}

          {/* Preview */}
          <div className="space-y-2">
            <Label>Prévia da mensagem</Label>
            <div className="bg-muted p-3 rounded-lg text-sm whitespace-pre-wrap">
              {getBodyPreview() || 'Carregando...'}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
            Cancelar
          </Button>
          <Button 
            onClick={handleSend} 
            disabled={sending || paramValues.some(v => !v.trim())}
          >
            {sending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Enviando...
              </>
            ) : (
              'Enviar Template'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
