// ABOUTME: Participant color picker — shows the 12-color palette for bubble color selection.
// ABOUTME: Used in the participant management table for changing avatar colors.

"use client";

import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

const PARTICIPANT_COLORS = Array.from(
  { length: 12 },
  (_, i) => `var(--color-participant-${i})`
);

interface ColorPickerProps {
  currentColor: string;
  onSelect: (color: string) => void;
}

export function ColorPicker({ currentColor, onSelect }: ColorPickerProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="h-6 w-6 rounded-full ring-1 ring-border transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          style={{ backgroundColor: currentColor }}
          aria-label="Change color"
        />
      </PopoverTrigger>
      <PopoverContent className="w-auto p-3" align="start">
        <div className="grid grid-cols-6 gap-2">
          {PARTICIPANT_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              onClick={() => onSelect(color)}
              className={cn(
                "h-7 w-7 rounded-full transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                currentColor === color &&
                  "ring-2 ring-white ring-offset-2 ring-offset-background"
              )}
              style={{ backgroundColor: color }}
              aria-label={`Color ${color}`}
            />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
