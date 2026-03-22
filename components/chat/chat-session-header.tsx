// ABOUTME: Chat session header — model selector, thinking toggle, and scope settings.
// ABOUTME: Sits at top of the active chat pane, updates session settings via mutations.

"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Brain, Settings2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useChatStore } from "@/lib/stores/use-chat-store";

interface ChatSessionHeaderProps {
  sessionId: Id<"chatSessions">;
  title?: string;
  model: string;
  thinkingEnabled: boolean;
}

const MODEL_OPTIONS = [
  { value: "claude-opus-4-6", label: "Claude Opus 4.6" },
  { value: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
  { value: "claude-haiku-4-5", label: "Claude Haiku 4.5" },
];

export function ChatSessionHeader({
  sessionId,
  title,
  model,
  thinkingEnabled,
}: ChatSessionHeaderProps) {
  const updateSession = useMutation(api.chatSessions.update);
  const toggleScopePanel = useChatStore((s) => s.toggleScopePanel);
  const isScopePanelOpen = useChatStore((s) => s.isScopePanelOpen);

  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState(title ?? "");

  async function handleModelChange(newModel: string) {
    await updateSession({ sessionId, model: newModel });
  }

  async function handleThinkingToggle() {
    await updateSession({ sessionId, thinkingEnabled: !thinkingEnabled });
  }

  async function handleTitleSave() {
    if (editTitle.trim()) {
      await updateSession({ sessionId, title: editTitle.trim() });
    }
    setIsEditingTitle(false);
  }

  return (
    <TooltipProvider delayDuration={0}>
      <div className="flex h-14 items-center justify-between border-b border-border bg-background px-4">
        {/* Title */}
        <div className="min-w-0 flex-1">
          {isEditingTitle ? (
            <input
              autoFocus
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              onBlur={handleTitleSave}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleTitleSave();
                if (e.key === "Escape") setIsEditingTitle(false);
              }}
              className="w-full bg-transparent text-sm font-medium outline-none ring-1 ring-border rounded px-2 py-1"
            />
          ) : (
            <button
              onClick={() => {
                setEditTitle(title ?? "");
                setIsEditingTitle(true);
              }}
              className="truncate text-sm font-medium hover:text-primary transition-colors"
            >
              {title ?? "New chat"}
            </button>
          )}
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2">
          {/* Model selector */}
          <Select value={model} onValueChange={handleModelChange}>
            <SelectTrigger className="h-8 w-44 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MODEL_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value} className="text-xs">
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Thinking toggle */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={handleThinkingToggle}
              >
                <Brain
                  className={cn(
                    "h-4 w-4 transition-colors",
                    thinkingEnabled ? "text-primary" : "text-muted-foreground"
                  )}
                />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {thinkingEnabled ? "Thinking enabled" : "Thinking disabled"}
            </TooltipContent>
          </Tooltip>

          {/* Scope panel toggle */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={toggleScopePanel}
              >
                <Settings2
                  className={cn(
                    "h-4 w-4 transition-colors",
                    isScopePanelOpen ? "text-primary" : "text-muted-foreground"
                  )}
                />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Context scope</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </TooltipProvider>
  );
}
