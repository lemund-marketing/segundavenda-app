// Humanize technical template names (e.g. "confirmacao_pedido_ifood" → "Confirmacao Pedido iFood")
const SIGLAS_PRESERVADAS = ["iFood", "WhatsApp", "SMS", "CRM", "SES", "API", "OTP"];

export function humanizeTemplateName(name: string | null | undefined): string {
  if (!name) return "";
  const parts = name.split(/[_\-]/);
  return parts
    .map((part) => {
      if (!part) return part;
      const sigla = SIGLAS_PRESERVADAS.find((s) => s.toLowerCase() === part.toLowerCase());
      if (sigla) return sigla;
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join(" ");
}

export function resolveTemplateTitle(opts: {
  displayName?: string | null;
  name?: string | null;
}): string {
  const dn = opts.displayName?.trim();
  if (dn) return dn;
  return humanizeTemplateName(opts.name ?? "");
}
