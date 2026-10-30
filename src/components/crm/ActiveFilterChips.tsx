import { X } from "lucide-react";

import { Button } from "@/components/ui/button";

export interface ActiveChip {
  key: string;
  label: string;
  onRemove: () => void;
}

interface ActiveFilterChipsProps {
  chips: ActiveChip[];
  onClearAll: () => void;
}

export function ActiveFilterChips({ chips, onClearAll }: ActiveFilterChipsProps) {
  if (chips.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 px-4 pt-2">
      {chips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          onClick={chip.onRemove}
          className="inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted/70"
        >
          {chip.label}
          <X className="h-3 w-3" />
        </button>
      ))}
      <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onClearAll}>
        Limpar todos
      </Button>
    </div>
  );
}
