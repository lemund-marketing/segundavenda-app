import { useNavigate } from "react-router-dom";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Mail, MapPin, FileText, User as UserIcon, Cake } from "lucide-react";
import { formatDocument } from "@/utils/formatters";
import { format, parseISO, differenceInYears } from "date-fns";
import { ptBR } from "date-fns/locale";
import WhatsAppIcon from "@/components/WhatsAppIcon";
import { maskPhone, maskEmail, maskCPF } from "@/utils/showcaseMask";
import { CardWrap } from "./shared";

interface Props {
  client: any;
  sellerId: string;
  masked?: boolean;
  /** Sobrescreve o clique no telefone (default: navega para /omnichannel). */
  onConversar?: () => void;
  /** Tags depois da mudança + catálogo do seller, para quem guarda as tags fora do react-query. */
  onTagsChanged?: (tagIds: string[], catalogo: { id: string; name: string; color?: string | null }[]) => void;
}

const GENEROS: Record<string, string> = {
  male: "Masculino",
  female: "Feminino",
  other: "Outro",
  unknown: "Não informado",
};

export function ClientOverviewTab({ client, sellerId, masked = false, onConversar, onTagsChanged }: Props) {
  const navigate = useNavigate();

  const nascimento = client?.birthdate ? parseISO(client.birthdate) : null;
  const idade = nascimento ? differenceInYears(new Date(), nascimento) : (client?.age ?? null);
  // O e-mail às vezes vem com mais de um endereço separado por vírgula/ponto-e-vírgula.
  const email = client?.email ? String(client.email).split(/[,;]/)[0].trim() : null;
  const temEndereco = client?.street || client?.city || client?.zip_code;

  return (
    <div className="space-y-5">
      <CardWrap icon={<UserIcon className="h-4 w-4" />} title="Informações de Contato">
        <div className="space-y-3 text-sm">
          {client?.whatsapp ? (
            <div className="flex items-center gap-3">
              <WhatsAppIcon className="h-4 w-4 text-muted-foreground shrink-0" />
              {masked ? (
                <span>{maskPhone(client.whatsapp)}</span>
              ) : (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        // `client_id` (não `client`): é o parâmetro que o Omnichannel lê.
                        onClick={onConversar ?? (() => navigate(`/omnichannel?client_id=${client?.id}`))}
                        className="text-primary underline sm:no-underline sm:hover:underline font-medium"
                      >
                        {client.whatsapp}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>Clique pra abrir a conversa</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
          ) : (
            <p className="text-muted-foreground text-xs">Sem WhatsApp cadastrado</p>
          )}

          {email && (
            <div className="flex items-center gap-3">
              <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
              {masked ? (
                <span className="truncate">{maskEmail(email)}</span>
              ) : (
                <a href={`mailto:${email}`} className="underline sm:no-underline sm:hover:underline truncate">{email}</a>
              )}
            </div>
          )}

          {client?.document && (
            <div className="flex items-center gap-3">
              <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
              <span>
                {client.document_type?.toUpperCase() ?? ((client.document ?? "").replace(/\D/g, "").length > 11 ? "CNPJ" : "CPF")}: {masked ? maskCPF(client.document) : formatDocument(client.document)}
              </span>
            </div>
          )}

          {client?.gender && (
            <div className="flex items-center gap-3">
              <UserIcon className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="capitalize">{GENEROS[String(client.gender).toLowerCase()] || client.gender}</span>
            </div>
          )}

          {(nascimento || idade !== null) && (
            <div className="flex items-center gap-3">
              <Cake className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="font-medium">
                {nascimento ? format(nascimento, "dd/MM/yyyy", { locale: ptBR }) : "Idade"}
                {idade !== null && (
                  <span className="text-muted-foreground font-normal ml-1">({idade} anos)</span>
                )}
              </span>
            </div>
          )}
        </div>
      </CardWrap>

      {temEndereco && (
        <CardWrap icon={<MapPin className="h-4 w-4" />} title="Endereço">
          <div className="text-sm space-y-0.5">
            {!masked && client.street && <p className="font-semibold">{client.street}</p>}
            {!masked && client.complement && <p className="text-muted-foreground">{client.complement}</p>}
            {(client.city || client.state_code) && (
              <p>
                {masked ? "•••" : (client.city ?? "")}
                {client.city && client.state_code ? " — " : ""}
                {client.state_code ?? ""}
              </p>
            )}
            {!masked && client.zip_code && (
              <p className="text-muted-foreground text-xs mt-1">CEP {client.zip_code}</p>
            )}
          </div>
        </CardWrap>
      )}
    </div>
  );
}
