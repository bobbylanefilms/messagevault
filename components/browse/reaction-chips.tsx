// ABOUTME: Reaction emoji chips displayed below reacted-to messages.
// ABOUTME: Groups reactions by type, shows count, hover tooltip reveals reactor names.

"use client";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip";

type ReactionType =
  | "liked"
  | "loved"
  | "laughed"
  | "disliked"
  | "emphasized"
  | "questioned";

const REACTION_EMOJI: Record<ReactionType, string> = {
  liked: "\uD83D\uDC4D",
  loved: "\u2764\uFE0F",
  laughed: "\uD83D\uDE02",
  disliked: "\uD83D\uDC4E",
  emphasized: "\u203C\uFE0F",
  questioned: "\u2753",
};

interface Reaction {
  reactionType: ReactionType;
  reactorName: string;
}

interface ReactionChipsProps {
  reactions: Reaction[];
}

export function ReactionChips({ reactions }: ReactionChipsProps) {
  if (reactions.length === 0) return null;

  // Group by reaction type
  const grouped = new Map<ReactionType, string[]>();
  for (const r of reactions) {
    const existing = grouped.get(r.reactionType) ?? [];
    existing.push(r.reactorName);
    grouped.set(r.reactionType, existing);
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex flex-wrap gap-1">
        {Array.from(grouped.entries()).map(([type, names]) => (
          <Tooltip key={type}>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="inline-flex items-center gap-0.5 rounded-full bg-muted/80 px-1.5 py-0.5 text-xs transition-colors hover:bg-muted"
              >
                <span className="text-[13px]">{REACTION_EMOJI[type]}</span>
                {names.length > 1 && (
                  <span className="text-[10px] text-muted-foreground font-medium">
                    {names.length}
                  </span>
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              {names.join(", ")}
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
    </TooltipProvider>
  );
}
