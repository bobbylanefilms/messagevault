// ABOUTME: Confirmation dialog for permanently deleting a conversation and all its data.
// ABOUTME: Calls the dataManagement.deleteConversation action and shows success/error toasts.

"use client";

import { useState } from "react";
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface ConversationInfo {
  _id: Id<"conversations">;
  title: string;
  messageCount: number;
}

interface DeleteConversationDialogProps {
  conversation: ConversationInfo | null;
  open: boolean;
  onClose: () => void;
}

export function DeleteConversationDialog({
  conversation,
  open,
  onClose,
}: DeleteConversationDialogProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const deleteConversation = useAction(api.dataManagement.deleteConversation);

  async function handleDelete() {
    if (!conversation) return;
    setIsDeleting(true);
    try {
      const result = await deleteConversation({
        conversationId: conversation._id,
      });
      toast.success(
        `Deleted "${conversation.title}" (${result.deletedMessages.toLocaleString()} messages)`
      );
      onClose();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to delete conversation"
      );
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !isDeleting) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete Conversation</DialogTitle>
          <DialogDescription asChild>
            <div>
              This will permanently delete{" "}
              <span className="font-semibold text-foreground">
                &ldquo;{conversation?.title}&rdquo;
              </span>{" "}
              and all{" "}
              <span className="font-semibold text-foreground">
                {conversation?.messageCount.toLocaleString()}
              </span>{" "}
              messages, reactions, and associated data. This action cannot be
              undone.
            </div>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isDeleting}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={isDeleting}
          >
            {isDeleting ? "Deleting…" : "Delete Conversation"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
