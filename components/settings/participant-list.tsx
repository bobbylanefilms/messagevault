// ABOUTME: Participant management list — displays all participants in a sortable table.
// ABOUTME: Supports color editing, name editing, selection for merge, and deletion.

"use client";

import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ArrowUpDown, ArrowUp, ArrowDown, Merge } from "lucide-react";
import { toast } from "sonner";
import { ParticipantRow } from "./participant-row";
import { MergeDialog } from "./merge-dialog";

type SortField = "name" | "messageCount";
type SortDirection = "asc" | "desc";

export function ParticipantList() {
  const participants = useQuery(api.participants.list);
  const updateParticipant = useMutation(api.participants.update);
  const removeParticipant = useMutation(api.participants.remove);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [mergeDialogOpen, setMergeDialogOpen] = useState(false);

  const sorted = useMemo(() => {
    if (!participants) return [];
    return [...participants].sort((a, b) => {
      if (sortField === "name") {
        const cmp = a.displayName.localeCompare(b.displayName);
        return sortDirection === "asc" ? cmp : -cmp;
      }
      // messageCount: default desc (highest first)
      const cmp = a.messageCount - b.messageCount;
      return sortDirection === "asc" ? cmp : -cmp;
    });
  }, [participants, sortField, sortDirection]);

  function handleSortToggle(field: SortField) {
    if (sortField === field) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection(field === "name" ? "asc" : "desc");
    }
  }

  function getSortIcon(field: SortField) {
    if (sortField !== field) return <ArrowUpDown className="h-3 w-3" />;
    return sortDirection === "asc" ? (
      <ArrowUp className="h-3 w-3" />
    ) : (
      <ArrowDown className="h-3 w-3" />
    );
  }

  const handleToggleSelect = useCallback((id: Id<"participants">) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleUpdate = useCallback(
    async (
      id: Id<"participants">,
      changes: { displayName?: string; avatarColor?: string }
    ) => {
      try {
        await updateParticipant({ participantId: id, ...changes });
        if (changes.displayName) {
          toast.success(`Renamed to "${changes.displayName}"`);
        }
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Failed to update participant"
        );
      }
    },
    [updateParticipant]
  );

  const handleDelete = useCallback(
    async (id: Id<"participants">) => {
      try {
        await removeParticipant({ participantId: id });
        setSelectedIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        toast.success("Participant deleted");
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Failed to delete participant"
        );
      }
    },
    [removeParticipant]
  );

  function handleMergeComplete() {
    setSelectedIds(new Set());
  }

  const selectedParticipants = useMemo(() => {
    if (!participants) return [];
    return participants.filter((p: { _id: string }) => selectedIds.has(p._id));
  }, [participants, selectedIds]);

  // Loading state
  if (participants === undefined) {
    return <ParticipantListSkeleton />;
  }

  // Empty state
  if (participants.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Participants</CardTitle>
          <CardDescription>
            No participants yet. Import a conversation to get started.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <TooltipProvider>
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <CardTitle>Participants</CardTitle>
            <Badge variant="secondary">{participants.length}</Badge>
          </div>
          <CardDescription>
            Manage participant identities, colors, and merge duplicates.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="px-3 py-2 w-10" />
                  <th className="px-3 py-2 w-10 text-left">Color</th>
                  <th className="px-3 py-2 text-left">
                    <button
                      type="button"
                      onClick={() => handleSortToggle("name")}
                      className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
                    >
                      Name {getSortIcon("name")}
                    </button>
                  </th>
                  <th className="px-3 py-2 text-left">Aliases</th>
                  <th className="px-3 py-2 text-right">Convos</th>
                  <th className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => handleSortToggle("messageCount")}
                      className="inline-flex items-center gap-1 hover:text-foreground transition-colors ml-auto"
                    >
                      Messages {getSortIcon("messageCount")}
                    </button>
                  </th>
                  <th className="px-3 py-2 w-10" />
                </tr>
              </thead>
              <tbody>
                {sorted.map((participant) => (
                  <ParticipantRow
                    key={participant._id}
                    participant={participant}
                    isSelected={selectedIds.has(participant._id)}
                    onToggleSelect={handleToggleSelect}
                    onUpdate={handleUpdate}
                    onDelete={handleDelete}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>

        {/* Sticky merge bar */}
        {selectedIds.size >= 2 && (
          <div className="sticky bottom-0 border-t border-border bg-card px-4 py-3 flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              {selectedIds.size} participants selected
            </span>
            <Button
              size="sm"
              onClick={() => setMergeDialogOpen(true)}
              className="gap-2"
            >
              <Merge className="h-4 w-4" />
              Merge selected ({selectedIds.size})
            </Button>
          </div>
        )}
      </Card>

      {mergeDialogOpen && (
        <MergeDialog
          selectedParticipants={selectedParticipants}
          open={mergeDialogOpen}
          onClose={() => setMergeDialogOpen(false)}
          onMergeComplete={handleMergeComplete}
        />
      )}
    </TooltipProvider>
  );
}

function ParticipantListSkeleton() {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-5 w-8 rounded-full" />
        </div>
        <Skeleton className="h-4 w-64" />
      </CardHeader>
      <CardContent className="space-y-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-4 w-4" />
            <Skeleton className="h-6 w-6 rounded-full" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-24 ml-auto" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
