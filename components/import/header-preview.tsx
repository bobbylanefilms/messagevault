// ABOUTME: Preview panel shown after a file is scanned but before import begins.
// ABOUTME: Displays conversation metadata — title, participants, message count, file stats.

"use client";

import { FileText, Users, MessageSquare, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { ScannedHeader } from "@/lib/header-scanner";

interface HeaderPreviewProps {
  filename: string;
  header: ScannedHeader;
  onConfirm: () => void;
  onCancel: () => void;
  isLoading?: boolean;
}

export function HeaderPreview({
  filename,
  header,
  onConfirm,
  onCancel,
  isLoading = false,
}: HeaderPreviewProps) {
  const messageCount =
    header.totalMessagesReported ?? header.estimatedMessages;
  const countLabel = header.totalMessagesReported
    ? "messages reported"
    : "messages estimated";

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <FileText className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <CardTitle className="truncate text-base">{header.title}</CardTitle>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {filename}
            </p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Participants */}
        {header.participantNames.length > 0 && (
          <div className="flex items-start gap-2">
            <Users className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="flex flex-wrap gap-1.5">
              {header.participantNames.map((name) => (
                <Badge key={name} variant="secondary" className="text-xs">
                  {name}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Message count */}
        <div className="flex items-center gap-2 text-sm">
          <MessageSquare className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span>
            <span className="font-medium tabular-nums">
              {messageCount.toLocaleString()}
            </span>{" "}
            <span className="text-muted-foreground">{countLabel}</span>
          </span>
        </div>

        {/* Export date if present */}
        {header.exportedAt && (
          <div className="flex items-center gap-2 text-sm">
            <Calendar className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="text-muted-foreground">
              Exported {header.exportedAt}
            </span>
          </div>
        )}

        {/* File stats */}
        <div className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
          {header.totalLines.toLocaleString()} lines in file
        </div>
      </CardContent>

      <CardFooter className="flex justify-end gap-2 pt-2">
        <Button variant="ghost" onClick={onCancel} disabled={isLoading}>
          Cancel
        </Button>
        <Button onClick={onConfirm} disabled={isLoading}>
          {isLoading ? "Starting…" : "Continue to Identity Resolution"}
        </Button>
      </CardFooter>
    </Card>
  );
}
