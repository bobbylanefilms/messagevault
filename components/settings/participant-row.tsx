// ABOUTME: Table row component for a single participant in the management list.
// ABOUTME: Supports inline name editing, color picking, selection for merge, and deletion.

"use client";

import { useState, useRef, useEffect } from "react";
import type { Id } from "@/convex/_generated/dataModel";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Trash2 } from "lucide-react";
import { ColorPicker } from "./color-picker";

interface ParticipantData {
  _id: Id<"participants">;
  displayName: string;
  aliases: string[];
  isMe: boolean;
  avatarColor: string;
  conversationCount: number;
  messageCount: number;
}

interface ParticipantRowProps {
  participant: ParticipantData;
  isSelected: boolean;
  onToggleSelect: (id: Id<"participants">) => void;
  onUpdate: (
    id: Id<"participants">,
    changes: { displayName?: string; avatarColor?: string }
  ) => void;
  onDelete: (id: Id<"participants">) => void;
}

export function ParticipantRow({
  participant,
  isSelected,
  onToggleSelect,
  onUpdate,
  onDelete,
}: ParticipantRowProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(participant.displayName);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  function handleStartEdit() {
    setEditName(participant.displayName);
    setIsEditing(true);
  }

  function handleSave() {
    const trimmed = editName.trim();
    if (trimmed && trimmed !== participant.displayName) {
      onUpdate(participant._id, { displayName: trimmed });
    }
    setIsEditing(false);
  }

  function handleCancel() {
    setEditName(participant.displayName);
    setIsEditing(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSave();
    } else if (e.key === "Escape") {
      e.preventDefault();
      handleCancel();
    }
  }

  const hasMessages = participant.messageCount > 0;

  return (
    <tr className="border-b border-border transition-colors hover:bg-muted/30">
      {/* Checkbox */}
      <td className="px-3 py-2.5">
        <Checkbox
          checked={isSelected}
          onCheckedChange={() => onToggleSelect(participant._id)}
          aria-label={`Select ${participant.displayName}`}
        />
      </td>

      {/* Color */}
      <td className="px-3 py-2.5">
        <ColorPicker
          currentColor={participant.avatarColor}
          onSelect={(color) =>
            onUpdate(participant._id, { avatarColor: color })
          }
        />
      </td>

      {/* Name */}
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-2">
          {isEditing ? (
            <Input
              ref={inputRef}
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onBlur={handleSave}
              onKeyDown={handleKeyDown}
              className="h-7 w-48 text-sm"
            />
          ) : (
            <button
              type="button"
              onClick={handleStartEdit}
              className="text-sm font-medium text-left hover:underline"
            >
              {participant.displayName}
            </button>
          )}
          {participant.isMe && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
              Me
            </Badge>
          )}
        </div>
      </td>

      {/* Aliases */}
      <td className="px-3 py-2.5">
        {participant.aliases.length > 0 ? (
          <span className="text-xs text-muted-foreground">
            {participant.aliases.join(", ")}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground/50">&mdash;</span>
        )}
      </td>

      {/* Conversations */}
      <td className="px-3 py-2.5 text-right tabular-nums text-sm text-muted-foreground">
        {participant.conversationCount}
      </td>

      {/* Messages */}
      <td className="px-3 py-2.5 text-right tabular-nums text-sm text-muted-foreground">
        {participant.messageCount.toLocaleString()}
      </td>

      {/* Actions */}
      <td className="px-3 py-2.5">
        {hasMessages ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                disabled
                className="p-1 rounded text-muted-foreground/30 cursor-not-allowed"
                aria-label="Cannot delete — participant has messages"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent>
              Cannot delete — participant has messages. Use merge instead.
            </TooltipContent>
          </Tooltip>
        ) : (
          <button
            type="button"
            onClick={() => onDelete(participant._id)}
            className="p-1 rounded text-muted-foreground hover:text-destructive transition-colors"
            aria-label={`Delete ${participant.displayName}`}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </td>
    </tr>
  );
}
