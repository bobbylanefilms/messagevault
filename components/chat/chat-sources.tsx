// ABOUTME: Expandable source attribution section for AI chat responses.
// ABOUTME: Shows which archived messages were used as context, grouped by conversation and date.

"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { ChevronRight, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { SourceMessage } from "@/components/chat/source-message";

interface ChatSourcesProps {
  retrievedMessageIds: string[];
  retrievalStrategy: string;
}

const STRATEGY_LABELS: Record<string, string> = {
  date_load: "date",
  vector: "semantic",
  hybrid: "hybrid",
};

const INITIAL_SHOW_COUNT = 10;

export function ChatSources({
  retrievedMessageIds,
  retrievalStrategy,
}: ChatSourcesProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showAll, setShowAll] = useState(false);

  // Only load source messages when expanded (conditional query)
  const sourceMessages = useQuery(
    api.messages.getByIds,
    isExpanded
      ? { messageIds: retrievedMessageIds as Id<"messages">[] }
      : "skip"
  );

  const conversations = useQuery(api.conversations.list);
  const participants = useQuery(api.participants.list);

  if (retrievedMessageIds.length === 0) return null;

  // Build lookup maps
  const convMap = new Map(conversations?.map((c: any) => [c._id as string, c]) ?? []);
  const partMap = new Map(participants?.map((p: any) => [p._id as string, p]) ?? []);

  // Group source messages by conversation → date
  function groupMessages() {
    if (!sourceMessages) return new Map<string, Map<string, any[]>>();

    const grouped = new Map<string, Map<string, any[]>>();

    for (const msg of sourceMessages) {
      if (!msg) continue;
      const convId = msg.conversationId as string;
      if (!grouped.has(convId)) {
        grouped.set(convId, new Map());
      }
      const convGroup = grouped.get(convId)!;
      const dateKey = msg.dateKey;
      if (!convGroup.has(dateKey)) {
        convGroup.set(dateKey, []);
      }
      convGroup.get(dateKey)!.push(msg);
    }

    return grouped;
  }

  const grouped = isExpanded ? groupMessages() : new Map();
  const totalAvailable = sourceMessages?.filter(Boolean).length ?? retrievedMessageIds.length;

  return (
    <div className="mt-2 ml-1">
      {/* Collapsed bar */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted/30"
      >
        {isExpanded ? (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground transition-transform" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground transition-transform" />
        )}
        <span className="text-[12px] font-medium text-muted-foreground">Sources</span>
        <Badge variant="secondary" className="h-5 px-2 text-[11px]">
          {retrievedMessageIds.length} messages
        </Badge>
        <span className="ml-auto text-[10px] text-muted-foreground/60">
          {STRATEGY_LABELS[retrievalStrategy] ?? retrievalStrategy}
        </span>
      </button>

      {/* Expanded area */}
      {isExpanded && (
        <div className="mt-2 max-h-80 space-y-3 overflow-y-auto border-l border-border/50 pl-2 transition-all duration-200">
          {sourceMessages === undefined ? (
            <div className="space-y-2 py-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-12 animate-pulse rounded-lg bg-muted/30" />
              ))}
            </div>
          ) : (
            <>
              {Array.from(grouped.entries()).map(([convId, dateGroups]: [string, Map<string, any[]>]) => {
                const conv: any = convMap.get(convId);
                let messageCount = 0;

                return (
                  <div key={convId}>
                    <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {conv?.title ?? "Unknown conversation"}
                    </h4>
                    {Array.from(dateGroups.entries()).map(([dateKey, msgs]: [string, any[]]) => {
                      const dateStr = new Date(dateKey + "T12:00:00").toLocaleDateString(
                        "en-US",
                        { month: "short", day: "numeric", year: "numeric" }
                      );

                      return (
                        <div key={dateKey} className="mb-2">
                          <p className="mb-1 text-[10px] text-muted-foreground/70">
                            {dateStr}
                          </p>
                          <div className="space-y-1">
                            {msgs.map((msg: any) => {
                              messageCount++;
                              if (!showAll && messageCount > INITIAL_SHOW_COUNT) return null;

                              const participant: any = partMap.get(msg.participantId as string);
                              return (
                                <SourceMessage
                                  key={msg._id}
                                  messageId={msg._id}
                                  conversationId={msg.conversationId}
                                  senderName={msg.senderName}
                                  content={msg.content}
                                  timestamp={msg.timestamp}
                                  avatarColor={participant?.avatarColor ?? "var(--color-muted-foreground)"}
                                />
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}

              {/* Show more button */}
              {!showAll && totalAvailable > INITIAL_SHOW_COUNT && (
                <button
                  onClick={() => setShowAll(true)}
                  className="w-full rounded-lg py-2 text-center text-[12px] text-muted-foreground hover:bg-muted/30 transition-colors"
                >
                  Show {totalAvailable - INITIAL_SHOW_COUNT} more sources
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
