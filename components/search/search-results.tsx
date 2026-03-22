// ABOUTME: Search results list — renders result cards with stats bar.
// ABOUTME: Handles loading skeletons, empty states, and result count display.

"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { SearchResultCard } from "./search-result-card";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Sparkles } from "lucide-react";
import { useMemo } from "react";

interface ContextMessage {
  _id: string;
  senderName: string;
  content: string;
  timestamp: number;
}

interface SearchResult {
  _id: string;
  conversationId: string;
  participantId: string;
  senderName: string;
  content: string;
  timestamp: number;
  dateKey: string;
  messageType: string;
  attachmentRef?: string;
  hasReactions: boolean;
  _score: number;
  contextBefore: ContextMessage[];
  contextAfter: ContextMessage[];
}

interface SearchResultsProps {
  results: SearchResult[];
  totalCount: number;
  conversationCounts: Record<string, number>;
  searchQuery: string;
  isSearching: boolean;
  hasSearched: boolean;
}

const SUGGESTION_CHIPS = [
  "birthday",
  "vacation",
  "dinner plans",
  "funny moments",
  "holiday",
  "miss you",
];

export function SearchResults({
  results,
  totalCount,
  conversationCounts,
  searchQuery,
  isSearching,
  hasSearched,
}: SearchResultsProps) {
  const conversations = useQuery(api.conversations.list);
  const participants = useQuery(api.participants.list);

  // Build lookup maps
  const conversationMap = useMemo(() => {
    const map = new Map<string, { title: string; participantNames: string[] }>();
    for (const conv of conversations ?? []) {
      map.set(conv._id, {
        title: conv.participantNames.length > 0
          ? conv.participantNames.join(", ")
          : conv.title.replace(/^Messages with\s+/i, ""),
        participantNames: conv.participantNames,
      });
    }
    return map;
  }, [conversations]);

  const participantMap = useMemo(() => {
    const map = new Map<string, { isMe: boolean; avatarColor: string }>();
    for (const p of participants ?? []) {
      map.set(p._id, { isMe: p.isMe, avatarColor: p.avatarColor });
    }
    return map;
  }, [participants]);

  const conversationCount = Object.keys(conversationCounts).length;

  // --- Loading state ---
  if (isSearching) {
    return (
      <div className="space-y-3 p-6">
        <Skeleton className="h-4 w-64" />
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-32 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  // --- Initial empty state (no search yet) ---
  if (!hasSearched) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="max-w-md text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-muted/50">
            <Search className="h-7 w-7 text-muted-foreground/70" />
          </div>
          <h2 className="mt-5 text-xl font-semibold tracking-tight">
            Search your messages
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Find any message across all your conversations with keywords, semantic understanding, or both.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {SUGGESTION_CHIPS.map((chip) => (
              <span
                key={chip}
                className="rounded-full border border-border bg-muted/50 px-3 py-1 text-xs text-muted-foreground"
              >
                {chip}
              </span>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // --- No results state ---
  if (results.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="max-w-md text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-muted/50">
            <Sparkles className="h-7 w-7 text-muted-foreground/70" />
          </div>
          <h2 className="mt-5 text-xl font-semibold tracking-tight">
            No results found
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Try different keywords, broaden your filters, or switch to Hybrid mode for semantic matching.
          </p>
        </div>
      </div>
    );
  }

  // --- Results ---
  return (
    <div className="flex flex-col">
      {/* Stats bar */}
      <div className="border-b border-border px-6 py-2.5">
        <p className="text-sm text-muted-foreground">
          Found <span className="font-medium text-foreground">{totalCount}</span>{" "}
          result{totalCount !== 1 ? "s" : ""} in{" "}
          <span className="font-medium text-foreground">{conversationCount}</span>{" "}
          conversation{conversationCount !== 1 ? "s" : ""}
        </p>
      </div>

      {/* Result cards */}
      <div className="space-y-3 p-6">
        {results.map((result) => {
          const conv = conversationMap.get(result.conversationId);
          const participant = participantMap.get(result.participantId);

          return (
            <SearchResultCard
              key={result._id}
              messageId={result._id}
              conversationId={result.conversationId}
              conversationTitle={conv?.title ?? "Unknown conversation"}
              senderName={result.senderName}
              content={result.content}
              timestamp={result.timestamp}
              dateKey={result.dateKey}
              isMe={participant?.isMe ?? false}
              avatarColor={participant?.avatarColor ?? "var(--color-bubble-other)"}
              searchQuery={searchQuery}
              contextBefore={result.contextBefore}
              contextAfter={result.contextAfter}
            />
          );
        })}
      </div>
    </div>
  );
}
