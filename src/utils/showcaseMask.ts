// Utilities for partially masking sensitive data in the admin Showcase (demo) mode.
// Rule: always show enough to prove the data exists, but hide identifying details.

export function maskEmail(email?: string | null): string {
  if (!email) return "—";
  const [user, domain] = email.split("@");
  if (!domain) return maskGeneric(email);
  const userMasked = user.length <= 3 ? user[0] + "***" : user.slice(0, 3) + "***";
  const domainParts = domain.split(".");
  const tld = domainParts.slice(-2).join(".");
  return `${userMasked}@***.${tld}`;
}

export function maskPhone(phone?: string | null): string {
  if (!phone) return "—";
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 6) return "•••••";
  const last4 = digits.slice(-4);
  const cc = digits.startsWith("55") ? "+55 " : "";
  const ddd = digits.startsWith("55") ? digits.slice(2, 4) : digits.slice(0, 2);
  return `${cc}${ddd} 9****-${last4}`;
}

export function maskCPF(cpf?: string | null): string {
  if (!cpf) return "—";
  const digits = cpf.replace(/\D/g, "");
  if (digits.length < 6) return "***.***.***-**";
  const mid = digits.slice(3, 6);
  return `***.${mid}.***-**`;
}

export function maskFullName(name?: string | null): string {
  if (!name) return "Cliente";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "Cliente";
  const first = parts[0];
  const lastInitial = parts.length > 1 ? parts[parts.length - 1][0].toUpperCase() + "." : "";
  return [first, lastInitial].filter(Boolean).join(" ");
}

export function maskSellerName(name?: string | null, fallback = "Cliente"): string {
  if (!name) return fallback;
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return fallback;
  if (parts.length === 1) return parts[0][0].toUpperCase() + "***";
  return parts.map((p) => (p[0] || "").toUpperCase()).join("") + " ***";
}

function maskGeneric(s: string): string {
  if (s.length <= 3) return "***";
  return s.slice(0, 2) + "***";
}
