// ABOUTME: Conversation list with per-row delete action for the data management settings panel.
// ABOUTME: Renders enriched conversation data from Convex with a delete confirmation dialog.

"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { formatDateRange } from "@/lib/date-utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Trash2 } from "lucide-react";
import { DeleteConversationDialog } from "./delete-conversation-dialog";

interface DeletingConversation {
  _id: Id<"conversations">;
  title: string;
  messageCount: number;
}

export function ConversationManager() {
  const conversations = useQuery(api.conversations.list);
  const [deletingConversation, setDeletingConversation] =
    useState<DeletingConversation | null>(null);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Conversations</CardTitle>
        </CardHeader>
        <CardContent>
          {conversations === undefined ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : conversations.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No conversations yet. Import a conversation to get started.
            </p>
          ) : (
            <div className="divide-y divide-border">
              {conversations.map((conv) => (
                <div
                  key={conv._id}
                  className="flex items-center gap-4 py-3 first:pt-0 last:pb-0"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{conv.title}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {conv.participantNames.length > 0
                        ? conv.participantNames.join(", ")
                        : "No participants"}{" "}
                      &middot;{" "}
                      {formatDateRange(
                        conv.dateRange.start,
                        conv.dateRange.end
                      )}
                    </p>
                  </div>
                  <Badge variant="secondary" className="shrink-0 tabular-nums">
                    {conv.messageCount.toLocaleString()} msgs
                  </Badge>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={() =>
                      setDeletingConversation({
                        _id: conv._id,
                        title: conv.title,
                        messageCount: conv.messageCount,
                      })
                    }
                    aria-label={`Delete "${conv.title}"`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <DeleteConversationDialog
        conversation={deletingConversation}
        open={deletingConversation !== null}
        onClose={() => setDeletingConversation(null)}
      />
    </>
  );
}
