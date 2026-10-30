import type { CSSProperties } from "react";
import { Mail, Smartphone } from "lucide-react";
import WhatsAppIcon from "@/components/WhatsAppIcon";
import { flattenOn, inkPair } from "@/utils/contrastInk";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export type OmniChannel = "whatsapp" | "sms" | "email";
/** `all` = a thread inteira, do jeito que ela é gravada (os três canais mesclados). */
export type ThreadChannel = "all" | OmniChannel;

interface ChannelToggleProps {
  value: ThreadChannel;
  onChange: (channel: ThreadChannel) => void;
  /**
   * Canais que ESTA conversa realmente tem (has_whatsapp / has_sms / has_email).
   * Os três botões aparecem sempre; canal ausente fica desabilitado — sem os antigos
   * selos no header, esta fileira é a única coisa que diz de que canais a conversa é feita.
   */
  available: OmniChannel[];
  size?: "sm" | "md";
  className?: string;
}

/** Cor de canal (identidade do canal, não da marca) compartilhada com o header. */
export const CHANNEL_META: Record<OmniChannel, { label: string; color: string }> = {
  whatsapp: { label: "WhatsApp", color: "#25D366" },
  sms: { label: "SMS", color: "#2563eb" },
  email: { label: "E-mail", color: "#a855f7" },
};

const CHANNELS: { id: OmniChannel; label: string; color: string }[] = [
  { id: "whatsapp", ...CHANNEL_META.whatsapp },
  { id: "sms", ...CHANNEL_META.sms },
  { id: "email", ...CHANNEL_META.email },
];

/** `--muted` dos dois temas: hsl(222 20% 94%) e hsl(240 4% 16%) — o trilho do grupo. */
const TRILHO_LIGHT = "#EDEFF3";
const TRILHO_DARK = "#27272A";
/** Alfa do "quadradinho" do canal ativo sobre o trilho. */
const TINTA_ATIVA = 0.18;

/**
 * Cores do botão, uma para cada tema.
 *
 * As três cores de canal são de MARCA (feitas para logo), não para texto: o verde
 * do WhatsApp sobre o trilho claro dá 1,7:1 e some, e o azul do SMS sobre o
 * quadradinho escuro dá 2,6:1 — abaixo do mínimo de 3:1 para elemento gráfico.
 * `inkPair` caminha a cor até cruzar o mínimo do WCAG medindo sobre o fundo REAL
 * (o quadradinho achatado, não o card), que é o mesmo tratamento que StageBadge e
 * StoreBadge já usam nesta base. Como o tema é escolhido pelo CSS, as duas tintas
 * viajam juntas em variáveis e o `dark:` decide.
 */
function coresDoCanal(cor: string) {
  const quadLight = flattenOn(cor, TINTA_ATIVA, TRILHO_LIGHT);
  const quadDark = flattenOn(cor, TINTA_ATIVA, TRILHO_DARK);
  const ativo = inkPair(cor, { light: quadLight, dark: quadDark });
  // Em repouso (`all`) o ícone cai direto sobre o trilho, que é outro fundo.
  const repouso = inkPair(cor, { light: TRILHO_LIGHT, dark: TRILHO_DARK });
  return {
    "--ch-quad": quadLight,
    "--ch-quad-dark": quadDark,
    "--ch-ink": ativo.light,
    "--ch-ink-dark": ativo.dark,
    // Contorno do quadradinho: a tinta legível a 70% sobre ele próprio. É o que
    // torna o "quadradinho" do desenho de referência realmente visível —
    // `bg-background` sobre `bg-muted` é ~1% de luminância no tema claro. A 70% a
    // borda fica entre 3,08:1 e 4,89:1 contra o trilho nos dois temas (mínimo de
    // elemento gráfico é 3:1); a 55% o WhatsApp claro caía para 2,42:1.
    "--ch-linha": flattenOn(ativo.light, 0.7, quadLight),
    "--ch-linha-dark": flattenOn(ativo.dark, 0.7, quadDark),
    "--ch-repouso": repouso.light,
    "--ch-repouso-dark": repouso.dark,
  } as CSSProperties;
}

export function ChannelToggle({
  value,
  onChange,
  available,
  size = "md",
  className = "",
}: ChannelToggleProps) {
  const btn = size === "sm" ? "h-7 w-7" : "h-8 w-8";
  const iconSize = size === "sm" ? 14 : 16;

  return (
    <TooltipProvider delayDuration={150}>
      <div
        className={`inline-flex items-center gap-0.5 p-0.5 rounded-md bg-muted border border-border shrink-0 ${className}`}
      >
        {CHANNELS.map((c) => {
          const temCanal = available.includes(c.id);
          const isActive = value === c.id;
          const emRepouso = temCanal && !isActive && value === "all";

          // Aqui o toggle RECORTA a thread mesclada (um cliente = uma conversa), não troca
          // de conversa: por isso clicar no canal já recortado desfaz o recorte, e não
          // existe mais a pílula "Tudo". Sem recorte (`all`) os canais presentes ficam
          // todos acesos, porque nesse estado tudo está de fato à vista.
          return (
            <Tooltip key={c.id}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  /* `aria-disabled` e nao `disabled`: navegador nao dispara evento de
                     mouse em botao desabilitado, e o tooltip que EXPLICA a ausencia do
                     canal nunca apareceria — que e justamente a informacao que os selos
                     removidos davam. O clique fica barrado no handler. */
                  aria-disabled={!temCanal}
                  onClick={() => temCanal && onChange(isActive ? "all" : c.id)}
                  aria-pressed={isActive}
                  aria-label={temCanal ? `Mostrar só ${c.label}` : `Sem ${c.label} nesta conversa`}
                  className={`${btn} rounded-sm inline-flex items-center justify-center transition-colors ${
                    isActive
                      ? "shadow-sm ring-1 ring-inset bg-[var(--ch-quad)] dark:bg-[var(--ch-quad-dark)] ring-[color:var(--ch-linha)] dark:ring-[color:var(--ch-linha-dark)] text-[color:var(--ch-ink)] dark:text-[color:var(--ch-ink-dark)]"
                      : !temCanal
                        ? "opacity-40 cursor-not-allowed text-muted-foreground"
                        : emRepouso
                          ? "text-[color:var(--ch-repouso)] dark:text-[color:var(--ch-repouso-dark)] hover:bg-background"
                          : // Com um recorte ativo os outros canais recuam: sem isso eles
                            // herdam `text-foreground` e pesam mais que o proprio ativo.
                            "text-muted-foreground hover:text-foreground hover:bg-background"
                  }`}
                  style={isActive || emRepouso ? coresDoCanal(c.color) : undefined}
                >
                  {c.id === "whatsapp" ? (
                    <WhatsAppIcon size={iconSize} />
                  ) : c.id === "sms" ? (
                    <Smartphone style={{ width: iconSize, height: iconSize }} />
                  ) : (
                    <Mail style={{ width: iconSize, height: iconSize }} />
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent>
                {!temCanal
                  ? `Sem ${c.label} nesta conversa`
                  : isActive
                    ? "Ver a conversa inteira"
                    : `Mostrar só ${c.label}`}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}

export default ChannelToggle;
