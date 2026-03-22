// ABOUTME: Chat session list — left panel showing all AI chat sessions sorted by recency.
// ABOUTME: Each item shows title, model badge, timestamp. Supports create, select, delete.

"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { formatDistanceToNow } from "date-fns";
import { Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const MODEL_BADGES: Record<string, { label: string; className: string }> = {
  "claude-opus-4-6": { label: "Opus", className: "text-amber-400 border-amber-400/30" },
  "claude-sonnet-4-6": { label: "Sonnet", className: "text-blue-400 border-blue-400/30" },
  "claude-haiku-4-5": { label: "Haiku", className: "text-emerald-400 border-emerald-400/30" },
};

export function ChatSessionList() {
  const router = useRouter();
  const pathname = usePathname();
  const sessions = useQuery(api.chatSessions.list);
  const createSession = useMutation(api.chatSessions.create);
  const removeSession = useMutation(api.chatSessions.remove);

  const [deleteTarget, setDeleteTarget] = useState<Id<"chatSessions"> | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  // Extract active session ID from pathname
  const activeSessionId = pathname.startsWith("/chat/")
    ? pathname.replace("/chat/", "")
    : null;

  async function handleCreate() {
    setIsCreating(true);
    try {
      const sessionId = await createSession({});
      router.push(`/chat/${sessionId}`);
    } finally {
      setIsCreating(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    const wasActive = activeSessionId === deleteTarget;
    await removeSession({ sessionId: deleteTarget });
    setDeleteTarget(null);
    if (wasActive) {
      router.push("/chat");
    }
  }

  return (
    <div className="flex h-full w-72 flex-col border-r border-border bg-card">
      {/* New chat button */}
      <div className="p-3">
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-start gap-2"
          onClick={handleCreate}
          disabled={isCreating}
        >
          <Plus className="h-4 w-4" />
          New chat
        </Button>
      </div>

      {/* Session list */}
      <ScrollArea className="flex-1">
        <div className="px-2 pb-3">
          {sessions === undefined ? (
            <div className="space-y-2 px-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 animate-pulse rounded-lg bg-muted/30" />
              ))}
            </div>
          ) : sessions.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              No conversations yet
            </p>
          ) : (
            <div className="space-y-1">
              {sessions.map((session: any) => {
                const isActive = activeSessionId === session._id;
                const badge = MODEL_BADGES[session.model];
                return (
                  <div
                    key={session._id}
                    className={cn(
                      "group relative cursor-pointer rounded-lg px-3 py-2.5 transition-colors",
                      isActive
                        ? "border-l-2 border-primary bg-accent"
                        : "hover:bg-accent/50"
                    )}
                    onClick={() => router.push(`/chat/${session._id}`)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="truncate text-sm font-medium">
                        {session.title ?? "New chat"}
                      </span>
                      <button
                        className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteTarget(session._id);
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                      </button>
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      {badge && (
                        <Badge
                          variant="outline"
                          className={cn("h-5 px-1.5 text-[10px]", badge.className)}
                        >
                          {badge.label}
                        </Badge>
                      )}
                      <span className="text-[11px] text-muted-foreground">
                        {formatDistanceToNow(session.lastActivityAt, { addSuffix: true })}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Delete confirmation dialog */}
      <Dialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete chat?</DialogTitle>
            <DialogDescription>
              This will permanently delete this chat session and all its messages.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
