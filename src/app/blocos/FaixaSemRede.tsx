import type { ReactNode } from "react";
import { WifiOff } from "lucide-react";

/** A faixa "Sem internet" do topo das telas cujos números ficariam zerados. */
export function FaixaSemRede({ children }: { children: ReactNode }) {
  return (
    <div className="mx-4 mt-4 flex items-center gap-2.5 rounded-2xl border border-border/60 bg-card px-4 py-3">
      <WifiOff className="h-4 w-4 shrink-0 text-muted-foreground" />
      <p className="text-[13px] leading-snug text-muted-foreground">{children}</p>
    </div>
  );
}
