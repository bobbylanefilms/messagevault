// ABOUTME: Dialog for merging multiple participants into one canonical identity.
// ABOUTME: Lets user pick target participant, set canonical name, and confirms the destructive merge.

"use client";

import { useState, useMemo } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

interface MergeParticipant {
  _id: Id<"participants">;
  displayName: string;
  messageCount: number;
  avatarColor: string;
}

interface MergeDialogProps {
  selectedParticipants: MergeParticipant[];
  open: boolean;
  onClose: () => void;
  onMergeComplete: () => void;
}

export function MergeDialog({
  selectedParticipants,
  open,
  onClose,
  onMergeComplete,
}: MergeDialogProps) {
  const mergeParticipants = useMutation(api.participants.merge);

  // Default target: participant with highest message count
  const defaultTarget = useMemo(() => {
    if (selectedParticipants.length === 0) return undefined;
    return [...selectedParticipants].sort(
      (a, b) => b.messageCount - a.messageCount
    )[0];
  }, [selectedParticipants]);

  // Component is conditionally rendered by parent, so initial values
  // from defaultTarget are fresh on each mount.
  const [targetId, setTargetId] = useState<string>(
    defaultTarget?._id ?? ""
  );
  const [canonicalName, setCanonicalName] = useState(
    defaultTarget?.displayName ?? ""
  );
  const [isMerging, setIsMerging] = useState(false);

  async function handleMerge() {
    if (!targetId) {
      toast.error("Please select a target participant");
      return;
    }
    if (!canonicalName.trim()) {
      toast.error("Display name cannot be empty");
      return;
    }

    const sourceIds = selectedParticipants
      .filter((p) => p._id !== targetId)
      .map((p) => p._id);

    if (sourceIds.length === 0) {
      toast.error("Need at least two participants to merge");
      return;
    }

    setIsMerging(true);
    try {
      await mergeParticipants({
        sourceIds,
        targetId: targetId as Id<"participants">,
        newDisplayName: canonicalName.trim(),
      });
      toast.success(
        `Merged ${selectedParticipants.length} participants into "${canonicalName.trim()}"`
      );
      onMergeComplete();
      onClose();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to merge participants"
      );
    } finally {
      setIsMerging(false);
    }
  }

  const totalMessages = selectedParticipants.reduce(
    (sum, p) => sum + p.messageCount,
    0
  );

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Merge Participants</DialogTitle>
          <DialogDescription>
            Combine {selectedParticipants.length} participants into a single
            identity. This affects {totalMessages.toLocaleString()} total
            messages.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Participant list */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">
              Participants to merge
            </Label>
            <div className="space-y-1.5">
              {selectedParticipants.map((p) => (
                <div
                  key={p._id}
                  className="flex items-center gap-2 text-sm rounded-md px-2 py-1.5 bg-muted/40"
                >
                  <span
                    className="h-4 w-4 rounded-full shrink-0"
                    style={{ backgroundColor: p.avatarColor }}
                  />
                  <span className="font-medium truncate">
                    {p.displayName}
                  </span>
                  <span className="text-muted-foreground tabular-nums ml-auto">
                    {p.messageCount.toLocaleString()} msgs
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Target selection */}
          <div className="space-y-2">
            <Label htmlFor="merge-target">Keep record from</Label>
            <Select value={targetId} onValueChange={setTargetId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select target participant" />
              </SelectTrigger>
              <SelectContent>
                {selectedParticipants.map((p) => (
                  <SelectItem key={p._id} value={p._id}>
                    {p.displayName} ({p.messageCount.toLocaleString()} msgs)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Canonical name */}
          <div className="space-y-2">
            <Label htmlFor="canonical-name">Display name</Label>
            <Input
              id="canonical-name"
              value={canonicalName}
              onChange={(e) => setCanonicalName(e.target.value)}
              placeholder="Canonical display name"
            />
          </div>

          {/* Warning */}
          <p className="text-xs text-destructive/80">
            This action cannot be undone. All messages from the merged
            participants will be attributed to the chosen name.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isMerging}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleMerge}
            disabled={isMerging || !targetId || !canonicalName.trim()}
          >
            {isMerging ? "Merging..." : "Merge"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
