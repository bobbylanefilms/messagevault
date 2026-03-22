// ABOUTME: Segmented control for search mode — Keyword, Semantic, or Hybrid.
// ABOUTME: Custom pill-based toggle matching the app's dark theme.

"use client";

import { cn } from "@/lib/utils";

type SearchMode = "keyword" | "semantic" | "hybrid";

interface SearchModeToggleProps {
  value: SearchMode;
  onChange: (mode: SearchMode) => void;
}

const modes: { value: SearchMode; label: string }[] = [
  { value: "keyword", label: "Keyword" },
  { value: "semantic", label: "Semantic" },
  { value: "hybrid", label: "Hybrid" },
];

export function SearchModeToggle({ value, onChange }: SearchModeToggleProps) {
  return (
    <div className="inline-flex items-center rounded-lg bg-muted p-1">
      {modes.map((mode) => (
        <button
          key={mode.value}
          onClick={() => onChange(mode.value)}
          className={cn(
            "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
            value === mode.value
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {mode.label}
        </button>
      ))}
    </div>
  );
}
