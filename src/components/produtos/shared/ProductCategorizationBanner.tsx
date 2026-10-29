import { Tags } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SectionIcon } from "./SectionIcon";

interface ProductCategorizationBannerProps {
  uncategorizedCount: number;
  onCategorizeNow: () => void;
}

export function ProductCategorizationBanner({
  uncategorizedCount,
  onCategorizeNow,
}: ProductCategorizationBannerProps) {
  if (uncategorizedCount <= 0) return null;
  return (
    <div className="flex items-center gap-4 rounded-2xl bg-card shadow-sm p-5 transition-shadow hover:shadow-hover">
      <SectionIcon icon={Tags} color="amber" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground">
          {uncategorizedCount} produto{uncategorizedCount === 1 ? "" : "s"} sem categoria
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Selecione vários e atribua de uma vez
        </p>
      </div>
      <Button
        onClick={onCategorizeNow}
        className="rounded-xl shrink-0"
      >
        Categorizar agora →
      </Button>
    </div>
  );
}
