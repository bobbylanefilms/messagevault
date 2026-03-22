// ABOUTME: Chat scope controls — filter AI context to specific conversations, people, or dates.
// ABOUTME: Opens as a collapsible panel below the session header, saves scope to chatSessions.

"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useChatStore } from "@/lib/stores/use-chat-store";

interface ChatScopePanelProps {
  sessionId: Id<"chatSessions">;
  contextScope?: {
    conversationIds?: Id<"conversations">[];
    participantIds?: Id<"participants">[];
    dateRange?: { start: number; end: number };
  };
}

export function ChatScopePanel({ sessionId, contextScope }: ChatScopePanelProps) {
  const isScopePanelOpen = useChatStore((s) => s.isScopePanelOpen);
  const conversations = useQuery(api.conversations.list);
  const participants = useQuery(api.participants.list);
  const updateSession = useMutation(api.chatSessions.update);

  const selectedConvIds = new Set(contextScope?.conversationIds?.map(String) ?? []);
  const selectedPartIds = new Set(contextScope?.participantIds?.map(String) ?? []);

  async function toggleConversation(convId: Id<"conversations">) {
    const current = contextScope?.conversationIds ?? [];
    const newIds = selectedConvIds.has(convId)
      ? current.filter((id) => id !== convId)
      : [...current, convId];
    await updateSession({
      sessionId,
      contextScope: {
        ...contextScope,
        conversationIds: newIds.length > 0 ? newIds : undefined,
      },
    });
  }

  async function toggleParticipant(partId: Id<"participants">) {
    const current = contextScope?.participantIds ?? [];
    const newIds = selectedPartIds.has(partId)
      ? current.filter((id) => id !== partId)
      : [...current, partId];
    await updateSession({
      sessionId,
      contextScope: {
        ...contextScope,
        participantIds: newIds.length > 0 ? newIds : undefined,
      },
    });
  }

  async function handleDateChange(field: "start" | "end", value: string) {
    if (!value) return;
    const timestamp = new Date(value).getTime();
    const current = contextScope?.dateRange ?? { start: 0, end: Date.now() };
    await updateSession({
      sessionId,
      contextScope: {
        ...contextScope,
        dateRange: { ...current, [field]: timestamp },
      },
    });
  }

  async function clearScope() {
    await updateSession({
      sessionId,
      contextScope: {},
    });
  }

  if (!isScopePanelOpen) return null;

  return (
    <div className="border-b border-border bg-muted/30 p-4 transition-all duration-200">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Context Scope
        </h3>
        <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={clearScope}>
          Clear all
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {/* Conversations */}
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase text-muted-foreground">
            Conversations
          </label>
          <ScrollArea className="max-h-48">
            <div className="space-y-1.5">
              {conversations?.map((conv: any) => (
                <label
                  key={conv._id}
                  className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-sm hover:bg-accent/50"
                >
                  <Checkbox
                    checked={selectedConvIds.has(conv._id)}
                    onCheckedChange={() => toggleConversation(conv._id)}
                  />
                  <span className="truncate">{conv.title}</span>
                </label>
              ))}
            </div>
          </ScrollArea>
        </div>

        {/* Participants */}
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase text-muted-foreground">
            Participants
          </label>
          <ScrollArea className="max-h-48">
            <div className="space-y-1.5">
              {participants
                ?.filter((p: any) => !p.isMe)
                .map((part: any) => (
                  <label
                    key={part._id}
                    className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-sm hover:bg-accent/50"
                  >
                    <Checkbox
                      checked={selectedPartIds.has(part._id)}
                      onCheckedChange={() => toggleParticipant(part._id)}
                    />
                    <span className="truncate">{part.displayName}</span>
                  </label>
                ))}
            </div>
          </ScrollArea>
        </div>

        {/* Date Range */}
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase text-muted-foreground">
            Date Range
          </label>
          <div className="space-y-2">
            <div>
              <label className="mb-0.5 block text-[11px] text-muted-foreground">From</label>
              <input
                type="date"
                className="w-full rounded border border-border bg-background px-2 py-1 text-sm"
                value={
                  contextScope?.dateRange?.start
                    ? new Date(contextScope.dateRange.start).toISOString().split("T")[0]
                    : ""
                }
                onChange={(e) => handleDateChange("start", e.target.value)}
              />
            </div>
            <div>
              <label className="mb-0.5 block text-[11px] text-muted-foreground">To</label>
              <input
                type="date"
                className="w-full rounded border border-border bg-background px-2 py-1 text-sm"
                value={
                  contextScope?.dateRange?.end
                    ? new Date(contextScope.dateRange.end).toISOString().split("T")[0]
                    : ""
                }
                onChange={(e) => handleDateChange("end", e.target.value)}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
